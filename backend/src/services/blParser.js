const {Prisma}=require('@prisma/client');
const dateOf=value=>{const m=String(value).match(/\b(\d{2})[-/](\d{2})[-/](\d{4})\b/);if(!m)return null;const d=new Date(m[3]+'-'+m[2]+'-'+m[1]+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.getUTCDate()===+m[1]&&d.getUTCMonth()+1===+m[2]?d.toISOString():null;};
const labels={billNumber:/^(?:NO\.?\s*)?B\s*\/\s*L\b/i,shipperName:/^(?:Pengirim|Shipper)\b/i,consigneeName:/^(?:Penerima|Consignee)\b/i,notifyPartyName:/^(?:Pihak yang Memberitahu|Notify Party)\b/i,vesselName:/^(?:Kapal Laut|Nama Kapal|Vessel)\b/i,voyageNumber:/^(?:No\.? Pelayaran|Voyage|Voy\.?\s*No\.?)\b/i,portOfLoading:/^(?:Pelabuhan Muat|Port of Loading)\b/i,portOfDischarge:/^(?:Pelabuhan Bongkar|Port of Discharge)\b/i,issueDate:/^Tempat dan tanggal diterbitkan/i,onBoardDate:/^Tanggal Dimuat di atas kapal/i};
function parse(document){
 const fields={};const evidence={};const warnings=[];const containers=new Map();let weights=[];
 const put=(key,value,page,source)=>{if(value==null||value==='')return;const text=typeof value==='string'?value.trim():value;if(fields[key]!==undefined&&fields[key]!==text){warnings.push('Nilai '+key+' berbeda antar halaman; periksa dokumen sumber.');return;}fields[key]=text;evidence[key]={page:page.number,method:page.method,source:String(source).slice(0,500),reviewRequired:page.method==='LOCAL_OCR'};};
 const full=document.pages.map(p=>p.text).join('\n');const spil=/SALAM\s+PACIFIC\s+INDONESIA\s+LINES|\bSPIL\b/i.test(full);
 for(const page of document.pages){
  if(page.method==='LOCAL_OCR')warnings.push('Hasil OCR perlu diperiksa, terutama nomor B/L, kontainer, segel, dan tanggal.');
  const lines=page.text.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  for(const [key,label]of Object.entries(labels)){
   let value;let source;
   if(page.rows.length){
    for(let r=0;r<page.rows.length&&!value;r++){
     const row=page.rows[r];const anchor=row.items.find(i=>label.test(i.text));if(!anchor)continue;
     const tail=anchor.text.replace(label,'').replace(/^[\s:.-]+/,'').trim();
     const leftParty=['shipperName','consigneeName','notifyPartyName'].includes(key);let min=0,max=page.width;
     if(leftParty){max=page.width*.57;}
     else if(['vesselName','voyageNumber','portOfLoading','portOfDischarge'].includes(key)&&spil){
      const peers=row.items.filter(i=>Object.values(labels).some(l=>l.test(i.text))||/^(Tempat Pengiriman|Tempat Penerimaan|Tujuan akhir)/i.test(i.text)).sort((a,b)=>a.x-b.x);const index=peers.indexOf(anchor);min=index>0?(peers[index-1].x+anchor.x)/2:0;max=index<peers.length-1?(anchor.x+peers[index+1].x)/2:page.width*.57;
     }else{min=anchor.x-15;}
     const same=row.items.filter(i=>i!==anchor&&i.x>anchor.x+(anchor.width||20)&&i.x<max).map(i=>i.text).join(' ');
     if(key==='billNumber'){value=(tail||same).match(/\b[A-Z0-9][A-Z0-9/-]{4,40}\b/i)?.[0];source=tail||same;}
     else if(key==='onBoardDate'){value=dateOf(tail||same);source=tail||same;}
     else if(tail&&!Object.values(labels).some(l=>l.test(tail))){value=tail;source=tail;}
     for(let next=r+1;!value&&next<Math.min(page.rows.length,r+6);next++){
      const candidate=page.rows[next];if(row.y-candidate.y>65)break;
      const text=candidate.items.filter(i=>i.x>=min&&i.x<max).map(i=>i.text).join(' ').trim();if(!text)continue;
      if(Object.values(labels).some(l=>l.test(text)))break;if(text==='-'||text==='"')continue;
      value=key==='issueDate'||key==='onBoardDate'?dateOf(text):text;source=text;
     }
    }
   }else{
    // OCR is a suggested transcription, never spatially trusted.
    const exact=new RegExp(label.source.replace(/\$$/,'')+'[\\s:.-]*(.*)','i');const index=lines.findIndex(line=>label.test(line));
    if(index>=0){const tail=lines[index].match(exact)?.[1]?.trim();value=tail||lines[index+1];source=lines[index]+' '+(value||'');if(Object.values(labels).some(l=>l.test(value||'')))value=null;}
   }
   if(!value)continue;
   if(key==='issueDate'||key==='onBoardDate')value=dateOf(value)||(/^\d{4}-\d{2}-\d{2}T/.test(value)?value:null);
   else if(key==='billNumber')value=value.match(/\b[A-Z0-9][A-Z0-9/-]{4,40}\b/i)?.[0];
   else if(key==='voyageNumber')value=value.match(/\b\d{1,4}(?:[./-]\d{2,4})?\b/)?.[0];
   else if(key==='portOfLoading'||key==='portOfDischarge')value=value.replace(/,?\s*INDONESIA\s*$/i,'').trim();
   if(typeof value==='string'&&!['issueDate','onBoardDate','billNumber'].includes(key))value=value.slice(0,200);
   put(key,value,page,source||value);
  }
  if(spil)put('carrierName','SPIL',page,'PT. SALAM PACIFIC INDONESIA LINES');
  const weightHeader=page.rows.flatMap(r=>r.items).find(i=>/Berat Kotor|Gross Weight/i.test(i.text));const unitsKg=/\bKGS?\b/i.test(page.text);
  for(const line of lines){
   const regex=/\b([A-Z]{4})[ .-]*(\d{3})[ .-]*(\d{3})[ .-]*(\d)\b/g;for(const m of line.matchAll(regex)){
    const number=m[1]+m[2]+m[3]+m[4];const tail=line.slice(m.index+m[0].length);const seal=tail.match(/^\s*(?:\/|SEAL\s*:?|SEGEL\s*:?)\s*([A-Z0-9-]{3,25})/i)?.[1]||null;
    const size=tail.match(/\b(20|40)\s*(?:DC|HC|ST|GP|FT|FEET|['′])/i)?.[1]||null;
    const prior=containers.get(number);if(prior&&prior.seal!==seal)warnings.push('Nomor segel berbeda untuk '+number+'. Periksa sumber.');
    if(!prior)containers.set(number,{number,seal,size});
   }
  }
  if(weightHeader&&unitsKg&&spil)for(const row of page.rows){if(!row.items.some(i=>/[A-Z]{4}[ .-]*\d/.test(i.text)))continue;const cell=row.items.filter(i=>i.x>=weightHeader.x-10&&i.x<weightHeader.x+65).map(i=>i.text).join('');if(/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$|^\d+(?:\.\d+)?$/.test(cell))weights.push(cell.replaceAll(',',''));}
 }
 if(containers.size){fields.containers=[...containers.values()];evidence.containers={source:fields.containers.map(c=>c.number+' / '+(c.seal||'—')).join('\n'),reviewRequired:true};}
 if(weights.length===containers.size&&weights.length)fields.grossWeightKg=weights.reduce((sum,n)=>sum.plus(n),new Prisma.Decimal(0)).toFixed(3);
 if(!spil)warnings.push('Format belum dikenali sebagai SPIL. Periksa hasil pembacaan dan lengkapi kolom secara manual.');
 for(const key of ['billNumber','vesselName','voyageNumber','portOfLoading','portOfDischarge'])if(!fields[key])warnings.push('Kolom '+key+' belum terbaca. Lengkapi secara manual.');
 warnings.push('Tanggal penerbitan dan tanggal muat di kapal tidak digunakan otomatis sebagai tanggal keberangkatan atau tiba.');
 return {parser:spil?'SPIL_V1':'GENERIC_REVIEW',fields,evidence,warnings:[...new Set(warnings)],pages:document.pages.map(p=>({number:p.number,method:p.method,confidence:p.confidence??null})),text:full.slice(0,150000)};
}
module.exports={parse,dateOf};
