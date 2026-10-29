const router=require('express').Router();
const prisma=require('../prisma');
const {authorize}=require('../middleware/auth');
const {STAFF,route,transaction,fail,text}=require('../services/jpt');
const {pageOptions,pageMeta}=require('../services/pagination');
const service=require('../services/vessels');
router.use(authorize(...STAFF));
router.get('/',route(async(req,res)=>{
 const search=String(req.query.search||'').trim();const active=req.query.active;
 const where={...(active==='true'?{isActive:true}:active==='false'?{isActive:false}:{}),...(search?{OR:[{name:{contains:search,mode:'insensitive'}},{carrierName:{contains:search,mode:'insensitive'}},{aliases:{some:{name:{contains:search,mode:'insensitive'}}}}]}:{})};
 const total=await prisma.vessel.count({where});const meta=pageMeta(total,pageOptions(req.query));
 res.json({...meta,data:await prisma.vessel.findMany({where,include:service.include,orderBy:[{name:'asc'},{id:'asc'}],skip:(meta.page-1)*meta.limit,take:meta.limit})});
}));
router.post('/',route(async(req,res)=>res.status(201).json(await transaction(tx=>service.save(tx,req.user,null,req.body)))));
router.get('/:id',route(async(req,res)=>res.json(await service.get(prisma,req.params.id))));
router.put('/:id',route(async(req,res)=>res.json(await transaction(tx=>service.save(tx,req.user,req.params.id,req.body)))));
router.get('/:id/voyages',route(async(req,res)=>{
 await service.get(prisma,req.params.id);const where={vesselId:req.params.id,...(req.query.active==='true'?{isActive:true}:{})};
 const total=await prisma.voyage.count({where});const meta=pageMeta(total,pageOptions(req.query));
 res.json({...meta,data:await prisma.voyage.findMany({where,include:{_count:{select:{bills:{where:require('../services/registerLifecycle').notTrashed}}}},orderBy:[{period:'desc'},{number:'asc'},{id:'asc'}],skip:(meta.page-1)*meta.limit,take:meta.limit})});
}));
router.post('/:id/voyages',route(async(req,res)=>res.status(201).json(await transaction(tx=>service.saveVoyage(tx,req.user,req.params.id,null,req.body)))));
router.put('/:id/voyages/:voyageId',route(async(req,res)=>res.json(await transaction(tx=>service.saveVoyage(tx,req.user,req.params.id,req.params.voyageId,req.body)))));
router.get('/:id/voyages/:voyageId',route(async(req,res)=>{
 const row=await prisma.voyage.findUnique({where:{id:req.params.voyageId},include:{vessel:{include:{aliases:true}},_count:{select:{bills:{where:require('../services/registerLifecycle').notTrashed}}}}});fail(row&&row.vesselId===req.params.id,'Voyage tidak ditemukan.',404);res.json(row);
}));
module.exports=router;
