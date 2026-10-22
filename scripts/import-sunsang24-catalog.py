"""Import allowlisted public vessel metadata; never copy PC state or observations."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
public = json.loads((args.source / 'data/sunsang24/web_vessel_catalog.json').read_text(encoding='utf-8-sig'))
entries = json.loads((args.source / 'state/sunsang24/boat_catalog.json').read_text(encoding='utf-8-sig'))['entries']
old = json.loads((root / 'mobile_pwa/src/data/defaultFleet.json').read_text(encoding='utf-8-sig'))['state']['boats']
by_ship = {str(b['ship_id']): b for b in entries.values() if b.get('site_id') == 'sunsang24'}
ships = []
seen = set()
for b in public:
    ship_id = str(b['vessel_id'])
    if not ship_id.isdecimal() or ship_id in seen:
        raise ValueError('Missing/duplicate public ship ID')
    seen.add(ship_id)
    evidence = by_ship.get(ship_id, {})
    route = b.get('schedule_url', '')
    if route:
        url = urlsplit(route)
        if (url.scheme != 'https' or not (url.hostname or '').endswith('.sunsang24.com')
                or url.port or url.username or url.password or url.query or url.fragment
                or not re.fullmatch(r'/ship/schedule_fleet(?:/\d+)?', url.path)):
            raise ValueError('Unexpected public schedule link')
    # These four exact legacy entries already represent Sunsang24 listings.
    aliases = [x['uid'] for x in old if route and x['url'] == route and x['name'] == b['vessel_name'] and x['port'] == b['departure_port']]
    if len(aliases) > 1:
        raise ValueError('Ambiguous legacy identity')
    province = evidence.get('province_label') or b['province']
    local = evidence.get('local_area_label') or b['local_area']
    departure_area = b['departure_port']
    ships.append({
        'shipId': ship_id, 'uid': aliases[0] if aliases else f'sunsang24:ship:{ship_id}',
        'name': b['vessel_name'], 'port': '' if departure_area.endswith('인근') else departure_area,
        'departureArea': departure_area, 'province': province, 'local': local,
        'provinceId': str(evidence.get('province_value') or ''),
        'areaId': str(evidence.get('local_area_value') or ''),
        'sea': {'west': '서해권', 'south': '남해권', 'east': '동해권'}.get(b['region'], b['region']),
        'url': route or f'https://www.sunsang24.com/ship/list?ship_no={ship_id}',
        'observedAt': b['source_updated_at'],
    })
ships.sort(key=lambda b: int(b['shipId']))
version = hashlib.sha256(json.dumps(ships, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
output = {'version': version, 'source': 'public PC vessel catalog; no live seat data', 'boats': ships}
(root / 'mobile_pwa/src/data/sunsang24Fleet.json').write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'boats': len(ships), 'new': sum(x['uid'].startswith('sunsang24:') for x in ships),
                  'exactAreaKnown': sum(bool(x['areaId']) for x in ships), 'exactPortKnown': sum(bool(x['port']) for x in ships),
                  'version': version}))
