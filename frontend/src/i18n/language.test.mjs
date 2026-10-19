import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, indonesia, isLanguage, readLanguage, translate } from './translations.mjs';
import { createInvoiceHtml } from '../pages/Invoices/invoiceTemplate.mjs';
import { retryAfterSeconds } from '../api/retryAfter.mjs';
import { downloadCsv } from '../utils/format.mjs';
import { isInternalRole } from '../auth-policy.mjs';

test('SCMU admits only Super Admin and Admin login roles', () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN']) assert.equal(isInternalRole(role), true);
  for (const role of ['CUSTOMER','TRANSPORTER','MANAGER','OPERATOR','VIEWER',null,'', 'SUPER ADMIN']) assert.equal(isInternalRole(role), false);
});

test('login cooldown follows Retry-After headers in seconds or HTTP date format', () => {
  const now = Date.parse('2026-10-18T00:00:00Z');
  assert.equal(retryAfterSeconds('45', now), 45);
  assert.equal(retryAfterSeconds('Sun, 18 Oct 2026 00:02:00 GMT', now), 120);
  assert.equal(retryAfterSeconds('0', now), 1);
  assert.equal(retryAfterSeconds(undefined, now), 60);
  assert.equal(retryAfterSeconds('invalid', now), 60);
  assert.equal(translate('id', 'Too many requests, please try again later.'), 'Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi.');
  assert.equal(translate('id', 'Try again in {seconds}s', { seconds: 45 }), 'Coba lagi dalam 45 detik');
});

test('language preferences recover from missing, invalid, or unavailable storage', () => {
  assert.equal(DEFAULT_LANGUAGE, 'id');
  assert.equal(readLanguage(), 'id');
  assert.equal(readLanguage({ getItem: key => key === LANGUAGE_STORAGE_KEY ? 'en' : null }), 'en');
  for (const value of ['fr', '', null, '__proto__', 'constructor']) {
    assert.equal(readLanguage({ getItem: () => value }), 'id');
  }
  assert.equal(readLanguage({ getItem() { throw new Error('Storage is disabled'); } }), 'id');
  assert.equal(isLanguage('en'), true);
  assert.equal(isLanguage('id'), true);
  assert.equal(isLanguage('constructor'), false);
});

test('both languages translate UI, enum labels, and dynamic counts', () => {
  assert.equal(translate('id', 'Sign in'), 'Masuk');
  assert.equal(translate('en', 'Sign in'), 'Sign in');
  assert.equal(translate('id', 'IN_TRANSIT'), 'Dalam perjalanan');
  assert.equal(translate('en', 'IN_TRANSIT'), 'In transit');
  assert.equal(translate('id', 'SUPER ADMIN'), 'Admin utama');
  assert.equal(translate('id', 'Page {page} of {total}', { page: 2, total: 5 }), 'Halaman 2 dari 5');
  assert.equal(translate('en', 'Page {page} of {total}', { page: 2, total: 5 }), 'Page 2 of 5');
  assert.equal(translate('id', 'SCMU Logistics - SHP-123'), 'SCMU Logistics - SHP-123');
  assert.equal(translate('en', null), '');
});

test('translation catalogue preserves interpolation placeholders', () => {
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [key, value] of Object.entries(indonesia)) {
    assert.deepEqual(placeholders(value), placeholders(key), key);
  }
});

const invoice = {
  invoiceNumber: 'SCMU-INV-001', status: 'PAID', freightAmount: 35000, gstAmount: 0,
  totalAmount: 35000, currency: 'IDR', invoiceDate: '2026-10-18T00:00:00.000Z',
  company: { name: 'SCMU <script>alert(1)</script>', email: 'info@scmu.local' },
  shipment: { shipmentNumber: 'SCMU-SHP-001', originCity: 'Surabaya', destCity: 'Merauke' },
  notes: 'Sample & demo',
};

test('printed invoice follows selected language and locale without changing business data', () => {
  const original = structuredClone(invoice);
  const options = { generatedAt: new Date('2026-10-18T00:00:00.000Z') };
  const id = createInvoiceHtml(invoice, { ...options, language: 'id' });
  const en = createInvoiceHtml(invoice, { ...options, language: 'en' });
  assert.ok(id.includes('<html lang="id">'));
  assert.ok(id.includes('Ditagihkan Kepada'));
  assert.ok(id.includes('Tanggal Invoice'));
  assert.ok(id.includes('Lunas'));
  assert.ok(id.includes('35.000'));
  assert.ok(en.includes('<html lang="en">'));
  assert.ok(en.includes('Bill To'));
  assert.ok(en.includes('Paid'));
  assert.ok(en.includes('35,000'));
  for (const html of [id, en]) {
    assert.ok(html.includes('SCMU-INV-001'));
    assert.ok(html.includes('Merauke'));
    assert.ok(html.includes('info@scmu.local'));
    assert.ok(html.includes('SCMU &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('${tr('));
  }
  assert.deepEqual(invoice, original);
});

test('JPT invoice prints IDR line items and remaining balance without exposing vendor prices', () => {
  const html = createInvoiceHtml({ invoiceNumber: 'INV-IDR', currency: 'IDR', status: 'APPROVED', freightAmount: 15000000, gstAmount: 0, totalAmount: 15000000, balance: '10000000.00', invoiceDate: '2026-10-18', job: { jobNumber: 'JOB-001', title: 'Door-to-door', originCity: 'Surabaya', destCity: 'Jayapura' }, items: [{ description: 'Sea freight <unsafe>', amount: 15000000 }] }, { language: 'id' });
  assert.ok(html.includes('Rp')); assert.ok(html.includes('15.000.000')); assert.ok(html.includes('10.000.000'));
  assert.ok(html.includes('Sea freight &lt;unsafe&gt;')); assert.ok(html.includes('JOB-001'));
  assert.ok(html.includes('Sisa tagihan')); assert.ok(!html.includes('₹')); assert.ok(!html.includes('buyRate'));
});

test('job ledger export includes headers and values and neutralizes spreadsheet formulas', async () => {
  const previousDocument = globalThis.document; const createObjectURL = URL.createObjectURL; const revokeObjectURL = URL.revokeObjectURL;
  let blob; let clicked = false;
  URL.createObjectURL = value => { blob = value; return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  globalThis.document = { createElement: () => ({ click: () => { clicked = true; } }) };
  try {
    downloadCsv('ledger.csv', ['Job', 'Customer', 'Amount'], [['JOB-1', '=SUM(A1)', '100.05'], ['JOB-2', 'Name, quoted', 25]]);
    assert.equal(clicked, true); const csv = await blob.text();
    assert.ok(csv.includes('"Job","Customer","Amount"'));
    assert.ok(csv.includes('"JOB-1","\'=SUM(A1)","100.05"'));
    assert.ok(csv.includes('"Name, quoted"'));
  } finally { globalThis.document = previousDocument; URL.createObjectURL = createObjectURL; URL.revokeObjectURL = revokeObjectURL; }
});
