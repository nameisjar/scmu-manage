import { Link } from 'react-router-dom';
import { useState } from 'react';
import PackingHeaderCreator from '../BL/PackingHeaderCreator';
import PackingRecapCreator from '../BL/PackingRecapCreator';
import { PageHeader } from '../../components/common';
import { DataTable, Notice, usePagedResource } from '../../components/jpt/Workspace';
import { usePageQuery } from '../../components/Layout/PageNavigation';
import { useLanguage } from '../../i18n/LanguageContext';

export default function PackingOverview(){
 const {t}=useLanguage();const [params,setQuery]=usePageQuery();const search=params.get('search')||'';const category=params.get('category')||'';const resource=usePagedResource('/operations/packing-lists',{search,category},'packing-overview');const [selected,setSelected]=useState([]);
 return <div className="space-y-5"><PageHeader title={t('Packing List')} subtitle={t('Daftar Packing List mitra, Packing List internal SCMU, dan Kepala Packing List yang terhubung langsung ke B/L.')}/>
  <div className="card p-3 grid sm:grid-cols-[1fr_16rem] gap-3"><input className="input-field" type="search" aria-label={t('Cari Packing List atau B/L')} placeholder={t('Cari Packing List atau B/L')} value={search} onChange={event=>setQuery({search:event.target.value,page:null})}/><select className="input-field" aria-label={t('Jenis Packing List')} value={category} onChange={event=>setQuery({category:event.target.value,page:null})}><option value="">{t('Semua jenis')}</option><option value="PACKING_LIST">{t('Packing List mitra')}</option><option value="INTERNAL_PACKING_LIST">{t('Packing List internal')}</option><option value="PACKING_HEADER">{t('Kepala Packing List')}</option><option value="INTERNAL_PACKING_RECAP">{t('Rekap PL internal')}</option></select></div>
  <p className="text-sm text-zinc-400">{t('Buka Kelola Packing List pada pengiriman untuk menyiapkan sumber, ringkasan, dan lembar pemeriksaan dalam satu alur.')}</p>
  <details className="card p-3"><summary className="text-sm cursor-pointer">{t('Ekspor gabungan beberapa B/L (opsional)')} · {selected.length} {t('dipilih')}</summary><div className="flex flex-wrap gap-3 mt-3"><PackingHeaderCreator selection={selected} onCreated={()=>{setSelected([]);resource.reload();}}/><PackingRecapCreator selection={selected} onCreated={()=>{setSelected([]);resource.reload();}}/></div></details>
  <Notice message={resource.error}/><DataTable rows={resource.rows} pagination={resource.pagination} empty={t('Belum ada B/L untuk dikelola.')} columns={[
   {key:'select',label:t('Pilih'),render:row=><input type="checkbox" aria-label={`${t('Pilih')} ${row.billNumber}`} disabled={!selected.some(r=>r.id===row.id)&&selected.length>=40} checked={selected.some(r=>r.id===row.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,{id:row.id,version:row.version}]:old.filter(r=>r.id!==row.id))}/>},
   {key:'billNumber',label:t('Nomor B/L'),render:row=><Link className="font-mono text-brand-400" to={`/bl-register/${row.billId}`}>{row.billNumber}</Link>},
   {key:'vessel',label:t('Kapal / Voyage'),render:row=>`${row.vesselName||'—'} / ${row.voyageNumber||'—'}`},{key:'partnerName',label:t('Vendor/JPT'),render:row=>row.partnerName||row.carrierName||'—'},
   {key:'partnerReady',label:t('Packing List mitra'),render:row=>t(row.partnerReady?'Sudah tersedia':row.policy==='BL_AND_PACKING'?'Wajib dari mitra':'Tidak diwajibkan')},
   {key:'internalReady',label:t('Packing List internal'),render:row=>t(row.internalReady?'Sudah tersedia':row.policy==='BL_ONLY'?'Perlu dibuat SCMU':'Opsional')},
   {key:'fieldInspection',label:t('Pemeriksaan lapangan'),render:row=>t(({CONFIRMED:'Sudah diperiksa',DRAFT:'Draf pemeriksaan',STALE:'Perlu diperiksa ulang'})[row.fieldInspection]||'Belum diperiksa')},
   {key:'action',label:t('Tindakan berikutnya'),render:row=>t({UPLOAD_PARTNER:'Unggah Packing List mitra',CREATE_INTERNAL:'Buat Packing List internal',CREATE_HEADER:'Buat Kepala Packing List',COMPLETE:'Dokumen lengkap'}[row.action])},
   {key:'actions',label:t('Tindakan'),render:row=><div className="flex flex-col gap-2"><Link className="text-brand-400" to={`/bl-register/${row.billId}?tab=packing`}>{t('Kelola Packing List')}</Link><Link className="text-brand-400" to={`/bl-register/${row.billId}?tab=documents`}>{t('Dokumen')}</Link></div>},
  ]}/></div>;
}
