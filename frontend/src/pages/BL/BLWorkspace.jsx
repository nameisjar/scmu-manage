import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Button, StatusBadge } from '../../components/common';

import { DataTable, Notice, usePagedResource } from '../../components/jpt/Workspace';
import { useDetailNavigation, usePageQuery } from '../../components/Layout/PageNavigation';
import { useBL } from '../../i18n/bl.mjs';
import { formatMoney } from '../../utils/format.mjs';
import { ContainerEditor, RegisterForm } from './BLDetail';
import { Progress } from './BLRegister';
import TariffEstimator from './TariffEstimator';


export function DocumentLinks({bill}) {
 const {t}=useBL();return <div className="card p-5 space-y-4"><div className="flex flex-wrap gap-3">{['receiptStatus','internalStatus','releaseStatus'].map(key=>{const status=bill.documentSummary?.[key]||bill[key];return status?<div key={key} data-document-status={status}><StatusBadge status={status}/></div>:null;})}</div><p className="text-sm text-amber-300">{t('Existing verification and release approvals remain required. Operational updates do not release cargo.')}</p><div className="flex flex-wrap gap-4"><Link className="text-brand-400 text-sm" to={`/jobs/${bill.jobId}?tab=documents`}>{t('Manage job documents')} →</Link><Link className="text-brand-400 text-sm" to={`/jobs/${bill.jobId}?tab=sea`}>{t('Sea transport documents')} →</Link></div></div>;
}
function Operations({bill,onReload}) {
 const {t}=useBL();const [containers,setContainers]=useState(()=>structuredClone(bill.containers||[]));const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [stale,setStale]=useState(false);
 const save=async event=>{event.preventDefault();if(busy||stale)return;setBusy(true);setError('');try{await api.put(`/bl-register/${bill.id}`,{version:bill.version,containers});await api.get(`/bl-register/${bill.id}`);onReload();}catch(error){setStale(error.response?.status===409);setError(error.response?.status===409?t('This record changed. Reload before editing again. Your unsaved values are retained.'):error.response?.data?.message||error.message);}finally{setBusy(false);}};
 return <form onSubmit={save} className="space-y-4"><Notice message={error}/><p className="text-xs text-zinc-400">{t('Existing verification and release approvals remain required. Operational updates do not release cargo.')}</p><ContainerEditor containers={containers} onChange={setContainers} disabled={busy||stale}/><Button type="submit" disabled={busy||stale}>{t(busy?'Saving...':'Save containers')}</Button>{stale&&<Button type="button" variant="secondary" onClick={onReload}>{t('Reload record')}</Button>}</form>;
}
export default function BLWorkspace({bill,onReload}) {
 const {t,locale}=useBL();const [params,setQuery]=usePageQuery();const tab=params.get('tab')||'identity';
 const history=usePagedResource(tab==='history'?`/jobs/${bill.jobId}/activity`:null,{},'activity');
 useDetailNavigation(bill.billNumber,null);
 return <div className="space-y-5"><div className="card p-4 flex flex-wrap gap-5 items-center justify-between"><div className="text-xs text-zinc-500">{bill.jobNumber||'—'} · {bill.vesselName||'—'} / {bill.voyageNumber||'—'}</div><Progress containers={bill.containers}/><Link className="text-brand-400 text-sm" to={`/jobs/${bill.jobId}`}>{bill.jobNumber||t('Job orders')} →</Link></div>
 <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3" role="tablist">{[['identity','Identity'],['containers','Containers'],['documents','Documents'],['costs','Costs'],['history','History']].map(([key,label])=><button className={`px-4 py-2 rounded-lg text-sm ${tab===key?'bg-brand-500/15 text-brand-300':'text-zinc-400 hover:bg-zinc-800'}`} type="button" role="tab" aria-selected={tab===key} key={key} onClick={()=>setQuery({tab:key})}>{t(label)}</button>)}</div>
 {tab==='identity'&&<RegisterForm initial={bill} onSaved={onReload}/>}
 {tab==='containers'&&<Operations key={bill.version} bill={bill} onReload={onReload}/>}
 {tab==='documents'&&<DocumentLinks bill={bill}/>}
 {tab==='costs'&&<div className="space-y-4"><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{[['revenue','Approved revenue'],['approvedCost','Approved cost'],['receivable','Receivable'],['unbilled','Unbilled']].map(([key,label])=><div className="card p-4" key={key}><p className="text-xs text-zinc-500">{t(label)}</p><p className="mt-2 text-lg text-zinc-200">{bill.financials?.[key]!=null?formatMoney(bill.financials[key],'IDR',locale):'—'}</p></div>)}</div><Link className="text-brand-400 text-sm" to={`/jobs/${bill.jobId}?tab=charges`}>{t('Open job finance')} →</Link><TariffEstimator bill={bill}/></div>}
 {tab==='history'&&<div className="space-y-4"><Link className="text-brand-400 text-sm" to={`/jobs/${bill.jobId}?tab=activity`}>{t('Open activity log')} →</Link><Notice message={history.error}/><DataTable rows={history.rows} pagination={history.pagination} empty={t('No activity yet')} columns={[{key:'createdAt',label:t('Date'),render:row=>row.createdAt?.slice(0,19).replace('T',' ')},{key:'action',label:t('Action')},{key:'user',label:t('User'),render:row=>row.user?.name||'—'},{key:'metadata',label:t('Details'),render:row=><code className="text-xs break-all">{JSON.stringify(row.metadata)}</code>}]}/></div>}
 </div>;
}
