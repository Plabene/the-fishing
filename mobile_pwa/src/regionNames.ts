/** Administrative spelling aliases only. Ports and ambiguous multi-city areas stay distinct. */
const provinces:Record<string,string>={서울:'서울특별시',서울시:'서울특별시',부산:'부산광역시',부산시:'부산광역시',대구:'대구광역시',인천:'인천광역시',인천시:'인천광역시',광주:'광주광역시',대전:'대전광역시',울산:'울산광역시',세종:'세종특별자치시',세종시:'세종특별자치시',경기:'경기도',강원:'강원특별자치도',강원도:'강원특별자치도',충북:'충청북도',충남:'충청남도',전북:'전북특별자치도',전라북도:'전북특별자치도',전남:'전라남도',경북:'경상북도',경남:'경상남도',제주:'제주특별자치도',제주도:'제주특별자치도'};
export const normalizeProvince=(value:string)=>provinces[value.trim()] || value.trim();
export function normalizeLocal(value:string):string {
  const local=value.normalize('NFKC').trim();
  // A single administrative 시/군/구 suffix, never split comma/slash based source categories.
  return /^[가-힣]{2,}(?:시|군|구)$/.test(local) ? local.slice(0,-1):local;
}
