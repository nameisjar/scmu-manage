const express = require('express');
const prisma = require('../prisma');
const { route, fail, transaction, mutableJob, OPERATORS } = require('../services/jpt');
const { authorize } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const files = require('../services/jobFiles');
const sea = require('../services/seaBills');
const router = express.Router({ mergeParams: true });
router.use(authorize(...OPERATORS));
router.get('/', route(async (req,res) => {
  const job = await prisma.jobOrder.findUnique({ where: { id: req.params.jobId }, select: { id:true, jobType:true } }); fail(job, 'Job order not found', 404);
  const data = await prisma.seaBill.findMany({ where: { jobId: job.id }, include: sea.seaInclude, orderBy: { createdAt: 'asc' } });
  const ids = [...new Set(data.flatMap(bill=>[bill.reviewedById,bill.releasedById,...bill.history.map(row=>row.createdById),...bill.files.map(row=>row.uploadedById)]).filter(Boolean))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id:true,name:true } });
  const packingLists = await prisma.packingList.findMany({ where: { jobId:job.id, direction: job.jobType==='RECEIVER'?'INBOUND':'OUTBOUND' }, select: sea.CARGO_SELECT, orderBy: { createdAt:'asc' } });
  res.json({ data:data.map(sea.present), packingLists, users });
}));
router.post('/', route(async (req,res) => { const bill = await transaction(tx=>sea.createBill(tx,req.user,req.params.jobId,req.body)); res.status(201).json(sea.present(bill)); }));
router.post('/upload', uploadLimiter, route(async (req,res) => {
  await mutableJob(prisma,req.params.jobId);
  await new Promise((resolve,reject)=>files.upload(req,res,error=>error?reject(error):resolve()));
  try {
    await files.validateFile(req.file);
    let body;try{body=JSON.parse(req.body.data);}catch{fail(false,'Upload details must be valid JSON');}
    fail(body&&typeof body==='object'&&!Array.isArray(body),'Upload details must be valid JSON');
    fail(['DRAFT','FINAL'].includes(body.category||'FINAL'),'Upload a BL draft or final document');
    const result=await transaction(async tx=>{
      const bill=body.billId ? await sea.getBill(tx,req.params.jobId,body.billId,body.version) : await sea.createBill(tx,req.user,req.params.jobId,body);
      return sea.attach(tx,req.user,req.params.jobId,bill.id,{...body,category:body.category||'FINAL',version:bill.version},req.file);
    });
    res.status(201).json(sea.present(result));
  }catch(error){if(req.file)await files.removeFile(req.file.filename);throw error;}
}));
router.put('/:billId', route(async (req,res) => res.json(sea.present(await transaction(tx=>sea.updateBill(tx,req.user,req.params.jobId,req.params.billId,req.body))))));
router.post('/:billId/files', uploadLimiter, route(async (req,res) => {
  await mutableJob(prisma,req.params.jobId);
  fail(await prisma.seaBill.count({ where:{id:req.params.billId,jobId:req.params.jobId} }), 'Sea transport document not found',404);
  await new Promise((resolve,reject)=>files.upload(req,res,error=>error?reject(error):resolve()));
  try {
    await files.validateFile(req.file);
    const result=await transaction(tx=>sea.attach(tx,req.user,req.params.jobId,req.params.billId,req.body,req.file));
    res.status(201).json(sea.present(result));
  } catch(error) { if(req.file)await files.removeFile(req.file.filename);throw error; }
}));
router.get('/:billId/files/:fileId', route(async (req,res) => {
  const file=await prisma.seaBillFile.findFirst({where:{id:req.params.fileId,billId:req.params.billId,bill:{jobId:req.params.jobId}}});fail(file,'Document file not found',404);
  res.download(files.filePath(file.filename),file.originalName);
}));
for(const [endpoint,operation] of [['verify',sea.verify],['correction',sea.correction],['release',sea.confirmRelease]]) {
  router.post(`/:billId/${endpoint}`,route(async(req,res)=>res.json(sea.present(await transaction(tx=>operation(tx,req.user,req.params.jobId,req.params.billId,req.body))))));
}
module.exports=router;
