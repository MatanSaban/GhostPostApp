/**
 * Shared campaign lifecycle actions (activate, pause, resume).
 * Used by ContentPlannerView and SummaryStep.
 */

/**
 * Activate a campaign (DRAFT → ACTIVE).
 * Creates Content records from the generatedPlan and sets campaign to ACTIVE.
 * 
 * @param {Object} campaign - Campaign object with { id, generatedPlan, ... }
 * @param {Object} options - { translations, onSuccess?, onError? }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function activateCampaign(campaign, options = {}) {
  const { translations = {}, onSuccess, onError } = options;
  const tc = translations;

  if (!campaign.generatedPlan || !Array.isArray(campaign.generatedPlan) || campaign.generatedPlan.length === 0) {
    const error = tc.noPlan || 'Complete the AI Content Wizard first to generate a plan.';
    onError?.(error);
    return { success: false, error };
  }

  const confirmMsg = tc.activateConfirm || 'This will schedule all planned posts for AI generation and publishing. Continue?';
  if (!confirm(confirmMsg)) {
    return { success: false, error: 'cancelled' };
  }

  try {
    const res = await fetch(`/api/campaigns/${campaign.id}/activate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Activation failed');
    onSuccess?.('ACTIVE');
    return { success: true };
  } catch (err) {
    const errorMsg = err.message;
    onError?.(errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Pause a campaign (ACTIVE → PAUSED).
 * 
 * @param {Object} campaign - Campaign object with { id, ... }
 * @param {Object} options - { onSuccess?, onError? }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function pauseCampaign(campaign, options = {}) {
  const { onSuccess, onError } = options;

  try {
    const res = await fetch(`/api/campaigns/${campaign.id}/pause`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Pause failed');
    onSuccess?.('PAUSED');
    return { success: true };
  } catch (err) {
    const errorMsg = err.message;
    onError?.(errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Resume a campaign (PAUSED → ACTIVE).
 * 
 * @param {Object} campaign - Campaign object with { id, ... }
 * @param {Object} options - { onSuccess?, onError? }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function resumeCampaign(campaign, options = {}) {
  const { onSuccess, onError } = options;

  try {
    const res = await fetch(`/api/campaigns/${campaign.id}/activate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Resume failed');
    onSuccess?.('ACTIVE');
    return { success: true };
  } catch (err) {
    const errorMsg = err.message;
    onError?.(errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Get the appropriate action for a campaign based on its status.
 * 
 * @param {string} status - Campaign status ('DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED')
 * @returns {{ action: 'activate' | 'pause' | 'resume' | null, label: string, icon: 'play' | 'pause' | null }}
 */
export function getCampaignAction(status, translations = {}) {
  switch (status) {
    case 'DRAFT':
      return { action: 'activate', label: translations.activate || 'Activate', icon: 'play' };
    case 'ACTIVE':
      return { action: 'pause', label: translations.pause || 'Pause', icon: 'pause' };
    case 'PAUSED':
      return { action: 'resume', label: translations.resume || 'Resume', icon: 'play' };
    default:
      return { action: null, label: '', icon: null };
  }
}

/**
 * Execute the appropriate campaign action based on status.
 * 
 * @param {Object} campaign - Campaign object with { id, status, generatedPlan }
 * @param {Object} options - { translations?, onSuccess?, onError? }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function executeCampaignAction(campaign, options = {}) {
  const status = campaign.status;
  
  switch (status) {
    case 'DRAFT':
      return activateCampaign(campaign, options);
    case 'ACTIVE':
      return pauseCampaign(campaign, options);
    case 'PAUSED':
      return resumeCampaign(campaign, options);
    default:
      return { success: false, error: 'No action available for this status' };
  }
}
