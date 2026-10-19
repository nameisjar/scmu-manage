import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkPage } from './browser-check.mjs';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { createServer } = require('vite');
const root = fileURLToPath(new URL('..', import.meta.url));
process.chdir(path.join(root, 'frontend'));
process.env.NODE_ENV = 'production';
process.env.VITE_API_URL = 'http://127.0.0.1:5174';
const chrome = process.env.SCMU_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const api = process.env.SCMU_API_URL || 'http://127.0.0.1:5000';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(api).hostname), 'Browser checks only support the local demo');
const authResponse = await fetch(`${api}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@scmu.local', password: 'Admin@1234' }) });
assert.ok(authResponse.ok, 'Start the local demo before running this check');
const auth = await authResponse.json();
const staffResponse = await fetch(`${api}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'operasional@scmu.local', password: 'Ops@1234' }) }); assert.ok(staffResponse.ok); const staff = await staffResponse.json();
const output = path.join(root, '.demo', 'ui-check'); await mkdir(output, { recursive: true });
const packingMarker = `SCMU-browser-packing-${randomUUID()}`;
const directorOnly = process.argv.includes('--director-only'); const fixture = directorOnly ? 'director-check.html' : 'modal-check.html';
let fixtureJob;
if (directorOnly) { const response = await fetch(`${api}/api/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staff.token}` }, body: JSON.stringify({ title: `${packingMarker}-director-job`, originCity: 'Surabaya', destCity: 'Merauke', cargoDescription: 'Persetujuan direktur dari browser', packages: 1, currency: 'IDR' }) }); assert.ok(response.ok); fixtureJob = await response.json(); }
const bootstrap = JSON.stringify({ token: directorOnly ? staff.token : auth.token, user: directorOnly ? staff.user : auth.user, staffToken: staff.token, directorToken: auth.token, packingMarker, fixtureJob }).replaceAll('<', '\\u003c');
const server = await createServer({ root: path.join(root, 'frontend'), plugins: [{ name: 'scmu-modal-test-bootstrap', transformIndexHtml(html, context) { return context.path === `/${fixture}` ? html.replace('<head>', `<head><script>window.__SCMU_CHECK__=${bootstrap}</script>`) : html; } }], server: { host: '127.0.0.1', port: 5174, strictPort: true, hmr: false, proxy: { '/api': { target: api, changeOrigin: true, configure(proxy) { proxy.on('proxyReq', request => request.removeHeader('origin')); } } } } });
await server.listen();
try {
  for (const [label, width, height] of process.argv.includes('--logo-only') ? [] : process.argv.includes('--desktop-only') ? [['desktop',1920,1080]] : [['desktop', 1920, 1080], ['laptop', 1366, 768], ['compact', 500, 844]]) {
    const screenshot = path.join(output, `${directorOnly ? 'director' : 'modal'}-${label}.png`);
    const result = await checkPage({ chrome, output, width, height, url: `http://127.0.0.1:5174/${fixture}`, screenshot });
    assert.equal(result.ok, true, `${label}: ${result.error}`);
    console.log(`PASS ${label}: ${result.viewport.width}×${result.viewport.height}; ${result.checks.join(', ')}`);
  }
  await checkPage({ chrome, output, width: 600, height: 650, url: 'http://127.0.0.1:5174/logo-check.html', screenshot: path.join(output, 'logo-preview.png'), check: false });
  console.log('Logo preview: .demo/ui-check/logo-preview.png');
} finally {
  await server.close();
  const backendRequire = createRequire(path.join(root, 'backend/package.json')); const { PrismaClient } = backendRequire('@prisma/client');
  const databaseUrl = process.env.SCMU_DEMO_DATABASE_URL || 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname) && new URL(databaseUrl).pathname === '/scmu_demo');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const jobs = await prisma.jobOrder.findMany({ where: { title: { startsWith: packingMarker } } }); const jobIds = jobs.map(job => job.id);
    const approvals = await prisma.directorApproval.findMany({ where: { OR: [{ jobId: { in: jobIds } }, { requestNote: { startsWith: packingMarker } }] } }); const approvalIds = approvals.map(row => row.id);
    await prisma.directorApproval.deleteMany({ where: { id: { in: approvalIds } } });
    await prisma.packingHeader.deleteMany({ where: { jobId: { in: jobIds } } });
    const records = await prisma.packingList.findMany({ where: { reference: { startsWith: packingMarker } }, include: { document: true } }); const ids = records.map(record => record.id);
    const files = backendRequire('./src/services/jobFiles'); for (const record of records) await files.removeFile(record.document.filename);
    await prisma.packingListSource.deleteMany({ where: { packingListId: { in: ids } } }); await prisma.packingList.deleteMany({ where: { id: { in: ids } } }); await prisma.jobDocument.deleteMany({ where: { id: { in: records.map(record => record.documentId) } } });
    const audits = await prisma.activityLog.findMany({ where: { action: { startsWith: 'PACKING_' } } });
    await prisma.activityLog.deleteMany({ where: { id: { in: audits.filter(log => ids.includes(log.metadata?.packingId)).map(log => log.id) } } });
    const approvalLogs = await prisma.activityLog.findMany({ where: { action: { in: ['PACKING_FINALIZE','PACKING_HEADER_FINALIZE','DIRECTOR_APPROVAL_SUBMITTED','DIRECTOR_APPROVAL_APPROVED','DIRECTOR_APPROVAL_RETURNED','DIRECTOR_APPROVAL_WITHDRAWN'] } } });
    await prisma.activityLog.deleteMany({ where: { id: { in: approvalLogs.filter(log => approvalIds.includes(log.metadata?.approvalId)).map(log => log.id) } } });
    await prisma.jobPayment.deleteMany({ where: { jobId: { in: jobIds } } }); await prisma.jobCharge.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobDocument.deleteMany({ where: { jobId: { in: jobIds } } }); await prisma.jobOrder.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.activityLog.deleteMany({ where: { entity: 'JobOrder', entityId: { in: jobIds } } });
  } finally { await prisma.$disconnect(); }
}
