const test=require('node:test'),assert=require('node:assert/strict'),batch=require('../src/services/documentBatch');
function store(){
 const saved={billIds:['bill'],fileIds:['file'],documentType:'BILL_OF_LADING'};
 const bill={id:'bill',version:3,billNumber:'BL1',files:[{id:'file'}],registerData:{blSourceData:{fileId:'file'}},job:{status:'ACTIVE'}};
 const session={id:'session',createdById:'admin',expiresAt:new Date(Date.now()+60000),extracted:{batch:true,fields:{billNumber:'BL1'},referenceBillNumbers:['BL1'],saved}};
 const tx={bLImportSession:{findUnique:async()=>session},seaBill:{findMany:async({where})=>where.AND&&bill.registerData.trash?[]:[bill]}};
 return {tx,bill,session,user:{id:'admin',role:'ADMIN'}};
}
test('saved upload status follows actual attachment deletion and cannot silently replay a deleted file',async()=>{
 const {tx,bill,user}=store();
 let result=await batch.present(tx,user,'session');
 assert.equal(result.saved.attachmentsPresent,true);assert.deepEqual(result.saved.createdBillIds,['bill']);
 assert.deepEqual(result.saved.activeBillIds,['bill']);
 assert.equal((await batch.commit(tx,user,{sessionId:'session'})).reused,true);
 bill.files=[];
 result=await batch.present(tx,user,'session');
 assert.equal(result.saved.attachmentsPresent,false);assert.deepEqual(result.saved.missingFileIds,['file']);assert.deepEqual(result.saved.activeBillIds,[]);
 await assert.rejects(batch.commit(tx,user,{sessionId:'session'}),error=>error.status===409&&/dihapus/.test(error.message));
 await assert.rejects(batch.present(tx,{id:'other'},'session'),error=>error.status===404);
});
test('target lookup exposes a safe read-only summary without sending register data to the client',async()=>{
 const {tx,bill}=store();bill.registerData={archivedAt:'2026-10-01',privateData:'not public'};
 let target=(await batch.targets(tx,['BL1']))[0].bills[0];
 assert.equal(target.readOnly,true);assert.equal(target.archivedAt,'2026-10-01');assert.equal(target.registerData,undefined);assert.equal(target.job,undefined);
 bill.registerData={};bill.job.status='CLOSED';target=(await batch.targets(tx,['BL1']))[0].bills[0];assert.equal(target.readOnly,true);
});
test('uploads linked to trash retain their files but are excluded from active recap selection',async()=>{
 const {tx,bill,user}=store();bill.registerData.trash={deletedAt:'2026-10-30'};
 const row=await batch.present(tx,user,'session');assert.equal(row.saved.attachmentsPresent,true);assert.deepEqual(row.saved.trashedBillIds,['bill']);assert.deepEqual(row.saved.activeBillIds,[]);
 assert.deepEqual(row.targets[0].bills,[]);
 await assert.rejects(batch.commit(tx,user,{sessionId:'session'}),error=>error.status===409&&/Unggah kembali/.test(error.message));
});
test('number lookup ignores trash while preserving active and archive duplicate detection',async()=>{
 const {tx,bill}=store();let where;const find=tx.seaBill.findMany;tx.seaBill.findMany=async query=>{where=query.where;return find(query);};
 bill.registerData.trash={deletedAt:'2026-10-30'};assert.deepEqual((await batch.targets(tx,['BL1']))[0].bills,[]);assert.match(JSON.stringify(where.AND),/trash/);
 delete bill.registerData.trash;bill.archivedAt='2026-10-30';assert.equal((await batch.targets(tx,['BL1']))[0].bills[0].readOnly,true);
 bill.archivedAt=null;assert.equal((await batch.targets(tx,['BL1']))[0].bills[0].id,'bill');
});
