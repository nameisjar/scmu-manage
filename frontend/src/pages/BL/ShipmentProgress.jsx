import {useBL} from '../../i18n/bl.mjs';
export default function ShipmentProgress({bill}){
 const {t}=useBL(),flow=bill.workflow;if(!flow)return null;
 return <div className="grid sm:grid-cols-3 gap-3 mb-5" data-shipment-progress>{[['Dokumen utama',flow.documents==='COMPLETE'?'Lengkap sesuai kebutuhan':'Belum lengkap'],['Rincian Packing List',flow.sourcePrepared?'Sudah diperiksa admin':bill.registerData?.voyagePacking&&bill.documentAvailability?.internalPackingList?'Tersedia sebagai rekap':'Perlu disiapkan'],['Pekerjaan lapangan',({NOT_STARTED:'Belum dimulai',IN_PROGRESS:'Berjalan',COMPLETED:'Selesai'})[flow.field]]].map(([label,value])=><div key={label} className="card p-4"><p className="text-xs text-zinc-500">{t(label)}</p><strong className="block text-sm mt-1">{t(value)}</strong></div>)}</div>;
}
