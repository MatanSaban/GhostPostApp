'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Mail, Plus, Trash2, Send, Check, Languages } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './RecipientsModal.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * RecipientsModal — manages a report's recipient list.
 *
 * Two modes:
 *   • mode="edit" — opened from clicking the recipients cell. Just lets
 *     the user add/edit/remove emails. Save → PATCH /api/reports/[id]
 *     and close.
 *   • mode="send" — opened from the Send button when the report has no
 *     recipients yet. The user picks recipients + the email/PDF language,
 *     then "Save & Send" persists the recipients on the report (so the
 *     row updates) and POSTs /api/reports/send with that language.
 *
 * Both modes manage emails as an array internally; the parent passes in
 * the report id + initial recipient list via `report`.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {'edit'|'send'} props.mode
 * @param {Object} props.report - { id, recipients, locale }
 * @param {(updated: object) => void} [props.onSaved] - Receives updated report row.
 */
export function RecipientsModal({ isOpen, onClose, mode = 'edit', report, onSaved }) {
  const { t, locale } = useLocale();

  const [emails, setEmails] = useState([]);
  const [draft, setDraft] = useState('');
  const [emailLanguage, setEmailLanguage] = useState(locale || 'en');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setEmails(Array.isArray(report?.recipients) ? [...report.recipients] : []);
    setDraft('');
    setEmailLanguage(report?.locale || locale || 'en');
    setError('');
    setIsSaving(false);
  }, [isOpen, report?.id, report?.recipients, report?.locale, locale]);

  const addEmail = () => {
    const value = draft.trim();
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      setError(t('settings.clientReportingSection.recipientsModal.invalidEmail') || 'Please enter a valid email address.');
      return;
    }
    if (emails.includes(value)) {
      setError(t('settings.clientReportingSection.recipientsModal.duplicate') || 'That email is already in the list.');
      return;
    }
    setEmails((prev) => [...prev, value]);
    setDraft('');
    setError('');
  };

  const removeEmail = (email) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  };

  const handleKeyDown = (e) => {
    // Enter / comma → commit current input as a chip. Pasting "a,b,c"
    // shouldn't get auto-split mid-paste, so we only fire on the key
    // up — paste handling could be a separate refinement.
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail();
    }
  };

  const handlePaste = (e) => {
    // Paste "a@b.com, c@d.com\nx@y.com" → add each as a chip.
    const pasted = e.clipboardData.getData('text');
    if (!pasted || !/[,\n;]/.test(pasted)) return;
    e.preventDefault();
    const parts = pasted.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean);
    const valid = [];
    for (const p of parts) {
      if (EMAIL_RE.test(p) && !emails.includes(p) && !valid.includes(p)) valid.push(p);
    }
    setEmails((prev) => [...prev, ...valid]);
    setDraft('');
    setError('');
  };

  const handleSave = async () => {
    if (!report?.id) return;
    // Make sure any in-progress draft gets committed before saving so the
    // user doesn't lose the email they just typed.
    const stagedEmails = (() => {
      const value = draft.trim();
      if (!value) return emails;
      if (!EMAIL_RE.test(value) || emails.includes(value)) return emails;
      return [...emails, value];
    })();

    setIsSaving(true);
    setError('');
    try {
      // Persist the recipient list (and locale on send mode) on the
      // report. PATCH responds with the updated row which we hand to
      // the parent so it can replace the row in-place without refetching.
      const patchBody = { recipients: stagedEmails };
      if (mode === 'send') patchBody.locale = emailLanguage;

      const res = await fetch(`/api/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save recipients');
      }
      const { report: updated } = await res.json();

      if (mode === 'send') {
        if (stagedEmails.length === 0) {
          throw new Error(t('settings.clientReportingSection.recipientsModal.noRecipientsError') || 'Add at least one recipient.');
        }
        const sendRes = await fetch('/api/reports/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId: report.id,
            recipients: stagedEmails,
            locale: emailLanguage,
          }),
        });
        if (!sendRes.ok) {
          const err = await sendRes.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to send report');
        }
      }

      onSaved?.(updated);
      onClose();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !report) return null;
  if (typeof document === 'undefined') return null;

  const titleKey = mode === 'send'
    ? 'settings.clientReportingSection.recipientsModal.titleSend'
    : 'settings.clientReportingSection.recipientsModal.titleEdit';
  const descriptionKey = mode === 'send'
    ? 'settings.clientReportingSection.recipientsModal.descriptionSend'
    : 'settings.clientReportingSection.recipientsModal.descriptionEdit';
  const submitKey = mode === 'send'
    ? 'settings.clientReportingSection.recipientsModal.saveAndSend'
    : 'settings.clientReportingSection.recipientsModal.save';

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h3 className={styles.title}>
            {mode === 'send' ? <Send size={16} /> : <Mail size={16} />}
            {t(titleKey) || (mode === 'send' ? 'Send report' : 'Recipients')}
          </h3>
          <button className={styles.iconBtn} onClick={onClose} aria-label={t('common.close') || 'Close'}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.description}>
            {t(descriptionKey) || (mode === 'send'
              ? 'Add recipients and pick the language to send the report in. The recipients will be saved to this report.'
              : 'Add, edit, or remove recipient emails for this report.')}
          </p>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <Mail size={12} />
              {t('settings.clientReportingSection.recipientsModal.recipients') || 'Recipients'}
            </label>
            {emails.length > 0 && (
              <ul className={styles.chipList}>
                {emails.map((email) => (
                  <li key={email} className={styles.chip}>
                    <span>{email}</span>
                    <button
                      type="button"
                      className={styles.chipRemove}
                      onClick={() => removeEmail(email)}
                      aria-label={t('common.delete') || 'Remove'}
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.inputRow}>
              <input
                type="email"
                className={styles.input}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setError(''); }}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t('settings.clientReportingSection.recipientsModal.placeholder') || 'name@example.com'}
              />
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={addEmail}
                disabled={!draft.trim()}
              >
                <Plus size={14} />
                {t('common.add') || 'Add'}
              </button>
            </div>
            <p className={styles.formHint}>
              {t('settings.clientReportingSection.recipientsModal.hint') || 'Press Enter, comma, or paste a list to add multiple at once.'}
            </p>
          </div>

          {mode === 'send' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <Languages size={12} />
                {t('settings.clientReportingSection.recipientsModal.emailLanguage') || 'Language'}
              </label>
              <select
                className={styles.input}
                value={emailLanguage}
                onChange={(e) => setEmailLanguage(e.target.value)}
              >
                <option value="en">English</option>
                <option value="he">עברית</option>
              </select>
              <p className={styles.formHint}>
                {t('settings.clientReportingSection.recipientsModal.emailLanguageHint') || 'The PDF and the email body will be sent in the selected language.'}
              </p>
            </div>
          )}

          {error && <p className={styles.formError}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={isSaving}>
            {t('common.cancel') || 'Cancel'}
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSave}
            disabled={isSaving || (mode === 'send' && emails.length === 0 && !draft.trim())}
          >
            {isSaving ? (
              <Loader2 size={14} className={styles.spinningIcon} />
            ) : mode === 'send' ? (
              <Send size={14} />
            ) : (
              <Check size={14} />
            )}
            {t(submitKey) || (mode === 'send' ? 'Save & send' : 'Save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
