import { formatMoney } from '../../utils/format.mjs';
import { useLanguage } from '../../i18n/LanguageContext';
import { useState } from 'react';
import { FileBarChart, Download, Printer, TrendingUp, Package, Receipt } from 'lucide-react';
import api from '../../api/client';
import { PageHeader, Button, StatusBadge, Spinner } from '../../components/common';

const TABS = [
  { id: 'invoices', label: 'Invoice Report', icon: Receipt },
  { id: 'shipments', label: 'Shipment Report', icon: Package },
];

const INVOICE_STATUSES = ['', 'PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DISPUTED', 'PAID'];
const SHIPMENT_STATUSES = ['', 'PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED'];

function SummaryCard({ label, value, color = 'zinc' }) {
  const { t: tr } = useLanguage();
  const colors = {
    zinc: 'text-zinc-100',
    brand: 'text-brand-400',
    green: 'text-green-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
  };
  return (
    <div className="card p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{tr(label)}</p>
      <p className={`font-display text-2xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  const { t: tr, locale } = useLanguage();
  const [currency, setCurrency] = useState('IDR');
  const fmt = n => formatMoney(n, currency, locale);
  const fmtDate = d => d ? new Date(d).toLocaleDateString(locale) : '—';
  const [tab, setTab] = useState('invoices');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const params = { currency, ...(from && { from }), ...(to && { to }), ...(status && { status }) };
      const r = await api.get(`/reports/${tab}`, { params });
      setData(r.data);
    } catch {
      setError('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const printReport = () => window.print();

  const exportCSV = () => {
    if (!data) return;
    const rows = tab === 'invoices'
      ? [
          ['Invoice #', 'Company', 'Shipment', 'Route', 'Invoice Date', 'Freight', 'Tax', 'Total', 'Status'],
          ...data.invoices.map(i => [
            i.invoiceNumber, i.company?.name, i.job?.jobNumber || i.shipment?.shipmentNumber,
            `${(i.job || i.shipment)?.originCity} → ${(i.job || i.shipment)?.destCity}`,
            fmtDate(i.invoiceDate), i.freightAmount, i.gstAmount, i.totalAmount, i.status,
          ]),
        ]
      : [
          ['Shipment #', 'Shipper', 'Origin', 'Destination', 'Loading Date', 'Freight', 'Driver', 'Vehicle', 'Status'],
          ...data.shipments.map(s => [
            s.shipmentNumber, s.shipper?.name, s.originCity, s.destCity,
            fmtDate(s.loadingDate), s.freightAmount || 0, s.driver?.name || '', s.vehicle?.registrationNo || '', s.status,
          ]),
        ];

    rows[0] = rows[0].map(header => tr(header));
    for (const row of rows.slice(1)) row[row.length - 1] = tr(row[row.length - 1]);
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scmu-${tab}-${currency}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statuses = tab === 'invoices' ? INVOICE_STATUSES : SHIPMENT_STATUSES;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title={tr("Reports")}
        subtitle={tr("Generate and export operational reports")}
        action={data && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportCSV}>
              <Download size={14} /> {tr("Export CSV")} </Button>
            <Button variant="secondary" size="sm" onClick={printReport}>
              <Printer size={14} /> {tr("Print")} </Button>
          </div>
        )}
      />

      {/* Tab selector */}
      <div className="flex gap-1 p-1 bg-zinc-900 rounded-lg w-fit border border-zinc-800">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setData(null); setError(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === id ? 'bg-brand-500 text-white' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <Icon size={14} /> {tr(label)}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{tr("Filters")}</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">{tr("From")}</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">{tr("To")}</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">{tr("Status")}</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="input-field w-44">
              {statuses.map(s => <option key={s} value={s}>{tr(s || 'All Statuses')}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-zinc-500 mb-1">{tr("Currency")}</label><select className="input-field w-32" value={currency} onChange={e => { setCurrency(e.target.value); setData(null); }}>{["IDR", "USD", "EUR", "SGD", "INR"].map(value => <option key={value}>{value}</option>)}</select></div>
          <Button onClick={generate} disabled={loading}>
            <FileBarChart size={14} /> {tr("Generate Report")} </Button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{tr(error)}</p>}
      {loading && <Spinner />}

      {data && (
        <div className="space-y-5 print-section">
          {/* Summary cards */}
          {tab === 'invoices' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard label={tr("Total Invoices")} value={data.summary.totalInvoices} />
              <SummaryCard label={tr("Total Amount")} value={`${fmt(data.summary.totalAmount)}`} color="brand" />
              <SummaryCard label={tr("Paid")} value={data.summary.paid} color="green" />
              <SummaryCard label={tr("Disputed")} value={data.summary.disputed} color="red" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard label={tr("Total Shipments")} value={data.summary.total} />
              <SummaryCard label={tr("Total Freight")} value={`${fmt(data.summary.totalFreight)}`} color="brand" />
              <SummaryCard label={tr("Delivered")} value={data.summary.delivered} color="green" />
              <SummaryCard label={tr("In Transit")} value={data.summary.inTransit} color="blue" />
            </div>
          )}

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-200">
                {tab === 'invoices' ? tr('{count} invoices', { count: data.invoices.length }) : tr('{count} shipments', { count: data.shipments.length })}
              </p>
            </div>
            <div className="overflow-x-auto">
              {tab === 'invoices' ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      {['Invoice #', 'Company', 'Shipment', 'Route', 'Invoice Date', 'Freight', 'Tax', 'Total', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{tr(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {data.invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-zinc-900/40">
                        <td className="px-4 py-2.5 font-mono text-xs text-brand-400">{inv.invoiceNumber}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-300">{inv.company?.name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{inv.job?.jobNumber || inv.shipment?.shipmentNumber}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-400">{(inv.job || inv.shipment)?.originCity} → {(inv.job || inv.shipment)?.destCity}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-400">{fmtDate(inv.invoiceDate)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{fmt(inv.freightAmount)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{fmt(inv.gstAmount)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs font-medium text-zinc-100">{fmt(inv.totalAmount)}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={inv.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-zinc-700">
                    <tr className="bg-zinc-900/50">
                      <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase">{tr("Totals")}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-zinc-200">{fmt(data.summary.totalFreight)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-zinc-400">{fmt(data.summary.totalGST)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-brand-400">{fmt(data.summary.totalAmount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      {['Shipment #', 'Shipper', 'Origin', 'Destination', 'Loading Date', 'Freight', 'Driver', 'Vehicle', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{tr(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {data.shipments.map(s => (
                      <tr key={s.id} className="hover:bg-zinc-900/40">
                        <td className="px-4 py-2.5 font-mono text-xs text-brand-400">{s.shipmentNumber}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-300">{s.shipper?.name}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-400">{s.originCity}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-400">{s.destCity}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-400">{fmtDate(s.loadingDate)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{fmt(s.freightAmount)}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-400">{s.driver?.name || '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{s.vehicle?.registrationNo || '—'}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-zinc-700">
                    <tr className="bg-zinc-900/50">
                      <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase">{tr("Total Freight")}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-brand-400">{fmt(data.summary.totalFreight)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; inset: 0; padding: 24px; background: white; color: black; }
          .print-section .card { border: 1px solid #ccc; background: white; }
          .print-section table { border-collapse: collapse; width: 100%; }
          .print-section th, .print-section td { border: 1px solid #ddd; padding: 6px 8px; font-size: 11px; color: black; }
          .print-section th { background: #f5f5f5; font-weight: 600; }
        }
      `}</style>
    </div>
  );
}
