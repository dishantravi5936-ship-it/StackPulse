import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Check, Eye, EyeOff } from 'lucide-react';
import api, { getErrorMessage } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button, ErrorBanner, Field, IconButton } from '../components/ui';

function Brand() {
  return (
    <Link to="/" className="brand-lockup">
      <span className="brand-mark"><Activity size={17} strokeWidth={2.5} /></span>
      <span>stack<span className="brand-light">pulse</span></span>
    </Link>
  );
}

export default function LoginPage({ mode = 'login' }: { mode?: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const location = useLocation();
  const { saveSession } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const expired = Boolean((location.state as { expired?: boolean } | null)?.expired);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        email: email.trim().toLowerCase(),
        password,
        ...(isRegister && bootstrapToken.trim() ? { bootstrapToken: bootstrapToken.trim() } : {}),
      };
      const response = await api.post<{ token: string; user: import('../types').User }>(
        `/auth/${isRegister ? 'register' : 'login'}`,
        payload
      );
      saveSession(response.data.token, response.data.user);
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, isRegister ? 'Unable to create your account.' : 'Unable to sign in.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Brand />
        <div className="auth-aside-content">
          <p className="eyebrow">OPERATIONS, WITH CONTEXT</p>
          <h1>Good monitoring knows when it doesn’t know.</h1>
          <p>StackPulse separates service availability from monitoring completeness, so missing data never masquerades as a healthy system.</p>
          <div className="auth-proof-list">
            <span className="auth-proof-item"><Check size={15} /> Schedule-aware coverage and freshness</span>
            <span className="auth-proof-item"><Check size={15} /> Deterministic incident timelines</span>
            <span className="auth-proof-item"><Check size={15} /> Private-by-default endpoint details</span>
          </div>
        </div>
        <div className="auth-aside-footer">Built for the people who keep services running.</div>
      </aside>
      <main className="auth-panel">
        <div className="auth-top-actions">
          <IconButton label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme}>
            {theme === 'dark' ? <span aria-hidden="true">☼</span> : <span aria-hidden="true">◐</span>}
          </IconButton>
        </div>
        <div className="auth-form-wrap">
          <Brand />
          <h2>{isRegister ? 'Create your workspace' : 'Welcome back'}</h2>
          <p>{isRegister ? 'Start with an account for your monitoring workspace.' : 'Sign in to review your live monitoring workspace.'}</p>
          {expired && <ErrorBanner>Your session expired. Sign in again to continue.</ErrorBanner>}
          <form onSubmit={(event) => void submit(event)} className="auth-form">
            <Field label="Work email" htmlFor="auth-email">
              <input id="auth-email" className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="you@company.com" />
            </Field>
            <Field label="Password" htmlFor="auth-password" hint={isRegister ? 'Use at least 12 characters.' : undefined}>
              <div className="password-input">
                <input id="auth-password" className="input" type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={isRegister ? 12 : 1} maxLength={128} placeholder={isRegister ? 'At least 12 characters' : 'Enter your password'} />
                <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            {isRegister && (
              <Field label="Administrator bootstrap token" htmlFor="bootstrap-token" hint="Required only when registering the first account. Ask your workspace operator.">
                <input id="bootstrap-token" className="input" type="password" autoComplete="off" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)} maxLength={512} placeholder="Optional for later accounts" />
              </Field>
            )}
            {error && <ErrorBanner>{error}</ErrorBanner>}
            <Button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
            </Button>
          </form>
          <div className="auth-bottom">
            {isRegister ? 'Already have an account?' : 'New to StackPulse?'}{' '}
            <Link className="text-link" to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link>
          </div>
          <div className="auth-bottom"><Link to="/" className="text-link">Back to home</Link></div>
        </div>
      </main>
    </div>
  );
}
