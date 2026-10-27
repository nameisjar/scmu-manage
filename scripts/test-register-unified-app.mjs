import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkPage} from './browser-check.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const frontend=createRequire(new URL('../frontend/package.json',import.meta.url));
const backend=createRequire(new URL('../backend/package.json',import.meta.url));
const {PrismaClient}=backend('@prisma/client');const jwt=backend('jsonwebtoken');
const prisma=new PrismaClient({datasources:{db:{url:'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo'}}});
let server;
try {
 const user=await prisma.user.findFirst({where:{role:'ADMIN',isActive:true},select:{id:true,name:true,role:true,email:true}});assert.ok(user);
 const record=await prisma.seaBill.findFirst({where:{archivedAt:null},select:{id:true}});assert.ok(record,'Local demo needs an existing register for read-only UI checks');
 const token=jwt.sign({userId:user.id},await readFile(path.join(root,'.demo/jwt-secret'),'utf8'),{expiresIn:'10m'});
 process.chdir(path.join(root,'frontend'));process.env.NODE_ENV='production';process.env.VITE_API_URL='http://127.0.0.1:5194';
 server=await frontend('vite').createServer({root:path.join(root,'frontend'),server:{host:'127.0.0.1',port:5194,strictPort:true,hmr:false}});await server.listen();
 const output=path.join(root,'.demo','register-live-ui');await mkdir(output,{recursive:true});
 for(const [label,width,height,language,view]of [['desktop-list',1440,1000,'id','list'],['tablet-list',800,1000,'en','list'],['desktop-form',1440,1000,'id','form'],['tablet-form',800,1000,'en','form']]){
  const setupScript=`localStorage.setItem('scmu_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('scmu_token',${JSON.stringify(token)});localStorage.setItem('scmu_language',${JSON.stringify(language)});
  addEventListener('load',async()=>{const checks=[];const pause=()=>new Promise(r=>setTimeout(r,100));const wait=async fn=>{for(let i=0;i<120;i++){if(fn())return;await pause();}throw Error('UI did not load: '+location.pathname)};const assert=(v,m)=>{if(!v)throw Error(m)};try{
  await wait(()=>document.querySelector('[data-register-dashboard]'));assert(document.querySelector('aside nav'),'Main sidebar missing');assert(!/Job orders|Job order|Finance|RFQ|Invoices|Shipments|Fleet|Drivers|Companies|Routes|Analytics|Reports/.test(document.querySelector('aside nav').textContent),'Retired module remains in navigation');checks.push('real API operational dashboard and focused navigation');
  document.querySelector('aside a[href="/bl-register"]').click();await wait(()=>document.querySelector('[data-register-table] tbody a'));
  const table=document.querySelector('[data-register-table] .overflow-x-auto');assert(table.scrollWidth>table.clientWidth,'Table does not scroll');table.scrollLeft=500;assert(table.scrollLeft>0,'Horizontal scroll failed');table.scrollLeft=0;checks.push('real historical register and horizontal scrolling');
  assert(document.documentElement.scrollWidth<=innerWidth+1,'Whole page overflows viewport');checks.push('sidebar and viewport containment');
  if(${JSON.stringify(language)}==='en'){assert(document.body.textContent.includes('Shipments'),'English register title missing');assert(document.body.textContent.includes('More filters'),'English filters missing');assert(document.body.textContent.includes('Export'),'English export missing');checks.push('English register UI');}
  if(${JSON.stringify(view)}==='form'){
   document.querySelector('a[href="/bl-register/${record.id}"]')?.click()||document.querySelector('[data-register-table] tbody a').click();
   await wait(()=>document.querySelector('[data-bl-form] input'));assert(document.querySelectorAll('form').length===1,'Unified form is split');
   await wait(()=>document.querySelector('[data-register-documents]'));assert(document.querySelector('[data-page-navigation]'),'Sticky back navigation absent');
   const scroller=document.querySelector('[data-page-scroll]');scroller.scrollTop=500;await pause();assert(document.querySelector('[data-page-navigation]').getBoundingClientRect().top>=0,'Back navigation leaves viewport');scroller.scrollTop=0;
   assert(document.documentElement.scrollWidth<=innerWidth+1,'Form overflows viewport');checks.push('single form, inline documents and sticky back');
  }
  document.documentElement.dataset.scmuCheck=btoa(unescape(encodeURIComponent(JSON.stringify({ok:true,checks}))));
  }catch(error){document.documentElement.dataset.scmuCheck=btoa(unescape(encodeURIComponent(JSON.stringify({ok:false,error:error.stack,checks}))));}});`;
  const result=await checkPage({chrome:process.env.SCMU_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',output,width,height,url:'http://127.0.0.1:5194/',screenshot:path.join(output,label+'.png'),setupScript});assert.ok(result.ok,`${label}: ${result.error}`);console.log(`PASS ${label}: ${result.checks.join(', ')}`);
 }
 console.log('Screenshots: .demo/register-live-ui (read-only; no business records changed)');
}finally{await server?.close();await prisma.$disconnect();}
