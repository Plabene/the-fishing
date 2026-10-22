"""Export only PC tier IDs/order; resolve identity through the public ship catalog."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / 'mobile_pwa/src/data'
catalog = json.loads((root / 'sunsang24Fleet.json').read_text(encoding='utf-8'))['boats']
aliases = {f"sunsang24:ship:{b['shipId']}": b['uid'] for b in catalog}
aliases.update({b['uid']: b['uid'] for b in catalog})
prefs = json.loads((args.source / 'state/sunsang24/monthly_calendar_preferences.json').read_text(encoding='utf-8-sig'))
tiers = {key: [] for key in ('tier1', 'tier2', 'tier3', 'other')}
seen = set()

def append(tier, raw):
    if not isinstance(raw, str) or raw not in aliases:
        raise ValueError(f'Unresolved tier vessel ID: {raw!r}; no output written')
    uid = aliases[raw]
    if uid not in seen:
        tiers[tier].append(uid)
        seen.add(uid)

for tier in tiers:
    for raw in prefs.get('boat_tiers', {}).get(tier, []):
        append(tier, raw)
for raw in prefs.get('selected_boat_uids', []):
    append('other', raw)
# Matches BoatTierState.flattened() in the PC program.
payload = {'tiers': tiers, 'selectedUids': [uid for ids in tiers.values() for uid in ids]}
version = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
(root / 'sunsang24Tiers.json').write_text(json.dumps({'version': version, **payload}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'counts': {key: len(ids) for key, ids in tiers.items()}, 'version': version}))
