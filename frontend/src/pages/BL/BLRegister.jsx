import { Link } from 'react-router-dom';
import { Plus, RefreshCw, Anchor } from 'lucide-react';
import { PageHeader, Button } from '../../components/common';
import { DataTable, Notice, usePagedResource } from '../../components/jpt/Workspace';
import { usePageQuery } from '../../components/Layout/PageNavigation';
import { useBL } from '../../i18n/bl.mjs';
import { formatMoney } from '../../utils/format.mjs';
import { containerCounts } from './registerModel.mjs';

const statuses = ['REGISTERED','READY','GATE_OUT','DOORING','STRIPPED','EMPTY_RETURNED'];
export function Progress({ containers = [] }) {
 const { t } = useBL(); const returned = containers.filter(row => row.status === 'EMPTY_RETURNED').length;
 return <div className="min-w-32"><span className="text-xs">{returned}/{containers.length} {t('Empty returned')}</span><div className="mt-1.5 h-1 rounded bg-zinc-800"><div className="h-1 rounded bg-emerald-500" style={{width:`${containers.length ? returned/containers.length*100 : 0}%`}} /></div><p className="mt-1 text-xs text-zinc-500">{[...new Set(containers.map(row => row.status))].map(t).join(' · ') || t('Unknown')}</p></div>;
}
export default function BLRegister({ operations = false }) {
 const { t, locale } = useBL(); const [params,setQuery] = usePageQuery();
 const filters = Object.fromEntries(['search','month','vessel','port','status'].map(key=>[key,params.get(key)||'']));
 const resource = usePagedResource('/bl-register',filters); const summary = resource.data?.summary;
 const filter = (key,value) => setQuery({[key]:value,page:null});
 const columns = operations ? [
  { key:'container',label:t('Container number'),render:row=><Link className="text-brand-400 font-mono" to={`/bl-register/${row.bill.id}?tab=containers`}>{row.number || t('Unknown')}<p className="text-xs text-zinc-500">{row.size || t('Unknown')} · {row.seal || '—'}</p></Link> },
  { key:'bill',label:t('Register / B/L'),render:row=><>{row.bill.billNumber}<p className="text-xs text-zinc-500">{row.bill.vesselName} / {row.bill.voyageNumber || '—'}</p></> },
  { key:'status',label:t('Operational status'),render:row=>t(row.status||'Unknown') },
  { key:'destinationAddress',label:t('Destination address') },
  { key:'vehicle',label:t('Vehicle number'),render:row=><>{row.vehicleNumber||'—'}<p className="text-xs text-zinc-500">{row.driverName} · {row.vendorName}</p></> },
  { key:'plannedDeliveryAt',label:t('Planned delivery'),render:row=>row.plannedDeliveryAt?.slice(0,10)||'—' },
  { key:'freeTimeUntil',label:t('Free time until'),render:row=>row.freeTimeUntil?.slice(0,10)||'—' },
  { key:'emptyReturnedAt',label:t('Empty returned at'),render:row=>row.emptyReturnedAt?.slice(0,10)||'—' }
 ] : [
  { key:'register',label:t('Register / B/L'),className:'sticky left-0 z-10 bg-zinc-950 min-w-44',render:row=><Link className="text-brand-400 font-mono font-medium" to={`/bl-register/${row.id}`}>{row.registerNumber || '—'}<p className="text-zinc-200 mt-1">{row.billNumber || t('Unknown')}</p></Link> },
  { key:'vessel',label:t('Vessel / voyage'),render:row=><>{row.vesselName||'—'}<p className="text-xs text-zinc-500">{row.voyageNumber||'—'} · {row.carrierName||'—'}</p></> },
  { key:'ports',label:t('Origin / destination'),render:row=><>{row.portOfLoading||'—'}<p className="text-xs text-zinc-500">→ {row.portOfDischarge||'—'}</p></> },
  { key:'dates',label:t('Book dates out / in'),render:row=><div className="min-w-32">{row.register?.departureDate?.slice(0,10)||'—'}<p>{row.register?.arrivalDate?.slice(0,10)||'—'}</p><p className="text-xs text-amber-400/80 mt-1">{t(row.register?.dateMeaning||'UNCONFIRMED')}</p></div> },
  { key:'sizes',label:'20′ / 21′ / 40′',render:row=>{const counts=containerCounts(row.containers);return <div className="font-mono whitespace-nowrap">{counts['20']} / {counts['21']} / {counts['40']}{counts.unknown>0&&<p className="text-amber-400 text-xs">{counts.unknown} {t('Unknown')}</p>}</div>;} },
  { key:'cargo',label:t('Cargo / parties'),render:row=><div className="min-w-40 max-w-64"><p>{row.register?.cargoDescription||'—'}</p><p className="text-xs text-zinc-500 mt-1">{row.register?.customerName||row.consigneeName||t('Unknown')}</p><p className="text-xs text-zinc-500">{row.register?.billingPartyName||'—'}</p></div> },
  { key:'progress',label:t('Operations / finance'),render:row=><><Progress containers={row.containers}/><p className="text-xs mt-2 text-zinc-400">{row.financials?.receivable!=null?`${t('Receivable')}: ${formatMoney(row.financials.receivable,'IDR',locale)}`:t('Payment status unavailable')}</p></> }
 ];
 const rows = operations ? resource.rows.flatMap(bill=>(bill.containers||[]).map((row,index)=>({...row,bill,id:`${bill.id}:${index}`}))) : resource.rows;
 return <div className="space-y-5" data-bl-register>
  <PageHeader title={t(operations?'Container operations':'B/L register')} subtitle={t('One register, from vessel to empty return.')} action={<div className="flex gap-2"><Button variant="secondary" disabled={resource.loading} onClick={resource.reload}><RefreshCw size={15}/>{t('Refresh')}</Button><Link className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-white text-sm" to="/bl-register/new"><Plus size={16}/>{t('New B/L')}</Link></div>}/>
  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">{[['activeBills','Active B/L'],['pendingPort','Pending at port'],['dooring','Dooring'],['pendingEmpty','Pending empty return'],['incompleteDocuments','Incomplete documents'],['unpaidInvoices','Unpaid invoices'],['freeTimeAlerts','Free-time alerts']].map(([key,label])=><div key={key} className="card px-4 py-4"><p className="text-xs text-zinc-500 min-h-8">{t(label)}</p><p className={`text-2xl font-semibold tabular-nums mt-1 ${key==='freeTimeAlerts'?'text-amber-400':'text-zinc-100'}`}>{resource.loading?'…':summary?.[key]??'—'}</p></div>)}</div>
  <div className="card p-4 grid sm:grid-cols-2 xl:grid-cols-6 gap-3">{[['search','Search B/L','search'],['month','Month','month'],['vessel','Vessel','text'],['port','Port','text']].map(([key,label,type])=><label key={key} className={`space-y-1 ${key==='search'?'xl:col-span-2':''}`}><span className="text-xs text-zinc-400">{t(label)}</span><input className="input-field" aria-label={t(label)} type={type} value={filters[key]} onChange={event=>filter(key,event.target.value)}/></label>)}<label className="space-y-1"><span className="text-xs text-zinc-400">{t('Operational status')}</span><select className="input-field" aria-label={t('Operational status')} value={filters.status} onChange={event=>filter('status',event.target.value)}><option value="">{t('All statuses')}</option>{statuses.map(status=><option key={status} value={status}>{t(status)}</option>)}</select></label></div>
  <Notice message={resource.error}/>
  <div className="flex items-center gap-2 text-xs text-zinc-500"><Anchor size={14}/>{t('Book dates out / in — meaning unconfirmed')} · {t('No container sizes are inferred.')}</div>
  <DataTable rows={rows} columns={columns} empty={t(operations?'No containers recorded':'No B/L records match these filters.')} pagination={resource.pagination}/>
 </div>;
}
