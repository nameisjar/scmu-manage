import { formatMoney } from '../../utils/format.mjs';
import { useLanguage } from '../../i18n/LanguageContext';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge, Button, Modal, FormField, Spinner } from '../../components/common';
import { Banknote, MapPin, Package, Calendar, Truck } from 'lucide-react';
import { ApprovalSubmit } from '../../components/jpt/DirectorApproval';
import { useDetailNavigation } from '../../components/Layout/PageNavigation';

export default function RFQDetail() {
  const { t: tr, locale } = useLanguage();
  const { id } = useParams();
  const { canManage } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [rfq, setRfq] = useState(null);
  useDetailNavigation(rfq?.id === id ? rfq.rfqNumber : '', rfq?.id === id ? rfq.status : null);
  const [loading, setLoading] = useState(true);
  const [quoteModal, setQuoteModal] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ transporterId: '', amount: '', validUntil: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get(`/rfq/${id}`).then(r => setRfq(r.data)).finally(() => setLoading(false));

  useEffect(() => { load(); }, [id]);
  useEffect(() => { api.get('/companies?limit=200').then(response => setVendors(response.data.data.filter(company => ['TRANSPORTER', 'BROKER'].includes(company.type)))); }, []);

  const submitQuote = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/rfq/${id}/quote`, { ...quoteForm, validUntil: quoteForm.validUntil || undefined });
      setQuoteModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit quote');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner />;
  if (!rfq) return <div className="text-zinc-400">{tr("RFQ not found")}</div>;

  const canQuote = canManage() && ['OPEN', 'QUOTED'].includes(rfq.status);

  return (
    <div className="max-w-4xl animate-fade-in space-y-5">

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-mono text-xs text-brand-400 mb-1">{rfq.rfqNumber}</p>
            <h1 className="font-display text-xl font-bold text-zinc-100">{rfq.title}</h1>
            <p className="text-zinc-500 text-sm mt-1">{tr("by")} {rfq.shipper?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={rfq.status} />
            {canQuote && <Button onClick={() => setQuoteModal(true)}>{tr('Record vendor quote')}</Button>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-zinc-800">
          <InfoBlock icon={MapPin} label={tr("Route")} value={`${rfq.originCity} → ${rfq.destCity}`} />
          <InfoBlock icon={Truck} label={tr("Vehicle Type")} value={tr(rfq.vehicleType)} />
          <InfoBlock icon={Package} label={tr("Goods")} value={rfq.goodsType?.name || '—'} />
          <InfoBlock icon={Calendar} label={tr("Loading Date")} value={new Date(rfq.loadingDate).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })} />
        </div>

        {rfq.description && (
          <div className="mt-4 p-3 rounded-lg bg-zinc-900/60 text-sm text-zinc-400">{rfq.description}</div>
        )}

        {rfq.basePrice && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Banknote size={14} className="text-zinc-500" />
            <span className="text-zinc-500">{tr("Base price:")}</span>
            <span className="font-mono text-zinc-200">{formatMoney(rfq.basePrice, rfq.currency, locale)}</span>
          </div>
        )}
      </div>

      {/* Quotes */}
      <div className="card">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="font-display font-semibold text-zinc-200">{tr("Quotes (")}{rfq.quotes?.length || 0})</h2>
        </div>
        {rfq.quotes?.length === 0 ? (
          <div className="py-10 text-center text-zinc-500 text-sm">{tr("No quotes submitted yet")}</div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {rfq.quotes?.map((q) => (
              <div key={q.id} className={`flex items-center gap-4 px-5 py-4 ${rfq.awardedQuoteId === q.id ? 'bg-brand-500/5' : ''}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <p className="font-medium text-zinc-200">{q.transporter?.name}</p>
                    {rfq.awardedQuoteId === q.id && <span className="text-xs font-medium text-brand-400 bg-brand-400/10 px-2 py-0.5 rounded-full">{tr("Awarded")}</span>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{tr("by")} {q.submittedBy?.name} · {new Date(q.createdAt).toLocaleDateString(locale)}</p>
                  {q.notes && <p className="text-xs text-zinc-400 mt-1">{q.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-zinc-100">{formatMoney(q.amount, q.currency, locale)}</p>
                  <StatusBadge status={q.status} />
                </div>
                {canManage() && rfq.status !== 'AWARDED' && rfq.status !== 'CANCELLED' && (
                  <ApprovalSubmit action="VENDOR_AWARD" entityId={q.id} label="Submit vendor selection" onChange={load} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quote Modal */}
      <Modal open={quoteModal} onClose={() => setQuoteModal(false)} title={tr('Record vendor quote')}>
        <form onSubmit={submitQuote} className="space-y-4">
          <FormField label={tr('Vendor')} required><select className="input-field" required value={quoteForm.transporterId} onChange={event => setQuoteForm({ ...quoteForm, transporterId: event.target.value })}><option value="">{tr('Select company...')}</option>{vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></FormField>
          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{tr(error)}</div>}
          <FormField label={`${tr("Quote Amount")} (${rfq.currency})`} required>
            <input type="number" className="input-field" value={quoteForm.amount} onChange={e => setQuoteForm(f => ({ ...f, amount: e.target.value }))} placeholder="45000" required min="0" />
          </FormField>
          <FormField label={tr("Valid Until")}>
            <input type="datetime-local" className="input-field" value={quoteForm.validUntil} onChange={e => setQuoteForm(f => ({ ...f, validUntil: e.target.value }))} />
          </FormField>
          <FormField label={tr("Notes")}>
            <textarea className="input-field" rows={3} value={quoteForm.notes} onChange={e => setQuoteForm(f => ({ ...f, notes: e.target.value }))} placeholder={tr("Any conditions or comments...")} />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setQuoteModal(false)}>{tr("Cancel")}</Button>
            <Button type="submit" disabled={submitting}>{submitting ? tr('Submitting...') : tr('Submit Quote')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function InfoBlock({ icon: Icon, label, value }) {
  const { t: tr } = useLanguage();
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-zinc-500" />
        <span className="text-xs text-zinc-500">{tr(label)}</span>
      </div>
      <p className="text-sm font-medium text-zinc-200">{value}</p>
    </div>
  );
}
