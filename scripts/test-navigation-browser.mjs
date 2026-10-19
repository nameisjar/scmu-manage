import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { checkPage } from './browser-check.mjs';
const root = fileURLToPath(new URL('..', import.meta.url)); const require = createRequire(new URL('../frontend/package.json', import.meta.url)); const { createServer } = require('vite');
process.chdir(path.join(root,'frontend')); process.env.NODE_ENV = 'production'; process.env.VITE_API_URL = 'http://127.0.0.1:5174';
const api = process.env.SCMU_API_URL || 'http://127.0.0.1:5000'; assert.ok(['127.0.0.1','localhost'].includes(new URL(api).hostname));
const authResponse = await fetch(`${api}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:'admin@scmu.local', password:'Admin@1234' }) }); assert.ok(authResponse.ok); const auth = await authResponse.json();
const headers = { Authorization:`Bearer ${auth.token}` };
const originals = {};
for (const [name,number] of [['sales-quotations',null],['jobs','SCMU-JOB-DEMO-001'],['rfq','SCMU-RFQ-001'],['shipments','SCMU-SHP-001']]) {
  const response = await fetch(`${api}/api/${name}?limit=100`,{headers}); assert.ok(response.ok); const rows = (await response.json()).data;
  originals[name] = number ? rows.find(row=>[row.jobNumber,row.rfqNumber,row.shipmentNumber].includes(number)) : rows[0]; assert.ok(originals[name],`Missing demo ${name}`);
}
const lists = Object.fromEntries(Object.entries(originals).map(([name,source])=>[name,Array.from({length:45},(_,index)=>{
  const record = structuredClone(source); const real = ['rfq','shipments'].includes(name) ? index%20===17 : index===17; record.id = real ? source.id : `navigation-${name}-${index}`; record.title = `SCMU Merauke navigation ${index+1}`;
  const key = { 'sales-quotations':'quotationNumber',jobs:'jobNumber',rfq:'rfqNumber',shipments:'shipmentNumber' }[name]; record[key] = real ? source[key] : `NAV-${name}-${String(index+1).padStart(3,'0')}`; return record;
})]));
const bootstrap = JSON.stringify({...auth,originals}).replaceAll('<','\\u003c');
const server = await createServer({ root:path.join(root,'frontend'), plugins:[{
  name:'navigation-browser-fixture',
  transformIndexHtml(html,context){return context.path==='/navigation-check.html' ? html.replace('<head>',`<head><script>window.__SCMU_CHECK__=${bootstrap}</script>`) : html;},
  configureServer(server){ server.middlewares.use((req,res,next)=>{
    const url = new URL(req.url,'http://127.0.0.1'); const name = url.pathname.replace('/api/','');
    if(req.method!=='GET'||!lists[name]) return next();
    // Read-only list fixtures exercise long lists and pagination; all detail APIs
    // still use actual local demo records. No business records are created.
    let rows = lists[name].filter(row=>(!url.searchParams.get('status')||row.status===url.searchParams.get('status'))&&(!url.searchParams.get('search')||JSON.stringify([row.title,row.shipmentNumber,row.rfqNumber,row.destCity]).toLowerCase().includes(url.searchParams.get('search').toLowerCase())));
    const total = rows.length; if(['rfq','shipments'].includes(name)){const page=Number(url.searchParams.get('page')||1);rows=rows.slice((page-1)*20,page*20);}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:rows,total}));
  });}
}], server:{host:'127.0.0.1',port:5174,strictPort:true,hmr:false,proxy:{'/api':{target:api,changeOrigin:true,configure(proxy){proxy.on('proxyReq',request=>request.removeHeader('origin'));}}}} });
const output = path.join(root,'.demo','ui-check'); await mkdir(output,{recursive:true}); await server.listen();
try {
  const sizes = process.argv.includes('--desktop-only') ? [['desktop',1920,1080]] : [['desktop',1920,1080],['laptop',1366,768],['compact',500,844]];
  for(const [label,width,height] of sizes){const result=await checkPage({chrome:process.env.SCMU_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',output,width,height,url:'http://127.0.0.1:5174/navigation-check.html',screenshot:path.join(output,`navigation-${label}.png`)});assert.ok(result.ok,`${label}: ${result.error}`);console.log(`PASS ${label}: ${result.checks.join(', ')}`);}
} finally {await server.close();}
