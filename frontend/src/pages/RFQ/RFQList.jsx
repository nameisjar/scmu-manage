import { useLanguage } from '../../i18n/LanguageContext';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus, Filter } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Button, StatusBadge, SearchInput, EmptyState, Spinner } from '../../components/common';
import { usePageQuery } from '../../components/Layout/PageNavigation';
import { positivePage } from '../../components/Layout/navigation.mjs';

const STATUSES = ['', 'OPEN', 'QUOTED', 'AWARDED', 'CANCELLED', 'EXPIRED'];

export default function RFQList() {
  const { t: tr, locale } = useLanguage();
  const [rfqs, setRfqs] = useState([]);
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
    api.get('/rfq', { params, signal: controller.signal })
      .then(r => { setRfqs(r.data.data); setTotal(r.data.total); })
      .catch(error => { if (error.code !== 'ERR_CANCELED') { setRfqs([]); setTotal(0); } })
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
