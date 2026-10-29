// Tanto templates contain real text columns. No party names or quantities are inferred.
const tidy=v=>String(v||'').replace(/\s+/g,' ').trim();
const refs=text=>[...new Set([...String(text).matchAll(/\b([A-Z]{3})\s*(\d{10,18})\b/g)].map(m=>m[1]+m[2]))];
function dateOf(text){const m=tidy(text).match(/\b(\d{1,2})\s*[-/ ]\s*(\d{1,2}|[A-Za-z]+)\s*[-/ ]\s*(\d{4})\b/);if(!m)return null;const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];let month=/^\d+$/.test(m[2])?+m[2]:months.indexOf(m[2].slice(0,3).toLowerCase())+1;if(/^(mei|agu|okt|des)/i.test(m[2]))month=({mei:5,agu:8,okt:10,des:12})[m[2].slice(0,3).toLowerCase()];const value=`${m[3]}-${String(month).padStart(2,'0')}-${m[1].padStart(2,'0')}`;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?d.toISOString():null;}
const known=document=>/TANTO\s+INTIM\s+LINE/i.test(document.pages.map(p=>p.text).join('\n'))||/SURAT\s+KUASA/i.test(document.pages[0]?.text||'')&&/TANTO/i.test(document.pages[0]?.text||'');
function parse(document){
 const page=document.pages[0],full=page.text,rows=page.rows||[],fields={},evidence={},warnings=[],containers=[];
 const heading=full.slice(0,1200);const documentType=/^KONOSEMEN|^BILL\s+OF\s+LADING/im.test(heading)?'BILL_OF_LADING':/SURAT\s+KUASA/i.test(heading)?'POWER_OF_ATTORNEY':/DELIVERY\s+ORDER/i.test(heading)?'DELIVERY_ORDER':'UNKNOWN';
 const put=(key,value,source)=>{if(value==null||value==='')return;fields[key]=value;evidence[key]={page:page.number,method:page.method,source:tidy(source).slice(0,500),reviewRequired:true};};
 const cell=(row,from,to)=>tidy(row.items.filter(i=>i.x>=from-7&&i.x<to-7).map(i=>i.text).join(' '));
 const below=(label,{left=false,lines=1}={})=>{for(let r=0;r<rows.length;r++){const anchor=rows[r].items.find(i=>label.test(i.text));if(!anchor)continue;const peers=rows[r].items.filter(i=>i!==anchor&&i.x>anchor.x+20),max=left?page.width*.48:peers.length?Math.min(...peers.map(i=>i.x)):page.width+7;const values=[];for(let n=r+1;n<rows.length&&n<r+6;n++){if(rows[r].y-rows[n].y>75)break;if(rows[n].items.some(i=>/^Kontainer$/i.test(i.text))&&rows[n].items.some(i=>/^Segel$/i.test(i.text)))break;const value=cell(rows[n],anchor.x,max);if(!value)continue;if(/^(?:(?:Pengirim|Penerima|Pihak yang Memberitahu|Pelabuhan Muat|Pelabuhan Bongkar|B\/L No\.|Pengangkutan yang disetujui|No\. Kontainer)\s*$|KETERANGAN\b)/i.test(value))break;values.push(value);if(values.length>=lines)break;}return values.join(' ');}return null;};
 const references=refs(full),vessel=full.match(/(?:^|\n)(?:KM[.\s]+)?([A-Z][A-Z .-]+?)\s*\/\s*(\d{1,4}(?:\/\d{2,4})?)(?:\s*\/\s*RELEASED)?\s*(?:\n|$)/i)||full.match(/(?:Ex\.\s*Kapal\s*:?\s*)?(?:KM[.\s]+)(TANTO[ A-Z.-]+?)\s+VOY\s*(\d{1,4})/i);
 const vesselValue=vessel||full.match(/\b(TANTO[ A-Z.-]+?)\s*\/\s*(\d{1,4}(?:\/\d{2,4})?)/i);
 if(vesselValue){const vessel=vesselValue;put('vesselName',tidy(vessel[1]),vessel[0]);put('voyageNumber',vessel[2],vessel[0]);}
 if(documentType!=='POWER_OF_ATTORNEY')put('carrierName','TANTO','PT. TANTO INTIM LINE');
 let documentNumber=null,documentDate=null;const operationalSuggestions={};
 if(documentType==='BILL_OF_LADING'||documentType==='DELIVERY_ORDER'){
  put('billNumber',references.length===1?references[0]:null,references.join(', '));
  if(references.length!==1)warnings.push('Pastikan satu nomor B/L pada dokumen ini. Dokumen dengan beberapa B/L perlu dipisahkan atau ditentukan admin.');
  if(documentType==='BILL_OF_LADING'){
   put('shipperName',below(/^Pengirim$/i,{left:true,lines:3}),below(/^Pengirim$/i,{left:true,lines:3}));
   put('consigneeName',below(/^Penerima$/i,{left:true,lines:3}),below(/^Penerima$/i,{left:true,lines:3}));
   put('notifyPartyName',below(/^Pihak yang Memberitahu$/i,{left:true,lines:3}),below(/^Pihak yang Memberitahu$/i,{left:true,lines:3}));
   put('issueDate',dateOf(below(/^Tanggal$/i)),below(/^Tanggal$/i));documentDate=fields.issueDate||null;
  }else{
   documentNumber=full.match(/\bQ[A-Z]{1,5}-\d{2}-\d+\b/)?.[0]||null;
   documentDate=dateOf(below(/^Tanggal Cetak DO$/i));operationalSuggestions.berthDate=dateOf(below(/^Tanggal Kapal Sandar$/i));operationalSuggestions.deliveryOrderValidUntil=dateOf(below(/^DO Berlaku Sampai$/i));
  }
  put('portOfLoading',below(/^Pelabuhan Muat$/i),below(/^Pelabuhan Muat$/i));put('portOfDischarge',below(/^Pelabuhan Bongkar$/i),below(/^Pelabuhan Bongkar$/i));
  let columns;for(const row of rows){const heads=['Kontainer','Tipe','Segel','Muatan','Berat'].map(t=>row.items.find(i=>new RegExp('^'+t+'$','i').test(i.text)));if(heads.every(Boolean)){columns=heads.map(i=>i.x);continue;}if(!columns)continue;const [a,b,c,d,e]=columns,number=cell(row,a,b).replace(/[^A-Z0-9]/gi,'').toUpperCase();if(!/^[A-Z]{4}\d{7}$/.test(number))continue;const seal=cell(row,c,d),type=cell(row,b,c),cargo=cell(row,d,e),weight=cell(row,e,page.width+7);containers.push({number,seal:seal||null,size:type.match(/\b(20|21|40)\b/)?.[1]||null,goodsDescription:cargo||null,sourceType:type,sourceWeight:weight||null,sourceWeightUnit:null});}
  if(!rows.length){warnings.push('Dokumen hasil pindai memerlukan pemeriksaan admin pada tabel kontainer.');for(const line of full.split(/\r?\n/)){const m=line.match(/^\s*\d+[.]?\s+([A-Z]{4})\s*(\d{6})[- .]?(\d)\s+(20|21|40)['’]?\s*(?:ST|HC|DC|GP)?\s+([A-Z]\d{4,12})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*$/i);if(m)containers.push({number:m[1]+m[2]+m[3],seal:m[5],size:m[4],goodsDescription:tidy(m[6]),sourceWeight:m[7],sourceWeightUnit:null});}}
  if(containers.length)put('containers',containers,containers.map(c=>`${c.number} / ${c.seal||'-'} / ${c.goodsDescription||'-'}`).join('; '));else warnings.push('Tabel kontainer belum terbaca. Lengkapi dari dokumen asli.');
 }else if(documentType==='POWER_OF_ATTORNEY'){
  documentNumber=full.match(/\bNo\s*:\s*([^\n]+)/i)?.[1]?.trim()||null;
  operationalSuggestions.arrivalDate=dateOf(full.match(/\bTIBA\s*:\s*([^\n]+)/i)?.[1]);operationalSuggestions.containerCount=Number(full.match(/Jumlah Kont\/Tonase\s*:\s*(\d+)/i)?.[1])||null;
 }
 warnings.push('Tanggal B/L, tanggal sandar, dan masa berlaku DO tetap terpisah dari keberangkatan, storage, dan demurrage.');
 warnings.push('Jumlah kemasan dan tujuan lapangan tidak ditebak dari berat, pengirim, atau penerima dokumen.');
 return {parser:'TANTO_V1',documentType,referenceBillNumbers:references,documentNumber,documentDate,operationalSuggestions,fields,evidence,warnings,pages:document.pages.map(p=>({number:p.number,method:p.method,confidence:p.confidence??null})),text:full.slice(0,40000)};
}
module.exports={known,parse,refs,dateOf};
