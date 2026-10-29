const router=require('express').Router();const fs=require('node:fs/promises');const {randomUUID}=require('node:crypto');
const prisma=require('../prisma');const {route,transaction,fail}=require('../services/jpt');const service=require('../services/internalPacking');const files=require('../services/jobFiles');
router.put('/:id/receiving-report',route(async(req,res)=>res.json(await transaction(tx=>service.saveReport(tx,req.user,req.params.id,req.body)))));
router.put('/:id/packing-source',route(async(req,res)=>res.json(await transaction(async tx=>{
 if(req.body.sourceType==='RECEIVING_REPORT')return service.saveReport(tx,req.user,req.params.id,{version:req.body.version,report:req.body.source});
 if(req.body.sourceType==='MANUAL')return require('../services/manualPacking').save(tx,req.user,req.params.id,req.body);
 fail(req.body.sourceType==='PARTNER_PL','Pilih sumber Packing List.');
 fail(req.body.source&&Array.isArray(req.body.source.groups)&&req.body.source.groups.every(g=>g&&typeof g==='object'&&Array.isArray(g.items)&&g.items.every(i=>i&&typeof i==='object')),'Isi kelompok penerima dan rincian sumber yang valid.');
 const bill=await require('../services/blRegister').get(tx,req.params.id);
 if(req.body.source.status==='CONFIRMED'){
  fail(req.body.source.sourceFileIds?.length&&req.body.source.groups.length,'Pilih minimal satu PL mitra dan terapkan hasil impor atau isi rincian penerima sebelum konfirmasi. Jika tanpa berkas, pilih Input manual.');

 }
 fail(Array.isArray(req.body.source?.sourceFileIds)&&req.body.source.sourceFileIds.every(id=>bill.files.some(f=>f.id===id&&f.category==='PACKING_LIST')),'Pilih PL mitra pada pengiriman ini.');
 if(req.body.source.status==='CONFIRMED')fail(req.body.source.groups.every(g=>g.dataLevel==='SUMMARY'||g.items.length&&g.items.every(i=>i.packages!==''&&i.packages!=null)),'Isi jumlah setiap barang atau gunakan ringkasan.');
 const workspace=require('../services/blWorkspace');await workspace.update(tx,req.user,bill.id,{version:require('../services/jpt').integer(req.body.version,'Version'),operational:{...workspace.operationalOf(bill),packing:{...workspace.operationalOf(bill).packing,...req.body.source}}});
 return require('../services/blRegister').present(await require('../services/blRegister').get(tx,bill.id));
}))));
router.get('/:id/packing-field-check',route(async(req,res)=>res.json(await require('../services/packingFieldChecks').get(prisma,req.params.id,req.query.sourceType))));
router.put('/:id/packing-field-check',route(async(req,res)=>res.json(await transaction(tx=>require('../services/packingFieldChecks').save(tx,req.user,req.params.id,req.body)))));
router.post('/:id/internal-packing/preview',route(async(req,res)=>res.json((await service.read(prisma,req.params.id,req.body)).data)));
router.post('/:id/internal-packing/draft.xlsx',route(async(req,res)=>{const {data}=await service.read(prisma,req.params.id,{...req.body,sourceType:req.body.sourceType||'BL_DRAFT',draft:true,outputMode:req.body.outputMode||'BOTH'});res.type(require('../services/packingImport').MIME).attachment('Draf-Packing-List-SCMU.xlsx').send(Buffer.from(await (await service.workbook(data)).xlsx.writeBuffer()));}));
router.post('/:id/internal-packing',route(async(req,res)=>{
 fail(req.body.confirmed===true,'Periksa dan konfirmasi PL internal.');const {data}=await service.read(prisma,req.params.id,req.body);fail(!data.warnings.length||req.body.acceptWarnings===true,'Periksa dan terima catatan pemeriksaan.');
 fail(!data.draft,'Draf identitas B/L belum memiliki rincian Packing List.');
 const buffer=await (await service.workbook(data)).xlsx.writeBuffer();const filename=randomUUID()+'.xlsx';const originalName=data.documentNumber.replace(/[^a-zA-Z0-9_-]/g,'_')+'.xlsx';let saved=false;
 try{await fs.writeFile(files.filePath(filename),buffer,{flag:'wx'});await transaction(tx=>service.save(tx,req.user,req.params.id,{...req.body,documentNumber:data.documentNumber},{filename,originalName,mimeType:require('../services/packingImport').MIME,size:buffer.length},data));saved=true;res.type(require('../services/packingImport').MIME).attachment(originalName).send(Buffer.from(buffer));}finally{if(!saved)await files.removeFile(filename);}
}));module.exports=router;
