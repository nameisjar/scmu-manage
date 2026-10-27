const {createHash,randomUUID}=require('node:crypto');const {Prisma}=require('@prisma/client');const ExcelJS=require('exceljs');
const {fail,text,audit}=require('./jpt');const workspace=require('./blWorkspace');
const CATEGORY='INTERNAL_PACKING_RECAP';
function fingerprint(bill){const p=workspace.operationalOf(bill).packing;return createHash('sha256').update(JSON.stringify([bill.billNumber,bill.vesselId,bill.voyageId,bill.vesselName,bill.voyageNumber,bill.contentVersion,bill.shipperName,bill.consigneeName,bill.containers,bill.registerData?.containers,p.status,p.sourceFileIds,p.groups])).digest('hex');}
function ready(bill){const saved=bill.registerData?.internalRecap;return Boolean(saved?.valid&&saved.fingerprint===fingerprint(bill)&&bill.files?.some(f=>f.category===CATEGORY&&f.filename===saved.filename));}
async function invalidateShared(tx,user,bill){
 const filename=bill.registerData?.internalRecap?.filename;if(!filename||!bill.registerData.internalRecap.valid)return;
 const shared=await tx.seaBillFile.findMany({where:{category:CATEGORY,filename,billId:{not:bill.id}},select:{billId:true}});
 for(const id of [...new Set(shared.map(f=>f.billId))].sort()){
  const other=await tx.seaBill.findUnique({where:{id},select:{id:true,jobId:true,registerData:true}});
  if(other?.registerData?.internalRecap?.filename!==filename||!other.registerData.internalRecap.valid)continue;
  await tx.seaBill.update({where:{id},data:{registerData:{...other.registerData,internalRecap:{...other.registerData.internalRecap,valid:false}},version:{increment:1}}});
  await audit(tx,user,'PACKING_RECAP_INVALIDATED','JobOrder',other.jobId,{seaBillId:id,sourceBillId:bill.id});
 }
}
function summarize(bills,number){
 fail(bills.length&&bills.length<=40,'Pilih maksimal 40 B/L.');const first=bills[0];
 if(bills.length>1)fail(first.voyageId&&bills.every(b=>b.voyageId===first.voyageId&&b.vesselId===first.vesselId),'Untuk rekap beberapa B/L, tautkan semuanya ke master kapal dan periode voyage yang sama.');
 const rows=[];const details=[];const warnings=[];
 for(const bill of bills){
  const packing=workspace.operationalOf(bill).packing;
  fail(packing.status==='CONFIRMED'&&packing.groups.length,`${bill.billNumber}: Periksa dan konfirmasi transkripsi Packing List sebelum membuat rekap.`,409);
  fail(packing.groups.every(g=>g.dataLevel!=='SUMMARY'),`${bill.billNumber}: Data ringkasan belum mempunyai rincian barang. Gunakan Kelola Packing List → Ringkasan kontainer.`,409);
  fail(packing.sourceFileIds.length&&packing.sourceFileIds.every(id=>bill.files.some(f=>f.id===id&&['PACKING_LIST','INTERNAL_PACKING_LIST'].includes(f.category))),`${bill.billNumber}: Sumber Packing List tidak tersedia.`,409);
  const comparison=workspace.reconciliation(bill,workspace.operationalOf(bill));
  if(comparison.missingContainers.length)warnings.push(`${bill.billNumber}: Kontainer belum tercakup dalam transkripsi: ${comparison.missingContainers.join(', ')}.`);
  if(comparison.issues.includes('PACKAGE_TOTAL_DIFFERENCE'))warnings.push(`${bill.billNumber}: Total koli transkripsi berbeda dari B/L; periksa sumber sebelum menggunakan rekap.`);
  if(comparison.issues.includes('VOLUME_TOTAL_DIFFERENCE'))warnings.push(`${bill.billNumber}: Total CBM transkripsi berbeda dari B/L.`);
  const map=new Map();
  for(const group of packing.groups){
   fail(group.sourceFileId&&packing.sourceFileIds.includes(group.sourceFileId),`${bill.billNumber}: Pilih sumber untuk setiap kelompok penerima.`);
   const container=bill.containers.find(c=>c.number===group.containerNumber);fail(container,`${bill.billNumber}: Kontainer sumber tidak sesuai B/L.`);
   fail(!group.sealNumber||!container.seal||group.sealNumber===container.seal,`${group.containerNumber}: Nomor segel berbeda dari B/L.`);
   const key=JSON.stringify([group.containerNumber,group.recipientName?.trim().toLocaleUpperCase('id-ID'),group.recipientAddress||'',group.recipientPhone||'']);
   let row=map.get(key);if(!row){row={id:bill.id+':'+map.size,billNumber:bill.billNumber,containerNumber:group.containerNumber,seal:container.seal,recipientName:group.recipientName,address:group.recipientAddress,phone:group.recipientPhone,packages:0,volumeCbm:'0.0000',volumeComplete:true,itemCount:0,notes:[],sources:[]};map.set(key,row);}
   if(group.notes&&!row.notes.includes(group.notes))row.notes.push(group.notes);
   for(const item of group.items){row.itemCount++;row.packages+=item.packages;row.volumeComplete&&=item.volumeCbm!=null&&item.volumeCbm!=='';if(item.volumeCbm!=null)row.volumeCbm=new Prisma.Decimal(row.volumeCbm).plus(item.volumeCbm).toFixed(4);
    const source={fileId:group.sourceFileId,sheet:item.sourceSheet||group.sourceSheet,row:item.sourceRow||group.sourceRow};row.sources.push(source);
    details.push({billNumber:bill.billNumber,containerNumber:group.containerNumber,recipientName:group.recipientName,...item,sourceFileId:group.sourceFileId});
   }
  }
  for(const row of map.values()){if(!row.volumeComplete){row.volumeCbm=null;warnings.push(`${row.billNumber} / ${row.recipientName}: CBM belum lengkap; total tidak dianggap nol.`);}rows.push(row);}
 }
 const sum=items=>({packages:items.reduce((n,r)=>n+r.packages,0),volumeCbm:items.every(r=>r.volumeCbm!=null)?items.reduce((n,r)=>n.plus(r.volumeCbm),new Prisma.Decimal(0)).toFixed(4):null});
 const containers=[...new Set(rows.map(r=>JSON.stringify([r.billNumber,r.containerNumber])))].map(key=>{const [billNumber,containerNumber]=JSON.parse(key);return {billNumber,containerNumber,...sum(rows.filter(r=>r.billNumber===billNumber&&r.containerNumber===containerNumber))};});
 return {schema:1,recapNumber:number,vesselName:first.vesselName,voyageNumber:first.voyageNumber,generatedAt:new Date().toISOString(),records:bills.map(b=>({id:b.id,version:b.version,fingerprint:fingerprint(b)})),rows,details,containers,totals:sum(rows),warnings:[...new Set(warnings)]};
}
async function read(tx,selection,number){
 fail(Array.isArray(selection)&&selection.length&&selection.length<=40&&selection.every(r=>r&&typeof r.id==='string'&&r.id.length<=100&&Number.isInteger(r.version)&&r.version>0)&&new Set(selection.map(r=>r.id)).size===selection.length,'Pilih B/L beserta versi terbaru.');
 const bills=[];for(const row of [...selection].sort((a,b)=>a.id.localeCompare(b.id))){const bill=await require('./blRegister').get(tx,row.id);await require('./seaBills').getBill(tx,bill.jobId,bill.id,row.version);fail(!bill.archivedAt&&!bill.registerData?.archivedAt,'B/L diarsipkan: hanya baca.',409);bills.push(bill);}
 return {bills,data:summarize(bills,text(number??`RPL-SCMU-${new Date().getUTCFullYear()}-${randomUUID().slice(0,8).toUpperCase()}`,'Nomor rekap',100))};
}
async function workbook(data){
 const book=new ExcelJS.Workbook();book.creator='PT SCMU';book.created=new Date(data.generatedAt);
 const sheet=book.addWorksheet('Rekap internal',{pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 sheet.columns=[22,22,20,40,38,20,12,15,45].map(width=>({width}));
 for(const line of ['PT SCMU — REKAP PACKING LIST INTERNAL',data.recapNumber,`${data.vesselName||'—'} / ${data.voyageNumber||'—'}`]){const r=sheet.addRow([line]);sheet.mergeCells(r.number,1,r.number,9);r.font={bold:true,size:13};r.height=25;}
 sheet.addRow(['B/L','Kontainer','Segel','Penerima / Mark','Alamat','Telepon','Koli','CBM','Catatan']);
 for(const c of data.containers){for(const r of data.rows.filter(r=>r.billNumber===c.billNumber&&r.containerNumber===c.containerNumber)){const row=sheet.addRow([r.billNumber,r.containerNumber,r.seal,r.recipientName,r.address,r.phone,r.packages,r.volumeCbm==null?null:Number(r.volumeCbm),r.notes.join('; ')]);row.height=Math.max(30,Math.min(180,Math.ceil(Math.max((r.address||'').length,(r.recipientName||'').length)/30)*15));}
  const row=sheet.addRow([c.billNumber,c.containerNumber,'SUBTOTAL','','','',c.packages,c.volumeCbm==null?null:Number(c.volumeCbm)]);row.font={bold:true};}
 sheet.addRow(['TOTAL','','','','','',data.totals.packages,data.totals.volumeCbm==null?null:Number(data.totals.volumeCbm)]).font={bold:true};
 for(const warning of data.warnings){const row=sheet.addRow([warning]);sheet.mergeCells(row.number,1,row.number,9);row.height=30;}
 sheet.eachRow(row=>row.eachCell(cell=>{cell.alignment={vertical:'top',wrapText:true};cell.border={bottom:{style:'hair',color:{argb:'FFCBD5E1'}}};}));
 sheet.getRow(4).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(4).eachCell(c=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF164E8A'}});sheet.views=[{state:'frozen',ySplit:4}];sheet.pageSetup.printTitlesRow='1:4';sheet.pageSetup.printArea=`A1:I${sheet.rowCount}`;
 const detail=book.addWorksheet('Sumber rincian');detail.columns=['B/L','Kontainer','Penerima / Mark','Barang','Koli','CBM','ID file sumber','Sheet','Baris','Tanggal sumber'].map((header,i)=>({header,width:[2,3].includes(i)?40:24}));
 for(const r of data.details)detail.addRow([r.billNumber,r.containerNumber,r.recipientName,r.description,r.packages,r.volumeCbm==null?null:Number(r.volumeCbm),r.sourceFileId,r.sourceSheet,r.sourceRow,r.itemDateText]);detail.getRow(1).font={bold:true};detail.views=[{state:'frozen',ySplit:1}];return book;
}
async function save(tx,user,body,filename,size,expected){
 fail(body.confirmed===true,'Konfirmasi rekap terlebih dahulu.');const {bills,data}=await read(tx,body.selection,expected.recapNumber);
 fail(JSON.stringify(data.records)===JSON.stringify(expected.records),'B/L berubah. Buat pratinjau rekap ulang.',409);
 for(const bill of bills){await tx.seaBillFile.create({data:{billId:bill.id,category:CATEGORY,contentVersion:bill.contentVersion,filename,originalName:expected.recapNumber.replace(/[^a-zA-Z0-9_-]/g,'_')+'.xlsx',mimeType:require('./packingImport').MIME,size,uploadedById:user.id,note:'Rekap internal SCMU per kontainer dan penerima; '+expected.recapNumber}});
  await tx.seaBill.update({where:{id:bill.id},data:{registerData:{...bill.registerData,internalRecap:{filename,number:expected.recapNumber,fingerprint:fingerprint(bill),valid:true}},version:{increment:1}}});
  await audit(tx,user,'PACKING_RECAP_CREATED','JobOrder',bill.jobId,{seaBillId:bill.id,snapshot:expected});}
}
module.exports={CATEGORY,fingerprint,ready,invalidateShared,summarize,read,workbook,save};
