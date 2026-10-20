const { fail, text, date, integer, sum } = require('./jpt');
const { packingInclude, matchingRoute } = require('./packing');
const headerInclude = { job: { select: { jobNumber: true, jobType: true } }, packingLists: { include: packingInclude, orderBy: [{ documentDate: 'asc' }, { externalNumber: 'asc' }] } };
function presentHeader(header) {
  if (!header) return null;
  const rows = header.packingLists;
  const received = rows.filter(row => row.receiptStatus !== 'PENDING');
  const keys = ['netWeightKg', 'grossWeightKg', 'volumeCbm'];
  const missingDocuments = Object.fromEntries(keys.map(key => [key, rows.filter(row => row[key] == null).length]));
  const knownTotals = Object.fromEntries(keys.map(key => [key, rows.every(row => row[key] == null) ? null : sum(rows, row => row[key]).toFixed(key === 'volumeCbm' ? 4 : 3)]));
  return { ...header, summary: {
    documentCount: rows.length, receivedDocuments: received.length, pendingDocuments: rows.length - received.length,
    discrepancyDocuments: rows.filter(row => row.receiptStatus === 'DISCREPANCY').length,
    packages: rows.reduce((total, row) => total + row.packages, 0),
    ...Object.fromEntries(keys.map(key => [key, missingDocuments[key] ? null : knownTotals[key]])),
    knownTotals, missingDocuments, uncheckedDocuments: rows.filter(row => !row.summaryCheckedAt).length,
    actualPackages: received.reduce((total, row) => total + row.actualPackages, 0),
  } };
}
function requireHeaderDraft(header, version) {
  fail(header, 'Packing header not found', 404);
  fail(header.status === 'DRAFT', 'Final packing headers are locked', 409);
  fail(integer(version, 'Version') === header.version, 'Packing header changed; reload before saving', 409);
}
async function headerData(tx, job, body, current) {
  const ids = body.packingListIds ?? current?.packingLists.map(row => row.id);
  fail(Array.isArray(ids) && ids.length > 0 && ids.length <= 200 && ids.every(id => typeof id === 'string') && new Set(ids).size === ids.length, 'Select between 1 and 200 distinct original packing lists');
  const rows = await tx.packingList.findMany({ where: { id: { in: ids }, jobId: job.id, direction: 'INBOUND' }, include: { document: true } });
  fail(rows.length === ids.length && rows.every(row => row.document.filename && (!row.headerId || row.headerId === current?.id)), 'Select original packing lists from this receiving job');
  rows.forEach(row => matchingRoute(row, job));
  return { ids, fields: {
    documentDate: date(body.documentDate ?? current?.documentDate),
    reference: text(body.reference ?? current?.reference, 'Reference', 200, true), notes: text(body.notes ?? current?.notes, 'Notes', 3000, true),
  } };
}
module.exports = { headerInclude, presentHeader, requireHeaderDraft, headerData };
