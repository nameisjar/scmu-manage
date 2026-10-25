import { formatMoney } from '../../utils/format.mjs';
import { useLanguage } from '../../i18n/LanguageContext';
import { Link } from 'react-router-dom';
import { Package, Plus } from 'lucide-react';
import Pagination from '../../components/common/Pagination';
import { usePagedResource, Notice } from '../../components/jpt/Workspace';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Button, StatusBadge, SearchInput, EmptyState, Spinner } from '../../components/common';
import { usePageQuery } from '../../components/Layout/PageNavigation';

const STATUSES = ['', 'PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'POD_UPLOADED', 'COMPLETED', 'CANCELLED'];

export default function ShipmentList() {
  const { t: tr, locale } = useLanguage();
  const [params,setQuery]=usePageQuery();
  const search=params.get('search')||''; const setSearch=search=>setQuery({search,page:null});
  const status=params.get('status')||''; const setStatus=status=>setQuery({status,page:null});
  const resource=usePagedResource('/shipments', {search,status}); const shipments=resource.rows; const total=resource.pagination.total; const loading=resource.loading; const load=resource.reload;
  const { canManage } = useAuth();

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

      <Notice message={resource.error} />
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
        <Pagination {...resource.pagination} />
      </div>
    </div>
  );
}
