const {fail,text,choice,integer,audit}=require('./jpt');
const workspace=require('./blWorkspace');
function normalize(input,bill){
 fail(input&&typeof input==='object'&&!Array.isArray(input),'Isi data Packing List manual.');
 const status=choice(input.status||'DRAFT',['DRAFT','CONFIRMED'],'Status PL manual'),confirmed=status==='CONFIRMED';
 const basis=text(input.basis,'Dasar pencatatan manual',2000,!confirmed);
 const ids=input.sourceFileIds??[];fail(Array.isArray(ids)&&ids.length<=100&&ids.every(id=>typeof id==='string'&&bill.files.some(f=>f.id===id&&f.filename&&f.category==='SUPPORTING')),'Lampiran manual harus berupa dokumen pendukung pada B/L ini.');
 fail(Array.isArray(input.groups)&&input.groups.length<=200,'Isi maksimal 200 kelompok penerima.');
 if(confirmed)fail(input.groups.length,'Tambahkan minimal satu penerima dan rincian barang sebelum konfirmasi PL manual.');
 const groups=input.groups.map((g,index)=>{
  fail(g&&typeof g==='object'&&Array.isArray(g.items),'Isi kelompok penerima dan barang yang valid.');
  if(confirmed){fail(g.dataLevel==='SUMMARY'||g.items.length,'Isi minimal satu barang atau pilih ringkasan.');fail(g.items.every(i=>i&&i.packages!==''&&i.packages!=null),'Isi jumlah setiap barang. Nol harus dinyatakan secara eksplisit.');}
  const result=workspace.packingGroup(g.dataLevel==='SUMMARY'?{...g,items:[]}:g,index,bill,ids,confirmed);
  result.items=result.items.map((item,n)=>({...item,packages:!confirmed&&(g.items[n].packages===''||g.items[n].packages==null)?null:item.packages}));return result;
 });
 fail(new Set(groups.map(g=>g.id)).size===groups.length&&groups.every(g=>new Set(g.items.map(i=>i.id)).size===g.items.length),'ID kelompok atau barang duplikat. Periksa isian manual.');
 const result={status,basis,notes:text(input.notes,'Catatan manual',2000,true),sourceFileIds:[...new Set(ids)],groups,...(input.comparisonBasis?{comparisonBasis:require('./packingSources').basis(input.comparisonBasis)}:{}),...(input.sourceIdentity?{sourceIdentity:require('./packingSources').sourceIdentity(input.sourceIdentity)}:{}),...(input.sourceHeading?{sourceHeading:text(input.sourceHeading,'Judul sumber',2000,true)}:{})};

 return result;
}
async function save(tx,user,id,body){
 const service=require('./blRegister'),bill=await service.get(tx,id);await require('./seaBills').getBill(tx,bill.jobId,id,integer(body.version,'Version'));
 fail(!bill.archivedAt&&!bill.registerData?.archivedAt,'Pengiriman diarsipkan: hanya baca.',409);
 const source=normalize(body.source,bill),before=bill.registerData?.manualPacking;
 const changed=!before||!require('node:util').isDeepStrictEqual(normalize({...before,status:'DRAFT'},bill),normalize({...source,status:'DRAFT'},bill))||before.status!==source.status;
 const now=new Date().toISOString(),manual={...source,createdAt:before?.createdAt||now,createdById:before?.createdById||user.id,recordedAt:changed?now:before.recordedAt,recordedById:changed?user.id:before.recordedById,recordedByName:changed?user.name||user.id:before.recordedByName};
 const operational=workspace.operationalOf(bill);if(changed){operational.packing.headerStatus='DRAFT';await require('./internalPacking').invalidateHeaders(tx,user,bill);}
 await tx.seaBill.update({where:{id},data:{registerData:JSON.parse(JSON.stringify({...bill.registerData,workflowVersion:2,manualPacking:manual,operational})),version:{increment:1}}});
 await audit(tx,user,'MANUAL_PACKING_SAVED','JobOrder',bill.jobId,{seaBillId:id,before:before||null,manual});
 return service.present(await service.get(tx,id));
}
module.exports={normalize,save};
