const fs=require('node:fs/promises'),{createHash}=require('node:crypto');
const {fail,text,integer,audit,STAFF,choice}=require('./jpt'),files=require('./jobFiles'),imports=require('./blImports'),register=require('./blRegister'),sea=require('./seaBills');
const TYPES=['BILL_OF_LADING','DELIVERY_ORDER','POWER_OF_ATTORNEY','SUPPORTING'];
const KEYS=['billNumber','vesselName','voyageNumber','carrierName','shipperName','consigneeName','notifyPartyName','portOfLoading','portOfDischarge','issueDate','onBoardDate','containers','vesselId','voyageId'];
const cleanNumber=v=>text(v,'Nomor B/L',100).toUpperCase().replace(/\s+/g,'');
async function targets(tx,numbers){const result=[];for(const number of numbers){const found=await tx.seaBill.findMany({where:{AND:[require('./registerLifecycle').notTrashed],OR:[{registerIdentity:number},{billNumber:{equals:number,mode:'insensitive'}}]},select:{id:true,version:true,billNumber:true,journeyId:true,archivedAt:true,vesselName:true,voyageNumber:true,registerData:true,job:{select:{status:true}}},take:3});result.push({number,bills:found.map(({registerData,job,...bill})=>({...bill,deleted:Boolean(registerData?.trash?.deletedAt),archivedAt:bill.archivedAt||registerData?.archivedAt||null,readOnly:Boolean(registerData?.trash?.deletedAt||bill.archivedAt||registerData?.archivedAt||['CLOSED','CANCELLED'].includes(job?.status))}))});}return result;}
async function savedState(tx,saved){
 const bills=await tx.seaBill.findMany({where:{id:{in:saved.billIds}},select:{id:true,journeyId:true,registerData:true,files:{select:{id:true}}}});
 const attached=new Set(bills.flatMap(b=>b.files.map(f=>f.id))),missingFileIds=saved.fileIds.filter(id=>!attached.has(id));
 const createdBillIds=saved.createdBillIds||bills.filter(b=>saved.documentType==='BILL_OF_LADING'&&saved.fileIds.includes(b.registerData?.blSourceData?.fileId)).map(b=>b.id);
 return {...saved,journeyIds:[...new Set(bills.filter(b=>!require('./registerLifecycle').isTrashed(b)).map(b=>b.journeyId).filter(Boolean))],createdBillIds,attachedBillIds:saved.attachedBillIds||saved.billIds.filter(id=>!createdBillIds.includes(id)),trashedBillIds:bills.filter(require('./registerLifecycle').isTrashed).map(b=>b.id),activeBillIds:bills.filter(b=>!require('./registerLifecycle').isTrashed(b)&&b.files.some(f=>saved.fileIds.includes(f.id))).map(b=>b.id),missingFileIds,attachmentsPresent:missingFileIds.length===0};
}
async function present(tx,user,id){const session=await imports.get(tx,user,id);fail(session.extracted?.batch===true,'Bukan sesi unggah massal.',404);const {text:rawText,...extracted}=session.extracted;const references=extracted.referenceBillNumbers||[];return {id:session.id,originalName:session.originalName,mimeType:session.mimeType,expiresAt:session.expiresAt,...extracted,...(extracted.saved?{saved:await savedState(tx,extracted.saved)}:{}),targets:await targets(tx,references)};}
async function prepare(tx,user,file){
 await files.validateAttachment(file);text(file.originalname,'Nama file',255);
 let extracted;
 if(['application/pdf','image/jpeg','image/png'].includes(file.mimetype)){try{const document=await require('./blReader').read(file.path,file.mimetype);extracted=require('./blParser').parse(document);}catch(error){if(error.status!==422)throw error;extracted={parser:'MANUAL_ONLY',documentType:'UNKNOWN',referenceBillNumbers:[],fields:{},pages:[],warnings:['File tersimpan, tetapi pembacaan otomatis gagal. Periksa file asli dan isi manual.',error.message]};}}
 else extracted={parser:'MANUAL_ONLY',documentType:'UNKNOWN',referenceBillNumbers:[],fields:{},pages:[],warnings:['File tersimpan. Jenis dokumen dan nomor B/L tujuan perlu diisi admin.']};
 const hash=createHash('sha256').update(await fs.readFile(file.path)).digest('hex');
 const session=await tx.bLImportSession.create({data:{filename:file.filename,originalName:file.originalname,mimeType:file.mimetype,size:file.size,hash,createdById:user.id,expiresAt:new Date(Date.now()+86400000),extracted:{...extracted,batch:true}}});return present(tx,user,session.id);
}
async function commit(tx,user,body){
 fail(STAFF.includes(user?.role),'Hanya staf internal yang dapat menyimpan dokumen.',403);
 const session=await imports.get(tx,user,body.sessionId),original=session.extracted;fail(original?.batch===true,'Bukan sesi unggah massal.');
 if(original.saved){const saved=await savedState(tx,original.saved);fail(!saved.trashedBillIds.length,'Pengiriman dari unggahan ini sudah dihapus. Unggah kembali file untuk membuat pengiriman baru.',409);fail(saved.attachmentsPresent,'Lampiran dari unggahan ini telah dihapus. Unggah ulang file untuk menambahkannya kembali.',409);return {...saved,reused:true};}
 fail(body.confirmed===true,'Periksa hasil pembacaan dan dokumen asli sebelum menyimpan.');fail(TYPES.includes(body.documentType),'Tentukan jenis dokumen.');
 fail(body.fields==null||typeof body.fields==='object'&&!Array.isArray(body.fields),'Isi isian dokumen yang valid.');fail(body.targets==null||Array.isArray(body.targets)&&body.targets.length<=40&&body.targets.every(t=>t&&typeof t.id==='string'&&Number.isInteger(t.version)),'Periksa daftar tujuan lampiran.');
 if(body.journeyId){const parent=await require('./journeys').get(tx,body.journeyId);require('./journeys').mutable(parent);}
 const type=body.documentType,category=type==='BILL_OF_LADING'?choice(body.category||'FINAL',['DRAFT','FINAL'],'Jenis B/L'):type==='DELIVERY_ORDER'?'DELIVERY_ORDER':'SUPPORTING';
 const fields=Object.fromEntries(KEYS.filter(k=>body.fields?.[k]!==undefined).map(k=>[k,body.fields[k]]));
 if(type==='BILL_OF_LADING')fail(session.mimeType==='application/pdf'||session.mimeType.startsWith('image/'),'Untuk B/L gunakan PDF atau gambar.');
 if(type!=='BILL_OF_LADING')fail(Array.isArray(body.referenceBillNumbers)&&body.referenceBillNumbers.length<=40,'Isi daftar nomor B/L tujuan.');
 const numbers=type==='BILL_OF_LADING'?[cleanNumber(fields.billNumber)]:[...new Set((body.referenceBillNumbers||[]).map(cleanNumber))];
 fail(numbers.length>0&&numbers.length<=40,'Isi 1 sampai 40 nomor B/L tujuan.');
 const linked=await targets(tx,numbers),bills=[],createdBillIds=[];
 let journeyId=body.journeyId,journeyTarget;
 if(body.journeyPlan){
  fail(type==='BILL_OF_LADING'&&!journeyId,'Pengelompokan hanya digunakan untuk B/L baru dari Tambah pengiriman.');
  const existing=linked[0]?.bills.length===1?await register.get(tx,linked[0].bills[0].id):null;
  const resolved=await require('./journeyImports').resolve(tx,user,body.journeyPlan,fields,existing);journeyId=resolved.id;journeyTarget=resolved;
  if(!existing)for(const [key,value]of [['vesselName',resolved.fields.vesselName],['voyageNumber',resolved.fields.voyageNumber],['portOfDischarge',resolved.fields.destination]])if(!fields[key])fields[key]=value;
 }
 for(const target of linked){
  fail(target.bills.length<=1,`Nomor ${target.number} memiliki beberapa pengiriman. Perbaiki nomor sebelum melampirkan.`,409);
  let bill;
  if(type==='BILL_OF_LADING'&&body.action==='CREATE'){
   fail(!target.bills.length,'Nomor B/L sudah tersimpan. Pilih lampirkan ke pengiriman yang ada.',409);
   bill=await register.create(tx,user,{...fields,billNumber:target.number,...(journeyId?{journeyId}:{})});createdBillIds.push(bill.id);
  }else{
   fail(target.bills.length===1,`B/L ${target.number} belum tersimpan. Simpan B/L dahulu lalu ulangi lampiran ini.`,409);
   const expected=(body.targets||[]).find(t=>t.id===target.bills[0].id);fail(expected,`Periksa tujuan lampiran untuk B/L ${target.number}.`,409);
   bill=await register.get(tx,target.bills[0].id);fail(!journeyId||bill.journeyId===journeyId,'B/L sudah berada pada pengiriman lain. Buka pengiriman asalnya.',409);await sea.getBill(tx,bill.jobId,bill.id,integer(expected.version,'Versi'));
   fail(!bill.archivedAt&&!bill.registerData?.archivedAt,'Pengiriman arsip hanya baca.',409);
   if(type==='BILL_OF_LADING')fail(body.action==='ATTACH','Pilih tindakan untuk B/L yang sudah ada.');
  }
  bills.push(bill);
 }
 const result={billIds:[],fileIds:[],journeyIds:[...new Set(bills.map(b=>b.journeyId).filter(Boolean))],...(journeyTarget?{journeyTarget}:{}),documentType:type,createdBillIds,attachedBillIds:bills.filter(b=>!createdBillIds.includes(b.id)).map(b=>b.id)};
 for(const before of bills){
  const bill=await register.get(tx,before.id),previous=(bill.registerData?.documentImports||[]).find(r=>r.hash===session.hash&&r.category===category&&bill.files.some(f=>f.id===r.fileId));
  if(previous){result.billIds.push(bill.id);result.fileIds.push(previous.fileId);continue;}
  await sea.attach(tx,user,bill.jobId,bill.id,{version:bill.version,category,externalNumber:body.documentNumber||null,documentDate:body.documentDate||null,note:type==='POWER_OF_ATTORNEY'?'Surat kuasa; ditautkan berdasarkan nomor B/L oleh admin.':'Unggah massal; hasil pembacaan diperiksa admin.'},{filename:session.filename,originalname:session.originalName,mimetype:session.mimeType,size:session.size});
  const current=await register.get(tx,bill.id),file=current.files.find(f=>f.filename===session.filename&&f.category===category);fail(file,'Lampiran belum tersimpan.',409);
  const entry={hash:session.hash,category,fileId:file.id,parser:original.parser,reviewedById:user.id,reviewedAt:new Date().toISOString()};
  await tx.seaBill.update({where:{id:bill.id},data:{registerData:{...current.registerData,documentImports:[...(current.registerData?.documentImports||[]).slice(-199),entry],...(type==='BILL_OF_LADING'&&body.action==='CREATE'?{blSourceData:{fileId:file.id,parser:original.parser,originalFields:original.fields,reviewedFields:fields,reviewedById:user.id,reviewedAt:entry.reviewedAt}}:{})}}});
  await audit(tx,user,'DOCUMENT_BATCH_SAVED','JobOrder',bill.jobId,{seaBillId:bill.id,fileId:file.id,documentType:type,hash:session.hash,referenceBillNumbers:numbers});result.billIds.push(bill.id);result.fileIds.push(file.id);
 }
 await tx.bLImportSession.update({where:{id:session.id},data:{extracted:{...original,saved:{...result,savedAt:new Date().toISOString()}}}});if(journeyId)await tx.shippingJourney.update({where:{id:journeyId},data:{version:{increment:1}}});return result;
}
module.exports={TYPES,KEYS,prepare,present,commit,targets};
