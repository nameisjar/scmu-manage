import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common';
import { DataTable, Notice, usePagedResource } from '../../components/jpt/Workspace';
import { usePageQuery } from '../../components/Layout/PageNavigation';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatRegisterAmount } from '../BL/registerModel.mjs';

export default function BillingTax(){
 const {t}=useLanguage();const [params,setQuery]=usePageQuery();const search=params.get('search')||'';const resource=usePagedResource('/operations/billing',{search},'billing');
 const rows=resource.rows;const totals=rows.reduce((sum,row)=>{sum.gross+=Number(row.grossAmount||0);sum.pph+=Number(row.pph23Amount||0);sum.net+=Number(row.netPayable||0);return sum;},{gross:0,pph:0,net:0});
 return <div className="space-y-5"><PageHeader title={t('Tagihan & Pajak')} subtitle={t('Rekap tagihan per B/L. PPh 23 hanya dihitung saat ditandai berlaku; verifikasi dasar pajak dan bukti potong tetap wajib.')}/>
  <div className="grid sm:grid-cols-3 gap-3">{[['Total halaman',totals.gross],['PPh 23 halaman ini',totals.pph],['Bersih dibayar',totals.net]].map(([label,value])=><div className="card p-4" key={label}><p className="text-xs text-zinc-400">{t(label)}</p><p className="mt-2 text-xl tabular-nums">{formatRegisterAmount(value.toFixed(2))}</p></div>)}</div>
  <input className="input-field max-w-xl" type="search" aria-label={t('Cari B/L atau pelayaran')} placeholder={t('Cari B/L atau pelayaran')} value={search} onChange={event=>setQuery({search:event.target.value,page:null})}/>
  <Notice message={resource.error}/><DataTable rows={rows} pagination={resource.pagination} empty={t('Belum ada data tagihan.')} columns={[
   {key:'billNumber',label:t('Nomor B/L'),render:row=><Link className="font-mono text-brand-400" to={`/bl-register/${row.id}`}>{row.billNumber}</Link>},
   {key:'vendorName',label:t('Vendor/JPT')},{key:'invoiceNumber',label:t('Nomor invoice')},{key:'invoiceDate',label:t('Tanggal invoice'),render:row=>row.invoiceDate?.slice(0,10)||'—'},{key:'dueDate',label:t('Jatuh tempo'),render:row=>row.dueDate?.slice(0,10)||'—'},
   {key:'grossAmount',label:t('Jumlah tagihan'),align:'right',render:row=>formatRegisterAmount(row.grossAmount)},
   {key:'pph23Amount',label:t('PPh 23'),align:'right',render:row=>row.pph23Applicable?formatRegisterAmount(row.pph23Amount):t('Tidak berlaku')},
   {key:'netPayable',label:t('Bersih dibayar'),align:'right',render:row=>formatRegisterAmount(row.netPayable)},
   {key:'billingStatus',label:t('Status'),render:row=>t(row.billingStatus)},
   {key:'documents',label:t('Dokumen pajak'),render:row=><span className="text-xs">Invoice {row.hasInvoice?'✓':'—'} · Faktur {row.hasTaxInvoice?'✓':'—'} · Bukti PPh {row.hasPphCertificate?'✓':'—'}</span>},
  ]}/></div>;
}
