'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderPlus, Loader2 } from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import CampaignForm, { CAMPAIGN_COLORS } from '../../_shared/CampaignForm';
import styles from '../page.module.css';

export default function CreateCampaignModal({ translations, onClose, onCreated }) {
  const t = translations;
  const { selectedSite } = useSite();
  const [name, setName] = useState('');
  const [color, setColor] = useState(CAMPAIGN_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite.id,
          name: name.trim(),
          color,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          postsCount: 1,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create campaign');
      }

      const data = await res.json();
      onCreated?.(data.campaign);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t.title}</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
          <div className={styles.modalBody}>
            {error && <div className={styles.errorMessage}>{error}</div>}

            <CampaignForm
              name={name}
              onNameChange={setName}
              color={color}
              onColorChange={setColor}
              translations={t}
              autoFocus
            />
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              {t.cancel}
            </button>
            <button type="submit" className={styles.primaryButton} disabled={!name.trim() || saving}>
              {saving ? <Loader2 size={16} className={styles.spinner} /> : <FolderPlus size={16} />}
              {t.create}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
