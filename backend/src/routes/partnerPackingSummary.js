const router=require('express').Router();const prisma=require('../prisma');const {route,transaction}=require('../services/jpt');const service=require('../services/partnerPackingSummary');
router.get('/:id/partner-summary/:fileId',route(async(req,res)=>res.json(await service.preview(prisma,req.params.id,req.params.fileId))));
router.put('/:id/partner-summary/:fileId',route(async(req,res)=>res.json(await transaction(tx=>service.save(tx,req.user,req.params.id,req.params.fileId,req.body)))));
router.get('/:id/partner-summary/:fileId/export.xlsx',route(async(req,res)=>{const data=await service.readSaved(prisma,req.params.id,req.params.fileId);res.type(require('../services/packingImport').MIME).attachment('Ringkasan-Packing-List-Mitra.xlsx').send(Buffer.from(await (await service.workbook(data)).xlsx.writeBuffer()));}));
module.exports=router;
