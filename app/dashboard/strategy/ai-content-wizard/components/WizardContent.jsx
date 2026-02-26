'use client';

import { useReducer, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen, Hash, Calendar, FileText,
  Settings, BookOpen, Search, MessageSquare,
  Sparkles, Check, ArrowLeft, ArrowRight,
  AlertTriangle, X,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { INITIAL_WIZARD_STATE, WIZARD_STEPS } from '../wizardConfig';
import {
  CampaignStep,
  PostCountStep,
  ScheduleStep,
  ArticleTypesStep,
  ContentSettingsStep,
  SubjectsStep,
  KeywordsStep,
  PromptsStep,
  SummaryStep,
} from './steps';
import styles from '../page.module.css';

const iconMap = {
  FolderOpen, Hash, Calendar, FileText,
  Settings, BookOpen, Search, MessageSquare, Sparkles,
};

function wizardReducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };

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
        isNewCampaign: false,
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
        selectedKeywordIds: c.keywordIds || [],
        textPrompt: c.textPrompt || '',
        imagePrompt: c.imagePrompt || '',
        generatedPlan: null,
      };
    }

    default:
      return state;
  }
}

const stepComponents = [
  CampaignStep,       // 1
  PostCountStep,      // 2
  ScheduleStep,       // 3
  ArticleTypesStep,   // 4
  ContentSettingsStep, // 5
  KeywordsStep,       // 6
  SubjectsStep,       // 7
  PromptsStep,        // 8
  SummaryStep,        // 9
];

export function WizardContent({ translations }) {
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_WIZARD_STATE);
  const [currentStep, setCurrentStep] = useState(1);
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
        }
      })
      .catch(() => {});
  }, []);

  // Check WP connection
  const isWordpress = selectedSite?.platform === 'wordpress';
  const isConnected = selectedSite?.connectionStatus === 'CONNECTED';
  const needsWpGate = !isWordpress || !isConnected;

  const [validationPopup, setValidationPopup] = useState(null);

  const handleNext = () => {
    // Step 4 validation: all posts must be allocated to article types
    if (currentStep === 4) {
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
      setCurrentStep(currentStep + 1);
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

      {/* Progress Steps */}
      <div className={styles.progressCard}>
        <div className={styles.stepsWrapper}>
          {WIZARD_STEPS.map((step, index) => {
            const StepIcon = iconMap[step.iconName];
            return (
              <div key={step.id} className={styles.stepGroup}>
                <div className={styles.stepItem}>
                  <div className={`${styles.stepCircle} ${
                    currentStep === step.id ? styles.active :
                    currentStep > step.id ? styles.completed : styles.pending
                  }`}>
                    {currentStep > step.id ? (
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
                    currentStep > step.id ? styles.completed : ''
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
        />
      </div>

      {/* Navigation Buttons */}
      <div className={styles.navigationButtons}>
        <button
          onClick={handlePrevious}
          disabled={currentStep === 1}
          className={`${styles.navButton} ${styles.prev}`}
        >
          <PrevArrow className={styles.navIcon} />
          {translations.nav.previous}
        </button>

        {currentStep < WIZARD_STEPS.length && (
          <button onClick={handleNext} className={`${styles.navButton} ${styles.next}`}>
            {translations.nav.next}
            <NextArrow className={styles.navIcon} />
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
