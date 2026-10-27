const ExcelJS = require('exceljs');
const { Prisma } = require('@prisma/client');
const { fail } = require('./jpt');
// Convert only at the XLSX boundary. Decimal verifies the conversion, not float arithmetic.
function excelAmount(value) {
  if (value == null || value === '') return null;
  fail(typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value), 'Register amount must be a canonical decimal string');
  const amount = new Prisma.Decimal(value);
  fail(amount.precision() <= 15, 'Register amount exceeds Excel 15-digit precision; narrow the export or correct the source amount');
  const numeric = Number(amount.toString());
  fail(Number.isFinite(numeric) && new Prisma.Decimal(String(numeric)).eq(amount), 'Register amount cannot be exported without precision loss');
  return numeric;
}
const COLUMNS = [
  ['billNumber','Nomor B/L'], ['vesselName','Nama kapal'], ['voyageNumber','Voyage'],
  ['carrierName','Pelayaran'], ['portOfLoading','Pelabuhan asal'], ['portOfDischarge','Pelabuhan tujuan'],
  ['departureDate','Tanggal keluar'], ['arrivalDate','Tanggal masuk'], ['dateMeaning','Makna tanggal'],
  ['quantity20','Jumlah 20'], ['quantity21','Jumlah 21'], ['quantity40','Jumlah 40'], ['cargoDescription','Uraian barang'],
  ['notes','Catatan'], ['partyName','Vendor/JPT'], ['partyText','Pihak penanggung jawab'],
  ['reference1','Nomor internal'], ['reference2','Nomor invoice'], ['additionalDate1','Tanggal invoice'],
  ['additionalDate2','Jatuh tempo'], ['registerAmount','Jumlah tagihan'], ['billingStatus','Status tagihan'], ['pph23Applicable','PPh 23 berlaku'], ['additionalNotes','Catatan tambahan'],
  ['shipperName','Pengirim'], ['consigneeName','Penerima'],
  ['billOfLadingAvailable','B/L tersedia'], ['packingListAvailable','Packing List tersedia'],
  ['createdAt','Tanggal dibuat (UTC)'], ['archived','Arsip'],
  ['supportingAvailable','Pendukung tersedia'], ['id','ID internal register'],
].map(([key, header]) => ({ key, header, width: key === 'registerAmount' ? 30 : 25 }));
const DATES = new Set(['departureDate','arrivalDate','additionalDate1','additionalDate2','createdAt']);
const QUANTITIES = new Set(['quantity20','quantity21','quantity40']);
async function buildWorkbook(records, metadata = {}) {
  fail(Array.isArray(records) && records.length <= 1048575, 'Export exceeds Excel row limit; narrow the filters');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Register', { views: [{ state:'frozen', ySplit:1, xSplit:1 }] });
  sheet.columns = COLUMNS;
  const seen = new Set();
  for (const record of records) {
    fail(typeof record.id === 'string' && record.id, 'Export record is missing its internal ID');
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    const register = record.register || record.registerData?.register || {};
    const attached = record.files || [];
    const flags = {
      billOfLadingAvailable: Boolean(record.documentAvailability?.billOfLading ?? record.availability?.billOfLading ?? (!record.registerData?.documentState?.blMissing && (record.document?.filename || attached.some(file => file.filename && ['DRAFT','FINAL','LEGACY'].includes(file.category)) || ['SEA_FINAL_RECEIVED','SEA_DRAFT_RECEIVED'].includes(record.receiptStatus)))),
      packingListAvailable: Boolean(record.availability?.packingList || record.documentAvailability?.packingList || attached.some(file => file.filename && file.category === 'PACKING_LIST') || (record.allocations || []).some(row => row.packingList?.document?.filename)),
      supportingAvailable: Boolean(record.availability?.supporting || attached.some(file => file.filename && file.category === 'SUPPORTING')),
      archived: Boolean(record.archivedAt || record.registerData?.archivedAt),
    };
    const row = sheet.addRow({});
    for (const column of COLUMNS) {
      const key = column.key;
      let value = key==='registerAmount'&&Object.hasOwn(record,key)?record[key]:register[key] ?? record[key] ?? null;
      const cell = row.getCell(key);
      if (Object.hasOwn(flags, key)) {
        cell.value = flags[key];
      } else if (DATES.has(key)) {
        const parsed = value ? new Date(value) : null;
        fail(!parsed || Number.isFinite(parsed.getTime()), `Export date ${key} is invalid`);
        cell.value = parsed;
        cell.numFmt = key==='createdAt'?'yyyy-mm-dd hh:mm:ss':'yyyy-mm-dd';
      } else if (QUANTITIES.has(key)) {
        cell.value = value == null ? null : Number(value);
        cell.numFmt = '0';
      } else if (key === 'registerAmount') {
        cell.value = excelAmount(value);
        cell.numFmt = '"Rp" #,##0.00';
      } else {
        const content = value == null ? null : String(value);
        fail(content == null || content.length <= 32767, `Export text cell ${key} exceeds Excel length limit`);
        cell.value = content;
        cell.numFmt = '@';
      }
    }
  }
  sheet.getRow(1).font = { bold:true };
  sheet.autoFilter = { from:{ row:1, column:1 }, to:{ row:Math.max(1,sheet.rowCount), column:COLUMNS.length } };
  const notes = workbook.addWorksheet('Assumptions');
  notes.columns = [{header:'Topic',key:'topic',width:28},{header:'Details',key:'details',width:120}];
  notes.addRows([
    {topic:'Billing fields', details:'Vendor, invoice, due date and billing amount are copied from the physical register or source invoice and still require finance verification.'},
    {topic:'Packing list', details:'The requirement follows the B/L document policy: partner-supplied packing list or SCMU internal packing list.'},
    {topic:'PPh 23', details:'The 2% deduction is calculated only when explicitly marked applicable; finance must verify its tax basis and supporting certificate.'},
    {topic:'Dates', details:'Dates use ISO yyyy-mm-dd display; date meanings remain unconfirmed unless recorded by the operator.'},
    {topic:'Export scope',details:String(metadata.scope || 'filtered')},
    {topic:'Filters',details:JSON.stringify(metadata.filters || {})},
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
const { STAFF, route, transaction, choice } = require('./jpt');
const { authenticate, authorize } = require('../middleware/auth');
const exportHandler = route(async (req, res) => {
  const scope = choice(req.query.scope || 'filtered', ['filtered','all'], 'Export scope');
  const filters = Object.fromEntries(Object.entries(req.query).filter(([key]) => !['scope','page','limit','skip','take','offset'].includes(key)));
  const query = scope === 'all'
    ? Object.fromEntries(Object.entries(filters).filter(([key]) => ['sort','direction','sortBy','sortOrder','archived'].includes(key)))
    : filters;
  const records = await transaction(tx => require('./blRegister').collectAll(tx, query));
  fail(Array.isArray(records), 'Export collector must return the complete register array', 500);
  const buffer = await buildWorkbook(records, { scope, filters:query });
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', 'attachment; filename="register-pengiriman.xlsx"');
  res.set('Cache-Control', 'no-store');
  res.send(buffer);
});
const router = require('express').Router();
router.use(authenticate, authorize(...STAFF));
router.get('/export.xlsx', exportHandler);
module.exports = { COLUMNS, buildWorkbook, exportHandler, router };
