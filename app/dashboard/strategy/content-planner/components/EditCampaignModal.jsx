'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader2, Trash2 } from 'lucide-react';
import CampaignForm, { CAMPAIGN_COLORS } from '../../_shared/CampaignForm';
import { Button } from '@/app/dashboard/components';
import styles from '../page.module.css';

export default function EditCampaignModal({ campaign, translations, onClose, onUpdated, onDeleted, canDelete = true }) {
  const t = translations;
  const [name, setName] = useState(campaign.name);
  const [color, setColor] = useState(campaign.color || CAMPAIGN_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t.updateError || 'Failed to update campaign');
      }

      const data = await res.json();
      onUpdated?.(data.campaign);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');

    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t.deleteError || 'Failed to delete campaign');
      }
      onDeleted?.(campaign.id, data.deletedContentIds || []);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t.title}</h2>
          <Button variant="ghost" iconOnly onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
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

            {/* Delete section */}
            {canDelete && (
              <div className={styles.formGroup}>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={14} />
                    {t.delete}
                  </button>
                ) : (
                  <div className={styles.deleteConfirm}>
                    <p className={styles.deleteConfirmText}>{t.deleteConfirm}</p>
                    <div className={styles.deleteConfirmActions}>
                      <Button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                      >
                        {t.cancel}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={handleDelete}
                        disabled={deleting}
                      >
                        {deleting ? <Loader2 size={14} className={styles.spinner} /> : <Trash2 size={14} />}
                        {t.confirmDelete}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={styles.modalFooter}>
            <Button type="button" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={!name.trim() || saving}>
              {saving ? <Loader2 size={16} className={styles.spinner} /> : <Save size={16} />}
              {t.save}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
