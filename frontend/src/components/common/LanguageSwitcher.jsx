import { useId } from 'react';
import { Globe2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { LANGUAGES } from '../../i18n/translations.mjs';

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-xs font-medium text-zinc-400">
        <Globe2 size={14} aria-hidden="true" /> Bahasa / Language
      </label>
      <select id={id} value={language} onChange={event => setLanguage(event.target.value)} className="input-field w-full text-sm" lang={language}>
        {Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}
      </select>
    </div>
  );
}
