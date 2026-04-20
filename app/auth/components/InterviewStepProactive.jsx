'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, CheckCircle2, Check, X, Edit2, Globe } from 'lucide-react';
import Image from 'next/image';
import { useLocale } from '@/app/context/locale-context';
import { AnalysisProgress } from './AnalysisProgress';
import { CompetitorSelector } from './CompetitorSelector';
import styles from '../auth.module.css';

function getLanguageLabel(code, locale) {
  if (!code) return '';
  try {
    const label = new Intl.DisplayNames([locale], { type: 'language' }).of(code);
    if (label) return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    // Fall through
  }
  return code.toUpperCase();
}

/**
 * Proactive Onboarding Interview Step
 * Uses "Statement + Confirmation" pattern instead of open-ended questions
 */
export function InterviewStep({ translations, onComplete, initialData = {}, onAnswerSaved }) {
  const { t, locale } = useLocale();
  const isRTL = locale === 'he';

  // Interview phases
  const PHASES = {
    URL_INPUT: 'url-input',
    ANALYZING: 'analyzing',
    LANGUAGE_SELECT: 'language-select',
    CONFIRMATION: 'confirmation',
    COMPLETE: 'complete',
  };

  const [phase, setPhase] = useState(PHASES.URL_INPUT);
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl || '');
  const [analysisData, setAnalysisData] = useState(null);
  const [confirmationStep, setConfirmationStep] = useState(0);
  const [interviewData, setInterviewData] = useState(initialData || {});
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [selectedCompetitors, setSelectedCompetitors] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [languageOptions, setLanguageOptions] = useState([]);
  const [analyzeAttempt, setAnalyzeAttempt] = useState(0);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Confirmation questions - these use the analysis data
  const getConfirmationQuestions = () => {
    if (!analysisData) return [];
    
    const lang = locale === 'he' ? 'he' : 'en';
    
    return [
      {
        id: 'identity',
        field: 'businessIdentity',
        type: 'confirm',
        getMessage: () => {
          const name = analysisData.businessInfo?.name || t('interviewWizard.proactive.yourSite');
          const niche = analysisData.businessInfo?.niche;
          const nicheLabel = niche ? t(`interviewWizard.proactive.niches.${niche}`) : null;
          
          if (nicheLabel) {
            return t('interviewWizard.proactive.identityWithNiche', { name, niche: nicheLabel });
          }
          return t('interviewWizard.proactive.identityBasic', { name });
        },
        getDefaultValue: () => ({
          name: analysisData.businessInfo?.name,
          niche: analysisData.businessInfo?.niche,
          confirmed: true,
        }),
      },
      {
        id: 'goals',
        field: 'seoGoals',
        type: 'confirm',
        getMessage: () => {
          const goals = analysisData.inferredGoals || [];
          const goalLabels = goals.map(g => lang === 'he' ? g.labelHe : g.label).join(', ');
          return t('interviewWizard.proactive.goalsConfirm', { goals: goalLabels });
        },
        getDefaultValue: () => analysisData.inferredGoals?.map(g => g.id) || [],
      },
      {
        id: 'audience',
        field: 'targetAudience',
        type: 'confirm',
        getMessage: () => {
          const audience = analysisData.inferredAudience;
          return t('interviewWizard.proactive.audienceConfirm', { audience });
        },
        getDefaultValue: () => analysisData.inferredAudience,
      },
      {
        id: 'competitors',
        field: 'competitors',
        type: 'select',
        getMessage: () => {
          const count = analysisData.competitors?.length || 0;
          if (count > 0) {
            return t('interviewWizard.proactive.competitorsFound', { count });
          }
          return t('interviewWizard.proactive.competitorsAdd');
        },
        getDefaultValue: () => [],
      },
      {
        id: 'keywords',
        field: 'mainKeywords',
        type: 'confirm',
        getMessage: () => {
          // Use AI-suggested keywords (real SEO keywords)
          const aiKeywords = analysisData.keywords?.suggested
            ?.slice(0, 8)
            ?.map(k => typeof k === 'string' ? k : k.keyword) || [];
          
          if (aiKeywords.length > 0) {
            return t('interviewWizard.proactive.keywordsFound', { 
              keywords: aiKeywords.join(', ') 
            });
          }
          return t('interviewWizard.proactive.keywordsAdd');
        },
        getDefaultValue: () => {
          // Return AI-suggested keywords as the default value
          return analysisData.keywords?.suggested
            ?.slice(0, 8)
            ?.map(k => typeof k === 'string' ? k : k.keyword) || [];
        },
      },
    ];
  };

  // Initialize with welcome message
  useEffect(() => {
    if (initialized) return;
    
    const welcomeMsg = t('interviewWizard.questions.welcome');
    const urlQuestion = t('registration.interview.questions.websiteUrl');
    
    setMessages([
      { id: 0, type: 'agent', content: welcomeMsg },
      { id: 1, type: 'agent', content: urlQuestion },
    ]);
    
    setInitialized(true);
  }, [initialized, t]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when not typing
  useEffect(() => {
    if (!isTyping && phase === PHASES.CONFIRMATION) {
      inputRef.current?.focus();
    }
  }, [confirmationStep, isTyping, phase]);

  // Handle URL submission
  const handleUrlSubmit = () => {
    const url = websiteUrl.trim();
    if (!url) return;

    // Add user message
    setMessages(prev => [...prev, {
      id: prev.length,
      type: 'user',
      content: url,
    }]);

    // Save URL
    const newData = { ...interviewData, websiteUrl: url };
    setInterviewData(newData);
    onAnswerSaved?.(newData, false);

    // Start analysis
    setPhase(PHASES.ANALYZING);
  };

  // Handle analysis complete
  const handleAnalysisComplete = (data) => {
    // Multi-language sites: if we detected >= 2 variants and the user hasn't
    // already chosen one, branch into LANGUAGE_SELECT before continuing.
    if (!interviewData.selectedLanguage && Array.isArray(data?.languages) && data.languages.length >= 2) {
      setAnalysisData(data);
      setLanguageOptions(data.languages);
      setPhase(PHASES.LANGUAGE_SELECT);
      setMessages(prev => [...prev, {
        id: prev.length,
        type: 'agent',
        content: t('interviewWizard.proactive.languagesFound', { count: data.languages.length }),
      }]);
      return;
    }

    setAnalysisData(data);

    // Save analysis data to interviewData for later use (e.g., site creation)
    const newData = {
      ...interviewData,
      websiteUrl,
      analysis: data,
      // Also extract key info for easy access
      platform: data.platform?.name || null,
      businessName: data.businessInfo?.name || null,
      businessDescription: data.businessInfo?.description || null,
      businessNiche: data.businessInfo?.niche || null,
      selectedLanguage: interviewData.selectedLanguage || data.contentStyle?.language || null,
      availableLanguages: interviewData.availableLanguages || data.languages || [],
    };
    setInterviewData(newData);
    onAnswerSaved?.(newData, false);
    
    // Add analysis summary message
    const platformName = data.platform?.name && data.platform.name !== 'Custom'
      ? data.platform.name
      : null;
    // Prefer the language the user explicitly selected over whatever the
    // analyzer guessed — on multi-language variants the variant page may still
    // carry the root site's lang attribute, so auto-detection can be wrong.
    const effectiveLang = interviewData.selectedLanguage || data.contentStyle?.language;
    const langLabel = effectiveLang
      ? (effectiveLang === 'he'
          ? 'עברית'
          : effectiveLang === 'en'
            ? 'English'
            : getLanguageLabel(effectiveLang, locale))
      : null;
    
    // Only show detection message if we actually detected something
    let summaryMsg;
    if (platformName && langLabel) {
      summaryMsg = t('interviewWizard.proactive.analysisDone', {
        platform: platformName,
        language: langLabel,
      });
    } else if (platformName) {
      summaryMsg = t('interviewWizard.proactive.analysisDonePartial', {
        platform: platformName,
      }) || t('interviewWizard.proactive.analysisDone', {
        platform: platformName,
        language: locale === 'he' ? 'עברית' : 'English',
      });
    } else {
      summaryMsg = t('interviewWizard.proactive.analysisComplete') 
        || t('interviewWizard.proactive.analysisDone', {
          platform: t('interviewWizard.proactive.websitePlatform') || 'website',
          language: locale === 'he' ? 'עברית' : 'English',
        });
    }
    
    setMessages(prev => [...prev, {
      id: prev.length,
      type: 'agent',
      content: summaryMsg,
      isAnalysisSummary: true,
    }]);

    // Start confirmation flow
    setTimeout(() => {
      startConfirmationFlow(data);
    }, 1000);
  };

  // Start the confirmation flow
  const startConfirmationFlow = (data) => {
    setPhase(PHASES.CONFIRMATION);
    setConfirmationStep(0);
    
    // Show first confirmation question
    const questions = getConfirmationQuestions();
    if (questions.length > 0) {
      const firstQuestion = questions[0];
      setMessages(prev => [...prev, {
        id: prev.length,
        type: 'agent',
        content: firstQuestion.getMessage(),
        questionId: firstQuestion.id,
        questionType: firstQuestion.type,
      }]);
    }
  };

  // Handle user picking a language variant in a multi-language site.
  const handleLanguageSelect = (variant) => {
    const label = getLanguageLabel(variant.code, locale);

    setMessages(prev => [...prev, {
      id: prev.length,
      type: 'user',
      content: label,
    }]);

    const newData = {
      ...interviewData,
      websiteUrl: variant.url,
      selectedLanguage: variant.code,
      availableLanguages: languageOptions,
    };
    setInterviewData(newData);
    onAnswerSaved?.(newData, false);

    // Re-run analysis against the selected variant.
    setWebsiteUrl(variant.url);
    setAnalysisData(null);
    setLanguageOptions([]);
    setAnalyzeAttempt(c => c + 1);
    setPhase(PHASES.ANALYZING);
  };

  // Handle confirmation response
  const handleConfirmation = (confirmed, editedValue = null) => {
    const questions = getConfirmationQuestions();
    const currentQuestion = questions[confirmationStep];
    
    if (!currentQuestion) return;

    // Save the value
    const value = editedValue || currentQuestion.getDefaultValue();
    const newData = {
      ...interviewData,
      [currentQuestion.field]: confirmed ? value : editedValue,
    };
    setInterviewData(newData);

    // Add user response message
    const responseText = confirmed 
      ? (locale === 'he' ? '✓ מאושר' : '✓ Confirmed')
      : (locale === 'he' ? `✎ ${editedValue}` : `✎ ${editedValue}`);
    
    setMessages(prev => [...prev, {
      id: prev.length,
      type: 'user',
      content: responseText,
    }]);

    setIsTyping(true);

    // Move to next question or complete
    setTimeout(() => {
      const nextStep = confirmationStep + 1;
      
      if (nextStep >= questions.length) {
        // Interview complete
        completeInterview(newData);
      } else {
        setConfirmationStep(nextStep);
        const nextQuestion = questions[nextStep];
        
        setMessages(prev => [...prev, {
          id: prev.length,
          type: 'agent',
          content: nextQuestion.getMessage(),
          questionId: nextQuestion.id,
          questionType: nextQuestion.type,
        }]);
        
        setIsTyping(false);
        setEditingField(null);
        setInputValue('');
      }
    }, 600);
  };

  // Handle competitor selection (special case)
  const handleCompetitorConfirm = () => {
    const newData = {
      ...interviewData,
      competitors: selectedCompetitors,
    };
    setInterviewData(newData);

    // Add response
    const count = selectedCompetitors.length;
    const responseText = locale === 'he' 
      ? `✓ נבחרו ${count} מתחרים` 
      : `✓ Selected ${count} competitors`;
    
    setMessages(prev => [...prev, {
      id: prev.length,
      type: 'user',
      content: responseText,
    }]);

    setIsTyping(true);

    // Move to next
    setTimeout(() => {
      const questions = getConfirmationQuestions();
      const nextStep = confirmationStep + 1;
      
      if (nextStep >= questions.length) {
        completeInterview(newData);
      } else {
        setConfirmationStep(nextStep);
        const nextQuestion = questions[nextStep];
        
        setMessages(prev => [...prev, {
          id: prev.length,
          type: 'agent',
          content: nextQuestion.getMessage(),
          questionId: nextQuestion.id,
          questionType: nextQuestion.type,
        }]);
        
        setIsTyping(false);
      }
    }, 600);
  };

  // Complete the interview
  const completeInterview = async (data) => {
    // Add completion message
    setMessages(prev => [...prev, {
      id: prev.length,
      type: 'agent',
      content: t('interviewWizard.questions.complete'),
    }]);

    setPhase(PHASES.COMPLETE);
    setIsTyping(false);

    // Save final data
    await onAnswerSaved?.(data, true);

    // Auto-continue
    setTimeout(() => {
      onComplete(data);
    }, 2000);
  };

  // Handle text input submit (for URL or edit mode)
  const handleInputSubmit = () => {
    if (phase === PHASES.URL_INPUT) {
      handleUrlSubmit();
    } else if (editingField) {
      handleConfirmation(false, inputValue.trim());
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInputSubmit();
    }
  };

  // Get current question for rendering
  const getCurrentQuestion = () => {
    if (phase !== PHASES.CONFIRMATION) return null;
    const questions = getConfirmationQuestions();
    return questions[confirmationStep];
  };

  const currentQuestion = getCurrentQuestion();
  const progressPercentage = phase === PHASES.CONFIRMATION 
    ? ((confirmationStep + 1) / getConfirmationQuestions().length) * 100
    : phase === PHASES.URL_INPUT ? 10 : 5;

  return (
    <div className={styles.interviewStepContainer}>
      <div className={styles.interviewHeader}>
        <h2 className={styles.interviewTitle}>{translations.title}</h2>
        <p className={styles.interviewSubtitle}>{translations.subtitle}</p>
      </div>

      <div className={styles.interviewCard}>
        {/* Progress Bar */}
        <div className={styles.interviewProgress}>
          <div className={styles.interviewProgressHeader}>
            <span>
              {phase === PHASES.ANALYZING
                ? t('interviewWizard.proactive.analyzing')
                : phase === PHASES.LANGUAGE_SELECT
                  ? t('interviewWizard.proactive.selectingLanguage')
                  : phase === PHASES.CONFIRMATION
                    ? t('interviewWizard.questionProgress', {
                        current: confirmationStep + 1,
                        total: getConfirmationQuestions().length
                      })
                    : t('interviewWizard.proactive.gettingStarted')
              }
            </span>
          </div>
          <div className={styles.interviewProgressBar}>
            <div 
              className={styles.interviewProgressFill}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Messages Area */}
        <div className={styles.interviewMessages}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.interviewMessageRow} ${message.type === 'user' ? styles.userRow : styles.agentRow}`}
            >
              <div className={`${styles.interviewMessageWrapper} ${message.type === 'user' ? styles.userWrapper : styles.agentWrapper}`}>
                <div className={`${styles.interviewAvatar} ${message.type === 'agent' ? styles.agentAvatar : styles.userAvatar}`}>
                  {message.type === 'agent' ? (
                    <Image src="/ghostpost_logo.png" alt="Ghost" width={20} height={20} />
                  ) : (
                    <div className={styles.userDot}></div>
                  )}
                </div>
                <div className={`${styles.interviewBubble} ${message.type === 'agent' ? styles.agentBubble : styles.userBubble}`}>
                  <p>{message.content}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Analysis Progress (shown during analyzing phase) */}
          {phase === PHASES.ANALYZING && (
            <div className={styles.analysisContainer}>
              <AnalysisProgress
                key={`${websiteUrl}-${analyzeAttempt}`}
                url={websiteUrl}
                onComplete={handleAnalysisComplete}
                onError={(err) => {
                  const localized = typeof err === 'string' ? err : err?.message;
                  setMessages(prev => [...prev, {
                    id: prev.length,
                    type: 'agent',
                    content: localized || t('interviewWizard.proactive.errors.analysisFailed'),
                  }]);
                  setPhase(PHASES.URL_INPUT);
                }}
              />
            </div>
          )}

          {/* Language selector (shown when the site has multiple language variants) */}
          {phase === PHASES.LANGUAGE_SELECT && languageOptions.length > 0 && (
            <div className={styles.languageSelector}>
              {languageOptions.map((variant) => (
                <button
                  key={variant.code}
                  type="button"
                  className={styles.languageChip}
                  onClick={() => handleLanguageSelect(variant)}
                >
                  <Globe size={16} />
                  <span>{getLanguageLabel(variant.code, locale)}</span>
                  {variant.isDefault && (
                    <span className={styles.languageChipBadge}>
                      {t('interviewWizard.proactive.languageDefaultBadge')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Competitor Selector (shown for competitor question) */}
          {phase === PHASES.CONFIRMATION && 
           currentQuestion?.id === 'competitors' && 
           !isTyping && (
            <div className={styles.competitorContainer}>
              <CompetitorSelector
                competitors={analysisData?.competitors || []}
                selectedCompetitors={selectedCompetitors}
                onSelectionChange={setSelectedCompetitors}
                maxSelections={5}
              />
              <button 
                className={styles.confirmButton}
                onClick={handleCompetitorConfirm}
              >
                <Check size={16} />
                {t('interviewWizard.proactive.confirmSelection')}
              </button>
            </div>
          )}

          {/* Confirmation Buttons (shown for confirm-type questions) */}
          {phase === PHASES.CONFIRMATION && 
           currentQuestion?.type === 'confirm' && 
           currentQuestion?.id !== 'competitors' &&
           !isTyping && 
           !editingField && (
            <div className={styles.confirmationButtons}>
              <button 
                className={`${styles.confirmButton} ${styles.confirmYes}`}
                onClick={() => handleConfirmation(true)}
              >
                <Check size={16} />
                {locale === 'he' ? 'נכון' : 'Correct'}
              </button>
              <button 
                className={`${styles.confirmButton} ${styles.confirmEdit}`}
                onClick={() => setEditingField(currentQuestion.field)}
              >
                <Edit2 size={16} />
                {locale === 'he' ? 'לתקן' : 'Edit'}
              </button>
            </div>
          )}

          {/* Typing Indicator */}
          {isTyping && (
            <div className={`${styles.interviewMessageRow} ${styles.agentRow}`}>
              <div className={`${styles.interviewMessageWrapper} ${styles.agentWrapper}`}>
                <div className={`${styles.interviewAvatar} ${styles.agentAvatar}`}>
                  <Image src="/ghostpost_logo.png" alt="Ghost" width={20} height={20} />
                </div>
                <div className={`${styles.interviewBubble} ${styles.agentBubble}`}>
                  <div className={styles.typingIndicator}>
                    <div className={styles.typingDot} style={{ animationDelay: '0ms' }}></div>
                    <div className={styles.typingDot} style={{ animationDelay: '150ms' }}></div>
                    <div className={styles.typingDot} style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Completion */}
          {phase === PHASES.COMPLETE && (
            <div className={styles.interviewComplete}>
              <CheckCircle2 size={32} className={styles.completeIcon} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        {phase !== PHASES.COMPLETE && phase !== PHASES.ANALYZING && phase !== PHASES.LANGUAGE_SELECT && (
          <div className={styles.interviewInputArea}>
            {/* URL Input */}
            {phase === PHASES.URL_INPUT && (
              <div className={styles.interviewInputWrapper}>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={t('interviewWizard.proactive.urlPlaceholder')}
                  className={styles.interviewInput}
                  dir="ltr"
                  autoFocus
                />
                <button
                  onClick={handleUrlSubmit}
                  disabled={!websiteUrl.trim()}
                  className={styles.interviewSendBtn}
                >
                  <Send size={18} />
                </button>
              </div>
            )}

            {/* Edit Input (shown when user wants to edit a confirmation) */}
            {phase === PHASES.CONFIRMATION && editingField && (
              <div className={styles.interviewInputWrapper}>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={t('interviewWizard.proactive.editPlaceholder')}
                  className={styles.interviewInput}
                  autoFocus
                />
                <button
                  onClick={() => {
                    setEditingField(null);
                    setInputValue('');
                  }}
                  className={styles.cancelEditBtn}
                >
                  <X size={18} />
                </button>
                <button
                  onClick={handleInputSubmit}
                  disabled={!inputValue.trim()}
                  className={styles.interviewSendBtn}
                >
                  <Send size={18} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default InterviewStep;
