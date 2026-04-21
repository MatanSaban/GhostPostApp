'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LifeBuoy, Loader2, ArrowLeft } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../page.module.css';

const CATEGORIES = ['GENERAL', 'TECHNICAL', 'BUG', 'FEATURE_REQUEST', 'BILLING'];
const SUBJECT_LIMIT = 200;
const BODY_LIMIT = 10_000;

export default function NewSupportTicketPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!subject.trim() || !body.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), category }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'create_failed');
      }
      const data = await res.json();
      router.push(`/dashboard/support/${data.ticket.id}`);
    } catch (err) {
      setError(t('support.createFailed'));
      setSubmitting(false);
    }
  }

  const canSubmit = subject.trim().length > 0 && body.trim().length > 0 && !submitting;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <LifeBuoy />
          </div>
          <div>
            <h1 className={styles.pageTitle}>{t('support.newTicket')}</h1>
            <p className={styles.pageSubtitle}>{t('support.subtitle')}</p>
          </div>
        </div>
        <Link href="/dashboard/support" className={styles.secondaryAction}>
          <ArrowLeft size={16} />
          {t('support.back')}
        </Link>
      </div>

      <form className={styles.formCard} onSubmit={handleSubmit}>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="ticket-category">
            {t('support.category')}
          </label>
          <select
            id="ticket-category"
            className={styles.formSelect}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={submitting}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`support.categories.${c}`)}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="ticket-subject">
            {t('support.subject')}
          </label>
          <input
            id="ticket-subject"
            type="text"
            className={styles.formInput}
            value={subject}
            maxLength={SUBJECT_LIMIT}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('support.subjectPlaceholder')}
            disabled={submitting}
            required
          />
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="ticket-body">
            {t('support.body')}
          </label>
          <textarea
            id="ticket-body"
            className={styles.formTextarea}
            value={body}
            maxLength={BODY_LIMIT}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('support.bodyPlaceholder')}
            disabled={submitting}
            required
          />
        </div>

        {error && <div className={styles.formError}>{error}</div>}

        <div className={styles.formActions}>
          <Link href="/dashboard/support" className={styles.secondaryAction}>
            {t('support.back')}
          </Link>
          <button
            type="submit"
            className={styles.primaryAction}
            disabled={!canSubmit}
            style={!canSubmit ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            {submitting && <Loader2 size={16} className={styles.spinner} />}
            {submitting ? t('support.sending') : t('support.send')}
          </button>
        </div>
      </form>
    </div>
  );
}
