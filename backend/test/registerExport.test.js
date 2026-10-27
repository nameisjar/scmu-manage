const test=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const path=require('node:path');
const manual=['billNumber','vesselName','voyageNumber','carrierName','portOfLoading','portOfDischarge','departureDate','arrivalDate','dateMeaning','quantity20','quantity21','quantity40','cargoDescription','notes','partyName','partyText','reference1','reference2','additionalDate1','additionalDate2','registerAmount','billingStatus','pph23Applicable','additionalNotes','shipperName','consigneeName','billOfLadingAvailable','packingListAvailable','createdAt','archived'];
function feature() {
  const filename=path.resolve(__dirname,'../src/services/registerExport.js');
  assert.equal(require('node:fs').existsSync(filename),true,'genuine XLSX service must exist');
  return require(filename);
}
async function load(buffer) {const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);return book;}
function record(id='bill') {return {id,registerNumber:'00001',vesselName:'Vessel',voyageNumber:'00007',billNumber:'00000123',portOfLoading:'Surabaya',notes:'Original note',carrierName:'Carrier',portOfDischarge:'Destination',shipperName:'Shipper',consigneeName:'Consignee',containers:[{number:'C1',size:'20'},{number:'C2',size:'20'},{number:'C3',size:'40'}],register:{quantity20:2,quantity21:0,quantity40:1,departureDate:'2026-10-01T00:00:00.000Z',arrivalDate:'2026-10-02T00:00:00.000Z',cargoDescription:'Cargo',partyName:'Company',partyText:'SCMU',reference1:'000098',reference2:'=HYPERLINK("https://example.invalid")',additionalDate1:'2026-10-03T00:00:00.000Z',additionalDate2:'2026-10-04T00:00:00.000Z',registerAmount:'1234567890.12',additionalNotes:'Needs confirmation'},files:[],allocations:[]};}
test('numeric Rp serialization rejects Excel precision loss instead of silently rounding canonical decimal money',async()=>{
  const service=feature();
  for(const value of ['12345678901234.56','99999999999999.99','9007199254740993','1e3','1,000.00',123.45]) {
    const row=record();row.register.registerAmount=value;
    await assert.rejects(service.buildWorkbook([row]),error=>error.status===422 && /amount|precision|decimal/i.test(error.message));
  }
  for(const value of ['0.01','9999999999999.99','-1234567.89','0.00']) {
    const row=record();row.register.registerAmount=value;
    const book=await load(await service.buildWorkbook([row]));
    assert.equal(String(book.getWorksheet('Register').getRow(2).getCell(service.COLUMNS.findIndex(column=>column.key==='registerAmount')+1).value),String(Number(value)));
  }
});
test('one row per internal bill ID retains historical duplicate BL numbers and legacy originals with optional packing availability',async()=>{
  const first=record('first');first.files=[{id:'draft',filename:'draft.pdf',category:'DRAFT'},{id:'support',filename:'support.pdf',category:'SUPPORTING'}];
  first.registerData={archivedAt:'2026-10-25T00:00:00Z'};
  const second=record('second');second.document={filename:'old.pdf'};second.allocations=[{packingList:{document:{filename:'pl.pdf'}}}];
  const third=record('third');third.files=[{category:'PACKING_LIST',filename:'attached-pl.pdf'}];
  const service=feature();const book=await load(await service.buildWorkbook([first,first,second,third]));
  const sheet=book.getWorksheet('Register');assert.equal(sheet.rowCount,4);
  const cells=(row,key)=>sheet.getRow(row).getCell(service.COLUMNS.findIndex(column=>column.key===key)+1).value;
  assert.deepEqual([2,3,4].map(row=>cells(row,'id')),['first','second','third']);
  assert.equal(cells(2,'billNumber'),cells(3,'billNumber'));
  assert.equal(cells(2,'billOfLadingAvailable'),true);assert.equal(cells(2,'packingListAvailable'),false);
  assert.equal(cells(2,'supportingAvailable'),true);assert.equal(cells(2,'archived'),true);
  assert.equal(cells(3,'billOfLadingAvailable'),true);assert.equal(cells(3,'packingListAvailable'),true);
  assert.equal(cells(4,'packingListAvailable'),true);assert.equal(cells(4,'billOfLadingAvailable'),false);
  assert.equal(cells(3,'carrierName'),'Carrier');
});
test('authenticated XLSX endpoint exports every collected row, forwards filters but not pagination and clears filters only for all scope',async()=>{
  const express=require('express');const prisma=require('../src/prisma');const register=require('../src/services/blRegister');
  const original=register.collectAll,originalTransaction=prisma.$transaction;const queries=[];
  const records=Array.from({length:255},(_,index)=>({...record(`bill-${index}`),registerNumber:String(index).padStart(5,'0')}));
  register.collectAll=async(tx,query)=>{assert.equal(tx,prisma);queries.push(query);return records;};prisma.$transaction=async fn=>fn(prisma);
  const app=express();app.use((req,res,next)=>{if(req.headers['x-role'])req.user={id:'admin',role:req.headers['x-role']};next();});
  const service=feature();assert.equal(typeof service.exportHandler,'function');assert.equal(typeof service.router,'function');
  app.use('/api/bl-register',service.router);app.get('/api/bl-register/:id',(req,res)=>res.status(418).json({message:'generic detail route'}));
  app.use((error,req,res,next)=>res.status(error.status||500).json({message:error.message}));
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const root=`http://127.0.0.1:${server.address().port}/api/bl-register/export.xlsx`;
  try {
    for(const [role,status] of [[null,401],['MARKETING',403],['CUSTOMER',403]]) {const response=await fetch(root,{headers:role?{'x-role':role}:{}});assert.equal(response.status,status);}
    assert.equal(queries.length,0);
    const filtered=await fetch(`${root}?scope=filtered&search=000&vessel=Vessel&voyage=007&party=Company&dateFrom=2026-10-01&sortBy=billNumber&sortOrder=asc&page=2&limit=1`,{headers:{'x-role':'ADMIN'}});
    assert.equal(filtered.status,200);assert.match(filtered.headers.get('content-type'),/application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet/);assert.match(filtered.headers.get('content-disposition'),/attachment;.*\.xlsx/);
    const book=await load(Buffer.from(await filtered.arrayBuffer()));assert.equal(book.getWorksheet('Register').rowCount,256);
    assert.deepEqual(queries[0],{search:'000',vessel:'Vessel',voyage:'007',party:'Company',dateFrom:'2026-10-01',sortBy:'billNumber',sortOrder:'asc'});
    const all=await fetch(`${root}?scope=all&search=ignored&vessel=ignored&sortBy=billNumber&sortOrder=asc&page=99&limit=1`,{headers:{'x-role':'SUPER_ADMIN'}});
    assert.equal(all.status,200);assert.deepEqual(queries[1],{sortBy:'billNumber',sortOrder:'asc'});
    assert.equal((await load(Buffer.from(await all.arrayBuffer()))).getWorksheet('Register').rowCount,256);
    const invalid=await fetch(`${root}?scope=current-page`,{headers:{'x-role':'ADMIN'}});assert.equal(invalid.status,422);assert.equal(queries.length,2);
  } finally {register.collectAll=original;prisma.$transaction=originalTransaction;await new Promise(resolve=>server.close(resolve));}
});
test('export rejects invalid dates and Excel size limits instead of silently losing source values',async()=>{
  const service=feature();
  const badDate=record();badDate.register.additionalDate1='not a date';
  await assert.rejects(service.buildWorkbook([badDate]),error=>error.status===422 && /date/i.test(error.message));
  const badText=record();badText.notes='x'.repeat(32768);
  await assert.rejects(service.buildWorkbook([badText]),error=>error.status===422 && /text|cell|length/i.test(error.message));
  await assert.rejects(service.buildWorkbook(new Array(1048576)),error=>error.status===422 && /row|limit/i.test(error.message));
});
test('real workbook roundtrips all manual columns in order with text identifiers, native dates, numeric Rp and assumptions',async()=>{
  const service=feature();
  const buffer=await service.buildWorkbook([record()],{scope:'filtered',filters:{vessel:'Vessel'}});
  assert.ok(Buffer.isBuffer(buffer));assert.equal(buffer.subarray(0,2).toString(),'PK');
  const book=await load(buffer);const sheet=book.getWorksheet('Register');
  assert.deepEqual(service.COLUMNS.slice(0,manual.length).map(row=>row.key),manual);
  assert.deepEqual(sheet.getRow(1).values.slice(1,manual.length+1),service.COLUMNS.slice(0,manual.length).map(row=>row.header));
  const cell=key=>sheet.getRow(2).getCell(service.COLUMNS.findIndex(row=>row.key===key)+1);
  assert.equal(cell('billNumber').value,'00000123');assert.equal(cell('reference1').value,'000098');
  assert.equal(cell('reference2').value,'=HYPERLINK("https://example.invalid")');assert.equal(cell('reference2').type,ExcelJS.ValueType.String);
  assert.equal(cell('billNumber').numFmt,'@');assert.equal(cell('quantity20').value,2);
  assert.equal(cell('quantity21').value,0);assert.equal(cell('quantity40').value,1);
  assert.equal(cell('registerAmount').value,1234567890.12);assert.match(cell('registerAmount').numFmt,/Rp/);
  assert.equal(cell('departureDate').value.toISOString(),'2026-10-01T00:00:00.000Z');assert.equal(cell('departureDate').numFmt,'yyyy-mm-dd');
  const assumptions=book.getWorksheet('Assumptions').getSheetValues().flat(2).join(' ');
  assert.match(assumptions,/unconfirmed/i);assert.match(assumptions,/packing.*policy/i);assert.match(assumptions,/PPh 23/i);
});

test('empty book quantities remain empty even with numbered containers and canonical amount wins over legacy JSON',async()=>{
 const service=feature();const row=record();row.register.quantity20=null;delete row.register.quantity21;row.register.quantity40=0;row.registerAmount=null;
 const book=await load(await service.buildWorkbook([row]));const sheet=book.getWorksheet('Register');
 const cell=key=>sheet.getRow(2).getCell(service.COLUMNS.findIndex(column=>column.key===key)+1).value;
 assert.equal(cell('quantity20'),null);assert.equal(cell('quantity21'),null);assert.equal(cell('quantity40'),0);assert.equal(cell('registerAmount'),null);
});
