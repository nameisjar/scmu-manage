// Export the application's real print template for visual QA, including pagination.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPackingListHtml } from '../frontend/src/pages/JPT/packingTemplate.mjs';
import { createPackingHeaderHtml } from '../frontend/src/pages/JPT/packingHeaderTemplate.mjs';
import { translate } from '../frontend/src/i18n/translations.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const api = process.env.SCMU_API_URL || 'http://127.0.0.1:5000'; assert.ok(['localhost', '127.0.0.1'].includes(new URL(api).hostname));
const login = await fetch(`${api}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@scmu.local', password: 'Admin@1234' }) }); assert.ok(login.ok); const { token } = await login.json();
const get = async endpoint => { const response = await fetch(`${api}/api${endpoint}`, { headers: { Authorization: `Bearer ${token}` } }); assert.ok(response.ok); return response.json(); };
const job = (await get('/jobs')).data.find(job => job.jobNumber === 'SCMU-JOB-ARMADA-001');
const record = (await get(`/jobs/${job.id}/packing-lists`)).data.find(record => record.recordNumber === 'PL-SCMU-DEMO-001'); assert.ok(record);
const logoUrl = `data:image/svg+xml;base64,${(await readFile(path.join(root, 'frontend/public/scmu-logo.svg'))).toString('base64')}`;
const output = path.join(root, 'tmp/pdfs/packing'); await mkdir(output, { recursive: true });
const chrome = process.env.SCMU_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const headerJob = (await get('/jobs')).data.find(job => job.jobNumber === 'SCMU-JOB-TERIMA-002');
const header = (await get(`/jobs/${headerJob.id}/packing-header`)).data;
const headerOnly = process.argv.includes('--headers-only');
const samples = headerOnly ? [['packing-header', header], ['packing-header-long', { ...header, status: 'DRAFT', headerNumber: 'KPL-SCMU-QA-60-DOCS', notes: 'Simulasi tata letak 60 packing list. Bukan transaksi operasional.', packingLists: Array.from({ length: 60 }, (_, index) => ({ ...header.packingLists[index % 3], externalNumber: `PL-A-QA-${String(index + 1).padStart(3, '0')}`, senderName: 'Perusahaan A Surabaya - Gudang Peralatan Operasional (Simulasi)' })), summary: { documentCount: 60, packages: 600, netWeightKg: 66000, grossWeightKg: 72000, volumeCbm: 390, receivedDocuments: 60, discrepancyDocuments: 0 } }]] : [['packing-list', record], ['packing-list-long', { ...record, recordNumber: 'PL-SCMU-QA-80-ROWS', notes: 'Simulasi tata letak 80 baris. Bukan transaksi operasional.', items: Array.from({ length: 80 }, (_, index) => ({ ...record.items[index % 2], sequence: index + 1, description: `Baris ${index + 1}: peralatan operasional dan suku cadang untuk tujuan Merauke - simulasi tata letak.` })), packages: 400, netWeightKg: 44000, grossWeightKg: 48000, volumeCbm: 260 }]];
for (const [name, document] of samples) {
  const html = path.join(output, `${name}.html`); const pdf = path.join(output, `${name}.pdf`);
  await writeFile(html, (headerOnly ? createPackingHeaderHtml : createPackingListHtml)(document, { t: key => translate('id', key), locale: 'id-ID', language: 'id', logoUrl }));
  await promisify(execFile)(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--user-data-dir=${path.join(root, '.demo/ui-check/chrome-pdf-profile')}`, '--no-pdf-header-footer', '--virtual-time-budget=1500', `--print-to-pdf=${pdf}`, pathToFileURL(html).href], { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
  console.log(`PDF preview ready: ${pdf}`);
}
