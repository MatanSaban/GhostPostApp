'use client';

import { useReducer, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen, Hash, Calendar, FileText,
  Settings, BookOpen, Search, MessageSquare,
  Sparkles, Check, ArrowLeft, ArrowRight,
  AlertTriangle, X, Loader2, Play, Pause, Globe, Network,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { INITIAL_WIZARD_STATE, WIZARD_STEPS } from '../wizardConfig';
import { getCampaignAction, executeCampaignAction } from '../../_shared/campaignActions';
import {
  CampaignStep,
  PostCountStep,
  ScheduleStep,
  ArticleTypesStep,
  SubjectsStep,
  PillarPageStep,
  MainKeywordStep,
  PromptsStep,
  SummaryStep,
} from './steps';
import styles from '../page.module.css';

const iconMap = {
  FolderOpen, Hash, Calendar, FileText,
  Settings, BookOpen, Search, MessageSquare, Sparkles, Globe,
};

function wizardReducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD': {
      const scheduleFields = ['startDate', 'endDate', 'publishDays'];
      const planStale = scheduleFields.includes(action.field) && state.generatedPlan;
      return {
        ...state,
        [action.field]: action.value,
        ...(planStale ? { planNeedsRegeneration: true, generatedPlan: null } : {}),
      };
    }

    case 'SET_POSTS_COUNT': {
      const newCount = action.value;
      // Redistribute evenly among selected article types (default to SEO if none)
      let articleTypes = state.articleTypes.length > 0
        ? [...state.articleTypes]
        : [{ id: 'SEO', count: 0 }];
      const perType = Math.floor(newCount / articleTypes.length);
      const remainder = newCount % articleTypes.length;
      articleTypes = articleTypes.map((at, i) => ({
        ...at,
        count: perType + (i < remainder ? 1 : 0),
      }));
      return {
        ...state,
        postsCount: newCount,
        articleTypes,
        // Trim subjects if over new count
        subjects: state.subjects.slice(0, newCount),
      };
    }

    case 'NEW_CAMPAIGN':
      return {
        ...state,
        campaignId: null,
        campaignName: '',
        campaignColor: '#6366f1',
        isNewCampaign: true,
        articleTypes: [{ id: 'SEO', count: state.postsCount }],
      };

    case 'LOAD_CAMPAIGN': {
      const c = action.payload;
      return {
        ...state,
        campaignId: c.id,
        campaignName: c.name,
        campaignColor: c.color,
        campaignStatus: c.status || 'DRAFT',
        isNewCampaign: false,
        pillarPageUrl: c.pillarPageUrl || '',
        pillarEntityId: c.pillarEntityId || null,
        mainKeyword: c.mainKeyword || '',
        startDate: c.startDate ? new Date(c.startDate).toISOString().split('T')[0] : '',
        endDate: c.endDate ? new Date(c.endDate).toISOString().split('T')[0] : '',
        publishDays: c.publishDays?.length ? c.publishDays : ['sun', 'mon', 'tue', 'wed', 'thu'],
        publishTimeMode: c.publishTimeMode || 'random',
        publishTimeStart: c.publishTimeStart || '09:00',
        publishTimeEnd: c.publishTimeEnd || '18:00',
        postsCount: c.postsCount || 4,
        articleTypes: c.articleTypes || [{ id: 'SEO', count: 4 }],
        contentSettings: c.contentSettings || INITIAL_WIZARD_STATE.contentSettings,
        subjects: c.subjects || [],
        subjectSuggestions: c.subjectSuggestions || [],
        selectedKeywordIds: c.keywordIds || [],
        textPrompt: c.textPrompt || '',
        imagePrompt: c.imagePrompt || '',
        generatedPlan: c.generatedPlan || null,
        planNeedsRegeneration: false,
      };
    }

    default:
      return state;
  }
}

const stepComponents = [
  CampaignStep,       // 1
  PillarPageStep,     // 2
  MainKeywordStep,    // 3
  PostCountStep,      // 4
  ArticleTypesStep,   // 5
  SubjectsStep,       // 6
  PromptsStep,        // 7
  ScheduleStep,       // 8
  SummaryStep,        // 9
];

/**
 * Get the highest step the user has reached for a campaign.
 * Uses the persisted lastCompletedStep field.
 */
function getMaxStepFromCampaign(campaign) {
  return campaign.lastCompletedStep || 1;
}

export function WizardContent({ translations }) {
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_WIZARD_STATE);
  const [currentStep, setCurrentStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);
  const { isRtl } = useLocale();
  const { selectedSite } = useSite();

  const PrevArrow = isRtl ? ArrowRight : ArrowLeft;
  const NextArrow = isRtl ? ArrowLeft : ArrowRight;

  // Auto-load campaign from URL query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const campaignId = params.get('campaignId');
    if (!campaignId) return;

    fetch(`/api/campaigns/${campaignId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.campaign) {
          dispatch({ type: 'LOAD_CAMPAIGN', payload: data.campaign });
          setMaxStepReached(getMaxStepFromCampaign(data.campaign));
        }
      })
      .catch(() => {});
  }, []);

  // Pre-fill from a topic cluster when launched via ?clusterId=X.
  // Pulls the cluster + AI gap suggestions in parallel so step 1 lands ready
  // to go: pillar URL, anchor keyword, and seeded subjectSuggestions.
  // Skipped if ?campaignId is also present — editing-an-existing-campaign wins.
  const [clusterLoading, setClusterLoading] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clusterId = params.get('clusterId');
    if (!clusterId || params.get('campaignId')) return;

    setClusterLoading(true);
    Promise.allSettled([
      fetch(`/api/clusters/${clusterId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/clusters/${clusterId}/suggest-gaps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 8 }),
      }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([clusterRes, gapsRes]) => {
        const cluster =
          clusterRes.status === 'fulfilled' ? clusterRes.value?.cluster : null;
        if (cluster) {
          dispatch({ type: 'SET_FIELD', field: 'topicClusterId', value: cluster.id });
          dispatch({ type: 'SET_FIELD', field: 'mainKeyword', value: cluster.mainKeyword || '' });
          if (cluster.pillar?.url) {
            dispatch({ type: 'SET_FIELD', field: 'pillarPageUrl', value: cluster.pillar.url });
          }
          if (cluster.pillar?.id) {
            dispatch({ type: 'SET_FIELD', field: 'pillarEntityId', value: cluster.pillar.id });
          }
          dispatch({
            type: 'SET_FIELD',
            field: 'clusterContext',
            value: {
              name: cluster.name,
              mainKeyword: cluster.mainKeyword,
              pillarUrl: cluster.pillar?.url || null,
              pillarTitle: cluster.pillar?.title || null,
              memberCount: cluster.members?.length || 0,
            },
          });
          // Sensible default — user can override on step 1
          dispatch({ type: 'SET_FIELD', field: 'campaignName', value: cluster.name });
        }

        const gaps =
          gapsRes.status === 'fulfilled' ? gapsRes.value?.gaps || [] : [];
        if (gaps.length > 0) {
          dispatch({ type: 'SET_FIELD', field: 'subjectSuggestions', value: gaps });
        }
      })
      .finally(() => setClusterLoading(false));
  }, []);

  // Check WP connection
  const isWordpress = selectedSite?.platform === 'wordpress';
  const isConnected = selectedSite?.connectionStatus === 'CONNECTED';
  const needsWpGate = !isWordpress || !isConnected;

  const [validationPopup, setValidationPopup] = useState(null);
  const [nextLoading, setNextLoading] = useState(false);
  const [campaignActionLoading, setCampaignActionLoading] = useState(false);

  // ── Campaign start/pause action ──
  const handleCampaignAction = async () => {
    if (!state.campaignId || !state.generatedPlan) return;
    
    const campaign = {
      id: state.campaignId,
      status: state.campaignStatus,
      generatedPlan: state.generatedPlan,
    };
    
    setCampaignActionLoading(true);
    await executeCampaignAction(campaign, {
      translations: translations.campaigns || {},
      onSuccess: (newStatus) => {
        dispatch({ type: 'SET_FIELD', field: 'campaignStatus', value: newStatus });
      },
      onError: (err) => {
        if (err !== 'cancelled') alert(err);
      },
    });
    setCampaignActionLoading(false);
  };

  const handleNext = async () => {
    // Step 1 validation: must select existing or fill new campaign name
    if (currentStep === 1) {
      if (!state.isNewCampaign && !state.campaignId) {
        setValidationPopup(translations.campaign.selectOrCreateError);
        return;
      }
      if (state.isNewCampaign) {
        if (!state.campaignName.trim()) {
          setValidationPopup(translations.campaign.nameRequired);
          return;
        }
        // Create the campaign via API
        try {
          setNextLoading(true);
          const res = await fetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              siteId: selectedSite.id,
              name: state.campaignName.trim(),
              color: state.campaignColor,
              startDate: state.startDate || new Date().toISOString().split('T')[0],
              endDate: state.endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
              postsCount: state.postsCount,
              publishDays: state.publishDays,
              publishTimeMode: state.publishTimeMode,
              publishTimeStart: state.publishTimeStart,
              publishTimeEnd: state.publishTimeEnd,
              articleTypes: state.articleTypes,
              contentSettings: state.contentSettings,
              subjects: [],
              keywordIds: [],
              pillarPageUrl: state.pillarPageUrl || '',
              mainKeyword: state.mainKeyword || '',
              pillarEntityId: state.pillarEntityId || null,
              topicClusterId: state.topicClusterId || null,
              textPrompt: '',
              imagePrompt: '',
            }),
          });
          if (!res.ok) throw new Error('Failed to create campaign');
          const data = await res.json();
          dispatch({ type: 'SET_FIELD', field: 'campaignId', value: data.campaign.id });
          dispatch({ type: 'SET_FIELD', field: 'isNewCampaign', value: false });
        } catch (err) {
          console.error('Failed to create campaign:', err);
          setValidationPopup(translations.campaign.createError);
          return;
        } finally {
          setNextLoading(false);
        }
      }
    }

    // Step 2 validation: pillar page URL required
    if (currentStep === 2) {
      if (!state.pillarPageUrl?.trim()) {
        setValidationPopup(translations.pillarPage.required);
        return;
      }
    }

    // Step 3 validation: main keyword required
    if (currentStep === 3) {
      if (!state.mainKeyword?.trim()) {
        setValidationPopup(translations.mainKeyword.required);
        return;
      }
    }

    // Step 5 validation: all posts must be allocated to article types
    if (currentStep === 5) {
      const totalAllocated = state.articleTypes.reduce((sum, at) => sum + at.count, 0);
      if (totalAllocated !== state.postsCount) {
        const remaining = state.postsCount - totalAllocated;
        setValidationPopup(
          translations.articleTypes.allocationError
            .replace('{remaining}', remaining)
            .replace('{total}', state.postsCount)
        );
        return;
      }
    }

    if (currentStep < WIZARD_STEPS.length) {
      const next = currentStep + 1;
      setCurrentStep(next);
      setMaxStepReached(prev => {
        const newMax = Math.max(prev, next);
        // Persist step progress to DB
        if (state.campaignId && newMax > prev) {
          fetch(`/api/campaigns/${state.campaignId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lastCompletedStep: newMax }),
          }).catch(() => {});
        }
        return newMax;
      });
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const StepComponent = stepComponents[currentStep - 1];

  return (
    <>
      {/* WP Notice */}
      {needsWpGate && currentStep === 1 && (
        <div className={styles.wpNotice}>
          <AlertTriangle size={16} className={styles.wpNoticeIcon} />
          <span>{translations.wpRequired.description}</span>
        </div>
      )}

      {/* Cluster context banner — surfaces when wizard launched via ?clusterId= */}
      {clusterLoading && !state.clusterContext && (
        <div className={styles.clusterBanner}>
          <Loader2 size={14} className={styles.spinner} />
          <span>{translations.clusterContext?.loading || 'Loading cluster context...'}</span>
        </div>
      )}
      {state.clusterContext && (
        <div className={styles.clusterBanner}>
          <Network size={16} className={styles.clusterBannerIcon} />
          <span>
            <strong>{translations.clusterContext?.label || 'Cluster'}:</strong>{' '}
            {state.clusterContext.name}
            {state.clusterContext.memberCount > 0 && (
              <span className={styles.clusterBannerMeta}>
                {' · '}
                {state.clusterContext.memberCount}{' '}
                {translations.clusterContext?.members || 'members'}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Progress Steps */}
      <div className={styles.progressCard}>
        <div className={styles.stepsWrapper}>
          {WIZARD_STEPS.map((step, index) => {
            const StepIcon = iconMap[step.iconName];
            const isCompleted = currentStep > step.id;
            const isReachable = step.id < currentStep || step.id <= maxStepReached;
            return (
              <div key={step.id} className={styles.stepGroup}>
                <div
                  className={`${styles.stepItem} ${isReachable && step.id !== currentStep ? styles.clickable : ''}`}
                  onClick={isReachable && step.id !== currentStep ? () => setCurrentStep(step.id) : undefined}
                >
                  <div className={`${styles.stepCircle} ${
                    currentStep === step.id ? styles.active :
                    isCompleted ? styles.completed : 
                    step.id <= maxStepReached ? styles.completed : styles.pending
                  }`}>
                    {isCompleted || (step.id <= maxStepReached && step.id !== currentStep) ? (
                      <Check className={styles.stepIcon} />
                    ) : (
                      <StepIcon className={styles.stepIcon} />
                    )}
                  </div>
                  <span className={`${styles.stepName} ${
                    currentStep >= step.id ? styles.active : ''
                  }`}>
                    {translations.steps[step.key]}
                  </span>
                </div>
                {index < WIZARD_STEPS.length - 1 && (
                  <div className={`${styles.stepConnector} ${
                    isCompleted || step.id < maxStepReached ? styles.completed : ''
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className={styles.contentCard}>
        <StepComponent
          state={state}
          dispatch={dispatch}
          translations={translations}
          onLoadCampaign={(campaign) => setMaxStepReached(getMaxStepFromCampaign(campaign))}
          onResetSteps={() => setMaxStepReached(1)}
        />
      </div>

      {/* Navigation Buttons */}
      <div className={styles.navigationButtons}>
        <div className={styles.navButtonsLeft}>
          <button
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className={`${styles.navButton} ${styles.prev}`}
          >
            <PrevArrow className={styles.navIcon} />
            {translations.nav.previous}
          </button>

          {/* Campaign action button - only on final step with a plan */}
          {currentStep === WIZARD_STEPS.length && state.campaignId && state.generatedPlan && (() => {
            const actionInfo = getCampaignAction(state.campaignStatus, translations.campaigns || {});
            if (!actionInfo.action) return null;
            return (
              <button
                className={`${styles.campaignActionBtn} ${actionInfo.action === 'pause' ? styles.pauseBtn : styles.activateBtn}`}
                onClick={handleCampaignAction}
                disabled={campaignActionLoading}
                title={actionInfo.label}
              >
                {campaignActionLoading ? (
                  <Loader2 size={16} className={styles.spinner} />
                ) : actionInfo.icon === 'pause' ? (
                  <Pause size={16} />
                ) : (
                  <Play size={16} />
                )}
                <span>{actionInfo.label}</span>
              </button>
            );
          })()}
        </div>

        {currentStep < WIZARD_STEPS.length && (
          <button onClick={handleNext} disabled={nextLoading || clusterLoading} className={`${styles.navButton} ${styles.next}`}>
            {nextLoading || clusterLoading ? <Loader2 size={16} className={styles.spinner} /> : translations.nav.next}
            {!nextLoading && !clusterLoading && <NextArrow className={styles.navIcon} />}
          </button>
        )}
      </div>

      {/* Validation popup */}
      {validationPopup && createPortal(
        <div className={styles.modalOverlay} onClick={() => setValidationPopup(null)}>
          <div className={styles.validationPopup} onClick={(e) => e.stopPropagation()}>
            <button className={styles.validationPopupClose} onClick={() => setValidationPopup(null)}>
              <X size={18} />
            </button>
            <div className={styles.validationPopupIcon}>
              <AlertTriangle size={28} />
            </div>
            <p className={styles.validationPopupMessage}>{validationPopup}</p>
            <button className={styles.validationPopupBtn} onClick={() => setValidationPopup(null)}>
              {translations.articleTypes.gotIt}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
