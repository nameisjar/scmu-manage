module.exports=async(prisma,admin)=>{
  const sea=require('../src/services/seaBills');
  const jobs=await prisma.jobOrder.findMany({where:{jobNumber:{in:['SCMU-JOB-ARMADA-001','SCMU-JOB-DEMO-001']},status:{notIn:['CLOSED','CANCELLED']}},include:{shipments:{where:{mode:'SEA',status:{not:'CANCELLED'}}}}});
  for(const job of jobs)for(const leg of job.shipments){
    if(!await prisma.seaBill.count({where:{shipmentId:leg.id}})){
      const document=await prisma.jobDocument.findFirst({where:{shipmentId:leg.id,type:{in:['BILL_OF_LADING','SEA_WAYBILL']},seaBill:null}});
      await prisma.$transaction(tx=>sea.createBill(tx,admin,job.id,{shipmentId:leg.id,documentId:document?.id},true));
    }
    if(job.jobNumber!=='SCMU-JOB-ARMADA-001')continue;
    const bill=await prisma.seaBill.findFirst({where:{shipmentId:leg.id},include:sea.seaInclude});
    if(bill.billNumber||bill.files.length||bill.history.some(row=>!['SEA_BILL_CREATED','SEA_BILL_MIGRATED'].includes(row.action)))continue;
    const packing=await prisma.packingList.findFirst({where:{jobId:job.id,direction:'OUTBOUND',recordNumber:'PL-SCMU-DEMO-001'}});if(!packing)continue;
    await prisma.$transaction(tx=>sea.updateBill(tx,admin,job.id,bill.id,{...bill,billNumber:'BL-SCMU-LAUT-DEMO-001',issueDate:new Date().toISOString(),carrierName:'Pelayaran mitra SCMU (Simulasi)',vesselName:'Kapal Mitra Merauke (Simulasi)',voyageNumber:'DEMO-001',portOfLoading:'Tanjung Perak, Surabaya',portOfDischarge:'Merauke',shipperName:'SCMU Surabaya (Simulasi)',consigneeName:'Gudang penerima Merauke (Simulasi)',packages:packing.packages,grossWeightKg:packing.grossWeightKg.toString(),volumeCbm:packing.volumeCbm.toString(),allocations:[{packingListId:packing.id,packages:packing.packages,grossWeightKg:packing.grossWeightKg.toString(),volumeCbm:packing.volumeCbm.toString()}],notes:'DATA SIMULASI untuk demo. Unggah dokumen pelayaran asli sebelum pemeriksaan; data ini bukan BL terbitan pelayaran.',revisionNote:'Menyiapkan contoh pencatatan BL Surabaya–Merauke tanpa menerbitkan dokumen pelayaran.'}));
  }
  console.log('Sea document demo: BL-SCMU-LAUT-DEMO-001 in SCMU-JOB-ARMADA-001; awaiting original carrier document.');
};
