import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
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
const output = path.join(root, '.demo', 'ui-check'); await mkdir(output, { recursive: true });
const bootstrap = JSON.stringify({ token: auth.token, user: auth.user }).replaceAll('<', '\\u003c');
const server = await createServer({ root: path.join(root, 'frontend'), plugins: [{ name: 'scmu-modal-test-bootstrap', transformIndexHtml(html, context) { return context.path === '/modal-check.html' ? html.replace('<head>', `<head><script>window.__SCMU_CHECK__=${bootstrap}</script>`) : html; } }], server: { host: '127.0.0.1', port: 5174, strictPort: true, hmr: false, proxy: { '/api': { target: api, changeOrigin: true, configure(proxy) { proxy.on('proxyReq', request => request.removeHeader('origin')); } } } } });
await server.listen();
try {
  for (const [label, width, height] of process.argv.includes('--logo-only') ? [] : [['desktop', 1920, 1080], ['laptop', 1366, 768], ['compact', 500, 844]]) {
    const screenshot = path.join(output, `modal-${label}.png`);
    const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${path.join(output, 'chrome-profile')}`, `--window-size=${width},${height}`, '--virtual-time-budget=20000', '--run-all-compositor-stages-before-draw', `--screenshot=${screenshot}`, '--dump-dom', 'http://127.0.0.1:5174/modal-check.html'];
    let stdout;
    try { ({ stdout } = await promisify(execFile)(chrome, args, { windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })); }
    catch (error) { await writeFile(path.join(output, 'browser-error.log'), error.stderr || error.message); throw Error('Headless browser failed to start; see .demo/ui-check/browser-error.log'); }
    const encoded = stdout.match(/data-scmu-check="([^"]+)"/)?.[1];
    if (!encoded) await writeFile(path.join(output, 'failed-dom.html'), stdout);
    assert.ok(encoded, `Browser check did not finish: ${label}; inspect .demo/ui-check/failed-dom.html`);
    const result = JSON.parse(Buffer.from(encoded, 'base64').toString());
    assert.equal(result.ok, true, `${label}: ${result.error}`);
    console.log(`PASS ${label}: ${result.viewport.width}×${result.viewport.height}; ${result.checks.join(', ')}`);
  }
  await promisify(execFile)(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${path.join(output, 'chrome-profile')}`, '--window-size=600,650', '--virtual-time-budget=1000', `--screenshot=${path.join(output, 'logo-preview.png')}`, '--dump-dom', 'http://127.0.0.1:5174/logo-check.html'], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  console.log('Logo preview: .demo/ui-check/logo-preview.png');
} finally { await server.close(); }
