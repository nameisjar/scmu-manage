import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, LOCALES, isLanguage, readLanguage, translate } from './translations.mjs';

const LanguageContext = createContext(null);

function storedLanguage() {
  try { return readLanguage(window.localStorage); } catch { return DEFAULT_LANGUAGE; }
}

export function LanguageProvider({ children, initialLanguage }) {
  const [language, updateLanguage] = useState(() => isLanguage(initialLanguage) ? initialLanguage : storedLanguage());
  const value = useMemo(() => ({
    language,
    locale: LOCALES[language],
    t: (key, values) => translate(language, key, values),
    setLanguage: (next) => {
      if (!isLanguage(next)) return;
      updateLanguage(next);
      try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* Still switch when storage is unavailable. */ }
    },
  }), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = `SCMU — ${translate(language, 'Management System')}`;
    const onStorage = (event) => {
      if (event.key === LANGUAGE_STORAGE_KEY && (event.newValue === null || isLanguage(event.newValue))) {
        updateLanguage(event.newValue || DEFAULT_LANGUAGE);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used within LanguageProvider');
  return value;
}
