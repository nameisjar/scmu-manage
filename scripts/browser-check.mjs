import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Use real time: virtual time can pause indefinitely while the application has
// an open Socket.IO request. This browser owns a separate, disposable profile.
export async function checkPage({ chrome, output, width, height, url, screenshot, check = true }) {
  const profile = path.join(output, `chrome-check-${randomUUID()}`);
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = ''; child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-20000); });
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  let socket; let send; let dom = '';
  try {
    let address;
    for (let i = 0; i < 150; i++) { try { const [port, endpoint] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); address = `ws://127.0.0.1:${port}${endpoint}`; break; } catch { if (child.exitCode !== null) throw Error(`Browser exited: ${child.exitCode}`); await pause(); } }
    if (!address) throw Error('Browser debugging endpoint did not start');
    socket = new WebSocket(address); await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0; const pending = new Map();
    socket.addEventListener('message', event => { const message = JSON.parse(event.data); const operation = pending.get(message.id); if (operation) { pending.delete(message.id); message.error ? operation.reject(Error(message.error.message)) : operation.resolve(message.result); } });
    send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(Error(`Browser command timed out: ${method}`)); }, 10000); pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } }); socket.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })); });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params) => send(method, params, sessionId);
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url });
    let encoded;
    for (let i = 0; i < (check ? 550 : 20); i++) { await pause(); if (check) { const result = await command('Runtime.evaluate', { expression: 'document.documentElement.dataset.scmuCheck', returnByValue: true }); encoded = result.result.value; if (encoded) break; } }
    dom = (await command('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true })).result.value;
    const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(screenshot, Buffer.from(result.data, 'base64'));
    await send('Target.closeTarget', { targetId });
    if (check && !encoded) throw Error('Browser check did not finish');
    if (check) { const result = JSON.parse(Buffer.from(encoded, 'base64').toString()); if (!result.ok) { await writeFile(path.join(output, 'failed-dom.html'), dom); } return result; }
  } catch (error) { if (dom) await writeFile(path.join(output, 'failed-dom.html'), dom); await writeFile(path.join(output, 'browser-error.log'), `${error.stack}\n${errors}`); throw error; }
  finally { if (send && socket.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} } socket?.close(); if (child.exitCode === null) child.kill(); }
}
