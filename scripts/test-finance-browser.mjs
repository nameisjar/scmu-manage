import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { checkPage } from './browser-check.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));const require=createRequire(new URL('../frontend/package.json',import.meta.url));const {createServer}=require('vite');
process.chdir(path.join(root,'frontend'));process.env.NODE_ENV='production';process.env.VITE_API_URL='http://127.0.0.1:5174';
const api=process.env.SCMU_API_URL||'http://127.0.0.1:5000';assert.ok(['127.0.0.1','localhost'].includes(new URL(api).hostname));
const authResponse=await fetch(`${api}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@scmu.local',password:'Admin@1234'})});assert.ok(authResponse.ok);const auth=await authResponse.json();
const response=await fetch(`${api}/api/jobs/finance`,{headers:{Authorization:`Bearer ${auth.token}`}});assert.ok(response.ok);const finance=await response.json();
// Add an isolated USD response fixture to cover decimals, loss, overdue and draft
// invoices. These are browser-only data; the local database is never changed.
const usd={id:'finance-usd-fixture',jobNumber:'SCMU-USD-TEST',title:'Uji tampilan keuangan USD',originCity:'Surabaya',destCity:'Merauke',currency:'USD',status:'IN_PROGRESS',customer:{name:'SCMU'},financials:{revenue:'1234.56',estimatedCost:'2100.00',estimatedProfit:'-865.44',approvedCost:'2000.00',billed:'1000.00',grossProfit:'-1000.00',receivable:'750.00',payable:'1000.00',internalCost:'0.00',vendorCost:'2000.00',internalExpensePaid:'0.00',internalOutstanding:'0.00',unbilled:'234.56'},alerts:[]};
const posted={id:'finance-usd-posted',invoiceNumber:'FIN-USD-POSTED',jobId:usd.id,jobNumber:usd.jobNumber,currency:'USD',status:'APPROVED',freightAmount:'1000.00',gstAmount:'0.00',totalAmount:'1000.00',balance:'750.00',dueDate:'2026-10-01T00:00:00.000Z',daysOverdue:15,agingBucket:'1_30'};
const draft={...posted,id:'finance-usd-draft',invoiceNumber:'FIN-USD-DRAFT',status:'PENDING',freightAmount:'234.56',totalAmount:'234.56',balance:'234.56'};
const cost={id:'finance-usd-cost',jobId:usd.id,jobNumber:usd.jobNumber,currency:'USD',kind:'COST',costSource:'VENDOR',costCategory:'FREIGHT',status:'APPROVED',vendorName:'Mitra laut (uji)',description:'Angkutan laut USD',estimatedAmount:'2100.00',actualAmount:'2000.00',balance:'1000.00',dueDate:'2026-10-01T00:00:00.000Z',daysOverdue:15};
usd.invoices=[posted,draft];usd.charges=[cost];usd.payments=[{id:'finance-usd-receipt',direction:'RECEIVABLE',amount:'250.00',reference:'USD-RECEIPT',paidAt:'2026-10-02T00:00:00.000Z'},{id:'finance-usd-payment',direction:'PAYABLE',amount:'1000.00',reference:'USD-PAYMENT',paidAt:'2026-10-03T00:00:00.000Z'}];
finance.jobs.push(usd);finance.groups.push({...usd.financials,currency:'USD',jobs:1});finance.invoices.push(posted,draft);finance.payables.push(cost);
const bootstrap=JSON.stringify({...auth,finance}).replaceAll('<','\\u003c');
const server=await createServer({root:path.join(root,'frontend'),plugins:[{name:'finance-browser-fixture',transformIndexHtml(html,context){return context.path==='/finance-check.html'?html.replace('<head>',`<head><script>window.__SCMU_CHECK__=${bootstrap}</script>`):html;},configureServer(server){server.middlewares.use((req,res,next)=>{if(req.method!=='GET'||new URL(req.url,'http://127.0.0.1').pathname!=='/api/jobs/finance')return next();res.setHeader('Content-Type','application/json');res.end(JSON.stringify(finance));});}}],server:{host:'127.0.0.1',port:5174,strictPort:true,hmr:false,proxy:{'/api':{target:api,changeOrigin:true,configure(proxy){proxy.on('proxyReq',request=>request.removeHeader('origin'));}}}}});
const output=path.join(root,'.demo','ui-check');await mkdir(output,{recursive:true});await server.listen();
try{
  const sizes=process.argv.includes('--desktop-only')?[['desktop',1920,1080]]:[['desktop',1920,1080],['laptop',1366,768],['compact',500,844]];
  for(const [label,width,height] of sizes){const result=await checkPage({chrome:process.env.SCMU_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',output,width,height,url:'http://127.0.0.1:5174/finance-check.html',screenshot:path.join(output,`finance-${label}.png`)});assert.ok(result.ok,`${label}: ${result.error}`);console.log(`PASS ${label}: ${result.checks.join(', ')}`);}
  const detail=await checkPage({chrome:process.env.SCMU_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',output,width:1366,height:768,url:'http://127.0.0.1:5174/finance-check.html?detail=1',screenshot:path.join(output,'finance-detail.png')});assert.ok(detail.ok,detail.error);console.log('PASS detail modal screenshot');
}finally{await server.close();}
