const { Prisma } = require('@prisma/client');
const { fail, text, decimal, integer, date, choice, sum, mutableJob } = require('./jpt');
const amount = (value, name, scale = 3) => decimal(Prisma.Decimal.isDecimal(value) ? value.toString() : value ?? 0, name, scale);
const optionalAmount = (value, name, scale) => value === undefined || value === null || value === '' ? null : amount(value, name, scale);
function declaredWeight(value, unit, name) {
  const measure = optionalAmount(value, name, 3);
  const factor = choice(unit || 'KG', ['KG', 'TON'], 'Weight unit') === 'TON' ? 1000 : 1;
  return measure?.mul(factor) ?? null;
}
const summaryKeys = ['externalNumber', 'documentDate', 'senderName', 'senderAddress', 'recipientName', 'recipientAddress', 'originCity', 'destCity', 'packages', 'netWeightKg', 'grossWeightKg', 'volumeCbm'];
function summaryReview(current, fields, confirmed, user) {
  const comparable = value => value instanceof Date ? value.toISOString() : value == null ? null : String(value);
  const changed = summaryKeys.some(key => comparable(current[key]) !== comparable(fields[key]));
  return confirmed === true ? { summaryCheckedAt: new Date(), summaryCheckedById: user.id }
    : changed ? { summaryCheckedAt: null, summaryCheckedById: null } : {};
}
function requireSummaryReview(record) {
  fail(record.summaryCheckedAt && record.summaryCheckedById, 'Check the summary against the original file before finalizing', 409);
}
async function validateOriginalIdentity(tx, jobId, fields, id) {
  const duplicate = await tx.packingList.findFirst({ where: { jobId, direction: 'INBOUND', ...(id ? { id: { not: id } } : {}), senderName: { equals: fields.senderName, mode: 'insensitive' }, externalNumber: { equals: fields.externalNumber, mode: 'insensitive' } }, select: { id: true } });
  fail(!duplicate, 'This sender packing list number is already recorded in this job', 409);
}
const packingInclude = {
  document: true, job: { select: { jobNumber: true, jobType: true } }, header: { select: { id: true, headerNumber: true, status: true } }, items: { orderBy: { sequence: 'asc' } },
  sources: { include: { source: { select: { id: true, recordNumber: true, externalNumber: true, senderName: true, documentDate: true } } } },
};
function packingItems(items) {
  fail(Array.isArray(items) && items.length <= 200, 'Packing list supports up to 200 item rows');
  return items.map((item, index) => {
    const quantity = amount(item.quantity, 'Quantity', 4); fail(quantity.gt(0), 'Quantity must be positive');
    const packages = integer(item.packages, 'Packages');
    const netWeightKg = amount(item.netWeightKg, 'Net weight'); const grossWeightKg = amount(item.grossWeightKg, 'Gross weight');
    fail(grossWeightKg.gte(netWeightKg), 'Gross weight must be at least net weight');
    const dimensions = ['lengthCm', 'widthCm', 'heightCm'].map(key => optionalAmount(item[key], 'Dimension', 3));
    fail(dimensions.every(value => value === null) || dimensions.every(value => value?.gt(0) && value.lte(1000000)), 'Enter all three positive dimensions or leave them empty');
    const volumeCbm = dimensions[0] ? dimensions[0].mul(dimensions[1]).mul(dimensions[2]).mul(packages).div(1000000).toDecimalPlaces(4) : amount(item.volumeCbm, 'Volume', 4);
    fail(volumeCbm.lte('999999999999'), 'Packing list totals exceed the allowed range');
    return { sequence: index + 1, description: text(item.description, 'Item description', 500), marks: text(item.marks, 'Package marks', 100, true), quantity, unit: text(item.unit, 'Unit', 20), packages, netWeightKg, grossWeightKg, lengthCm: dimensions[0], widthCm: dimensions[1], heightCm: dimensions[2], volumeCbm };
  });
}
function packingData(direction, body, company, current = {}) {
  const incoming = direction === 'INBOUND';
  const items = incoming ? [] : packingItems(body.items || []);
  if (incoming) fail(!body.items?.length && !body.sourceIds?.length, 'Original packing lists do not require item rows or source links');
  const packages = incoming ? integer(body.packages, 'Declared packages') : items.reduce((total, item) => total + item.packages, 0);
  const netWeightKg = incoming ? declaredWeight(body.netWeightKg, body.netWeightUnit, 'Net weight') : sum(items, item => item.netWeightKg);
  const grossWeightKg = incoming ? declaredWeight(body.grossWeightKg, body.grossWeightUnit, 'Gross weight') : sum(items, item => item.grossWeightKg);
  const volumeCbm = incoming ? optionalAmount(body.volumeCbm, 'Volume', 4) : sum(items, item => item.volumeCbm);
  fail(packages <= 1000000 && [netWeightKg, grossWeightKg, volumeCbm].every(value => value === null || value.lte('999999999999')), 'Packing list totals exceed the allowed range');
  fail(netWeightKg === null || grossWeightKg === null || grossWeightKg.gte(netWeightKg), 'Gross weight must be at least net weight');
  const fields = {
    externalNumber: incoming ? text(body.externalNumber, 'Original packing list number', 100) : null,
    documentDate: date(body.documentDate), senderName: incoming ? text(body.senderName, 'Sender', 200) : current.companyName || company.name,
    senderAddress: incoming ? text(body.senderAddress, 'Sender address', 2000, true) : current.companyAddress ?? company.address,
    recipientName: incoming ? current.companyName || company.name : text(body.recipientName, 'Recipient', 200),
    recipientAddress: text(body.recipientAddress || (incoming ? company.address : null), 'Recipient address', 2000, true),
    originCity: text(body.originCity, 'Origin', 100), destCity: text(body.destCity, 'Destination', 100),
    reference: text(body.reference, 'Reference', 200, true), notes: text(body.notes, 'Notes', 3000, true),
    packages, netWeightKg, grossWeightKg, volumeCbm,
    receiptStatus: incoming ? choice(body.receiptStatus || 'PENDING', ['PENDING', 'RECEIVED', 'DISCREPANCY'], 'Receipt status') : null,
    receivedAt: incoming ? date(body.receivedAt, true) : null, receivedBy: incoming ? text(body.receivedBy, 'Received by', 200, true) : null,
    actualPackages: incoming && body.actualPackages !== undefined && body.actualPackages !== null && body.actualPackages !== '' ? integer(body.actualPackages, 'Actual packages', 0) : null,
    actualWeightKg: incoming ? optionalAmount(body.actualWeightKg, 'Actual weight', 3) : null,
    actualVolumeCbm: incoming ? optionalAmount(body.actualVolumeCbm, 'Actual volume', 4) : null,
    discrepancyNotes: incoming ? text(body.discrepancyNotes, 'Discrepancy notes', 3000, true) : null,
  };
  if (incoming && fields.receiptStatus !== 'PENDING') {
    fail(fields.receivedAt && fields.receivedBy && fields.actualPackages !== null, 'Record receipt date, receiver and actual packages');
    const matches = fields.actualPackages === packages && (fields.actualWeightKg === null || grossWeightKg === null || fields.actualWeightKg.eq(grossWeightKg)) && (fields.actualVolumeCbm === null || volumeCbm === null || fields.actualVolumeCbm.eq(volumeCbm));
    fail(fields.receiptStatus !== 'RECEIVED' || matches, 'Use discrepancy status when actual quantities differ');
    fail(fields.receiptStatus !== 'DISCREPANCY' || fields.discrepancyNotes, 'Explain the receipt discrepancy');
  }
  const sourceIds = body.sourceIds || [];
  fail(Array.isArray(sourceIds) && sourceIds.length <= 50 && sourceIds.every(id => typeof id === 'string' && id.length <= 100) && new Set(sourceIds).size === sourceIds.length, 'Select distinct source packing lists');
  return { fields, items, sourceIds };
}
async function validateSources(tx, jobId, sourceIds) {
  if (!sourceIds.length) return;
  const count = await tx.packingList.count({ where: { id: { in: sourceIds }, jobId, direction: 'INBOUND', status: 'FINAL' } });
  fail(count === sourceIds.length, 'Sources must be finalized original packing lists from this job');
}
function requireDraft(record, version) {
  fail(record, 'Packing record not found', 404);
  fail(record.status === 'DRAFT', 'Final packing records are locked', 409);
  fail(integer(version, 'Version', 1) === record.version, 'Packing record changed; reload before saving', 409);
}
async function packingJob(tx, jobId, direction) {
  const job = await mutableJob(tx, jobId);
  fail(job.jobType === (direction === 'INBOUND' ? 'RECEIVER' : 'SENDER'), 'Packing direction must match the job type', 409);
  if (direction === 'INBOUND') {
    const header = await tx.packingHeader.findUnique({ where: { jobId } });
    fail(!header || header.status === 'DRAFT', 'Final packing headers are locked', 409);
  }
  return job;
}
async function touchHeader(tx, jobId, direction) {
  if (direction === 'INBOUND') await tx.packingHeader.updateMany({ where: { jobId, status: 'DRAFT' }, data: { version: { increment: 1 } } });
}
function matchingRoute(record, job) {
  const same = (a, b) => a.trim().toLocaleLowerCase('id') === b.trim().toLocaleLowerCase('id');
  fail(same(record.originCity, job.originCity) && same(record.destCity, job.destCity), 'Original packing lists must match the receiving job route');
}
module.exports = { packingItems, packingData, validateSources, requireDraft, packingInclude, packingJob, touchHeader, matchingRoute, summaryReview, requireSummaryReview, validateOriginalIdentity };
