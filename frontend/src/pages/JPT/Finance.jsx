import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Download, Search, TrendingUp, Wallet } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { usePageQuery } from '../../components/Layout/PageNavigation';
import { Button, DataTable, DetailModal, ResourceState, StatusBadge, useResource } from '../../components/jpt/Workspace';
import { downloadCsv, formatDate, formatMoney } from '../../utils/format.mjs';
import { financeExport, financeView, FINANCE_TABS, isPostedInvoice } from './financeView.mjs';

const tabLabels = { overview: 'Overview', receivables: 'Receivable', payables: 'Vendor payable', internal: 'Internal costs' };
const kpis = [
  { key: 'revenue', label: 'Approved revenue', hint: 'Revenue approved for all jobs', icon: Wallet },
  { key: 'grossProfit', label: 'Billed gross profit', hint: 'Invoiced freight less approved costs', icon: TrendingUp },
  { key: 'receivable', label: 'Receivable', hint: 'Outstanding approved invoices', icon: ArrowDownLeft },
  { key: 'payable', label: 'Vendor payable', hint: 'Outstanding approved vendor costs', icon: ArrowUpRight },
];

export default function Finance() {
  const { t, locale } = useLanguage(); const resource = useResource('/jobs/finance'); const [query, setQuery] = usePageQuery(); const [selectedId, setSelectedId] = useState(null); const tabId = useId();
  const data = resource.data; const currencies = Array.from(new Set(['IDR', ...(data?.groups.map(row => row.currency) || [])]));
  const requestedCurrency = query.get('currency') || 'IDR'; const currency = currencies.includes(requestedCurrency) ? requestedCurrency : 'IDR';
  const tab = FINANCE_TABS.includes(query.get('financeTab')) ? query.get('financeTab') : 'overview'; const search = query.get('search') || ''; const outstandingOnly = query.get('outstanding') === '1';
  const group = data?.groups.find(row => row.currency === currency); const view = financeView(data, { currency, search, outstandingOnly });
  const selected = view.jobById.get(selectedId); const money = amount => formatMoney(amount, currency, locale);
  const visibleRows = { overview: view.jobs, receivables: view.invoices, payables: view.payables, internal: view.internal };
  const changeFilter = changes => { setSelectedId(null); setQuery(changes); };
  const exportLedger = () => { const csv = financeExport(tab, view, t); downloadCsv(`SCMU-job-${tab === 'overview' ? 'ledger' : tab}-${currency}.csv`, csv.headers, csv.rows); };
  const amount = value => <span className={`whitespace-nowrap tabular-nums ${Number(value) < 0 ? 'text-red-300' : Number(value) === 0 ? 'text-zinc-500' : 'text-zinc-100'}`}>{money(value)}</span>;
  const moneyColumn = (key, label, get = row => row.financials[key]) => ({ key, label, align: 'right', render: row => amount(get(row)) });
  const jobCell = row => {
    const job = row.financials ? row : view.jobById.get(row.jobId);
    return <div className="min-w-[190px]"><Link className="whitespace-nowrap text-brand-300 hover:text-brand-200 font-mono text-xs" to={`/jobs/${job?.id || row.jobId}?tab=finance`}>{job?.jobNumber || row.jobNumber}</Link>{job && <p className="mt-1 text-xs text-zinc-500">{job.originCity} → {job.destCity}</p>}</div>;
  };
  const viewColumn = { key: 'actions', label: 'Actions', align: 'right', render: row => <Button size="sm" variant="secondary" onClick={() => setSelectedId(row.financials ? row.id : row.jobId)}>{t('View')}</Button> };
  const settlement = row => Number(row.balance) <= 0 ? <span className="text-emerald-300 text-xs">{t('Settled')}</span> : Number(row.daysOverdue) > 0 ? <span className="inline-block rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-300">{t('{days} days overdue', { days: row.daysOverdue })}</span> : <span className="text-xs text-zinc-400">{t(row.dueDate ? 'Not yet due' : 'No due date')}</span>;
  const dueColumn = { key: 'dueDate', label: 'Due Date', render: row => <div className="space-y-1 whitespace-nowrap"><p>{formatDate(row.dueDate, locale)}</p>{settlement(row)}</div> };
  const columns = tab === 'overview' ? [
    { key: 'jobNumber', label: 'Job order', render: jobCell }, ...[['revenue','Approved revenue'],['grossProfit','Billed gross profit'],['receivable','Receivable'],['payable','Vendor payable']].map(([key,label]) => moneyColumn(key,label)), viewColumn,
  ] : tab === 'receivables' ? [
    { key: 'jobNumber', label: 'Job order', render: jobCell }, { key: 'invoiceNumber', label: 'Invoice #', render: row => <div className="space-y-1"><p className="whitespace-nowrap font-mono text-xs">{row.invoiceNumber}</p><StatusBadge status={row.status} /></div> }, dueColumn,
    moneyColumn('balance','Outstanding balance',row => row.balance), { key: 'agingBucket', label: 'Aging bucket', render: row => t(row.agingBucket) }, viewColumn,
  ] : [
    { key: 'jobNumber', label: 'Job order', render: jobCell }, { key: 'description', label: tab === 'payables' ? 'Vendor / cost' : 'Operating cost', render: row => <div className="min-w-[180px]"><p className="font-medium text-zinc-200">{tab === 'payables' ? row.vendorName : t(row.costCategory)}</p><p className="mt-1 text-xs text-zinc-500">{row.description}</p></div> }, dueColumn,
    moneyColumn('balance','Outstanding balance',row => row.balance), viewColumn,
  ];
  const secondaryMetrics = fields => <dl className="grid gap-3 sm:grid-cols-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">{fields.map(([key,label]) => <div key={key}><dt className="text-xs text-zinc-500">{t(label)}</dt><dd className="mt-1 text-lg font-medium tabular-nums text-zinc-200">{money(group?.[key] || 0)}</dd></div>)}</dl>;
  const detailMetrics = (title, fields) => <section className="space-y-3"><h4 className="text-sm font-semibold text-zinc-200">{t(title)}</h4><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-zinc-800 p-4">{fields.map(([key,label]) => <div key={key}><dt className="text-xs text-zinc-500">{t(label)}</dt><dd className="mt-1 text-base font-medium">{amount(selected.financials[key])}</dd></div>)}</dl></section>;

  return <div className="space-y-5" data-finance-workspace>
    <header><h1 className="font-display text-2xl font-bold text-zinc-100">{t('Job finance')}</h1><p className="mt-1 text-sm text-zinc-400">{t('Review earnings, outstanding balances and operating costs')}</p></header>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4" aria-label={t('Finance filters')}>
      <label className="space-y-1.5"><span className="block text-xs text-zinc-400">{t('Currency')}</span><select className="input-field min-w-[100px]" aria-label={t('Currency')} value={currency} onChange={event => changeFilter({ currency: event.target.value })}>{currencies.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="min-w-[180px] flex-1 space-y-1.5"><span className="block text-xs text-zinc-400">{t('Find a job')}</span><span className="relative block"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-zinc-500" /><input type="search" className="input-field" style={{ paddingLeft: '2.25rem' }} aria-label={t('Search financial jobs')} placeholder={t('Job number, route or reference...')} value={search} onChange={event => changeFilter({ search: event.target.value })} /></span></label>
      <label className="flex min-h-[38px] items-center gap-2 text-sm text-zinc-300"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={outstandingOnly} onChange={event => changeFilter({ outstanding: event.target.checked ? '1' : null })} />{t('With outstanding balance')}</label>
      <Button variant="secondary" disabled={!visibleRows[tab].length} title={t('Export current view')} onClick={exportLedger}><Download size={15} />{t('Export CSV')}</Button>
    </div>
    <ResourceState resource={resource}>
      <section className="space-y-3" aria-label={t('Currency summary')}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium text-zinc-300">{t('Totals for {currency}', { currency })}</h2><span className="text-xs text-zinc-500">{t('{count} jobs', { count: group?.jobs || 0 })}</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-finance-summary>{kpis.map(({key,label,hint,icon:Icon}) => <article key={key} data-finance-kpi={key} className="card min-w-0 p-5">
          <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-medium text-zinc-400">{t(label)}</h3><Icon size={17} className="shrink-0 text-brand-400" /></div>
          <p className={`mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums ${Number(group?.[key]) < 0 ? 'text-red-300' : 'text-zinc-100'}`}>{money(group?.[key] || 0)}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{t(hint)}</p>
        </article>)}</div>
        <p className="text-xs text-zinc-500">{t('Filters apply to tables and CSV; the summary includes all jobs in {currency}.', { currency })}</p>
      </section>
      <div role="tablist" aria-label={t('Finance views')} className="flex flex-wrap gap-1 border-b border-zinc-800">
        {FINANCE_TABS.map((value,index) => <button type="button" role="tab" key={value} id={`${tabId}-${value}`} aria-controls={`${tabId}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => changeFilter({ financeTab: value === 'overview' ? null : value })} onKeyDown={event => {
          const direction = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: FINANCE_TABS.length - 1 - index }[event.key]; if (direction === undefined) return; event.preventDefault(); const next = (index + direction + FINANCE_TABS.length) % FINANCE_TABS.length; changeFilter({ financeTab: FINANCE_TABS[next] }); event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
        }} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${tab === value ? 'border-brand-400 text-brand-300' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>{t(tabLabels[value])}<span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-xs tabular-nums text-zinc-400">{visibleRows[value].length}</span></button>)}
      </div>
      <section role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`} className="space-y-4">
        {tab === 'payables' && secondaryMetrics([['vendorCost','Vendor bill'],['payable','Vendor payable']])}
        {tab === 'internal' && secondaryMetrics([['internalCost','Internal operating cost'],['internalExpensePaid','Internal expenses paid'],['internalOutstanding','Internal costs outstanding']])}
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold text-zinc-200">{t(tab === 'overview' ? 'Job financial overview' : tab === 'receivables' ? 'Receivable aging' : tab === 'payables' ? 'Payable aging' : 'Internal operating cost')}</h2><span role="status" className="text-xs text-zinc-500">{t('{count} records', { count: visibleRows[tab].length })}</span></div>
        <DataTable rows={visibleRows[tab]} columns={columns} empty="No financial records match these filters" />
        {tab === 'overview' && view.alerts.length > 0 && <details className="rounded-xl border border-zinc-800"><summary className="cursor-pointer px-4 py-3 text-sm text-zinc-400">{t('Needs attention')} <span className="ml-2 rounded-md bg-brand-500/10 px-2 py-0.5 text-xs text-brand-300">{view.alerts.length}</span></summary><div className="p-3 pt-0"><DataTable rows={view.alerts} columns={[{ key: 'jobNumber', label: 'Job order', render: jobCell },{ key: 'type', label: 'Alert', render: row => t(row.type) },{ key: 'reference', label: 'Reference', render: row => t(row.reference) }]} /></div></details>}
      </section>
    </ResourceState>
    {selected && <DetailModal title="Job financial details" onClose={() => setSelectedId(null)} actions={<Link to={`/jobs/${selected.id}?tab=finance`} className="text-sm text-brand-300 underline" onClick={() => setSelectedId(null)}>{t('Open job finance')}</Link>}>
      <div className="space-y-6" data-finance-detail>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-mono text-base font-semibold text-zinc-100">{selected.jobNumber}</h3><p className="mt-1 text-sm text-zinc-400">{selected.title}</p><p className="mt-1 text-xs text-zinc-500">{selected.originCity} → {selected.destCity} · {currency}</p></div><StatusBadge status={selected.status} /></div>
        {detailMetrics('Estimates',[['estimatedCost','Estimated total cost'],['estimatedProfit','Estimated gross profit']])}
        {detailMetrics('Approved amounts',[['revenue','Approved revenue'],['approvedCost','Approved cost'],['vendorCost','Vendor bill'],['internalCost','Internal operating cost']])}
        {detailMetrics('Billing and settlement',[['billed','Invoiced freight before tax'],['grossProfit','Billed gross profit'],['unbilled','Unbilled revenue'],['receivable','Receivable'],['payable','Vendor payable'],['internalExpensePaid','Internal expenses paid'],['internalOutstanding','Internal costs outstanding']])}
        <p className="text-xs text-zinc-500">{t('Billed gross profit uses invoiced freight before tax less approved costs. Payment records below show actual recorded payments.')}</p>
        <section className="space-y-3"><h4 className="text-sm font-semibold text-zinc-200">{t('Invoices')}</h4><p className="text-xs text-zinc-500">{t('Draft and cancelled invoices are excluded from receivables.')}</p><DataTable rows={selected.invoices || []} columns={[{ key: 'invoiceNumber', label: 'Invoice #' },{ key: 'status', label: 'Status', render: row => <StatusBadge status={row.status} /> },{ key: 'dueDate', label: 'Due Date', render: row => formatDate(row.dueDate,locale) },moneyColumn('totalAmount','Total',row => row.totalAmount),{ key: 'balance', label: 'Receivable', align: 'right', render: row => isPostedInvoice(row) ? amount(row.balance) : <span className="text-xs text-zinc-500">{t('Excluded')}</span> }]} /></section>
        <section className="space-y-3"><h4 className="text-sm font-semibold text-zinc-200">{t('Revenue & costs')}</h4><DataTable rows={selected.charges || []} columns={[{ key: 'description', label: 'Description' },{ key: 'kind', label: 'Type', render: row => <>{t(row.kind)}{row.kind === 'COST' && <p className="mt-1 text-xs text-zinc-500">{t(row.costSource === 'INTERNAL' ? 'Internal costs' : 'External vendor')}</p>}</> },{ key: 'status', label: 'Status', render: row => <StatusBadge status={row.status} /> },moneyColumn('estimatedAmount','Estimated amount',row => row.estimatedAmount),{ key: 'actualAmount', label: 'Approved actual amount', align: 'right', render: row => row.status === 'APPROVED' ? amount(row.actualAmount) : '—' }]} /></section>
        <section className="space-y-3"><h4 className="text-sm font-semibold text-zinc-200">{t('Recorded payments')}</h4><DataTable rows={selected.payments || []} columns={[{ key: 'paidAt', label: 'Paid Date', render: row => formatDate(row.paidAt,locale) },{ key: 'direction', label: 'Direction', render: row => t(row.direction) },{ key: 'reference', label: 'Reference', render: row => <><p>{row.reference}</p><p className="mt-1 text-xs text-zinc-500">{row.notes}</p></> },moneyColumn('amount','Amount',row => row.amount)]} /></section>
      </div>
    </DetailModal>}
  </div>;
}
