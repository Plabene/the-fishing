export interface PublicFleetSource {host:string;province:string;local:string;sea:string;locationToken:string;portByShip?:Record<string,string|undefined>;excludeShipIds?:string[]}
export interface PublicFleetBoat {shipId:string;uid:string;name:string;port:string;departureArea:string;province:string;local:string;provinceId:string;areaId:string;sea:string;url:string;observedAt:string;sourceUrl:string;regionBasis:string;calendarObserved:boolean}
export function parsePublicFleet(html:string,source:PublicFleetSource,observedAt:string):PublicFleetBoat[];
export function mergePublicFleet(previous:PublicFleetBoat[],results:PublicFleetBoat[][]):{boats:PublicFleetBoat[];conflicts:Array<{shipId:string;field:string}>};
export function validatePublicFleet(value:unknown,source:PublicFleetSource):PublicFleetBoat[];
