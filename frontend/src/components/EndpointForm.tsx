import { useState, type FormEvent } from 'react';
import type { Endpoint } from '../types';
import { Button, Field, Modal } from './ui';

export interface EndpointPayload {
  name: string;
  url: string;
  group_name: string;
  expected_status: number;
  expected_content: string | null;
  interval_seconds: 30 | 60 | 120;
  is_public: boolean;
}

export function EndpointForm({
  open,
  onOpenChange,
  endpoint,
  saving,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint?: Endpoint;
  saving: boolean;
  error: string | null;
  onSubmit: (payload: EndpointPayload) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [group, setGroup] = useState('core');
  const [expectedStatus, setExpectedStatus] = useState('200');
  const [expectedContent, setExpectedContent] = useState('');
  const [interval, setInterval] = useState<'30' | '60' | '120'>('60');
  const [isPublic, setIsPublic] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const applyOpen = (nextOpen: boolean) => {
    if (nextOpen && !open) {
      setName(endpoint?.name ?? '');
      setUrl(endpoint?.url ?? '');
      setGroup(endpoint?.group_name ?? 'core');
      setExpectedStatus(String(endpoint?.expected_status ?? 200));
      setExpectedContent(endpoint?.expected_content ?? '');
      setInterval(String(endpoint?.interval_seconds ?? 60) as '30' | '60' | '120');
      setIsPublic(Boolean(endpoint?.public_slug));
      setValidationError(null);
    }
    onOpenChange(nextOpen);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const status = Number(expectedStatus);
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      setValidationError('Enter an HTTP status code from 100 to 599.');
      return;
    }
    setValidationError(null);
    await onSubmit({
      name: name.trim(),
      url: url.trim(),
      group_name: group.trim() || 'default',
      expected_status: status,
      expected_content: expectedContent.trim() || null,
      interval_seconds: Number(interval) as 30 | 60 | 120,
      is_public: isPublic,
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={applyOpen}
      title={endpoint ? 'Edit endpoint' : 'Add endpoint'}
      description="Checks use the native monitor and its destination-safety controls."
      contentClass="dialog-wide"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={() => applyOpen(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" form="endpoint-form" disabled={saving}>
            {saving ? 'Saving…' : endpoint ? 'Save changes' : 'Create endpoint'}
          </Button>
        </>
      )}
    >
      <form id="endpoint-form" onSubmit={(event) => void submit(event)} className="form-grid">
        <Field label="Display name" htmlFor="endpoint-name">
          <input id="endpoint-name" className="input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} placeholder="Payments API" />
        </Field>
        <Field label="Endpoint URL" htmlFor="endpoint-url" hint="HTTP and HTTPS only. Private or local destinations are rejected.">
          <input id="endpoint-url" className="input" value={url} onChange={(event) => setUrl(event.target.value)} required type="url" maxLength={2048} placeholder="https://api.example.com/health" />
        </Field>
        <div className="form-row">
          <Field label="Group" htmlFor="endpoint-group">
            <input id="endpoint-group" className="input" value={group} onChange={(event) => setGroup(event.target.value)} maxLength={50} placeholder="core" />
          </Field>
          <Field label="Check interval" htmlFor="endpoint-interval">
            <select id="endpoint-interval" className="input" value={interval} onChange={(event) => setInterval(event.target.value as '30' | '60' | '120')}>
              <option value="30">Every 30 seconds</option>
              <option value="60">Every 60 seconds</option>
              <option value="120">Every 120 seconds</option>
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Expected HTTP status" htmlFor="endpoint-status" hint="The monitor matches this exact response code.">
            <input id="endpoint-status" className="input" value={expectedStatus} onChange={(event) => setExpectedStatus(event.target.value)} inputMode="numeric" type="number" min={100} max={599} step={1} required />
          </Field>
          <Field label="Expected response text" htmlFor="endpoint-content" hint="Optional substring assertion (max 512 characters).">
            <input id="endpoint-content" className="input" value={expectedContent} onChange={(event) => setExpectedContent(event.target.value)} maxLength={512} placeholder="healthy" />
          </Field>
        </div>
        <label className="check-option">
          <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
          <span>
            <strong>Include on public status</strong>
            <small>Only status, timing, uptime, and safe check history are shared.</small>
          </span>
        </label>
        {(validationError || error) && <p className="form-error" role="alert">{validationError ?? error}</p>}
      </form>
    </Modal>
  );
}
