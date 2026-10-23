// Exact vendor ID recorded by the original PC adapter, never a name-based match.
export const BOOKING_ALIASES:Record<string,{uid:string;url:string;evidence:string}>={
  'external:3e13428ab1e484d50b7e':{uid:'5364',url:'https://thefishing.kr/reservation/list.php?uid=5364',evidence:'PC teamhanpro-thefishing-v5 profile: vendor_boat_id 5364; live calendar validated 2026-10-23'},
};
export function bookingAlias(uid:string) {return Object.hasOwn(BOOKING_ALIASES,uid)?BOOKING_ALIASES[uid]:undefined;}
