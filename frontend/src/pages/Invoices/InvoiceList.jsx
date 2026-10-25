import { formatMoney } from '../../utils/format.mjs';
import { useLanguage } from '../../i18n/LanguageContext';
import { Receipt } from 'lucide-react';
import api from '../../api/client';
import Pagination from '../../components/common/Pagination';
import { usePagedResource, Notice } from '../../components/jpt/Workspace';
import { usePageQuery } from '../../components/Layout/PageNavigation';
import { PageHeader, Button, StatusBadge, SearchInput, EmptyState, Spinner } from '../../components/common';
import { PrintButton } from './InvoicePrint';
import { Link } from 'react-router-dom';
import { ApprovalSubmit } from '../../components/jpt/DirectorApproval';

const STATUSES = ['', 'PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DISPUTED', 'PAID', 'CANCELLED'];

export default function InvoiceList() {
  const { t: tr, locale } = useLanguage();

  const [params,setQuery]=usePageQuery();
  const search=params.get('search')||''; const setSearch=search=>setQuery({search,page:null});
  const status=params.get('status')||''; const setStatus=status=>setQuery({status,page:null});
  const resource=usePagedResource('/invoices', {search,status}); const invoices=resource.rows; const total=resource.pagination.total; const loading=resource.loading; const load=resource.reload;
  const updateStatus = async (id, newStatus) => {
    await api.put(`/invoices/${id}`, { status: newStatus });
    load();
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title={tr("Invoice Reconciliation")} subtitle={tr("{count} invoices", { count: total })} />

      <div className="flex flex-wrap gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={tr("Search invoices...")} />
        <select className="input-field w-44" value={status} onChange={e => { setStatus(e.target.value); }}>
          {STATUSES.map(s => <option key={s} value={s}>{tr(s || 'All Statuses')}</option>)}
        </select>
      </div>

      <Notice message={resource.error} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Invoice #', 'Shipment', 'Company', 'Freight', 'Tax', 'Total', 'Invoice Date', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{tr(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? <tr><td colSpan={9}><Spinner /></td></tr>
                : invoices.length === 0 ? <tr><td colSpan={9}><EmptyState icon={Receipt} title={tr("No invoices")} description={tr("Invoices are created when shipments are completed")} /></td></tr>
                : invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-brand-400">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{inv.job ? <Link className="text-brand-400" to={`/jobs/${inv.job.id}`}>{inv.job.jobNumber}</Link> : inv.shipment?.shipmentNumber}</td>
                    <td className="px-4 py-3 text-zinc-300 text-xs">{inv.company?.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-300">{formatMoney(inv.freightAmount, inv.currency, locale)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{formatMoney(inv.gstAmount, inv.currency, locale)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-100 font-medium">{formatMoney(inv.totalAmount, inv.currency, locale)}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{new Date(inv.invoiceDate).toLocaleDateString(locale)}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <PrintButton invoice={inv} />
                        {!inv.jobId && ['PENDING','DISPUTED'].includes(inv.status) && (
                          <div className="flex gap-1">
                            <ApprovalSubmit action="INVOICE_ISSUE" entityId={inv.id} onChange={load} />
                            <span className="text-zinc-700">·</span>
                            <button onClick={() => updateStatus(inv.id, 'DISPUTED')} className="text-xs text-red-400 hover:text-red-300">{tr("Dispute")}</button>
                          </div>
                        )}
                        {!inv.jobId && inv.status === 'APPROVED' && (
                          <ApprovalSubmit action="LEGACY_INVOICE_SETTLE" entityId={inv.id} label="Submit payment confirmation" onChange={load} />
                        )}
                      </div>
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
