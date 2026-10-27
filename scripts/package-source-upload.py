"""Build a deterministic, scanned source handoff; never edit the working sources."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {'.gitignore', '.node-version', 'README.md', 'mobile.cmd'}
APP_FILES = {'index.html', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json',
             'vite.config.ts', 'playwright.accessibility.config.ts', 'wrangler.jsonc', 'README.md', 'README_MOBILE_A_KO.md'}
APP_DIRS = {'src', 'public', 'tests', 'scripts', 'availability_api'}
EXCLUDED = {'.git', '.venv', 'node_modules', '__pycache__', '.wrangler', '.worker-build',
            '.local', 'release', 'dist', '.cache', '.pnpm-store', 'test-results', 'playwright-report'}
TEXT_SUFFIXES = {'.ts', '.js', '.mjs', '.mts', '.json', '.jsonc', '.webmanifest', '.css',
                 '.html', '.svg', '.md', '.txt', '.yml', '.yaml', '.cmd', '.py'}
EMAIL = re.compile(r'(?<![\w:])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
PHONE = re.compile(r'(?<![\d\w])(?:\+82[- .]?)?0(?:10|11|16|17|18|19|2|[3-6][1-5]|70)[- .]?\d{3,4}[- .]?\d{4}(?!\d)')
RESIDENT = re.compile(r'(?<!\d)\d{6}-[1-4]\d{6}(?!\d)')
USER_PATH = re.compile(r'[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s]+')
SECRET = re.compile(r'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|sk-[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})')
SECRET_ASSIGNMENT = re.compile(r'''(?i)(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[=:]\s*["']([^"'\s]{12,})["']''')
# Deliberate privacy/security test inputs, not live contacts or credentials.
SYNTHETIC = {'mobile_pwa/tests/mvp.test.ts': {'010-1234-5678', 'a@example.test'},
             'mobile_pwa/tests/catalog.test.js': {'010-1234-5678'},
             'mobile_pwa/tests/offline.test.ts': {'should-not-export'},
             'scripts/package-source-upload.py': {'010-1234-5678', 'a@example.test'}}

def text_for_scan(name: str, text: str) -> str:
    for value in SYNTHETIC.get(name, set()):
        text = text.replace(value, '[TEST]')
    # User-info in deliberately invalid URL cases is not an email address.
    if name.startswith('mobile_pwa/tests/'):
        text = re.sub(r'https://(?:u:p|user:pass)@', 'https://test-user-info/', text)
    return text

def scan(name: str, data: bytes) -> dict[str, int]:
    try:
        text = text_for_scan(name, data.decode('utf-8'))
    except UnicodeDecodeError:
        if not name.startswith('mobile_pwa/public/icons/') or not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError(f'Unapproved binary file: {name}')
        if any(marker in data for marker in (b'eXIf', b'iTXt', b'tEXt', b'zTXt')):
            raise ValueError(f'Image metadata requires review: {name}')
        return {'secret_hits': 0, 'pii_hits': 0}
    return {'secret_hits': len(SECRET.findall(text)) + len(SECRET_ASSIGNMENT.findall(text)),
            'pii_hits': sum(len(pattern.findall(text)) for pattern in (EMAIL, PHONE, RESIDENT, USER_PATH))}

def allowed(name: str) -> bool:
    path = Path(name)
    if any(part in EXCLUDED for part in path.parts) or '\\' in name:
        return False
    if path.name.startswith('.env') and path.name != '.env.example':
        return False
    if path.suffix.lower() in {'.zip', '.log', '.sqlite', '.db', '.pem', '.key'} or path.name == '.dev.vars':
        return False
    if name in ROOT_FILES or name == '.github/workflows/deploy.yml':
        return True
    if name.startswith('scripts/') and path.suffix == '.py':
        return True
    if len(path.parts) >= 2 and path.parts[0] == 'mobile_pwa':
        return (len(path.parts) == 2 and path.name in APP_FILES) or (path.parts[1] in APP_DIRS and
               (path.suffix.lower() in TEXT_SUFFIXES or name.startswith('mobile_pwa/public/icons/')))
    return False

def write_upload(report: Path) -> dict:
    names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT).decode('utf-8').split('\0')
    entries: dict[str, bytes] = {}
    sanitized: list[str] = []
    for name in sorted(set(filter(allowed, filter(None, names)))):
        path = ROOT / name
        if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
            raise ValueError(f'Unexpected source path: {name}')
        data = path.read_bytes()
        if path.suffix.lower() == '.md':
            text = data.decode('utf-8')
            for pattern in (EMAIL, PHONE, RESIDENT, USER_PATH):
                text = pattern.sub('[REDACTED_CONTACT]', text)
            changed = text.encode('utf-8')
            if changed != data:
                sanitized.append(name)
            data = changed
        entries[name] = data
    entries['UPLOAD_REPORT.txt'] = report.read_bytes()
    totals = {'secret_hits': 0, 'pii_hits': 0}
    for name, data in entries.items():
        counts = scan(name, data)
        if any(counts.values()):
            # Do not echo any matched secret or personal data.
            raise ValueError(f'Upload scan blocked {name}: {counts}')
        for key in totals:
            totals[key] += counts[key]
    manifest = {'files': [{'path': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
                          for name, data in sorted(entries.items())], 'sanitized_files': sanitized,
                'scan': totals, 'scan_scope': 'known credential formats and literal assignments; email, Korean phone, resident ID, local user paths; synthetic test inputs explicitly allowlisted; no guarantee of detecting every possible identifier'}
    entries['UPLOAD_MANIFEST.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if any(scan('UPLOAD_MANIFEST.json', entries['UPLOAD_MANIFEST.json']).values()):
        raise ValueError('Generated manifest failed scan')
    output = ROOT / 'release'
    output.mkdir(exist_ok=True)
    archive = output / 'GPT_UPLOAD_SOURCE.zip'
    temporary = output / 'GPT_UPLOAD_SOURCE.zip.tmp'
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for name, data in sorted(entries.items()):
                info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, data, compresslevel=9)
        with zipfile.ZipFile(temporary) as z:
            if z.testzip() is not None or z.namelist() != sorted(entries):
                raise ValueError('Archive contents/CRC validation failed')
            for name in z.namelist():
                if '\\' in name or name.startswith('/') or '..' in Path(name).parts or name.startswith('release/'):
                    raise ValueError('Unsafe archive path')
                if any(scan(name, z.read(name)).values()):
                    raise ValueError(f'Archive scan blocked {name}')
        temporary.replace(archive)
    finally:
        temporary.unlink(missing_ok=True)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / 'GPT_UPLOAD_SOURCE.sha256').write_text(f'{digest}  GPT_UPLOAD_SOURCE.zip\n', encoding='utf-8')
    (output / 'GPT_UPLOAD_REPORT.txt').write_bytes(entries['UPLOAD_REPORT.txt'])
    result = {'sha256': digest, 'files': len(entries), 'bytes': archive.stat().st_size, **totals,
              'zip_backslash_paths': 0, 'sanitized_files': sanitized, 'scan_scope': manifest['scan_scope']}
    (output / 'GPT_UPLOAD_VERIFICATION.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, required=True, help='Sanitized UTF-8 handoff report')
    args = parser.parse_args()
    print(json.dumps(write_upload(args.report), ensure_ascii=False))
