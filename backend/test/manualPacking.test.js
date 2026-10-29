const test=require('node:test'),assert=require('node:assert/strict');
const manual=require('../src/services/manualPacking'),packing=require('../src/services/internalPacking'),checks=require('../src/services/packingFieldChecks');
function bill(){return {id:'b',jobId:'job',version:1,contentVersion:1,billNumber:'BL-100',packages:100,vesselName:'KM UJI',voyageNumber:'01/26',portOfLoading:'Surabaya',portOfDischarge:'Merauke',containers:[{number:'CONT1',seal:'001',size:'40'}],files:[],allocations:[],shipment:{mode:'SEA',status:'PENDING'},registerData:{}};}
function source(){return {status:'CONFIRMED',basis:'Informasi pengirim dikonfirmasi petugas lapangan',sourceFileIds:[],comparisonBasis:{scope:'FULL',billUnit:'KOLI'},groups:[{id:'g',containerNumber:'CONT1',sealNumber:'001',recipientName:'TOKO UJI',instructions:'Ambil sendiri',items:[{id:'i',description:'Barang manual',packages:98,packageUnit:'KOLI',volumeCbm:'1.2'}]}]};}
const attach=b=>b.registerData.manualPacking={...manual.normalize(source(),b),recordedAt:'2026-10-28T01:00:00Z',recordedById:'admin',recordedByName:'Admin SCMU'};
function fixture(){const b=bill(),audit=[];return {b,audit,tx:{seaBill:{findUnique:async()=>b,findFirst:async()=>b,update:async({data})=>{for(const[k,v]of Object.entries(data))b[k]=v?.increment?b[k]+v.increment:v;return b;}},jobOrder:{findUnique:async()=>({id:'job',status:'IN_PROGRESS'})},activityLog:{create:async({data})=>audit.push(data)}}};}
test('blank partner draft counts stay unknown while explicit zero stays zero',()=>{
 const workspace=require('../src/services/blWorkspace'),b=bill(),input=workspace.defaultOperational();input.packing.groups=[{...source().groups[0],items:[{id:'blank',description:'Unknown',packages:''},{id:'zero',description:'Zero',packages:0}]}];
 const result=workspace.normalizeOperational(input,b).packing;assert.equal(result.groups[0].items[0].packages,null);assert.equal(result.groups[0].items[1].packages,0);
 assert.equal(result.groups[0].items[0].packages,null);
});
test('manual PL without attachments preserves actor, basis and 98 PL vs 100 BL vs 97 actual',async()=>{
 const b=bill();attach(b);const before=JSON.stringify(b.containers),data=packing.snapshot(b,'MANUAL','PL-MANUAL');
 assert.equal(data.groups[0].items[0].expectedPackages,98);assert.equal(data.manual.recordedByName,'Admin SCMU');assert.equal(data.sources.length,0);
 assert.equal(checks.context(b,'MANUAL').rows[0].expectedPackages,98);assert.equal(b.packages,100);assert.equal(JSON.stringify(b.containers),before);
 data.outputMode='BOTH';data.containers=b.containers;const book=await packing.workbook(data);assert.match(book.getWorksheet('Ringkasan kontainer').getCell('A4').value,/Input manual.*Informasi pengirim.*Admin SCMU/);
});
test('mixed source units remain separate without comparing totals to BL',()=>{
 const b=bill();attach(b);b.registerData.manualPacking.groups[0].items.push({id:'dus',description:'Dus',packages:2,packageUnit:'DUS'});const data=packing.snapshot(b,'MANUAL','PL');assert.deepEqual(data.totals.byUnit,{KOLI:98,DUS:2});assert.equal(data.totals.packages,null);assert.equal(b.packages,100);
});
test('manual confirmation needs a basis, nonempty groups, explicit counts and valid file ownership',()=>{
 for(const mutate of [s=>s.basis='',s=>s.groups=[],s=>s.groups[0].items[0].packages='',s=>s.groups[0].items[0].description='',s=>s.sourceFileIds=['foreign'],s=>s.groups.push(structuredClone(s.groups[0]))]){const b=bill(),s=source();mutate(s);assert.throws(()=>manual.normalize(s,b));}
 const b=bill(),s=source();s.status='DRAFT';s.groups[0].items[0].packages='';assert.equal(manual.normalize(s,b).groups[0].items[0].packages,null);
 b.files=[{id:'f',category:'INTERNAL_PACKING_LIST',filename:'derived.xlsx'}];s.sourceFileIds=['f'];assert.throws(()=>manual.normalize(s,b),/pendukung/);
});
test('source review preserves different identities without a BL gate',()=>{
 const b=bill(),s=source();s.groups[0].containerNumber='FOREIGN';s.groups[0].sealNumber='999';b.registerData.manualPacking={...manual.normalize(s,b),recordedAt:'2026-10-28T01:00:00Z'};const data=packing.snapshot(b,'MANUAL','PL');assert.equal(data.groups[0].containerNumber,'FOREIGN');assert.equal(data.groups[0].sealNumber,'999');assert.equal(b.containers[0].seal,'001');assert.equal(data.comparison,undefined);
});
test('manual provenance is server-owned, stable on identical saves, versioned and audited',async()=>{
 const {b,tx,audit}=fixture(),user={id:'admin',name:'Admin SCMU'};
 await manual.save(tx,user,b.id,{version:1,source:{...source(),recordedById:'attacker',recordedAt:'2000-01-01'}});
 const stamp=b.registerData.manualPacking.recordedAt;assert.equal(b.registerData.manualPacking.recordedById,user.id);assert.equal(b.packages,100);assert.equal(audit[0].action,'MANUAL_PACKING_SAVED');
 await manual.save(tx,{id:'other',name:'Other'},b.id,{version:b.version,source:b.registerData.manualPacking});assert.equal(b.registerData.manualPacking.recordedAt,stamp);assert.equal(b.registerData.manualPacking.recordedById,user.id);
 await assert.rejects(manual.save(tx,user,b.id,{version:1,source:source()}),e=>e.status===409);
});
test('manual inspection has independent actuals and becomes stale when declared source or comparison basis changes',async()=>{
 const {b,tx}=fixture();attach(b);const c=checks.context(b,'MANUAL');
 await checks.save(tx,{id:'admin'},b.id,{version:b.version,sourceType:'MANUAL',fingerprint:c.fingerprint,status:'CONFIRMED',inspector:'Petugas',inspectedAt:'2026-10-28T09:00:00Z',evidenceFileIds:[],rows:[{key:c.rows[0].key,actualPackages:97,damagedPackages:1,checked:true,notes:'Satu koli kurang dan satu rusak'}]});
 assert.equal(b.registerData.manualPacking.groups[0].items[0].packages,98);assert.equal(b.packages,100);assert.equal(checks.status(b),'CONFIRMED');
 b.registerData.manualPacking.groups[0].items[0].packages=99;assert.equal(checks.status(b),'STALE');
});
test('summary source remains printable without fabricated detailed items',()=>{
 const b=bill();attach(b);b.registerData.manualPacking.groups[0]={...b.registerData.manualPacking.groups[0],dataLevel:'SUMMARY',summaryPackages:null,packageUnit:'KOLI',items:[]};const data=packing.snapshot(b,'MANUAL','PL');assert.equal(data.groups[0].items.length,0);assert.equal(data.totals.packages,null);
});
