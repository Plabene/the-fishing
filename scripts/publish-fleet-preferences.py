"""Extract only fleet configuration from a full backup; never publish observations or failures."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TIERS = ('tier1', 'tier2', 'tier3', 'other')

def extract(path):
    source = json.loads(path.read_text(encoding='utf-8-sig'))
    base = json.loads((ROOT / 'mobile_pwa/src/data/defaultFleet.json').read_text(encoding='utf-8'))
    sun = json.loads((ROOT / 'mobile_pwa/src/data/sunsang24Fleet.json').read_text(encoding='utf-8'))
    known = {b['uid']: b for b in base['state']['boats']}
    for b in sun['boats']:
        known.setdefault(b['uid'], dict(uid=b['uid'], name=b['name'], port=b['port'], url=b['url'], region={k: b[k] for k in ('sea', 'province', 'local')}))
    boats = source['boats']
    ids = [b['uid'] for b in boats]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate boat IDs')
    # A new/edited boat requires explicit review, not a guessed name match or silent dropped property.
    for boat in boats:
        if known.get(boat['uid']) != boat:
            raise ValueError(f"Boat attributes differ or ID is unknown: {boat['uid']}")
    tiers = source['tiers']
    if set(tiers) != set(TIERS):
        raise ValueError('Unknown tier fields')
    assigned = [uid for t in TIERS for uid in tiers[t]]
    selected = source['selectedUids']
    for values in (assigned, selected):
        if len(values) != len(set(values)) or set(values) - set(ids):
            raise ValueError('Duplicate or unknown classification ID')
    payload = dict(boatUids=ids, tiers={t: tiers[t] for t in TIERS}, selectedUids=selected)
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    return dict(version=digest, **payload)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, type=Path)
    args = parser.parse_args()
    data = extract(args.input)
    target = ROOT / 'mobile_pwa/src/data/publishedPreferences.json'
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(version=data['version'], boats=len(data['boatUids']), tiers={t: len(v) for t, v in data['tiers'].items()}, selected=len(data['selectedUids'])), ensure_ascii=False))
