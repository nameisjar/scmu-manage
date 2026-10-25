import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../api/client';
import { Button, PageHeader, Spinner } from '../../components/common';
import BLWorkspace from './BLWorkspace';
import { Notice, useResource } from '../../components/jpt/Workspace';
import { useBL } from '../../i18n/bl.mjs';
import { registerPayload, datetimeInput, datetimeValue } from './registerModel.mjs';

function Input({label,value,onChange,type='text',required=false,children}) {
 const {t}=useBL(); return <label className="block space-y-1.5"><span className="text-xs text-zinc-400">{t(label)}</span>{children || <input aria-label={t(label)} className="input-field" value={value??''} type={type} required={required} onChange={event=>onChange(event.target.value)}/>}</label>;
}
export function ContainerEditor({containers,onChange,disabled=false}) {
 const {t}=useBL(); const update=(index,key,value)=>onChange(containers.map((row,i)=>i===index?{...row,[key]:value}:row));
 return <fieldset disabled={disabled} className="space-y-4"><div className="flex flex-wrap justify-between gap-3"><h3 className="text-sm font-semibold text-zinc-200">{t('Containers')} · {containers.length}</h3><Button type="button" variant="secondary" onClick={()=>onChange([...containers,{number:'',seal:'',size:null,status:'REGISTERED'}])}>{t('Add container')}</Button></div>
 {containers.map((row,index)=><div key={index} className="card p-4 space-y-4" data-container-editor><div className="flex items-center justify-between"><p className="font-mono text-brand-400 text-sm">{String(index+1).padStart(2,'0')} · {row.number||t('Container number')}</p><Button type="button" variant="ghost" size="sm" onClick={()=>onChange(containers.filter((_,i)=>i!==index))}>{t('Remove')}</Button></div><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
 {['number','seal'].map((key,i)=><Input key={key} label={['Container number','Seal'][i]} value={row[key]} required={key==='number'} onChange={value=>update(index,key,value)}/>)}
 <Input label="Size"><select className="input-field" aria-label={t('Size')} value={row.size||''} onChange={event=>update(index,'size',event.target.value||null)}><option value="">{t('Unknown')}</option>{['20','21','40'].map(size=><option key={size} value={size}>{size}′</option>)}</select></Input>
 <Input label="Operational status"><select className="input-field" aria-label={t('Operational status')} value={row.status||''} onChange={event=>update(index,'status',event.target.value)}><option value="" disabled>{t('Unknown')}</option>{['REGISTERED','READY','GATE_OUT','DOORING','STRIPPED','EMPTY_RETURNED'].map(status=><option key={status} value={status}>{t(status)}</option>)}</select></Input>
 {[['goodsDescription','Goods'],['destinationAddress','Destination address'],['vehicleNumber','Vehicle number'],['driverName','Driver'],['vendorName','Vendor'],['notes','Notes']].map(([key,label])=><Input key={key} label={label} value={row[key]} onChange={value=>update(index,key,value)}/>)}
 {[['plannedDeliveryAt','Planned delivery'],['gateOutAt','Gate out'],['strippedAt','Stripped at'],['emptyReturnedAt','Empty returned at'],['freeTimeUntil','Free time until']].map(([key,label])=><Input key={key} label={label} type="datetime-local" value={datetimeInput(row[key])} onChange={value=>update(index,key,datetimeValue(value))}/>)}
 </div></div>)}{!containers.length&&<p className="text-sm text-zinc-500 py-4">{t('No containers recorded')}</p>}</fieldset>;
}
export function RegisterForm({initial,onSaved}) {
 const {t}=useBL(); const navigate=useNavigate(); const [form,setForm]=useState(()=>initial?structuredClone(initial):{register:{dateMeaning:'UNCONFIRMED'},containers:[]}); const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [conflict,setConflict]=useState(false);
 const update=(key,value)=>setForm(previous=>({...previous,[key]:value})); const register=(key,value)=>setForm(previous=>({...previous,register:{...previous.register,[key]:value}}));
 const save=async event=>{event.preventDefault();if(saving||conflict)return;setSaving(true);setError('');try{const response=initial?await api.put(`/bl-register/${initial.id}`,registerPayload(form)):await api.post('/bl-register',registerPayload(form));const id=response.data.id||response.data.data?.id||initial?.id;if(!id)throw Error('B/L response is missing its identifier.');const confirmed=await api.get(`/bl-register/${id}`);if(onSaved)onSaved(confirmed.data);else navigate(`/bl-register/${id}`,{replace:true});}catch(error){const stale=error.response?.status===409;setConflict(stale);setError(stale?t('This record changed. Reload before editing again. Your unsaved values are retained.'):error.response?.data?.message||error.message);}finally{setSaving(false);}};
 return <form onSubmit={save} className="space-y-5" data-bl-form><Notice message={error}/>{!initial&&<p className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-4 text-sm text-zinc-400">{t('A receiver job and sea shipment are created automatically. No quotation or pre-created job is required.')}</p>}
 <fieldset disabled={saving||conflict} className="card p-5 grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{[['registerNumber','Register number'],['billNumber','B/L number'],['carrierName','Carrier'],['vesselName','Vessel'],['voyageNumber','Voyage'],['portOfLoading','Port of loading'],['portOfDischarge','Port of discharge'],['shipperName','Shipper'],['consigneeName','Consignee']].map(([key,label])=><Input key={key} label={label} value={form[key]} required={['billNumber','vesselName','portOfLoading','portOfDischarge'].includes(key)} onChange={value=>update(key,value)}/>)}
 {[['customerName','Customer name'],['billingPartyName','Billing party'],['cargoDescription','Cargo description']].map(([key,label])=><Input key={key} label={label} value={form.register?.[key]} required={key==='customerName'} onChange={value=>register(key,value)}/>)}
 <Input label="Book date out" type="date" value={form.register?.departureDate?.slice(0,10)} onChange={value=>register('departureDate',value||null)}/><Input label="Book date in" type="date" value={form.register?.arrivalDate?.slice(0,10)} onChange={value=>register('arrivalDate',value||null)}/>
 <Input label="Date meaning"><select className="input-field" aria-label={t('Date meaning')} value={form.register?.dateMeaning||'UNCONFIRMED'} onChange={event=>register('dateMeaning',event.target.value)}>{['UNCONFIRMED','VESSEL','CONTAINER','DOCUMENT'].map(value=><option key={value} value={value}>{t(value)}</option>)}</select></Input>
 <p className="text-xs text-amber-400 sm:col-span-2 xl:col-span-3">{t('Book dates out / in — meaning unconfirmed')}</p><Input label="Notes" value={form.notes} onChange={value=>update('notes',value)}/>{initial&&<Input label="Revision note" value={form.revisionNote} onChange={value=>update('revisionNote',value)}/>}</fieldset>
 <ContainerEditor containers={form.containers||[]} onChange={value=>update('containers',value)} disabled={saving||conflict}/>
 <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={saving||conflict}>{t(saving?'Saving...':'Save B/L')}</Button><Link className="text-sm text-zinc-400" to="/bl-register">{t('Cancel')}</Link>{conflict&&<Button type="button" variant="secondary" onClick={()=>location.reload()}>{t('Reload record')}</Button>}</div></form>;
}
export default function BLDetail({create=false}) {
 const {id}=useParams();const {t}=useBL();const resource=useResource(create?null:`/bl-register/${id}`);
 return <div className="space-y-5"><Link className="text-sm text-brand-400" to="/bl-register">← {t('Back to register')}</Link><PageHeader title={create?t('New B/L'):resource.data?.billNumber||t('B/L register')}/><Notice message={resource.error}/>{create?<RegisterForm/>:resource.loading?<Spinner/>:resource.data&&<BLWorkspace key={`${id}:${resource.data.version}`} bill={resource.data} onReload={resource.reload}/>}</div>;
}
