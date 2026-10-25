import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useLanguage } from '../../i18n/LanguageContext';
import { Button, Modal, Spinner, StatusBadge } from '../common';
import Pagination, { usePagination, usePageCorrection } from '../common/Pagination';
import { pageInfo } from '../common/paginationState.mjs';

export function useResource(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState(null);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    if (!url) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get(url, { signal: controller.signal }).then(response => { setData(response.data); setLoadedUrl(url); }).catch(error => {
      if (error.code !== 'ERR_CANCELED') setError(error.response?.data?.message || error.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, version]);
  return { data, loading, error, reload, update: setData, loadedUrl };
}
export function usePagedResource(path, filters = {}, scope = '') {
  const paging=usePagination(scope);const search=useDebouncedValue(filters.search);const pending=search!==filters.search;
  const query=new URLSearchParams(Object.entries({...filters,...(filters.search!==undefined?{search}:{}),...paging.params}).filter(([,value])=>value!==''&&value!==null&&value!==undefined));
  const url=path?`${path}?${query}`:null;const resource=useResource(url);const ready=resource.loadedUrl===url&&!!resource.data;const total=ready?resource.data.total:0;
  useEffect(()=>{if(ready&&!pending&&!resource.loading&&resource.data.page!==paging.page)paging.onPageChange(resource.data.page);},[ready,pending,resource.loading,resource.data?.page,paging.page,paging.onPageChange]);
  return {...resource,loading:pending||resource.loading||(!ready&&!resource.error&&!!path),rows:ready?resource.data.data:[],pagination:{...paging,total,page:ready?resource.data.page:paging.page,server:true,loading:pending||resource.loading||(!ready&&!resource.error&&!!path)}};
}
export function useDebouncedValue(value, delay=300) {
  const [settled,setSettled]=useState(value);
  useEffect(()=>{const timer=setTimeout(()=>setSettled(value),delay);return()=>clearTimeout(timer);},[value,delay]);
  return settled;
}
export function useAction(reload) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async action => {
    if (busy) return;
    setBusy(true); setError('');
    try { const value = await action(); reload?.(); return value; }
    catch (error) { setError(error.response?.data?.message || error.message); }
    finally { setBusy(false); }
  };
  return { run, busy, error };
}
export function Notice({ message }) {
  const { t } = useLanguage();
  return message ? <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{t(message)}</div> : null;
}
export function Field({ label, children, wide = false }) {
  const id = useId();
  const { t } = useLanguage();
  return <label htmlFor={id} className={`block space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
    <span className="text-sm font-medium text-zinc-300">{t(label)}</span>
    {typeof children === 'function' ? children(id) : children}
  </label>;
}
export function Fields({ fields, values, onChange }) {
  const { t } = useLanguage();
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{fields.map(field => <Field key={field.key} label={field.label} wide={field.wide}>
    {id => field.options ? <select id={id} className="input-field" value={values[field.key] ?? ''} required={field.required} onChange={event => onChange(field.key, event.target.value)}>
      {!field.required || field.placeholder ? <option value="">{t(field.placeholder || 'Select...')}</option> : null}
      {field.options.map(option => <option key={option.value ?? option} value={option.value ?? option}>{option.label ?? t(option)}</option>)}
    </select> : field.type === 'textarea' ? <textarea id={id} className="input-field" rows={3} value={values[field.key] ?? ''} required={field.required} maxLength={field.maxLength || 3000} onChange={event => onChange(field.key, event.target.value)} />
      : <input id={id} className="input-field" type={field.type || 'text'} value={values[field.key] ?? ''} required={field.required} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength || 300} onChange={event => onChange(field.key, event.target.value)} />}
  </Field>)}</div>;
}
export function ModalForm({ title, onClose, onSubmit, children, submitLabel = 'Save', width = 'max-w-3xl' }) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const formId = useId();
  const submit = async event => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError('');
    try { await onSubmit(); onClose(); }
    catch (error) { setError(error.response?.data?.message || error.message); }
    finally { setSaving(false); }
  };
  return <Modal open onClose={() => { if (!saving) onClose(); }} title={t(title)} width={width} footer={
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>{t('Cancel')}</Button>
        <Button type="submit" form={formId} disabled={saving}>{t(saving ? 'Saving...' : submitLabel)}</Button>
      </div>
    }>
    <form id={formId} onSubmit={submit} className="space-y-5"><Notice message={error} />{children}</form>
  </Modal>;
}
export function DetailModal({ title, onClose, children, actions, width = 'max-w-6xl' }) {
  const { t } = useLanguage();
  return <Modal open onClose={onClose} title={t(title)} width={width} footer={
    <div className="flex flex-wrap items-center gap-2">
      {actions}
      <Button type="button" variant="secondary" className="ml-auto" onClick={onClose}>{t('Close')}</Button>
    </div>
  }>{children}</Modal>;
}
export function DataTable({ paginationKey, ...props }) {
  return paginationKey ? <UrlDataTable {...props} paginationKey={paginationKey} /> : <TableBody {...props} />;
}
function UrlDataTable({paginationKey,rows,...props}) {
  const paging=usePagination(paginationKey);usePageCorrection(paging,rows.length);
  return <TableBody {...props} rows={rows} pagination={{...paging,total:rows.length}} />;
}
function TableBody({ columns, rows, empty = 'No records yet', pagination, resetKey }) {
  const { t } = useLanguage();
  const [page,setPage]=useState(1);const [limit,setLimit]=useState(10);
  useEffect(()=>setPage(1),[resetKey]);
  const paging=pagination||{page,limit,total:rows.length,onPageChange:setPage,onLimitChange:value=>{setLimit(value);setPage(1);}};
  const info=pageInfo(paging.total,paging.page,paging.limit);const visible=pagination===false||paging.server?rows:rows.slice((info.page-1)*paging.limit,info.page*paging.limit);
  useEffect(()=>{if(!pagination&&page!==info.page)setPage(info.page);},[pagination,page,info.page]);
  return <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm" aria-busy={paging.loading}><thead><tr className="border-b border-zinc-800">
    {columns.map(column => <th key={column.key} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 ${column.align === 'right' ? 'text-right' : 'text-left'} ${column.className || ''}`}>{t(column.label)}</th>)}
  </tr></thead><tbody className="divide-y divide-zinc-800/60">{paging.loading?<tr><td colSpan={columns.length}><Spinner /></td></tr>:visible.length ? visible.map((row,index) => <tr key={row.id??index} className="hover:bg-zinc-900/40">{columns.map(column => <td key={column.key} className={`px-4 py-3 text-zinc-300 align-top ${column.align === 'right' ? 'text-right' : ''} ${column.className || ''}`}>{column.render ? column.render(row) : row[column.key] ?? '—'}</td>)}</tr>) : <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-zinc-500">{t(empty)}</td></tr>}</tbody></table></div>{pagination!==false&&<Pagination {...paging} page={info.page} />}</div>;
}
export function Tabs({ items, value, onChange }) {
  const { t } = useLanguage();
  return <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3" role="tablist">{items.map(item => <button type="button" key={item.value} role="tab" aria-selected={value === item.value} onClick={() => onChange(item.value)} className={`rounded-lg px-4 py-2 text-sm ${value === item.value ? 'bg-brand-500/15 text-brand-300' : 'text-zinc-400 hover:bg-zinc-800'}`}>{t(item.label)}</button>)}</div>;
}
export function ResourceState({ resource, children }) {
  if (resource.loading && !resource.data) return <Spinner />;
  return <><Notice message={resource.error} />{resource.data && children}</>;
}
export const JobLink = ({ job }) => <Link className="text-brand-400 hover:underline font-mono text-xs" to={`/jobs/${job.id}`}>{job.jobNumber}</Link>;
export { Button, StatusBadge };
export const CURRENCIES = ['IDR', 'USD', 'EUR', 'SGD', 'INR'];
export const customerOptions = rows => rows.filter(row => row.isInternal).map(row => ({ value: row.id, label: row.name }));
export const vendorOptions = rows => rows.filter(row => ['TRANSPORTER', 'BROKER', 'BOTH'].includes(row.type)).map(row => ({ value: row.id, label: row.name }));
export const cargoFields = customers => [
  { key: 'title', label: 'Title', required: true },
  { key: 'originCity', label: 'Origin City', required: true }, { key: 'destCity', label: 'Destination City', required: true },
  { key: 'serviceType', label: 'Service', options: ['DOMESTIC', 'EXPORT', 'IMPORT'], required: true },
  { key: 'currency', label: 'Currency', options: CURRENCIES, required: true },
  { key: 'cargoDescription', label: 'Cargo description', type: 'textarea', required: true, wide: true },
  { key: 'packages', label: 'Packages', type: 'number', min: 1, step: 1, required: true },
  { key: 'weightKg', label: 'Weight (kg)', type: 'number', min: 0, step: 0.001 },
  { key: 'volumeCbm', label: 'Volume (CBM)', type: 'number', min: 0, step: 0.0001 },
  { key: 'plannedPickup', label: 'Planned pickup', type: 'datetime-local' }, { key: 'expectedDelivery', label: 'Expected Delivery', type: 'datetime-local' },
];
export const emptyCargo = { title: '', originCity: '', destCity: '', serviceType: 'DOMESTIC', cargoDescription: '', packages: 1, weightKg: 0, volumeCbm: 0, currency: 'IDR', plannedPickup: '', expectedDelivery: '' };
export const jobTypeField = t => ({ key: 'jobType', label: 'Job type', required: true, options: [{ value: 'SENDER', label: t('SCMU as sender') }, { value: 'RECEIVER', label: t('SCMU as receiver') }] });
