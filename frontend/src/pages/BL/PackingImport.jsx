import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Button } from '../../components/common';
import { DataTable, DetailModal, Notice } from '../../components/jpt/Workspace';
import { useBL } from '../../i18n/bl.mjs';
import { translatePackingWarning } from '../../i18n/packingImport.mjs';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export default function PackingImport({ bill, disabled, onAttached, onApplied, existingOnly=false }) {
  const { t } = useBL(); const input = useRef(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); const [selected, setSelected] = useState([]);
  const [confirmed, setConfirmed] = useState(false); const [unit, setUnit] = useState('UNCONFIRMED');
  const [existing, setExisting] = useState('');
  const sources = (bill.files || []).filter(f => f.category === 'PACKING_LIST' && f.mimeType === MIME);
  const show = data => { setPreview(data); setSelected(data.groups.filter(g => g.registered && g.sealMatches).map(g => g.id)); setConfirmed(false); setUnit('UNCONFIRMED'); };
  const upload = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setError('');
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) { setError(t('Pilih file XLSX maksimal 5 MB.')); return; }
    setBusy(true);
    try {
      const body = new FormData(); body.append('file', file); body.append('version', bill.version);
      const { data } = await api.post(`/bl-register/${bill.id}/packing-import/preview`, body, { timeout: 60000 });
      await onAttached(); show(data);
    } catch (err) { setError(err.response?.data?.message || err.message); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const reopen = async () => {
    setBusy(true); setError('');
    try { show((await api.post(`/bl-register/${bill.id}/packing-import/${existing}/preview`, {}, { timeout: 60000 })).data); }
    catch (err) { setError(err.response?.data?.message || err.message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setError('');
    try {
      await api.post(`/bl-register/${bill.id}/packing-import/apply`, { fileId: preview.fileId, hash: preview.hash, version: preview.version, groupIds: selected, volumeUnit: unit, confirmed }, { timeout: 60000 });
      await onApplied(); setPreview(null);
    } catch (err) { setError(err.response?.data?.message || err.message); } finally { setBusy(false); }
  };
  return <div className="card p-5 space-y-4">
    <div><h3 className="font-semibold">{t(existingOnly?'Baca rincian dari sumber':'Impor Packing List Excel mitra')}</h3><p className="text-sm text-zinc-400 mt-1">{t('Unggah file asli, periksa hasil pembacaan, lalu pilih penerima yang termasuk B/L ini. Data masuk sebagai draf untuk diperiksa; file asli tetap tersimpan.')}</p></div>
    <Notice message={error} />
    <fieldset disabled={disabled || busy} className="flex flex-wrap gap-3 items-end">
      {!existingOnly&&<label className="flex-1 min-w-56 space-y-1 text-xs text-zinc-400">{t('File Excel mitra (.xlsx)')}<input ref={input} className="input-field block mt-1" type="file" accept=".xlsx" onChange={upload} /></label>}
      {sources.length > 0 && <><label className="flex-1 min-w-56 text-xs text-zinc-400">{t('Berkas yang sudah diunggah')}<select className="input-field block mt-1" value={existing} onChange={e => setExisting(e.target.value)}><option value="">—</option>{sources.map(f => <option key={f.id} value={f.id}>{f.originalName}</option>)}</select></label><Button type="button" variant="secondary" disabled={!existing || disabled || busy} onClick={reopen}>{t('Pratinjau impor')}</Button></>}
    </fieldset>
    <p className="text-xs text-zinc-500">{t('Pembaca awal mendukung kolom TGL, TOKO, COLY, NAMA BARANG, UKURAN, dan M3/TN seperti contoh Bilba. Format lain tetap dapat ditranskripsikan manual.')}</p>
    {preview && <DetailModal title="Pratinjau impor Packing List" onClose={() => !busy && setPreview(null)} actions={<Button type="button" disabled={busy || !confirmed || !selected.length || preview.alreadyImported} onClick={apply}>{t(busy ? 'Saving...' : 'Terapkan sebagai draf')}</Button>}>
      <div className="space-y-5">
        <Notice message={error} />
        <div><p className="font-medium break-words">{preview.filename}</p>
          <p className="text-sm text-zinc-400">{preview.parser === 'MANUAL_ONLY' ? t('Pembacaan otomatis belum tersedia untuk format ini.') : <>B/L {preview.billNumber} · {preview.totals.containers} {t('Kontainer')} · {preview.totals.groups} {t('Penerima / mark')} · {preview.totals.items} {t('Nama barang')} · {preview.totals.packages} {t('Koli')}</>}</p>
        </div>
        {preview.headings.map((h, i) => <p key={i} className="text-xs text-zinc-400 break-words">{h}</p>)}
        {preview.alreadyImported && <p className="text-amber-300 text-sm">{t('File yang sama sudah diimpor ke B/L ini. Ubah hasilnya pada transkripsi untuk menghindari duplikasi.')}</p>}
        <div className="rounded-lg border border-amber-900/60 p-3 text-sm text-amber-200 space-y-1">{preview.warnings.map(w => <p key={w}>{translatePackingWarning(w,t)}</p>)}</div>
        <p className="text-sm text-zinc-400">{t('Pilih semua kelompok yang diperlukan sekali impor. Kontainer yang belum tercatat harus ditambahkan melalui tab Kontainer. Segel yang berbeda perlu diperiksa.')}</p>
        <DataTable rows={preview.groups} columns={[
          { key: 'select', label: t('Pilih'), render: g => <input aria-label={`${t('Pilih')} ${g.containerNumber} ${g.recipientName}`} type="checkbox" disabled={busy || !g.registered || preview.alreadyImported} checked={selected.includes(g.id)} onChange={e => { setSelected(s => e.target.checked ? [...s, g.id] : s.filter(id => id !== g.id)); setConfirmed(false); }} /> },
          { key: 'containerNumber', label: t('Nomor kontainer'), render: g => <div className="font-mono">{g.containerNumber}<span className="block text-xs text-zinc-400">{g.sealNumber}</span><span className={`block text-xs ${g.sealMatches ? 'text-emerald-400' : 'text-amber-300'}`}>{t(!g.registered ? 'Belum tercatat pada B/L ini' : g.sealMatches ? 'Kontainer dan segel cocok' : 'Periksa perbedaan segel')}</span></div> },
          { key: 'sourceMark', label: t('Penerima / mark') },
          { key: 'items', label: t('Rincian sumber'), render: g => <details><summary className="cursor-pointer text-brand-300">{g.items.length} {t('Nama barang')} · {g.items.reduce((n, i) => n + i.packages, 0)} {t('Koli')}</summary><ul className="mt-2 space-y-2 max-w-lg">{g.items.map(i => <li key={i.id} className="text-xs"><strong>{i.packages}</strong> · {i.description}<span className="block text-zinc-500">{i.sourceSheet}!{i.sourceRow} · {i.itemDateText || '—'} · {t('M3/TN sumber')}: {i.sourceVolume ?? '—'}</span></li>)}</ul></details> },
        ]} />
        {preview.candidates.length > 0 && <div className="text-sm space-y-2"><p>{t('Kontainer juga ditemukan pada B/L berikut. Pastikan penautannya benar.')}</p>{preview.candidates.map(c => <Link key={c.id} className="block text-brand-400" to={`/bl-register/${c.id}?tab=packing`} onClick={() => setPreview(null)}>{c.billNumber} · {c.vesselName} / {c.voyageNumber}</Link>)}</div>}
        <label className="block space-y-1 text-sm">{t('Satuan kolom volume sumber')}<select className="input-field" value={unit} disabled={busy} onChange={e => { setUnit(e.target.value); setConfirmed(false); }}><option value="UNCONFIRMED">{t('Belum dikonfirmasi; simpan nilai sumber saja')}</option><option value="CBM">{t('Saya memastikan kolom volume ini adalah CBM')}</option></select></label>
        <label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || preview.alreadyImported || !preview.groups.length} onChange={e => setConfirmed(e.target.checked)} />{t('Saya sudah memeriksa B/L tujuan, kontainer, segel, kelompok penerima, dan satuan. Simpan pilihan ini sebagai draf.')}</label>
        <p className="text-xs text-zinc-500">{t('Nama, alamat, telepon, tanggal, dan rincian barang dapat dikoreksi pada transkripsi sesudah impor. Tanggal tanpa tahun tidak diubah menjadi tanggal lengkap.')}</p>
      </div>
    </DetailModal>}
  </div>;
}
