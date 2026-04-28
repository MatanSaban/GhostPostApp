'use client';

// Toggle for browser web-push subscription. Renders as a single banner
// row on the notifications page. Handles four states: unsupported,
// blocked (permission === 'denied'), subscribed, and not-yet-subscribed.
//
// Subscribe flow:
//   1. Wait for the service worker to be `ready`.
//   2. pushManager.subscribe({ userVisibleOnly, applicationServerKey })
//   3. POST the subscription JSON to /api/push/subscribe.
//
// Unsubscribe:
//   1. pushManager.getSubscription()
//   2. POST { endpoint } to /api/push/unsubscribe
//   3. subscription.unsubscribe()

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2, ShieldAlert } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

const STATE = {
  CHECKING: 'checking',
  UNSUPPORTED: 'unsupported',
  BLOCKED: 'blocked',
  SUBSCRIBED: 'subscribed',
  AVAILABLE: 'available',
};

export default function PushSubscribeButton() {
  const { t } = useLocale();
  const [state, setState] = useState(STATE.CHECKING);
  const [busy, setBusy] = useState(false);

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  // Initial state probe — read permission and any existing subscription.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupported) {
        setState(STATE.UNSUPPORTED);
        return;
      }
      if (Notification.permission === 'denied') {
        setState(STATE.BLOCKED);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        setState(sub ? STATE.SUBSCRIBED : STATE.AVAILABLE);
      } catch {
        if (!cancelled) setState(STATE.AVAILABLE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  async function subscribe() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? STATE.BLOCKED : STATE.AVAILABLE);
        return;
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY missing');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState(STATE.SUBSCRIBED);
    } catch (err) {
      console.error('[push] subscribe failed:', err);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState(STATE.AVAILABLE);
    } catch (err) {
      console.error('[push] unsubscribe failed:', err);
    } finally {
      setBusy(false);
    }
  }

  if (state === STATE.CHECKING) return null;

  const baseStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
    padding: '0.875rem 1rem',
    margin: '0 0 1rem 0',
    borderRadius: 'var(--radius-lg, 0.75rem)',
    border: '1px solid var(--border, #E9E8F0)',
    background: 'var(--card, #FFFFFF)',
  };

  const buttonStyle = {
    marginInlineStart: 'auto',
    padding: '0.5rem 0.875rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    borderRadius: 'var(--radius-md, 0.5rem)',
    border: 'none',
    cursor: busy ? 'wait' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
  };

  const textStyle = { display: 'flex', flexDirection: 'column', gap: '0.125rem' };
  const titleStyle = { fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary, #111827)' };
  const subtitleStyle = { fontSize: '0.75rem', color: 'var(--text-secondary, #6B7280)' };

  if (state === STATE.UNSUPPORTED) {
    return (
      <div style={baseStyle}>
        <BellOff size={20} color="var(--text-tertiary, #9CA3AF)" />
        <div style={textStyle}>
          <span style={titleStyle}>{t('notifications.pushPrompt.unsupported')}</span>
        </div>
      </div>
    );
  }

  if (state === STATE.BLOCKED) {
    return (
      <div style={baseStyle}>
        <ShieldAlert size={20} color="var(--warning, #F59E0B)" />
        <div style={textStyle}>
          <span style={titleStyle}>{t('notifications.pushPrompt.blocked')}</span>
        </div>
      </div>
    );
  }

  const subscribed = state === STATE.SUBSCRIBED;
  return (
    <div style={baseStyle}>
      {subscribed ? (
        <BellRing size={20} color="var(--brand-primary, #7C3AED)" />
      ) : (
        <Bell size={20} color="var(--brand-primary, #7C3AED)" />
      )}
      <div style={textStyle}>
        <span style={titleStyle}>
          {t(subscribed ? 'notifications.pushPrompt.enabled' : 'notifications.pushPrompt.enable')}
        </span>
        <span style={subtitleStyle}>{t('notifications.pushPrompt.description')}</span>
      </div>
      <button
        type="button"
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={busy}
        style={{
          ...buttonStyle,
          background: subscribed ? 'var(--muted, #F3F2FA)' : 'var(--brand-primary, #7C3AED)',
          color: subscribed ? 'var(--text-primary, #111827)' : '#FFFFFF',
        }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        {t(subscribed ? 'notifications.pushPrompt.disable' : 'notifications.pushPrompt.enable')}
      </button>
    </div>
  );
}
