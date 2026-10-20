import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../src/App';
import '../src/index.css';
const boot=window.__SCMU_CHECK__; const readonly=new URLSearchParams(location.search).has('readonly');
localStorage.setItem('scmu_token',boot.token); localStorage.setItem('scmu_user',JSON.stringify(boot.user)); localStorage.setItem('scmu_language','id');
history.replaceState({},'',`/jobs/${boot.jobId}?tab=packing`); createRoot(document.getElementById('root')).render(<App/>);
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
const assert=(value,message)=>{if(!value)throw Error(message);};
const modal=()=>document.querySelector('[role="dialog"]');
const button=text=>Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()===text);
async function until(predicate,label){for(let i=0;i<160;i++){const result=predicate();if(result)return result;await pause();}throw Error(`Timeout: ${label}; ${Array.from(document.querySelectorAll('[role="alert"]')).map(el=>el.textContent).join('; ')}`);}
async function click(text){const target=await until(()=>{const el=button(text);return el&&!el.disabled&&el;},text);target.click();await pause();}
function input(label){const el=Array.from(modal().querySelectorAll('label')).find(el=>el.querySelector(':scope > span')?.textContent===label);assert(el,`Field ${label}`);return document.getElementById(el.htmlFor);}
async function field(label,value){const el=input(label);if(el.tagName==='SELECT'){el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}else{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}await pause();}
async function view(sender,viewText='Lihat'){const row=await until(()=>Array.from(document.querySelectorAll('tr')).find(el=>el.textContent.includes(sender)&&Array.from(el.querySelectorAll('button')).some(b=>b.textContent===viewText)),sender);Array.from(row.querySelectorAll('button')).find(el=>el.textContent===viewText).click();await until(()=>modal(),'detail modal');}
async function close(){for(let i=0;i<2&&modal();i++){const current=modal();current.querySelector('.modal-close').click();await until(()=>modal()!==current,'modal closes or returns to detail');}await until(()=>!modal(),'modal close');}
function geometry(){const rect=modal().getBoundingClientRect();assert(rect.left>=7&&rect.right<=innerWidth-7&&rect.top>=7&&rect.bottom<=innerHeight-7,'Modal fits viewport');assert(modal().scrollWidth<=modal().clientWidth+1,'No horizontal overflow');assert(modal().querySelector('.modal-footer').getBoundingClientRect().bottom<=innerHeight-7,'Footer stays visible');assert(document.querySelectorAll('[role="dialog"]').length===1,'Single modal');assert(document.getElementById('root').inert,'Background inert');}
async function preview(){await until(()=>modal().querySelector('[data-preview-ready="true"]'),'PDF preview');await new Promise(resolve=>setTimeout(resolve,1800));}
async function main(){
  await until(()=>button('Unggah packing list asal'),'packing workspace');
  await until(()=>document.body.textContent.includes(`Tidak tercantum pada ${readonly?2:1} dokumen`),'Incomplete source volume is marked on header');
  if(!readonly){
    await click('Unggah packing list asal');await until(()=>modal()?.querySelector('input[type="file"]'),'file first');assert(!modal().querySelector('input[type="number"]'),'No summary before original selected');
    const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(boot.pdf),c=>c.charCodeAt(0))],'packing-company-c.pdf',{type:'application/pdf'}));const file=modal().querySelector('input[type="file"]');file.files=transfer.files;file.dispatchEvent(new Event('change',{bubbles:true}));await preview();
    for(const label of ['Koli menurut dokumen','Berat bersih pada dokumen','Berat kotor pada dokumen','Volume (CBM)'])assert(input(label).value==='',`${label} is not copied from job totals`);
    await field('Nomor packing list asal','PL-003');await field('Pengirim','Company C (Simulation)');await field('Koli menurut dokumen','2');await field('Berat kotor pada dokumen','0.2');await field('Satuan berat kotor','TON');
    modal().querySelector('input[type="checkbox"]').click();await click('Simpan packing list asal');await until(()=>modal()?.textContent.includes('PL-003')&&!modal().querySelector('form'),'saved detail');
    assert(modal().textContent.includes('200'),'Tonnes converted on save');assert(modal().textContent.includes('Tidak tercantum'),'Missing volume stays unknown');assert(modal().textContent.includes('Sudah diperiksa dengan file asli'),'Review attributed');await preview();await close();
    await click('Ubah kepala packing list');await until(()=>modal()?.querySelector('fieldset'),'header selection');const label=Array.from(modal().querySelectorAll('fieldset label')).find(el=>el.textContent.includes('PL-003'));assert(label,'New original selectable');label.querySelector('input').click();await click('Simpan');await until(()=>!modal(),'header saved');await until(()=>document.body.textContent.includes('Tidak tercantum pada 2 dokumen'),'Header updates missing counts');
    const language=document.querySelector('aside select');language.value='en';language.dispatchEvent(new Event('change',{bubbles:true}));await until(()=>button('Upload original packing list'),'English');await view('Company C','View');assert(modal().textContent.includes('Not stated'),'English missing values');await click('Edit');await until(()=>modal()?.querySelector('[data-packing-summary]'),'English summary');assert(modal().textContent.includes('Standard document summary'),'English summary copy');await close();language.value='id';language.dispatchEvent(new Event('change',{bubbles:true}));await until(()=>button('Unggah packing list asal'),'Indonesian');
  }
  await view('Company C');await click('Ubah');await until(()=>modal()?.querySelector('[data-packing-summary]'),'summary editor');await preview();geometry();
  assert(input('Berat kotor pada dokumen').value==='200','Saved kg appears on edit');assert(input('Satuan berat kotor').value==='KG','Editing starts in normalized kg');assert(input('Volume (CBM)').value==='','Unknown volume remains blank on edit');
  const body=modal().querySelector('.modal-body');body.scrollTo(0,9999);await pause();geometry();body.scrollTo(0,0);await pause();
  document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:true,checks:['mixed sender originals','PDF local and authenticated preview','no copied job totals','tonne conversion','missing values and partial totals','manual confirmation','responsive modal and sticky actions',...(!readonly?['upload and save','header selection','Indonesian/English']:[])]}));
}
main().catch(error=>document.documentElement.dataset.scmuCheck=btoa(JSON.stringify({ok:false,error:error.stack||error.message})));
