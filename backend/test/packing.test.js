const test = require('node:test');
const assert = require('node:assert/strict');
const { packingItems, packingData } = require('../src/services/packing');
const { closeJob } = require('../src/services/jpt');
const { presentHeader } = require('../src/services/packingHeader');
const row = { description: 'Equipment', quantity: '4', unit: 'UNIT', packages: 2, netWeightKg: '10.125', grossWeightKg: '12.125', lengthCm: '100', widthCm: '50', heightCm: '50', volumeCbm: 999 };
test('packing dimensions calculate volume per package, preserving decimal row weights', () => {
  const items = packingItems([row]); assert.equal(items[0].volumeCbm.toFixed(4), '0.5000'); assert.equal(items[0].grossWeightKg.toFixed(3), '12.125');
  for (const changes of [{ quantity: 0 }, { packages: 0 }, { grossWeightKg: 1 }, { heightCm: '' }, { lengthCm: -1 }, { lengthCm: 1000001 }]) assert.throws(() => packingItems([{ ...row, ...changes }]));
});
test('outgoing packing is independent of source documents; original incoming documents never create item rows', () => {
  const company = { name: 'SCMU', address: 'Merauke' }; const common = { documentDate: '2026-10-19', originCity: 'Surabaya', destCity: 'Merauke', recipientName: 'Receiver', recipientAddress: 'Merauke' };
  const outgoing = packingData('OUTBOUND', { ...common, senderName: 'Spoofed sender', packages: 999, items: [row] }, company);
  assert.equal(outgoing.fields.senderName, 'SCMU'); assert.equal(outgoing.fields.packages, 2); assert.equal(outgoing.fields.volumeCbm.toFixed(4), '0.5000'); assert.deepEqual(outgoing.sourceIds, []);
  const incoming = { ...common, senderName: 'Surabaya supplier', externalNumber: 'PL-ASAL-1', packages: 10, grossWeightKg: 120, receiptStatus: 'PENDING' };
  assert.equal(packingData('INBOUND', incoming, company).items.length, 0);
  assert.throws(() => packingData('INBOUND', { ...incoming, items: [row] }, company));
  assert.throws(() => packingData('INBOUND', { ...incoming, receiptStatus: 'RECEIVED', receivedAt: '2026-10-19', receivedBy: 'Staff', actualPackages: 8 }, company));
  assert.equal(packingData('INBOUND', { ...incoming, receiptStatus: 'DISCREPANCY', receivedAt: '2026-10-19', receivedBy: 'Staff', actualPackages: 8, discrepancyNotes: 'Two packages missing' }, company).fields.actualPackages, 8);
});
test('job close cannot bypass a packing draft even if a document status was changed elsewhere', async () => {
  await assert.rejects(closeJob({}, { status: 'DELIVERED', packingLists: [{ status: 'DRAFT' }] }), /Finalize packing/);
  await assert.rejects(closeJob({}, { jobType: 'RECEIVER', status: 'DELIVERED', packingHeader: { status: 'DRAFT' } }), /Finalize the receiving/);
  await assert.rejects(closeJob({}, { jobType: 'RECEIVER', status: 'CLOSED', packingHeader: { status: 'FINAL' } }), /already closed/);
  await assert.rejects(closeJob({}, { jobType: 'RECEIVER', status: 'DELIVERED', packingHeader: { status: 'FINAL' }, shipments: [{ status: 'IN_TRANSIT' }] }), /Complete all transport/);
});
test('packing header sums selected documents with decimal precision and counts receipt per original', () => {
  const header = presentHeader({ packingLists: [
    { packages: 10, netWeightKg: '0.1', grossWeightKg: '0.2', volumeCbm: '0.0001', receiptStatus: 'PENDING', actualPackages: null },
    { packages: 15, netWeightKg: '0.2', grossWeightKg: '0.4', volumeCbm: '0.0002', receiptStatus: 'RECEIVED', actualPackages: 15 },
    { packages: 5, netWeightKg: '0.3', grossWeightKg: '0.6', volumeCbm: '0.0003', receiptStatus: 'DISCREPANCY', actualPackages: 4 },
  ] });
  assert.deepEqual(header.summary, { documentCount: 3, receivedDocuments: 2, pendingDocuments: 1, discrepancyDocuments: 1, packages: 30, netWeightKg: '0.600', grossWeightKg: '1.200', volumeCbm: '0.0006', actualPackages: 19 });
});
