import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { PageHeader } from '../../components/common';
import { Button, DataTable, Fields, JobLink, ModalForm, ResourceState, StatusBadge, cargoFields, emptyCargo, jobTypeField, useResource } from '../../components/jpt/Workspace';
import { formatDate, formatMoney } from '../../utils/format.mjs';
import { usePageQuery } from '../../components/Layout/PageNavigation';

export default function Jobs() {
  const { t, locale } = useLanguage(); const { canManage } = useAuth(); const navigate = useNavigate();
  const resource = useResource('/jobs'); const companies = useResource('/companies?limit=200');
  const [params, setQuery] = usePageQuery(); const search = params.get('search') || ''; const status = params.get('status') || ''; const jobType = params.get('jobType') || '';
  const setSearch = search => setQuery({ search }); const setStatus = status => setQuery({ status }); const setJobType = jobType => setQuery({ jobType }); const [form, setForm] = useState(null);
  const rows = (resource.data?.data || []).filter(row => (!status || row.status === status) && (!jobType || row.jobType === jobType) && `${row.jobNumber} ${row.title} ${row.customer.name}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-5"><PageHeader title={t('Job orders')} subtitle={t('Manage each shipment from booking to settlement')} action={canManage() && <Button onClick={() => setForm({ ...emptyCargo, jobType: 'SENDER' })}>{t('Create job order')}</Button>} />
    <select className="input-field max-w-xs" aria-label={t('Job type')} value={jobType} onChange={event => setJobType(event.target.value)}><option value="">{t('All job types')}</option>{['SENDER', 'RECEIVER'].map(type => <option key={type} value={type}>{t(type)}</option>)}</select>
    <div className="flex gap-3 flex-wrap"><input className="input-field max-w-md" aria-label={t('Search...')} placeholder={t('Search...')} value={search} onChange={event => setSearch(event.target.value)} /><select className="input-field max-w-xs" aria-label={t('Status')} value={status} onChange={event => setStatus(event.target.value)}><option value="">{t('All Status')}</option>{['BOOKED', 'IN_PROGRESS', 'DELIVERED', 'CLOSED', 'CANCELLED'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></div>
    <ResourceState resource={resource}><DataTable rows={rows} columns={[
      { key: 'jobNumber', label: 'Job order', render: row => <JobLink job={row} /> }, { key: 'title', label: 'Title' },
      { key: 'jobType', label: 'Job type', render: row => t(row.jobType) },
      { key: 'customer', label: 'SCMU company', render: row => row.customer.name }, { key: 'route', label: 'Route', render: row => `${row.originCity} → ${row.destCity}` },
      { key: 'status', label: 'Status', render: row => <StatusBadge status={row.status} /> },
      { key: 'expectedDelivery', label: 'Expected Delivery', render: row => formatDate(row.expectedDelivery, locale) },
      { key: 'receivable', label: 'Receivable', render: row => formatMoney(row.financials.receivable, row.currency, locale) },
      { key: 'alerts', label: 'Alerts', render: row => row.alerts.length },
    ]} /></ResourceState>
    {form && <ModalForm title="Create job order" onClose={() => setForm(null)} onSubmit={async () => { const response = await api.post('/jobs', form); navigate(`/jobs/${response.data.id}`); }}><Fields fields={[jobTypeField(t), ...cargoFields(companies.data?.data || []), { key: 'customerReference', label: 'Job reference' }, ...(form.jobType === 'SENDER' ? [{ key: 'recipientName', label: 'Recipient' }, { key: 'deliveryAddress', label: 'Delivery address', type: 'textarea', wide: true }] : []), { key: 'notes', label: 'Notes', type: 'textarea', wide: true }]} values={form} onChange={(key, value) => setForm({ ...form, [key]: value })} /></ModalForm>}
  </div>;
}
