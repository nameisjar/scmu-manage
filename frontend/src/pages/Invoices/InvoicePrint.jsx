import { Printer } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { createInvoiceHtml } from './invoiceTemplate.mjs';

export function PrintButton({ invoice }) {
  const { t: tr, language } = useLanguage();
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;
    printWindow.document.write(createInvoiceHtml(invoice, {
      language, logoUrl: new URL('/scmu-logo.svg?v=20261020', window.location.origin).href,
    }));
    printWindow.document.close();
    const imagesReady = Array.from(printWindow.document.images, image => image.decode().catch(() => {}));
    Promise.all(imagesReady).then(() => {
      printWindow.focus();
      printWindow.print();
    });
  };
  return (
    <button onClick={handlePrint} className="text-xs text-zinc-400 hover:text-zinc-100 flex items-center gap-1 transition-colors" title={tr('Print invoice')}>
      <Printer size={13} /> {tr('Print')}
    </button>
  );
}
