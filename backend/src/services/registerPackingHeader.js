const ExcelJS = require('exceljs');
const { fail, text, audit } = require('./jpt');
const register = require('./blRegister');
const workspace = require('./blWorkspace');
const sea = require('./seaBills');
const { canonical, MIME } = require('./packingImport');
const { randomUUID } = require('node:crypto');
const day = value => value ? new Date(value).toISOString().slice(0, 10) : null;
const issueLabels = {
  PACKING_SOURCE_MISSING: 'Berkas sumber Packing List belum dipilih',
  PACKING_TRANSCRIPTION_MISSING: 'Rincian Packing List belum ditranskripsikan',
  CONTAINER_MISSING_IN_PACKING: 'Sebagian kontainer B/L belum tercakup dalam transkripsi',
  CONTAINER_NOT_ON_BL: 'Transkripsi memuat kontainer di luar B/L',
  SEAL_DIFFERENCE: 'Nomor segel berbeda antara B/L dan Packing List',
  SIZE_DIFFERENCE: 'Ukuran kontainer berbeda antara B/L dan Packing List',
  PACKAGE_TOTAL_DIFFERENCE: 'Total koli berbeda antara B/L dan Packing List',
  VOLUME_TOTAL_DIFFERENCE: 'Total CBM berbeda antara B/L dan Packing List',
  VOLUME_UNIT_OR_VALUE_UNCONFIRMED: 'Satuan atau nilai volume belum dikonfirmasi',
};

function snapshot(bills, headerNumber) {
  fail(bills.length > 0 && bills.length <= 40, 'Select up to 40 B/L records');
  const first = bills[0];
  if(first.voyageId||bills.some(b=>b.voyageId))fail(bills.every(b=>b.voyageId===first.voyageId&&b.vesselId===first.vesselId),'Select B/L records from the same master vessel and voyage period');
  fail(first.vesselName && first.voyageNumber, 'Complete vessel and voyage before creating a Packing Header');
  fail(bills.every(b => canonical(b.vesselName) === canonical(first.vesselName) && canonical(b.voyageNumber) === canonical(first.voyageNumber)), 'Select B/L records from the same vessel and voyage');
  const warnings = []; const seen = new Set();
  const records = bills.map(bill => {
    fail(!bill.archivedAt && !bill.registerData?.archivedAt, 'Archived register records are read-only', 409);
    fail(bill.registerData?.register?.includeInPackingHeader !== false, 'This B/L is excluded from the Packing Header');
    const operational = workspace.operationalOf(bill);
    if(bill.registerData?.internalPackingList&&bill.registerData.internalPackingList.sourceType!=='UPLOADED')fail(require('./internalPacking').ready(bill),`${bill.billNumber}: Sumber PL internal berubah. Buat ulang PL internal sebelum membuat Kepala Packing List.`,409);
    const internalSource=require('./internalPacking').currentSource(bill);
    if(internalSource)operational.packing={...operational.packing,status:'CONFIRMED',sourceFileIds:internalSource.sources.map(s=>s.id),groups:internalSource.groups};
    const groups = operational.packing.groups;
    const book = bill.registerData?.register || {};
    const containers = register.normalize({}, bill).containers;
    fail(containers.length, `Record containers on B/L ${bill.billNumber} first`);
    if (groups.length && operational.packing.status !== 'CONFIRMED') warnings.push(`${bill.billNumber}: Transkripsi Packing List masih berupa draf`);
    if (!groups.length) warnings.push(`${bill.billNumber}: Belum ada transkripsi; ringkasan memakai uraian kontainer yang diisi manual`);
    const result = workspace.reconciliation(bill, operational);
    if (groups.length) for (const issue of result.issues) warnings.push(`${bill.billNumber}: ${issueLabels[issue] || 'Data Packing List perlu diperiksa'}`);
    return { id: bill.id, version: bill.version, billNumber: bill.billNumber, shipperName: bill.shipperName, consigneeName: bill.consigneeName,
      departureDate: book.departureDate || null, arrivalDate: book.arrivalDate || null,
      storageUntil: operational.deadlines.storageUntil, demurrageFrom: operational.deadlines.demurrageFrom,
      sourceFileIds: operational.packing.sourceFileIds, packingStatus: operational.packing.status,
      containers: containers.map(c => {
        const key = canonical(c.number); fail(!seen.has(key), `Container ${c.number} appears on multiple selected B/L records; resolve it first`); seen.add(key);
        const linked = groups.filter(g => g.containerNumber === c.number);
        const descriptions = [...new Set(linked.flatMap(g => g.dataLevel==='SUMMARY'?[g.goodsSummary]:g.items.map(i => i.description)).filter(Boolean))];
        const fullDescription = c.goodsDescription || descriptions.join('; ') || book.cargoDescription || null;
        // Keep the header compact enough to print; full item data stays in Rincian PL.
        const description = fullDescription?.length > 700 ? `${fullDescription.slice(0, 650)}… (rincian pada sheet Rincian PL)` : fullDescription;
        if (!c.size) warnings.push(`${bill.billNumber} / ${c.number}: Ukuran kontainer belum dikonfirmasi`);
        if (!description) warnings.push(`${bill.billNumber} / ${c.number}: Uraian barang belum diisi`);
        return { number: c.number, seal: c.seal, size: c.size, description,
          recipients: linked.map(g => g.recipientName).filter(Boolean), packages: linked.length&&linked.every(g=>g.dataLevel!=='SUMMARY'&&g.items.every(i=>!i.packageUnit||i.packageUnit==='KOLI')) ? linked.reduce((n, g) => n + g.items.reduce((s, i) => s + i.packages, 0), 0) : null };
      }), groups };
  });
  return { schema: 1, headerNumber, vesselName: first.vesselName, voyageNumber: first.voyageNumber, generatedAt: new Date().toISOString(),
    counts: { bills: records.length, containers: seen.size, size20: records.flatMap(r => r.containers).filter(c => c.size === '20').length, size21: records.flatMap(r => r.containers).filter(c => c.size === '21').length, size40: records.flatMap(r => r.containers).filter(c => c.size === '40').length, unknownSize: records.flatMap(r => r.containers).filter(c => !c.size).length },
    records, warnings };
}
async function read(tx, selection, number) {
  fail(Array.isArray(selection) && selection.length && selection.length <= 40 && selection.every(row=>row&&typeof row.id==='string'&&row.id.length<=100&&Number.isInteger(row.version)&&row.version>0) && new Set(selection.map(row => row.id)).size === selection.length, 'Select distinct versioned B/L records, maximum 40');
  const bills = [];
  for (const row of [...selection].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const bill = await register.get(tx, row.id);
    await sea.getBill(tx, bill.jobId, bill.id, row.version);
    bills.push(bill);
  }
  const headerNumber = text(number ?? `KPL-SCMU-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`, 'Packing Header number', 100);
  return { bills, data: snapshot(bills, headerNumber) };
}

async function workbook(data) {
  const book = new ExcelJS.Workbook(); book.creator = 'PT SCMU'; book.created = new Date(data.generatedAt);
  const sheet = book.addWorksheet('Kepala Packing List', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 } } });
  sheet.columns = [{ width: 7 }, { width: 23 }, { width: 20 }, { width: 12 }, { width: 55 }, { width: 12 }];
  function band(label, color = 'FFE8EFFC') {
    const row = sheet.addRow([label]); sheet.mergeCells(row.number, 1, row.number, 6); row.height = Math.max(25, Math.ceil(String(label).length / 100) * 16);
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; row.getCell(1).font = { bold: true, size: 11 };
    row.getCell(1).alignment = { vertical: 'middle', wrapText: true }; return row;
  }
  band('PT SCMU — KEPALA PACKING LIST', 'FFFFB3DA');
  band(`${data.vesselName} / VOY ${data.voyageNumber}`);
  band(data.headerNumber);
  band(`Kontainer: ${data.counts.containers} | 20': ${data.counts.size20} | 21': ${data.counts.size21} | 40': ${data.counts.size40} | Belum diketahui: ${data.counts.unknownSize}`);
  sheet.pageSetup.printTitlesRow = '1:4';
  for (const record of data.records) {
    sheet.addRow([]);
    band(`PENGIRIM: ${record.shipperName || '—'}`, 'FFFFB3DA');
    band(`PENERIMA: ${record.consigneeName || '—'}`, 'FFFFFF99');
    band(`NO. B/L: ${record.billNumber}`);
    band(`Keluar: ${day(record.departureDate) || '—'} | Masuk: ${day(record.arrivalDate) || '—'}`);
    band(`Batas storage: ${day(record.storageUntil) || '—'} | Mulai demurrage: ${day(record.demurrageFrom) || '—'}`, 'FFFFE5E5');
    const heading = sheet.addRow(['NO', 'KONTAINER', 'SEGEL', 'UKURAN', 'RINGKASAN BARANG / MARK', 'KOLI']);
    heading.font = { bold: true };
    record.containers.forEach((c, i) => {
      const rawMarks = c.recipients.join('; '); const marks = rawMarks.length > 300 ? `${rawMarks.slice(0, 250)}… (lihat Rincian PL)` : rawMarks;
      const summary = [c.description || '—', marks ? `Mark: ${marks}` : null].filter(Boolean).join('\n');
      const row = sheet.addRow([i + 1, c.number, c.seal || '—', c.size ? `${c.size}'` : '—', summary, c.packages]);
      row.height = Math.max(32, Math.min(409, Math.ceil(summary.length / 40) * 15));
      row.eachCell(cell => { cell.alignment = { vertical: 'top', wrapText: true }; cell.border = { bottom: { style: 'thin', color: { argb: 'FFD4D4D8' } } }; });
    });
  }
  if (data.warnings.length) { sheet.addRow([]); band('CATATAN PEMERIKSAAN'); for (const warning of data.warnings) { const row = band(warning, 'FFFFF3D6'); row.height = Math.max(30, Math.ceil(warning.length / 110) * 15); } }
  sheet.pageSetup.printArea = `A1:F${sheet.rowCount}`;
  sheet.headerFooter.oddFooter = '&LPT SCMU&C&P / &N';
  const details = book.addWorksheet('Rincian PL');
  details.columns = ['B/L', 'Kontainer', 'Segel', 'Mark', 'Tanggal sumber', 'Tanggal terkonfirmasi', 'Toko', 'Barang', 'Koli', 'P (cm)', 'L (cm)', 'T (cm)', 'CBM terkonfirmasi', 'M3/TN sumber', 'ID file sumber', 'Sheet sumber', 'Baris sumber'].map((header, index) => ({ header, key: String(index), width: [3, 7].includes(index) ? 45 : 22 }));
  for (const record of data.records) for (const group of record.groups) for (const item of group.items) details.addRow([record.billNumber, group.containerNumber, group.sealNumber, group.recipientName, item.itemDateText, day(item.itemDate), item.shop, item.description, item.packages, item.lengthCm == null ? null : Number(item.lengthCm), item.widthCm == null ? null : Number(item.widthCm), item.heightCm == null ? null : Number(item.heightCm), item.volumeCbm == null ? null : Number(item.volumeCbm), item.sourceVolume == null ? null : Number(item.sourceVolume), group.sourceFileId, item.sourceSheet, item.sourceRow]);
  details.getRow(1).font = { bold: true }; details.views = [{ state: 'frozen', ySplit: 1 }]; details.autoFilter = `A1:Q${details.rowCount}`;
  return book;
}
async function save(tx, user, body, filename, size, expected) {
  fail(body.confirmed === true, 'Review and confirm the Packing Header first');
  const { bills, data } = await read(tx, body.selection, body.headerNumber);
  // The file was generated from this exact versioned selection before entering the transaction.
  fail(data.records.every((r, i) => r.id === expected.records[i].id && r.version === expected.records[i].version), 'B/L data changed; preview the Packing Header again', 409);
  fail(!data.warnings.length || body.acceptWarnings === true, 'Review and acknowledge the Packing Header warnings');
  const originalName = `${data.headerNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`;
  for (const bill of bills) {
    await tx.seaBillFile.create({ data: { billId: bill.id, category: 'PACKING_HEADER', contentVersion: bill.contentVersion, filename, originalName, mimeType: MIME, size, uploadedById: user.id, note: `Internal SCMU Packing Header; ${data.headerNumber}` } });
    const operational = workspace.operationalOf(bill);
    operational.packing.headerNumber = data.headerNumber; operational.packing.headerStatus = 'READY';
    await tx.seaBill.update({ where: { id: bill.id }, data: { registerData: { ...bill.registerData, operational }, version: { increment: 1 } } });
    await audit(tx, user, 'PACKING_HEADER_CREATED', 'JobOrder', bill.jobId, { seaBillId: bill.id, filename, snapshot: expected });
  }
  return data;
}
module.exports = { snapshot, read, workbook, save };
