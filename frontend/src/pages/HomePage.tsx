import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Activity,
  Check,
  AlertCircle,
  Gauge,
  Moon,
  ShieldCheck,
  Sun,
  Waypoints,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { IconButton } from '../components/ui';

function Brand() {
  return (
    <span className="brand-lockup" aria-label="StackPulse">
      <span className="brand-mark"><Activity size={17} strokeWidth={2.5} /></span>
      <span>stack<span className="brand-light">pulse</span></span>
    </span>
  );
}

export default function HomePage() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="landing">
      <header className="landing-topbar">
        <Link to="/"><Brand /></Link>
        <div className="landing-actions">
          <Link className="button button-secondary button-sm" to="/status">Public status</Link>
          <Link className="button button-ghost button-sm" to="/login">Sign in</Link>
          <Link className="button button-primary button-sm" to="/register">Get started <ArrowRight size={14} /></Link>
          <IconButton label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <span className="landing-pill"><i /> Infrastructure health, without the guesswork</span>
          <h1>Know what’s up.<br /><span>And what you don’t.</span></h1>
          <p>
            Reliable endpoint monitoring with the context to tell a real service failure
            from a monitoring blind spot. Built for teams who care about the difference.
          </p>
          <div className="landing-hero-actions">
            <Link to="/register" className="button button-primary button-md">Start monitoring <ArrowRight size={15} /></Link>
            <Link to="/status" className="button button-secondary button-md">View public status</Link>
          </div>
          <div className="landing-proof" aria-label="How StackPulse reports reliability">
            <div className="proof-topbar">
              <strong>Reliability is more than a green number</strong>
              <span>Observed checks · 24 hours</span>
            </div>
            <div className="proof-grid">
              <div className="proof-stat"><span>Observed uptime</span><strong>From completed checks</strong></div>
              <div className="proof-stat"><span>Monitoring coverage</span><strong>Expected vs completed</strong></div>
              <div className="proof-stat"><span>Missing periods</span><strong>Always shown as unknown</strong></div>
            </div>
            <div className="proof-note">
              A perfect observed uptime does not prove uninterrupted availability when checks are missing.
              StackPulse keeps monitoring freshness and service state separate.
            </div>
          </div>
        </section>

        <section className="landing-features" aria-label="Product capabilities">
          <article className="surface feature-card">
            <span className="feature-icon"><Gauge size={17} /></span>
            <h3>Trust-aware uptime</h3>
            <p>See successful observations and monitoring coverage independently. Gaps stay visible instead of becoming accidental green.</p>
          </article>
          <article className="surface feature-card">
            <span className="feature-icon"><AlertCircle size={17} /></span>
            <h3>Useful incident context</h3>
            <p>Track deterministic incident timelines and inspect evidence-based troubleshooting suggestions without invented root causes.</p>
          </article>
          <article className="surface feature-card">
            <span className="feature-icon"><ShieldCheck size={17} /></span>
            <h3>Safer by design</h3>
            <p>Endpoint destinations are validated and pinned by the native monitor. Public pages omit private URLs and diagnostic details.</p>
          </article>
        </section>

        <section className="landing-trust">
          <div>
            <p className="eyebrow">Built for clear signals</p>
            <h2>Monitoring data is only useful when you know how much to trust it.</h2>
            <p>StackPulse reports what it observed, what it expected to observe, and when its own monitoring was interrupted.</p>
          </div>
          <div className="trust-points">
            <div className="trust-point"><Check size={15} /> Missing scheduled checks are never counted as healthy.</div>
            <div className="trust-point"><Check size={15} /> Three consecutive scheduled failures open one incident.</div>
            <div className="trust-point"><Check size={15} /> A single monitoring location cannot confirm a global outage.</div>
            <div className="trust-point"><Waypoints size={15} /> Native Node.js checks remain authoritative; Gatus is optional.</div>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <span>© StackPulse · AVISHKAR’26</span>
        <span>Open source monitoring · No paid APIs</span>
      </footer>
    </div>
  );
}
