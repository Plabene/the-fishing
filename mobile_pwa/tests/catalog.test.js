import {expect,test} from 'vitest';
import {parseCatalogPage,collectCatalog,mergePublishedFleet,CATALOG_URL} from '../scripts/lib/catalog.mjs';
const card=(uid,name='시험호',area='서해권 &gt; 충청남도 &gt; 보령시 &gt; 오천항')=>`<li><a href="${CATALOG_URL}?uid=${uid}"><span class="re_list_ship">${name}</span><span class="re_list_area">${area}</span></a></li>`;
const page=(number,cards,total=3,last=2)=>`<html><head><title>예약검색 ${number}페이지</title></head><body><div class="re_s_total">전체 ${total}건 / 검색 ${total}건</div><article><h2 class="re_st_family">광고</h2><div class="re_list"><ul>${card('99','광고호')}</ul></div></article><article><h2 class="re_st_2">예약리스트</h2><div class="re_list"><ul>${cards}</ul></div><a class="next10" href="?page=${last}">끝</a></article></body></html>`;
test('extracts only public result cards, excluding ads and contact details',()=>{
  const result=parseCatalogPage(page(1,card('1','배 010-1234-5678')+card('2','')));
  expect(result.boats.map(b=>b.uid)).toEqual(['1','2']);expect(result.boats[0].name).toBe('배 [연락처 제외]');
  expect(result.boats[1].name).toBe('');expect(result.boats[0].region).toEqual({sea:'서해권',province:'충청남도',local:'보령시'});
  expect(result.boats[0].port).toBe('오천항');
});
test('collects every page, counts raw cards separately, and deduplicates safely',async()=>{
  const visited=[];const result=await collectCatalog(async n=>{visited.push(n);return n===1 ? page(1,card('1')+card('2')):page(2,card('1'));});
  expect(visited).toEqual([1,2]);expect(result).toMatchObject({total:2,listedCards:3,duplicates:1,pages:2,conflicts:0});
});
test('conflicting duplicate fields preserve old metadata and do not invent a new name or region',async()=>{
  const result=await collectCatalog(async n=>n===1 ? page(1,card('1','이름A')+card('2')):page(2,card('1','이름B','남해권 &gt; 경상남도 &gt; 사천 &gt; 삼천포항')));
  expect(result.conflicts).toBe(1);
  const old={uid:'1',name:'기존 이름',port:'이전 항구',url:`${CATALOG_URL}?uid=1`,region:{sea:'서해권',province:'충청남도',local:'보령시'}};
  const merged=mergePublishedFleet([old],result.boats);expect(merged[0]).toEqual(old);
  expect(mergePublishedFleet([],result.boats)[0]).toMatchObject({name:'UID 1 · 이름 미확인',port:''});
});
test('rejects blocked/malformed responses, unsafe links, incomplete counts and changing pages',async()=>{
  for(const html of ['<title>Access denied</title>',page(1,card('1').replace('https://thefishing.kr','https://evil.example'),1,1),page(1,card('1'),4,1),page(2,card('1'))]) {
    await expect(collectCatalog(async()=>html)).rejects.toThrow();
  }
  await expect(collectCatalog(async n=>n===1?page(1,card('1')+card('2')):page(2,card('3'),4))).rejects.toThrow();
  await expect(collectCatalog(async n=>n===1?page(1,card('1')+card('2')):page(2,card('3')+card('4')))).rejects.toThrow();
  await expect(collectCatalog(async n=>{if(n===2) throw new Error('HTTP 403');return page(1,card('1')+card('2'));})).rejects.toThrow('HTTP 403');
});
test('merge keeps unobserved and external boats and names missing from the public directory',()=>{
  const old=[{uid:'1',name:'이름',port:'항구',url:`${CATALOG_URL}?uid=1`},{uid:'external:a',name:'외부',port:'항구',url:''}];const copy=structuredClone(old);
  const result=mergePublishedFleet(old,[{uid:'1',name:'',port:'',url:`${CATALOG_URL}?uid=1`},{uid:'2',name:'새 배',port:'',url:`${CATALOG_URL}?uid=2`}]);
  expect(result.find(b=>b.uid==='1').name).toBe('이름');expect(result.some(b=>b.uid==='external:a')).toBe(true);expect(old).toEqual(copy);
});
