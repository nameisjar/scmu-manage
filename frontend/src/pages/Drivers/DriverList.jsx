import { useLanguage } from '../../i18n/LanguageContext';
import { useState, useEffect } from 'react';
import { UserCheck, Plus, Star } from 'lucide-react';
import api from '../../api/client';
import Pagination from '../../components/common/Pagination';
import { usePagedResource, Notice } from '../../components/jpt/Workspace';
import { usePageQuery } from '../../components/Layout/PageNavigation';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Button, SearchInput, EmptyState, Spinner, Modal, FormField } from '../../components/common';

export default function DriverList() {
  const { t: tr } = useLanguage();
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', licenseNo: '', address: '', city: '', state: '', companyId: '', emergencyContact: '' });
  const [params,setQuery]=usePageQuery();
  const search=params.get('search')||''; const setSearch=search=>setQuery({search,page:null});
  const resource=usePagedResource('/drivers', {search}); const drivers=resource.rows; const total=resource.pagination.total; const loading=resource.loading; const load=resource.reload;
  const { canManage } = useAuth();

  useEffect(() => { api.get('/companies', { params: { limit: 200 } }).then(r => { const rows = r.data.data || []; setCompanies(rows); setForm(previous => ({ ...previous, companyId: previous.companyId || rows.find(company => company.isInternal)?.id || '' })); }); }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/drivers', form);
      setShowModal(false);
      setForm({ name: '', phone: '', licenseNo: '', address: '', city: '', state: '', companyId: companies.find(company => company.isInternal)?.id || '', emergencyContact: '' });
      load();
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title={tr("Driver Management")} subtitle={tr('{count} active drivers', { count: total })}
        action={canManage() && <Button onClick={() => setShowModal(true)}><Plus size={16} /> {tr("Add Driver")}</Button>} />

      <SearchInput value={search} onChange={setSearch} placeholder={tr("Search drivers...")} />

      <Notice message={resource.error} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Name', 'Phone', 'License No', 'Location', 'Owner', 'Rating', 'Total Trips'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{tr(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? <tr><td colSpan={7}><Spinner /></td></tr>
                : drivers.length === 0 ? <tr><td colSpan={7}><EmptyState icon={UserCheck} title={tr("No drivers")} /></td></tr>
                : drivers.map(d => (
                  <tr key={d.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3 text-zinc-200 font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{d.phone}</td>
                    <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{d.licenseNo}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{d.city ? `${d.city}, ${d.state}` : '—'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{d.company?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Star size={12} className="text-brand-400 fill-brand-400" />
                        <span className="text-zinc-300 text-xs font-mono">{d.rating?.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{d.totalTrips}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination {...resource.pagination} />
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={tr("Add Driver")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label={tr("Full Name")} required><input className="input-field" value={form.name} onChange={set('name')} placeholder="Budi Santoso (Demo)" required /></FormField>
            <FormField label={tr("Phone")} required><input className="input-field font-mono" value={form.phone} onChange={set('phone')} placeholder="081200000201" required /></FormField>
            <FormField label={tr("License No")} required><input className="input-field font-mono" value={form.licenseNo} onChange={set('licenseNo')} placeholder="SIM-DEMO-001" required /></FormField>
            <FormField label={tr("Emergency Contact")}><input className="input-field font-mono" value={form.emergencyContact} onChange={set('emergencyContact')} placeholder="081200000301" /></FormField>
            <FormField label={tr("City")}><input className="input-field" value={form.city} onChange={set('city')} placeholder="Surabaya" /></FormField>
            <FormField label={tr("State")}><input className="input-field" value={form.state} onChange={set('state')} placeholder="Jawa Timur" /></FormField>
            <div className="col-span-2"><FormField label={tr("Owner")}><select className="input-field" value={form.companyId} onChange={set('companyId')}><option value="">{tr("Unassigned")}</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField></div>
          </div>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{tr("Cancel")}</Button><Button type="submit" disabled={submitting}>{submitting ? tr('Saving...') : tr('Add Driver')}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
