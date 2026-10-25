import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../src/App';
import '../src/index.css';
const boot=window.__SCMU_BL_LIVE__;
localStorage.setItem('scmu_token',boot.token);localStorage.setItem('scmu_user',JSON.stringify(boot.user));localStorage.setItem('scmu_language','en');history.replaceState({},'','/');createRoot(document.getElementById('root')).render(<App/>);
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
const assert=(value,message)=>{if(!value)throw Error(message);};
async function until(fn,label){for(let i=0;i<180;i++){if(await fn())return;await pause();}throw Error('Timed out: '+label);}
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const field=label=>document.querySelector(`[aria-label="${label}"]`);
async function input(label,value){const node=field(label);assert(node,'Missing input '+label);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));await pause();}
async function select(label,value){const node=field(label);assert(node,'Missing select '+label);node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));await pause();}
async function api(endpoint){const r=await fetch('/api'+endpoint,{headers:{Authorization:`Bearer ${boot.token}`}});const body=await r.json();assert(r.ok,JSON.stringify(body));return body;}
async function main(){
 const checks=[];
 await until(()=>document.querySelector('[data-bl-register]')&&document.querySelector('a[href="/bl-register/new"]'),'live dashboard');checks.push('live dashboard API');
 document.querySelector('a[href="/bl-register/new"]').click();await until(()=>field('B/L number'),'new form');
 for(const [label,value] of [['B/L number',boot.marker],['Vessel',boot.marker+' vessel'],['Voyage','QA-001'],['Port of loading','Surabaya'],['Port of discharge','Merauke'],['Customer name','Disposable browser verification']]){if(label==='Voyage'&&!field(label))continue;await input(label,value);}
 button('Add container').click();await until(()=>field('Container number'),'container form');await input('Container number',boot.marker+'-C');await select('Size','21');button('Save B/L').click();
 await until(()=>/^\/bl-register\/[^/]+$/.test(location.pathname)&&!location.pathname.endsWith('/new')&&button('Identity'),'created live B/L');
 const id=location.pathname.split('/').pop();let record=await api('/bl-register/'+id);assert(record.billNumber===boot.marker&&record.containers[0].size==='21','Actual persisted BL identity and size');checks.push('browser create and database readback');
 button('Containers').click();await until(()=>button('Save containers'),'operation editor');await select('Operational status','DOORING');await input('Vehicle number','QA-VEHICLE');button('Save containers').click();await until(async()=>{record=await api('/bl-register/'+id);return record.containers[0].status==='DOORING'&&record.containers[0].vehicleNumber==='QA-VEHICLE';},'saved live container');await new Promise(resolve=>setTimeout(resolve,400));await until(()=>button('Save containers')&&!button('Save containers').disabled&&field('Vehicle number')?.value==='QA-VEHICLE','container save readback');checks.push('browser container update and database readback');
 button('Costs').click();await until(()=>document.querySelector('input[value="jpt-ref-dooring-21"]'),'real tariffs');assert(document.querySelector('input[value="jpt-ref-unconfirmed-21"]').disabled,'Unconfirmed tariff disabled');document.querySelector('input[value="jpt-ref-dooring-21"]').click();button('Estimate').click();await until(()=>button('Propose revenue')&&!button('Propose revenue').disabled,'actual estimator');assert(document.body.textContent.includes('3,850,000'),'Actual VAT-inclusive estimate');button('Propose revenue').click();await until(()=>document.body.textContent.includes('Revenue proposed for the existing approval workflow'),'live proposal');const job=await api('/jobs/'+record.jobId);assert(job.charges.some(row=>row.status==='PROPOSED'&&Number(row.estimatedAmount)===3850000),'Persisted proposed charge');checks.push('real tariff estimate and proposed approval only');
 document.querySelector('aside a[href="/bl-register"]').click();await until(()=>field('Search B/L'),'register return');await input('Search B/L',boot.marker);await until(()=>document.querySelector(`a[href="/bl-register/${id}"]`),'actual search');document.querySelector(`a[href="/bl-register/${id}"]`).click();await until(()=>button('Containers'),'persisted deep link');button('Containers').click();await until(()=>field('Vehicle number')?.value==='QA-VEHICLE','reopened persisted container');checks.push('search and detail reopen');
 document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:true,checks,id}));
}
main().catch(error=>{const resources=performance.getEntriesByType('resource').filter(row=>row.name.includes('/api/')).map(row=>({url:row.name,status:row.responseStatus}));document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:false,error:(error.stack||error.message)+'\n'+JSON.stringify(resources)}));});
