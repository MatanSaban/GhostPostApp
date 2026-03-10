'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Plus, Trash2, Loader2, AlertTriangle, X } from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import CampaignForm from '../../../_shared/CampaignForm';
import styles from '../../page.module.css';

export default function CampaignStep({ state, dispatch, translations, onLoadCampaign, onResetSteps }) {
  const t = translations.campaign;
  const { selectedSite } = useSite();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    if (!selectedSite?.id) return;
    fetchCampaigns();
  }, [selectedSite?.id]);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/campaigns?siteId=${selectedSite.id}`);
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCampaign = (campaign) => {
    dispatch({ type: 'LOAD_CAMPAIGN', payload: campaign });
    onLoadCampaign?.(campaign);
  };

  const handleCreateNew = () => {
    dispatch({ type: 'NEW_CAMPAIGN' });
    onResetSteps?.();
  };

  const handleDeleteCampaign = async (campaignId) => {
    try {
      await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
      setCampaigns(prev => prev.filter(c => c.id !== campaignId));
      setDeleteConfirm(null);
      if (state.campaignId === campaignId) {
        dispatch({ type: 'NEW_CAMPAIGN' });
      }
    } catch (err) {
      console.error('Failed to delete campaign:', err);
    }
  };

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrapper}>
          <FolderOpen className={styles.stepHeaderIcon} />
        </div>
        <div className={styles.stepInfo}>
          <h2 className={styles.stepTitle}>{t.title}</h2>
          <p className={styles.stepDescription}>{t.description}</p>
        </div>
      </div>

      {/* Create New / Toggle */}
      <div className={styles.campaignToggle}>
        <button
          className={`${styles.campaignToggleBtn} ${state.isNewCampaign ? styles.active : ''}`}
          onClick={handleCreateNew}
        >
          <Plus size={16} />
          {t.createNew}
        </button>
        <button
          className={`${styles.campaignToggleBtn} ${!state.isNewCampaign ? styles.active : ''}`}
          onClick={() => dispatch({ type: 'SET_FIELD', field: 'isNewCampaign', value: false })}
          disabled={loading || campaigns.length === 0}
        >
          {loading ? <Loader2 size={16} className={styles.spinner} /> : <FolderOpen size={16} />}
          {t.selectExisting}
        </button>
      </div>

      {state.isNewCampaign ? (
        <div className={styles.newCampaignForm}>
          <CampaignForm
            name={state.campaignName}
            onNameChange={(value) => dispatch({ type: 'SET_FIELD', field: 'campaignName', value })}
            color={state.campaignColor}
            onColorChange={(value) => dispatch({ type: 'SET_FIELD', field: 'campaignColor', value })}
            translations={t}
          />
        </div>
      ) : (
        <div className={styles.campaignList}>
          <h3 className={styles.campaignListTitle}>{t.existingCampaigns}</h3>
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 className={styles.spinner} size={24} />
            </div>
          ) : campaigns.length === 0 ? (
            <p className={styles.emptyCampaigns}>{t.noCampaigns}</p>
          ) : (
            campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className={`${styles.campaignCard} ${state.campaignId === campaign.id ? styles.selected : ''}`}
                onClick={() => handleSelectCampaign(campaign)}
              >
                <div className={styles.campaignCardColor} style={{ backgroundColor: campaign.color }} />
                <div className={styles.campaignCardInfo}>
                  <span className={styles.campaignCardName}>{campaign.name}</span>
                  <span className={styles.campaignCardMeta}>
                    {campaign._count?.contents || campaign.subjects?.length || 0} {translations.articleTypes.postsOfType}
                  </span>
                </div>
                <button
                  className={styles.campaignCardDelete}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(campaign.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Delete confirmation popup */}
      {deleteConfirm && createPortal(
        <div className={styles.modalOverlay} onClick={() => setDeleteConfirm(null)}>
          <div className={styles.validationPopup} onClick={(e) => e.stopPropagation()}>
            <button className={styles.validationPopupClose} onClick={() => setDeleteConfirm(null)}>
              <X size={18} />
            </button>
            <div className={styles.validationPopupIcon}>
              <AlertTriangle size={28} />
            </div>
            <p className={styles.validationPopupMessage}>{t.deleteConfirm}</p>
            <div className={styles.deletePopupActions}>
              <button
                className={styles.deletePopupConfirm}
                onClick={() => handleDeleteCampaign(deleteConfirm)}
              >
                {t.deleteCampaign}
              </button>
              <button
                className={styles.deletePopupCancel}
                onClick={() => setDeleteConfirm(null)}
              >
                {t.cancelDelete}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
