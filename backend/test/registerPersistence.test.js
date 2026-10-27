const test=require('node:test');
const assert=require('node:assert/strict');
const register=require('../src/services/blRegister');
function store() {
 const state={jobs:[],shipments:[],bills:[],documents:[],logs:[]};
 const model=key=>({create:async({data})=>{const row={id:key+state[key].length,version:1,files:[],allocations:[],history:[],contentVersion:1,internalStatus:'SEA_UNCHECKED',releaseStatus:'SEA_RELEASE_PENDING',...data};state[key].push(row);return row},findUnique:async({where})=>state[key].find(x=>x.id===where.id),findFirst:async({where})=>state[key].find(x=>Object.entries(where).every(([k,v])=>typeof v==='object'?v.equals?String(x[k]).toLowerCase()===v.equals.toLowerCase():true:x[k]===v)),findMany:async()=>state[key],update:async({where,data})=>{const row=state[key].find(x=>x.id===where.id);for(const [k,v]of Object.entries(data))row[k]=v&&v.increment?row[k]+v.increment:v;return row}});
 const tx={jobOrder:model('jobs'),shipment:model('shipments'),seaBill:model('bills'),jobDocument:model('documents'),activityLog:model('logs'),packingList:{findMany:async()=>[]},seaBillCargo:{findMany:async()=>[],deleteMany:async()=>({count:0})},seaBillRevision:{create:async()=>({})},company:{findUnique:async()=>({id:'scmu',isInternal:true,isActive:true,name:'SCMU'})}};
 const find=tx.seaBill.findUnique;tx.seaBill.findUnique=async q=>{const row=await find(q);if(row){row.shipment=state.shipments.find(x=>x.id===row.shipmentId);row.job=state.jobs.find(x=>x.id===row.jobId);row.allocations=[];}return row};
 tx.seaBill.findFirst=async({where})=>where.id?tx.seaBill.findUnique({where}):state.bills.find(x=>Object.entries(where).filter(([k])=>k!=='id').every(([k,v])=>typeof v==='object'?String(x[k]).toLowerCase()===v.equals?.toLowerCase():x[k]===v));
 return {tx,state};
}

test('neutral amount persists as exact Decimal and is fixed-two string after create, edit and reload without finance writes',async()=>{
 const {tx,state}=store();
 let result=await register.create(tx,{id:'staff',role:'ADMIN'},{billNumber:'001',registerAmount:'9999999999999999.99',register:{partyName:'Party',quantity21:7},containers:[]});
 assert.equal(state.bills[0].registerAmount.toFixed(2),'9999999999999999.99');
 assert.equal(result.registerAmount,'9999999999999999.99');
 assert.equal(result.amountMeaning,'UNCONFIRMED');
 assert.equal(result.register.quantity20,null);
 assert.equal(result.register.quantity21,7);
 const identity=result.registerNumber;
 result=await register.update(tx,{id:'staff'},result.id,{version:result.version,registerAmount:'12.3',register:{reference1:'001'}});
 assert.equal(result.registerAmount,'12.30');assert.equal(result.register.quantity21,7);assert.equal(result.register.partyName,'Party');assert.equal(result.registerNumber,identity);
 result=await register.update(tx,{id:'staff'},result.id,{version:result.version,registerAmount:''});
 assert.equal(result.registerAmount,null);assert.equal(register.present(await register.get(tx,result.id)).register.reference1,'001');
 assert.equal(state.jobs.length,1);assert.equal(state.documents.length,1);
});

test('invalid optional amount and register identity edits fail before writes; historic identity stays unchanged',async()=>{
 const {tx,state}=store();let row=await register.create(tx,{id:'staff'},{billNumber:'ONE'});
 for(const registerNumber of ['',null,' ']) await assert.rejects(register.update(tx,{id:'staff'},row.id,{version:row.version,registerNumber}),err=>err.status===422);
 for(const registerAmount of [12.3,'1.234','10000000000000000',{},true,'NaN','1e2']) await assert.rejects(register.create(tx,{id:'staff'},{billNumber:'BAD',registerAmount}),err=>err.status===422);
 assert.equal(state.jobs.length,1);
 const historic=state.bills[0];historic.registerNumber=null;
 row=await register.update(tx,{id:'staff'},row.id,{version:row.version,register:{partyText:'keep historic'}});
 assert.equal(row.registerNumber,null);
 await register.create(tx,{id:'staff'},{billNumber:'TWO',registerNumber:'EXPLICIT'});
 await assert.rejects(register.update(tx,{id:'staff'},row.id,{version:row.version,registerNumber:'EXPLICIT'}),err=>err.status===409);
 assert.equal(state.bills[0].registerNumber,null);
});

test('archive and restore are role-authorized, version locked, audited and non-destructive',async()=>{
 const {tx,state}=store();let row=await register.create(tx,{id:'staff'},{billNumber:'ARCHIVE',registerAmount:'5.00'});
 for(const role of ['CUSTOMER','VIEWER','DIRECTOR']) await assert.rejects(register.archive(tx,{id:'bad',role},row.id,{version:1,archived:true}),err=>err.status===403);
 await assert.rejects(register.archive(tx,{id:'staff',role:'ADMIN'},row.id,{version:1,archived:'true'}),err=>err.status===422);
 row=await register.archive(tx,{id:'staff',role:'ADMIN'},row.id,{version:1,archived:true});
 assert.ok(row.archivedAt);assert.equal(row.archivedById,'staff');assert.equal(row.version,2);assert.equal(row.registerAmount,'5.00');
 assert.equal(state.bills.length,1);assert.ok(state.logs.some(row=>row.action==='BL_REGISTER_ARCHIVED'));
 await assert.rejects(register.archive(tx,{id:'director',role:'SUPER_ADMIN'},row.id,{version:1,archived:false}),err=>err.status===409);
 await assert.rejects(register.update(tx,{id:'staff'},row.id,{version:2,notes:'blocked'}),err=>err.status===409);
 row=await register.archive(tx,{id:'director',role:'SUPER_ADMIN'},row.id,{version:2,archived:false});
 assert.equal(row.archivedAt,null);assert.equal(row.archivedById,null);assert.equal(row.version,3);
 assert.ok(state.logs.some(row=>row.action==='BL_REGISTER_RESTORED'));
});
