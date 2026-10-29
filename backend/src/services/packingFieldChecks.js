const {createHash}=require('node:crypto');
const {fail,text,integer,choice,date,audit}=require('./jpt');
const packing=require('./internalPacking');
function rowsOf(data){return data.groups.flatMap(g=>g.dataLevel==='SUMMARY'?[{key:`group:${g.id}`,groupId:g.id,containerNumber:g.containerNumber,seal:g.sealNumber,recipient:g.recipientName,description:g.goodsSummary,expectedPackages:g.summaryPackages??null,unit:g.packageUnit||'KOLI',instructions:g.instructions||g.notes||null}]:g.items.map(i=>({key:`item:${g.id}:${i.id}`,groupId:g.id,containerNumber:g.containerNumber,seal:g.sealNumber,recipient:g.recipientName,description:i.description,expectedPackages:i.expectedPackages??(data.sourceType==='PARTNER_PL'?i.packages:null),sourceActual:data.sourceType==='RECEIVING_REPORT'?i.packages:null,unit:i.packageUnit||'KOLI',instructions:[g.instructions,g.notes,i.marks].filter(Boolean).join('; ')})));}
function context(bill,sourceType){
 const data=packing.snapshot(bill,sourceType,'LEMBAR-PEMERIKSAAN'),rows=rowsOf(data),managed=require('./shipmentWorkflow').managed(bill);
 const full=managed?packing.snapshot(bill,sourceType,'LEMBAR-PEMERIKSAAN',{ignoreSelection:true}):data;
 return {data,rows,fingerprint:createHash('sha256').update((managed?JSON.stringify({billId:bill.id,sourceType,groups:full.groups,sources:full.sources,manual:full.manual}):data.fingerprint)+JSON.stringify(rowsOf(full))).digest('hex')};
}
function currentInspection(bill,sourceType,current=context(bill,sourceType)){
 const saved=bill.registerData?.packingFieldCheck;if(!saved||saved.sourceType!==sourceType||saved.fingerprint!==current.fingerprint)return null;
 const rows=current.rows.map(source=>saved.rows.find(r=>r.key===source.key)||{...source,actualPackages:null,damagedPackages:null,checked:false,notes:null,difference:null});
 return {...saved,rows,status:saved.status==='CONFIRMED'&&rows.every(r=>r.checked&&r.actualPackages!=null&&r.damagedPackages!=null)?'CONFIRMED':'DRAFT'};
}
async function get(tx,id,sourceType){const bill=await require('./blRegister').get(tx,id),current=context(bill,sourceType),inspection=currentInspection(bill,sourceType,current),saved=bill.registerData?.packingFieldCheck;return {...current,version:bill.version,inspection,previousInspection:!inspection?saved||null:null};}
async function save(tx,user,id,body){
 const bill=await require('./blRegister').get(tx,id);await require('./seaBills').getBill(tx,bill.jobId,id,integer(body.version,'Version'));fail(!bill.archivedAt&&!bill.registerData?.archivedAt,'Pengiriman diarsipkan: hanya baca.',409);
 const current=context(bill,body.sourceType);fail(body.fingerprint===current.fingerprint,'Rincian sumber berubah. Muat ulang lembar pemeriksaan.',409);
 const status=choice(body.status||'DRAFT',['DRAFT','CONFIRMED'],'Status pemeriksaan');const confirmed=status==='CONFIRMED';
 fail(Array.isArray(body.rows)&&body.rows.length===current.rows.length&&new Set(body.rows.map(r=>r?.key)).size===body.rows.length,'Isi hasil untuk setiap baris pemeriksaan.');
 const optional=(v,label)=>v==null||v===''?null:integer(v,label,0,1000000);
 const rows=current.rows.map(source=>{const row=body.rows.find(r=>r?.key===source.key);fail(row,'Baris pemeriksaan tidak sesuai sumber.');
  const actualPackages=optional(row.actualPackages,'Jumlah aktual');const damagedPackages=optional(row.damagedPackages,'Jumlah rusak');
  fail(damagedPackages==null||actualPackages!=null&&damagedPackages<=actualPackages,'Jumlah rusak harus bagian dari jumlah aktual.');
  fail(row.checked===undefined||typeof row.checked==='boolean','Tanda diperiksa harus benar atau salah.');
  if(confirmed)fail(row.checked===true&&actualPackages!=null&&damagedPackages!=null,'Periksa setiap baris dan isi jumlah aktual serta rusak. Nol harus diisi secara eksplisit.');
  const difference=source.expectedPackages==null||actualPackages==null?null:actualPackages-source.expectedPackages;
  const notes=text(row.notes,'Catatan pemeriksaan',2000,true);if(confirmed&&(damagedPackages>0||difference!=null&&difference!==0))fail(notes,'Jelaskan barang kurang, lebih, atau rusak.');
  return {...source,actualPackages,damagedPackages,difference,checked:row.checked===true,notes};
 });
 const evidenceFileIds=body.evidenceFileIds??[];fail(Array.isArray(evidenceFileIds)&&evidenceFileIds.length<=50&&evidenceFileIds.every(id=>bill.files.some(f=>f.id===id)),'Pilih bukti yang terlampir pada pengiriman ini.');
 const inspector=text(body.inspector,'Petugas pemeriksa',200,!confirmed);const inspectedAt=date(body.inspectedAt,!confirmed)?.toISOString()||null;
 const inspection={schema:1,status,sourceType:body.sourceType,fingerprint:current.fingerprint,rows,inspector,inspectedAt,evidenceFileIds:[...new Set(evidenceFileIds)],savedById:user.id,savedAt:new Date().toISOString()};
 await tx.seaBill.update({where:{id},data:{registerData:JSON.parse(JSON.stringify({...bill.registerData,packingFieldCheck:inspection})),version:{increment:1}}});
 await audit(tx,user,'PACKING_FIELD_CHECK_SAVED','JobOrder',bill.jobId,{seaBillId:id,before:bill.registerData?.packingFieldCheck||null,inspection});return {inspection,version:bill.version+1};
}
function status(bill){const saved=bill.registerData?.packingFieldCheck;if(!saved)return 'NOT_STARTED';try{return currentInspection(bill,saved.sourceType)?.status||'STALE';}catch{return 'STALE';}}
module.exports={rowsOf,context,currentInspection,get,save,status};
