const test = require('node:test');
const assert = require('node:assert/strict');
const sea = require('../src/services/seaBills');
const register = require('../src/services/blRegister');
function store() {
 const state={jobs:[],shipments:[],bills:[],documents:[],logs:[]};
 const model=key=>({create:async({data})=>{const row={id:key+state[key].length,version:1,files:[],allocations:[],history:[],contentVersion:1,internalStatus:'SEA_UNCHECKED',releaseStatus:'SEA_RELEASE_PENDING',...data};state[key].push(row);return row},findUnique:async({where})=>state[key].find(x=>x.id===where.id),findFirst:async({where})=>state[key].find(x=>Object.entries(where).every(([k,v])=>typeof v==='object'?v.equals ? String(x[k]).toLowerCase()===v.equals.toLowerCase():true:x[k]===v)),findMany:async()=>state[key],update:async({where,data})=>{const row=state[key].find(x=>x.id===where.id);for(const [k,v] of Object.entries(data))row[k]=v&&v.increment?row[k]+v.increment:v;return row}});
 const tx={jobOrder:model('jobs'),shipment:model('shipments'),seaBill:model('bills'),jobDocument:model('documents'),activityLog:model('logs'),packingList:{findMany:async()=>[]},seaBillCargo:{findMany:async()=>[]},seaBillRevision:{create:async()=>({})},company:{findUnique:async()=>({id:'scmu',isInternal:true,isActive:true,name:'SCMU'})}};
 const find=tx.seaBill.findUnique; tx.seaBill.findUnique=async q=>{const row=await find(q);if(row){row.shipment=state.shipments.find(x=>x.id===row.shipmentId);row.job=state.jobs.find(x=>x.id===row.jobId);row.allocations=[];}return row};
 tx.seaBill.findFirst=async({where})=>{const row=where.id ? await tx.seaBill.findUnique({where}):state.bills.find(x=>x.billNumber?.toLowerCase()===where.billNumber?.equals?.toLowerCase());return row};
 return {tx,state};
}
test('one-form BL creation persists real linked receiving job, pending sea leg, document and operations; rejects duplicates before writes',async()=>{
 const {tx,state}=store(); const body={billNumber:'BL-1',carrierName:'SPIL',containers:[{number:'AB',size:'21'}],register:{customerName:'Owner'}};
 const result=await register.create(tx,{id:'staff'},body);
 assert.equal(result.jobId,state.jobs[0].id);assert.equal(result.shipmentId,state.shipments[0].id);assert.equal(result.containers[0].size,'21');assert.ok(result.registerNumber);
 assert.equal(state.jobs[0].jobType,'RECEIVER');assert.equal(state.shipments[0].mode,'SEA');assert.equal(state.shipments[0].status,'PENDING');assert.equal(state.shipments[0].carrierId,undefined);
 assert.equal(state.documents.length,1);assert.equal(result.internalStatus,'SEA_UNCHECKED');assert.equal(result.releaseStatus,'SEA_RELEASE_PENDING');assert.equal(result.receiptStatus,'SEA_NOT_RECEIVED');
 await assert.rejects(register.create(tx,{id:'staff'},body),/already/);assert.equal(state.jobs.length,1);
 const draft=await register.create(tx,{id:'staff'},{containers:[]});assert.equal(draft.billNumber,null);assert.equal(draft.registerIdentity,null);assert.equal(draft.workflow.matching,undefined);assert.equal(state.jobs.length,2);
});
test('operations update is optimistic, audited, keyed by container number and does not invalidate matched BL',async()=>{
 const {tx,state}=store();let row=await register.create(tx,{id:'staff'},{billNumber:'B',containers:[{number:'A',size:'20'},{number:'B',size:'40'}]});
 const stored=state.bills[0];stored.internalStatus='SEA_MATCHED';stored.releaseStatus='SEA_RELEASE_CONFIRMED';
 row=await register.update(tx,{id:'staff'},row.id,{version:1,containers:[{number:'B',status:'DOORING'},{number:'A'}]});
 assert.equal(row.version,2);assert.equal(row.containers[0].size,'40');assert.equal(row.containers[0].status,'DOORING');assert.equal(row.internalStatus,'SEA_MATCHED');assert.equal(row.releaseStatus,'SEA_RELEASE_CONFIRMED');
 await assert.rejects(register.update(tx,{id:'staff'},row.id,{version:1,notes:'stale'}),/changed/);
 state.jobs[0].status='CLOSED';await assert.rejects(register.update(tx,{id:'staff'},row.id,{version:2,notes:'locked'}),/closed/);
});
test('register list builds bounded server pagination and filters with full filtered summary',async()=>{
 let options;const tx={seaBill:{count:async()=>3,findMany:async args=>{options=args;return []}},$queryRaw:async()=>[]};
 const result=await register.list(tx,{page:'2',limit:'2',search:'box',month:'2026-10',vessel:'vessel',port:'port',status:'DOORING'});
 assert.equal(result.total,3);assert.equal(result.totalPages,2);assert.equal(options.skip,2);assert.equal(options.take,2);assert.ok(result.summary);assert.match(JSON.stringify(options.where),/vessel/);
 await assert.rejects(register.list(tx,{month:'2026-13'}),/Month/);await assert.rejects(register.list(tx,{limit:'0'}),/Limit/);
});
test('partial container saves retain seal and operations by number, never array position',()=>{
 const before={containers:[{number:'A',seal:'sealA'},{number:'B',seal:'sealB'}],registerData:{containers:[{number:'A',size:'21',driverName:'Driver A'},{number:'B',size:'40',driverName:'Driver B'}]}};
 const result=register.normalize({containers:[{number:'B',status:'DOORING'},{number:'A'}]},before);
 assert.equal(result.containers[0].seal,'sealB');assert.equal(result.containers[0].driverName,'Driver B');assert.equal(result.containers[1].size,'21');
});
test('explicit charges preserve tariff snapshot, propose revenue and submit existing director gates; replay cannot duplicate',async()=>{
 const {tx,state}=store();const bill=await register.create(tx,{id:'staff'},{billNumber:'CHARGE',containers:[{number:'A',size:'20'}]});
 const proposed=[];const approvals=[];const tariff={id:'rate',code:'D20',description:'Dooring 20',category:'DOORING',size:'20',unit:'CONTAINER',unitPrice:'3750000',currency:'IDR',enabled:true,confirmationRequired:false,vatIncluded:true,vatRate:'1.1'};
 tx.jptTariff={findMany:async()=>[tariff]};tx.jobCharge={findFirst:async({where})=>proposed.find(x=>x.tariffKey===where.tariffKey),create:async({data})=>{const row={id:'charge'+proposed.length,...data};proposed.push(row);return row},findUnique:async({where})=>proposed.find(x=>x.id===where.id)};
 tx.directorApproval={findFirst:async()=>null,create:async({data})=>{const row={id:'approval',...data};approvals.push(row);return row}};
 const result=await register.charges(tx,{id:'staff'},bill.id,{version:1,tariffIds:['rate']});
 assert.equal(result.jobId,bill.jobId);assert.equal(proposed[0].status,'PROPOSED');assert.equal(proposed[0].kind,'REVENUE');assert.equal(proposed[0].estimatedAmount.toFixed(2),'3750000.00');assert.equal(proposed[0].tariffSnapshot.line.vatIncluded,true);assert.equal(approvals[0].action,'CHARGE_APPROVE');
 tariff.unitPrice='1';assert.equal(proposed[0].tariffSnapshot.line.unitPrice,'3750000.00');
 await assert.rejects(register.charges(tx,{id:'staff'},bill.id,{version:1,tariffIds:['rate']}),/changed/);
 await assert.rejects(register.charges(tx,{id:'staff'},bill.id,{version:2,tariffIds:['rate']}),/already/);assert.equal(proposed.length,1);
});
test('closure checks every register container even when legacy shipment is marked returned',()=>{
 const bill={containers:[{number:'A'},{number:'B'}],registerData:{containers:[{number:'A',status:'EMPTY_RETURNED',emptyReturnedAt:'2026-10-01'},{number:'B',status:'STRIPPED',freeTimeUntil:'2020-01-01'}]},internalStatus:'SEA_MATCHED',reviewedContentVersion:1,contentVersion:1,releaseStatus:'SEA_RELEASE_CONFIRMED',releaseProofId:'proof',shipmentId:'sea',allocations:[]};
 const job={jobType:'RECEIVER',shipments:[{id:'sea',mode:'SEA',status:'COMPLETED',emptyReturnedAt:new Date()}],seaBills:[bill]};
 assert.throws(()=>sea.checkSeaClosure(job),/every.*container/);
 assert.ok(require('../src/services/jpt').alerts(job).some(row=>row.type==='CONTAINER_OVERDUE'&&row.reference==='B'));
 bill.registerData.containers[1].status='EMPTY_RETURNED';bill.registerData.containers[1].emptyReturnedAt='2026-10-02';assert.doesNotThrow(()=>sea.checkSeaClosure(job));
});
test('tariff charge approval cannot override its immutable snapshot amount',async()=>{
 const {loadAction}=require('../src/services/directorActions');
 const charge={id:'c',jobId:'j',status:'PROPOSED',kind:'REVENUE',estimatedAmount:require('../src/services/jpt').money('100'),tariffSnapshot:{line:{amount:'100.00'}}};
 const tx={jobCharge:{findUnique:async()=>charge},jobOrder:{findUnique:async()=>({id:'j',status:'BOOKED'})}};
 await assert.rejects(loadAction(tx,'CHARGE_APPROVE','c',{actualAmount:'99'}),/snapshot/);
 const prepared=await loadAction(tx,'CHARGE_APPROVE','c',{});assert.equal(prepared.payload.actualAmount,'100.00');
});
test('legacy editor preserves operational extras when submitting only number and seal',async()=>{
 const {tx,state}=store();const row=await register.create(tx,{id:'staff'},{billNumber:'LEGACY',containers:[{number:'A',size:'21',driverName:'Driver'}]});
 state.bills[0].containers=[{number:'A',seal:'s',size:'21',driverName:'Driver'}];tx.seaBillCargo.deleteMany=async()=>({count:0});
 await sea.updateBill(tx,{id:'staff'},row.jobId,row.id,{version:1,containers:[{number:'A',seal:'s'}]});
 assert.equal(state.bills[0].containers[0].size,'21');assert.equal(state.bills[0].containers[0].driverName,'Driver');
});
test('tariff director fingerprint includes current BL operations so pending requests cannot approve stale context',async()=>{
 const {loadAction}=require('../src/services/directorActions');const {digest}=require('../src/services/director');let version=1;
 const tx={jobOrder:{findUnique:async()=>({id:'j',status:'BOOKED'})},jobCharge:{findUnique:async()=>({id:'c',jobId:'j',status:'PROPOSED',kind:'REVENUE',estimatedAmount:require('../src/services/jpt').money(100),tariffSnapshot:{billId:'b',line:{amount:'100.00'}}})},seaBill:{findUnique:async()=>({id:'b',version,registerData:{containers:[{number:'A',status:version===1?'REGISTERED':'DOORING'}]}})}};
 const before=await loadAction(tx,'CHARGE_APPROVE','c',{});version=2;const after=await loadAction(tx,'CHARGE_APPROVE','c',{});assert.notEqual(digest(before.raw),digest(after.raw));
});
test('identity changes use existing matched BL revision-note and invalidation protections',async()=>{
 const {tx,state}=store();const row=await register.create(tx,{id:'staff'},{billNumber:'IDENTITY',containers:[{number:'A',seal:'s'}]});const bill=state.bills[0];
 bill.approvedSnapshot=sea.contentSnapshot(bill);bill.internalStatus='SEA_MATCHED';bill.releaseStatus='SEA_RELEASE_CONFIRMED';
 tx.seaBillCargo.deleteMany=async()=>({count:0});
 await assert.rejects(register.update(tx,{id:'staff'},row.id,{version:1,consigneeName:'Changed'}),/Revision note/);
 assert.equal(bill.version,1);assert.equal(bill.internalStatus,'SEA_MATCHED');
 const saved=await register.update(tx,{id:'staff'},row.id,{version:1,consigneeName:'Changed',revisionNote:'Correct consignee from source'});
 assert.equal(saved.internalStatus,'SEA_UNCHECKED');assert.equal(saved.releaseStatus,'SEA_RELEASE_PENDING');assert.equal(state.documents[0].status,'PENDING');
});
test('register invalid container structure and empty-return state fail validation, not server errors',()=>{
 for(const containers of [{},[null],[{number:'A',status:'EMPTY_RETURNED'}]]) assert.throws(()=>register.normalize({containers}),err=>err.status===422);
});
test('register validates register object, chronological schedule and explicit version before database edits',()=>{
 for(const body of [{register:'bad'},{register:{dateMeaning:'VESSEL',departureDate:'2026-10-02',arrivalDate:'2026-10-01'}}]) assert.throws(()=>register.normalize(body),err=>err.status===422);
});
test('register validates operational containers while preserving unknown legacy size and explicit date meaning',()=>{
 const clean=register.normalize({register:{arrivalDate:'2026-10-01'},containers:[{number:'b',size:'21',status:'DOORING',plannedDeliveryAt:'2026-10-02'},{number:'a'}]});
 assert.equal(clean.register.dateMeaning,'UNCONFIRMED');assert.equal(clean.containers[0].size,'21');assert.equal(clean.containers[1].size,null);
 assert.throws(()=>register.normalize({containers:[{number:'a',size:'22'}]}),/Size/);
 assert.throws(()=>register.normalize({containers:[{number:'a',status:'DONE'}]}),/status/);
 assert.throws(()=>register.normalize({containers:[{number:'a'},{number:'A'}]}),/distinct/);
 assert.throws(()=>register.normalize({containers:[{number:'a',gateOutAt:'2026-10-02',emptyReturnedAt:'2026-10-01'}]}),/chronological/);
});

test('legacy BL editing preserves operational JSON without making operations material BL identity', () => {
  const original = sea.metadata({containers:[{number:'box1',seal:'s',size:'21',status:'DOORING',driverName:'Driver'}]});
  assert.equal(original.containers[0].size,'21');
  assert.equal(original.containers[0].driverName,'Driver');
  const snapshot = sea.contentSnapshot(original);
  assert.deepEqual(snapshot.containers,[{number:'BOX1',seal:'s'}]);
});

test('B/L workspace transcribes variable packing formats and keeps source details independent without rewriting source identity',()=>{
 const workspace=require('../src/services/blWorkspace');
 const bill={containers:[{number:'SPNU1',seal:'SEAL-BL',size:'40'}],files:[{id:'pl',category:'PACKING_LIST'}],packages:2,volumeCbm:require('../src/services/jpt').money('0.3000')};
 const operational=workspace.normalizeOperational({packing:{status:'CONFIRMED',headerStatus:'READY',headerNumber:'KPL-1',sourceFileIds:['pl'],groups:[{sourceFileId:'pl',containerNumber:'SPNU1',sealNumber:'SEAL-PL',size:'40',recipientName:'Penerima Demo',items:[{description:'Paket demo',quantity:'2',packages:2,volumeCbm:'0.3000'}]}]},deadlines:{storageUntil:'2026-04-23',demurrageFrom:'2026-05-02'},unloading:{status:'PENDING'}},bill);
 assert.equal(workspace.reconciliation,undefined);
 assert.equal(operational.packing.groups[0].items[0].description,'Paket demo');assert.equal(operational.packing.groups[0].sealNumber,'SEAL-PL');assert.equal(bill.containers[0].seal,'SEAL-BL');
});

test('B/L workspace requires manual confirmation evidence and discrepancy notes',()=>{
 const workspace=require('../src/services/blWorkspace');const bill={containers:[{number:'C1'}],files:[],packages:0,volumeCbm:0};
 assert.throws(()=>workspace.normalizeOperational({packing:{status:'CONFIRMED',sourceFileIds:[],groups:[]},unloading:{status:'PENDING'}},bill),/Pilih minimal satu PL mitra/);
 assert.throws(()=>workspace.normalizeOperational({packing:{status:'DRAFT',sourceFileIds:[],groups:[]},unloading:{status:'DISCREPANCY',inspectedAt:'2026-10-26',staffName:'Admin'}},bill),/Explain/);
});
