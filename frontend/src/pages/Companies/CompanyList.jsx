import { useLanguage } from '../../i18n/LanguageContext';
import { useState, useEffect } from 'react';
import { Building2, Plus } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Button, SearchInput, EmptyState, Spinner, Modal, FormField } from '../../components/common';

const COMPANY_TYPES = ['TRANSPORTER', 'BROKER', 'CONSIGNEE'];

export default function CompanyList() {
  const { t: tr } = useLanguage();
  const [companies, setCompanies] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'TRANSPORTER', npwp: '', city: '', state: '', phone: '', email: '', contactPerson: '' });
  const { canManage } = useAuth();

  const load = () => {
    setLoading(true);
    api.get('/companies', { params: { limit: 50, ...(search && { search }), ...(type && { type }) } })
      .then(r => { setCompanies(r.data.data); setTotal(r.data.total); }).finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [search, type]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/companies', form);
      setShowModal(false);
      setForm({ name: '', type: 'TRANSPORTER', npwp: '', city: '', state: '', phone: '', email: '', contactPerson: '' });
      load();
    } finally { setSubmitting(false); }
  };

  const typeColor = { SHIPPER: 'badge-blue', TRANSPORTER: 'badge-brand', BROKER: 'badge-purple', CONSIGNEE: 'badge-green', BOTH: 'badge-zinc' };

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title={tr("Companies")} subtitle={tr("{count} companies in directory", { count: total })}
        action={canManage() && <Button onClick={() => setShowModal(true)}><Plus size={16} /> {tr("Add Company")}</Button>} />

      <div className="flex gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={tr("Search companies...")} />
        <select className="input-field w-40" value={type} onChange={e => setType(e.target.value)}>
          <option value="">{tr("All Types")}</option>
          {COMPANY_TYPES.map(t => <option key={t} value={t}>{tr(t)}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Company', 'Type', 'NPWP', 'City', 'Contact Person', 'Phone', 'Email'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{tr(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? <tr><td colSpan={7}><Spinner /></td></tr>
                : companies.length === 0 ? <tr><td colSpan={7}><EmptyState icon={Building2} title={tr("No companies found")} /></td></tr>
                : companies.map(c => (
                  <tr key={c.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-200">{c.name}</td>
                    <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${typeColor[c.type] || 'badge-zinc'}`}>{tr(c.isInternal ? 'Internal SCMU' : c.type)}</span></td>
                    <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{c.npwp || '—'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{c.city ? `${c.city}, ${c.state}` : '—'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{c.contactPerson || '—'}</td>
                    <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{c.email || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={tr("Add Company")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><FormField label={tr("Company Name")} required><input className="input-field" value={form.name} onChange={set('name')} required /></FormField></div>
            <FormField label={tr("Type")} required><select className="input-field" value={form.type} onChange={set('type')}>{COMPANY_TYPES.map(t => <option key={t} value={t}>{tr(t)}</option>)}</select></FormField>
            <FormField label={tr("NPWP")}><input className="input-field font-mono" value={form.npwp} onChange={set('npwp')} placeholder="NPWP-DEMO-001" /></FormField>
            <FormField label={tr("City")}><input className="input-field" value={form.city} onChange={set('city')} /></FormField>
            <FormField label={tr("State")}><input className="input-field" value={form.state} onChange={set('state')} /></FormField>
            <FormField label={tr("Phone")}><input className="input-field font-mono" value={form.phone} onChange={set('phone')} /></FormField>
            <FormField label={tr("Email")}><input type="email" className="input-field" value={form.email} onChange={set('email')} /></FormField>
            <div className="col-span-2"><FormField label={tr("Contact Person")}><input className="input-field" value={form.contactPerson} onChange={set('contactPerson')} /></FormField></div>
          </div>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{tr("Cancel")}</Button><Button type="submit" disabled={submitting}>{submitting ? tr('Saving...') : tr('Add Company')}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
