const router=require('express').Router();const prisma=require('../prisma');
const {authenticate,authorize}=require('../middleware/auth');const {STAFF,OPERATORS,route,transaction}=require('../services/jpt');
const files=require('../services/jobFiles');const imports=require('../services/blImports');
router.use(authenticate,authorize(...STAFF));
router.post('/',authorize(...OPERATORS),require('../middleware/rateLimiter').uploadLimiter,route(async(req,res)=>{
 let saved=false;try{
  await new Promise((resolve,reject)=>files.upload(req,res,error=>error?reject(error):resolve()));
  // OCR runs outside a database transaction; staging is persisted only after successful parsing.
  const result=await imports.prepare(prisma,req.user,req.file);saved=true;res.status(201).json(result);
 }finally{if(!saved&&req.file)await files.removeFile(req.file.filename);}
}));
router.post('/from-file/:billId/:fileId',authorize(...OPERATORS),require('../middleware/rateLimiter').uploadLimiter,route(async(req,res)=>res.status(201).json(await imports.prepareExisting(prisma,req.user,req.params.billId,req.params.fileId))));
router.get('/:id/file',route(async(req,res)=>{const session=await imports.get(prisma,req.user,req.params.id);res.setHeader('Cache-Control','no-store');await new Promise((resolve,reject)=>res.download(files.filePath(session.filename),session.originalName,error=>error?reject(error):resolve()));}));
router.delete('/:id',route(async(req,res)=>{const filename=await transaction(tx=>imports.cancel(tx,req.user,req.params.id));await require('../services/documentFilePurge').purge(filename);res.json({cancelled:true});}));
module.exports=router;
