const { fail, text, choice, date, number, customer, audit, financials, jobInclude } = require('./jpt');
const sea = require('./seaBills');
const include = {...sea.seaInclude, job:{include:jobInclude}};
const json = value => JSON.parse(JSON.stringify(value));
function present(bill) {
 const data=normalize({},bill);
 return {...sea.present(bill),job:undefined,jobNumber:bill.job?.jobNumber,registerNumber:bill.registerNumber,...data,financials:financials(bill.job||{}),documentSummary:{internalStatus:bill.internalStatus,releaseStatus:bill.releaseStatus,receiptStatus:sea.receipt(bill)},dateWarning:data.register.dateMeaning==='UNCONFIRMED'?'Date meaning is unconfirmed; do not assume vessel, container, or document arrival.':null};
}
async function get(tx,id) {
 const bill=await tx.seaBill.findUnique({where:{id},include});fail(bill,'BL register record not found',404);return bill;
}
async function create(tx,user,body) {
 const billNumber=text(body.billNumber,'BL number',100);
 const ops=normalize(body);const fields=sea.metadata({...body,billNumber,containers:ops.containers.map(({number,seal})=>({number,seal}))});
 await sea.registerIdentity(tx,billNumber);
 const owner=await customer(tx);
 const job=await tx.jobOrder.create({data:{jobNumber:number('JOB'),jobType:'RECEIVER',title:`BL ${billNumber}`,customerId:owner.id,originCity:fields.portOfLoading||'Unconfirmed',destCity:fields.portOfDischarge||'Unconfirmed',cargoDescription:ops.register.cargoDescription||'Unconfirmed',packages:0,currency:'IDR',recipientName:owner.name,createdById:user.id}});
 // This is a pending record of an existing sea document, NOT vendor procurement,
 // an approved booking, or evidence of receipt/release. No carrier or freight is awarded.
 const shipment=await tx.shipment.create({data:{jobId:job.id,shipmentNumber:number('SHP'),mode:'SEA',transportSource:'EXTERNAL',status:'PENDING',shipperCompanyId:owner.id,originCity:job.originCity,destCity:job.destCity,originState:'Unconfirmed',destState:'Unconfirmed',loadingDate:new Date(),notes:'Preliminary BL register reference only; not an approved transport booking. Operational date meaning remains in the register.',createdById:user.id}});
 const bill=await sea.createBill(tx,user,job.id,{...fields,shipmentId:shipment.id});
 await tx.seaBill.update({where:{id:bill.id},data:{registerNumber:text(body.registerNumber,'Register number',100,true)||number('REG'),registerIdentity:billNumber.toUpperCase(),registerData:json(ops)}});
 await audit(tx,user,'BL_REGISTER_CREATED','JobOrder',job.id,{seaBillId:bill.id,register:ops});
 return present(await get(tx,bill.id));
}
const STATUSES = sea.STATUSES;
const iso = value => { const result=date(value,true); return result ? result.toISOString() : null; };
function normalize(body, before = {}) {
  fail(body.register === undefined || body.register && typeof body.register==='object' && !Array.isArray(body.register), 'Register details must be an object');
  const previous=before.registerData || {};
  const input={...(previous.register||{}),...(body.register||{})};
  const register={...input, ...Object.fromEntries(['customerName','billingPartyName','cargoDescription'].map(key=>[key,text(input[key],key,key==='cargoDescription'?2000:200,true)])), departureDate:iso(input.departureDate),arrivalDate:iso(input.arrivalDate),dateMeaning:choice(input.dateMeaning||'UNCONFIRMED',['UNCONFIRMED','VESSEL','CONTAINER','DOCUMENT'],'Date meaning')};
  fail(!register.departureDate || !register.arrivalDate || register.arrivalDate>=register.departureDate, 'Arrival must follow departure');
  const documents=before.containers || [];
  const saved=previous.containers || [];
  const ordered=[...saved.filter(row=>documents.some(item=>item.number===row.number)).map(row=>documents.find(item=>item.number===row.number)),...documents.filter(row=>!saved.some(item=>item.number===row.number))];
  const source=body.containers ?? ordered;
  fail(Array.isArray(source)&&source.length<=100&&source.every(row=>row&&typeof row==='object'&&!Array.isArray(row)), 'Enter up to 100 valid containers');
  const merged=source.map(row=>{
    const number=String(row.number||'').trim().toUpperCase();
    const document=documents.find(item=>item.number===number) || {};
    const old=saved.find(item=>item.number===number) || {};
    // Legacy extras are fallback only; document number/seal remain authoritative.
    return {...sea.historicalOperational({...document,...old}),number,seal:document.seal,...(body.containers===undefined?{}:row)};
  });
  const identities=sea.metadata({containers:merged}).containers;
  const containers=identities.map(data=>sea.operational(data,true));
  return {register,containers};
}
async function update(tx,user,id,body) {
 const before=await get(tx,id);
 await sea.getBill(tx,before.jobId,id,body.version);
 const ops=normalize(body,before);
 const identity=ops.containers.map(({number,seal})=>({number,seal}));
 const sorted=rows=>JSON.stringify(rows.map(({number,seal})=>({number,seal:seal||null})).sort((a,b)=>a.number.localeCompare(b.number)));
 const identityKeys=['billNumber','documentKind','issueDate','carrierName','vesselName','voyageNumber','portOfLoading','portOfDischarge','shipperName','consigneeName','packages','grossWeightKg','volumeCbm','reviewIssues','allocations'];
 const material=identityKeys.some(key=>body[key]!==undefined && JSON.stringify(body[key])!==JSON.stringify(before[key])) || sorted(identity)!==sorted(before.containers||[]);
 if(body.billNumber!==undefined) await sea.registerIdentity(tx,text(body.billNumber,'BL number',100),before);
 if(material) await sea.updateBill(tx,user,before.jobId,id,{...body,containers:identity});
 await tx.seaBill.update({where:{id},data:{registerData:json(ops),...(body.registerNumber!==undefined?{registerNumber:text(body.registerNumber,'Register number',100,true)}:{}),...(!material?{version:{increment:1},...(body.notes!==undefined?{notes:text(body.notes,'Notes',3000,true)}:{})}:{})}});
 await audit(tx,user,'BL_REGISTER_UPDATED','JobOrder',before.jobId,{seaBillId:id,before:before.registerData,after:ops});
 return present(await get(tx,id));
}
async function list(tx,query={}) {
 const {Prisma}=require('@prisma/client');const {pageOptions}=require('./pagination');
 const {page,limit}=pageOptions(query);const and=[];
 if(query.month) {
  fail(/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month),'Month must be YYYY-MM');
  const start=new Date(`${query.month}-01T00:00:00Z`);const end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
  and.push({OR:[{registerData:{path:['register','arrivalDate'],gte:start.toISOString(),lt:end.toISOString()}},{AND:[{registerData:{path:['register','arrivalDate'],equals:Prisma.AnyNull}},{createdAt:{gte:start,lt:end}}]}]});
 }
 if(query.vessel) and.push({vesselName:{contains:text(query.vessel,'Vessel',200),mode:'insensitive'}});
 if(query.port) and.push({OR:['portOfLoading','portOfDischarge'].map(key=>({[key]:{contains:text(query.port,'Port',200),mode:'insensitive'}}))});
 if(query.status) {
  const status=choice(query.status,STATUSES,'Container status');
  const ids=await tx.$queryRaw(Prisma.sql`SELECT id FROM sea_bills WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof("registerData"->'containers')='array' THEN "registerData"->'containers' ELSE containers END) AS c WHERE COALESCE(c->>'status','REGISTERED')=${status})`);
  and.push({id:{in:ids.map(row=>row.id)}});
 }
 if(query.search) {
  const search=text(query.search,'Search',200);const pattern=`%${search.replace(/[\\%_]/g,'\\$&')}%`;
  const ids=await tx.$queryRaw(Prisma.sql`SELECT id FROM sea_bills WHERE containers::text ILIKE ${pattern} OR "registerData"::text ILIKE ${pattern}`);
  and.push({OR:[...['billNumber','registerNumber','carrierName','vesselName','shipperName','consigneeName'].map(key=>({[key]:{contains:search,mode:'insensitive'}})),{job:{jobNumber:{contains:search,mode:'insensitive'}}},{id:{in:ids.map(row=>row.id)}}]});
 }
 const where={AND:and};const total=await tx.seaBill.count({where});
 const facts=await tx.seaBill.findMany({where,select:{containers:true,registerData:true,internalStatus:true,releaseStatus:true,job:{select:{status:true,invoices:{include:{payments:true}}}}}});
 const summary={activeBills:0,pendingPort:0,dooring:0,pendingEmpty:0,incompleteDocuments:0,unpaidInvoices:0,freeTimeAlerts:0};
 for(const bill of facts) {
  if(['CLOSED','CANCELLED'].includes(bill.job?.status)) continue;
  summary.activeBills++;
  const containers=normalize({},bill).containers;
  summary.pendingPort+=containers.filter(row=>['REGISTERED','READY'].includes(row.status)).length;
  summary.dooring+=containers.filter(row=>row.status==='DOORING').length;
  summary.pendingEmpty+=containers.filter(row=>['GATE_OUT','DOORING','STRIPPED'].includes(row.status)&&!row.emptyReturnedAt).length;
  summary.freeTimeAlerts+=containers.filter(row=>row.freeTimeUntil&&!row.emptyReturnedAt&&new Date(row.freeTimeUntil)<=new Date(Date.now()+3*86400000)).length;
  if(bill.internalStatus!=='SEA_MATCHED'||bill.releaseStatus!=='SEA_RELEASE_CONFIRMED')summary.incompleteDocuments++;
  summary.unpaidInvoices+=(bill.job?.invoices||[]).filter(row=>!['PENDING','SUBMITTED','UNDER_REVIEW','CANCELLED'].includes(row.status)&&require('./jpt').invoiceBalance(row).gt(0)).length;
 }
 const data=await tx.seaBill.findMany({where,include,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*limit,take:limit});
 return {data:data.map(present),total,page,limit,totalPages:Math.max(1,Math.ceil(total/limit)),summary};
}
async function estimate(tx,id,body) {
 const bill=await get(tx,id);
 if(body.version!==undefined) fail(require('./jpt').integer(body.version,'Version')===bill.version,'BL changed; reload before estimating',409);
 fail(Array.isArray(body.tariffIds)&&body.tariffIds.every(id=>typeof id==='string')&&body.tariffIds.length<=100,'Select valid tariffs');
 const tariffs=await tx.jptTariff.findMany({where:{id:{in:body.tariffIds}}});
 return require('./jptTariffs').estimate(present(bill),tariffs,body.tariffIds);
}
async function charges(tx,user,id,body) {
 const bill=await get(tx,id);await sea.getBill(tx,bill.jobId,id,body.version);
 fail(bill.job.currency==='IDR','Tariffs require an IDR job',409);
 const calculation=await estimate(tx,id,body);const result=[];const approvals=[];
 for(const line of calculation.lines) {
  const tariffKey=`${id}:${line.tariffId}`;
  fail(!await tx.jobCharge.findFirst({where:{tariffKey}}),'This tariff is already proposed for this BL; use the existing charge',409);
 }
 for(const line of calculation.lines) {
  const snapshot=json({billId:id,billNumber:bill.billNumber,registerNumber:bill.registerNumber,line,currency:'IDR',containerNumbers:present(bill).containers.map(row=>({number:row.number,size:row.size})),notice:require('./jptTariffs').NOTICE});
  const charge=await tx.jobCharge.create({data:{jobId:bill.jobId,shipmentId:bill.shipmentId,kind:'REVENUE',status:'PROPOSED',description:`${line.description} — ${bill.billNumber||bill.id}: ${line.quantity} ${line.unit} × ${line.unitPrice}`.slice(0,300),estimatedAmount:require('./jpt').decimal(line.amount),tariffKey:`${id}:${line.tariffId}`,tariffSnapshot:snapshot,createdById:user.id,notes:require('./jptTariffs').NOTICE}});
  await audit(tx,user,'CHARGE_PROPOSED','JobOrder',bill.jobId,{chargeId:charge.id,seaBillId:id,tariffSnapshot:snapshot});
  approvals.push(await require('./director').submit(tx,user,'CHARGE_APPROVE',charge.id,{actualAmount:line.amount},'Explicit BL tariff selection; immutable price snapshot.'));
  result.push(charge);
 }
 await tx.seaBill.update({where:{id},data:{version:{increment:1}}});
 return {jobId:bill.jobId,jobNumber:bill.job.jobNumber,jobUrl:`/jobs/${bill.jobId}`,charges:result,approvals,version:bill.version+1,...calculation};
}
module.exports={normalize,STATUSES,create,get,present,include,update,list,estimate,charges};
