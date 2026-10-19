import { formatMoney } from '../../utils/format.mjs';
import { useLanguage } from '../../i18n/LanguageContext';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Plus } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Button, StatusBadge, SearchInput, EmptyState, Spinner } from '../../components/common';
import { usePageQuery } from '../../components/Layout/PageNavigation';
import { positivePage } from '../../components/Layout/navigation.mjs';

const STATUSES = ['', 'PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'POD_UPLOADED', 'COMPLETED', 'CANCELLED'];

export default function ShipmentList() {
  const { t: tr, locale } = useLanguage();
  const [shipments, setShipments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setQuery] = usePageQuery(); const search = params.get('search') || ''; const status = params.get('status') || ''; const page = positivePage(params.get('page'));
  const setSearch = search => setQuery({ search, page: null }); const setStatus = status => setQuery({ status, page: null }); const setPage = next => setQuery({ page: typeof next === 'function' ? next(page) : next });
  const { canManage } = useAuth();
  const limit = 20;

  const load = () => {
    setLoading(true);
    const params = { page, limit, ...(search && { search }), ...(status && { status }) };
    const controller = new AbortController();
    api.get('/shipments', { params, signal: controller.signal })
      .then(r => { setShipments(r.data.data); setTotal(r.data.total); })
      .catch(error => { if (error.code !== 'ERR_CANCELED') { setShipments([]); setTotal(0); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  };

  useEffect(() => {
    let cancel; const timer = setTimeout(() => { cancel = load(); }, search ? 400 : 0);
    return () => { clearTimeout(timer); cancel?.(); };
  }, [search, page, status]);

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title={tr("Shipments")}
        subtitle={tr("{count} total shipments", { count: total })}
        action={canManage() && <Link to="/shipments/new"><Button><Plus size={16} /> {tr("New Shipment")}</Button></Link>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={tr("Search shipments...")} />
        <select className="input-field w-44" aria-label={tr('Status')} value={status} onChange={e => setStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{tr(s || 'All Statuses')}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Shipment #', 'Route', 'Vehicle', 'Driver', 'Loading Date', 'Freight', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{tr(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr><td colSpan={8}><Spinner /></td></tr>
              ) : shipments.length === 0 ? (
                <tr><td colSpan={8}>
                  <EmptyState icon={Package} title={tr("No shipments found")}
                    description={tr("Create your first shipment to get started")}
                    action={canManage() && <Link to="/shipments/new"><Button>{tr("New Shipment")}</Button></Link>} />
                </td></tr>
              ) : shipments.map(s => (
                <tr key={s.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-brand-400">{s.shipmentNumber}</td>
                  <td className="px-4 py-3 text-zinc-300 text-xs">{s.originCity} → {s.destCity}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs font-mono">{s.vehicle?.registrationNo || '—'}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{s.driver?.name || '—'}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{new Date(s.loadingDate).toLocaleDateString(locale)}</td>
                  <td className="px-4 py-3 text-zinc-300 text-xs font-mono">
                    {s.freightAmount ? formatMoney(s.freightAmount, s.currency, locale) : '—'}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3">
                    <Link to={`/shipments/${s.id}`} className="text-xs text-brand-400 hover:text-brand-300">{tr("View →")}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <Button variant="secondary" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>{tr("Previous")}</Button>
            <span className="text-xs text-zinc-500">{tr("Page")} {page} {tr("of")} {Math.ceil(total / limit)}</span>
            <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * limit >= total}>{tr("Next")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
