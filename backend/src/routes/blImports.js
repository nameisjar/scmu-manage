const router=require('express').Router();const prisma=require('../prisma');
const {authenticate,authorize}=require('../middleware/auth');const {STAFF,OPERATORS,route,transaction}=require('../services/jpt');
const files=require('../services/jobFiles');const imports=require('../services/blImports');
router.use(authenticate,authorize(...STAFF));
// The client queues a multiple-file selection one file at a time so each result,
// failure and cancellation is visible, without a long multi-file HTTP request.
router.post('/batch/file',authorize(...OPERATORS),require('../middleware/rateLimiter').batchUploadLimiter,route(async(req,res)=>{let saved=false;try{await new Promise((resolve,reject)=>files.uploadAny(req,res,error=>error?reject(error):resolve()));const data=await require('../services/documentBatch').prepare(prisma,req.user,req.file);saved=true;res.status(201).json(data);}finally{if(!saved&&req.file)await files.removeFile(req.file.filename);}}));
router.get('/batch/:id',route(async(req,res)=>res.json(await require('../services/documentBatch').present(prisma,req.user,req.params.id))));
router.post('/batch/commit',authorize(...OPERATORS),route(async(req,res)=>res.json(await transaction(tx=>require('../services/documentBatch').commit(tx,req.user,req.body)))));
router.post('/batch/journeys/preview',route(async(req,res)=>res.json(await transaction(tx=>require('../services/journeyImports').preview(tx,req.user,req.body)))));
router.post('/batch/targets',route(async(req,res)=>{require('../services/jpt').fail(Array.isArray(req.body.numbers)&&req.body.numbers.length>0&&req.body.numbers.length<=40&&req.body.numbers.every(n=>typeof n==='string'&&n.length<=100),'Isi nomor B/L tujuan.');res.json(await require('../services/documentBatch').targets(prisma,[...new Set(req.body.numbers.map(n=>n.trim().toUpperCase().replace(/\s+/g,'')))]));}));
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
