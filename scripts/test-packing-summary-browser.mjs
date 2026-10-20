import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkPage} from './browser-check.mjs';
import fixture from './packing-summary-fixture.cjs';
const root=fileURLToPath(new URL('..',import.meta.url));const require=createRequire(new URL('../frontend/package.json',import.meta.url));const {createServer}=require('vite');
let context;let server;
try{
  context=await fixture();const boot=JSON.stringify({...context.staff,jobId:context.job.id,pdf:fixture.pdfFixture(['SIMULATION - COMPANY C','PACKING LIST PL-003','2 COLLY - 0.2 TON','Volume: not stated']).toString('base64')}).replaceAll('<','\\u003c');
  process.chdir(path.join(root,'frontend'));process.env.NODE_ENV='production';process.env.VITE_API_URL='http://127.0.0.1:5174';
  server=await createServer({root:path.join(root,'frontend'),plugins:[{name:'packing-summary-bootstrap',transformIndexHtml(html,ctx){return ctx.path==='/packing-summary-check.html'?html.replace('<head>',`<head><script>window.__SCMU_CHECK__=${boot}</script>`):html;}}],server:{host:'127.0.0.1',port:5174,strictPort:true,hmr:false,proxy:{'/api':{target:context.api,changeOrigin:true,configure(proxy){proxy.on('proxyReq',req=>req.removeHeader('origin'));}}}}});await server.listen();
  const output=path.join(root,'.demo/ui-check');await mkdir(output,{recursive:true});
  for(const [label,width,height,query] of [['desktop',1366,900,''],['compact',500,844,'?readonly=1']]){
    const result=await checkPage({chrome:process.env.SCMU_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',output,width,height,url:`http://127.0.0.1:5174/packing-summary-check.html${query}`,screenshot:path.join(output,`packing-summary-${label}.png`)});assert.ok(result.ok,result.error);console.log(`PASS ${label}: ${result.checks.join(', ')}`);
  }
  const records=(await context.request(`/jobs/${context.job.id}/packing-lists`,null,context.staff.token)).data;const created=records.find(row=>row.externalNumber==='PL-003');assert.equal(created.packages,2);assert.equal(created.grossWeightKg,'200');assert.equal(created.volumeCbm,null);assert.ok(created.summaryCheckedAt);
}finally{if(server)await server.close();if(context)await context.cleanup();}
