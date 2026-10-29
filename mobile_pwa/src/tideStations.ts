/** Codes and names verified against KHOA official high/low forecasts on 2026-10-30.
 * Sea defaults preserve the PC regional profiles; 제주 is separate, never borrowed from 여수.
 * These are representative points, not predictions for every harbour in the region. */
export const TIDE_STATIONS={
  DT_0025:{code:'DT_0025',name:'보령',sea:'서해권',latitude:36.40638,longitude:126.48611},
  DT_0016:{code:'DT_0016',name:'여수',sea:'남해권',latitude:34.74722,longitude:127.76555},
  DT_0005:{code:'DT_0005',name:'부산',sea:'동해권',latitude:35.09638,longitude:129.03527},
  DT_0004:{code:'DT_0004',name:'제주',sea:'제주권',latitude:33.5275,longitude:126.54305},
  DT_0014:{code:'DT_0014',name:'통영',sea:'남해권',latitude:34.82777,longitude:128.43472},
  DT_0001:{code:'DT_0001',name:'인천',sea:'서해권',latitude:37.451944,longitude:126.592222},
  DT_0018:{code:'DT_0018',name:'군산',sea:'서해권',latitude:35.975556,longitude:126.563056},
  DT_0007:{code:'DT_0007',name:'목포',sea:'서해권',latitude:34.779722,longitude:126.375556},
  DT_0006:{code:'DT_0006',name:'묵호',sea:'동해권',latitude:37.550278,longitude:129.116389},
  DT_0091:{code:'DT_0091',name:'포항',sea:'동해권',latitude:36.047128,longitude:129.383806},
  DT_0010:{code:'DT_0010',name:'서귀포',sea:'제주권',latitude:33.24,longitude:126.561667},
} as const;
export type TideStationCode=keyof typeof TIDE_STATIONS;
export const isTideStation=(value:unknown):value is TideStationCode=>typeof value==='string' && Object.hasOwn(TIDE_STATIONS,value);
export const SEA_TIDE_STATIONS:Record<string,TideStationCode>={'서해권':'DT_0025','남해권':'DT_0016','동해권':'DT_0005','제주권':'DT_0004'};
/** Administrative representatives, verified names/codes from KHOA station directory.
 * No proximity inference: these labels explicitly describe a representative, not a local forecast. */
export const PROVINCE_TIDE_STATIONS:Record<string,TideStationCode>={
  '인천광역시':'DT_0001','경기도':'DT_0001','충청남도':'DT_0025','전북특별자치도':'DT_0018',
  '경상남도':'DT_0014','부산광역시':'DT_0005','울산광역시':'DT_0005','강원특별자치도':'DT_0006','경상북도':'DT_0091','제주특별자치도':'DT_0004',
};
