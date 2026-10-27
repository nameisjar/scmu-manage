import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Button, Modal } from '../../components/common';
import { DataTable, Notice, usePagedResource } from '../../components/jpt/Workspace';
import { usePageQuery } from '../../components/Layout/PageNavigation';
import { useBL } from '../../i18n/bl.mjs';
import { formatRegisterAmount, isRegisterArchived, registerDocumentAvailability } from './registerModel.mjs';

export const registerFilters = ['search','month','vessel','voyage','vesselId','voyageId','vesselExact','voyageExact','voyageMissing','port','company','dateFrom','dateTo','documents','archived','sort','direction'];
export const registerStats = [['totalRegisters','Total B/L'],['periodRegisters','B/L periode ini'],['missingBL','File B/L belum tersedia'],['missingPackingList','PL perlu tindakan'],['incompleteRegisters','B/L perlu dilengkapi']];

export function RegisterStats({summary={},loading=false,compact=false}) {
 const {t}=useBL();
 if(compact)return <><div className="grid sm:grid-cols-3 gap-3">
  {[['totalRegisters','Total B/L'],['missingBL','File B/L belum tersedia'],['incompleteRegisters','Perlu dilengkapi']].map(([key,label])=><div key={key} className="card px-4 py-3 flex items-center justify-between gap-4"><div><p className="text-xs text-zinc-400">{t(label)}</p><p className="text-2xl tabular-nums mt-1">{loading?'…':summary[key]??'—'}</p></div>{key==='totalRegisters'&&<p className="text-xs text-zinc-500 text-right">{t('Periode ini')}:<br/><span className="text-zinc-300 tabular-nums">{summary.periodRegisters??'—'}</span></p>}{key==='incompleteRegisters'&&<p className="text-xs text-zinc-500 text-right">{t('PL perlu tindakan')}:<br/><span className="text-zinc-300 tabular-nums">{summary.missingPackingList??'—'}</span></p>}</div>)}
 </div><div className="grid sm:grid-cols-3 gap-3 text-sm"><div className="card px-4 py-3"><span className="text-zinc-500">{t('Tenggat storage/demurrage')}</span><strong className="float-right tabular-nums text-amber-300">{loading?'…':summary.deadlineAlerts??'—'}</strong></div><div className="card px-4 py-3"><span className="text-zinc-500">{t('Bongkar belum selesai')}</span><strong className="float-right tabular-nums text-amber-300">{loading?'…':summary.unloadingPending??'—'}</strong></div><div className="card px-4 py-3"><span className="text-zinc-500">{t('Selisih B/L dan PL')}</span><strong className="float-right tabular-nums text-amber-300">{loading?'…':summary.packingExceptions??'—'}</strong></div></div></>;
 return <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">{registerStats.map(([key,label])=><div key={key} className="card p-4"><p className="text-xs text-zinc-400">{t(label)}</p><p className="text-2xl tabular-nums mt-2">{loading?'…':summary[key]??'—'}</p></div>)}</div>;
}

export default function BLRegister() { return <UnifiedRegister/>; }

function UnifiedRegister() {
 const {t}=useBL();const {user}=useAuth();const [params,setQuery]=usePageQuery();const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [advancedOpen,setAdvancedOpen]=useState(false);const [columnOpen,setColumnOpen]=useState(false);const [exportOpen,setExportOpen]=useState(false);const [draft,setDraft]=useState({});
 const [hiddenColumns,setHiddenColumns]=useState(()=>{try{return new Set(JSON.parse(localStorage.getItem('scmu_register_hidden_columns')||'[]'));}catch{return new Set();}});
 const filters=Object.fromEntries(registerFilters.map(key=>[key,params.get(key)||({documents:'ALL',archived:'active',sort:'createdAt',direction:'desc'}[key]||'')]));
 const resource=usePagedResource('/bl-register',filters);const filter=(key,value)=>setQuery({[key]:value,page:null});
 const advancedKeys=['vessel','voyage','port','company','dateFrom','dateTo','archived'];
 const openAdvanced=()=>{setDraft(Object.fromEntries(advancedKeys.map(key=>[key,filters[key]])));setAdvancedOpen(true);};
 const applyAdvanced=()=>{setQuery({...draft,page:null});setAdvancedOpen(false);};
 const clearAll=()=>setQuery(Object.fromEntries([...registerFilters.map(key=>[key,null]),['page',null]]));
 const exportFile=async scope=>{setBusy(true);setError('');try{const query=new URLSearchParams({scope,...(scope==='filtered'?filters:{archived:filters.archived})});const response=await api.get(`/bl-register/export.xlsx?${query}`,{responseType:'blob'});const href=URL.createObjectURL(response.data);const anchor=document.createElement('a');anchor.href=href;anchor.download=`register-${scope}.xlsx`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);}catch(error){let message=error.response?.data?.message||error.message;if(error.response?.data instanceof Blob){try{message=JSON.parse(await error.response.data.text()).message||message;}catch{/* Keep the transport error if the server did not return JSON. */}}setError(t('Ekspor gagal.')+' '+message);}finally{setBusy(false);}};
 const archive=async row=>{if(!window.confirm(t(isRegisterArchived(row)?'Pulihkan register ini?':'Arsipkan register ini? Data dan dokumen tetap disimpan.')))return;setBusy(true);setError('');try{await api.post(`/bl-register/${row.id}/archive`,{version:row.version,archived:!isRegisterArchived(row)});await api.get(`/bl-register/${row.id}`);resource.reload();}catch(error){setError(error.response?.data?.message||error.message);}finally{setBusy(false);}};
 const field=(key,label,register=false,date=false)=>({key,label,render:row=>{const value=register?row.register?.[key]:row[key];return date?value?.slice(0,10)||'—':value??'—';}});
 const columns=[
  {key:'billNumber',label:'Nomor B/L',className:'sticky left-0 z-10 bg-zinc-950 min-w-48 w-48 max-w-48',render:row=><Link className="text-brand-400 font-mono break-words" to={`/bl-register/${row.id}`}>{row.billNumber}</Link>},
  field('vesselName','Nama kapal'),field('voyageNumber','Voyage'),field('carrierName','Pelayaran'),field('portOfLoading','Pelabuhan asal'),field('portOfDischarge','Pelabuhan tujuan'),
  field('departureDate','Tanggal keluar',true,true),field('arrivalDate','Tanggal masuk',true,true),{key:'dateMeaning',label:'Makna tanggal',render:row=>t(row.register?.dateMeaning||'UNCONFIRMED')},
  ...['20','21','40'].map(size=>({...field(`quantity${size}`,`Jumlah ${size}`,true),className:'text-center'})),field('cargoDescription','Uraian barang',true),field('notes','Catatan'),
  field('partyName','Vendor/JPT',true),field('partyText','Pihak penanggung jawab',true),field('reference1','Nomor internal',true),field('reference2','Nomor invoice',true),
  field('additionalDate1','Tanggal invoice',true,true),field('additionalDate2','Jatuh tempo',true,true),{key:'registerAmount',label:'Jumlah tagihan',align:'right',render:row=>formatRegisterAmount(row.registerAmount)},field('additionalNotes','Catatan tambahan',true),
  field('shipperName','Pengirim'),field('consigneeName','Penerima'),
  {key:'documents',label:'Dokumen',render:row=><Link className="text-brand-400" to={`/bl-register/${row.id}?tab=documents`}>B/L: {t(registerDocumentAvailability(row).billOfLading?'Ada':'Belum tersedia')} · Packing List: {t(registerDocumentAvailability(row).packingList?'Ada':'Belum tersedia')}</Link>},
  field('createdAt','Tanggal dibuat',false,true),
  {key:'archived',label:'Arsip',render:row=>t(isRegisterArchived(row)?'Diarsipkan':'Aktif')},
  {key:'actions',label:'Tindakan',className:'sticky right-0 z-10 bg-zinc-950 min-w-44',render:row=><div className="flex gap-3 whitespace-nowrap"><Link className="text-brand-400" to={`/bl-register/${row.id}`}>{t('Detail')}</Link>{!isRegisterArchived(row)&&<Link className="text-brand-400" to={`/bl-register/${row.id}?tab=identity`}>{t('Ubah')}</Link>}{['SUPER_ADMIN','ADMIN'].includes(user?.role)&&<button disabled={busy} className="text-amber-300" onClick={()=>archive(row)}>{t(isRegisterArchived(row)?'Pulihkan':'Arsipkan')}</button>}</div>},
 ];
 const columnGroups=[
  {label:'Identitas pengiriman',keys:['billNumber','vesselName','voyageNumber','carrierName','portOfLoading','portOfDischarge']},
  {label:'Tanggal dan jumlah',keys:['departureDate','arrivalDate','dateMeaning','quantity20','quantity21','quantity40']},
  {label:'Barang',keys:['cargoDescription','notes']},
  {label:'Tagihan',keys:['partyName','partyText','reference1','reference2','additionalDate1','additionalDate2','registerAmount','additionalNotes']},
  {label:'Pihak pengiriman',keys:['shipperName','consigneeName']},
  {label:'Dokumen dan sistem',keys:['documents','createdAt','archived','actions']},
 ];
 const visibleColumns=columns.filter(column=>!hiddenColumns.has(column.key));
 const toggleColumn=key=>setHiddenColumns(previous=>{const next=new Set(previous);next.has(key)?next.delete(key):next.add(key);localStorage.setItem('scmu_register_hidden_columns',JSON.stringify([...next]));return next;});
 const sortValue=`${filters.sort}:${filters.direction}`;const sortOptions=[['createdAt:desc','Terbaru'],['createdAt:asc','Terlama'],['billNumber:asc','Nomor B/L A–Z'],['vesselName:asc','Kapal A–Z'],['registerAmount:desc','Nominal terbesar']];
 const documentOptions=[['ALL','Semua dokumen'],['BL_MISSING','B/L belum tersedia'],['PACKING_MISSING','Packing List belum tersedia'],['COMPLETE','Dokumen lengkap']];
 const chipDefs=[['search','Pencarian'],['month','Bulan'],['documents','Dokumen'],['vessel','Kapal'],['voyage','Voyage'],['port','Pelabuhan asal'],['company','Perusahaan'],['dateFrom','Dari'],['dateTo','Sampai'],['archived','Arsip']];
 const activeChips=chipDefs.filter(([key])=>filters[key]&&!(key==='documents'&&filters[key]==='ALL')&&!(key==='archived'&&filters[key]==='active')).map(([key,label])=>({key,label,value:key==='documents'?documentOptions.find(([value])=>value===filters[key])?.[1]||filters[key]:filters[key]}));
 const advancedCount=advancedKeys.filter(key=>filters[key]&&!(key==='archived'&&filters[key]==='active')).length;
 return <div className="space-y-5" data-bl-register>
  <PageHeader title={t('Pengiriman')} subtitle={t('Kelola dokumen, kontainer, dan operasional setiap pengiriman.')} action={<Link className="inline-flex px-4 py-2 rounded-lg bg-brand-500 text-white text-sm" to="/bl-register/new">{t('Tambah pengiriman')}</Link>}/>
  <RegisterStats summary={resource.data?.summary} loading={resource.loading} compact/>
  <div className="card p-3 space-y-3">
   <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_10rem_13rem_auto_12rem_auto_auto] items-end">
    <label className="min-w-0 sm:col-span-2 lg:col-span-1"><span className="sr-only">{t('Cari B/L, kapal, vendor, invoice')}</span><input className="input-field" aria-label={t('Cari B/L, kapal, vendor, invoice')} type="search" placeholder={t('Cari B/L, kapal, vendor, invoice')} value={filters.search} onChange={event=>filter('search',event.target.value)}/></label>
    <label><span className="sr-only">{t('Bulan')}</span><input className="input-field" aria-label={t('Bulan')} type="month" value={filters.month} onChange={event=>filter('month',event.target.value)}/></label>
    <label><span className="sr-only">{t('Kelengkapan dokumen')}</span><select className="input-field" aria-label={t('Kelengkapan dokumen')} value={filters.documents} onChange={event=>filter('documents',event.target.value)}>{documentOptions.map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
    <Button variant="secondary" className="whitespace-nowrap" onClick={openAdvanced}>{t('Filter lainnya')}{advancedCount>0&&<span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">{advancedCount}</span>}</Button>
    <label><span className="sr-only">{t('Urutan')}</span><select className="input-field" aria-label={t('Urutan')} value={sortValue} onChange={event=>{const [sort,direction]=event.target.value.split(':');setQuery({sort,direction,page:null});}}>{sortOptions.map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
    <Button variant="secondary" className="whitespace-nowrap" onClick={()=>setColumnOpen(true)}>{t('Kolom')}</Button>
    <div className="relative"><Button variant="secondary" className="whitespace-nowrap" aria-expanded={exportOpen} onClick={()=>setExportOpen(value=>!value)}>{t('Ekspor')}</Button>{exportOpen&&<div className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl"><button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-800" disabled={busy||resource.loading} onClick={()=>{setExportOpen(false);exportFile('filtered');}}>{t('Ekspor hasil filter')}</button><button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-800" disabled={busy} onClick={()=>{setExportOpen(false);exportFile('all');}}>{t('Ekspor seluruh register')}</button></div>}</div>
   </div>
   {activeChips.length>0&&<div className="flex flex-wrap items-center gap-2" aria-label={t('Filter aktif')}>{activeChips.map(chip=><button key={chip.key} type="button" className="rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs text-brand-200 hover:bg-brand-500/20" onClick={()=>filter(chip.key,chip.key==='archived'?'active':chip.key==='documents'?'ALL':'')}>{t(chip.label)}: {t(chip.value)} ×</button>)}<button type="button" className="px-2 py-1 text-xs text-zinc-400 hover:text-white" onClick={clearAll}>{t('Hapus semua')}</button></div>}
  </div>
  <details className="text-xs text-zinc-400"><summary className="cursor-pointer select-none hover:text-zinc-200">{t('Tentang data register dan ekspor')}</summary><p className="mt-2 max-w-4xl leading-5">{t('Excel memuat seluruh hasil, bukan hanya halaman ini. Kebutuhan Packing List mengikuti aturan mitra. Jumlah manual terpisah dari kontainer dan kolom 21 masih perlu dikonfirmasi.')}</p></details>
  <Notice message={error||resource.error}/>
  <div data-register-table><DataTable columns={visibleColumns} columnGroups={columnGroups} rows={resource.rows} pagination={resource.pagination} empty="Belum ada register sesuai filter."/></div>
  <Modal open={advancedOpen} onClose={()=>setAdvancedOpen(false)} title={t('Filter lainnya')} width="max-w-3xl" footer={<div className="flex flex-wrap justify-between gap-3"><Button variant="ghost" onClick={()=>setDraft({vessel:'',voyage:'',port:'',company:'',dateFrom:'',dateTo:'',archived:'active'})}>{t('Reset')}</Button><div className="flex gap-2"><Button variant="secondary" onClick={()=>setAdvancedOpen(false)}>{t('Batal')}</Button><Button onClick={applyAdvanced}>{t('Terapkan filter')}</Button></div></div>}><div className="grid sm:grid-cols-2 gap-4">{[['vessel','Kapal','text'],['voyage','Voyage','text'],['port','Pelabuhan asal','text'],['company','Perusahaan','text'],['dateFrom','Tanggal dibuat dari','date'],['dateTo','Tanggal dibuat sampai','date']].map(([key,label,type])=><label className="space-y-1" key={key}><span className="text-sm text-zinc-300">{t(label)}</span><input className="input-field" aria-label={t(label)} type={type} value={draft[key]||''} onChange={event=>setDraft(value=>({...value,[key]:event.target.value}))}/></label>)}<label className="space-y-1 sm:col-span-2"><span className="text-sm text-zinc-300">{t('Arsip')}</span><select className="input-field" aria-label={t('Arsip')} value={draft.archived||'active'} onChange={event=>setDraft(value=>({...value,archived:event.target.value}))}><option value="active">{t('Aktif')}</option><option value="archived">{t('Diarsipkan')}</option><option value="all">{t('Aktif dan arsip')}</option></select></label></div></Modal>
  <Modal open={columnOpen} onClose={()=>setColumnOpen(false)} title={t('Atur kolom tabel')} width="max-w-3xl" footer={<div className="flex justify-between gap-3"><Button variant="ghost" onClick={()=>{setHiddenColumns(new Set());localStorage.removeItem('scmu_register_hidden_columns');}}>{t('Tampilkan semua')}</Button><Button onClick={()=>setColumnOpen(false)}>{t('Selesai')}</Button></div>}><p className="mb-4 text-sm text-zinc-400">{t('Pilih kolom yang ingin ditampilkan. Pilihan disimpan di perangkat ini.')}</p><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{columns.filter(column=>!['billNumber','actions'].includes(column.key)).map(column=><label key={column.key} className="flex items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-sm"><input type="checkbox" checked={!hiddenColumns.has(column.key)} onChange={()=>toggleColumn(column.key)}/><span>{t(column.label)}</span></label>)}</div></Modal>
 </div>;
}
