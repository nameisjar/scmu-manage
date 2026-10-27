const { fail, text, integer, audit } = require('./jpt');
const { calendarDate } = require('./registerFields');
const vesselKey = value => String(value || '').trim().toUpperCase().replace(/^(?:KM|K\.M\.|MV|M\.V\.)[\s.]+/, '').replace(/[^A-Z0-9]/g, '');
const voyageKey = value => String(value || '').trim().toUpperCase().replace(/^(?:VOYAGE|VOY|V)[\s.:]+/, '').replace(/[^A-Z0-9]/g, '');
const include = { aliases: { orderBy: { name: 'asc' } }, _count: { select: { voyages: true, bills: true } } };
async function get(tx,id) { const row=await tx.vessel.findUnique({where:{id},include});fail(row,'Kapal tidak ditemukan.',404);return row; }
async function save(tx,user,id,body) {
  const before=id?await get(tx,id):null;
  if(before)fail(integer(body.version,'Version')===before.version,'Data kapal berubah. Muat ulang sebelum menyimpan.',409);
  const name=text(body.name,'Nama kapal',200);const key=vesselKey(name);fail(key,'Nama kapal harus memuat huruf atau angka.');
  fail(body.isActive===undefined||typeof body.isActive==='boolean','Status aktif tidak valid.');
  const aliases=body.aliases===undefined?(before?.aliases.map(a=>a.name)||[]):body.aliases;
  fail(Array.isArray(aliases)&&aliases.length<=50&&aliases.every(a=>typeof a==='string'&&a.trim().length<=200),'Masukkan maksimal 50 alias kapal.');
  const names=[name,...(before?[before.name]:[]),...aliases];const unique=new Map(names.map(n=>[vesselKey(n),n.trim()]).filter(([k])=>k));
  const claimed=await tx.vesselAlias.findMany({where:{key:{in:[...unique.keys()]}}});fail(claimed.every(a=>a.vesselId===id),'Nama atau alias tersebut sudah digunakan kapal lain.',409);
  const data={name,normalizedName:key,carrierName:text(body.carrierName,'Pelayaran',200,true),imoNumber:text(body.imoNumber,'IMO',30,true),isActive:body.isActive??before?.isActive??true};
  const row=before?await tx.vessel.update({where:{id},data:{...data,version:{increment:1}}}):await tx.vessel.create({data});
  await tx.vesselAlias.deleteMany({where:{vesselId:row.id}});await tx.vesselAlias.createMany({data:[...unique].map(([key,name])=>({key,name,vesselId:row.id}))});
  await audit(tx,user,before?'VESSEL_UPDATED':'VESSEL_CREATED','Vessel',row.id,{name,aliases:[...unique.values()]});return get(tx,row.id);
}
async function saveVoyage(tx,user,vesselId,id,body) {
  const vessel=await get(tx,vesselId);const before=id?await tx.voyage.findUnique({where:{id},include:{_count:{select:{bills:true}}}}):null;
  if(id){fail(before&&before.vesselId===vesselId,'Voyage tidak ditemukan.',404);fail(integer(body.version,'Version')===before.version,'Data voyage berubah. Muat ulang sebelum menyimpan.',409);}
  fail(vessel.isActive||before,'Aktifkan kapal sebelum menambah voyage.');
  const number=text(body.number,'Nomor voyage',100);const normalizedNumber=voyageKey(number);fail(normalizedNumber,'Nomor voyage tidak valid.');
  const period=text(body.period,'Periode voyage',7);fail(/^[12]\d{3}(?:-(?:0[1-9]|1[0-2]))?$/.test(period),'Periode voyage harus berupa tahun atau tahun-bulan, misalnya 2026 atau 2026-04.');
  fail(!before?._count.bills||before.normalizedNumber===normalizedNumber&&before.period===period,'Nomor dan periode voyage yang sudah dipakai tidak dapat diubah. Buat voyage baru.',409);
  fail(body.isActive===undefined||typeof body.isActive==='boolean','Status aktif tidak valid.');
  const departureDate=calendarDate(body.departureDate,'Tanggal berangkat');const arrivalDate=calendarDate(body.arrivalDate,'Tanggal tiba');fail(!departureDate||!arrivalDate||arrivalDate>=departureDate,'Tanggal tiba harus sesudah tanggal berangkat.');
  const data={vesselId,number,normalizedNumber,period,portOfLoading:text(body.portOfLoading,'Pelabuhan asal',200,true),portOfDischarge:text(body.portOfDischarge,'Pelabuhan tujuan',200,true),departureDate,arrivalDate,isActive:body.isActive??before?.isActive??true};
  const row=before?await tx.voyage.update({where:{id},data:{...data,version:{increment:1}}}):await tx.voyage.create({data});
  await audit(tx,user,before?'VOYAGE_UPDATED':'VOYAGE_CREATED','Vessel',vesselId,{voyageId:row.id,number,period});return row;
}
async function links(tx,body,before={}) {
  if(body.vesselId===undefined&&body.voyageId===undefined&&(!before.vesselId||body.vesselName===undefined&&body.voyageNumber===undefined))return {};
  const vesselId=body.vesselId===undefined?before.vesselId:body.vesselId||null;const voyageId=body.voyageId===undefined?before.voyageId:body.voyageId||null;
  fail(!voyageId||vesselId,'Pilih kapal untuk voyage tersebut.');
  if(!vesselId)return {vesselId:null,voyageId:null};
  const vessel=await get(tx,text(vesselId,'Kapal',100));fail(vessel.isActive||before.vesselId===vesselId,'Kapal tidak aktif.');
  const name=body.vesselName===undefined?before.vesselName:body.vesselName;
  fail(vessel.aliases.some(a=>a.key===vesselKey(name))||vessel.normalizedName===vesselKey(name)||before.vesselId===vesselId&&name===before.vesselName,'Nama kapal pada B/L tidak sesuai dengan master yang dipilih.');
  if(voyageId){const voyage=await tx.voyage.findUnique({where:{id:text(voyageId,'Voyage',100)}});fail(voyage&&voyage.vesselId===vesselId,'Voyage tidak sesuai dengan kapal.');fail(voyage.isActive||before.voyageId===voyageId,'Voyage tidak aktif.');fail(voyage.normalizedNumber===voyageKey(body.voyageNumber??before.voyageNumber),'Nomor voyage pada B/L tidak sesuai dengan master yang dipilih.');}
  return {vesselId,voyageId};
}
async function match(tx,name,number) {
  const alias=await tx.vesselAlias.findUnique({where:{key:vesselKey(name)},include:{vessel:true}});
  if(!alias?.vessel.isActive)return {vessel:null,voyages:[]};
  const voyages=number?await tx.voyage.findMany({where:{vesselId:alias.vesselId,normalizedNumber:voyageKey(number),isActive:true},orderBy:{period:'desc'},take:50}):[];
  return {vessel:alias.vessel,voyages};
}
module.exports={vesselKey,voyageKey,include,get,save,saveVoyage,links,match};
