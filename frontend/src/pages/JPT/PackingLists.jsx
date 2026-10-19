import { useEffect, useState } from 'react';
import api from '../../api/client';
import { useLanguage } from '../../i18n/LanguageContext';
import { Button, DataTable, Fields, ModalForm, Notice, ResourceState, StatusBadge, useAction, useResource } from '../../components/jpt/Workspace';
import { formatDate } from '../../utils/format.mjs';
import { printPackingList } from './packingTemplate.mjs';
import PackingHeader from './PackingHeader';
import { ApprovalSubmit } from '../../components/jpt/DirectorApproval';

const emptyRecords = [];

const dateInput = value => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const emptyItem = () => ({ description: '', marks: '', quantity: 1, unit: 'UNIT', packages: 1, netWeightKg: 0, grossWeightKg: 0, lengthCm: '', widthCm: '', heightCm: '', volumeCbm: 0 });
function previewTotals(items) {
  return items.reduce((total, item) => {
    total.packages += Number(item.packages || 0); total.netWeightKg += Number(item.netWeightKg || 0); total.grossWeightKg += Number(item.grossWeightKg || 0);
    total.volumeCbm += item.lengthCm && item.widthCm && item.heightCm ? Number((Number(item.lengthCm) * Number(item.widthCm) * Number(item.heightCm) * Number(item.packages) / 1000000).toFixed(4)) : Number(item.volumeCbm || 0); return total;
  }, { packages: 0, netWeightKg: 0, grossWeightKg: 0, volumeCbm: 0 });
}
export default function PackingLists({ job, onChange }) {
  const { t, locale, language } = useLanguage(); const base = `/jobs/${job.id}/packing-lists`; const resource = useResource(base);
  const records = resource.data?.data || emptyRecords; const [selectedId, setSelectedId] = useState(null); const [dialog, setDialog] = useState(null); const [form, setForm] = useState({}); const [file, setFile] = useState(null); const [fileError, setFileError] = useState(''); const [fileUrl, setFileUrl] = useState(null);
  useEffect(() => {
    if (!file) { setFileUrl(null); return; }
    const url = URL.createObjectURL(file); setFileUrl(url); return () => URL.revokeObjectURL(url);
  }, [file]);
  const selected = records.find(record => record.id === selectedId); const editable = !['CLOSED', 'CANCELLED'].includes(job.status);
  const reload = () => { resource.reload(); onChange?.(); }; const action = useAction();
  const open = (type, record) => {
    setFile(null); setFileError(''); setDialog({ type, record });
    if (type === 'edit') setForm({ ...record, documentDate: record.documentDate.slice(0, 10), receivedAt: dateInput(record.receivedAt), sourceIds: record.sources.map(link => link.sourceId) });
  };
  const create = direction => {
    const now = new Date(); setDialog({ type: 'create', record: null }); setFile(null); setFileError('');
    setForm({ direction, documentDate: dateInput(now).slice(0, 10), externalNumber: '', senderName: direction === 'OUTBOUND' ? job.customer.name : '', senderAddress: '', recipientName: direction === 'INBOUND' ? job.customer.name : job.recipientName || '', recipientAddress: direction === 'INBOUND' ? job.customer.address || '' : job.deliveryAddress || '', originCity: job.originCity, destCity: job.destCity, reference: job.customerReference || '', packages: job.packages, netWeightKg: 0, grossWeightKg: job.weightKg, volumeCbm: job.volumeCbm, receiptStatus: 'PENDING', actualPackages: '', actualWeightKg: '', actualVolumeCbm: '', receivedAt: '', receivedBy: '', discrepancyNotes: '', notes: '', items: [], sourceIds: [] });
  };
  const save = async () => {
    let response;
    if (dialog.type === 'create') {
      if (form.direction === 'INBOUND') {
        if (!file) throw Error(t('Select the original packing list file'));
        const payload = new FormData(); payload.append('file', file); payload.append('data', JSON.stringify(form));
        response = await api.post(base, payload);
      } else response = await api.post(base, form);
    }
    else if (dialog.type === 'edit') response = await api.put(`${base}/${dialog.record.id}`, form);
    else if (dialog.type === 'upload') { const payload = new FormData(); payload.append('file', file); payload.append('version', dialog.record.version); response = await api.post(`${base}/${dialog.record.id}/original`, payload); }
    else if (dialog.type === 'finalize') response = await api.post(`${base}/${dialog.record.id}/finalize`, { version: dialog.record.version });
    else if (dialog.type === 'delete') { await api.delete(`${base}/${dialog.record.id}`, { data: { version: dialog.record.version } }); setSelectedId(null); }
    if (response) {
      const saved = response.data;
      resource.update(current => { const rows = current?.data || []; return { ...current, data: rows.some(row => row.id === saved.id) ? rows.map(row => row.id === saved.id ? saved : row) : [saved, ...rows] }; });
      setSelectedId(saved.id);
    }
    reload();
  };
  const selectOriginal = event => {
    const next = event.target.files[0];
    const message = next && (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(next.type) ? 'Only PDF, JPEG, PNG and WebP files are allowed' : next.size > 5 * 1024 * 1024 ? 'File too large. Maximum size is 5MB.' : '');
    event.target.setCustomValidity(message ? t(message) : ''); setFileError(message || ''); setFile(message ? null : next || null);
  };
  const download = async record => {
    const response = await api.get(`/jobs/${job.id}/documents/${record.documentId}/file`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data);
    const link = document.createElement('a'); link.href = url; link.download = record.document.originalName || 'packing-list'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const incoming = form.direction === 'INBOUND'; const creatingIncoming = dialog?.type === 'create' && incoming; const fields = [
    ...(incoming ? [{ key: 'externalNumber', label: 'Original packing list number', required: true }] : []),
    { key: 'documentDate', label: incoming ? 'Original document date' : 'Document date', type: 'date', required: true },
    ...(incoming ? [{ key: 'senderName', label: 'Sender', required: true }, { key: 'senderAddress', label: 'Sender address', type: 'textarea' }] : [{ key: 'recipientName', label: 'Recipient', required: true }]),
    { key: 'recipientAddress', label: 'Recipient address', type: 'textarea', required: !incoming },
    { key: 'originCity', label: 'Origin City', required: true }, { key: 'destCity', label: 'Destination City', required: true }, { key: 'reference', label: 'Reference' },
    ...(incoming ? [
      { key: 'packages', label: 'Declared packages', type: 'number', min: 1, step: 1, required: true },
      { key: 'netWeightKg', label: 'Net weight (kg)', type: 'number', min: 0, step: 0.001 }, { key: 'grossWeightKg', label: 'Gross weight (kg)', type: 'number', min: 0, step: 0.001, required: true },
      { key: 'volumeCbm', label: 'Volume (CBM)', type: 'number', min: 0, step: 0.0001 },
      { key: 'receiptStatus', label: 'Receipt status', options: [{ value: 'PENDING', label: t('Awaiting receipt') }, { value: 'RECEIVED', label: t('Received as declared') }, { value: 'DISCREPANCY', label: t('Receipt discrepancy') }], required: true },
      ...(form.receiptStatus !== 'PENDING' ? [{ key: 'receivedAt', label: 'Received at', type: 'datetime-local', required: true }, { key: 'receivedBy', label: 'Received by', required: true },
        { key: 'actualPackages', label: 'Actual packages', type: 'number', min: 0, step: 1, required: true }, { key: 'actualWeightKg', label: 'Actual weight (kg)', type: 'number', min: 0, step: 0.001 }, { key: 'actualVolumeCbm', label: 'Actual volume (CBM)', type: 'number', min: 0, step: 0.0001 },
        ...(form.receiptStatus === 'DISCREPANCY' ? [{ key: 'discrepancyNotes', label: 'Discrepancy notes', type: 'textarea', required: true, wide: true }] : [])] : []),
    ] : []), { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
  ];
  const itemFields = [{ key: 'description', label: 'Cargo description', required: true, wide: true, maxLength: 500 }, { key: 'marks', label: 'Package marks' }, { key: 'quantity', label: 'Quantity', type: 'number', min: 0.0001, step: 0.0001, required: true }, { key: 'unit', label: 'Unit', required: true }, { key: 'packages', label: 'Packages', type: 'number', min: 1, step: 1, required: true }, { key: 'netWeightKg', label: 'Row net weight (kg)', type: 'number', min: 0, step: 0.001, required: true }, { key: 'grossWeightKg', label: 'Row gross weight (kg)', type: 'number', min: 0, step: 0.001, required: true }, ...[['lengthCm', 'Length (cm)'], ['widthCm', 'Width (cm)'], ['heightCm', 'Height (cm)']].map(([key, label]) => ({ key, label, type: 'number', min: 0.001, max: 1000000, step: 0.001 })), { key: 'volumeCbm', label: 'Manual volume (CBM)', type: 'number', min: 0, step: 0.0001 }];
  const detail = (label, value) => <div className="min-w-0"><dt className="text-xs text-zinc-500">{t(label)}</dt><dd className="mt-1 break-words whitespace-pre-wrap text-sm text-zinc-200">{value ?? '—'}</dd></div>;
  const summaries = record => [['Packages', record.packages], ['Net weight (kg)', record.netWeightKg], ['Gross weight (kg)', record.grossWeightKg], ['Volume (CBM)', record.volumeCbm]].map(([label, value]) => <span key={label}>{t(label)}: <b>{Number(value || 0).toLocaleString(locale, { maximumFractionDigits: 4 })}</b></span>);
  return <div className="space-y-5"><Notice message={action.error} />
    <p className="text-sm text-zinc-400">{t(job.jobType === 'RECEIVER' ? 'Upload each sender packing list, then group selected documents under one receiving packing header.' : 'Create this packing list directly. No receiving header or combined list of all source documents is required.')}</p>
    {editable && <div className="flex flex-wrap gap-3">{job.jobType === 'RECEIVER' ? job.packingHeader?.status !== 'FINAL' && <Button onClick={() => create('INBOUND')}>{t('Upload original packing list')}</Button> : <Button onClick={() => create('OUTBOUND')}>{t('Create outgoing packing list')}</Button>}</div>}
    <ResourceState resource={resource}><DataTable rows={records} columns={[
      { key: 'direction', label: 'SCMU role', render: row => t(row.direction === 'INBOUND' ? 'SCMU as receiver' : 'SCMU as sender') },
      { key: 'recordNumber', label: 'Internal reference', render: row => <button type="button" className="font-mono text-xs text-brand-400" onClick={() => setSelectedId(row.id)}>{row.recordNumber}</button> },
      { key: 'externalNumber', label: 'Original packing list number' }, { key: 'documentDate', label: 'Document date', render: row => formatDate(row.documentDate, locale) },
      { key: 'party', label: 'Sender / recipient', render: row => `${row.senderName} → ${row.recipientName}` }, { key: 'packages', label: 'Packages' },
      { key: 'status', label: 'Status', render: row => <StatusBadge status={row.status} /> }, { key: 'actions', label: 'Actions', render: row => <Button size="sm" variant="secondary" onClick={() => setSelectedId(row.id)}>{t('View')}</Button> },
    ]} /></ResourceState>
    {job.jobType === 'RECEIVER' && <PackingHeader job={job} records={records} onChange={reload} onSelect={setSelectedId} />}
    {selected && <section className="card p-5 space-y-5" aria-label={t('Packing record details')}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold text-zinc-100">{selected.direction === 'INBOUND' ? selected.externalNumber : selected.recordNumber}</h3><p className="text-sm text-zinc-400">{t(selected.direction === 'INBOUND' ? 'Original packing list' : 'Outgoing packing list')}{selected.header && ` · ${selected.header.headerNumber}`}</p></div><StatusBadge status={selected.status} /></div>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{detail('Original packing list number', selected.externalNumber)}{detail('Document date', formatDate(selected.documentDate, locale))}{detail('Sender', selected.senderName)}{detail('Recipient', selected.recipientName)}{detail('Recipient address', selected.recipientAddress)}{detail('Route', `${selected.originCity} → ${selected.destCity}`)}{detail('Reference', selected.reference)}</dl>
      <div className="flex flex-wrap gap-5 text-sm text-zinc-300">{summaries(selected)}</div>
      {selected.direction === 'INBOUND' ? <><p className="text-sm text-zinc-400">{t('Record receipt for this original packing list. The receiving header groups multiple original documents.')}</p><dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{detail('Receipt status', t(selected.receiptStatus === 'PENDING' ? 'Awaiting receipt' : selected.receiptStatus === 'RECEIVED' ? 'Received as declared' : 'Receipt discrepancy'))}{detail('Actual packages', selected.actualPackages)}{detail('Actual weight (kg)', selected.actualWeightKg)}{detail('Actual volume (CBM)', selected.actualVolumeCbm)}{detail('Received at', selected.receivedAt ? formatDate(selected.receivedAt, locale, true) : null)}{detail('Received by', selected.receivedBy)}{detail('Discrepancy notes', selected.discrepancyNotes)}</dl></> : <><DataTable rows={selected.items} columns={[{ key: 'sequence', label: 'No.' }, { key: 'description', label: 'Cargo description' }, { key: 'marks', label: 'Package marks' }, { key: 'quantity', label: 'Quantity' }, { key: 'unit', label: 'Unit' }, { key: 'packages', label: 'Packages' }, { key: 'netWeightKg', label: 'Net weight (kg)' }, { key: 'grossWeightKg', label: 'Gross weight (kg)' }, { key: 'volumeCbm', label: 'Volume (CBM)' }]} /><p className="text-sm text-zinc-400">{t('Selected source documents')}: {selected.sources.length ? selected.sources.map(link => `${link.source.externalNumber} (${link.source.senderName})`).join('; ') : t('Created directly without source documents')}</p></>}
      {selected.notes && <p className="text-sm text-zinc-400 whitespace-pre-wrap">{selected.notes}</p>}
      <div className="flex flex-wrap gap-2">
        {selected.document.filename && <Button size="sm" variant="secondary" onClick={() => action.run(() => download(selected))}>{t('Download original packing list')}</Button>}
        {selected.direction === 'OUTBOUND' && selected.status === 'FINAL' && <Button size="sm" onClick={() => action.run(() => printPackingList(selected, { t, locale, language }))}>{t('Print / save packing list PDF')}</Button>}
        {editable && selected.status === 'DRAFT' && <><Button size="sm" variant="secondary" onClick={() => open('edit', selected)}>{t('Edit')}</Button>{selected.direction === 'INBOUND' && <Button size="sm" variant="secondary" onClick={() => open('upload', selected)}>{t('Attach original packing list')}</Button>}{selected.direction === 'OUTBOUND' || selected.receiptStatus === 'DISCREPANCY' ? <ApprovalSubmit action={selected.direction === 'OUTBOUND' ? 'PACKING_FINALIZE' : 'PACKING_EXCEPTION'} entityId={selected.id} payload={{ version: selected.version }} label={selected.direction === 'OUTBOUND' ? 'Submit packing list' : 'Submit receipt discrepancy'} onChange={reload} /> : <Button size="sm" onClick={() => open('finalize', selected)}>{t('Finalize packing record')}</Button>}<Button size="sm" variant="secondary" onClick={() => open('delete', selected)}>{t('Delete draft')}</Button></>}
      </div>
    </section>}
    {dialog && <ModalForm width={['create', 'edit'].includes(dialog.type) ? 'max-w-5xl' : 'max-w-xl'} title={dialog.type === 'create' || dialog.type === 'edit' ? (incoming ? 'Original packing list' : 'Outgoing packing list') : dialog.type === 'upload' ? 'Attach original packing list' : dialog.type === 'finalize' ? 'Finalize packing record' : 'Delete draft'} onClose={() => { setDialog(null); setFile(null); }} onSubmit={save} submitLabel={dialog.type === 'finalize' ? 'Finalize packing record' : dialog.type === 'delete' ? 'Delete draft' : creatingIncoming ? 'Save original packing list' : 'Save'}>
      {(creatingIncoming || dialog.type === 'upload') && <div className="space-y-3">
        {creatingIncoming && <><h4 className="font-medium text-zinc-200">1. {t('Original packing list file')}</h4><p className="text-sm text-zinc-400">{t('Select the sender file, then record its number and cargo totals. You can group several originals into a packing header afterwards.')}</p></>}
        <label className="block space-y-2 text-sm text-zinc-300"><span>{t('PDF or image, maximum 5 MB')}</span><input className="input-field" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" onChange={selectOriginal} /></label>
        <Notice message={fileError} />
        {file && fileUrl && <a className="block break-words text-sm text-brand-300 underline" href={fileUrl} target="_blank" rel="noreferrer">{t('View selected original')}: {file.name}</a>}
      </div>}
      {['create', 'edit'].includes(dialog.type) && (!creatingIncoming || file) && <>
        {creatingIncoming && <h4 className="font-medium text-zinc-200">2. {t('Original document details')}</h4>}
        <p className="text-sm text-zinc-400">{t(incoming ? 'Record receipt for this original packing list. The receiving header groups multiple original documents.' : 'Create this packing list directly. No receiving header or combined list of all source documents is required.')}</p>
        <p className="text-sm text-brand-300">{t(incoming ? 'Recipient' : 'Sender')}: {job.customer.name}</p>
        <Fields fields={fields} values={form} onChange={(key, value) => setForm(previous => ({ ...previous, [key]: value }))} />
        {!incoming && <>
          <div className="space-y-3"><h4 className="font-medium text-zinc-200">{t('Selected source documents')} ({t('Optional')})</h4><p className="text-xs text-zinc-400">{t('Only documents you select will be linked; nothing is selected automatically.')}</p>
            {records.filter(record => record.direction === 'INBOUND' && record.status === 'FINAL').map(record => <label key={record.id} className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={form.sourceIds.includes(record.id)} onChange={event => setForm(previous => ({ ...previous, sourceIds: event.target.checked ? [...previous.sourceIds, record.id] : previous.sourceIds.filter(id => id !== record.id) }))} />{record.externalNumber} · {record.senderName}</label>)}
          </div>
          <p className="text-xs text-zinc-400">{t('Weights are totals per row. Dimensions are per identical package in cm; volume is calculated from dimensions and package count, or entered manually when dimensions are empty.')}</p>
          {form.items.map((item, index) => <div key={index} className="rounded-lg border border-zinc-700 p-4 space-y-4"><div className="flex justify-between gap-3"><h4 className="text-sm font-semibold text-zinc-200">{t('Item')} {index + 1}</h4><Button type="button" size="sm" variant="secondary" onClick={() => setForm(previous => ({ ...previous, items: previous.items.filter((_, i) => i !== index) }))}>{t('Remove item')}</Button></div><Fields fields={itemFields} values={item} onChange={(key, value) => setForm(previous => ({ ...previous, items: previous.items.map((row, i) => i === index ? { ...row, [key]: value } : row) }))} /></div>)}
          <Button type="button" variant="secondary" disabled={form.items.length >= 200} onClick={() => setForm(previous => ({ ...previous, items: [...previous.items, emptyItem()] }))}>{t('Add packing item')}</Button>
          <div className="rounded-lg bg-zinc-800 p-4 text-sm text-zinc-300"><p className="mb-2 font-medium">{t('Preview totals')}</p><div className="flex flex-wrap gap-4">{summaries(previewTotals(form.items))}</div></div>
        </>}
      </>}
      {dialog.type === 'finalize' && <p className="text-sm text-zinc-300">{t('Final records are locked. Check the original attachment and receipt result for incoming goods, or the item rows and recipient for outgoing goods.')}</p>}
      {dialog.type === 'delete' && <p className="text-sm text-zinc-300">{t('Delete this draft and its attachment? Final records remain in history.')}</p>}
    </ModalForm>}
  </div>;
}
