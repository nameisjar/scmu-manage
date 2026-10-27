const router=require('express').Router();const fs=require('node:fs/promises');const {randomUUID}=require('node:crypto');const prisma=require('../prisma');const {route,transaction,fail}=require('../services/jpt');const recap=require('../services/packingRecap');const files=require('../services/jobFiles');
router.post('/packing-recaps/preview',route(async(req,res)=>res.json((await recap.read(prisma,req.body.selection,req.body.recapNumber)).data)));
router.post('/packing-recaps',route(async(req,res)=>{
 fail(req.body.confirmed===true,'Konfirmasi rekap terlebih dahulu.');const {data}=await recap.read(prisma,req.body.selection,req.body.recapNumber);const buffer=await (await recap.workbook(data)).xlsx.writeBuffer();const filename=randomUUID()+'.xlsx';let saved=false;
 try{await fs.writeFile(files.filePath(filename),buffer,{flag:'wx'});await transaction(tx=>recap.save(tx,req.user,req.body,filename,buffer.length,data));saved=true;res.type(require('../services/packingImport').MIME).attachment(data.recapNumber.replace(/[^a-zA-Z0-9_-]/g,'_')+'.xlsx').send(Buffer.from(buffer));}finally{if(!saved)await files.removeFile(filename);}
}));module.exports=router;
