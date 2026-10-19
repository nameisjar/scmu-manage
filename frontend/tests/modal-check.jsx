import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import '../src/index.css';

const boot = window.__SCMU_CHECK__;
localStorage.setItem('scmu_token', boot.token);
localStorage.setItem('scmu_user', JSON.stringify(boot.user));
localStorage.setItem('scmu_language', 'id');
history.replaceState({}, '', '/jobs');
createRoot(document.getElementById('root')).render(<App />);
const pause = () => new Promise(resolve => setTimeout(resolve, 50));
const assert = (value, message) => { if (!value) throw Error(message); };
async function until(predicate, label) { for (let i = 0; i < 200; i++) { const value = predicate(); if (value) return value; await pause(); } throw Error(`Timed out: ${label}`); }
const button = text => Array.from(document.querySelectorAll('button')).find(element => element.textContent.trim() === text);
const control = text => Array.from(document.querySelectorAll('[role="dialog"] label')).find(label => label.querySelector('span')?.textContent === text)?.querySelector('select, input, textarea');
async function select(text, value) { const field = control(text); assert(field, `Missing field: ${text}`); field.value = value; field.dispatchEvent(new Event('change', { bubbles: true })); await pause(); }
async function fill(text, value) { const field = control(text); assert(field, `Missing field: ${text}`); const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); await pause(); }
const saveDialog = () => document.querySelector('.modal-footer button[type="submit"]').click();
function geometry(label) {
  const overlay = document.querySelector('[data-modal-root]'); const dialog = document.querySelector('[role="dialog"]');
  const body = dialog.querySelector('.modal-body'); const footer = dialog.querySelector('.modal-footer'); const header = dialog.querySelector('.modal-header');
  const bounds = dialog.getBoundingClientRect(); const backdrop = overlay.getBoundingClientRect();
  assert(overlay.parentElement === document.body, `${label}: portal must be mounted in body`);
  assert(Math.abs(backdrop.top) < 1 && Math.abs(backdrop.left) < 1 && Math.abs(backdrop.width - innerWidth) < 1 && Math.abs(backdrop.height - innerHeight) < 1, `${label}: backdrop must cover viewport`);
  assert(bounds.top >= 7 && bounds.bottom <= innerHeight - 7 && bounds.left >= 7 && bounds.right <= innerWidth - 7, `${label}: dialog clipped`);
  assert(Math.abs(bounds.left - (innerWidth - bounds.width) / 2) < 2, `${label}: dialog must be centered`);
  assert(header.getBoundingClientRect().top >= bounds.top, `${label}: title clipped`);
  assert(footer && footer.getBoundingClientRect().bottom <= bounds.bottom, `${label}: footer clipped`);
  assert(document.body.style.overflow === 'hidden' && document.getElementById('root').inert, `${label}: background must be locked`);
  return { body, dialog, footer, bounds };
}

async function api(path, body, token = boot.directorToken) { const response = await fetch(`/api${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' }, body: body && JSON.stringify(body) }); const data = await response.json(); assert(response.ok, JSON.stringify(data)); return data; }
async function approve(action, entityId, payload, note) { const row = await api('/approvals', { action, entityId, payload, note }, boot.staffToken); await api(`/approvals/${row.id}/review`, { decision:'APPROVED' }); }
async function closePackingDetails() { if (document.querySelector('[aria-label="Detail packing list"]')) { button('Tutup').click(); await until(() => !document.querySelector('[role="dialog"]'), 'close packing details'); } }
async function reopenJob(id, receiving) { await closePackingDetails(); document.querySelector('a[href="/jobs"]').click(); await until(() => location.pathname === '/jobs' && button('Buat job order'), 'job list'); const link = await until(() => document.querySelector(`a[href="/jobs/${id}"]`), 'job link'); link.click(); await until(() => button('Ubah detail job') && location.pathname === `/jobs/${id}`, 'reopened job'); if (!receiving) button('Packing list').click(); await until(() => receiving ? document.querySelector('[aria-label="Kepala packing list penerimaan"]') : button('Buat packing list keluar'), 'reopened packing'); }
async function main() {
  const trigger = await until(() => button('Buat job order'), 'customer page');
  await until(() => document.body.textContent.includes('Surabaya - Merauke'), 'Indonesian customer data');
  assert(!document.querySelector('a[href="/customers"], a[href="/portal"]'), 'Customer navigation must be removed');
  assert(getComputedStyle(trigger).backgroundColor === 'rgb(37, 99, 235)', 'Primary button must be blue');
  assert(getComputedStyle(trigger).color === 'rgb(255, 255, 255)', 'Primary button needs white text');
  trigger.focus(); trigger.click(); await until(() => document.querySelector('[role="dialog"]'), 'customer modal'); await pause();
  const customer = geometry('Customer');
  const fields = customer.dialog.querySelectorAll('input');
  assert(customer.dialog.contains(document.activeElement), 'Initial focus must enter modal');
  fields[1].focus(); fields[1].value = 'Focus test'; fields[1].dispatchEvent(new Event('input', { bubbles: true })); await pause();
  assert(document.activeElement === fields[1], 'Typing must not reset focus to first field');
  if (innerWidth < 640) assert(Math.abs(fields[0].getBoundingClientRect().left - fields[1].getBoundingClientRect().left) < 1, 'Mobile form must have one column');
  customer.body.scrollTop = customer.body.scrollHeight; await pause();
  assert(customer.footer.getBoundingClientRect().bottom <= innerHeight - 7, 'Save buttons must remain visible after scrolling');
  const lastTextarea = Array.from(customer.dialog.querySelectorAll('textarea')).at(-1);
  assert(lastTextarea.getBoundingClientRect().top >= customer.body.getBoundingClientRect().top - 1 && lastTextarea.getBoundingClientRect().bottom <= customer.body.getBoundingClientRect().bottom + 1, 'Final textarea must be reachable');
  const controls = Array.from(customer.dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'));
  controls[controls.length - 1].focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert(document.activeElement === controls[0], 'Focus must wrap inside modal');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => !document.querySelector('[role="dialog"]'), 'Escape dismissal');
  assert(!document.getElementById('root').inert && document.body.style.overflow !== 'hidden', 'Background must unlock');
  assert(document.activeElement === trigger, 'Focus must return to trigger');
  document.querySelector('a[href="/sales-quotations"]').click();
  const jobTrigger = await until(() => button('Penawaran baru'), 'job page');
  await until(() => document.body.textContent.includes('Surabaya - Merauke'), 'Merauke job');
  jobTrigger.click(); await until(() => document.querySelector('[role="dialog"]'), 'job modal'); await pause();
  geometry('Job');
  document.querySelector('.modal-close').click(); await until(() => !document.querySelector('[role="dialog"]'), 'close button');
  document.querySelector('a[href="/users"]').click();
  const addUser = await until(() => button('Tambah Pengguna'), 'Super Admin user management'); addUser.click();
  const userDialog = await until(() => document.querySelector('[role="dialog"]'), 'user modal');
  const roles = Array.from(userDialog.querySelector('select').options).map(option => option.value);
  assert(JSON.stringify(roles) === JSON.stringify(['SUPER_ADMIN', 'ADMIN']), 'Only two roles may be created');
  document.querySelector('.modal-close').click(); await until(() => !document.querySelector('[role="dialog"]'), 'close user modal');
  document.querySelector('a[href="/rfq"]').click();
  const rfqLink = await until(() => Array.from(document.querySelectorAll('tr')).find(row => row.textContent.includes('SCMU-RFQ-001'))?.querySelector('a[href^="/rfq/"]'), 'internal RFQ list'); rfqLink.click();
  const quoteButton = await until(() => button('Catat penawaran vendor'), 'record vendor quote'); quoteButton.click();
  const quoteDialog = await until(() => document.querySelector('[role="dialog"]'), 'vendor quote modal');
  assert(quoteDialog.querySelector('select')?.required && quoteDialog.querySelectorAll('option').length > 1, 'Admin must select the quote vendor');
  document.querySelector('.modal-close').click(); await until(() => !document.querySelector('[role="dialog"]'), 'close vendor quote');
  const logo = document.querySelector('img[src^="/scmu-logo.svg"]'); await until(() => logo.complete && logo.naturalWidth > 0, 'logo');
  document.querySelector('a[href="/jobs"]').click();
  const mixedLink = await until(() => Array.from(document.querySelectorAll('a')).find(link => link.textContent.trim() === 'SCMU-JOB-ARMADA-001'), 'mixed fleet job'); mixedLink.click();
  const addLeg = await until(() => button('Tambah tahap angkutan'), 'mixed job details');
  await until(() => document.body.textContent.includes('L 9101 SM') && document.body.textContent.includes('PA 9101 SM'), 'SCMU fleet assignments');
  addLeg.click(); await until(() => control('Pelaksana angkutan'), 'transport selection');
  assert(control('Pelaksana angkutan').value === 'INTERNAL', 'New legs default to SCMU fleet');
  await until(() => control('Vehicle')?.options.length > 1 || control('Kendaraan')?.options.length > 1, 'owned vehicle options');
  const vehicle = control('Kendaraan') || control('Vehicle'); const driver = control('Pengemudi') || control('Driver');
  assert(vehicle.required && driver.required && !control('Vendor'), 'SCMU fleet requires vehicle/driver without vendor');
  assert(Array.from(vehicle.options).filter(option => option.value).every(option => /9101 SM/.test(option.text)), 'Only SCMU vehicles may be selected');
  await select('Pelaksana angkutan', 'EXTERNAL'); await until(() => control('Vendor'), 'external vendor field');
  assert(control('Vendor').required, 'External transport requires vendor');
  await select('Moda angkutan', 'SEA');
  assert(!control('Kendaraan') && !control('Vehicle') && !control('Pengemudi') && !control('Driver'), 'Sea transport must not offer road resources');
  geometry('External transport');
  document.querySelector('.modal-close').click(); await until(() => !document.querySelector('[role="dialog"]'), 'close transport');
  button('Invoice & pembayaran').click(); await until(() => button('Ajukan pembayaran internal'), 'separate internal settlement');
  assert(document.body.textContent.includes('Pelunasan vendor') && document.body.textContent.includes('Penyelesaian biaya internal'), 'Separate settlement tables must be visible');
  button('Ajukan pembayaran internal').click(); await until(() => control('Penerima pembayaran'), 'internal recipient'); assert(control('Penerima pembayaran').required, 'Internal payments need recipient'); geometry('Internal payment');
  document.querySelector('.modal-close').click(); await until(() => !document.querySelector('[role="dialog"]'), 'close payment');
  button('Pendapatan & biaya').click(); (await until(() => button('Ajukan pendapatan / biaya'), 'propose cost')).click(); await until(() => control('Sumber biaya'), 'cost classification');
  assert(control('Sumber biaya').value === 'INTERNAL' && !control('Vendor'), 'Internal costs exclude vendor');
  assert(control('Kategori biaya').options.length >= 7, 'Operating categories must be available');
  await select('Sumber biaya', 'VENDOR'); assert(control('Vendor'), 'Vendor costs offer vendor selection');
  document.querySelector('.modal-close').click(); await until(() => !document.querySelector('[role="dialog"]'), 'close charge');
  button('Packing list').click(); await until(() => button('Buat packing list keluar'), 'packing list tab');
  const marker = `${boot.packingMarker}-${innerWidth}`;
  button('Buat packing list keluar').click(); await until(() => control('Tanggal dokumen'), 'outgoing packing form');
  assert(!control('Nomor packing list asal') && !control('Hasil penerimaan'), 'Outgoing packing must not require a receiving header');
  assert(!Array.from(document.querySelectorAll('[role="dialog"] input[type="checkbox"]')).some(input => input.checked), 'No sources may be selected automatically');
  await fill('Referensi', `${marker}-out`); button('Tambah rincian barang').click(); await until(() => control('Total berat kotor baris (kg)'), 'packing item');
  await fill('Deskripsi barang', `Peralatan demo ${marker}`); await fill('Total berat bersih baris (kg)', '10'); await fill('Total berat kotor baris (kg)', '12');
  await fill('Koli', '2'); await fill('Panjang per koli (cm)', '100'); await fill('Lebar per koli (cm)', '50'); await fill('Tinggi per koli (cm)', '50'); geometry('Outgoing packing items');
  saveDialog(); await until(() => !document.querySelector('[role="dialog"] form'), 'save outgoing packing');
  const details = () => document.querySelector('[aria-label="Detail packing list"]');
  await until(() => details()?.textContent.includes(`${marker}-out`), 'saved outgoing details');
  geometry('Outgoing packing detail modal'); assert(details().closest('[role="dialog"]') && !document.getElementById('root').querySelector('[aria-label="Detail packing list"]'), 'Packing details must be in a modal, without inline details');
  assert(details().textContent.includes('0.5') || details().textContent.includes('0,5'), 'Packing volume should be calculated');
  const outgoingJobId = location.pathname.split('/').at(-1); const outgoingRecord = (await api(`/jobs/${outgoingJobId}/packing-lists`)).data.find(row => row.reference === `${marker}-out`);
  button('Ajukan packing list').click(); await until(() => control('Catatan pengajuan'), 'outgoing approval form'); geometry('Packing approval submission'); assert(document.querySelectorAll('[role="dialog"]').length === 1, 'Submission replaces packing details'); document.querySelector('.modal-close').click(); await until(() => details(), 'cancel restores packing details');
  await approve('PACKING_FINALIZE', outgoingRecord.id, { version: outgoingRecord.version }, marker); await reopenJob(outgoingJobId, false); button(outgoingRecord.recordNumber).click();
  await until(() => button('Cetak / simpan PDF packing list'), 'director approved outgoing');
  const originalOpen = window.open; let printed = ''; let printTriggered = false;
  window.open = () => ({ document: { write(html) { printed = html; }, close() {}, images: [] }, focus() {}, print() { printTriggered = true; } });
  button('Cetak / simpan PDF packing list').click(); await until(() => printTriggered, 'packing print'); window.open = originalOpen;
  assert(printed.includes(marker) && printed.includes('Packing list keluar SCMU') && printed.includes('display:table-header-group'), 'Final packing print must include saved data and repeatable headers');
  await closePackingDetails();
  document.querySelector('a[href="/jobs"]').click(); (await until(() => button('Buat job order'), 'jobs for receiving')).click();
  await until(() => control('Jenis job order'), 'job type field'); await select('Jenis job order', 'RECEIVER');
  assert(!control('Penerima'), 'Receiving job recipient is SCMU');
  await fill('Judul', `${marker}-receiving-job`); await fill('Kota Asal', 'Surabaya'); await fill('Kota Tujuan', 'Merauke'); await fill('Deskripsi barang', 'Penerimaan dari perusahaan A Surabaya'); await fill('Koli', '30'); await fill('Berat (kg)', '3600'); await fill('Volume (CBM)', '19.5'); geometry('Receiving job creation');
  saveDialog(); await until(() => !document.querySelector('[role="dialog"]') && button('Unggah packing list asal'), 'receiving job defaults to packing tab');
  assert(!button('Buat packing list keluar') && button('Buat kepala packing list').disabled, 'Receiving jobs require originals before creating a head, and cannot issue outgoing packing');
  const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII='), char => char.charCodeAt(0));
  async function chooseOriginal(file) { const transfer = new DataTransfer(); transfer.items.add(file); const input = document.querySelector('[role="dialog"] input[type="file"]'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); await pause(); }
  for (let index = 0; index < 2; index++) {
    button('Unggah packing list asal').click(); await until(() => document.querySelector('[role="dialog"] input[type="file"]'), 'original file first');
    assert(!control('Nomor packing list asal'), 'Original metadata appears after the file is selected');
    if (index === 0) {
      saveDialog(); await pause(); assert(document.querySelector('[role="dialog"]'), 'Original file is required'); geometry('Original file selection');
      await chooseOriginal(new File(['invalid'], 'invalid.txt', { type: 'text/plain' })); assert(!control('Nomor packing list asal') && document.querySelector('[role="dialog"] [role="alert"]'), 'Invalid type rejected');
      await chooseOriginal(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'too-large.png', { type: 'image/png' })); assert(!control('Nomor packing list asal') && document.querySelector('[role="dialog"] [role="alert"]').textContent.includes('5 MB'), 'Oversized file rejected');
    }
    await chooseOriginal(new File([bytes], `packing-asal-${index}.png`, { type: 'image/png' })); await until(() => control('Nomor packing list asal'), 'original details');
    assert(document.querySelector('[role="dialog"] a[href^="blob:"]') && !button('Tambah rincian barang'), 'Original preview without repeating item rows');
    await fill('Nomor packing list asal', `PL-ASAL-${marker}-${index}`); await fill('Pengirim', 'Perusahaan A Surabaya'); await fill('Referensi', `${marker}-in-${index}`);
    await fill('Koli menurut dokumen', String((index + 1) * 10)); await fill('Berat bersih (kg)', String((index + 1) * 1100)); await fill('Berat kotor (kg)', String((index + 1) * 1200)); await fill('Volume (CBM)', String((index + 1) * 6.5)); geometry('Original details and pending receipt');
    saveDialog(); await until(() => !document.querySelector('[role="dialog"] form') && details()?.textContent.includes(`${marker}-in-${index}`), 'saved original details'); geometry('Original packing detail modal');
    assert(button('Unduh packing list asal') && !button('Cetak / simpan PDF packing list'), 'Original retains its own file without reissue');
    await closePackingDetails();
  }
  (await until(() => button('Buat kepala packing list') && !button('Buat kepala packing list').disabled && button('Buat kepala packing list'), 'create grouped head')).click();
  await until(() => document.querySelectorAll('[role="dialog"] input[type="checkbox"]').length === 2, 'two original choices');
  const sourceChecks = Array.from(document.querySelectorAll('[role="dialog"] input[type="checkbox"]')); assert(sourceChecks.every(input => !input.checked), 'Selection must be explicit');
  for (const input of sourceChecks) { input.click(); await pause(); } await fill('Referensi', `${marker}-head`); geometry('Head with multiple selected originals');
  saveDialog(); await until(() => !document.querySelector('[role="dialog"]'), 'save grouped head');
  const head = () => document.querySelector('[aria-label="Kepala packing list penerimaan"]');
  await until(() => head()?.textContent.includes(`${marker}-head`), 'head saved'); assert(head().querySelectorAll('tbody tr').length === 2, 'One head must contain both originals');
  assert(head().textContent.includes('30') && head().textContent.includes('3.600'), 'Grouped head must show summed cargo totals');
  printed = ''; printTriggered = false; window.open = () => ({ document: { write(html) { printed = html; }, close() {}, images: [] }, focus() {}, print() { printTriggered = true; } });
  (await until(() => button('Cetak / simpan PDF kepala packing list') && !button('Cetak / simpan PDF kepala packing list').disabled && button('Cetak / simpan PDF kepala packing list'), 'print draft head')).click(); await until(() => printTriggered, 'draft head print'); window.open = originalOpen;
  assert(printed.includes(`PL-ASAL-${marker}-0`) && printed.includes(`PL-ASAL-${marker}-1`) && printed.includes('class="draft"'), 'Draft print must include both original references and a draft label');
  for (let index = 0; index < 2; index++) {
    button(`PL-ASAL-${marker}-${index}`).click(); await until(() => details()?.textContent.includes(`${marker}-in-${index}`), 'select original receipt'); button('Ubah').click(); await until(() => control('Hasil penerimaan'), 'receipt form');
    await select('Hasil penerimaan', 'RECEIVED'); await fill('Waktu diterima', '2026-10-19T09:00'); await fill('Diterima oleh', 'Petugas SCMU'); await fill('Koli diterima', String((index + 1) * 10));
    saveDialog(); await until(() => !document.querySelector('[role="dialog"] form') && details()?.textContent.includes('Diterima sesuai dokumen'), 'save receipt');
    button('Finalisasi packing list').click(); await until(() => document.querySelector('[role="dialog"] form'), 'finalize original'); saveDialog(); await until(() => !document.querySelector('[role="dialog"] form') && details() && !button('Finalisasi packing list'), 'original finalized'); await closePackingDetails();
  }
  await until(() => Array.from(head().querySelectorAll('tbody tr')).every(row => row.textContent.includes('Diterima sesuai dokumen') && row.textContent.includes('Final')), 'head receipt summary updates');
  const receivingJobId = location.pathname.split('/').at(-1); const grouped = (await api(`/jobs/${receivingJobId}/packing-header`)).data;
  button('Ajukan kepala packing list').click(); await until(() => document.querySelector('[role="dialog"]'), 'head approval form'); geometry('Head approval submission'); document.querySelector('.modal-close').click(); await until(() => !document.querySelector('[role="dialog"]'), 'close head approval preview');
  await approve('PACKING_HEADER_FINALIZE', grouped.id, { version: grouped.version }, marker); await reopenJob(receivingJobId, true);
  await until(() => !button('Ajukan kepala packing list') && !button('Unggah packing list asal') && button(`PL-ASAL-${marker}-0`), 'director approved head immutable'); button(`PL-ASAL-${marker}-0`).click(); await until(() => button('Unduh packing list asal'), 'original after head approval');
  assert(!button('Buat packing list keluar') && button('Unduh packing list asal'), 'Receiving role remains separate after finalization'); geometry('Original selected from head opens modal');
  const result = { ok: true, viewport: { width: innerWidth, height: innerHeight }, checks: ['React portal', 'viewport bounds', 'scrollable form', 'visible title/footer', 'mobile columns', 'focus trap and restore', 'Escape/close', 'blue theme', 'Merauke data', 'logo load', 'no customer navigation', 'two user roles', 'SCMU fleet filtering', 'separate cost/payment forms', 'independent outgoing packing print', 'Sender/Receiver job selection', 'original first with type/size validation and preview', 'multiple originals selected under one head', 'summed head and draft PDF', 'per-original receipt/finalization', 'locked final head without outgoing reissue'] };
  document.documentElement.dataset.scmuCheck = btoa(JSON.stringify(result));
}
main().catch(error => { document.documentElement.dataset.scmuCheck = btoa(JSON.stringify({ ok: false, error: error.stack || error.message })); });
