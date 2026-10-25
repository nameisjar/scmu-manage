import { useLanguage } from '../../i18n/LanguageContext';
import { useState } from 'react';
import { Map, Plus } from 'lucide-react';
import api from '../../api/client';
import Pagination from '../../components/common/Pagination';
import { usePagedResource, Notice } from '../../components/jpt/Workspace';
import { usePageQuery } from '../../components/Layout/PageNavigation';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Button, SearchInput, EmptyState, Spinner, Modal, FormField } from '../../components/common';

export default function RouteManagement() {
  const { t: tr } = useLanguage();
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [query,setQuery]=usePageQuery();const search=query.get('search')||'';const setSearch=search=>setQuery({search,page:null});
  const resource=usePagedResource('/routes',{search});const routes=resource.rows;const loading=resource.loading;const load=resource.reload;
  const [form, setForm] = useState({ name: '', originCity: '', originState: '', destCity: '', destState: '', distanceKm: '', estimatedDays: '' });
  const { canManage } = useAuth();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/routes', { ...form, distanceKm: form.distanceKm ? Number(form.distanceKm) : undefined, estimatedDays: form.estimatedDays ? Number(form.estimatedDays) : undefined });
      setShowModal(false);
      setForm({ name: '', originCity: '', originState: '', destCity: '', destState: '', distanceKm: '', estimatedDays: '' });
      load();
    } finally { setSubmitting(false); }
  };

  const filtered = routes;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title={tr("Route Management")} subtitle={tr("{count} routes defined", { count: resource.pagination.total })}
        action={canManage() && <Button onClick={() => setShowModal(true)}><Plus size={16} /> {tr("Add Route")}</Button>} />

      <SearchInput value={search} onChange={setSearch} placeholder={tr("Search routes...")} />

      <Notice message={resource.error} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Route Name', 'Origin', 'Destination', 'Distance', 'Est. Days'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{tr(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? <tr><td colSpan={5}><Spinner /></td></tr>
                : filtered.length === 0 ? <tr><td colSpan={5}><EmptyState icon={Map} title={tr("No routes defined")} description={tr("Add common freight routes for quick selection")} /></td></tr>
                : filtered.map(r => (
                  <tr key={r.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-200">{r.name}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{r.originCity}, {r.originState}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{r.destCity}, {r.destState}</td>
                    <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{r.distanceKm ? `${r.distanceKm} km` : '—'}</td>
                    <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{r.estimatedDays ? tr(r.estimatedDays === 1 ? '{count} day' : '{count} days', { count: r.estimatedDays }) : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination {...resource.pagination} />
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={tr("Add Route")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="col-span-2"><FormField label={tr("Route Name")} required><input className="input-field" value={form.name} onChange={set('name')} placeholder="Surabaya → Merauke" required /></FormField></div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={tr("Origin City")} required><input className="input-field" value={form.originCity} onChange={set('originCity')} placeholder="Surabaya" required /></FormField>
            <FormField label={tr("Origin State")} required><input className="input-field" value={form.originState} onChange={set('originState')} placeholder="Jawa Timur" required /></FormField>
            <FormField label={tr("Dest City")} required><input className="input-field" value={form.destCity} onChange={set('destCity')} placeholder="Merauke" required /></FormField>
            <FormField label={tr("Dest State")} required><input className="input-field" value={form.destState} onChange={set('destState')} placeholder="Papua Selatan" required /></FormField>
            <FormField label={tr("Distance (km)")}><input type="number" className="input-field" value={form.distanceKm} onChange={set('distanceKm')} placeholder="984" /></FormField>
            <FormField label={tr("Est. Transit Days")}><input type="number" className="input-field" value={form.estimatedDays} onChange={set('estimatedDays')} placeholder="2" /></FormField>
          </div>
          <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{tr("Cancel")}</Button><Button type="submit" disabled={submitting}>{submitting ? tr('Saving...') : tr('Add Route')}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
