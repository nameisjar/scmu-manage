const {Prisma}=require('@prisma/client');
const {fail,text,choice}=require('./jpt');
const {calendarDate}=require('./registerFields');
const sea=require('./seaBills');
const SORTS=['registerNumber','vesselName','voyageNumber','billNumber','portOfLoading','createdAt','registerAmount'];
const hasBL={AND:[{OR:[{document:{filename:{not:null}}},{files:{some:{category:{in:['DRAFT','FINAL','LEGACY']}}}}]},{OR:[{registerData:{path:['documentState','blMissing'],equals:Prisma.AnyNull}},{registerData:{path:['documentState','blMissing'],equals:false}}]}]};
const hasPacking={OR:[{files:{some:{category:{in:['PACKING_LIST','INTERNAL_PACKING_LIST']}}}},{allocations:{some:{packingList:{document:{filename:{not:null}}}}}}]};
const pattern=value=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
async function registerQuery(tx,query={}) {
 const archived=choice(query.archived||'active',['active','archived','all'],'Archive filter');
 const active={AND:[{archivedAt:null},{OR:[{registerData:{path:['archivedAt'],equals:Prisma.AnyNull}},{registerData:{path:['archivedAt'],equals:''}}]}]};
 const archiveWhere=archived==='all'?{}:archived==='active'?active:{NOT:active};
 const and=[archiveWhere];
 if(query.vesselId)and.push({vesselId:text(query.vesselId,'Kapal',100)});
 if(query.voyageId)and.push({voyageId:text(query.voyageId,'Voyage',100)});
 if(query.vesselExact)and.push({vesselName:{equals:text(query.vesselExact,'Kapal',200),mode:'insensitive'}});
 if(query.voyageExact)and.push({voyageNumber:{equals:text(query.voyageExact,'Voyage',200),mode:'insensitive'}});
 if(query.voyageMissing==='true')and.push({OR:[{voyageNumber:null},{voyageNumber:''}]});
 if(query.month){
  fail(typeof query.month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month),'Month must be YYYY-MM');
  const start=new Date(`${query.month}-01T00:00:00.000Z`);const end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
  and.push({OR:[{registerData:{path:['register','arrivalDate'],gte:start.toISOString(),lt:end.toISOString()}},{AND:[{registerData:{path:['register','arrivalDate'],equals:Prisma.AnyNull}},{createdAt:{gte:start,lt:end}}]}]});
 }
 const from=calendarDate(query.dateFrom,'Date from');const to=calendarDate(query.dateTo,'Date to');
 fail(!from||!to||from<=to,'Date to must not precede date from');
 if(from||to){const end=to?new Date(new Date(to).getTime()+86400000):null;and.push({createdAt:{...(from&&{gte:new Date(from)}),...(end&&{lt:end})}});}
 if(query.vessel)and.push({vesselName:{contains:text(query.vessel,'Vessel',200),mode:'insensitive'}});
 if(query.voyage)and.push({voyageNumber:{contains:text(query.voyage,'Voyage',200),mode:'insensitive'}});
 if(query.port)and.push({portOfLoading:{contains:text(query.port,'Port of origin',200),mode:'insensitive'}});
 if(query.company){
  const company=text(query.company,'Company',200);const like=pattern(company);
  const ids=await tx.$queryRaw(Prisma.sql`SELECT id FROM sea_bills WHERE COALESCE("registerData"->'register'->>'partyName','') ILIKE ${like} OR COALESCE("registerData"->'register'->>'partyText','') ILIKE ${like} OR COALESCE("registerData"->'register'->>'customerName','') ILIKE ${like} OR COALESCE("registerData"->'register'->>'billingPartyName','') ILIKE ${like}`);
  and.push({OR:[{id:{in:ids.map(row=>row.id)}},...['shipperName','consigneeName','carrierName'].map(key=>({[key]:{contains:company,mode:'insensitive'}}))]});
 }
 if(query.status){
  const status=choice(query.status,sea.STATUSES,'Container status');
  const ids=await tx.$queryRaw(Prisma.sql`SELECT id FROM sea_bills WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof("registerData"->'containers')='array' THEN "registerData"->'containers' WHEN jsonb_typeof(containers)='array' THEN containers ELSE '[]'::jsonb END) AS c WHERE COALESCE(c->>'status','REGISTERED')=${status})`);
  and.push({id:{in:ids.map(row=>row.id)}});
 }
 const documents=choice(query.documents||'ALL',['ALL','BL_MISSING','PACKING_MISSING','COMPLETE'],'Document filter');
 if(documents==='BL_MISSING')and.push({NOT:hasBL});
 if(documents==='PACKING_MISSING')and.push({NOT:hasPacking});
 // Packing List is optional. "Complete" means a BL file is available, not
 // that optional packing exists or that the carrier released the cargo.
 if(documents==='COMPLETE')and.push(hasBL);
 if(query.search){
  const search=text(query.search,'Search',200);const like=pattern(search);
  const ids=await tx.$queryRaw(Prisma.sql`SELECT id FROM sea_bills WHERE containers::text ILIKE ${like} OR EXISTS (SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof("registerData"->'register')='object' THEN "registerData"->'register' ELSE '{}'::jsonb END) AS field WHERE field.value ILIKE ${like})`);
  and.push({OR:[...['registerNumber','billNumber','carrierName','vesselName','voyageNumber','portOfLoading','portOfDischarge','shipperName','consigneeName'].map(key=>({[key]:{contains:search,mode:'insensitive'}})),{job:{jobNumber:{contains:search,mode:'insensitive'}}},{id:{in:ids.map(row=>row.id)}}]});
 }
 const sort=choice(query.sort||query.sortBy||'createdAt',SORTS,'Sort column');const direction=choice(query.direction||query.sortOrder||'desc',['asc','desc'],'Sort direction');
 return {where:{AND:and},archiveWhere,orderBy:[{[sort]:direction},{id:direction}]};
}
module.exports={registerQuery,hasBL,hasPacking,SORTS};
