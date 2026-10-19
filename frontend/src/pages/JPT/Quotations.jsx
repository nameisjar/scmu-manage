import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { PageHeader, SearchInput } from '../../components/common';
import { Button, DataTable, Fields, ModalForm, Notice, ResourceState, StatusBadge, cargoFields, emptyCargo, useAction, useResource } from '../../components/jpt/Workspace';
import { formatDate, formatMoney } from '../../utils/format.mjs';
import { usePageQuery } from '../../components/Layout/PageNavigation';

const emptyItem = () => ({ description: '', quantity: 1, unit: 'JOB', sellRate: 0, buyRate: 0 });
export default function Quotations() {
  const { t, locale } = useLanguage(); const { canManage } = useAuth(); const navigate = useNavigate();
  const resource = useResource('/sales-quotations'); const companies = useResource('/companies?internal=true&limit=200');
  const [params, setQuery] = usePageQuery(); const search = params.get('search') || ''; const setSearch = search => setQuery({ search });
  const action = useAction(resource.reload); const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...emptyCargo, validUntil: '', terms: '' }); const [items, setItems] = useState([emptyItem()]);
  const rows = (resource.data?.data || []).filter(row => `${row.quotationNumber} ${row.title} ${row.customer.name}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-5 animate-fade-in">
    <PageHeader title={t('Commercial quotations')} subtitle={t('Sales prices and estimated margins, separate from vendor RFQs')} action={canManage() && <Button onClick={() => setCreating(true)}><Plus size={16} />{t('New quotation')}</Button>} />
    <Notice message={action.error || companies.error} /><SearchInput value={search} onChange={setSearch} placeholder={t('Search quotations...')} />
    <ResourceState resource={resource}><DataTable rows={rows} columns={[
      { key: 'number', label: 'Quotation', render: row => <Link className="text-brand-400 font-mono text-xs" to={`/sales-quotations/${row.id}`}>{row.quotationNumber}</Link> },
      { key: 'customer', label: 'SCMU company', render: row => <div>{row.customer.name}<p className="text-xs text-zinc-500">{row.title}</p></div> },
      { key: 'route', label: 'Route', render: row => `${row.originCity} → ${row.destCity}` },
      { key: 'amount', label: 'Sales total', render: row => formatMoney(row.totals.revenue, row.currency, locale) },
      { key: 'margin', label: 'Estimated gross profit', render: row => formatMoney(row.totals.estimatedProfit, row.currency, locale) },
      { key: 'validUntil', label: 'Valid Until', render: row => formatDate(row.validUntil, locale) },
      { key: 'status', label: 'Status', render: row => <StatusBadge status={row.status} /> },
    ]} /></ResourceState>
    {creating && <ModalForm title="New quotation" submitLabel="Create quotation" onClose={() => setCreating(false)} width="max-w-5xl" onSubmit={async () => {
      const response = await api.post('/sales-quotations', { ...form, items });
      navigate(`/sales-quotations/${response.data.id}`);
    }}>
      <Fields fields={[...cargoFields(companies.data?.data || []), { key: 'validUntil', label: 'Valid Until', type: 'date', required: true }, { key: 'terms', label: 'Commercial terms', type: 'textarea', wide: true }]} values={form} onChange={(key, value) => setForm(old => ({ ...old, [key]: value }))} />
      <p className="font-semibold text-zinc-200">{t('Price items')}</p>
      {items.map((item, index) => <div className="rounded-lg border border-zinc-800 p-4 space-y-3" key={index}>
        <Fields fields={[{ key: 'description', label: 'Description', required: true }, { key: 'unit', label: 'Unit', options: ['JOB', 'KG', 'CBM', 'CONTAINER', 'PACKAGE'], required: true },
          { key: 'quantity', label: 'Quantity', type: 'number', min: 0.0001, step: 0.0001, required: true }, { key: 'sellRate', label: 'Sell rate', type: 'number', min: 0, step: 0.01, required: true }, { key: 'buyRate', label: 'Estimated buy rate', type: 'number', min: 0, step: 0.01, required: true }]} values={item} onChange={(key, value) => setItems(old => old.map((row, i) => i === index ? { ...row, [key]: value } : row))} />
        {items.length > 1 && <Button type="button" variant="danger" size="sm" onClick={() => setItems(old => old.filter((_, i) => i !== index))}><Trash2 size={14} />{t('Remove item')}</Button>}
      </div>)}
      <Button type="button" variant="secondary" onClick={() => setItems(old => [...old, emptyItem()])}>{t('Add price item')}</Button>
    </ModalForm>}
  </div>;
}
