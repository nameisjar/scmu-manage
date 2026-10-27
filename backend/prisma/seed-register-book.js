const registerService = require('../src/services/blRegister');

const rows = [
  ['001','BL-DEMO-CR-001','KM Ciremai (Demo)','V-012','Surabaya','2026-10-03','2026-10-10',1,0,'Peralatan bengkel','Bilba','244','202300244','2026-10-20','2026-11-18','69110000'],
  ['002','BL-DEMO-CR-002','KM Ciremai (Demo)','V-012','Surabaya','2026-10-03','2026-10-10',0,1,'Suku cadang kendaraan','TPS','245','202300245','2026-10-20','2026-11-18','7180000'],
  ['003','BL-DEMO-CR-003','KM Ciremai (Demo)','V-012','Surabaya','2026-10-03','2026-10-10',2,0,'Bahan bangunan','Bilba','248','202300248','2026-10-20','2026-11-18','6780000'],
  ['004','BL-DEMO-DB-001','KM Dobonsolo (Demo)','V-008','Surabaya','2026-10-08','2026-10-16',1,0,'Perlengkapan gudang','Bilba','247','202300247','2026-10-20','2026-11-18','15870000'],
  ['005','BL-DEMO-DB-002','KM Dobonsolo (Demo)','V-008','Surabaya','2026-10-08','2026-10-16',0,2,'Mesin dan perkakas','SPIL Merauke','260','202300260','2026-10-22','2026-11-20','15045000'],
  ['006','BL-DEMO-DB-003','KM Dobonsolo (Demo)','V-008','Surabaya','2026-10-08','2026-10-16',1,1,'Barang konsumsi kering','SSI','257','202300257','2026-10-22','2026-11-20','6800000'],
  ['007','BL-DEMO-TM-001','KM Tatamailau (Demo)','V-021','Jakarta','2026-10-12','2026-10-21',0,1,'Peralatan kantor','Ajilog','262','202300262','2026-10-22','2026-11-24','5650000'],
  ['008','BL-DEMO-TM-002','KM Tatamailau (Demo)','V-021','Jakarta','2026-10-12','2026-10-21',1,0,'Peralatan listrik','Mansur (Kantor C)','263','202300263','2026-10-22','2026-11-24','55085000'],
  ['009','BL-DEMO-SB-001','KM Sinabung (Demo)','V-006','Surabaya','2026-10-18','2026-10-26',0,1,'Perlengkapan rumah tangga','Montana','271','202300271','2026-10-27','2026-11-29','4900000'],
  ['010','BL-DEMO-SB-002','KM Sinabung (Demo)','V-006','Surabaya','2026-10-18','2026-10-26',1,1,'Material operasional','SBB','272','202300272','2026-10-27','2026-11-29','10300000'],
  ['011','BL-DEMO-SPIL-BILBA-001','KM SPIL Hasya (Demo)','V.04/26','Surabaya','2026-04-05','2026-04-19',0,2,'Mobil, suku cadang, traktor, elektronik, dan makanan (Demo)','Bilba','PL-BILBA-DEMO','—',null,null,null],
];

const iso = value => `${value}T00:00:00.000Z`;

module.exports = async function seedRegisterBook(prisma, user) {
  for (const [name,documentPolicy,includeInPackingHeader] of [['Bilba','BL_AND_PACKING',true],['Ajilog','BL_AND_PACKING',true],['Mansur (Kantor C)','BL_AND_PACKING',true],['JPT lainnya','BL_ONLY',true]]) {
    const existing=await prisma.company.findFirst({where:{name}});
    if(existing)await prisma.company.update({where:{id:existing.id},data:{documentPolicy,includeInPackingHeader}});
    else await prisma.company.create({data:{name,type:'TRANSPORTER',city:'Merauke',state:'Papua Selatan',documentPolicy,includeInPackingHeader,notes:'Kebijakan dokumen berdasarkan informasi operasional SCMU; konfirmasi jika proses mitra berubah.'}});
  }
  let created = 0;
  for (const [sequence,billNumber,vesselName,voyageNumber,origin,departure,arrival,quantity20,quantity40,cargoDescription,partyName,reference1,reference2,additionalDate1,additionalDate2,registerAmount] of rows) {
    const registerNumber = `REG-DEMO-2026-${sequence}`;
    const documentPolicy=['Bilba','Ajilog','Mansur (Kantor C)'].includes(partyName)?'BL_AND_PACKING':'BL_ONLY';
    const exampleContainers=sequence==='011'?[{number:'SPNU4603888',seal:'51879902',size:'40',status:'REGISTERED',goodsDescription:'Mobil dan suku cadang (Demo)'},{number:'SPNU4607076',seal:'51258190',size:'40',status:'REGISTERED',goodsDescription:'Traktor, elektronik, dan makanan (Demo)'}]:[];
    const operational=sequence==='011'?{packing:{status:'DRAFT',headerStatus:'DRAFT',headerNumber:'KPL-DEMO-SPIL-BILBA-001',sourceFileIds:[],groups:exampleContainers.map((container,index)=>({id:`demo-group-${index+1}`,sequence:index+1,sourceFileId:null,containerNumber:container.number,sealNumber:container.seal,size:container.size,recipientName:`Penerima Demo ${index+1}`,recipientAddress:'Merauke, Papua Selatan (Demo)',recipientPhone:null,notes:'Transkripsi contoh; wajib dicocokkan dengan file asli.',items:[{id:`demo-item-${index+1}`,sequence:0,itemDate:null,shop:null,description:container.goodsDescription,quantity:'1.0000',packages:1,lengthCm:'0.000',widthCm:'0.000',heightCm:'0.000',volumeCbm:index?'11.9410':'3.8600',marks:null}]}))},deadlines:{etaDate:iso('2026-04-19'),storageUntil:iso('2026-04-23'),demurrageFrom:iso('2026-05-02'),emptyReturnDue:null},unloading:{status:'PENDING',inspectedAt:null,staffName:null,declaredPackages:2,actualPackages:0,damagedPackages:0,notes:null,evidenceFileIds:[]}}:null;
    const existing=await prisma.seaBill.findFirst({ where: { OR: [{ registerNumber }, { registerIdentity: billNumber }] } });
    if (existing) {
      const registerData=existing.registerData&&typeof existing.registerData==='object'?existing.registerData:{};
      await prisma.seaBill.update({where:{id:existing.id},data:{registerAmount,...(sequence==='011'?{containers:exampleContainers.map(({number,seal,size})=>({number,seal,size}))}:{}),registerData:{...registerData,register:{...(registerData.register||{}),departureDate:iso(departure),arrivalDate:iso(arrival),dateMeaning:'UNCONFIRMED',quantity20,quantity21:null,quantity40,cargoDescription,partyName,partyText:'SCMU',reference1,reference2,additionalDate1:additionalDate1?iso(additionalDate1):null,additionalDate2:additionalDate2?iso(additionalDate2):null,billingStatus:'RECEIVED',pph23Applicable:false,documentPolicy,includeInPackingHeader:true,additionalNotes:'Data simulasi berdasarkan pola buku register SCMU; bukan transaksi sebenarnya.'},...(sequence==='011'?{containers:exampleContainers}:{}),...(operational?{operational}:{})}}});
      continue;
    }
    await prisma.$transaction(tx => registerService.create(tx,user,{
      registerNumber,billNumber,documentKind:'BILL_OF_LADING',issueDate:iso(departure),
      carrierName:'Pelayaran Nusantara (Demo)',vesselName,voyageNumber,portOfLoading:origin,portOfDischarge:'Merauke',
      shipperName:`Gudang SCMU ${origin} (Demo)`,consigneeName:'Gudang SCMU Merauke (Demo)',packages:quantity20+quantity40,
      grossWeightKg:String((quantity20+quantity40)*1200),volumeCbm:String((quantity20+quantity40)*6.5),containers:exampleContainers,
      notes:'DATA CONTOH berdasarkan pola buku register; bukan transaksi atau dokumen pelayaran sebenarnya.',registerAmount,
      register:{departureDate:iso(departure),arrivalDate:iso(arrival),dateMeaning:'UNCONFIRMED',quantity20,quantity21:null,quantity40,cargoDescription,partyName,partyText:'SCMU',reference1,reference2,additionalDate1:additionalDate1?iso(additionalDate1):null,additionalDate2:additionalDate2?iso(additionalDate2):null,billingStatus:'RECEIVED',pph23Applicable:false,documentPolicy,includeInPackingHeader:true,additionalNotes:'Data simulasi berdasarkan pola buku register SCMU; bukan transaksi sebenarnya.'},
    }));
    if(operational){const createdBill=await prisma.seaBill.findFirst({where:{registerIdentity:billNumber}});await prisma.seaBill.update({where:{id:createdBill.id},data:{registerData:{...createdBill.registerData,operational}}});}
    created++;
  }
  console.log(`Book-style register demo: ${created} created, ${rows.length-created} already present.`);
};
