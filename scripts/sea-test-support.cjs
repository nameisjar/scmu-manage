const {randomUUID}=require('node:crypto');
const files=require('../backend/src/services/jobFiles');
module.exports={
  async complete(request,token,jobId,finalize) {
    const base=`/jobs/${jobId}`;const bills=(await request(`${base}/sea-bills`,token)).data;if(!bills.length)return;
    let packing=(await request(`${base}/packing-lists`,token)).data[0];
    if(!packing)packing=await request(`${base}/packing-lists`,token,{direction:'OUTBOUND',documentDate:new Date().toISOString(),originCity:'Surabaya',destCity:'Merauke',recipientName:'Penerima simulasi Merauke',recipientAddress:'Gudang simulasi Merauke',items:[{description:'Muatan simulasi',quantity:1,unit:'UNIT',packages:1,netWeightKg:100,grossWeightKg:120,volumeCbm:1}]});
    if(packing.status!=='FINAL') {
      if(finalize)await finalize(packing);else await request(`${base}/packing-lists/${packing.id}/finalize`,token,{version:packing.version});
    }
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=','base64');
    for(let bill of bills) {
      const at=`${base}/sea-bills/${bill.id}`;
      bill=await request(at,token,{...bill,billNumber:`QA-${randomUUID()}`,issueDate:new Date().toISOString(),carrierName:'Pelayaran simulasi',vesselName:'Kapal simulasi',voyageNumber:'QA-001',portOfLoading:'Surabaya',portOfDischarge:'Merauke',shipperName:'SCMU',consigneeName:'Penerima simulasi Merauke',packages:packing.packages,grossWeightKg:packing.grossWeightKg,volumeCbm:packing.volumeCbm,allocations:[{packingListId:packing.id,packages:packing.packages,grossWeightKg:packing.grossWeightKg,volumeCbm:packing.volumeCbm}]},'PUT');
      const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'simulasi-BL.png');form.append('version',bill.version);form.append('category','FINAL');bill=await request(`${at}/files`,token,form);
      await request(`${at}/verify`,token,{version:bill.version,checks:{parties:true,route:true,containers:true,cargo:true,finalDocument:true}});
    }
  },
  async cleanup(prisma,jobIds) {
    if(!jobIds.length)return;
    const uploads=await prisma.seaBillFile.findMany({where:{bill:{jobId:{in:jobIds}}}});
    await prisma.seaBill.deleteMany({where:{jobId:{in:jobIds}}});
    for(const filename of new Set(uploads.map(row=>row.filename)))await files.removeFile(filename);
  },
};
