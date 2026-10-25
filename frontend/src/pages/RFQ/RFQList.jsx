import { useLanguage } from '../../i18n/LanguageContext';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import Pagination from '../../components/common/Pagination';
import { usePagedResource, Notice } from '../../components/jpt/Workspace';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Button, StatusBadge, SearchInput, EmptyState, Spinner } from '../../components/common';
import { usePageQuery } from '../../components/Layout/PageNavigation';

const STATUSES = ['', 'OPEN', 'QUOTED', 'AWARDED', 'CANCELLED', 'EXPIRED'];

export default function RFQList() {
  const { t: tr, locale } = useLanguage();
  const [params,setQuery]=usePageQuery();
  const search=params.get('search')||''; const setSearch=search=>setQuery({search,page:null});
  const status=params.get('status')||''; const setStatus=status=>setQuery({status,page:null});
  const resource=usePagedResource('/rfq', {search,status}); const rfqs=resource.rows; const total=resource.pagination.total; const loading=resource.loading; const load=resource.reload;
  const { canManage } = useAuth();

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title={tr("RFQ Indenting")}
        subtitle={tr("Post truck requirements and collect transporter quotes")}
        action={canManage() && (
          <Link to="/rfq/new">
            <Button><Plus size={16} /> {tr("New RFQ")}</Button>
          </Link>
        )}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={tr("Search RFQs...")} />
        <select className="input-field w-40" aria-label={tr('Status')} value={status} onChange={e => setStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{tr(s || 'All Statuses')}</option>)}
        </select>
        <span className="text-xs text-zinc-500 ml-auto">{total} {tr('records')}</span>
      </div>

      {/* Table */}
      <Notice message={resource.error} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['RFQ #', 'Title', 'Route', 'Vehicle Type', 'Loading Date', 'Quotes', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{tr(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr><td colSpan={8}><Spinner /></td></tr>
              ) : rfqs.length === 0 ? (
                <tr><td colSpan={8}>
                  <EmptyState icon={ClipboardList} title={tr("No RFQs found")} description={tr("Create your first RFQ to start collecting quotes from transporters")}
                    action={canManage() && <Link to="/rfq/new"><Button>{tr("New RFQ")}</Button></Link>} />
                </td></tr>
              ) : rfqs.map((rfq) => (
                <tr key={rfq.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-brand-400">{rfq.rfqNumber}</td>
                  <td className="px-4 py-3 text-zinc-200 font-medium max-w-xs truncate">{rfq.title}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{rfq.originCity} → {rfq.destCity}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{tr(rfq.vehicleType?.replace('_', ' '))}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{new Date(rfq.loadingDate).toLocaleDateString(locale)}</td>
                  <td className="px-4 py-3">
                    <span className="text-zinc-300 font-mono text-xs">{rfq._count?.quotes || 0}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={rfq.status} /></td>
                  <td className="px-4 py-3">
                    <Link to={`/rfq/${rfq.id}`} className="text-xs text-brand-400 hover:text-brand-300 font-medium">{tr("View →")}</Link>
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
