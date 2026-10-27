import { useLanguage } from '../../i18n/LanguageContext';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

let openModalCount = 0;
let previousBodyOverflow;
let rootWasInert;
// StatusBadge
export function StatusBadge({ status }) {
  const { t: tr } = useLanguage();
  const map = {
    // Shipments
    PENDING: 'badge-zinc',
    SEA_NOT_RECEIVED: 'badge-zinc',
    SEA_DRAFT_RECEIVED: 'badge-blue',
    SEA_FINAL_RECEIVED: 'badge-blue',
    SEA_UNCHECKED: 'badge-zinc',
    SEA_CORRECTION: 'badge-red',
    SEA_MATCHED: 'badge-green',
    SEA_RELEASE_PENDING: 'badge-zinc',
    SEA_RELEASE_CONFIRMED: 'badge-green',
    ASSIGNED: 'badge-blue',
    IN_TRANSIT: 'badge-brand',
    REACHED_DESTINATION: 'badge-purple',
    DELIVERED: 'badge-green',
    POD_UPLOADED: 'badge-green',
    COMPLETED: 'badge-green',
    CANCELLED: 'badge-red',
    // RFQ
    DRAFT: 'badge-zinc',
    OPEN: 'badge-blue',
    QUOTED: 'badge-brand',
    AWARDED: 'badge-green',
    EXPIRED: 'badge-red',
    // Invoice
    SUBMITTED: 'badge-blue',
    UNDER_REVIEW: 'badge-brand',
    APPROVED: 'badge-purple',
    DISPUTED: 'badge-red',
    PAID: 'badge-green',
    // Quote
    ACCEPTED: 'badge-green',
    REJECTED: 'badge-red',
    WITHDRAWN: 'badge-zinc',
    RETURNED: 'badge-brand',
    BOOKED: 'badge-blue', IN_PROGRESS: 'badge-brand', CLOSED: 'badge-green',
    SENT: 'badge-blue', PROPOSED: 'badge-brand', UPLOADED: 'badge-blue', VERIFIED: 'badge-green',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium font-mono ${map[status] || 'badge-zinc'}`}>
      {tr(status?.replace(/_/g, ' '))}
    </span>
  );
}

// Button
export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {

  const base = `btn btn-${variant} inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed`;
  const variants = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
    secondary: 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700',
    danger: 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25',
    ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

// Modal
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }) {
  const { t } = useLanguage();
  const titleId = useId();
  const panel = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const appRoot = document.getElementById('root');
    if (openModalCount++ === 0) {
      previousBodyOverflow = document.body.style.overflow;
      rootWasInert = appRoot?.inert;
      document.body.style.overflow = 'hidden';
      if (appRoot) appRoot.inert = true;
    }
    const controls = () => Array.from(panel.current?.querySelectorAll('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || []).filter(element => element.getClientRects().length);
    (panel.current?.querySelector('input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled)') || panel.current)?.focus({ preventScroll: true });
    const keydown = event => {
      const dialogs = document.querySelectorAll('[data-modal-panel]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current?.(); }
      if (event.key === 'Tab') {
        const elements = controls(); const first = elements[0]; const last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); panel.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      if (--openModalCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        if (appRoot) appRoot.inert = rootWasInert || false;
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  // A portal avoids transformed/scrolling page ancestors becoming the fixed containing block.
  return createPortal(
    <div className="modal-overlay" data-modal-root onMouseDown={event => { if (event.target === event.currentTarget) close.current?.(); }}>
      <section ref={panel} data-modal-panel role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`modal-panel card ${width}`}>
        <header className="modal-header"><h2 id={titleId} className="font-display text-lg font-semibold text-zinc-100">{title}</h2><button type="button" onClick={onClose} aria-label={t('Close')} className="modal-close">×</button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </section>
    </div>, document.body,
  );
}

// FormField
export function FormField({ label, required, children, error }) {
  const { t: tr } = useLanguage();
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">
        {tr(label)} {required && <span className="text-brand-400">*</span>}
      </label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1">{tr(error)}</p>}
    </div>
  );
}

// PageHeader
export function PageHeader({ title, subtitle, action }) {

  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-zinc-100">{title}</h1>
        {subtitle && <p className="text-zinc-400 text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// StatCard
export function StatCard({ label, value, icon: Icon, color = 'brand', delta }) {
  const { t: tr } = useLanguage();
  const colors = {
    brand: 'text-brand-400 bg-brand-400/10',
    green: 'text-green-400 bg-green-400/10',
    blue: 'text-blue-400 bg-blue-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    red: 'text-red-400 bg-red-400/10',
  };

  return (
    <div className="card p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{tr(label)}</p>
          <p className="font-display text-3xl font-bold text-zinc-100 mt-1">{value}</p>
          {delta && <p className="text-xs text-zinc-500 mt-1">{delta}</p>}
        </div>
        {Icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  );
}

// EmptyState
export function EmptyState({ icon: Icon, title, description, action }) {

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center mb-4"><Icon size={24} className="text-zinc-500" /></div>}
      <h3 className="font-display font-semibold text-zinc-300 text-lg">{title}</h3>
      {description && <p className="text-zinc-500 text-sm mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Spinner
export function Spinner() {

  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-zinc-700 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );
}

// SearchInput
export function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  const { t: tr } = useLanguage();
  return (
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={tr(placeholder)}
      className="input-field w-64 max-w-full"
    />
  );
}
