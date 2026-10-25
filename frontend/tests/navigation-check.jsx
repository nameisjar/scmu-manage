import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import '../src/index.css';
const boot=window.__SCMU_CHECK__;localStorage.setItem('scmu_token',boot.token);localStorage.setItem('scmu_user',JSON.stringify(boot.user));localStorage.setItem('scmu_language','id');
const original=boot.originals;history.replaceState({},'',`/sales-quotations/${original['sales-quotations'].id}`);let root=createRoot(document.getElementById('root'));root.render(<App/>);
const pause=()=>new Promise(resolve=>setTimeout(resolve,80));const assert=(value,message)=>{if(!value)throw Error(message);};
async function until(predicate,label){for(let i=0;i<150;i++){if(predicate())return predicate();await pause();}throw Error(`Timed out: ${label}`);}
const button=text=>Array.from(document.querySelectorAll('button')).find(element=>element.textContent.trim()===text);
const area=()=>document.querySelector('[data-page-scroll]');const back=()=>document.querySelector('[data-page-back]');
const rowLink=name=>document.querySelector(`tbody a[href="/${name}/${original[name].id}"]`);
async function input(field,value){assert(field,'Missing search field');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));await pause();}
async function select(field,value){assert(field,'Missing filter');field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}));await pause();}
function sticky(label){const nav=document.querySelector('[data-page-navigation]');const bounds=nav.getBoundingClientRect();const main=area().getBoundingClientRect();const trigger=back().getBoundingClientRect();assert(Math.abs(bounds.top-main.top)<2,`${label}: navigation must stick to the scroll viewport`);assert(trigger.top>=main.top&&trigger.bottom<=main.bottom&&trigger.left>=main.left&&trigger.right<=main.right,`${label}: back button visible`);assert(nav.querySelector('.badge-zinc,.badge-green,.badge-blue,.badge-purple,.badge-brand,.badge-red'),`${label}: status remains visible`);}
async function openList(name){document.querySelector(`aside a[href="/${name}"]`).click();await until(()=>location.pathname===`/${name}`&&rowLink(name),'list mounted');}
async function returnList(name,url,scroll){back().click();await until(()=>location.pathname===`/${name}`&&location.search===url&&rowLink(name),'return to original filtered list');await until(()=>Math.abs(area().scrollTop-scroll)<3,'restored list scroll');}
async function main(){
  await until(()=>back()?.textContent.includes('Penawaran komersial')&&document.querySelector('h1,h2')&&document.body.textContent.includes(original['sales-quotations'].quotationNumber),'direct detail');
  area().scrollTop=area().scrollHeight;await pause();sticky('Direct quotation');back().click();await until(()=>location.pathname==='/sales-quotations'&&rowLink('sales-quotations'),'direct URL fallback');
  const checks=['direct URL safe fallback','sticky back/title/status on four detail modules'];
  for(const name of ['sales-quotations','jobs','shipments','rfq']){
    await openList(name);await input(document.querySelector('input[type="search"],input[aria-label="Cari..."]'),'Merauke');
    if(name!=='sales-quotations')await select(document.querySelector('select[aria-label="Status"]'),original[name].status);
    if(name==='jobs')await select(document.querySelector('select[aria-label="Jenis job order"]'),original[name].jobType);
    await select(document.querySelector('[data-pagination] select'),'50');await until(()=>document.querySelector('[data-pagination]')?.getAttribute('aria-busy')==='false'&&document.querySelectorAll('tbody tr').length===50,'page size');
    if(['shipments','rfq'].includes(name)){const next=await until(()=>Array.from(document.querySelectorAll('button')).find(item=>['Next','Berikutnya'].includes(item.textContent.trim())&&!item.disabled),'next page');next.click();await until(()=>new URLSearchParams(location.search).get('page')==='2'&&document.querySelector('tbody tr')?.textContent.includes(`NAV-${name}-051`),'page two loaded');}
    const link=await until(()=>rowLink(name),'source row');link.scrollIntoView({block:'center'});await pause();area().scrollTop=area().scrollHeight;await pause();const scroll=area().scrollTop;const query=location.search;assert(scroll>0,`${name}: long list fixture must scroll`);link.click();
    const number=original[name][{'sales-quotations':'quotationNumber',jobs:'jobNumber',shipments:'shipmentNumber',rfq:'rfqNumber'}[name]];
    await until(()=>location.pathname===`/${name}/${original[name].id}`&&document.querySelector('[data-page-navigation]')?.textContent.includes(number),'loaded detail');assert(area().scrollTop===0,`${name}: fresh detail starts at top`);area().scrollTop=area().scrollHeight;await pause();sticky(name);
    await returnList(name,query,scroll);assert(document.querySelector('input[type="search"],input[aria-label="Cari..."]').value==='Merauke',`${name}: search retained`);
    if(name!=='sales-quotations')assert(document.querySelector('select[aria-label="Status"]').value===original[name].status,`${name}: status retained`);
    if(name==='jobs')assert(document.querySelector('select[aria-label="Jenis job order"]').value===original[name].jobType,'Job type retained');
    window.history.forward();await until(()=>location.pathname===`/${name}/${original[name].id}`&&back(),'browser Forward');window.history.back();await until(()=>location.pathname===`/${name}`&&rowLink(name),'browser Back');await until(()=>Math.abs(area().scrollTop-scroll)<3,'browser Back scroll');
    if(name==='shipments'){window.dispatchEvent(new Event('pagehide'));root.unmount();root=createRoot(document.getElementById('root'));root.render(<App/>);await until(()=>rowLink(name)&&location.search===query,'session remount');await until(()=>Math.abs(area().scrollTop-scroll)<3,'session-restored scroll');}
  }
  checks.push('search/status/job type restored','pagination retained','scroll restored after asynchronous loading','browser Back/Forward','session restoration');
  await openList('jobs');rowLink('jobs').click();await until(()=>button('Tahapan angkutan'),'job for cross navigation');button('Tahapan angkutan').click();const shipmentLink=await until(()=>document.querySelector('tbody a[href^="/shipments/"]'),'job shipment');shipmentLink.click();await until(()=>back()?.textContent.includes('Job order')&&location.pathname.startsWith('/shipments/'),'shipment source is job');area().scrollTop=area().scrollHeight;await pause();sticky('Shipment from job');back().click();await until(()=>location.pathname===`/jobs/${original.jobs.id}`&&new URLSearchParams(location.search).get('tab')==='transport','return to job tab');
  document.querySelector('aside a[href="/approvals"]').click();await until(()=>document.querySelector('select[aria-label="Status persetujuan"]'),'approvals');await select(document.querySelector('select[aria-label="Status persetujuan"]'),'');const view=await until(()=>Array.from(document.querySelectorAll('tbody button')).find(item=>item.textContent.trim()==='Lihat'),'approval source');view.click();const source=await until(()=>document.querySelector('[role="dialog"] a[href^="/jobs/"]'),'source record');source.click();await until(()=>location.pathname.startsWith('/jobs/')&&back()?.textContent.includes('Persetujuan direktur'),'approval source label');back().click();await until(()=>location.pathname==='/approvals'&&new URLSearchParams(location.search).get('approvalStatus')==='all','return to approval filter');
  checks.push('job/transport source-aware return','job tab retained','approval source and filter retained');
  document.querySelector('aside a[href="/sales-quotations"]').click();const last=await until(()=>rowLink('sales-quotations'),'final quotation');last.click();await until(()=>document.querySelector('[data-page-navigation]')?.textContent.includes(original['sales-quotations'].quotationNumber),'final sticky header');area().scrollTop=area().scrollHeight;await pause();sticky('Final screenshot');
  document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:true,checks,viewport:{width:innerWidth,height:innerHeight}}));
}
main().catch(error=>{document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:false,error:error.stack||error.message}));});
