import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Info,
  LoaderCircle,
  PauseCircle,
  X,
} from 'lucide-react';
import { serviceLabel, serviceTone } from '../lib/format';
import type { Freshness, ServiceState } from '../types';

const toneStyles = {
  green: 'status-green',
  red: 'status-red',
  amber: 'status-amber',
  gray: 'status-gray',
  neutral: 'status-neutral',
};

function ToneIcon({ tone }: { tone: keyof typeof toneStyles }) {
  if (tone === 'green') return <CheckCircle2 aria-hidden="true" />;
  if (tone === 'red') return <AlertCircle aria-hidden="true" />;
  if (tone === 'amber') return <Clock3 aria-hidden="true" />;
  if (tone === 'neutral') return <PauseCircle aria-hidden="true" />;
  return <CircleHelp aria-hidden="true" />;
}

export function StatusBadge({
  status,
  freshness,
  label,
}: {
  status: ServiceState | 'operational' | 'outage' | 'degraded';
  freshness?: Freshness;
  label?: string;
}) {
  const tone = serviceTone(status, freshness);
  return (
    <span className={`status-badge ${toneStyles[tone]}`}>
      <ToneIcon tone={tone} />
      {label ?? serviceLabel(status, freshness)}
    </span>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  return (
    <button className={`button button-${variant} button-${size} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={`icon-button ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`surface ${className}`}>{children}</section>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className={`metric-card ${accent ? 'metric-card-accent' : ''}`}>
      <div className="metric-top">
        <span className="metric-icon">{icon}</span>
        <span className="metric-label">{label}</span>
      </div>
      <strong className="metric-value">{value}</strong>
      {detail && <span className="metric-detail">{detail}</span>}
    </Card>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="notice notice-error">
      <AlertCircle size={16} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="notice notice-info">
      <Info size={16} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function LoadingBlock({ label = 'Loading live monitoring data…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status">
      <LoaderCircle className="spin" size={18} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon ?? <CircleHelp size={22} />}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClass = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  contentClass?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog-content ${contentClass}`}>
          <div className="dialog-heading">
            <div>
              <Dialog.Title className="dialog-title">{title}</Dialog.Title>
              {description && <Dialog.Description className="dialog-description">{description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close dialog"><X size={17} /></IconButton>
            </Dialog.Close>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  return <div className="divider">{label && <span>{label}</span>}</div>;
}
