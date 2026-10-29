const {createHash}=require('node:crypto');
const {fail,text}=require('./jpt');
const imports=require('./blImports'),journeys=require('./journeys');
const {vesselKey,voyageKey}=require('./vessels');
const destinationKey=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const fieldsOf=row=>({vesselName:row.vesselName||null,voyageNumber:row.voyageNumber||null,period:row.period||null,destination:row.destination||null});
const identity=row=>createHash('sha256').update(JSON.stringify([vesselKey(row.vesselName),voyageKey(row.voyageNumber),row.period||'',destinationKey(row.destination)])).digest('hex');
const selection={id:true,number:true,vesselName:true,voyageNumber:true,period:true,destination:true,archivedAt:true,deletedAt:true};
const candidate=row=>({...fieldsOf(row),id:row.id,number:row.number,identity:identity(row),archived:Boolean(row.archivedAt)});

function sourceFields(fields){
 fail(fields&&typeof fields==='object'&&!Array.isArray(fields),'Periksa isian B/L.');
 return journeys.normalize({vesselName:fields.vesselName,voyageNumber:fields.voyageNumber,destination:fields.portOfDischarge,
  period:typeof fields.issueDate==='string'&&/^[12]\d{3}-\d\d-\d\d/.test(fields.issueDate)?fields.issueDate.slice(0,4):null});
}
function requireIdentity(fields){
 fail(vesselKey(fields.vesselName)&&voyageKey(fields.voyageNumber)&&destinationKey(fields.destination)&&fields.period,
  'Lengkapi kapal, voyage, periode, dan tujuan pengiriman sebelum menyimpan.');
}
async function preview(tx,user,body){
 fail(Array.isArray(body.documents)&&body.documents.length>0&&body.documents.length<=20&&body.documents.every(d=>d&&typeof d.sessionId==='string'&&d.fields&&typeof d.fields==='object'&&!Array.isArray(d.fields)),'Pilih 1 sampai 20 B/L untuk pengelompokan.');
 fail(new Set(body.documents.map(d=>d?.sessionId)).size===body.documents.length,'Sesi B/L berulang.');
 const groups=new Map();
 for(const doc of body.documents){
  const session=await imports.get(tx,user,doc.sessionId);fail(session.extracted?.batch&&!session.extracted.saved,'Periksa sesi B/L yang belum disimpan.',409);
  fail(session.mimeType==='application/pdf'||session.mimeType.startsWith('image/'),'Untuk B/L gunakan PDF atau gambar.');
  const number=text(doc.fields?.billNumber,'Nomor B/L',100).toUpperCase().replace(/\s+/g,'');
  const matches=(await require('./documentBatch').targets(tx,[number]))[0].bills;
  fail(matches.length<=1,'Nomor B/L merujuk ke beberapa data. Periksa nomor sebelum mengelompokkan.',409);
  let fields=sourceFields(doc.fields),parent=null,candidates=[];
  if(matches.length){
   fail(!matches[0].readOnly,'B/L yang sudah ada hanya dapat dibaca. Periksa status pengiriman.',409);
   fail(matches[0].journeyId,'B/L belum memiliki pengiriman induk.',409);
   parent=await tx.shippingJourney.findUnique({where:{id:matches[0].journeyId},select:selection});
   journeys.mutable(parent);fields=fieldsOf(parent);candidates=[candidate(parent)];
  }else if(fields.vesselName&&fields.voyageNumber&&fields.destination){
   const prefix=vesselKey(fields.vesselName)+'|'+voyageKey(fields.voyageNumber)+'|';
   const rows=await tx.shippingJourney.findMany({where:{deletedAt:null,OR:[{activeKey:{startsWith:prefix}},{vesselName:{equals:fields.vesselName,mode:'insensitive'}},{voyageNumber:{equals:fields.voyageNumber,mode:'insensitive'}}]},select:selection});
   candidates=rows.filter(r=>r.vesselName&&r.voyageNumber&&r.destination&&journeys.compatible(r,doc.fields)).map(candidate);
   parent=candidates.find(c=>!c.archived&&journeys.keyOf(c)===journeys.keyOf(fields));
  }
  const key=parent?'existing:'+parent.id:journeys.keyOf(fields)||'incomplete:'+session.id;
  let group=groups.get(key);
  if(!group){group={key,fields:parent?fieldsOf(parent):fields,mode:parent?'EXISTING':'NEW',targetId:parent?.id||'',candidates,locked:false,documents:[]};groups.set(key,group);}
  group.locked ||= matches.length>0;
  for(const c of candidates)if(!group.candidates.some(old=>old.id===c.id))group.candidates.push(c);
  group.documents.push({sessionId:session.id,originalName:session.originalName,billNumber:number,existing:Boolean(matches.length),containerCount:doc.fields?.containers?.length||0});
 }
 return {groups:[...groups.values()]};
}

// Called inside the same transaction as B/L creation and its original file.
// A failed B/L save therefore cannot leave an empty shipment behind.
async function resolve(tx,user,plan,source,existingBill){
 fail(plan&&typeof plan==='object'&&!Array.isArray(plan)&&plan.confirmed===true,'Periksa dan konfirmasi pengelompokan pengiriman.');
 let row;
 if(plan.mode==='EXISTING'){
  row=await journeys.get(tx,text(plan.targetId,'Pengiriman tujuan',100));journeys.mutable(row);
  fail(plan.identity===identity(row),'Identitas pengiriman berubah. Periksa pengelompokan kembali.',409);
 }else{
  fail(plan.mode==='NEW','Pilih pengiriman baru atau yang sudah ada.');
  const fields=journeys.normalize(plan.fields||{});requireIdentity(fields);
  fail(!existingBill,'Nomor B/L sudah tersedia. Pilih pengiriman asalnya.',409);
  fail(journeys.compatible(fields,source),'Kapal, voyage, atau tujuan berbeda dengan B/L sumber.',409);
  fail(!await tx.shippingJourney.findUnique({where:{activeKey:journeys.keyOf(fields)}}),'Pengiriman ini sudah tersedia. Periksa pengelompokan dan pilih pengiriman tersebut.',409);
  const saved=await journeys.save(tx,user,null,fields);row=await journeys.get(tx,saved.id);
 }
 fail(!existingBill||existingBill.journeyId===row.id,'B/L sudah berada pada pengiriman lain. Buka pengiriman asalnya.',409);
 fail(journeys.compatible(row,existingBill||source),'Kapal, voyage, atau tujuan berbeda dengan pengiriman tujuan.',409);
 return {id:row.id,identity:identity(row),fields:fieldsOf(row)};
}
module.exports={preview,resolve,identity,fieldsOf,sourceFields,requireIdentity};
