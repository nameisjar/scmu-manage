import { useEffect, useState } from 'react';
import api from '../../api/client';
import { useLanguage } from '../../i18n/LanguageContext';
import { Button, DataTable, Fields, ModalForm, Notice, StatusBadge, useAction, useResource } from '../../components/jpt/Workspace';
import { formatDate } from '../../utils/format.mjs';
import { printPackingHeader } from './packingHeaderTemplate.mjs';
import { ApprovalSubmit } from '../../components/jpt/DirectorApproval';

export default function PackingHeader({ job, records, onChange, onSelect }) {
  const { t, locale, language } = useLanguage(); const base = `/jobs/${job.id}/packing-header`; const resource = useResource(base);
  const header = resource.data?.data; const [dialog, setDialog] = useState(null); const [form, setForm] = useState({}); const action = useAction();
  const revision = records.map(row => `${row.id}:${row.version}`).join(',');
  useEffect(() => { resource.reload(); }, [revision, resource.reload]);
  const editable = !['CLOSED', 'CANCELLED'].includes(job.status); const originals = records.filter(row => row.direction === 'INBOUND');
  const open = type => {
    setDialog(type); setForm({ documentDate: header?.documentDate?.slice(0, 10) || new Date().toISOString().slice(0, 10), reference: header?.reference || '', notes: header?.notes || '', packingListIds: header?.packingLists.map(row => row.id) || [], version: header?.version });
  };
  const save = async () => {
    if (dialog === 'create') await api.post(base, form);
    else if (dialog === 'edit') await api.put(base, form);
    else await api.delete(base, { data: { version: form.version } });
    resource.reload(); onChange();
  };
  const number = value => Number(value || 0).toLocaleString(locale, { maximumFractionDigits: 4 });
  return <section className="card p-5 space-y-4" aria-label={t('Receiving packing header')}>
    <Notice message={resource.error || action.error} />
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold text-zinc-100">{t('Receiving packing header')}</h3><p className="mt-1 text-sm text-zinc-400">{t('Group selected original packing lists from this receiving job. Totals are calculated from the selected documents.')}</p></div>{header && <StatusBadge status={header.status} />}</div>
    {!header ? <>{editable && <Button disabled={!originals.length || resource.loading} onClick={() => open('create')}>{t('Create packing header')}</Button>}<p className="text-sm text-zinc-400">{t('Upload the sender packing lists first, then select them to create one packing header.')}</p></> : <>
      <div className="flex flex-wrap gap-5 text-sm text-zinc-300"><b className="text-brand-300">{header.headerNumber}</b><span>{formatDate(header.documentDate, locale)}</span><span>{header.originCity} → {header.destCity}</span><span>{t('Reference')}: {header.reference || '—'}</span></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm text-zinc-300">{[['Original documents', header.summary.documentCount], ['Packages', header.summary.packages], ['Net weight (kg)', header.summary.netWeightKg], ['Gross weight (kg)', header.summary.grossWeightKg], ['Volume (CBM)', header.summary.volumeCbm], ['Received documents', header.summary.receivedDocuments], ['Awaiting receipt', header.summary.pendingDocuments], ['Receipt discrepancy', header.summary.discrepancyDocuments]].map(([label, value]) => <div key={label}><p className="text-xs text-zinc-500">{t(label)}</p><b>{number(value)}</b></div>)}</div>
      <DataTable rows={header.packingLists} columns={[
        { key: 'externalNumber', label: 'Original packing list number', render: row => <button className="text-brand-300 underline" type="button" onClick={() => onSelect(row.id)}>{row.externalNumber}</button> },
        { key: 'senderName', label: 'Sender' }, { key: 'packages', label: 'Declared packages' }, { key: 'grossWeightKg', label: 'Gross weight (kg)', render: row => number(row.grossWeightKg) }, { key: 'volumeCbm', label: 'Volume (CBM)', render: row => number(row.volumeCbm) },
        { key: 'receiptStatus', label: 'Receipt status', render: row => t(row.receiptStatus === 'PENDING' ? 'Awaiting receipt' : row.receiptStatus === 'RECEIVED' ? 'Received as declared' : 'Receipt discrepancy') }, { key: 'actualPackages', label: 'Actual packages' }, { key: 'status', label: 'Status', render: row => <StatusBadge status={row.status} /> },
      ]} />
      {header.notes && <p className="text-sm text-zinc-400 whitespace-pre-wrap">{header.notes}</p>}
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={action.busy || resource.loading || !header.packingLists.length} onClick={() => action.run(() => printPackingHeader(header, { t, locale, language }))}>{t('Print / save packing header PDF')}</Button>
        {editable && header.status === 'DRAFT' && <><Button size="sm" variant="secondary" onClick={() => open('edit')}>{t('Edit packing header')}</Button><ApprovalSubmit action="PACKING_HEADER_FINALIZE" entityId={header.id} payload={{ version: header.version }} label="Submit packing header" onChange={() => { resource.reload(); onChange(); }} /><Button size="sm" variant="secondary" onClick={() => open('delete')}>{t('Delete packing header draft')}</Button></>}
      </div>
    </>}
    {dialog && <ModalForm width={['create', 'edit'].includes(dialog) ? 'max-w-4xl' : 'max-w-xl'} title={dialog === 'finalize' ? 'Finalize packing header' : dialog === 'delete' ? 'Delete packing header draft' : 'Receiving packing header'} onClose={() => setDialog(null)} onSubmit={save}>
      {['create', 'edit'].includes(dialog) ? <>
        <Fields fields={[{ key: 'documentDate', label: 'Document date', type: 'date', required: true }, { key: 'reference', label: 'Reference' }, { key: 'notes', label: 'Notes', type: 'textarea', wide: true }]} values={form} onChange={(key, value) => setForm(previous => ({ ...previous, [key]: value }))} />
        <fieldset className="space-y-3"><legend className="mb-2 font-medium text-zinc-200">{t('Select original packing lists')}</legend><p className="text-sm text-zinc-400">{t('Only documents you select will be linked; nothing is selected automatically.')}</p>
          {originals.map(row => <label key={row.id} className="flex gap-3 items-start rounded-lg border border-zinc-700 p-3 text-sm text-zinc-300"><input className="mt-1" type="checkbox" checked={form.packingListIds.includes(row.id)} onChange={event => setForm(previous => ({ ...previous, packingListIds: event.target.checked ? [...previous.packingListIds, row.id] : previous.packingListIds.filter(id => id !== row.id) }))} /><span className="break-words"><b>{row.externalNumber}</b> · {row.senderName}<span className="block text-zinc-400">{number(row.packages)} {t('Packages')} · {number(row.grossWeightKg)} kg · {number(row.volumeCbm)} CBM</span></span></label>)}
        </fieldset>
        <p className="text-sm text-brand-300">{t('Selected documents')}: {form.packingListIds.length} · {t('Packages')}: {number(originals.filter(row => form.packingListIds.includes(row.id)).reduce((total, row) => total + row.packages, 0))}</p>
      </> : <p className="text-sm text-zinc-300">{t(dialog === 'finalize' ? 'Complete receipt and finalize each original packing list before finalizing this header. Include every original from this job. Final headers are locked.' : 'Delete only this draft header? Original packing lists and their files will remain.')}</p>}
    </ModalForm>}
  </section>;
}
