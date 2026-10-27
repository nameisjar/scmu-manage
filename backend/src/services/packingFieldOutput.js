const ExcelJS=require('exceljs');
const {rowsOf}=require('./packingFieldChecks');
const {Prisma}=require('@prisma/client');
function summaryRows(data){return (data.containers||[...new Map(data.groups.map(g=>[g.containerNumber,{number:g.containerNumber,seal:g.sealNumber}])).values()]).map(c=>{
 const groups=data.groups.filter(g=>g.containerNumber===c.number);const totals={};for(const g of groups)for(const i of g.dataLevel==='SUMMARY'?[{packages:g.summaryPackages,packageUnit:g.packageUnit}]:g.items){const u=i.packageUnit||'KOLI';totals[u]=i.packages==null||totals[u]===null?null:(totals[u]||0)+i.packages;}
 return {number:c.number,seal:c.seal,recipients:[...new Set(groups.map(g=>g.recipientName).filter(Boolean))],description:groups.map(g=>g.dataLevel==='SUMMARY'?g.goodsSummary:[...new Set(g.items.map(i=>i.description))].join('; ')).filter(Boolean).join('; '),quantities:Object.entries(totals).map(([unit,n])=>`${n??'Belum lengkap'} ${unit}`).join('; '),instructions:[...new Set(groups.flatMap(g=>[g.instructions,g.notes]).filter(Boolean))].join('; ')};
});}
async function workbook(data){
 const book=new ExcelJS.Workbook();book.creator='PT SCMU';book.created=new Date(data.generatedAt);const rows=rowsOf(data);
 const setup=(name,widths)=>{const s=book.addWorksheet(name,{pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});s.columns=widths.map(width=>({width}));return s;};
 const band=(s,value)=>{const r=s.addRow([value]);s.mergeCells(r.number,1,r.number,s.columns.length);r.height=Math.max(26,Math.ceil(value.length/120)*15);r.font={bold:true};r.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF1FA'}};return r;};
 const header=s=>{band(s,'PT SCMU — PACKING LIST');band(s,`${data.documentNumber} | B/L ${data.billNumber}`);band(s,`${data.vesselName||'—'} / ${data.voyageNumber||'—'} | ${data.portOfLoading||'—'} → ${data.portOfDischarge||'—'}`);band(s,data.draft?'DRAF PEMERIKSAAN KONTTAINER — RINCIAN BARANG BELUM TERSEDIA':'Sumber: '+data.sources.map(s=>s.number||s.name).join('; '));};
 if(data.outputMode!=='CHECKLIST'){
  const sheet=setup('Ringkasan kontainer',[6,25,22,48,55,24,50]);header(sheet);sheet.addRow(['No.','Kontainer','Segel','Penerima / Mark','Ringkasan muatan','Jumlah dan satuan','Instruksi lapangan']).font={bold:true};
  summaryRows(data).forEach((r,i)=>{const row=sheet.addRow([i+1,r.number,r.seal,r.recipients.join('; '),r.description||'Belum ada rincian',r.quantities,r.instructions]);row.height=Math.max(42,Math.min(409,Math.ceil(Math.max(r.description.length,r.recipients.join('; ').length)/45)*15));});sheet.pageSetup.printTitlesRow='1:5';
 }
 if(data.outputMode!=='SUMMARY'){
  const sheet=setup('Pemeriksaan lapangan',[6,24,25,40,38,13,14,14,13,13,13,45]);header(sheet);sheet.pageSetup.printTitlesRow='1:4';
  for(const c of summaryRows(data)){
   band(sheet,`Kontainer ${c.number} / Segel ${c.seal||'—'} | B/L ${data.billNumber}`);if(c.instructions)band(sheet,'INSTRUKSI: '+c.instructions);
   sheet.addRow(['No.','Kontainer','Segel','Penerima / Mark','Barang','Satuan','Dokumen','Aktual','Rusak','Selisih','Diperiksa','Catatan']).font={bold:true};
   rows.filter(r=>r.containerNumber===c.number).forEach((r,n)=>{const saved=data.inspection?.rows.find(i=>i.key===r.key);const row=sheet.addRow([n+1,c.number,c.seal,r.recipient,r.description,r.unit,r.expectedPackages,saved?.actualPackages??null,saved?.damagedPackages??null,saved?.difference??null,saved?.checked?'Ya':null,saved?.notes||r.instructions||null]);row.height=48;});
   if(!rows.some(r=>r.containerNumber===c.number))band(sheet,'Belum ada rincian barang. Lengkapi berdasarkan dokumen atau hasil pemeriksaan.');
   band(sheet,`Petugas: ${data.inspection?.inspector||'____________________'} | Waktu pemeriksaan: ${data.inspection?.inspectedAt||'____________________'} | Tanda tangan: ____________________`);
  }
 }
 const detail=setup('Rincian dan sumber',[25,35,45,15,15,15,14,20,40,25,22,22,12]);detail.addRow(['Kontainer','Penerima','Barang','Dokumen','Sumber aktual BA','Satuan','CBM','ID sumber','Nama sumber','Nomor sumber','Tanggal sumber','Sheet','Baris']).font={bold:true};
 for(const g of data.groups)for(const i of g.items){const source=data.sources.find(s=>s.id===g.sourceFileId);detail.addRow([g.containerNumber,g.recipientName,i.description,i.expectedPackages,data.sourceType==='RECEIVING_REPORT'?i.packages:null,i.packageUnit||'KOLI',i.volumeCbm==null?null:Number(i.volumeCbm),source?.id,source?.name,source?.number,source?.date?.slice(0,10),i.sourceSheet,i.sourceRow]);}
 if(data.sources.length)for(const source of data.sources)band(detail,`SUMBER: ${source.name} | ${source.number||'—'} | ${source.date?.slice(0,10)||'—'}`);
 if(data.totals.byUnit)for(const [unit,total]of Object.entries(data.totals.byUnit))band(detail,`TOTAL ${unit}: ${total==null?'Belum lengkap':total}`);
 for(const warning of data.warnings)band(detail,warning);
 for(const s of book.worksheets){s.eachRow(r=>r.eachCell(c=>{c.alignment={vertical:'top',wrapText:true};c.border={bottom:{style:'hair',color:{argb:'FFCBD5E1'}}};}));s.headerFooter.oddFooter=`&LPT SCMU | ${data.billNumber}&C&P / &N`;s.pageSetup.printArea=`A1:${s.getColumn(s.columns.length).letter}${s.rowCount}`;}
 return book;
}
module.exports={summaryRows,workbook};
