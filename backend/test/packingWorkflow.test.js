const test=require('node:test');const assert=require('node:assert/strict');
const packing=require('../src/services/internalPacking');const checks=require('../src/services/packingFieldChecks');const workspace=require('../src/services/blWorkspace');
function bill(){return {id:'b',jobId:'j',version:3,files:[{id:'f',filename:'source.docx',originalName:'PL.docx',category:'PACKING_LIST'}],billNumber:'BL-TEST',vesselName:'KM TEST',voyageNumber:'04/26',containers:[{number:'CONT1',seal:'007'}],registerData:{operational:{packing:{status:'CONFIRMED',sourceFileIds:['f'],groups:[{id:'g',sourceFileId:'f',containerNumber:'CONT1',sealNumber:'007',recipientName:'TOKO A',instructions:'Tahan sampai konfirmasi',items:[{id:'i',description:'Barang uji',packages:10,packageUnit:'SAK',volumeCbm:'1.2000'}]}]}}},allocations:[]};}
test('summary-only source preserves unknown quantity and creates no fake detail lines',async()=>{
 const b=bill();b.registerData.operational.packing.groups[0]={...b.registerData.operational.packing.groups[0],dataLevel:'SUMMARY',goodsSummary:'Barang campuran',summaryPackages:null,packageUnit:'KOLI',items:[]};
 const data=packing.snapshot(b,'PARTNER_PL','PL-SUMMARY');assert.equal(data.totals.packages,null);assert.equal(data.totals.volumeCbm,null);assert.equal(data.totals.items,0);assert.equal(checks.rowsOf(data)[0].expectedPackages,null);
 data.outputMode='SUMMARY';data.containers=b.containers;const book=await packing.workbook(data);assert.ok(book.getWorksheet('Ringkasan kontainer'));assert.equal(book.getWorksheet('Pemeriksaan lapangan'),undefined);assert.equal(book.getWorksheet('Ringkasan kontainer').getCell('F6').value,'Belum lengkap KOLI');
});
test('recipient-only source is a valid summary and does not invent a cargo description',()=>{
 const b=bill();b.registerData.operational.packing.groups[0]={...b.registerData.operational.packing.groups[0],dataLevel:'SUMMARY',goodsSummary:'',summaryPackages:null,items:[]};const data=packing.snapshot(b,'PARTNER_PL','PL');assert.equal(data.groups[0].goodsSummary,null);assert.equal(data.groups[0].items.length,0);assert.equal(data.totals.packages,null);assert.ok(data.warnings.some(w=>w.includes('hanya memuat ringkasan')));
});
test('units are not added together and confirmed field forms start with blank actual counts',async()=>{
 const b=bill();b.registerData.operational.packing.groups[0].items.push({id:'i2',description:'Paket',packages:2,packageUnit:'DUS'});const data=packing.snapshot(b,'PARTNER_PL','PL');assert.equal(data.totals.packages,null);assert.deepEqual(data.totals.byUnit,{SAK:10,DUS:2});data.outputMode='BOTH';data.containers=b.containers;const book=await packing.workbook(data);const sheet=book.getWorksheet('Pemeriksaan lapangan');let row;sheet.eachRow(r=>{if(r.getCell(5).value==='Barang uji')row=r;});assert.equal(row.getCell(7).value,10);assert.equal(row.getCell(8).value,null);assert.equal(row.getCell(9).value,null);assert.equal(row.getCell(11).value,null);
});
function fixture(){const b=bill();b.shipment={mode:'SEA',status:'PENDING'};const audit=[];const tx={seaBill:{findUnique:async()=>b,findFirst:async()=>b,update:async({data})=>{for(const[k,v]of Object.entries(data))b[k]=v?.increment?b[k]+v.increment:v;return b;}},jobOrder:{findUnique:async()=>({id:'j',status:'IN_PROGRESS'})},activityLog:{create:async({data})=>audit.push(data)}};return {b,tx,audit};}
const form=b=>{const c=checks.context(b,'PARTNER_PL');return {version:b.version,sourceType:'PARTNER_PL',fingerprint:c.fingerprint,status:'DRAFT',rows:c.rows.map(r=>({key:r.key,actualPackages:null,damagedPackages:null,checked:false})),evidenceFileIds:[]};};
test('draft field check retains null, confirmed results require explicit counts and check marks',async()=>{
 const {b,tx}=fixture();const body=form(b);const result=await checks.save(tx,{id:'admin'},b.id,body);assert.equal(result.inspection.rows[0].actualPackages,null);assert.equal(result.inspection.rows[0].checked,false);
 await assert.rejects(checks.save(tx,{id:'admin'},b.id,{...body,version:b.version,status:'CONFIRMED'}),/setiap baris/);
 const complete={...body,version:b.version,status:'CONFIRMED',inspector:'Petugas',inspectedAt:'2026-10-27T10:00:00Z',rows:[{key:body.rows[0].key,actualPackages:0,damagedPackages:0,checked:true,notes:'Belum ditemukan saat pemeriksaan.'}]};const saved=await checks.save(tx,{id:'admin'},b.id,complete);assert.equal(saved.inspection.rows[0].difference,-10);assert.equal(saved.inspection.rows[0].actualPackages,0);assert.equal(b.registerData.operational.packing.groups[0].items[0].packages,10);
});
test('stale source, duplicate/foreign row IDs, impossible damage and unowned evidence are rejected',async()=>{
 for(const mutate of [v=>v.fingerprint='old',v=>v.rows[0].key='foreign',v=>v.rows[0]={...v.rows[0],actualPackages:2,damagedPackages:3},v=>v.evidenceFileIds=['other-file']]){const {b,tx}=fixture();const body=form(b);mutate(body);await assert.rejects(checks.save(tx,{id:'admin'},b.id,body),e=>[409,422].includes(e.status));}
 const {b,tx}=fixture();const body=form(b);b.containers[0].seal='new';await assert.rejects(checks.save(tx,{id:'admin'},b.id,body),e=>[409,422].includes(e.status));
});
test('confirmed differences need notes; unrelated operation status does not stale the source',async()=>{
 const {b,tx}=fixture();const body=form(b);const old=body.fingerprint;b.containers[0].status='DOORING';assert.equal(checks.context(b,'PARTNER_PL').fingerprint,old);
 await assert.rejects(checks.save(tx,{id:'admin'},b.id,{...body,status:'CONFIRMED',inspector:'Petugas',inspectedAt:'2026-10-27',rows:[{key:body.rows[0].key,actualPackages:9,damagedPackages:0,checked:true}]}),/Jelaskan/);
});
test('normalizing recipient summary keeps instructions and does not compare unknown package totals to B/L',()=>{
 const b=bill();const group={...b.registerData.operational.packing.groups[0],dataLevel:'SUMMARY',goodsSummary:'Ringkasan muatan',summaryPackages:null,items:[]};const normalized=workspace.normalizeOperational({...workspace.operationalOf(b),packing:{status:'CONFIRMED',sourceFileIds:['f'],groups:[group]}},b);assert.equal(normalized.packing.groups[0].instructions,'Tahan sampai konfirmasi');const result=workspace.reconciliation({...b,packages:10},normalized);assert.equal(result.totals.packages,null);assert.ok(!result.issues.includes('PACKAGE_TOTAL_DIFFERENCE'));
});
