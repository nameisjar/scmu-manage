const test=require('node:test');const assert=require('node:assert/strict');
const sea=require('../src/services/seaBills');
const {Prisma}=require('@prisma/client');
const packing={id:'p',recordNumber:'PL-A',externalNumber:'A-001',senderName:'A',recipientName:'SCMU',packages:10,grossWeightKg:'1200',volumeCbm:'6.5'};
const allocation={packingListId:'p',packages:6,grossWeightKg:'720',volumeCbm:'3.9',scope:'Koli 1–6',declaredSnapshot:sea.declared(packing),packingList:packing};
const bill={...sea.metadata({billNumber:'BL-001',packages:6,grossWeightKg:'720',volumeCbm:'3.9'}),contentVersion:1,allocations:[allocation],files:[],shipmentId:'sea',shipment:{mode:'SEA'},internalStatus:'SEA_UNCHECKED'};
test('BL draft metadata rejects duplicate containers and unsafe numeric totals',()=>{
  assert.throws(()=>sea.metadata({containers:[{number:'abc'},{number:'ABC'}]}),/distinct/);
  assert.throws(()=>sea.metadata({grossWeightKg:'0.0001'}),/allowed range/);
  assert.throws(()=>sea.metadata({packages:-1}),/allowed range/);
  assert.equal(sea.metadata({}).billNumber,null);
});
test('partial BL cargo uses decimal balances per leg and rejects foreign or over-allocated packing lists',async()=>{
  const tx={packingList:{findMany:async()=>[packing]},seaBillCargo:{findMany:async()=>[{packingListId:'p',packages:6,grossWeightKg:new Prisma.Decimal(720),volumeCbm:new Prisma.Decimal('3.9')} ]}};
  const result=await sea.allocationData(tx,{id:'job',jobType:'RECEIVER'},'sea','bill',[{packingListId:'p',packages:4,grossWeightKg:'480',volumeCbm:'2.6000',scope:'Koli 7–10'}]);assert.equal(result[0].volumeCbm.toFixed(4),'2.6000');
  await assert.rejects(sea.allocationData(tx,{id:'job',jobType:'RECEIVER'},'sea','bill',[{packingListId:'p',packages:5,grossWeightKg:480,volumeCbm:'2.6',scope:'x'}]),/exceeds/);
  await assert.rejects(sea.allocationData(tx,{id:'job'},'sea','bill',[{packingListId:'p',packages:4,grossWeightKg:480,volumeCbm:'2.6'}]),/marks/);
  tx.packingList.findMany=async()=>[];await assert.rejects(sea.allocationData(tx,{id:'job'},'sea','bill',[{packingListId:'p',packages:1}]),/belong/);
});
test('BL review distinguishes declared differences, changed packing and previously accepted metadata',()=>{
  assert.deepEqual(sea.issues(bill),[]);
  assert.deepEqual(sea.issues({...bill,grossWeightKg:'721'}),['SEA_CARGO_DIFFERENCE']);
  assert.deepEqual(sea.issues({...bill,allocations:[{...allocation,packingList:{...packing,senderName:'B'}}]}),['SEA_PACKING_CHANGED']);
  const approvedSnapshot=sea.contentSnapshot(bill);
  assert.deepEqual(sea.issues({...bill,approvedSnapshot,notes:'Routine note'}),[]);
  assert.deepEqual(sea.issues({...bill,approvedSnapshot,consigneeName:'New recipient'}),['SEA_MATERIAL_CHANGE']);
  assert.deepEqual(sea.issues({...bill,approvedSnapshot,shipment:{mode:'SEA',vesselFlight:'New vessel'}}),['SEA_MATERIAL_CHANGE']);
});
test('uploaded BLs with no transcribed identity or totals use the linked packing cargo and five manual checks',async()=>{
  const uploaded={...bill,...sea.metadata({}),id:'bill',jobId:'job',version:2,files:[{category:'FINAL',contentVersion:1}],allocations:[allocation]};
  assert.deepEqual(sea.issues(uploaded),[]);
  const tx={jobOrder:{findUnique:async()=>({id:'job',jobType:'RECEIVER',status:'IN_PROGRESS'})},seaBill:{findFirst:async()=>uploaded},packingList:{findMany:async()=>[packing]},seaBillCargo:{findMany:async()=>[]}};
  const checks=Object.fromEntries(sea.checkKeys.map(key=>[key,true]));
  const result=await sea.verification(tx,'job','bill',{version:2,checks});assert.equal(result.bill.billNumber,null);assert.equal(result.bill.vesselName,null);assert.deepEqual(result.issues,[]);
  await assert.rejects(sea.verification(tx,'job','bill',{version:2,checks:{}}),/five BL checks/);
  uploaded.files=[];await assert.rejects(sea.verification(tx,'job','bill',{version:2,checks}),/final document/);
});
test('latest document stage and current revision determine receipt; uploading a release proof never counts as a final BL',()=>{
  assert.equal(sea.receipt({...bill,files:[{category:'RELEASE',contentVersion:1}]}),'SEA_NOT_RECEIVED');
  assert.equal(sea.receipt({...bill,files:[{category:'DRAFT',contentVersion:1},{category:'FINAL',contentVersion:1}]}),'SEA_DRAFT_RECEIVED');
  assert.equal(sea.receipt({...bill,files:[{category:'FINAL',contentVersion:1}]}),'SEA_FINAL_RECEIVED');
  assert.equal(sea.receipt({...bill,contentVersion:2,files:[{category:'FINAL',contentVersion:1}]}),'SEA_NOT_RECEIVED');
});
test('receiving closure requires carrier proof separately from internal BL review and rejects changed packing',()=>{
  const job={jobType:'RECEIVER',shipments:[{id:'sea',mode:'SEA',status:'DELIVERED'}],seaBills:[{...bill,internalStatus:'SEA_MATCHED',reviewedContentVersion:1}]};
  assert.throws(()=>sea.checkSeaClosure(job),/release evidence/);
  const complete={...job,seaBills:[{...job.seaBills[0],releaseStatus:'SEA_RELEASE_CONFIRMED',releaseProofId:'proof'}]};assert.doesNotThrow(()=>sea.checkSeaClosure(complete));
  assert.throws(()=>sea.checkSeaClosure({...complete,seaBills:[{...complete.seaBills[0],contentVersion:2}]}),/Verify current/);
  assert.throws(()=>sea.checkSeaClosure({...complete,seaBills:[{...complete.seaBills[0],allocations:[{...allocation,packingList:{...packing,packages:11}}]}]}),/Verify current/);
  assert.doesNotThrow(()=>sea.checkSeaClosure({...job,jobType:'SENDER'}));
  assert.throws(()=>sea.checkSeaClosure({...job,seaBills:[]}),/every active/);
});

test('unstated packing measurements stay unknown in BL links and require exception review',async()=>{
  const source={...packing,grossWeightKg:null,volumeCbm:null};
  const tx={packingList:{findMany:async()=>[source]},seaBillCargo:{findMany:async()=>[]}};
  const [link]=await sea.allocationData(tx,{id:'job',jobType:'RECEIVER'},'sea','bill',[{packingListId:'p',packages:10,grossWeightKg:0,volumeCbm:0}]);
  assert.equal(link.grossWeightKg,null); assert.equal(link.volumeCbm,null);
  const presented=sea.present({...bill,...sea.metadata({}),allocations:[{...link,packingList:source}]});
  assert.deepEqual(presented.issues,['SEA_PACKING_INCOMPLETE']); assert.equal(presented.totals.grossWeightKg,null); assert.equal(presented.totals.knownTotals.grossWeightKg,null);
  assert.equal(sea.contentSnapshot(presented).allocations[0].grossWeightKg,null);
});
