const { fail, text, date, integer, sum } = require('./jpt');
const { packingInclude, matchingRoute } = require('./packing');
const headerInclude = { job: { select: { jobNumber: true, jobType: true } }, packingLists: { include: packingInclude, orderBy: [{ documentDate: 'asc' }, { externalNumber: 'asc' }] } };
function presentHeader(header) {
  if (!header) return null;
  const rows = header.packingLists;
  const received = rows.filter(row => row.receiptStatus !== 'PENDING');
  return { ...header, summary: {
    documentCount: rows.length, receivedDocuments: received.length, pendingDocuments: rows.length - received.length,
    discrepancyDocuments: rows.filter(row => row.receiptStatus === 'DISCREPANCY').length,
    packages: rows.reduce((total, row) => total + row.packages, 0),
    netWeightKg: sum(rows, row => row.netWeightKg).toFixed(3), grossWeightKg: sum(rows, row => row.grossWeightKg).toFixed(3), volumeCbm: sum(rows, row => row.volumeCbm).toFixed(4),
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
