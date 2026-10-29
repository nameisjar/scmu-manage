import {Link} from 'react-router-dom';
import {useBL} from '../../i18n/bl.mjs';
export default function JourneyImportGroups({groups,onChange,confirmed,onConfirm,disabled}){
 const {t}=useBL();
 const update=(key,patch)=>onChange(old=>old.map(g=>g.key===key?{...g,...patch}:g));
 return <div className="space-y-4" data-journey-import-groups>
  <p className="text-sm text-zinc-500">{t('Periksa kapal, voyage, periode, tujuan, dan B/L dalam setiap kelompok. Belum ada pengiriman yang dibuat pada tahap ini.')}</p>
  {!groups.length&&<p className="card p-4 text-sm">{t('Dokumen pendukung akan ditautkan ke nomor B/L yang sudah tersedia. Tidak ada pengiriman baru yang dibuat.')}</p>}
  <fieldset disabled={disabled} className="space-y-4">{groups.map((g,i)=>{
   const target=g.candidates.find(c=>c.id===g.targetId),fields=g.mode==='EXISTING'?target||{}:g.fields;
   return <section key={g.key} className="card p-4 space-y-4" data-import-group={i}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t('Kelompok pengiriman')} {i+1}</h3><span className="table-pill">{g.documents.length} B/L</span></div>
    <label className="block text-sm">{t('Pengiriman tujuan')}<select aria-label={`${t('Pengiriman tujuan')} ${i+1}`} className="input-field" disabled={g.locked} value={g.mode==='NEW'?'NEW':g.targetId} onChange={e=>update(g.key,e.target.value==='NEW'?{mode:'NEW',targetId:''}:{mode:'EXISTING',targetId:e.target.value})}>
     <option value="NEW">{t('Buat pengiriman baru')}</option>{g.candidates.map(c=><option key={c.id} value={c.id} disabled={c.archived}>{c.vesselName} / {c.voyageNumber} · {c.period||t('Periode belum diisi')} · {c.destination}{c.archived?' · '+t('Diarsipkan'):''}</option>)}
    </select></label>
    {g.mode==='EXISTING'?<div className="rounded-lg bg-brand-500/5 p-3 text-sm"><strong>{fields.vesselName} / {fields.voyageNumber}</strong><p>{fields.period||'—'} · {fields.destination||'—'}</p>{target&&<Link className="text-brand-500 underline" target="_blank" rel="noreferrer" to={'/shipments/'+target.id}>{t('Lihat pengiriman tujuan')}</Link>}<p className="mt-2 text-zinc-500">{t('B/L dan file ditambahkan ke pengiriman ini. Isian sumber yang sudah tersimpan tetap dipertahankan.')}</p></div>:
     <div className="grid sm:grid-cols-2 gap-3">{[['vesselName','Nama kapal'],['voyageNumber','Voyage'],['period','Periode (tahun atau tahun-bulan)'],['destination','Pelabuhan tujuan']].map(([key,label])=><label className="block text-sm" key={key}>{t(label)}<input aria-label={`${t(label)} ${i+1}`} className="input-field" maxLength={key==='period'?7:200} value={fields[key]||''} onChange={e=>update(g.key,{fields:{...g.fields,[key]:e.target.value}})}/></label>)}</div>}
    {g.mode==='NEW'&&<p className="text-xs text-amber-600">{t('Tahun B/L hanya saran periode. Konfirmasi periode perjalanan; tanggal penerbitan B/L tidak otomatis menjadi tanggal berangkat atau tiba.')}</p>}
    <ul className="space-y-2 text-sm">{g.documents.map(d=><li key={d.sessionId} className="rounded-lg border border-zinc-200 p-3 break-words"><strong>{d.billNumber}</strong> · {d.containerCount} {t('Kontainer')}<small className="block text-zinc-500">{d.originalName}</small></li>)}</ul>
   </section>;
  })}<label className="flex gap-3 text-sm"><input aria-label={t('Saya telah memeriksa pengelompokan dan periode pengiriman.')} type="checkbox" checked={confirmed} onChange={e=>onConfirm(e.target.checked)}/>{t('Saya telah memeriksa pengelompokan dan periode pengiriman.')}</label></fieldset>
 </div>;
}
