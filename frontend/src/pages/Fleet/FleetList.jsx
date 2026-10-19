import { useLanguage } from '../../i18n/LanguageContext';
import { useState, useEffect } from 'react';
import { Truck, Plus } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Button, StatusBadge, SearchInput, EmptyState, Spinner, Modal, FormField } from '../../components/common';

const VEHICLE_TYPES = ['TRUCK', 'TRAILER', 'CONTAINER', 'TANKER', 'REFRIGERATED', 'FLATBED', 'MINI_TRUCK', 'TEMPO'];

export default function FleetList() {
  const { t: tr, locale } = useLanguage();
  const [vehicles, setVehicles] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({ registrationNo: '', type: 'TRUCK', capacity: '', make: '', model: '', year: '', companyId: '' });
  const { canManage } = useAuth();

  const load = () => {
    setLoading(true);
    const params = { limit: 50, ...(search && { search }) };
    api.get('/fleet', { params }).then(r => { setVehicles(r.data.data); setTotal(r.data.total); }).finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { api.get('/companies', { params: { limit: 200 } }).then(r => { const rows = r.data.data || []; setCompanies(rows); setForm(previous => ({ ...previous, companyId: previous.companyId || rows.find(company => company.isInternal)?.id || '' })); }); }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/fleet', { ...form, capacity: Number(form.capacity), year: form.year ? Number(form.year) : undefined });
      setShowModal(false);
      setForm({ registrationNo: '', type: 'TRUCK', capacity: '', make: '', model: '', year: '', companyId: companies.find(company => company.isInternal)?.id || '' });
      load();
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title={tr("Fleet Management")} subtitle={tr("{count} vehicles registered", { count: total })}
        action={canManage() && <Button onClick={() => setShowModal(true)}><Plus size={16} /> {tr("Add Vehicle")}</Button>} />

      <SearchInput value={search} onChange={setSearch} placeholder={tr("Search by registration...")} />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Registration', 'Type', 'Capacity', 'Make/Model', 'Owner', 'Insurance', 'Trips', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{tr(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? <tr><td colSpan={8}><Spinner /></td></tr>
                : vehicles.length === 0 ? <tr><td colSpan={8}><EmptyState icon={Truck} title={tr("No vehicles")} description={tr("Add your first vehicle to the fleet")} /></td></tr>
                : vehicles.map(v => (
                  <tr key={v.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-brand-400 font-medium">{v.registrationNo}</td>
                    <td className="px-4 py-3 text-zinc-300 text-xs">{tr(v.type)}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{v.capacity ? `${v.capacity}T` : '—'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{v.make} {v.model}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{v.company?.name || '—'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {v.insuranceExpiry
                        ? <span className={new Date(v.insuranceExpiry) < new Date() ? 'text-red-400' : 'text-green-400'}>
                            {new Date(v.insuranceExpiry).toLocaleDateString(locale)}
                          </span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{v._count?.trips || 0}</td>
                    <td className="px-4 py-3 text-xs text-zinc-600">—</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={tr("Add Vehicle")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><FormField label={tr("Registration No")} required><input className="input-field font-mono" value={form.registrationNo} onChange={set('registrationNo')} placeholder="L 9001 SM" required /></FormField></div>
            <FormField label={tr("Type")} required><select className="input-field" value={form.type} onChange={set('type')}>{VEHICLE_TYPES.map(t => <option key={t} value={t}>{tr(t.replace('_',' '))}</option>)}</select></FormField>
            <FormField label={tr("Capacity (tonnes)")} required><input type="number" className="input-field" value={form.capacity} onChange={set('capacity')} placeholder="10" required /></FormField>
            <FormField label={tr("Make")}><input className="input-field" value={form.make} onChange={set('make')} placeholder="Hino" /></FormField>
            <FormField label={tr("Model")}><input className="input-field" value={form.model} onChange={set('model')} placeholder="Ranger" /></FormField>
            <FormField label={tr("Year")}><input type="number" className="input-field" value={form.year} onChange={set('year')} placeholder="2022" /></FormField>
            <FormField label={tr("Owner")}><select className="input-field" value={form.companyId} onChange={set('companyId')}><option value="">{tr("Select...")}</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
          </div>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{tr("Cancel")}</Button><Button type="submit" disabled={submitting}>{submitting ? tr('Saving...') : tr('Add Vehicle')}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
