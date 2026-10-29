import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Button } from '../../components/common';
import { DetailModal, Notice } from '../../components/jpt/Workspace';
import { useBL } from '../../i18n/bl.mjs';

const counts = [['documents', 'Dokumen'], ['containers', 'Kontainer'], ['packingLists', 'Packing List terhubung'], ['driverBons', 'Bonrate sopir'], ['invoices', 'Invoice'], ['charges', 'Biaya / pendapatan'], ['payments', 'Pembayaran'], ['approvals', 'Pengajuan direktur']];
export default function ShipmentTrashDialog({ row, restore = false, onClose, onDone, onArchive }) {
  const { t } = useBL();
  const [context, setContext] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true; setLoading(true); setContext(null); setError(''); setConfirmed(false);
    api.get(`/bl-register/${row.id}/deletion-context`).then(response => { if (alive) setContext(response.data); }).catch(e => { if (alive) setError(e.response?.data?.message || e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [row.id, attempt]);
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const body = { version: context.version, confirmed: true, ...(!restore ? { reason: reason.trim() } : {}) };
      const response = restore ? await api.post(`/bl-register/${row.id}/restore`, body) : await api.delete(`/bl-register/${row.id}`, { data: body });
      onDone(response.data); onClose();
    } catch (e) { setError(e.response?.data?.message || e.message); setConfirmed(false); }
    finally { setBusy(false); }
  };
  return <DetailModal title={restore ? 'Pulihkan dari Sampah' : 'Hapus pengiriman'} width="max-w-3xl" onClose={() => !busy && onClose()} actions={<>
    {!restore && context && !context.canDelete && onArchive && <Button variant="secondary" disabled={busy} onClick={() => onArchive({ ...row, version: context.version })}>{t('Arsipkan')}</Button>}
    <Button variant={restore ? 'primary' : 'danger'} disabled={loading || busy || !context || !confirmed || (restore ? !context.canRestore : !context.canDelete || !reason.trim())} onClick={submit}>{t(busy ? 'Memproses…' : restore ? 'Pulihkan pengiriman' : 'Pindahkan ke Sampah')}</Button>
  </>}>
    <div className="space-y-4" data-shipment-trash-dialog>
      <p className="font-semibold break-all">{context?.billNumber || row.billNumber || t('Draf pengiriman')}</p>
      <p className="text-sm text-zinc-500">{t(restore ? 'Pengiriman dipulihkan ke status sebelumnya. Dokumen dan riwayat tetap menggunakan data yang sama.' : 'Pengiriman akan dipindahkan ke Sampah. Dokumen dan riwayat tetap tersimpan, dan pengiriman dapat dipulihkan. Data ini tidak lagi muncul pada daftar aktif, dasbor, Packing List, atau ekspor biasa.')}</p>
      {loading && <p role="status">{t('Memeriksa data terkait…')}</p>}
      <Notice message={error} />
      {!loading && !context && <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>{t('Coba lagi')}</Button>}
      {context && <>
        {restore && context.restoreConflict && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2"><p>{t(context.restoreConflict.message)}</p><Link className="text-brand-500 underline text-sm" to={`/bl-register/${context.restoreConflict.id}`}>{t('Buka pengiriman yang menggunakan nomor ini')}</Link></div>}
        {!restore && context.blockers.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2" role="alert"><h3 className="font-semibold">{t('Pengiriman belum bisa dihapus')}</h3><ul className="list-disc pl-5 text-sm space-y-2">{context.blockers.map(blocker => <li key={blocker.code}>{t(blocker.message)} ({blocker.count})</li>)}</ul><div className="flex flex-wrap gap-3 text-sm"><Link className="text-brand-500" to={`/bl-register/${row.id}?tab=costs`}>{t('Periksa biaya dan tagihan')}</Link><Link className="text-brand-500" to={`/bl-register/${row.id}?tab=driver-bons`}>{t('Periksa bonrate')}</Link></div></div>}
        <h3 className="font-semibold">{t('Data terkait yang tetap disimpan')}</h3>
        <dl className="grid grid-cols-[1fr_1fr] sm:grid-cols-4 gap-3" data-trash-dependencies>{counts.map(([key, label]) => <div key={key} className="card p-3"><dt className="text-xs text-zinc-500">{t(label)}</dt><dd className="text-xl tabular-nums mt-1">{context.summary[key]}</dd></div>)}</dl>
        {!restore && context.canDelete && <label className="block text-sm space-y-2">{t('Alasan penghapusan')}<textarea aria-label={t('Alasan penghapusan')} className="input-field" rows={3} value={reason} maxLength={2000} disabled={busy || !context.canDelete} onChange={event => { setReason(event.target.value); setConfirmed(false); }} placeholder={t('Contoh: salah input atau data duplikat')} /></label>}
        {((restore && context.canRestore) || (!restore && context.canDelete)) && <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || (!restore && (!context.canDelete || !reason.trim()))} onChange={event => setConfirmed(event.target.checked)} />{t(restore ? 'Saya ingin memulihkan pengiriman ini beserta dokumen yang tersimpan.' : 'Saya telah memeriksa data terkait dan ingin memindahkan pengiriman ini ke Sampah.')}</label>}
      </>}
    </div>
  </DetailModal>;
}
