import { useState } from 'react';
import api from '../../api/client';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Button, Modal } from '../../components/common';
import { DataTable, Notice, usePagedResource } from '../../components/jpt/Workspace';
import { usePageQuery } from '../../components/Layout/PageNavigation';

const empty={name:'',type:'TRANSPORTER',npwp:'',city:'',state:'',phone:'',email:'',contactPerson:'',documentPolicy:'BL_ONLY',includeInPackingHeader:true,notes:''};
export default function CompanyList(){
 const {t}=useLanguage();const {canManage}=useAuth();const [params,setQuery]=usePageQuery();const search=params.get('search')||'';const resource=usePagedResource('/companies',{search,type:'TRANSPORTER'},'partners');const [form,setForm]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const open=row=>setForm(row?{...row}:{...empty});const update=(key,value)=>setForm(value0=>({...value0,[key]:value}));
 const save=async event=>{event.preventDefault();setBusy(true);setError('');try{const payload={...form,type:'TRANSPORTER'};form.id?await api.put(`/companies/${form.id}`,payload):await api.post('/companies',payload);setForm(null);resource.reload();}catch(error){setError(error.response?.data?.message||error.message);}finally{setBusy(false);}};
 return <div className="space-y-5"><PageHeader title={t('Mitra/JPT')} subtitle={t('Atur mitra, kontak, dan kebiasaan dokumen agar checklist B/L sesuai proses nyata.')} action={canManage()&&<Button onClick={()=>open()}>{t('Tambah mitra')}</Button>}/>
  <input className="input-field max-w-xl" type="search" aria-label={t('Cari mitra')} placeholder={t('Cari mitra')} value={search} onChange={event=>setQuery({search:event.target.value,page:null})}/><Notice message={resource.error||error}/>
  <DataTable rows={resource.rows.filter(row=>!row.isInternal)} pagination={resource.pagination} empty={t('Belum ada mitra/JPT.')} columns={[
   {key:'name',label:t('Nama mitra')},{key:'contact',label:t('Kontak'),render:row=><>{row.contactPerson||'—'}<p className="text-xs text-zinc-500">{row.phone||row.email||'—'}</p></>},{key:'city',label:t('Kota')},
   {key:'documentPolicy',label:t('Dokumen dari mitra'),render:row=>t(row.documentPolicy==='BL_AND_PACKING'?'B/L dan Packing List':'B/L saja')},
   {key:'internalPacking',label:t('Tindakan SCMU'),render:row=>t(row.documentPolicy==='BL_ONLY'?'Buat Packing List internal':'Periksa Packing List mitra')},
   {key:'header',label:t('Kepala Packing List'),render:row=>t(row.includeInPackingHeader?'Ya':'Tidak')},
   ...(canManage()?[{key:'actions',label:t('Tindakan'),items:[{key:'edit',label:'Ubah',onClick:open}]}]:[]),
  ]}/>
  <Modal open={!!form} onClose={()=>!busy&&setForm(null)} title={t(form?.id?'Ubah mitra':'Tambah mitra')} width="max-w-3xl"><form onSubmit={save} className="space-y-4"><div className="grid sm:grid-cols-2 gap-4">{[['name','Nama mitra'],['contactPerson','Narahubung'],['phone','Telepon'],['email','Email'],['city','Kota'],['state','Provinsi'],['npwp','NPWP']].map(([key,label])=><label key={key} className="space-y-1"><span className="text-sm text-zinc-300">{t(label)}</span><input className="input-field" type={key==='email'?'email':'text'} required={key==='name'} value={form?.[key]||''} onChange={event=>update(key,event.target.value)}/></label>)}<label className="space-y-1"><span className="text-sm text-zinc-300">{t('Dokumen dari mitra')}</span><select className="input-field" value={form?.documentPolicy||'BL_ONLY'} onChange={event=>update('documentPolicy',event.target.value)}><option value="BL_ONLY">{t('B/L saja')}</option><option value="BL_AND_PACKING">{t('B/L dan Packing List')}</option></select></label><label className="sm:col-span-2 flex items-center gap-3 rounded-lg border border-zinc-800 p-3"><input type="checkbox" checked={form?.includeInPackingHeader!==false} onChange={event=>update('includeInPackingHeader',event.target.checked)}/><span>{t('Masukkan Packing List ke Kepala Packing List')}</span></label><label className="sm:col-span-2 space-y-1"><span className="text-sm text-zinc-300">{t('Catatan')}</span><textarea className="input-field" rows="3" value={form?.notes||''} onChange={event=>update('notes',event.target.value)}/></label></div><div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={()=>setForm(null)}>{t('Batal')}</Button><Button type="submit" disabled={busy}>{t(busy?'Menyimpan...':'Simpan')}</Button></div></form></Modal>
 </div>;
}
