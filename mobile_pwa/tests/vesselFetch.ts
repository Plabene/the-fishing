/** Vessel-journey tests count reservation traffic independently of background tides.
 * Tide requests are explicit unavailable fixtures, never external traffic or invented data.
 * Real auto-load, station switching and persistence are covered in tideUi/browser tests. */
export const vesselFetch=(request:typeof fetch):typeof fetch=>async(input,init)=>{
  const url=new URL(String(input));
  if(url.pathname==='/v1/tides') return Response.json({schema:1,stationCode:url.searchParams.get('station'),month:url.searchParams.get('month'),status:'UNAVAILABLE',days:[]});
  return request(input,init);
};
