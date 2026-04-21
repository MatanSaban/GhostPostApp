'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle, Send, X, RotateCcw } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import styles from '../page.module.css';

const BODY_LIMIT = 10_000;

function formatDateTime(dateStr, locale) {
  return new Date(dateStr).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function senderLabel(role, sender, t, currentUserId) {
  if (role === 'SYSTEM') return t('support.system');
  if (role === 'SUPERADMIN') return t('support.support');
  if (sender?.id && sender.id === currentUserId) return t('support.you');
  if (sender?.firstName || sender?.lastName) {
    return [sender.firstName, sender.lastName].filter(Boolean).join(' ');
  }
  return sender?.email || t('support.you');
}

export default function SupportThreadPage() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const params = useParams();
  const ticketId = params?.id;
  const { user } = useUser();

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const messagesEndRef = useRef(null);

  // Initial load + mark messages as read.
  useEffect(() => {
    if (!ticketId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/support/tickets/${ticketId}`);
        if (!res.ok) throw new Error('load_failed');
        const data = await res.json();
        if (cancelled) return;
        setTicket(data.ticket);
        setMessages(data.messages || []);
        // Best-effort read marker; ignore failures.
        fetch(`/api/support/tickets/${ticketId}/read`, { method: 'POST' }).catch(() => {});
      } catch (err) {
        if (!cancelled) setError(t('support.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ticketId, t]);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const isClosed = ticket?.status === 'CLOSED';
  const isResolved = ticket?.status === 'RESOLVED';
  const canReply = !!ticket && !isClosed;
  const canSendNow = canReply && reply.trim().length > 0 && !sending;

  async function handleSend(e) {
    e?.preventDefault();
    if (!canSendNow) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (!res.ok) throw new Error('reply_failed');
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setReply('');
      // Refresh ticket header (status may have flipped from RESOLVED to PENDING_ADMIN).
      const tRes = await fetch(`/api/support/tickets/${ticketId}`);
      if (tRes.ok) {
        const tData = await tRes.json();
        setTicket(tData.ticket);
      }
    } catch (err) {
      setError(t('support.replyFailed'));
    } finally {
      setSending(false);
    }
  }

  async function handleAction(action) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
      }
    } finally {
      setActionBusy(false);
    }
  }

  const orderedMessages = useMemo(() => messages, [messages]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.stateBox}>
          <Loader2 className={styles.spinner} />
          <span>{t('support.loading')}</span>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className={styles.page}>
        <div className={styles.stateBox}>
          <AlertCircle />
          <span>{error || t('support.loadFailed')}</span>
        </div>
        <Link href="/dashboard/support" className={styles.secondaryAction}>
          <ArrowLeft size={16} />
          {t('support.back')}
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.threadHeader}>
        <div className={styles.threadHeaderTop}>
          <div>
            <h1 className={styles.threadSubject}>{ticket.subject}</h1>
            <div className={styles.threadMeta}>
              <span>{t('support.ticketNumber', { number: ticket.ticketNumber })}</span>
              <span>·</span>
              <span>{t(`support.categories.${ticket.category}`)}</span>
              <span>·</span>
              <span className={`${styles.statusBadge} ${styles[`status_${ticket.status}`] || ''}`}>
                {t(`support.statuses.${ticket.status}`)}
              </span>
            </div>
          </div>
          <div className={styles.threadActions}>
            <Link href="/dashboard/support" className={styles.secondaryAction}>
              <ArrowLeft size={16} />
              {t('support.back')}
            </Link>
            {isResolved && (
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => handleAction('reopen')}
                disabled={actionBusy}
              >
                <RotateCcw size={16} />
                {t('support.reopenTicket')}
              </button>
            )}
            {!isClosed && (
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => handleAction('close')}
                disabled={actionBusy}
              >
                <X size={16} />
                {t('support.closeTicket')}
              </button>
            )}
          </div>
        </div>
      </div>

      <ul className={styles.messageList}>
        {orderedMessages.map((m) => {
          const mine = m.senderRole === 'USER' && m.sender?.id === user?.id;
          const itemClass = m.senderRole === 'USER'
            ? `${styles.messageItem} ${styles.messageItemUser}`
            : `${styles.messageItem} ${styles.messageItemAdmin}`;
          const bubbleClass = m.senderRole === 'SYSTEM'
            ? `${styles.messageBubble} ${styles.messageBubbleSystem}`
            : mine
            ? `${styles.messageBubble} ${styles.messageBubbleUser}`
            : styles.messageBubble;
          return (
            <li key={m.id} className={itemClass}>
              <div className={bubbleClass}>{m.body}</div>
              <div className={styles.messageMeta}>
                <span>{senderLabel(m.senderRole, m.sender, t, user?.id)}</span>
                <span>·</span>
                <span>{formatDateTime(m.createdAt, locale)}</span>
              </div>
            </li>
          );
        })}
        <li ref={messagesEndRef} />
      </ul>

      {isClosed ? (
        <div className={styles.helperNote}>{t('support.closedNote')}</div>
      ) : (
        <>
          {isResolved && <div className={styles.helperNote}>{t('support.resolvedNote')}</div>}
          <form className={styles.replyBox} onSubmit={handleSend}>
            <textarea
              className={styles.formTextarea}
              value={reply}
              maxLength={BODY_LIMIT}
              onChange={(e) => setReply(e.target.value)}
              placeholder={t('support.replyPlaceholder')}
              disabled={sending}
            />
            <div className={styles.replyBoxFooter}>
              <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>
                {reply.length}/{BODY_LIMIT}
              </span>
              <button
                type="submit"
                className={styles.primaryAction}
                disabled={!canSendNow}
                style={!canSendNow ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                {sending ? <Loader2 size={16} className={styles.spinner} /> : <Send size={16} />}
                {sending ? t('support.sending') : t('support.send')}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
