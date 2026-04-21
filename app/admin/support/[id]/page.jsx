'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Send,
  Lock,
  X,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../support.module.css';

const BODY_LIMIT = 10_000;
const STATUS_OPTIONS = ['OPEN', 'PENDING_ADMIN', 'PENDING_USER', 'RESOLVED', 'CLOSED'];
const PRIORITY_OPTIONS = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const CATEGORY_OPTIONS = ['BILLING', 'TECHNICAL', 'BUG', 'FEATURE_REQUEST', 'GENERAL'];

function formatDateTime(dateStr, locale) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function senderName(sender) {
  if (!sender) return '';
  return [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.email || '';
}

export default function AdminSupportThreadPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const params = useParams();
  const ticketId = params?.id;

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingField, setSavingField] = useState(null);
  const messagesEndRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}`);
      if (!res.ok) throw new Error('load_failed');
      const data = await res.json();
      setTicket(data.ticket);
      setMessages(data.messages || []);
      // Mark as read by admin (best-effort).
      fetch(`/api/admin/support/tickets/${ticketId}/read`, { method: 'POST' }).catch(() => {});
    } catch (err) {
      setError(t('support.admin.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [ticketId, t]);

  useEffect(() => {
    if (ticketId) load();
  }, [ticketId, load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  async function handleSend(e) {
    e?.preventDefault();
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, isInternal }),
      });
      if (!res.ok) throw new Error('reply_failed');
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setReply('');
      // Refresh ticket header (status / assignee may have changed).
      const tRes = await fetch(`/api/admin/support/tickets/${ticketId}`);
      if (tRes.ok) {
        const tData = await tRes.json();
        setTicket(tData.ticket);
      }
    } catch (err) {
      setError(t('support.admin.replyFailed'));
    } finally {
      setSending(false);
    }
  }

  async function patchTicket(payload, fieldKey) {
    setSavingField(fieldKey);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
      }
    } finally {
      setSavingField(null);
    }
  }

  if (loading) {
    return (
      <div className={styles.adminPage}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem' }}>
          <Loader2 className={styles.spinner} />
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className={styles.adminPage}>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
          <AlertCircle size={32} />
          <p>{error || t('support.admin.notFound')}</p>
          <Link href="/admin/support" className={styles.backLink}>
            <ArrowLeft size={14} />
            {t('support.back')}
          </Link>
        </div>
      </div>
    );
  }

  const isClosed = ticket.status === 'CLOSED';

  return (
    <div className={styles.adminPage}>
      <div className={styles.adminHeader}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 className={styles.adminTitle}>{ticket.subject}</h1>
            <div className={styles.threadMeta}>
              <span className={styles.ticketNumber}>#{ticket.ticketNumber}</span>
              <span>·</span>
              <span>{ticket.account?.name || '-'}</span>
              <span>·</span>
              <span>{t(`support.categories.${ticket.category}`)}</span>
              <span>·</span>
              <span className={`${styles.statusChip} ${styles[`status_${ticket.status}`] || ''}`}>
                {t(`support.statuses.${ticket.status}`)}
              </span>
              <span className={`${styles.priorityChip} ${styles[`priority_${ticket.priority}`] || ''}`}>
                {t(`support.priorities.${ticket.priority}`)}
              </span>
            </div>
          </div>
          <Link href="/admin/support" className={styles.backLink}>
            <ArrowLeft size={14} />
            {t('support.back')}
          </Link>
        </div>
      </div>

      <div className={styles.threadGrid}>
        <div className={styles.threadMain}>
          <div className={styles.threadCard}>
            <ul className={styles.messageList}>
              {messages.map((m) => {
                const isAdmin = m.senderRole === 'SUPERADMIN';
                const isSystem = m.senderRole === 'SYSTEM';
                let itemClass = styles.messageItem;
                if (isSystem) itemClass += ` ${styles.messageItemSystem}`;
                else if (isAdmin) itemClass += ` ${styles.messageItemAdmin}`;
                else itemClass += ` ${styles.messageItemUser}`;

                let bubbleClass = styles.messageBubble;
                if (isSystem) bubbleClass += ` ${styles.messageBubbleSystem}`;
                else if (m.isInternal) bubbleClass += ` ${styles.messageBubbleInternal}`;
                else if (isAdmin) bubbleClass += ` ${styles.messageBubbleAdmin}`;

                return (
                  <li key={m.id} className={itemClass}>
                    <div className={bubbleClass}>{m.body}</div>
                    <div className={styles.messageMeta}>
                      {m.isInternal && (
                        <>
                          <span className={styles.internalTag}>
                            <Lock size={10} style={{ verticalAlign: '-1px', marginInlineEnd: 2 }} />
                            {t('support.admin.internalNote')}
                          </span>
                          <span>·</span>
                        </>
                      )}
                      <span>
                        {isSystem
                          ? t('support.system')
                          : isAdmin
                          ? `${t('support.support')} (${senderName(m.sender)})`
                          : senderName(m.sender) || t('support.you')}
                      </span>
                      <span>·</span>
                      <span>{formatDateTime(m.createdAt, locale)}</span>
                    </div>
                  </li>
                );
              })}
              <li ref={messagesEndRef} />
            </ul>

            {isClosed ? (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--muted)', borderRadius: 8, color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                {t('support.admin.closedReplyNote')}
              </div>
            ) : null}

            <form className={styles.replyBox} onSubmit={handleSend}>
              <textarea
                className={styles.replyTextarea}
                value={reply}
                maxLength={BODY_LIMIT}
                placeholder={isInternal ? t('support.admin.internalPlaceholder') : t('support.admin.replyPlaceholder')}
                onChange={(e) => setReply(e.target.value)}
                disabled={sending}
              />
              <div className={styles.replyFooter}>
                <label className={styles.toggleRow}>
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    disabled={sending}
                  />
                  <Lock size={12} />
                  {t('support.admin.internalToggle')}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className={styles.charCount}>{reply.length}/{BODY_LIMIT}</span>
                  <button
                    type="submit"
                    className={`${styles.sidebarActionBtn} ${styles.sidebarActionBtnPrimary}`}
                    disabled={!reply.trim() || sending}
                    style={!reply.trim() || sending ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  >
                    {sending ? <Loader2 size={14} className={styles.spinner} /> : <Send size={14} />}
                    {sending ? t('support.sending') : isInternal ? t('support.admin.saveNote') : t('support.send')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <h3 className={styles.sidebarTitle}>{t('support.admin.fields')}</h3>
            <div className={styles.sidebarFieldGroup}>
              <div>
                <div className={styles.sidebarFieldLabel}>{t('support.admin.columns.status')}</div>
                <select
                  className={styles.sidebarSelect}
                  value={ticket.status}
                  onChange={(e) => patchTicket({ status: e.target.value }, 'status')}
                  disabled={savingField === 'status'}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{t(`support.statuses.${s}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className={styles.sidebarFieldLabel}>{t('support.admin.columns.priority')}</div>
                <select
                  className={styles.sidebarSelect}
                  value={ticket.priority}
                  onChange={(e) => patchTicket({ priority: e.target.value }, 'priority')}
                  disabled={savingField === 'priority'}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>{t(`support.priorities.${p}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className={styles.sidebarFieldLabel}>{t('support.admin.columns.category')}</div>
                <select
                  className={styles.sidebarSelect}
                  value={ticket.category}
                  onChange={(e) => patchTicket({ category: e.target.value }, 'category')}
                  disabled={savingField === 'category'}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{t(`support.categories.${c}`)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className={styles.sidebarCard}>
            <h3 className={styles.sidebarTitle}>{t('support.admin.actions')}</h3>
            <div className={styles.sidebarActions}>
              {ticket.status !== 'RESOLVED' && (
                <button type="button" className={styles.sidebarActionBtn} onClick={() => patchTicket({ action: 'resolve' }, 'action')} disabled={savingField === 'action'}>
                  <CheckCircle2 size={14} />
                  {t('support.admin.markResolved')}
                </button>
              )}
              {!isClosed && (
                <button type="button" className={styles.sidebarActionBtn} onClick={() => patchTicket({ action: 'close' }, 'action')} disabled={savingField === 'action'}>
                  <X size={14} />
                  {t('support.closeTicket')}
                </button>
              )}
              {(ticket.status === 'RESOLVED' || isClosed) && (
                <button type="button" className={styles.sidebarActionBtn} onClick={() => patchTicket({ action: 'reopen' }, 'action')} disabled={savingField === 'action'}>
                  <RotateCcw size={14} />
                  {t('support.reopenTicket')}
                </button>
              )}
            </div>
          </div>

          <div className={styles.sidebarCard}>
            <h3 className={styles.sidebarTitle}>{t('support.admin.account')}</h3>
            <div className={styles.sidebarRow}>
              <span className={styles.sidebarLabel}>{t('support.admin.accountName')}</span>
              <span className={styles.sidebarValue}>{ticket.account?.name || '-'}</span>
            </div>
            <div className={styles.sidebarRow}>
              <span className={styles.sidebarLabel}>{t('support.admin.openedBy')}</span>
              <span className={styles.sidebarValue}>{senderName(ticket.createdBy) || '-'}</span>
            </div>
            <div className={styles.sidebarRow}>
              <span className={styles.sidebarLabel}>{t('support.admin.userEmail')}</span>
              <span className={styles.sidebarValue}>{ticket.createdBy?.email || '-'}</span>
            </div>
            <div className={styles.sidebarRow}>
              <span className={styles.sidebarLabel}>{t('support.admin.assigned')}</span>
              <span className={styles.sidebarValue}>{senderName(ticket.assignedAdmin) || t('support.admin.unassigned')}</span>
            </div>
            <div className={styles.sidebarRow}>
              <span className={styles.sidebarLabel}>{t('support.admin.created')}</span>
              <span className={styles.sidebarValue}>{formatDateTime(ticket.createdAt, locale)}</span>
            </div>
            <div className={styles.sidebarRow}>
              <span className={styles.sidebarLabel}>{t('support.admin.lastActivity')}</span>
              <span className={styles.sidebarValue}>{formatDateTime(ticket.lastMessageAt, locale)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
