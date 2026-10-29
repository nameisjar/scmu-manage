const test=require('node:test');const assert=require('node:assert/strict');
const register=require('../src/services/blRegister');

test('normal lists and all exports exclude trash; trash has a distinct reversible view',async()=>{
 const {registerQuery}=require('../src/services/registerQuery');
 for(const archived of ['active','archived','all']){const result=await registerQuery({}, {archived});assert.match(JSON.stringify(result.where),/trash/);assert.match(JSON.stringify(result.archiveWhere),/trash/);}
 const trash=await registerQuery({}, {archived:'trash'});assert.deepEqual(trash.archiveWhere,require('../src/services/registerLifecycle').trashed);
});

test('list filters neutral party, voyage, creation dates, archive, documents and whitelist sort',async()=>{
 const calls=[];const sql=[];const tx={seaBill:{count:async()=>0,findMany:async q=>{calls.push(q);return []}},$queryRaw:async statement=>{sql.push(statement.sql);return []}};
 await register.list(tx,{search:'needle',voyage:'V01',company:'PT Party',dateFrom:'2026-10-01',dateTo:'2026-10-31',documents:'BL_MISSING',sort:'registerAmount',direction:'asc'});
 const query=calls.at(-1);const where=JSON.stringify(query.where);
 for(const key of ['voyageNumber','portOfLoading','createdAt','archivedAt','files']) assert.match(where,new RegExp(key));
 for(const key of ['partyName','customerName'])assert.match(sql.join(' '),new RegExp(key));
 assert.match(where,/PT Party/);assert.match(where,/V01/);assert.match(where,/2026-11-01/);
 assert.deepEqual(query.orderBy,[{registerAmount:'asc'},{id:'asc'}]);
 for(const query of [{dateFrom:'2023-02-31'},{dateTo:'2026-10-01',dateFrom:'2026-10-02'},{sort:'DROP TABLE'},{direction:'sideways'},{archived:'bad'},{documents:'bad'}]) await assert.rejects(register.list(tx,query),err=>err.status===422);
});
