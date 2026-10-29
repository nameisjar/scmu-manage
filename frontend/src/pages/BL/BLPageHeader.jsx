import { ArrowLeft, CheckCircle2, Clock3, Pencil, Archive, AlertCircle } from 'lucide-react';
import { Button } from '../../components/common';
import { useWorkspaceNavigation } from '../../components/Layout/PageNavigation';
import { useBL } from '../../i18n/bl.mjs';
import { isRegisterArchived } from './registerModel.mjs';

export function reviewStatus(bill) {
  if (isRegisterArchived(bill)) return { label: 'Diarsipkan', tone: 'slate', icon: Archive };
  if (bill.internalStatus === 'SEA_CORRECTION') return { label: 'B/L perlu perbaikan', tone: 'red', icon: AlertCircle };
  if (bill.internalStatus === 'SEA_MATCHED') return { label: 'B/L terverifikasi', tone: 'green', icon: CheckCircle2 };
  if (!bill.documentAvailability?.billOfLading) return { label: 'Menunggu file B/L', tone: 'amber', icon: Clock3 };
  return { label: 'B/L belum diperiksa', tone: 'amber', icon: Clock3 };
}
export default function BLPageHeader({ bill, title, onEdit }) {
  const { t } = useBL(); const navigation = useWorkspaceNavigation(); const status = bill ? reviewStatus(bill) : null;
  const Icon = status?.icon;
  return <header className="bl-page-header" data-page-navigation data-bl-header>
    <button type="button" className="bl-back" data-page-back onClick={navigation.back} aria-label={t('Back to register')}><ArrowLeft size={16} /><span>{t('Kembali')}</span></button>
    <div className="bl-header-title"><h1>{title || bill?.billNumber || t(bill?'Draf pengiriman':'B/L register')}</h1>{bill && <p>{[bill.vesselName || t('Kapal belum diisi'), bill.voyageNumber ? `${t('Voyage')} ${bill.voyageNumber}` : t('Voyage belum diisi')].join(' / ')}</p>}</div>
    {bill && <div className="bl-header-actions"><span className={`bl-status bl-status-${status.tone}`}><Icon size={14} />{t(status.label)}</span>{onEdit && <Button type="button" disabled={isRegisterArchived(bill)} onClick={onEdit}><Pencil size={14} />{t('Ubah data')}</Button>}</div>}
  </header>;
}
