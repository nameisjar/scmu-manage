import { useLanguage } from '../i18n/LanguageContext';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AlertCircle } from 'lucide-react';
import Brand from '../components/common/Brand';
import LanguageSwitcher from '../components/common/LanguageSwitcher';
import { retryAfterSeconds } from '../api/retryAfter.mjs';

export default function Login() {
  const { t: tr } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [retryAfter, setRetryAfter] = useState(0);
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setTimeout(() => setRetryAfter(seconds => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [retryAfter]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || retryAfter > 0) return;
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
      if (err.response?.status === 429) setRetryAfter(retryAfterSeconds(err.response.headers?.['retry-after']));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Left panel */}
      <div className="flex-1 hidden lg:flex flex-col justify-between p-12 bg-zinc-900 border-r border-zinc-800 relative overflow-hidden">
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'linear-gradient(#2563EB 1px, transparent 1px), linear-gradient(90deg, #2563EB 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative">
          <Brand large />
        </div>

        <div className="relative space-y-6">
          <div>
            <h2 className="font-display text-5xl font-bold text-zinc-100 leading-tight"> {tr("Your freight.")}<br />
              <span className="text-brand-400">{tr("Fully synced.")}</span>
            </h2>
            <p className="text-zinc-400 text-lg mt-4 max-w-sm leading-relaxed"> {tr("Internal SCMU logistics management. Manage RFQs, track shipments, and reconcile invoices — all in one place.")} </p>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-sm">
            {['RFQ Indenting', 'Live Tracking', 'Fleet Management', 'Invoice Reconciliation'].map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-zinc-400">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                {tr(f)}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-zinc-500 text-sm">© 2026 SCMU</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8"><LanguageSwitcher /></div>
          <div className="lg:hidden mb-8">
            <Brand large />
          </div>

          <h1 className="font-display text-2xl font-bold text-zinc-100 mb-1">{tr("Sign in")}</h1>
          <p className="text-zinc-400 text-sm mb-8">{tr("Access your logistics dashboard")}</p>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-6">
              <AlertCircle size={16} className="flex-shrink-0" />
              {tr(error)}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1.5">{tr("Email address")}</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="admin@scmu.local"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1.5">{tr("Password")}</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || retryAfter > 0}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>{retryAfter > 0 ? tr('Try again in {seconds}s', { seconds: retryAfter }) : tr("Sign in")} <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <div className="mt-8 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <p className="text-xs font-medium text-zinc-400 mb-2">{tr("Demo credentials")}</p>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between text-zinc-500">
                <span className="text-zinc-400">admin@scmu.local</span>
                <span>Admin@1234</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span className="text-zinc-400">operasional@scmu.local</span>
                <span>Ops@1234</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
