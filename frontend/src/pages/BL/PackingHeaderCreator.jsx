import { useState } from 'react';
import api from '../../api/client';
import { Button } from '../../components/common';
import { DetailModal, Notice } from '../../components/jpt/Workspace';
import { useBL } from '../../i18n/bl.mjs';
import { translatePackingWarning } from '../../i18n/packingImport.mjs';

const escapeHtml = value => String(value ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = value => value?.slice(0, 10) || '—';
export function printableHeader(data) {
  const h = escapeHtml;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${h(data.headerNumber)}</title><style>@page{size:A4;margin:12mm}body{font:11px Arial,sans-serif;color:#111}h1{text-align:center;background:#efbad4;padding:10px;font-size:19px}h2{text-align:center;font-size:14px}.summary{text-align:center}section{margin:20px 0;break-inside:auto}.band{padding:7px;border:1px solid #bbb;margin:0}.sender{background:#f3c4db}.recipient{background:#faf5b0}.dates{color:#a00}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #aaa;text-align:left;padding:6px;overflow-wrap:anywhere;white-space:pre-wrap;vertical-align:top}th{background:#e9eef7}tr{break-inside:avoid}.warning{font-size:10px}thead{display:table-header-group}</style></head><body><h1>PT SCMU — KEPALA PACKING LIST</h1><h2>${h(data.vesselName)} / VOY ${h(data.voyageNumber)}</h2><p class="summary">${h(data.headerNumber)}<br>Kontainer: ${data.counts.containers} | 20': ${data.counts.size20} | 21': ${data.counts.size21} | 40': ${data.counts.size40} | Belum diketahui: ${data.counts.unknownSize}</p>${data.records.map(r => `<section><p class="band sender"><b>PENGIRIM:</b> ${h(r.shipperName)}</p><p class="band recipient"><b>PENERIMA:</b> ${h(r.consigneeName)}</p><p class="band"><b>NO. B/L:</b> ${h(r.billNumber)}</p><p class="band">Keluar: ${h(day(r.departureDate))} | Masuk: ${h(day(r.arrivalDate))}</p><p class="band dates">Batas storage: ${h(day(r.storageUntil))} | Mulai demurrage: ${h(day(r.demurrageFrom))}</p><table><thead><tr><th style="width:5%">No</th><th style="width:18%">Kontainer</th><th style="width:16%">Segel</th><th style="width:9%">Ukuran</th><th>Ringkasan barang / mark</th><th style="width:8%">Koli</th></tr></thead><tbody>${r.containers.map((c, i) => `<tr><td>${i + 1}</td><td>${h(c.number)}</td><td>${h(c.seal)}</td><td>${h(c.size)}</td><td>${h(c.description)}${c.recipients.length ? `\nMark: ${h(c.recipients.join('; '))}` : ''}</td><td>${h(c.packages)}</td></tr>`).join('')}</tbody></table></section>`).join('')}${data.warnings.length ? `<div class="warning"><b>Catatan pemeriksaan</b><ul>${data.warnings.map(w => `<li>${h(w)}</li>`).join('')}</ul></div>` : ''}<p class="warning">Dibuat ${h(data.generatedAt)}. Dokumen internal SCMU; dokumen sumber tersimpan pada B/L terkait.</p></body></html>`;
}
function print(data) {
  const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;border:0';
  frame.onload = () => { frame.contentWindow.onafterprint = () => frame.remove(); frame.contentWindow.focus(); frame.contentWindow.print(); };
  frame.srcdoc = printableHeader(data); document.body.appendChild(frame); setTimeout(() => frame.remove(), 60000);
}
export default function PackingHeaderCreator({ selection, disabled, onCreated, number }) {
  const { t } = useBL(); const [data, setData] = useState(null); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [accepted, setAccepted] = useState(false); const [confirmed, setConfirmed] = useState(false); const [saved, setSaved] = useState(false);
  const preview = async () => {
    setError(''); setBusy(true); setSaved(false); setConfirmed(false); setAccepted(false);
    try { setData((await api.post('/operations/packing-headers/preview', { selection, headerNumber: number || undefined }, { timeout: 60000 })).data); }
    catch (err) { setError(err.response?.data?.message || err.message); } finally { setBusy(false); }
  };
  const create = async () => {
    setError(''); setBusy(true);
    try {
      const response = await api.post('/operations/packing-headers', { selection: data.records.map(r => ({ id: r.id, version: r.version })), headerNumber: data.headerNumber, confirmed, acceptWarnings: accepted }, { responseType: 'blob', timeout: 60000 });
      const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = `${data.headerNumber}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaved(true); await onCreated?.();
    } catch (err) {
      let message = err.message;
      if (err.response?.data instanceof Blob) { try { message = JSON.parse(await err.response.data.text()).message || message; } catch { /* Display network error */ } }
      setError(message);
    } finally { setBusy(false); }
  };
  return <div className="space-y-2"><Button type="button" variant="secondary" disabled={disabled || busy || !selection.length} onClick={preview}>{t(busy ? 'Memuat…' : 'Buat Kepala Packing List')} {selection.length > 1 && `(${selection.length} B/L)`}</Button><Notice message={!data ? error : ''} />
    {data && <DetailModal title="Pratinjau Kepala Packing List SCMU" onClose={() => !busy && setData(null)} actions={saved ? <Button type="button" onClick={() => print(data)}>{t('Cetak / Simpan PDF')}</Button> : <Button type="button" disabled={busy || !confirmed || !data.headerNumber.trim() || (!!data.warnings.length && !accepted)} onClick={create}>{t(busy ? 'Saving...' : 'Simpan dan unduh Excel')}</Button>}>
      <div className="space-y-4"><Notice message={error} />{saved && <p role="status" className="text-sm text-emerald-300">{t('Kepala Packing List tersimpan pada seluruh B/L terpilih. File Excel telah diunduh.')}</p>}
        <label className="block text-sm space-y-1">{t('Nomor dokumen internal')}<input className="input-field" maxLength={100} disabled={saved||busy} value={data.headerNumber} onChange={e=>{setData(previous=>({...previous,headerNumber:e.target.value}));setConfirmed(false);}} onBlur={()=>setData(previous=>({...previous,headerNumber:previous.headerNumber.trim()}))}/></label><div className="rounded-lg border border-zinc-700 p-4"><p className="font-semibold">{data.headerNumber}</p><p>{data.vesselName} / {data.voyageNumber}</p><p className="text-sm text-zinc-400">{data.counts.bills} B/L · {data.counts.containers} {t('Kontainer')} · 20': {data.counts.size20} · 21': {data.counts.size21} · 40': {data.counts.size40} · {t('Belum diketahui')}: {data.counts.unknownSize}</p></div>
        {data.records.map(r => <section key={r.id} className="rounded-lg border border-zinc-800 overflow-hidden"><div className="bg-zinc-900 p-3 text-sm"><strong className="font-mono text-brand-300">B/L {r.billNumber}</strong><p>{t('Pengirim')}: {r.shipperName || '—'} · {t('Penerima')}: {r.consigneeName || '—'}</p><p className="text-xs text-zinc-400">{t('Tanggal keluar')}: {day(r.departureDate)} · {t('Tanggal masuk')}: {day(r.arrivalDate)} · {t('Batas storage')}: {day(r.storageUntil)} · {t('Mulai demurrage')}: {day(r.demurrageFrom)}</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-zinc-500 text-left"><tr>{['No.', 'Nomor kontainer', 'Segel', 'Ukuran', 'Uraian barang', 'Koli'].map(s => <th key={s} className="p-3">{t(s)}</th>)}</tr></thead><tbody>{r.containers.map((c,index) => <tr key={c.number} className="border-t border-zinc-800"><td className="p-3 tabular-nums">{index+1}</td><td className="p-3 font-mono">{c.number}</td><td className="p-3">{c.seal || '—'}</td><td className="p-3">{c.size || '—'}</td><td className="p-3 min-w-64 max-w-xl break-words">{c.description || '—'}{c.recipients.length > 0 && <p className="text-xs text-zinc-500 mt-1">{c.recipients.join('; ')}</p>}</td><td className="p-3">{c.packages ?? '—'}</td></tr>)}</tbody></table></div></section>)}
        {data.warnings.length > 0 && <div className="border border-amber-900/60 rounded-lg p-3 text-sm text-amber-200 space-y-2">{data.warnings.map(w => <p key={w}>{translatePackingWarning(w,t)}</p>)}<label className="flex gap-2"><input type="checkbox" checked={accepted} disabled={saved || busy} onChange={e => setAccepted(e.target.checked)} />{t('Saya telah memeriksa catatan dan menerima data yang belum lengkap pada dokumen ini.')}</label></div>}
        {!saved && <label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />{t('Saya memastikan kapal, voyage, B/L, kontainer, dan ringkasan ini benar untuk Kepala Packing List internal SCMU.')}</label>}
        <p className="text-xs text-zinc-500">{t('Satu dokumen dapat memuat beberapa B/L pada kapal dan voyage yang sama. File asli mitra tidak berubah. Rincian dan referensi sumber tersedia pada sheet Rincian PL.')}</p>
      </div>
    </DetailModal>}
  </div>;
}
