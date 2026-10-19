import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { StatusBadge } from '../common';
import { detailModule, localPage, pageLabel } from './navigation.mjs';

const Context = createContext(null);
const urlOf = location => `${location.pathname}${location.search}${location.hash}`;
function loadEntries(key) {
  try { const value = JSON.parse(sessionStorage.getItem(key)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
export function PageNavigationProvider({ children }) {
  const { user } = useAuth(); const location = useLocation(); const type = useNavigationType(); const navigate = useNavigate();
  const storageKey = `scmu_navigation:${user.id}`; const entries = useRef(null);
  if (!entries.current) entries.current = loadEntries(storageKey);
  const main = useRef(null); const content = useRef(null); const active = useRef(null); const restoring = useRef(false); const observer = useRef(null);
  const [metadata, setMetadata] = useState(null); const [revision, refresh] = useState(0);
  const persist = useCallback(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(entries.current)); } catch { /* Navigation still works when storage is unavailable. */ } }, [storageKey]);
  const remember = useCallback(() => {
    if (active.current && main.current && !restoring.current) active.current.scroll = main.current.scrollTop;
  }, []);
  const checkpoint = useCallback(() => { remember(); persist(); }, [remember, persist]);
  const stopRestoring = useCallback(() => { restoring.current = false; observer.current?.disconnect(); remember(); }, [remember]);
  useLayoutEffect(() => {
    const previous = active.current; const url = urlOf(location); const index = window.history.state?.idx;
    let entry = entries.current[location.key];
    if (!entry || entry.url !== url) {
      entry = { key: location.key, url, pathname: location.pathname, index, scroll: 0 };
      if (previous && type === 'REPLACE' && previous.pathname === location.pathname) {
        entry.back = previous.back; entry.scroll = previous.scroll;
      } else if (previous && type === 'PUSH' && localPage(previous.url) && previous.url !== url) {
        const source = /\/new\/?$/.test(previous.pathname) ? previous.back : previous;
        if (source) entry.back = { key: source.key, url: source.url, index: source.index };
      }
      entries.current[location.key] = entry;
    }
    entry.index = index; active.current = entry;
    const keys = Object.keys(entries.current); for (const key of keys.slice(0, Math.max(0, keys.length - 100))) if (key !== entry.key) delete entries.current[key];
    observer.current?.disconnect(); const target = Number.isFinite(entry.scroll) && entry.scroll > 0 ? entry.scroll : 0;
    const apply = () => {
      const element = main.current; if (!element) return;
      const available = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = Math.min(target, available);
      if (available >= target) { restoring.current = false; observer.current?.disconnect(); }
    };
    restoring.current = target > 0;
    observer.current = new ResizeObserver(apply); if (content.current && target) observer.current.observe(content.current);
    apply(); persist(); refresh(value => value + 1);
    return () => observer.current?.disconnect();
  }, [location.key, location.pathname, location.search, location.hash, type, persist]);
  useEffect(() => { window.addEventListener('pagehide', checkpoint); return () => window.removeEventListener('pagehide', checkpoint); }, [checkpoint]);
  const back = useCallback(() => {
    checkpoint(); const entry = active.current; const origin = entry?.back;
    const destination = origin && localPage(origin.url) && origin.url !== entry.url ? origin.url : `/${detailModule(location.pathname) || ''}`;
    const currentIndex = window.history.state?.idx;
    if (origin && entries.current[origin.key]?.url === destination && Number.isInteger(origin.index) && Number.isInteger(currentIndex) && origin.index < currentIndex) navigate(origin.index - currentIndex);
    else navigate(destination, { replace: true });
  }, [location.pathname, navigate, checkpoint]);
  const value = useMemo(() => ({ main, content, remember, checkpoint, stopRestoring, back, metadata, setMetadata, entry: active.current }), [remember, checkpoint, stopRestoring, back, metadata, revision]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDetailNavigation(title, status) {
  const navigation = useContext(Context); const { pathname } = useLocation(); const setMetadata = navigation?.setMetadata;
  useEffect(() => { setMetadata?.({ pathname, title, status }); }, [setMetadata, pathname, title, status]);
}
export function usePageQuery() {
  const [params, setParams] = useSearchParams();
  const update = (changes) => setParams(previous => { const next = new URLSearchParams(previous); for (const [key, value] of Object.entries(changes)) { if (value === '' || value === null || value === undefined) next.delete(key); else next.set(key, String(value)); } return next; }, { replace: true });
  return [params, update];
}
export function NavigationScrollArea({ children }) {
  const navigation = useContext(Context); const location = useLocation(); const { t } = useLanguage();
  const module = detailModule(location.pathname); const info = navigation.metadata?.pathname === location.pathname ? navigation.metadata : null;
  const origin = navigation.entry?.back; const destination = origin && localPage(origin.url) ? origin.url : `/${module}`;
  return <main ref={navigation.main} className="flex-1 min-w-0 overflow-y-auto" data-page-scroll onScroll={navigation.remember} onClickCapture={navigation.checkpoint} onWheel={navigation.stopRestoring} onTouchStart={navigation.stopRestoring} onKeyDown={event => { if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) navigation.stopRestoring(); }}>
    {module && <nav aria-label={t('Page navigation')} className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur shadow-sm" data-page-navigation>
      <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3">
        <button type="button" data-page-back onClick={navigation.back} className="inline-flex max-w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-300 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"><ArrowLeft size={17} className="shrink-0" /><span className="min-w-0 text-left">{t('Back to {page}', { page: t(pageLabel(destination)) })}</span></button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100" title={info?.title}>{info?.title || t(pageLabel(location.pathname))}</span>
        {info?.status && <StatusBadge status={info.status} />}
      </div>
    </nav>}
    <div ref={navigation.content} className="p-6 max-w-screen-2xl mx-auto">{children}</div>
  </main>;
}
