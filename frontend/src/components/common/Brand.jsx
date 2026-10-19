import { useLanguage } from '../../i18n/LanguageContext';
export default function Brand({ large = false }) {
  const { t: tr } = useLanguage();
  return (
    <div className="flex items-center gap-3">
      <img
        src="/scmu-logo.svg"
        alt="Logo SCMU"
        width={large ? 80 : 56}
        height={large ? 80 : 56}
        className="flex-shrink-0 object-contain select-none"
      />
      <div>
        <p className={`font-display font-bold text-zinc-100 leading-none ${large ? 'text-2xl' : 'text-xl'}`}>SCMU</p>
        <p className="text-xs text-zinc-400 mt-1">{tr("Management System")}</p>
      </div>
    </div>
  );
}
