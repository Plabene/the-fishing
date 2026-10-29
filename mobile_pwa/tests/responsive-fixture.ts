// Local browser fixture only; Vite's production input remains index.html.
import '../src/style.css';
import {emptyState} from '../src/models';
import {saveState} from '../src/availabilityStore';
import {tideDates} from '../src/tides';
import {TIDE_STATIONS,type TideStationCode} from '../src/tideStations';
const state=emptyState();
state.boats=['9971','9972','9973','9974'].map((uid,i)=>({uid,name:i===0?'아주긴선박명과출항정보를확인하는가상시험선박호':`반응형 시험 ${i+1}호`,port:i<2?'비응항':'오천항',url:`https://thefishing.kr/reservation/list.php?uid=${uid}`,region:{sea:'서해권',province:i<2?'전북특별자치도':'충청남도',local:i<2?'군산':'보령'}}));
state.selectedUids=state.boats.map(b=>b.uid);state.tiers={tier1:['9971'],tier2:['9972'],tier3:['9973'],other:['9974']};
state.selectedRegion={sea:'',province:['전북특별자치도','충청남도'],local:'',port:''};
if(new URL(location.href).searchParams.has('south')) {
  for(const boat of state.boats.slice(0,2)) boat.region={sea:'남해권',province:'전라남도',local:'여수'};
  state.selectedRegion.province=['전라남도','충청남도'];
}
await saveState(state);
localStorage.removeItem('thefishing-availability-api');
let requests=0;
window.fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(url.hostname.endsWith('.workers.dev') && url.pathname==='/v1/tides') {
    const station=url.searchParams.get('station') as TideStationCode,month=url.searchParams.get('month')!;
    if(!TIDE_STATIONS[station]) throw new Error('Invalid fixture station');
    document.body.dataset.tideRequests=String(Number(document.body.dataset.tideRequests || 0)+1);
    // Explicitly synthetic browser fixture; never production or captured forecasts.
    return Response.json({schema:1,stationCode:station,month,status:'OK',days:tideDates(month).map((date,i)=>({date,stationCode:station,fetchedAt:new Date().toISOString(),extrema:[{timestamp:date+'T01:00:00+09:00',kind:'low',levelCm:10},{timestamp:date+'T07:00:00+09:00',kind:'high',levelCm:100+i*3}]}))});
  }
  if(!url.hostname.endsWith('.workers.dev') || url.pathname!=='/v1/month') throw new Error('Fixture blocks all non-mocked network requests');
  document.querySelector('#fixture-requests')!.textContent=`요청 ${++requests}`;
  const scenario=document.querySelector<HTMLSelectElement>('#fixture-scenario')!.value;
  const uid=url.searchParams.get('uid')!,month=url.searchParams.get('month')!,observedAt=new Date().toISOString();
  if(scenario==='slow') await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,20000);init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('cancelled','AbortError'));},{once:true});});
  if(scenario==='failure' || scenario==='partial' && uid==='9973') return Response.json({status:'HTTP_ERROR',httpStatus:500,events:[],message:'가상 응답 실패',stop:false});
  return Response.json({status:'ALLOWED_READABLE',observedAt,fresh:true,cached:false,events:scenario==='empty'?[]:[0,1].map(index=>({id:'direct-1234567890123456789'+uid+index,uid,date:month+'-06',trip:uid==='9971'?'쭈꾸미, 갑오징어':'갑오징어',species:uid==='9971'?'쭈꾸미, 갑오징어':'갑오징어',port:uid==='9971'?'전북특별자치도 군산시 비응항':'오천항',departure:index?'13:00':'05:00',remaining:index?2:5,price:120000,reservationStatus:'available',reservationStatusLabel:'예약 가능',observedAt}))});
};
await import('../src/main');
