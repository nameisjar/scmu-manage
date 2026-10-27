const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { fail, audit, text } = require('./jpt');
const files = require('./jobFiles');
async function get(tx, user, id) {
 id=text(id,'Sesi unggahan',100);
 const session = await tx.bLImportSession.findUnique({where:{id}});
 fail(session && session.createdById===user.id,'Pratinjau unggahan tidak ditemukan.',404);
 fail(session.expiresAt>new Date(),'Pratinjau kedaluwarsa. Unggah ulang dokumen.',410);return session;
}
async function prepare(tx,user,file) {
 await files.validateFile(file);fail(['application/pdf','image/jpeg','image/png'].includes(file.mimetype),'Gunakan PDF, JPEG, atau PNG.',415);
 text(file.originalname,'Nama file',255);
 const document = await require('./blReader').read(file.path,file.mimetype);
 const extracted = require('./blParser').parse(document);
 const hash = createHash('sha256').update(await fs.readFile(file.path)).digest('hex');
 const match=await require('./vessels').match(tx,extracted.fields.vesselName,extracted.fields.voyageNumber);
 const duplicate=extracted.fields.billNumber?await tx.seaBill.findFirst({where:{registerIdentity:extracted.fields.billNumber.toUpperCase()},select:{id:true,billNumber:true}}):null;
 const session = await tx.bLImportSession.create({data:{filename:file.filename,originalName:file.originalname,mimeType:file.mimetype,size:file.size,hash,createdById:user.id,extracted,expiresAt:new Date(Date.now()+86400000)}});
 return {id:session.id,originalName:session.originalName,expiresAt:session.expiresAt,...extracted,match,duplicate};
}
async function cancel(tx,user,id) {
 const session=await tx.bLImportSession.findUnique({where:{id}});fail(session&&session.createdById===user.id,'Pratinjau unggahan tidak ditemukan.',404);
 await tx.bLImportSession.delete({where:{id}});await tx.documentFilePurge.upsert({where:{filename:session.filename},create:{filename:session.filename},update:{}});return session.filename;
}
async function save(tx,user,id,body) {
 const register=require('./blRegister');const sea=require('./seaBills');
 if(!body.importSessionId)return id?register.update(tx,user,id,body):register.create(tx,user,body);
 fail(body.importConfirmed===true,'Periksa dan konfirmasi hasil pembacaan B/L.');
 fail(['DRAFT','FINAL'].includes(body.importCategory),'Pilih jenis dokumen B/L.');
 const session=await get(tx,user,body.importSessionId);
 const result=id?await register.update(tx,user,id,body):await register.create(tx,user,body);
 await sea.attach(tx,user,result.jobId,result.id,{version:result.version,category:body.importCategory,note:'Sumber pengisian B/L; hasil pembacaan dikonfirmasi admin.'},{filename:session.filename,originalname:session.originalName,mimetype:session.mimeType,size:session.size});
 const bill=await register.get(tx,result.id);
 await tx.seaBill.update({where:{id:bill.id},data:{registerData:{...bill.registerData,blImport:{hash:session.hash,parser:session.extracted.parser,importedById:user.id,importedAt:new Date().toISOString(),sessionId:session.id}}}});
 await tx.bLImportSession.delete({where:{id:session.id}});
 await audit(tx,user,'BL_IMPORT_CONFIRMED','JobOrder',bill.jobId,{seaBillId:bill.id,hash:session.hash,parser:session.extracted.parser});
 return register.present(await register.get(tx,bill.id));
}
module.exports={get,prepare,cancel,save};
