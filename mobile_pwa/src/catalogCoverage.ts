import fleet from './data/sunsang24Fleet.json';
import sync from './data/catalogSync.json';
import {commonRegion,matchesRegion,type RegionFilter} from './regions';
import {boatPlatform} from './platforms';
import {uniqueFleet} from './fleetList';
import type {Boat} from './models';
import {el} from './dayView';

const provinces=['서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시','경기도','강원특별자치도','충청북도','충청남도','전북특별자치도','전라남도','경상북도','경상남도','제주특별자치도','미확인'];
export function catalogCoverage(boats:Boat[],region?:RegionFilter) {
  const unique=uniqueFleet(boats),byId=new Map(fleet.boats.map(b=>[b.shipId,commonRegion({...b,region:{sea:b.sea,province:b.province,local:b.local}}).province || '미확인']));
  const observed=fleet.catalog.sources.filter(s=>s.status==='OK').flatMap(s=>'shipIds' in s?s.shipIds as string[]:[]);
  return provinces.map(province=>{
    const rows=observed.filter(id=>(byId.get(id) || '미확인')===province);
    const stored=unique.filter(b=>(commonRegion(b).province || '미확인')===province);
    return {province,sourceSearchTotal:null,sourceCountType:'미검증',publicItems:rows.length,publicUnique:new Set(rows).size,thefishing:stored.filter(b=>boatPlatform(b)==='thefishing').length,sunsang24:stored.filter(b=>boatPlatform(b)==='sunsang24').length,stored:stored.length,regionMatched:stored.filter(b=>matchesRegion(b,region)).length};
  });
}
export function renderCatalogCoverage(target:HTMLElement,boats:Boat[],region?:RegionFilter) {
  target.replaceChildren();target.className='catalog-coverage';
  const date=(value:string|null)=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'기록 없음';
  const status=sync.status==='OK'?'등록 출처 확인 완료':sync.status==='PARTIAL'?'일부 출처 확인 실패':sync.status==='FAILED'?'갱신 실패':'갱신 대기';
  target.append(el('p',`${sync.schedule} · ${status} · 마지막 시도 ${date(sync.lastAttemptAt)} · 마지막 부분/전체 확인 ${date(sync.lastSuccessAt)}. 신규 ${sync.added} · 변경 ${sync.changed} · 실패 출처 ${sync.failedSources} · 충돌 ${sync.conflicts}. 미노출 기존 선박 ${sync.retained}개는 삭제하지 않았습니다.`));
  target.append(el('p','원본 기준: 사용자가 확인한 2026-10-27 전남권 310건, 군산 133건. 원본 전체 행을 확보하지 못해 고유 선박 수인지 검증하지 못했습니다. 아래 공개 목록 수는 날짜별 중앙 검색 결과와 별개입니다. 0은 보유 자료 없음이며 실제 선박 없음이 아닙니다.'));
  const table=el('table'),caption=el('caption','전국 지역별 목록 확인 · 원본 검색 총수는 모두 미검증');table.append(caption);
  const head=el('thead'),tr=el('tr');for(const name of ['시·도','공개 항목','공개 고유 ID','더피싱','선상24','지역 일치']) tr.append(el('th',name));head.append(tr);table.append(head);
  const body=el('tbody');
  for(const r of catalogCoverage(boats,region)) {const row=el('tr');for(const value of [r.province,r.publicItems,r.publicUnique,r.thefishing,r.sunsang24,r.regionMatched]) row.append(el('td',String(value)));body.append(row);}
  table.append(body);target.append(table,el('p','공개 항목: 성공한 등록 선사 목록의 합계(중복 포함). 공개 고유 ID: 해당 지역 공개 목록 내 중복 제거. 플랫폼 수: 기기 보유 목록의 플랫폼·ID 중복 제거. 지역 일치: 현재 지역 조건에 맞는 두 플랫폼 및 외부 선박 수(티어·이름 검색 적용 전). 예약 잔여석은 조회하기로 별도 확인합니다.'));
}
