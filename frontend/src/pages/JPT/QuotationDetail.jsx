import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import QuotationEditor from './QuotationEditor';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { PageHeader, StatCard } from '../../components/common';
import { Button, DataTable, Fields, ModalForm, Notice, ResourceState, StatusBadge, jobTypeField, useAction, useResource } from '../../components/jpt/Workspace';
import { formatDate, formatMoney } from '../../utils/format.mjs';
import { printQuotation } from '../../utils/commercialPrint';
import { ApprovalSubmit } from '../../components/jpt/DirectorApproval';
import { useDetailNavigation } from '../../components/Layout/PageNavigation';

export default function QuotationDetail() {
  const { id } = useParams(); const navigate = useNavigate(); const { t, locale, language } = useLanguage(); const { canManage } = useAuth();
  const resource = useResource(`/sales-quotations/${id}`); const action = useAction(resource.reload); const q = resource.data;
  useDetailNavigation(q?.id === id ? q.quotationNumber : '', q?.id === id ? q.status : null);
  const [editing, setEditing] = useState(false);
  const [jobForm, setJobForm] = useState(null);
  return <div className="space-y-5 animate-fade-in">
    <Notice message={action.error} />
    <ResourceState resource={resource}>{q && <>
      <PageHeader title={q.quotationNumber} subtitle={q.title} action={<StatusBadge status={q.status} />} />
      <div className="card p-5 grid sm:grid-cols-2 gap-4 text-sm text-zinc-300">
        <div><p className="text-xs text-zinc-500">{t('SCMU company')}</p>{q.customer.name}</div><div><p className="text-xs text-zinc-500">{t('Route')}</p>{q.originCity} → {q.destCity}</div>
        <div><p className="text-xs text-zinc-500">{t('Cargo description')}</p>{q.cargoDescription}</div><div><p className="text-xs text-zinc-500">{t('Valid Until')}</p>{formatDate(q.validUntil, locale)} · {t('Revision')} {q.revision}</div>
      </div>
      <div className="grid md:grid-cols-3 gap-4"><StatCard label={t('Sales total')} value={formatMoney(q.totals.revenue, q.currency, locale)} /><StatCard label={t('Estimated total cost')} value={formatMoney(q.totals.estimatedCost, q.currency, locale)} /><StatCard label={t('Estimated gross profit')} value={formatMoney(q.totals.estimatedProfit, q.currency, locale)} color="green" /></div>
      <DataTable rows={q.items} columns={[{ key: 'description', label: 'Description' }, { key: 'quantity', label: 'Quantity' }, { key: 'unit', label: 'Unit' },
        { key: 'sellRate', label: 'Sell rate', render: row => formatMoney(row.sellRate, q.currency, locale) },
        { key: 'buyRate', label: 'Estimated buy rate', render: row => formatMoney(row.buyRate, q.currency, locale) },
        { key: 'lineTotal', label: 'Total', render: row => formatMoney(Number(row.quantity) * Number(row.sellRate), q.currency, locale) }]} />
      {q.terms && <div className="card p-5 text-sm text-zinc-400 whitespace-pre-wrap">{q.terms}</div>}
      <div className="flex gap-3 flex-wrap">
        <Button variant="secondary" onClick={() => printQuotation(q, { t, locale, language })}>{t('Print quotation')}</Button>
        {canManage() && <>
          {q.canEdit && <Button variant="secondary" onClick={() => setEditing(true)}>{t('Edit quotation')}</Button>}
          {q.status === 'DRAFT' && <ApprovalSubmit action="SALES_QUOTATION_APPROVE" entityId={q.id} onChange={resource.reload} />}
          {q.status === 'APPROVED' && <Button disabled={action.busy} onClick={() => action.run(() => api.post(`/sales-quotations/${id}/status`, { status: 'SENT' }))}>{t('Mark as sent')}</Button>}
          {q.status === 'SENT' && <><Button disabled={action.busy} onClick={() => action.run(() => api.post(`/sales-quotations/${id}/status`, { status: 'ACCEPTED' }))}>{t('Record quotation acceptance')}</Button><Button variant="danger" disabled={action.busy} onClick={() => action.run(() => api.post(`/sales-quotations/${id}/status`, { status: 'REJECTED' }))}>{t('Reject')}</Button></>}
          {q.status === 'ACCEPTED' && !q.job && <Button disabled={action.busy} onClick={() => setJobForm({ jobType: 'SENDER' })}>{t('Create job order')}</Button>}
          <Button variant="secondary" disabled={action.busy} onClick={() => action.run(async () => { const response = await api.post(`/sales-quotations/${id}/revise`); navigate(`/sales-quotations/${response.data.id}`); })}>{t('Create revision')}</Button>
        </>}
        {q.job && <Link className="text-sm text-brand-400 self-center" to={`/jobs/${q.job.id}`}>{q.job.jobNumber} →</Link>}
      </div>
      {editing && <QuotationEditor quotation={q} onClose={() => setEditing(false)} onSaved={resource.reload} />}
      {jobForm && <ModalForm title="Create job order" onClose={() => setJobForm(null)} onSubmit={async () => { const response = await api.post(`/sales-quotations/${id}/job`, jobForm); navigate(`/jobs/${response.data.id}`); }}><Fields fields={[jobTypeField(t)]} values={jobForm} onChange={(key, value) => setJobForm(previous => ({ ...previous, [key]: value }))} /></ModalForm>}
    </>}</ResourceState>
  </div>;
}
