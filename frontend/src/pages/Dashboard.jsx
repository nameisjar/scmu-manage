import { Link } from 'react-router-dom';
import { PageHeader } from '../components/common';
import { DataTable, Notice, useResource } from '../components/jpt/Workspace';
import {useBL} from '../i18n/bl.mjs';
import { RegisterStats } from './BL/BLRegister';

export function RegisterOverview({summary={}}) {
 const {t}=useBL();
 const target=row=>row.voyageId&&row.vesselId?`/vessels/${row.vesselId}/voyages/${row.voyageId}`:row.vesselId?`/vessels/${row.vesselId}?${new URLSearchParams(row.voyageNumber?{legacyVoyage:row.voyageNumber}:{voyageMissing:'true'})}`:`/bl-register?${new URLSearchParams({vesselExact:row.vesselName||'',...(row.voyageNumber?{voyageExact:row.voyageNumber}:{voyageMissing:'true'})})}`;
 const vesselVoyages=summary.byVesselVoyage?.length?summary.byVesselVoyage:(summary.byVessel||[]).map((row,index)=>({vesselName:row.vesselName,voyageNumber:summary.byVoyage?.[index]?.voyageNumber,count:row.count}));
 return <div className="space-y-5" data-register-dashboard>
 <PageHeader title={t('Dasbor Pengiriman')} subtitle={t('Ringkasan operasional B/L, kelengkapan dokumen, kapal, dan voyage.')} action={<Link to="/bl-register" className="text-brand-400 text-sm">{t('Buka pengiriman →')}</Link>}/>
 <RegisterStats summary={summary}/>
 <section className="space-y-3"><h2 className="text-sm font-semibold">{t('B/L berdasarkan kapal dan voyage')}</h2><DataTable rows={vesselVoyages.map((row,index)=>({...row,id:index}))} columns={[{key:'vesselName',label:'Kapal',render:row=><Link className="text-brand-400 font-semibold hover:underline" to={target(row)}>{row.vesselName||t('Belum diketahui')}</Link>},{key:'voyageNumber',label:'Voyage / Periode',render:row=><Link className="text-brand-400 hover:underline" to={target(row)}>{row.voyageNumber||t('Belum diketahui')}{row.period?' · '+row.period:''}</Link>},{key:'count',label:'Jumlah B/L',render:row=><Link className="text-brand-400" to={target(row)}>{row.count} →</Link>}]} empty="Belum ada ringkasan tersedia."/></section>
 <section className="space-y-3"><h2 className="text-sm font-semibold">{t('B/L terbaru')}</h2><DataTable pagination={false} rows={summary.recentRegisters||[]} columns={[{key:'billNumber',label:'Nomor B/L',render:row=><Link className="font-mono text-brand-400" to={`/bl-register/${row.id}`}>{row.billNumber||t('B/L belum tersedia')}</Link>},{key:'vesselName',label:'Kapal'},{key:'voyageNumber',label:'Voyage'},{key:'createdAt',label:'Tanggal dibuat',render:row=>row.createdAt?.slice(0,10)||'—'}]} empty="Belum ada B/L."/></section>
 </div>;
}
export default function Dashboard() {
 const {t}=useBL();
 const resource=useResource('/journeys?limit=5&page=1&archived=active');
 const summary=resource.data?.summary||{};
 return <div className="space-y-5"><PageHeader title={t('Dasbor Pengiriman')} subtitle={t('Ringkasan perjalanan kapal dan seluruh B/L di dalamnya.')} action={<Link className="text-brand-500 text-sm" to="/bl-register">{t('Buka pengiriman →')}</Link>}/><Notice message={resource.error}/><div className="grid sm:grid-cols-3 gap-3">{[['totalJourneys','Pengiriman'],['totalBills','B/L'],['totalContainers','Kontainer']].map(([k,l])=><div key={k} className="card p-4"><p className="text-sm text-zinc-500">{t(l)}</p><strong className="text-2xl">{resource.loading?'…':summary[k]||0}</strong></div>)}</div><DataTable rows={resource.data?.data||[]} pagination={false} columns={[{key:'label',label:'Kapal & Voyage',primary:true,render:r=><Link className="font-semibold text-brand-500" to={'/shipments/'+r.id}>{r.label}</Link>},{key:'period',label:'Periode'},{key:'destination',label:'Tujuan'},{key:'billCount',label:'Jumlah B/L'},{key:'containerCount',label:'Kontainer'},{key:'documentCount',label:'Dokumen'}]} empty="Belum ada pengiriman."/></div>;
}
