import test from 'node:test';
import assert from 'node:assert/strict';
import { createPackingListHtml } from './packingTemplate.mjs';
import { createPackingHeaderHtml } from './packingHeaderTemplate.mjs';
import { translate } from '../../i18n/translations.mjs';
const sample = { direction: 'OUTBOUND', status: 'FINAL', recordNumber: 'PL-SCMU-1', documentDate: '2026-10-19', companyName: 'SCMU', companyAddress: 'Merauke', senderName: 'SCMU', recipientName: '<script>alert(1)</script>', recipientAddress: 'Merauke & Papua', originCity: 'Surabaya', destCity: 'Merauke', packages: 2, netWeightKg: '10', grossWeightKg: '12', volumeCbm: '0.5000', job: { jobNumber: 'JOB-1' }, items: [{ sequence: 1, description: 'Equipment <img src=x>', quantity: 4, unit: 'UNIT', packages: 2, netWeightKg: 10, grossWeightKg: 12, volumeCbm: 0.5 }], sources: [] };
test('only final outbound records print, with escaped parties/items and repeatable A4 headers', () => {
  assert.throws(() => createPackingListHtml({ ...sample, direction: 'INBOUND' })); assert.throws(() => createPackingListHtml({ ...sample, status: 'DRAFT' }));
  const html = createPackingListHtml(sample);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')); assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img src=x&gt;')); assert.ok(html.includes('size:A4')); assert.ok(html.includes('display:table-header-group'));
  assert.ok(!html.includes('Selected source documents')); assert.ok(!html.includes('invoice'));
});
test('packing print supports Indonesian and English without altering source data', () => {
  const before = JSON.stringify(sample);
  const id = createPackingListHtml(sample, { t: key => translate('id', key), locale: 'id-ID', language: 'id' });
  const en = createPackingListHtml(sample, { t: key => translate('en', key), locale: 'en-GB', language: 'en' });
  assert.ok(id.includes('Packing list keluar SCMU')); assert.ok(id.includes('Berat kotor (kg)')); assert.ok(en.includes('Outgoing packing list'));
  assert.equal(JSON.stringify(sample), before);
});
test('receiving head prints all selected originals, marks drafts, escapes data and supports both languages', () => {
  const header = { companyName: 'SCMU', headerNumber: 'KPL-1', documentDate: '2026-10-19', status: 'DRAFT', originCity: 'Surabaya', destCity: 'Merauke', job: { jobType: 'RECEIVER', jobNumber: 'JOB-R' }, summary: { documentCount: 2, packages: 30, netWeightKg: 3300, grossWeightKg: 3600, volumeCbm: 19.5, receivedDocuments: 1, discrepancyDocuments: 0 }, packingLists: [
    { externalNumber: 'PL-A-1', documentDate: '2026-10-19', senderName: 'A <script>x</script>', packages: 10, netWeightKg: 1100, grossWeightKg: 1200, volumeCbm: 6.5, receiptStatus: 'PENDING' },
    { externalNumber: 'PL-A-2', documentDate: '2026-10-19', senderName: 'A', packages: 20, netWeightKg: 2200, grossWeightKg: 2400, volumeCbm: 13, receiptStatus: 'RECEIVED', actualPackages: 20 },
  ] };
  const before = JSON.stringify(header);
  const html = createPackingHeaderHtml(header, { t: key => translate('id', key) });
  assert.ok(html.includes('Kepala packing list penerimaan') && html.includes('PL-A-1') && html.includes('PL-A-2'));
  assert.ok(html.includes('Draf') && html.includes('Verifikasi penerimaan belum selesai'));
  assert.ok(html.includes('&lt;script&gt;') && !html.includes('<script>'));
  assert.ok(html.includes('A4 landscape') && html.includes('display:table-header-group'));
  const final = createPackingHeaderHtml({ ...header, status: 'FINAL' }, { t: key => translate('en', key), language: 'en' });
  assert.ok(final.includes('Receiving packing header') && !final.includes('class="draft"'));
  assert.equal(JSON.stringify(header), before);
  assert.throws(() => createPackingHeaderHtml({ ...header, job: { jobType: 'SENDER' } }));
});
