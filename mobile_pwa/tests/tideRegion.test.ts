import {expect,test,vi} from 'vitest';
import {emptyState,type Boat} from '../src/models';
import {emptyRegion} from '../src/regions';
import {representativeTide,regionalTideMonth} from '../src/tideRegion';
import {mergeTideDays,calculateTideMonth,tideDates,type TideDay} from '../src/tides';
import {TideAutoLoad} from '../src/tideAutoLoad';
import {TIDE_STATIONS,type TideStationCode} from '../src/tideStations';
import archive from '../src/data/tideArchive.json';
const boat=(uid:string,sea:string,province:string,local:string):Boat=>({uid,name:uid,port:local,url:'',region:{sea,province,local}});
function state() {const s=emptyState();s.month='2026-12';s.boats=[boat('1','남해권','전라남도','여수'),boat('2','남해권','전라남도','여수'),boat('3','서해권','전북','군산'),boat('4','서해권','충남','보령')];s.tiers.tier1=['1','2','3','4'];return s;}
const day=(station:TideStationCode,date='2026-12-15'):TideDay=>({stationCode:station,date,fetchedAt:new Date().toISOString(),extrema:[{timestamp:date+'T01:00:00+09:00',kind:'low',levelCm:10},{timestamp:date+'T07:00:00+09:00',kind:'high',levelCm:200}]});
test('representative follows actual tier query membership, never catalog size, seats or response count',()=>{
 const s=state();s.boats.push(...Array.from({length:10},(_,i)=>boat(`extra${i}`,'동해권','강원','동해')));
 s.tiers.tier1=['1','2','3'];expect(representativeTide(s)).toMatchObject({stationCode:'DT_0016',boatCount:2,totalBoats:3});
 s.tiers.tier2=['4'];s.selectedTiers=['tier2'];expect(representativeTide(s).stationCode).toBe('DT_0025');
 s.tiers.tier1=['1','1','2','3'];s.selectedTiers='all';s.boats.push(s.boats[0]);expect(representativeTide(s).totalBoats).toBe(4);
 s.selectedRegion={...emptyRegion(),province:['전북특별자치도','전라남도']};expect(representativeTide(s).stationCode).toBe('DT_0016');
 s.tiers.tier1=['3'];s.tiers.tier2=[];expect(representativeTide(s)).toMatchObject({stationCode:'DT_0018',boatCount:1});
 s.selectedPlatform='sunsang24';expect(representativeTide(s)).toMatchObject({stationCode:null,totalBoats:0});
});
test('ties are stable across input order, tier order and region selection order',()=>{
 const s=state(),first=representativeTide(s);expect(first.tied).toBe(true);
 s.boats.reverse();s.tiers.tier1.reverse();expect(representativeTide(s).stationCode).toBe(first.stationCode);
 s.selectedRegion={...emptyRegion(),sea:['서해권','남해권']};const selected=representativeTide(s).stationCode;s.selectedRegion.sea=['남해권','서해권'];expect(representativeTide(s).stationCode).toBe(selected);
});
test.each([
 ['서해권','전북','군산','DT_0018'],['남해권','경남','통영','DT_0014'],['서해권','전남','목포','DT_0007'],['남해권','전남','여수','DT_0016'],
 ['동해권','강원','동해','DT_0006'],['동해권','경북','포항','DT_0091'],['남해권','부산','부산','DT_0005'],['서해권','인천','옹진','DT_0001'],['남해권','제주','서귀포','DT_0010'],
])('verified regional point %s/%s/%s is %s',(sea,province,local,station)=>{
 const s=emptyState();s.boats=[boat('1',sea,province,local)];s.tiers.tier1=['1'];s.selectedRegion={...emptyRegion(),local};expect(representativeTide(s).stationCode).toBe(station);
});
test('unmapped/no targets and missing selected-station days never borrow another region',()=>{
 const s=state();s.boats=[boat('1','','','')];s.tiers.tier1=['1'];s.tideDays=mergeTideDays(archive.days);expect(regionalTideMonth(s).stationCode).toBeNull();expect(regionalTideMonth(s).days).toEqual({});
 s.boats=[boat('1','남해권','전남','여수')];s.month='2026-10';expect(regionalTideMonth(s).days).toEqual({});
});
test('same dates coexist per station and backups retain more than one year for every station',()=>{
 const dates=Array.from({length:790},(_,i)=>new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10));
 const rows=mergeTideDays(...Object.keys(TIDE_STATIONS).map(code=>dates.map(date=>day(code as TideStationCode,date))));
 for(const code of Object.keys(TIDE_STATIONS)) expect(rows.filter(d=>d.stationCode===code)).toHaveLength(790);
 const separate=mergeTideDays([day('DT_0025'),day('DT_0016')]);expect(separate).toHaveLength(2);expect(calculateTideMonth('2026-12',separate,'DT_0016').days['2026-12-15'].stationCode).toBe('DT_0016');
});
test('automatic loader skips fresh same-station data, reloads another station/month, throttles failure and retries explicitly',async()=>{
 const read=vi.fn(async()=>({days:[],message:'done'})),apply=vi.fn(async()=>{}),status=vi.fn(),loader=new TideAutoLoad(read,apply,status);
 const days=tideDates('2026-12').map(d=>day('DT_0016',d));await loader.sync('DT_0016','2026-12',days,true);expect(read).not.toHaveBeenCalled();
 await loader.sync('DT_0025','2026-12',days,true);expect(read).toHaveBeenCalledTimes(1);
 read.mockRejectedValue(new Error('offline'));await loader.sync('DT_0016','2027-12',[],true);await loader.sync('DT_0016','2027-12',[],true);expect(read).toHaveBeenCalledTimes(2);
 await loader.sync('DT_0016','2027-12',[],true,true);expect(read).toHaveBeenCalledTimes(3);expect(apply).toHaveBeenCalledTimes(1);
 await loader.sync('DT_0016','2028-02',[],false);expect(read).toHaveBeenCalledTimes(3);
});
test('rapid region/month changes discard stale in-flight results',async()=>{
 let resolve!:(v:{days:TideDay[];message:string})=>void;
 const read=vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({days:[day('DT_0016')],message:'south'}),apply=vi.fn(async(_days:TideDay[],_signal:AbortSignal)=>{}),loader=new TideAutoLoad(read,apply,()=>{});
 const old=loader.sync('DT_0025','2026-12',[],true);await loader.sync('DT_0016','2026-12',[],true);resolve({days:[day('DT_0025')],message:'west'});await old;
 expect(apply).toHaveBeenCalledTimes(1);expect(apply.mock.calls[0][0][0].stationCode).toBe('DT_0016');
});
