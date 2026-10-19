import { useState } from 'react';
import api from '../../api/client';
import { useLanguage } from '../../i18n/LanguageContext';
import { Button, Fields, ModalForm, cargoFields, useResource } from '../../components/jpt/Workspace';

export default function QuotationEditor({ quotation, onClose, onSaved }) {
  const { t } = useLanguage(); const companies = useResource('/companies?internal=true&limit=200');
  const [form, setForm] = useState({ ...quotation, validUntil: quotation.validUntil?.slice(0, 10), plannedPickup: quotation.plannedPickup?.slice(0, 16) || '', expectedDelivery: quotation.expectedDelivery?.slice(0, 16) || '' });
  const emptyItem = () => ({ description: '', quantity: 1, unit: 'JOB', sellRate: 0, buyRate: 0 });
  const [items, setItems] = useState(quotation.items.length ? quotation.items : [emptyItem()]);
  return <ModalForm title="Edit quotation" onClose={onClose} onSubmit={async () => { await api.put(`/sales-quotations/${quotation.id}`, { ...form, items }); onSaved(); }} width="max-w-5xl">
    <Fields fields={[...cargoFields(companies.data?.data || []), { key: 'validUntil', label: 'Valid Until', type: 'date', required: true }, { key: 'terms', label: 'Commercial terms', type: 'textarea', wide: true }]} values={form} onChange={(key, value) => setForm({ ...form, [key]: value })} />
    <p className="text-sm font-semibold text-zinc-200">{t('Price items')}</p>
    {items.map((item, index) => <div key={item.id || index} className="border border-zinc-800 rounded-lg p-4 space-y-3"><Fields fields={[{ key: 'description', label: 'Description', required: true }, { key: 'unit', label: 'Unit', required: true }, { key: 'quantity', label: 'Quantity', type: 'number', min: 0.0001, step: 0.0001, required: true }, { key: 'sellRate', label: 'Sell rate', type: 'number', min: 0, step: 0.01, required: true }, { key: 'buyRate', label: 'Estimated buy rate', type: 'number', min: 0, step: 0.01, required: true }]} values={item} onChange={(key, value) => setItems(items.map((row, i) => i === index ? { ...row, [key]: value } : row))} />{items.length > 1 && <Button type="button" variant="danger" size="sm" onClick={() => setItems(items.filter((_, i) => i !== index))}>{t('Remove item')}</Button>}</div>)}
    {items.length < 50 && <Button type="button" variant="secondary" onClick={() => setItems([...items, emptyItem()])}>{t('Add price item')}</Button>}
  </ModalForm>;
}
