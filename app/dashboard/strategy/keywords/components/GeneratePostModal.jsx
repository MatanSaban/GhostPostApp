'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  X, Sparkles, Calendar, FileText, Image as ImageIcon,
  MessageSquare, ChevronRight, ChevronLeft, Loader2, Check,
  AlignLeft, Clock, Send, Save, Eye, Edit3,
  Info, Navigation, ShoppingCart, DollarSign, Wand2,
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link as LinkIcon, Unlink,
  Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, ChevronDown,
  GripVertical, CornerDownLeft, Maximize2, Minimize2, Search, Tags, Globe,
  Download, CheckCircle, AlertTriangle, Plug
} from 'lucide-react';
import TiptapImage from '@tiptap/extension-image';
import { useTranslation } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { ARTICLE_TYPES, ARTICLE_TYPE_KEY_MAP } from '../../ai-content-wizard/wizardConfig';
import styles from './GeneratePostModal.module.css';

// Progress messages for generation phases
const PROGRESS_MESSAGES = [
  'analyzingKeyword',
  'researchingTopic',
  'craftingOutline',
  'writingIntroduction',
  'generatingContent',
  'addingDetails',
  'optimizingSEO',
  'finalizingPost',
];

// Map intent to recommended article types
const INTENT_TO_ARTICLE_TYPES = {
  INFORMATIONAL: ['GUIDE', 'HOW_TO', 'TUTORIAL', 'BLOG_POST'],
  NAVIGATIONAL: ['SEO', 'BLOG_POST'],
  TRANSACTIONAL: ['REVIEW', 'LISTICLE', 'SEO'],
  COMMERCIAL: ['COMPARISON', 'REVIEW', 'LISTICLE', 'SEO'],
};

// Writing style options
const WRITING_STYLES = [
  'professional',
  'casual',
  'technical',
  'conversational',
  'formal',
  'friendly',
  'authoritative',
  'educational',
  'persuasive',
  'storytelling',
];

// Steps for the wizard
const STEPS = {
  SETTINGS: 'settings',
  KEYWORDS: 'keywords',
  SUMMARY: 'summary',
  PREVIEW: 'preview',
};

export default function GeneratePostModal({ isOpen, onClose, keyword, onSuccess }) {
  const { t, locale } = useTranslation();
  const { selectedSite, refreshSites } = useSite();
  
  // Current step
  const [currentStep, setCurrentStep] = useState(STEPS.SETTINGS);
  
  // Form state
  const [formData, setFormData] = useState({
    writingStyle: '',
    publishMode: 'publish', // 'publish' or 'schedule'
    scheduleDate: '',
    scheduleTime: '10:00',
    wordCount: 1500,
    featuredImage: true,
    contentImages: true,
    contentImagesCount: 2,
    intent: '',
    articleType: '',
    contentPrompt: '',
    featuredImagePrompt: '',
    contentImagesPrompt: '',
    additionalKeywords: [],
  });
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(null); // field being regenerated
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState('');
  const [progressMessageIndex, setProgressMessageIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  
  // Modal size state
  const [isMaximized, setIsMaximized] = useState(false);
  
  // WordPress plugin setup state
  const [wpPluginStatus, setWpPluginStatus] = useState('idle'); // idle, downloaded, checking, connected, error
  const [showPluginStep, setShowPluginStep] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // null, 'save', 'publish', 'schedule'
  const wpPluginPollRef = useRef(null);
  
  // Site interview data for defaults
  const [siteDefaults, setSiteDefaults] = useState(null);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(true);
  
  // AI article type suggestion
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  
  // Fetch AI suggestion (reusable for initial load and reanalyze)
  const fetchAiSuggestion = useCallback(async (keywordId, intent, { force = false } = {}) => {
    setIsLoadingSuggestion(true);
    try {
      const res = await fetch(`/api/keywords/${keywordId}/suggest-article-type`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, locale, force }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiSuggestion(data.suggestion);
        
        // Auto-apply the AI suggestion
        const suggestedType = data.suggestion?.articleType;
        if (suggestedType) {
          const suggestedTypeDef = ARTICLE_TYPES.find(at => at.id === suggestedType);
          setFormData(prev => ({
            ...prev,
            articleType: suggestedType,
            wordCount: suggestedTypeDef
              ? Math.floor((suggestedTypeDef.minWords + suggestedTypeDef.maxWords) / 2)
              : prev.wordCount,
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching AI suggestion:', err);
    } finally {
      setIsLoadingSuggestion(false);
    }
  }, [locale]);
  
  // Fetch site defaults (writing style from interview)
  useEffect(() => {
    if (!selectedSite?.id || !isOpen) return;
    
    const fetchDefaults = async () => {
      setIsLoadingDefaults(true);
      try {
        const res = await fetch(`/api/sites/${selectedSite.id}/interview-profile`);
        if (res.ok) {
          const data = await res.json();
          setSiteDefaults(data);
          
          // Set default writing style from site interview
          const interviewWritingStyle = data.responses?.writingStyle;
          if (interviewWritingStyle) {
            setFormData(prev => ({
              ...prev,
              writingStyle: prev.writingStyle || interviewWritingStyle,
            }));
          }
        }
      } catch (err) {
        console.error('Error fetching site defaults:', err);
      } finally {
        setIsLoadingDefaults(false);
      }
    };
    
    fetchDefaults();
  }, [selectedSite?.id, isOpen]);
  
  // Set defaults when keyword changes or modal opens
  useEffect(() => {
    if (!keyword || !isOpen) return;
    
    const primaryIntent = keyword.intents?.[0] || 'INFORMATIONAL';
    const recommendedTypes = INTENT_TO_ARTICLE_TYPES[primaryIntent] || ['BLOG_POST'];
    const defaultType = recommendedTypes[0];
    const typeDef = ARTICLE_TYPES.find(at => at.id === defaultType);
    
    // Set intent-based defaults immediately (AI will override articleType shortly)
    setFormData(prev => ({
      ...prev,
      intent: primaryIntent,
      articleType: defaultType,
      wordCount: typeDef ? Math.floor((typeDef.minWords + typeDef.maxWords) / 2) : 1500,
    }));
    
    // Reset state
    setCurrentStep(STEPS.SETTINGS);
    setGeneratedPost(null);
    setError('');
    setProgressMessageIndex(0);
    setProgressPercent(0);
    setAiSuggestion(null);
    
    // Fetch AI suggestion for article type (uses cache if available)
    fetchAiSuggestion(keyword.id, primaryIntent);
  }, [keyword?.id, isOpen, fetchAiSuggestion]);
  
  // Progress message cycling during generation
  useEffect(() => {
    if (!isGenerating) {
      setProgressMessageIndex(0);
      setProgressPercent(0);
      return;
    }
    
    const messageInterval = setInterval(() => {
      setProgressMessageIndex(prev => (prev + 1) % PROGRESS_MESSAGES.length);
    }, 3500);
    
    const progressInterval = setInterval(() => {
      setProgressPercent(prev => Math.min(prev + Math.random() * 5 + 2, 95));
    }, 800);
    
    return () => {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
    };
  }, [isGenerating]);
  
  // Get article type definition
  const articleTypeDef = useMemo(() => {
    return ARTICLE_TYPES.find(at => at.id === formData.articleType);
  }, [formData.articleType]);
  
  // Max content images based on word count
  const maxContentImages = useMemo(() => {
    return Math.max(1, Math.floor(formData.wordCount / 500));
  }, [formData.wordCount]);
  
  // Update content images count when max changes
  useEffect(() => {
    if (formData.contentImagesCount > maxContentImages) {
      setFormData(prev => ({
        ...prev,
        contentImagesCount: maxContentImages,
      }));
    }
  }, [maxContentImages, formData.contentImagesCount]);
  
  // Handle form field changes
  const handleChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Auto-select article type when intent changes
      if (field === 'intent') {
        const recommendedTypes = INTENT_TO_ARTICLE_TYPES[value] || ['BLOG_POST'];
        newData.articleType = recommendedTypes[0];
        const typeDef = ARTICLE_TYPES.find(at => at.id === newData.articleType);
        if (typeDef) {
          newData.wordCount = Math.floor((typeDef.minWords + typeDef.maxWords) / 2);
        }
      }
      
      // Update word count range when article type changes
      if (field === 'articleType') {
        const typeDef = ARTICLE_TYPES.find(at => at.id === value);
        if (typeDef) {
          // Clamp current word count to new range
          const clamped = Math.max(typeDef.minWords, Math.min(typeDef.maxWords, newData.wordCount));
          newData.wordCount = clamped;
        }
      }
      
      return newData;
    });
  };
  
  // Handle next button
  const handleNext = async () => {
    if (currentStep === STEPS.SETTINGS) {
      setCurrentStep(STEPS.KEYWORDS);
    } else if (currentStep === STEPS.KEYWORDS) {
      setCurrentStep(STEPS.SUMMARY);
    } else if (currentStep === STEPS.SUMMARY) {
      await handleGenerate();
    }
  };
  
  // Handle back button
  const handleBack = () => {
    if (currentStep === STEPS.KEYWORDS) {
      setCurrentStep(STEPS.SETTINGS);
    } else if (currentStep === STEPS.SUMMARY) {
      setCurrentStep(STEPS.KEYWORDS);
    } else if (currentStep === STEPS.PREVIEW) {
      setCurrentStep(STEPS.SUMMARY);
    }
  };
  
  // Generate post
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');
    
    try {
      const res = await fetch(`/api/keywords/${keyword.id}/generate-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite.id,
          ...formData,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate post');
      }
      
      setGeneratedPost(data.post);
      setCurrentStep(STEPS.PREVIEW);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Regenerate entire post
  const handleRegenerateAll = async () => {
    setIsRegenerating('all');
    setError('');
    
    try {
      const res = await fetch(`/api/keywords/${keyword.id}/generate-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite.id,
          ...formData,
          regenerate: true,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate post');
      }
      
      setGeneratedPost(data.post);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRegenerating(null);
    }
  };
  
  // Regenerate specific field (with optional custom prompt from user)
  const handleRegenerateField = async (field, customPrompt = '') => {
    setIsRegenerating(field);
    setError('');
    
    try {
      const res = await fetch(`/api/keywords/${keyword.id}/generate-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite.id,
          ...formData,
          regenerateField: field,
          regeneratePrompt: customPrompt,
          existingPost: generatedPost,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate field');
      }
      
      setGeneratedPost(prev => ({
        ...prev,
        ...(field === 'featuredImage' ? { featuredImage: data.post.featuredImage, featuredImageIsAI: data.post.featuredImageIsAI } : { [field]: data.post[field] }),
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRegenerating(null);
    }
  };
  
  // Update post field manually
  const handleUpdateField = (field, value) => {
    setGeneratedPost(prev => ({
      ...prev,
      [field]: value,
    }));
  };
  
  // Save post as draft
  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite.id,
          keywordId: keyword.id,
          ...generatedPost,
          status: 'DRAFT',
          scheduledAt: formData.publishMode === 'schedule' 
            ? new Date(`${formData.scheduleDate}T${formData.scheduleTime}`).toISOString()
            : null,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save post');
      }
      
      onSuccess?.(data.content);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Publish post
  const handlePublish = async (scheduled = false) => {
    setIsPublishing(true);
    setError('');
    
    try {
      const publishBody = {
        siteId: selectedSite.id,
        keywordId: keyword.id,
        ...generatedPost,
        status: scheduled ? 'SCHEDULED' : 'READY_TO_PUBLISH',
        scheduledAt: scheduled && formData.publishMode === 'schedule'
          ? new Date(`${formData.scheduleDate}T${formData.scheduleTime}`).toISOString()
          : null,
      };

      console.log('[Publish] html field present:', !!publishBody.html, '| length:', (publishBody.html || '').length, '| keys:', Object.keys(publishBody).join(','));

      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishBody),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to publish post');
      }

      // Check if WP publish failed (content saved but WP push errored)
      if (data.content?.status === 'FAILED') {
        throw new Error(data.content.errorMessage || 'Failed to publish to WordPress');
      }
      
      onSuccess?.({ ...data.content, wpPostUrl: data.wpPostUrl, siteEntityId: data.siteEntityId });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPublishing(false);
    }
  };
  
  // Check if WordPress site and plugin connected
  const isWordPress = selectedSite?.platform === 'wordpress';
  const isWpConnected = selectedSite?.connectionStatus === 'CONNECTED';
  const needsPluginSetup = isWordPress && !isWpConnected;
  
  // Refresh site data when modal opens to get latest connectionStatus
  useEffect(() => {
    if (isOpen) {
      refreshSites();
      // Reset plugin step state
      setWpPluginStatus('idle');
      setShowPluginStep(false);
      setPendingAction(null);
    }
    return () => {
      if (wpPluginPollRef.current) {
        clearInterval(wpPluginPollRef.current);
        wpPluginPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  
  // Plugin download URL
  const pluginDownloadUrl = selectedSite?.siteKey
    ? `/api/plugin/download?site_key=${selectedSite.siteKey}`
    : null;
  
  // Handle final action with plugin check
  const handleFinalAction = (actionType) => {
    if (needsPluginSetup && !showPluginStep) {
      setShowPluginStep(true);
      setPendingAction(actionType);
      return;
    }
    executeFinalAction(actionType);
  };
  
  const executeFinalAction = (actionType) => {
    if (actionType === 'save') handleSave();
    else if (actionType === 'publish') handlePublish(false);
    else if (actionType === 'schedule') handlePublish(true);
    setShowPluginStep(false);
    setPendingAction(null);
  };
  
  // Plugin connection polling - uses lightweight endpoint with cache-busting
  const startConnectionPolling = () => {
    if (wpPluginPollRef.current) return;
    setWpPluginStatus('checking');
    let attempts = 0;
    const maxAttempts = 30; // ~60 seconds
    const siteId = selectedSite?.id;
    if (!siteId) return;
    
    wpPluginPollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/sites/${siteId}/connection-status?_t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.connectionStatus === 'CONNECTED') {
            clearInterval(wpPluginPollRef.current);
            wpPluginPollRef.current = null;
            setWpPluginStatus('connected');
            refreshSites();
            // Auto-proceed after connection
            setTimeout(() => {
              if (pendingAction) executeFinalAction(pendingAction);
            }, 1500);
          }
        }
      } catch { /* ignore poll errors */ }
      if (attempts >= maxAttempts) {
        clearInterval(wpPluginPollRef.current);
        wpPluginPollRef.current = null;
        setWpPluginStatus('error');
      }
    }, 2000);
  };
  
  const handlePluginSkip = () => {
    if (wpPluginPollRef.current) {
      clearInterval(wpPluginPollRef.current);
      wpPluginPollRef.current = null;
    }
    const action = pendingAction;
    setShowPluginStep(false);
    setPendingAction(null);
    setWpPluginStatus('idle');
    if (action) executeFinalAction(action);
  };
  
  // Intent options
  const intentOptions = [
    { value: 'INFORMATIONAL', label: t('keywordStrategy.intent.informational'), icon: Info },
    { value: 'NAVIGATIONAL', label: t('keywordStrategy.intent.navigational'), icon: Navigation },
    { value: 'TRANSACTIONAL', label: t('keywordStrategy.intent.transactional'), icon: ShoppingCart },
    { value: 'COMMERCIAL', label: t('keywordStrategy.intent.commercial'), icon: DollarSign },
  ];
  
  if (!isOpen) return null;
  
  return createPortal(
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${styles.modal} ${isMaximized ? styles.maximized : ''}`}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <Sparkles className={styles.headerIcon} />
            <div>
              <h2 className={styles.title}>{t('generatePost.title')}</h2>
              <p className={styles.subtitle}>
                {t('generatePost.forKeyword')}: <strong>{keyword?.keyword}</strong>
              </p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.closeButton} onClick={() => setIsMaximized(prev => !prev)}>
              {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button className={styles.closeButton} onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>
        
        {/* Progress indicator */}
        <div className={styles.progress}>
          {[
            { step: STEPS.SETTINGS, label: t('generatePost.steps.settings') },
            { step: STEPS.KEYWORDS, label: t('generatePost.steps.keywords') },
            { step: STEPS.SUMMARY, label: t('generatePost.steps.summary') },
            { step: STEPS.PREVIEW, label: t('generatePost.steps.preview') },
          ].map((s, i) => {
            const stepOrder = [STEPS.SETTINGS, STEPS.KEYWORDS, STEPS.SUMMARY, STEPS.PREVIEW];
            const currentIndex = stepOrder.indexOf(currentStep);
            const isCompleted = i < currentIndex;
            return (
              <div
                key={s.step}
                className={`${styles.progressStep} ${currentStep === s.step ? styles.active : ''} ${isCompleted ? styles.completed : ''}`}
              >
                <span className={styles.progressNumber}>{i + 1}</span>
                <span className={styles.progressLabel}>{s.label}</span>
              </div>
            );
          })}
        </div>
        
        {/* Content */}
        <div className={styles.content}>
          {error && (
            <div className={styles.errorBanner}>
              {error}
            </div>
          )}
          
          {/* Settings Step */}
          {currentStep === STEPS.SETTINGS && (
            <SettingsStep
              formData={formData}
              onChange={handleChange}
              siteDefaults={siteDefaults}
              isLoadingDefaults={isLoadingDefaults}
              keyword={keyword}
              intentOptions={intentOptions}
              articleTypeDef={articleTypeDef}
              maxContentImages={maxContentImages}
              aiSuggestion={aiSuggestion}
              isLoadingSuggestion={isLoadingSuggestion}
              onReanalyze={() => fetchAiSuggestion(keyword.id, formData.intent, { force: true })}
              t={t}
            />
          )}

          {/* Keywords Step */}
          {currentStep === STEPS.KEYWORDS && (
            <KeywordsStep
              keyword={keyword}
              formData={formData}
              onChange={handleChange}
              siteId={selectedSite?.id}
              t={t}
              locale={locale}
            />
          )}
          
          {/* Summary Step */}
          {currentStep === STEPS.SUMMARY && (
            <>
              {isGenerating ? (
                <GeneratingProgress 
                  messageKey={PROGRESS_MESSAGES[progressMessageIndex]}
                  percent={progressPercent}
                  t={t}
                />
              ) : (
                <SummaryStep
                  formData={formData}
                  keyword={keyword}
                  intentOptions={intentOptions}
                  t={t}
                />
              )}
            </>
          )}
          
          {/* Preview Step */}
          {currentStep === STEPS.PREVIEW && generatedPost && !showPluginStep && (
            <PreviewStep
              post={generatedPost}
              isRegenerating={isRegenerating}
              onUpdateField={handleUpdateField}
              onRegenerateField={handleRegenerateField}
              t={t}
            />
          )}
          
          {/* Plugin Install Step (shown within PREVIEW) */}
          {currentStep === STEPS.PREVIEW && showPluginStep && (
            <div className={styles.pluginStepContainer}>
              <div className={styles.pluginStepCard}>
                <div className={styles.pluginStepIcon}>
                  <Plug size={32} />
                </div>
                <h3 className={styles.pluginStepTitle}>
                  {t('generatePost.pluginStep.title')}
                </h3>
                <p className={styles.pluginStepDesc}>
                  {t('generatePost.pluginStep.description')}
                </p>
                
                <ul className={styles.pluginStepBenefits}>
                  <li><Check size={14} /> {t('generatePost.pluginStep.benefit1')}</li>
                  <li><Check size={14} /> {t('generatePost.pluginStep.benefit2')}</li>
                  <li><Check size={14} /> {t('generatePost.pluginStep.benefit3')}</li>
                </ul>
              </div>
              
              <div className={styles.pluginStepActions}>
                {wpPluginStatus === 'connected' && (
                  <div className={styles.pluginStepSuccess}>
                    <CheckCircle size={18} />
                    <span>{t('generatePost.pluginStep.connected')}</span>
                  </div>
                )}
                
                {wpPluginStatus === 'checking' && (
                  <div className={styles.pluginStepChecking}>
                    <Loader2 size={16} className={styles.spinner} />
                    <span>{t('generatePost.pluginStep.checking')}</span>
                  </div>
                )}
                
                {wpPluginStatus === 'error' && (
                  <>
                    <div className={styles.pluginStepError}>
                      <AlertTriangle size={16} />
                      <span>{t('generatePost.pluginStep.connectionTimeout')}</span>
                    </div>
                    <p className={styles.pluginStepHint}>
                      {t('generatePost.pluginStep.reactivateHint')}
                    </p>
                  </>
                )}
                
                {(wpPluginStatus === 'idle' || wpPluginStatus === 'downloaded' || wpPluginStatus === 'error') && pluginDownloadUrl && (
                  <div className={styles.pluginStepButtons}>
                    <button
                      className={styles.pluginDownloadButton}
                      onClick={() => {
                        window.open(pluginDownloadUrl, '_blank');
                        setWpPluginStatus('downloaded');
                      }}
                    >
                      <Download size={18} />
                      {t('generatePost.pluginStep.download')}
                    </button>
                    
                    {(wpPluginStatus === 'downloaded' || wpPluginStatus === 'error') && (
                      <button
                        className={styles.pluginCheckButton}
                        onClick={startConnectionPolling}
                      >
                        <CheckCircle size={16} />
                        {t('generatePost.pluginStep.checkConnection')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className={styles.footer}>
          {currentStep !== STEPS.SETTINGS && !showPluginStep && (
            <button 
              className={styles.backButton}
              onClick={handleBack}
              disabled={isGenerating || isSaving || isPublishing}
            >
              <ChevronLeft size={18} />
              {t('common.back')}
            </button>
          )}
          
          <div className={styles.footerRight}>
            {currentStep === STEPS.SETTINGS && (
              <button
                className={styles.primaryButton}
                onClick={handleNext}
              >
                {t('generatePost.next')}
                <ChevronRight size={18} />
              </button>
            )}

            {currentStep === STEPS.KEYWORDS && (
              <button
                className={styles.primaryButton}
                onClick={handleNext}
              >
                {t('generatePost.next')}
                <ChevronRight size={18} />
              </button>
            )}
            
            {currentStep === STEPS.SUMMARY && (
              <button
                className={styles.primaryButton}
                onClick={handleNext}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={18} className={styles.spinner} />
                    {t('generatePost.generating')}
                  </>
                ) : (
                  <>
                    <Wand2 size={18} />
                    {t('generatePost.generate')}
                  </>
                )}
              </button>
            )}
            
            {currentStep === STEPS.PREVIEW && !showPluginStep && (
              <>
                <button
                  className={styles.regenerateButton}
                  onClick={handleRegenerateAll}
                  disabled={isRegenerating || isSaving || isPublishing}
                >
                  {isRegenerating === 'all' ? (
                    <Loader2 size={18} className={styles.spinner} />
                  ) : (
                    <Sparkles size={18} />
                  )}
                  {t('generatePost.regenerateAll')}
                </button>
                
                <button
                  className={styles.saveButton}
                  onClick={handleSave}
                  disabled={isRegenerating || isSaving || isPublishing}
                >
                  {isSaving ? (
                    <Loader2 size={18} className={styles.spinner} />
                  ) : (
                    <Save size={18} />
                  )}
                  {t('generatePost.save')}
                </button>
                
                {isWordPress && (
                  <>
                    <button
                      className={styles.publishButton}
                      onClick={() => handleFinalAction('publish')}
                      disabled={isRegenerating || isSaving || isPublishing}
                    >
                      {isPublishing ? (
                        <Loader2 size={18} className={styles.spinner} />
                      ) : (
                        <Send size={18} />
                      )}
                      {t('generatePost.publish')}
                    </button>
                    
                    {formData.publishMode === 'schedule' && formData.scheduleDate && (
                      <button
                        className={styles.scheduleButton}
                        onClick={() => handleFinalAction('schedule')}
                        disabled={isRegenerating || isSaving || isPublishing}
                      >
                        <Clock size={18} />
                        {t('generatePost.schedulePublish')}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
            
            {currentStep === STEPS.PREVIEW && showPluginStep && (
              <>
                <button
                  className={styles.pluginSkipButton}
                  onClick={handlePluginSkip}
                  disabled={wpPluginStatus === 'checking'}
                >
                  {t('generatePost.pluginStep.skip')}
                </button>
                <button
                  className={styles.backButton}
                  onClick={() => {
                    if (wpPluginPollRef.current) {
                      clearInterval(wpPluginPollRef.current);
                      wpPluginPollRef.current = null;
                    }
                    setShowPluginStep(false);
                    setPendingAction(null);
                    setWpPluginStatus('idle');
                  }}
                >
                  <ChevronLeft size={18} />
                  {t('generatePost.pluginStep.backToPreview')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Settings Step Component
function SettingsStep({ formData, onChange, siteDefaults, isLoadingDefaults, keyword, intentOptions, articleTypeDef, maxContentImages, aiSuggestion, isLoadingSuggestion, onReanalyze, t }) {
  return (
    <div className={styles.settingsGrid}>
      {/* Writing Style */}
      <div className={styles.formGroup}>
        <label className={styles.label}>
          <AlignLeft size={16} />
          {t('generatePost.writingStyle')}
        </label>
        <select
          className={styles.select}
          value={formData.writingStyle}
          onChange={(e) => onChange('writingStyle', e.target.value)}
        >
          <option value="">{t('generatePost.selectWritingStyle')}</option>
          {WRITING_STYLES.map(style => (
            <option key={style} value={style}>
              {t(`generatePost.writingStyles.${style}`)}
            </option>
          ))}
        </select>
        {siteDefaults?.responses?.writingStyle && (
          <span className={styles.hint}>
            {t('generatePost.fromInterview')}: {t(`generatePost.writingStyles.${siteDefaults.responses.writingStyle}`)}
          </span>
        )}
      </div>
      
      {/* Publish Mode */}
      <div className={styles.formGroup}>
        <label className={styles.label}>
          <Calendar size={16} />
          {t('generatePost.publishMode')}
        </label>
        <div className={styles.radioGroup}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="publishMode"
              value="publish"
              checked={formData.publishMode === 'publish'}
              onChange={(e) => onChange('publishMode', e.target.value)}
            />
            {t('generatePost.publishNow')}
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="publishMode"
              value="schedule"
              checked={formData.publishMode === 'schedule'}
              onChange={(e) => onChange('publishMode', e.target.value)}
            />
            {t('generatePost.scheduleFor')}
          </label>
        </div>
        
        {formData.publishMode === 'schedule' && (
          <div className={styles.scheduleInputs}>
            <input
              type="date"
              className={styles.dateInput}
              value={formData.scheduleDate}
              onChange={(e) => onChange('scheduleDate', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
            <input
              type="time"
              className={styles.timeInput}
              value={formData.scheduleTime}
              onChange={(e) => onChange('scheduleTime', e.target.value)}
            />
          </div>
        )}
      </div>
      
      {/* Intent */}
      <div className={styles.formGroup}>
        <label className={styles.label}>
          <Info size={16} />
          {t('generatePost.intent')}
        </label>
        <div className={styles.intentOptions}>
          {intentOptions.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                className={`${styles.intentOption} ${formData.intent === opt.value ? styles.active : ''}`}
                onClick={() => onChange('intent', opt.value)}
              >
                <Icon size={16} />
                {opt.label}
              </button>
            );
          })}
        </div>
        {keyword?.intents?.length > 0 && (
          <span className={styles.hint}>
            {t('generatePost.keywordIntents')}: {keyword.intents.map(i => 
              intentOptions.find(o => o.value === i)?.label
            ).join(', ')}
          </span>
        )}
      </div>
      
      {/* Article Type */}
      <div className={styles.formGroup}>
        <label className={styles.label}>
          <FileText size={16} />
          {t('generatePost.articleType')}
          {isLoadingSuggestion && (
            <span className={styles.aiAnalyzing}>
              <Loader2 size={14} className={styles.spinIcon} />
              {t('generatePost.aiAnalyzing')}
            </span>
          )}
        </label>
        <div className={styles.selectWithAction}>
          <select
            className={styles.select}
            value={formData.articleType}
            onChange={(e) => onChange('articleType', e.target.value)}
          >
            {ARTICLE_TYPES.map(type => {
              const key = ARTICLE_TYPE_KEY_MAP[type.id];
              return (
                <option key={type.id} value={type.id}>
                  {t(`aiWizard.articleTypes.types.${key}.label`)}
                </option>
            );
          })}
          </select>
          <button
            type="button"
            className={styles.reanalyzeButton}
            onClick={onReanalyze}
            disabled={isLoadingSuggestion}
            title={t('generatePost.reanalyze')}
          >
            {isLoadingSuggestion ? <Loader2 size={16} className={styles.spinIcon} /> : <Wand2 size={16} />}
          </button>
        </div>
        {aiSuggestion && !isLoadingSuggestion ? (
          <div className={styles.aiSuggestionBox}>
            <div className={styles.aiSuggestionHeader}>
              <Sparkles size={14} />
              <span>{t('generatePost.aiSuggested')}</span>
            </div>
            <p className={styles.aiSuggestionReasoning}>{aiSuggestion.reasoning}</p>
            {aiSuggestion.briefPlan && (
              <div className={styles.aiSuggestionPlan}>
                <span className={styles.aiPlanTitle}>{t('generatePost.briefPlan')}</span>
                <div className={styles.aiPlanContent}>
                  {aiSuggestion.briefPlan.split(/\n|•|\d+\./).filter(Boolean).map((line, i) => {
                    const cleaned = line.replace(/^\s*[-\u2013\u2014]\s*/, '').trim();
                    if (!cleaned) return null;
                    return <span key={i} className={styles.aiPlanItem}>• {cleaned}</span>;
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <span className={styles.hint}>
            {t('generatePost.recommendedFor')}: {(INTENT_TO_ARTICLE_TYPES[formData.intent] || ['BLOG_POST']).map(type => {
              const key = ARTICLE_TYPE_KEY_MAP[type];
              return key ? t(`aiWizard.articleTypes.types.${key}.label`) : type;
            }).join(', ')}
          </span>
        )}
      </div>
      
      {/* Word Count */}
      <div className={styles.formGroup}>
        <label className={styles.label}>
          <AlignLeft size={16} />
          {t('generatePost.wordCount')}
        </label>
        <div className={styles.wordCountInput}>
          <input
            type="range"
            min={articleTypeDef?.minWords || 500}
            max={articleTypeDef?.maxWords || 3000}
            step={50}
            value={formData.wordCount}
            onChange={(e) => onChange('wordCount', parseInt(e.target.value))}
            className={styles.rangeInput}
          />
          <input
            type="number"
            className={styles.numberInput}
            min={articleTypeDef?.minWords || 500}
            max={articleTypeDef?.maxWords || 3000}
            value={formData.wordCount}
            onChange={(e) => onChange('wordCount', parseInt(e.target.value) || 500)}
          />
          <span className={styles.wordLabel}>{t('generatePost.words')}</span>
        </div>
        {articleTypeDef && (
          <span className={styles.hint}>
            {t('generatePost.recommendedRange')}: {articleTypeDef.minWords.toLocaleString()} - {articleTypeDef.maxWords.toLocaleString()}
          </span>
        )}
      </div>
      
      {/* Featured Image */}
      <div className={styles.formGroup}>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={formData.featuredImage}
            onChange={(e) => onChange('featuredImage', e.target.checked)}
          />
          <span className={styles.toggleSwitch} />
          <ImageIcon size={16} />
          {t('generatePost.featuredImage')}
        </label>
      </div>
      
      {/* Content Images */}
      <div className={styles.formGroup}>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={formData.contentImages}
            onChange={(e) => onChange('contentImages', e.target.checked)}
          />
          <span className={styles.toggleSwitch} />
          <ImageIcon size={16} />
          {t('generatePost.contentImages')}
        </label>
        
        {formData.contentImages && (
          <div className={styles.subSetting}>
            <label className={styles.subLabel}>{t('generatePost.contentImagesCount')}</label>
            <div className={styles.countInput}>
              <input
                type="range"
                min={1}
                max={maxContentImages}
                value={formData.contentImagesCount}
                onChange={(e) => onChange('contentImagesCount', parseInt(e.target.value))}
                className={styles.rangeInput}
              />
              <span className={styles.countValue}>{formData.contentImagesCount}</span>
            </div>
            <span className={styles.hint}>
              {t('generatePost.maxImages')}: {maxContentImages} ({t('generatePost.basedOnWordCount')})
            </span>
          </div>
        )}
      </div>
      
      {/* Content AI Prompt */}
      <div className={styles.formGroup + ' ' + styles.fullWidth}>
        <label className={styles.label}>
          <MessageSquare size={16} />
          {t('generatePost.contentPrompt')}
        </label>
        <textarea
          className={styles.textarea}
          value={formData.contentPrompt}
          onChange={(e) => onChange('contentPrompt', e.target.value)}
          placeholder={t('generatePost.contentPromptPlaceholder')}
          rows={3}
        />
      </div>
      
      {/* Featured Image AI Prompt */}
      {formData.featuredImage && (
        <div className={styles.formGroup + ' ' + styles.fullWidth}>
          <label className={styles.label}>
            <ImageIcon size={16} />
            {t('generatePost.featuredImagePrompt')}
          </label>
          <textarea
            className={styles.textarea}
            value={formData.featuredImagePrompt}
            onChange={(e) => onChange('featuredImagePrompt', e.target.value)}
            placeholder={t('generatePost.featuredImagePromptPlaceholder')}
            rows={2}
          />
        </div>
      )}
      
      {/* Content Images AI Prompt */}
      {formData.contentImages && (
        <div className={styles.formGroup + ' ' + styles.fullWidth}>
          <label className={styles.label}>
            <ImageIcon size={16} />
            {t('generatePost.contentImagesPrompt')}
          </label>
          <textarea
            className={styles.textarea}
            value={formData.contentImagesPrompt}
            onChange={(e) => onChange('contentImagesPrompt', e.target.value)}
            placeholder={t('generatePost.contentImagesPromptPlaceholder')}
            rows={2}
          />
        </div>
      )}
    </div>
  );
}

// Keywords Step Component - finds similar keywords to avoid cannibalization
function KeywordsStep({ keyword, formData, onChange, siteId, t, locale }) {
  const [allKeywords, setAllKeywords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiSuggestedIds, setAiSuggestedIds] = useState(new Set());

  const mainKeywordText = keyword?.keyword || '';
  const mainIntent = formData.intent || keyword?.intents?.[0] || '';

  // Step 1: Fetch platform keywords + GSC keywords on mount, merge & deduplicate
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;

    async function fetchKeywords() {
      setLoading(true);
      try {
        // Fetch platform keywords and GSC keywords in parallel
        const [platformRes, gscRes] = await Promise.all([
          fetch(`/api/keywords?siteId=${siteId}`),
          fetch(`/api/dashboard/stats/gsc/keywords?siteId=${siteId}&limit=500&offset=0&sort=impressions`)
            .catch(() => null),
        ]);

        // Process platform keywords
        let platformKws = [];
        if (platformRes.ok) {
          const data = await platformRes.json();
          platformKws = (data.keywords || data || []).filter(
            k => k.id !== keyword?.id && k.keyword !== mainKeywordText
          );
        }

        // Build a set of known platform keyword texts for deduplication
        const platformTexts = new Set(platformKws.map(k => k.keyword.toLowerCase().trim()));
        // Also exclude the main keyword itself
        platformTexts.add(mainKeywordText.toLowerCase().trim());

        // Process GSC keywords - only add those not already in the platform
        let gscOnlyKws = [];
        if (gscRes?.ok) {
          const gscData = await gscRes.json();
          const gscRows = gscData.rows || [];
          gscOnlyKws = gscRows
            .filter(row => !platformTexts.has(row.query.toLowerCase().trim()))
            .map(row => ({
              id: `gsc-${row.query}`,
              keyword: row.query,
              intents: [],
              source: 'gsc',
              clicks: row.clicks,
              impressions: row.impressions,
            }));
        }

        if (!cancelled) {
          setAllKeywords([...platformKws, ...gscOnlyKws]);
          setLoading(false);
        }
      } catch (err) {
        console.error('[KeywordsStep] fetch error:', err);
        if (!cancelled) setLoading(false);
      }
    }

    fetchKeywords();
    return () => { cancelled = true; };
  }, [siteId, keyword?.id, mainKeywordText]);

  // Step 2 + 3: Compute word-match and intent-match candidates (client-side)
  const { wordMatchCandidates, intentMatchCandidates, wordMatchIds } = useMemo(() => {
    if (!mainKeywordText || allKeywords.length === 0) {
      return { wordMatchCandidates: [], intentMatchCandidates: [], wordMatchIds: new Set() };
    }

    // Split main keyword into individual words, filter short noise words
    const words = mainKeywordText
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 1);

    // Find all keywords containing any of these words
    const wordMatch = allKeywords.filter(kw => {
      const kwLower = kw.keyword.toLowerCase();
      return words.some(word => kwLower.includes(word));
    });

    const wmIds = new Set(wordMatch.map(k => k.id));

    // Filter by matching intent
    const intentMatch = wordMatch.filter(kw => {
      if (!mainIntent || !kw.intents?.length) return true; // keep if no intent data
      return kw.intents.includes(mainIntent);
    });

    return { wordMatchCandidates: wordMatch, intentMatchCandidates: intentMatch, wordMatchIds: wmIds };
  }, [mainKeywordText, allKeywords, mainIntent]);

  // Step 4: AI analysis of intent-matched candidates
  useEffect(() => {
    if (loading || intentMatchCandidates.length === 0 || aiDone) return;
    let cancelled = false;

    async function analyzeWithAI() {
      setAiAnalyzing(true);
      try {
        const res = await fetch('/api/keywords/suggest-related', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mainKeyword: mainKeywordText,
            mainIntent,
            candidates: intentMatchCandidates.map(k => ({
              id: k.id,
              keyword: k.keyword,
              intent: k.intents?.[0] || '',
            })),
            locale,
          }),
        });

        if (!res.ok) throw new Error('AI analysis failed');
        const data = await res.json();
        const ids = new Set(data.relatedKeywordIds || []);

        if (!cancelled) {
          setAiSuggestedIds(ids);
          // Auto-check AI-suggested keywords
          const currentSelected = new Set(formData.additionalKeywords.map(k => k.id));
          const newSelections = [...formData.additionalKeywords];
          for (const kw of intentMatchCandidates) {
            if (ids.has(kw.id) && !currentSelected.has(kw.id)) {
              newSelections.push({ id: kw.id, keyword: kw.keyword });
            }
          }
          onChange('additionalKeywords', newSelections);
          setAiDone(true);
        }
      } catch (err) {
        console.error('[KeywordsStep] AI analysis error:', err);
        if (!cancelled) setAiDone(true);
      } finally {
        if (!cancelled) setAiAnalyzing(false);
      }
    }

    analyzeWithAI();
    return () => { cancelled = true; };
  }, [loading, intentMatchCandidates, aiDone]);

  // Build ordered keyword list: AI suggested → word match → other
  const orderedKeywords = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    let filtered = allKeywords;
    if (query) {
      filtered = allKeywords.filter(k => k.keyword.toLowerCase().includes(query));
    }

    const aiGroup = [];
    const wordGroup = [];
    const otherGroup = [];

    for (const kw of filtered) {
      if (aiSuggestedIds.has(kw.id)) {
        aiGroup.push({ ...kw, group: 'ai' });
      } else if (wordMatchIds.has(kw.id)) {
        wordGroup.push({ ...kw, group: 'wordMatch' });
      } else {
        otherGroup.push({ ...kw, group: 'other' });
      }
    }

    return [...aiGroup, ...wordGroup, ...otherGroup];
  }, [allKeywords, aiSuggestedIds, wordMatchIds, searchQuery]);

  // Toggle keyword selection
  const toggleKeyword = useCallback((kw) => {
    const isSelected = formData.additionalKeywords.some(k => k.id === kw.id);
    if (isSelected) {
      onChange('additionalKeywords', formData.additionalKeywords.filter(k => k.id !== kw.id));
    } else {
      onChange('additionalKeywords', [...formData.additionalKeywords, { id: kw.id, keyword: kw.keyword }]);
    }
  }, [formData.additionalKeywords, onChange]);

  const selectedIds = new Set(formData.additionalKeywords.map(k => k.id));

  // Intent label helper
  const getIntentBadge = (intents) => {
    if (!intents?.length) return null;
    const intentMap = {
      INFORMATIONAL: { icon: Info, color: '#3b82f6' },
      NAVIGATIONAL: { icon: Navigation, color: '#8b5cf6' },
      TRANSACTIONAL: { icon: ShoppingCart, color: '#10b981' },
      COMMERCIAL: { icon: DollarSign, color: '#f59e0b' },
    };
    const primary = intents[0];
    const config = intentMap[primary];
    if (!config) return null;
    const Icon = config.icon;
    return (
      <span className={styles.kwIntentBadge} style={{ color: config.color, borderColor: config.color }}>
        <Icon size={12} />
        {primary.charAt(0) + primary.slice(1).toLowerCase()}
      </span>
    );
  };

  let lastGroup = null;

  return (
    <div className={styles.keywordsStep}>
      <div className={styles.kwHeader}>
        <h3 className={styles.kwTitle}>
          <Tags size={18} />
          {t('generatePost.keywordsStep.title')}
        </h3>
        <p className={styles.kwDescription}>
          {t('generatePost.keywordsStep.description')}
        </p>
      </div>

      {/* Search Input */}
      <div className={styles.kwSearchWrap}>
        <Search size={16} className={styles.kwSearchIcon} />
        <input
          type="text"
          className={styles.kwSearchInput}
          placeholder={t('generatePost.keywordsStep.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {formData.additionalKeywords.length > 0 && (
          <span className={styles.kwSelectedCount}>
            {formData.additionalKeywords.length} {t('generatePost.keywordsStep.selected')}
          </span>
        )}
      </div>

      {/* Status bar */}
      {(loading || aiAnalyzing) && (
        <div className={styles.kwStatus}>
          <Loader2 size={14} className={styles.spinner} />
          <span>
            {loading
              ? t('generatePost.keywordsStep.loadingKeywords')
              : t('generatePost.keywordsStep.aiAnalyzing')
            }
          </span>
        </div>
      )}

      {/* Keywords List */}
      <div className={styles.kwList}>
        {!loading && orderedKeywords.length === 0 && (
          <div className={styles.kwEmpty}>
            {t('generatePost.keywordsStep.noKeywords')}
          </div>
        )}
        {orderedKeywords.map((kw) => {
          let groupHeader = null;
          if (kw.group !== lastGroup) {
            lastGroup = kw.group;
            const groupLabel =
              kw.group === 'ai' ? t('generatePost.keywordsStep.aiSuggested') :
              kw.group === 'wordMatch' ? t('generatePost.keywordsStep.wordMatch') :
              t('generatePost.keywordsStep.otherKeywords');
            const groupIcon =
              kw.group === 'ai' ? <Sparkles size={14} /> :
              kw.group === 'wordMatch' ? <Search size={14} /> :
              null;
            groupHeader = (
              <div className={`${styles.kwGroupHeader} ${kw.group === 'ai' ? styles.kwGroupAi : ''}`}>
                {groupIcon}
                {groupLabel}
              </div>
            );
          }

          return (
            <div key={kw.id}>
              {groupHeader}
              <label className={`${styles.kwItem} ${selectedIds.has(kw.id) ? styles.kwItemSelected : ''} ${kw.group === 'ai' ? styles.kwItemAi : ''}`}>
                <input
                  type="checkbox"
                  className={styles.kwCheckbox}
                  checked={selectedIds.has(kw.id)}
                  onChange={() => toggleKeyword(kw)}
                />
                <span className={styles.kwText}>{kw.keyword}</span>
                {kw.source === 'gsc' && (
                  <span className={styles.kwGscBadge}>
                    <Globe size={10} />
                    GSC
                  </span>
                )}
                {getIntentBadge(kw.intents)}
                {kw.group === 'ai' && (
                  <span className={styles.kwAiBadge}>
                    <Sparkles size={10} />
                    AI
                  </span>
                )}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Summary Step Component
function SummaryStep({ formData, keyword, intentOptions, t }) {
  const articleTypeKey = ARTICLE_TYPE_KEY_MAP[formData.articleType];
  const intentLabel = intentOptions.find(o => o.value === formData.intent)?.label;
  
  return (
    <div className={styles.summary}>
      <h3 className={styles.summaryTitle}>{t('generatePost.summaryTitle')}</h3>
      
      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t('generatePost.targetKeyword')}</span>
          <span className={styles.summaryValue}>{keyword?.keyword}</span>
        </div>
        
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t('generatePost.writingStyle')}</span>
          <span className={styles.summaryValue}>
            {formData.writingStyle ? t(`generatePost.writingStyles.${formData.writingStyle}`) : '-'}
          </span>
        </div>
        
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t('generatePost.intent')}</span>
          <span className={styles.summaryValue}>{intentLabel}</span>
        </div>
        
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t('generatePost.articleType')}</span>
          <span className={styles.summaryValue}>
            {t(`aiWizard.articleTypes.types.${articleTypeKey}.label`)}
          </span>
        </div>
        
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t('generatePost.wordCount')}</span>
          <span className={styles.summaryValue}>{formData.wordCount.toLocaleString()} {t('generatePost.words')}</span>
        </div>
        
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t('generatePost.publishMode')}</span>
          <span className={styles.summaryValue}>
            {formData.publishMode === 'publish' 
              ? t('generatePost.publishNow')
              : `${t('generatePost.scheduleFor')} ${formData.scheduleDate} ${formData.scheduleTime}`
            }
          </span>
        </div>
        
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t('generatePost.featuredImage')}</span>
          <span className={styles.summaryValue}>
            {formData.featuredImage ? t('common.yes') : t('common.no')}
          </span>
        </div>
        
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t('generatePost.contentImages')}</span>
          <span className={styles.summaryValue}>
            {formData.contentImages ? `${formData.contentImagesCount} ${t('generatePost.images')}` : t('common.no')}
          </span>
        </div>

        {formData.additionalKeywords.length > 0 && (
          <div className={styles.summaryItem + ' ' + styles.fullWidth}>
            <span className={styles.summaryLabel}>
              {t('generatePost.keywordsStep.title')}
            </span>
            <span className={styles.summaryValue}>
              {formData.additionalKeywords.map(k => k.keyword).join(', ')}
            </span>
          </div>
        )}
      </div>
      
      {(formData.contentPrompt || formData.featuredImagePrompt || formData.contentImagesPrompt) && (
        <div className={styles.summaryPrompts}>
          <h4 className={styles.summaryPromptsTitle}>{t('generatePost.customPrompts')}</h4>
          
          {formData.contentPrompt && (
            <div className={styles.summaryPrompt}>
              <span className={styles.promptLabel}>{t('generatePost.contentPrompt')}:</span>
              <p className={styles.promptText}>{formData.contentPrompt}</p>
            </div>
          )}
          
          {formData.featuredImagePrompt && (
            <div className={styles.summaryPrompt}>
              <span className={styles.promptLabel}>{t('generatePost.featuredImagePrompt')}:</span>
              <p className={styles.promptText}>{formData.featuredImagePrompt}</p>
            </div>
          )}
          
          {formData.contentImagesPrompt && (
            <div className={styles.summaryPrompt}>
              <span className={styles.promptLabel}>{t('generatePost.contentImagesPrompt')}:</span>
              <p className={styles.promptText}>{formData.contentImagesPrompt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Generating Progress Component
function GeneratingProgress({ messageKey, percent, t }) {
  return (
    <div className={styles.generatingProgress}>
      <div className={styles.generatingIcon}>
        <Sparkles className={styles.generatingSparkle} />
        <div className={styles.generatingPulse} />
      </div>
      
      <h3 className={styles.generatingTitle}>{t('generatePost.generatingTitle')}</h3>
      
      <div className={styles.progressBarContainer}>
        <div 
          className={styles.progressBar}
          style={{ width: `${percent}%` }}
        />
      </div>
      
      <p className={styles.generatingMessage}>
        {t(`generatePost.progressMessages.${messageKey}`)}
      </p>
      
      <div className={styles.generatingHints}>
        <span>{t('generatePost.generatingHint')}</span>
      </div>
    </div>
  );
}

// Regenerate Button with expandable prompt
function RegenerateButton({ field, isRegenerating, onRegenerate, t }) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef(null);
  
  const handleToggle = () => {
    if (isOpen) {
      setIsOpen(false);
      setPrompt('');
    } else {
      setIsOpen(true);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };
  
  const handleSend = () => {
    onRegenerate(field, prompt);
    setIsOpen(false);
    setPrompt('');
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      setPrompt('');
    }
  };
  
  return (
    <div className={styles.regenerateInline}>
      <button
        className={styles.previewAction}
        onClick={handleToggle}
        disabled={isRegenerating === field}
        title={t('generatePost.regenerate')}
      >
        {isRegenerating === field ? <Loader2 size={14} className={styles.spinner} /> : <Sparkles size={14} />}
      </button>
      {isOpen && (
        <div className={styles.regeneratePrompt}>
          <textarea
            ref={textareaRef}
            className={styles.regeneratePromptInput}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('generatePost.regeneratePromptPlaceholder')}
            rows={2}
          />
          <div className={styles.regeneratePromptActions}>
            <button
              className={styles.regeneratePromptSend}
              onClick={handleSend}
              disabled={isRegenerating === field}
              title={t('generatePost.regenerateSend')}
            >
              {isRegenerating === field ? <Loader2 size={14} className={styles.spinner} /> : <CornerDownLeft size={14} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Preview Step Component
function PreviewStep({ post, isRegenerating, onUpdateField, onRegenerateField, t }) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [contentBlocks, setContentBlocks] = useState([]);
  const [editMode, setEditMode] = useState('preview'); // 'preview' | 'parallel' | 'free'
  const [dragState, setDragState] = useState({ draggedId: null, overIdx: null });
  
  // Parse HTML into blocks (headings and content sections)
  useEffect(() => {
    if (!post?.html) {
      setContentBlocks([]);
      return;
    }
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(post.html, 'text/html');
    const blocks = [];
    
    let paragraphBuffer = [];
    
    const flushParagraphBuffer = () => {
      if (paragraphBuffer.length > 0) {
        blocks.push({
          id: `content-${blocks.length}`,
          type: 'content',
          html: paragraphBuffer.join(''),
        });
        paragraphBuffer = [];
      }
    };
    
    doc.body.childNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          flushParagraphBuffer();
          blocks.push({
            id: `heading-${blocks.length}`,
            type: 'heading',
            tag: tagName,
            text: node.textContent,
          });
        } else if (tagName === 'figure') {
          flushParagraphBuffer();
          const img = node.querySelector('img');
          const figcaption = node.querySelector('figcaption');
          blocks.push({
            id: `figure-${blocks.length}`,
            type: 'figure',
            src: img?.getAttribute('src') || '',
            alt: img?.getAttribute('alt') || figcaption?.textContent || '',
            caption: figcaption?.textContent || '',
            html: node.outerHTML,
          });
        } else {
          paragraphBuffer.push(node.outerHTML);
        }
      } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        paragraphBuffer.push(`<p>${node.textContent}</p>`);
      }
    });
    
    flushParagraphBuffer();
    setContentBlocks(blocks);
  }, [post?.html]);
  
  // Update content block
  const updateBlock = (blockId, updates) => {
    setContentBlocks(prev => prev.map(block => 
      block.id === blockId ? { ...block, ...updates } : block
    ));
  };
  
  // Reconstruct HTML from blocks
  const reconstructHtml = useCallback(() => {
    return contentBlocks.map(block => {
      if (block.type === 'heading') {
        return `<${block.tag}>${block.text}</${block.tag}>`;
      }
      if (block.type === 'figure') {
        return `<figure><img src="${block.src}" alt="${block.alt}"><figcaption>${block.caption}</figcaption></figure>`;
      }
      return block.html;
    }).join('\n');
  }, [contentBlocks]);
  
  // Sync blocks back to post HTML when blocks change (only in parallel mode)
  useEffect(() => {
    if (editMode === 'parallel' && contentBlocks.length > 0) {
      const newHtml = reconstructHtml();
      if (newHtml !== post.html) {
        onUpdateField('html', newHtml);
      }
    }
  }, [contentBlocks, reconstructHtml, editMode]); // eslint-disable-line react-hooks/exhaustive-deps
  
  const startEdit = (field, value) => {
    setEditingField(field);
    setEditValue(value);
  };
  
  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };
  
  const saveEdit = (field) => {
    onUpdateField(field, editValue);
    setEditingField(null);
    setEditValue('');
  };
  
  const headingOptions = [
    { value: 'h1', label: 'H1', icon: Heading1 },
    { value: 'h2', label: 'H2', icon: Heading2 },
    { value: 'h3', label: 'H3', icon: Heading3 },
    { value: 'h4', label: 'H4', icon: Heading4 },
    { value: 'h5', label: 'H5', icon: Heading5 },
    { value: 'h6', label: 'H6', icon: Heading6 },
  ];
  
  // Drag handlers for parallel edit mode
  const handleDragStart = (blockId) => {
    setDragState({ draggedId: blockId, overIdx: null });
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDragState(prev => ({ ...prev, overIdx: idx }));
  };

  const handleDragEnd = () => {
    setDragState({ draggedId: null, overIdx: null });
  };

  const handleDrop = (targetIdx) => {
    if (!dragState.draggedId) return;
    const sourceIdx = contentBlocks.findIndex(b => b.id === dragState.draggedId);
    if (sourceIdx === -1 || sourceIdx === targetIdx) {
      setDragState({ draggedId: null, overIdx: null });
      return;
    }
    
    setContentBlocks(prev => {
      const newBlocks = [...prev];
      const [moved] = newBlocks.splice(sourceIdx, 1);
      newBlocks.splice(targetIdx, 0, moved);
      return newBlocks;
    });
    setDragState({ draggedId: null, overIdx: null });
  };
  
  return (
    <div className={styles.preview}>
      {/* Featured Image */}
      {post.featuredImage && (
        <div className={styles.previewField}>
          <div className={styles.previewFieldHeader}>
            <label className={styles.previewLabel}>{t('generatePost.preview.featuredImage')}</label>
            <div className={styles.previewActions}>
              <RegenerateButton
                field="featuredImage"
                isRegenerating={isRegenerating}
                onRegenerate={onRegenerateField}
                t={t}
              />
            </div>
          </div>
          <div className={styles.featuredImagePreview}>
            <img 
              src={post.featuredImage} 
              alt={post.featuredImageAlt || post.title}
              className={styles.featuredImage}
            />
            {editingField === 'featuredImageAlt' ? (
              <div className={styles.editWrapper + ' ' + styles.imageAltEdit}>
                <input
                  type="text"
                  className={styles.editInput}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                />
                <div className={styles.editActions}>
                  <button className={styles.editSave} onClick={() => saveEdit('featuredImageAlt')}>
                    <Check size={14} />
                  </button>
                  <button className={styles.editCancel} onClick={cancelEdit}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.imageAltRow}>
                <p className={styles.imageAlt}>{post.featuredImageAlt}</p>
                <button
                  className={styles.previewAction}
                  onClick={() => startEdit('featuredImageAlt', post.featuredImageAlt || '')}
                  title={t('common.edit')}
                >
                  <Edit3 size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Title */}
      <div className={styles.previewField}>
        <div className={styles.previewFieldHeader}>
          <label className={styles.previewLabel}>{t('generatePost.preview.title')}</label>
          <div className={styles.previewActions}>
            <RegenerateButton
              field="title"
              isRegenerating={isRegenerating}
              onRegenerate={onRegenerateField}
              t={t}
            />
            <button
              className={styles.previewAction}
              onClick={() => startEdit('title', post.title)}
              title={t('common.edit')}
            >
              <Edit3 size={14} />
            </button>
          </div>
        </div>
        {editingField === 'title' ? (
          <div className={styles.editWrapper}>
            <input
              type="text"
              className={styles.editInput}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
            />
            <div className={styles.editActions}>
              <button className={styles.editSave} onClick={() => saveEdit('title')}>
                <Check size={14} />
              </button>
              <button className={styles.editCancel} onClick={cancelEdit}>
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <h1 className={styles.previewTitle}>{post.title}</h1>
        )}
      </div>
      
      {/* Meta Title */}
      <div className={styles.previewField}>
        <div className={styles.previewFieldHeader}>
          <label className={styles.previewLabel}>{t('generatePost.preview.metaTitle')}</label>
          <div className={styles.previewActions}>
            <RegenerateButton
              field="metaTitle"
              isRegenerating={isRegenerating}
              onRegenerate={onRegenerateField}
              t={t}
            />
            <button
              className={styles.previewAction}
              onClick={() => startEdit('metaTitle', post.metaTitle)}
            >
              <Edit3 size={14} />
            </button>
          </div>
        </div>
        {editingField === 'metaTitle' ? (
          <div className={styles.editWrapper}>
            <input
              type="text"
              className={styles.editInput}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              maxLength={60}
            />
            <div className={styles.editActions}>
              <button className={styles.editSave} onClick={() => saveEdit('metaTitle')}>
                <Check size={14} />
              </button>
              <button className={styles.editCancel} onClick={cancelEdit}>
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.previewMeta}>{post.metaTitle}</p>
        )}
        <span className={styles.charCount}>{post.metaTitle?.length || 0}/60</span>
      </div>
      
      {/* Meta Description */}
      <div className={styles.previewField}>
        <div className={styles.previewFieldHeader}>
          <label className={styles.previewLabel}>{t('generatePost.preview.metaDescription')}</label>
          <div className={styles.previewActions}>
            <RegenerateButton
              field="metaDescription"
              isRegenerating={isRegenerating}
              onRegenerate={onRegenerateField}
              t={t}
            />
            <button
              className={styles.previewAction}
              onClick={() => startEdit('metaDescription', post.metaDescription)}
            >
              <Edit3 size={14} />
            </button>
          </div>
        </div>
        {editingField === 'metaDescription' ? (
          <div className={styles.editWrapper}>
            <textarea
              className={styles.editTextarea}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              maxLength={155}
              rows={2}
            />
            <div className={styles.editActions}>
              <button className={styles.editSave} onClick={() => saveEdit('metaDescription')}>
                <Check size={14} />
              </button>
              <button className={styles.editCancel} onClick={cancelEdit}>
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.previewMeta}>{post.metaDescription}</p>
        )}
        <span className={styles.charCount}>{post.metaDescription?.length || 0}/155</span>
      </div>
      
      {/* Excerpt */}
      <div className={styles.previewField}>
        <div className={styles.previewFieldHeader}>
          <label className={styles.previewLabel}>{t('generatePost.preview.excerpt')}</label>
          <div className={styles.previewActions}>
            <RegenerateButton
              field="excerpt"
              isRegenerating={isRegenerating}
              onRegenerate={onRegenerateField}
              t={t}
            />
            <button
              className={styles.previewAction}
              onClick={() => startEdit('excerpt', post.excerpt)}
            >
              <Edit3 size={14} />
            </button>
          </div>
        </div>
        {editingField === 'excerpt' ? (
          <div className={styles.editWrapper}>
            <textarea
              className={styles.editTextarea}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={2}
            />
            <div className={styles.editActions}>
              <button className={styles.editSave} onClick={() => saveEdit('excerpt')}>
                <Check size={14} />
              </button>
              <button className={styles.editCancel} onClick={cancelEdit}>
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.previewExcerpt}>{post.excerpt}</p>
        )}
      </div>
      
      {/* Content */}
      <div className={styles.previewField + ' ' + styles.contentField}>
        <div className={styles.previewFieldHeader}>
          <label className={styles.previewLabel}>{t('generatePost.preview.content')}</label>
          <div className={styles.previewActions}>
            <RegenerateButton
              field="html"
              isRegenerating={isRegenerating}
              onRegenerate={onRegenerateField}
              t={t}
            />
            <div className={styles.editModeToggle}>
              <button
                className={`${styles.editModeBtn} ${editMode === 'preview' ? styles.active : ''}`}
                onClick={() => setEditMode('preview')}
                title={t('generatePost.preview.showPreview')}
              >
                <Eye size={14} />
              </button>
              <button
                className={`${styles.editModeBtn} ${editMode === 'parallel' ? styles.active : ''}`}
                onClick={() => setEditMode('parallel')}
                title={t('generatePost.preview.parallelEdit')}
              >
                <AlignLeft size={14} />
              </button>
              <button
                className={`${styles.editModeBtn} ${editMode === 'free' ? styles.active : ''}`}
                onClick={() => setEditMode('free')}
                title={t('generatePost.preview.freeEdit')}
              >
                <Edit3 size={14} />
              </button>
            </div>
          </div>
        </div>
        
        {editMode === 'preview' && (
          <div 
            className={styles.previewContent}
            dangerouslySetInnerHTML={{ __html: post.html }}
          />
        )}
        
        {editMode === 'parallel' && (
          <div className={styles.contentBlocks}>
            {contentBlocks.map((block, idx) => (
              <div 
                key={block.id} 
                className={`${styles.contentBlock} ${dragState.draggedId === block.id ? styles.dragging : ''} ${dragState.overIdx === idx && dragState.draggedId !== block.id ? styles.dragOver : ''}`}
                draggable
                onDragStart={() => handleDragStart(block.id)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                onDrop={() => handleDrop(idx)}
              >
                <div className={styles.dragHandle}>
                  <GripVertical size={14} />
                </div>
                <div className={styles.blockContent}>
                  {block.type === 'heading' ? (
                    <HeadingBlock
                      block={block}
                      headingOptions={headingOptions}
                      onUpdate={(updates) => updateBlock(block.id, updates)}
                      t={t}
                    />
                  ) : block.type === 'figure' ? (
                    <FigureBlock
                      block={block}
                      onUpdate={(updates) => updateBlock(block.id, updates)}
                      t={t}
                    />
                  ) : (
                    <ContentBlockEditor
                      block={block}
                      onUpdate={(updates) => updateBlock(block.id, updates)}
                      t={t}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {editMode === 'free' && (
          <FreeEditMode 
            content={post.html} 
            onUpdate={(html) => onUpdateField('html', html)} 
            t={t} 
          />
        )}
        
        <span className={styles.wordCount}>{post.wordCount?.toLocaleString() || 0} {t('generatePost.words')}</span>
      </div>
      
      {/* Slug */}
      <div className={styles.previewField}>
        <div className={styles.previewFieldHeader}>
          <label className={styles.previewLabel}>{t('generatePost.preview.slug')}</label>
          <div className={styles.previewActions}>
            <button
              className={styles.previewAction}
              onClick={() => startEdit('slug', post.slug)}
            >
              <Edit3 size={14} />
            </button>
          </div>
        </div>
        {editingField === 'slug' ? (
          <div className={styles.editWrapper}>
            <input
              type="text"
              className={styles.editInput}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            />
            <div className={styles.editActions}>
              <button className={styles.editSave} onClick={() => saveEdit('slug')}>
                <Check size={14} />
              </button>
              <button className={styles.editCancel} onClick={cancelEdit}>
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <code className={styles.previewSlug}>/{post.slug}</code>
        )}
      </div>
    </div>
  );
}

// Figure Block Component (editable alt text / caption for content images)
function FigureBlock({ block, onUpdate, t }) {
  const [isEditingAlt, setIsEditingAlt] = useState(false);
  const [altText, setAltText] = useState(block.alt || '');
  
  const saveAlt = () => {
    onUpdate({ alt: altText, caption: altText });
    setIsEditingAlt(false);
  };
  
  const cancelAlt = () => {
    setAltText(block.alt || '');
    setIsEditingAlt(false);
  };
  
  return (
    <div className={styles.figureBlock}>
      <img src={block.src} alt={block.alt} className={styles.figureBlockImage} />
      <div className={styles.figureBlockContent}>
        {isEditingAlt ? (
          <div className={styles.editWrapper}>
            <input
              type="text"
              className={styles.editInput}
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveAlt();
                if (e.key === 'Escape') cancelAlt();
              }}
            />
            <div className={styles.editActions}>
              <button className={styles.editSave} onClick={saveAlt}>
                <Check size={14} />
              </button>
              <button className={styles.editCancel} onClick={cancelAlt}>
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.figureBlockCaptionRow}>
            <span className={styles.figureBlockCaption}>{block.caption}</span>
            <button
              className={styles.previewAction}
              onClick={() => setIsEditingAlt(true)}
              title={t('common.edit')}
            >
              <Edit3 size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Heading Block Component
function HeadingBlock({ block, headingOptions, onUpdate, t }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(block.text);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const dropdownRef = useRef(null);
  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const saveEdit = () => {
    onUpdate({ text: editText });
    setIsEditing(false);
  };
  
  const cancelEdit = () => {
    setEditText(block.text);
    setIsEditing(false);
  };
  
  const changeTag = (newTag) => {
    onUpdate({ tag: newTag });
    setShowTagDropdown(false);
  };
  
  const CurrentIcon = headingOptions.find(o => o.value === block.tag)?.icon || Heading2;
  
  return (
    <div className={styles.headingBlock}>
      <div className={styles.headingTagSelect} ref={dropdownRef}>
        <button 
          className={styles.tagButton}
          onClick={() => setShowTagDropdown(!showTagDropdown)}
          title={t('generatePost.preview.changeHeadingLevel')}
        >
          <CurrentIcon size={16} />
          <span>{block.tag.toUpperCase()}</span>
          <ChevronDown size={14} />
        </button>
        
        {showTagDropdown && (
          <div className={styles.tagDropdown}>
            {headingOptions.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  className={`${styles.tagOption} ${block.tag === opt.value ? styles.active : ''}`}
                  onClick={() => changeTag(opt.value)}
                >
                  <Icon size={16} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      
      {isEditing ? (
        <div className={styles.headingEdit}>
          <input
            type="text"
            className={styles.headingInput}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            autoFocus
          />
          <div className={styles.headingEditActions}>
            <button className={styles.editSave} onClick={saveEdit}>
              <Check size={14} />
            </button>
            <button className={styles.editCancel} onClick={cancelEdit}>
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div 
          className={styles.headingText}
          onClick={() => setIsEditing(true)}
          role="button"
          tabIndex={0}
        >
          {block.text}
        </div>
      )}
    </div>
  );
}

// Content Block Editor with TipTap
function ContentBlockEditor({ block, onUpdate, t }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // Headings are handled separately
      }),
      Link.configure({
        openOnClick: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder: t('generatePost.preview.contentPlaceholder'),
      }),
    ],
    content: block.html,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onUpdate({ html: editor.getHTML() });
    },
    editorProps: {
      attributes: {
        class: styles.tiptapEditor,
      },
    },
  });
  
  if (!editor) return null;
  
  return (
    <div className={styles.contentBlockEditor}>
      <div className={styles.miniToolbar}>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${styles.miniToolbarBtn} ${editor.isActive('bold') ? styles.active : ''}`}
          title={t('generatePost.preview.bold')}
        >
          <Bold size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${styles.miniToolbarBtn} ${editor.isActive('italic') ? styles.active : ''}`}
          title={t('generatePost.preview.italic')}
        >
          <Italic size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${styles.miniToolbarBtn} ${editor.isActive('underline') ? styles.active : ''}`}
          title={t('generatePost.preview.underline')}
        >
          <UnderlineIcon size={14} />
        </button>
        <div className={styles.miniToolbarDivider} />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`${styles.miniToolbarBtn} ${editor.isActive('bulletList') ? styles.active : ''}`}
          title={t('generatePost.preview.bulletList')}
        >
          <List size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`${styles.miniToolbarBtn} ${editor.isActive('orderedList') ? styles.active : ''}`}
          title={t('generatePost.preview.numberedList')}
        >
          <ListOrdered size={14} />
        </button>
        <div className={styles.miniToolbarDivider} />
        <button
          type="button"
          onClick={() => {
            const url = window.prompt(t('generatePost.preview.enterUrl'));
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }}
          className={`${styles.miniToolbarBtn} ${editor.isActive('link') ? styles.active : ''}`}
          title={t('generatePost.preview.addLink')}
        >
          <LinkIcon size={14} />
        </button>
        {editor.isActive('link') && (
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetLink().run()}
            className={styles.miniToolbarBtn}
            title={t('generatePost.preview.removeLink')}
          >
            <Unlink size={14} />
          </button>
        )}
      </div>
      
      <EditorContent editor={editor} />
    </div>
  );
}

// Free Edit Mode - Single WYSIWYG editor for the entire content
function FreeEditMode({ content, onUpdate, t }) {
  // Pre-process: strip figure wrappers for TipTap Image compatibility
  const processedContent = useMemo(() => {
    return content.replace(
      /<figure[^>]*>\s*(<img[^>]*>)\s*(?:<figcaption[^>]*>[\s\S]*?<\/figcaption>)?\s*<\/figure>/gi,
      '$1'
    );
  }, []); // Only compute on mount to avoid resetting editor
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Underline,
      TiptapImage.configure({
        inline: false,
        allowBase64: true,
      }),
      Placeholder.configure({
        placeholder: t('generatePost.preview.contentPlaceholder'),
      }),
    ],
    content: processedContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      // Post-process: restore figure wrappers around images
      let html = editor.getHTML();
      html = html.replace(/<img([^>]*)>/gi, (match, attrs) => {
        const altMatch = attrs.match(/alt="([^"]*)"/);
        const alt = altMatch ? altMatch[1] : '';
        return `<figure>${match}<figcaption>${alt}</figcaption></figure>`;
      });
      onUpdate(html);
    },
    editorProps: {
      attributes: {
        class: styles.freeEditor,
      },
    },
  });
  
  if (!editor) return null;
  
  return (
    <div className={styles.freeEditMode}>
      <div className={styles.freeToolbar}>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`${styles.toolbarBtn} ${editor.isActive('heading', { level: 2 }) ? styles.active : ''}`}
          title="H2"
        >
          <Heading2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`${styles.toolbarBtn} ${editor.isActive('heading', { level: 3 }) ? styles.active : ''}`}
          title="H3"
        >
          <Heading3 size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          className={`${styles.toolbarBtn} ${editor.isActive('heading', { level: 4 }) ? styles.active : ''}`}
          title="H4"
        >
          <Heading4 size={16} />
        </button>
        <div className={styles.toolbarDivider} />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${styles.toolbarBtn} ${editor.isActive('bold') ? styles.active : ''}`}
          title={t('generatePost.preview.bold')}
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${styles.toolbarBtn} ${editor.isActive('italic') ? styles.active : ''}`}
          title={t('generatePost.preview.italic')}
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${styles.toolbarBtn} ${editor.isActive('underline') ? styles.active : ''}`}
          title={t('generatePost.preview.underline')}
        >
          <UnderlineIcon size={16} />
        </button>
        <div className={styles.toolbarDivider} />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`${styles.toolbarBtn} ${editor.isActive('bulletList') ? styles.active : ''}`}
          title={t('generatePost.preview.bulletList')}
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`${styles.toolbarBtn} ${editor.isActive('orderedList') ? styles.active : ''}`}
          title={t('generatePost.preview.numberedList')}
        >
          <ListOrdered size={16} />
        </button>
        <div className={styles.toolbarDivider} />
        <button
          type="button"
          onClick={() => {
            const url = window.prompt(t('generatePost.preview.enterUrl'));
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }}
          className={`${styles.toolbarBtn} ${editor.isActive('link') ? styles.active : ''}`}
          title={t('generatePost.preview.addLink')}
        >
          <LinkIcon size={16} />
        </button>
        {editor.isActive('link') && (
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetLink().run()}
            className={styles.toolbarBtn}
            title={t('generatePost.preview.removeLink')}
          >
            <Unlink size={16} />
          </button>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
