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
export function InterviewStep({ translations, onComplete, initialData = {}, onAnswerSaved, alreadyCompleted = false }) {
  const { t, locale } = useLocale();
  const isRTL = locale === 'he';

  // Interview phases
  const PHASES = {
    URL_INPUT: 'url-input',
    DETECTING_LANGUAGES: 'detecting-languages',
    LANGUAGE_SELECT: 'language-select',
    ANALYZING: 'analyzing',
    CONFIRMATION: 'confirmation',
    COMPLETE: 'complete',
  };

  // When the user returns to the interview after already finishing it, skip
  // the whole flow and mount directly in COMPLETE with a summary view. The
  // analysis/confirmations are already saved on the server - re-running the
  // chat would wipe them.
  const isResumed = !!(alreadyCompleted && initialData?.analysis);

  const [phase, setPhase] = useState(isResumed ? PHASES.COMPLETE : PHASES.URL_INPUT);
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl || '');
  const [analysisData, setAnalysisData] = useState(isResumed ? initialData.analysis : null);
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

  // Confirmation questions - uses the analysis data and the user's prior
  // language choice. Accepts an optional `data` argument so callers that are
  // about to commit `setAnalysisData(data)` can build the list before React
  // has flushed state.
  const getConfirmationQuestions = (data = analysisData) => {
    if (!data) return [];

    const questions = [];

    // 1. Platform + language recap - the user already saw a URL probe, now we
    //    reveal what the full analysis found. Approve or edit.
    questions.push({
      id: 'platformLanguage',
      field: 'platformLanguage',
      type: 'confirm',
      getMessage: () => {
        const rawPlatform = data.platform?.name;
        const platformName = rawPlatform && rawPlatform !== 'Custom' ? rawPlatform : null;
        const effectiveLang = interviewData.selectedLanguage || data.contentStyle?.language;
        const langLabel = effectiveLang
          ? (effectiveLang === 'he'
              ? 'עברית'
              : effectiveLang === 'en'
                ? 'English'
                : getLanguageLabel(effectiveLang, locale))
          : (locale === 'he' ? 'עברית' : 'English');
        if (platformName) {
          return t('interviewWizard.proactive.platformLanguageConfirm', {
            platform: platformName,
            language: langLabel,
          });
        }
        return t('interviewWizard.proactive.platformLanguageConfirmNoPlatform', {
          language: langLabel,
        });
      },
      getDefaultValue: () => ({
        platform: data.platform?.name || null,
        language: interviewData.selectedLanguage || data.contentStyle?.language || null,
      }),
    });

    // 2. Business character - name + niche + description in one statement.
    questions.push({
      id: 'character',
      field: 'businessCharacter',
      type: 'confirm',
      getMessage: () => {
        const name = data.businessInfo?.name || t('interviewWizard.proactive.yourSite');
        const niche = data.businessInfo?.niche;
        const description = data.businessInfo?.description || '';
        let nicheClause = '';
        if (niche) {
          const key = `interviewWizard.proactive.niches.${niche}`;
          const translated = t(key);
          const nicheLabel = translated && translated !== key ? translated : niche;
          nicheClause = t('interviewWizard.proactive.characterNicheClause', { niche: nicheLabel });
        }
        return t('interviewWizard.proactive.characterConfirmIntro', {
          name,
          nicheClause,
          description,
        });
      },
      getDefaultValue: () => ({
        name: data.businessInfo?.name,
        niche: data.businessInfo?.niche,
        description: data.businessInfo?.description,
        confirmed: true,
      }),
    });

    // 3. Competitors (existing).
    questions.push({
      id: 'competitors',
      field: 'competitors',
      type: 'select',
      getMessage: () => {
        const count = data.competitors?.length || 0;
        return count > 0
          ? t('interviewWizard.proactive.competitorsFound', { count })
          : t('interviewWizard.proactive.competitorsAdd');
      },
      getDefaultValue: () => [],
    });

    // 4. Keywords (existing).
    questions.push({
      id: 'keywords',
      field: 'mainKeywords',
      type: 'confirm',
      getMessage: () => {
        const aiKeywords = data.keywords?.suggested
          ?.slice(0, 8)
          ?.map(k => typeof k === 'string' ? k : k.keyword) || [];
        return aiKeywords.length > 0
          ? t('interviewWizard.proactive.keywordsFound', { keywords: aiKeywords.join(', ') })
          : t('interviewWizard.proactive.keywordsAdd');
      },
      getDefaultValue: () =>
        data.keywords?.suggested
          ?.slice(0, 8)
          ?.map(k => typeof k === 'string' ? k : k.keyword) || [],
    });

    // 5. SEO issues audit - only if the rule-based detector surfaced any.
    const seoIssues = Array.isArray(data.seoIssues) ? data.seoIssues : [];
    if (seoIssues.length > 0) {
      questions.push({
        id: 'seoIssues',
        field: 'seoIssuesAcknowledged',
        type: 'continue',
        getMessage: () => t('interviewWizard.proactive.seoIssuesIntro', { count: seoIssues.length }),
        getDefaultValue: () => true,
        issues: seoIssues,
      });
    }

    return questions;
  };

  // Initialize with welcome message
  useEffect(() => {
    if (initialized) return;

    const welcomeMsg = t('interviewWizard.questions.welcome');
    const urlQuestion = t('registration.interview.questions.websiteUrl');

    if (isResumed) {
      // Rebuild a minimal transcript so the returning user sees evidence of
      // the prior conversation instead of a blank slate. The full Q&A isn't
      // reconstructed - the summary card below fills that role.
      const resumedMessages = [
        { id: 0, type: 'agent', content: welcomeMsg },
        { id: 1, type: 'agent', content: urlQuestion },
      ];
      if (initialData?.websiteUrl) {
        resumedMessages.push({ id: resumedMessages.length, type: 'user', content: initialData.websiteUrl });
      }
      resumedMessages.push({
        id: resumedMessages.length,
        type: 'agent',
        content: t('interviewWizard.proactive.resumedIntro') || t('interviewWizard.questions.complete'),
      });
      setMessages(resumedMessages);
      setInitialized(true);
      return;
    }

    setMessages([
      { id: 0, type: 'agent', content: welcomeMsg },
      { id: 1, type: 'agent', content: urlQuestion },
    ]);

    setInitialized(true);
  }, [initialized, t, isResumed, initialData]);

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

  // Handle URL submission. We now run a cheap language-variant probe first
  // (no AI) so we can ask the user to pick a locale BEFORE burning a full
  // analysis on the wrong variant.
  const handleUrlSubmit = async () => {
    const url = websiteUrl.trim();
    if (!url) return;

    setMessages(prev => [...prev, {
      id: prev.length,
      type: 'user',
      content: url,
    }]);

    // Clear any stale language choice carried over from a resumed draft.
    const { selectedLanguage, availableLanguages, ...rest } = interviewData || {};
    const newData = { ...rest, websiteUrl: url };
    setInterviewData(newData);
    onAnswerSaved?.(newData, false);

    setPhase(PHASES.DETECTING_LANGUAGES);
    setMessages(prev => [...prev, {
      id: prev.length,
      type: 'agent',
      content: t('interviewWizard.proactive.detectingLanguages'),
    }]);

    try {
      const res = await fetch('/api/interview/detect-languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (data?.success && Array.isArray(data.languages) && data.languages.length >= 2) {
        setLanguageOptions(data.languages);
        setPhase(PHASES.LANGUAGE_SELECT);
        setMessages(prev => [...prev, {
          id: prev.length,
          type: 'agent',
          content: t('interviewWizard.proactive.languagesFound', { count: data.languages.length }),
        }]);
        return;
      }

      // No multi-language variants - go straight into full analysis.
      // If the probe resolved to a canonical URL, use it.
      if (data?.url && data.url !== url) setWebsiteUrl(data.url);
      setPhase(PHASES.ANALYZING);
    } catch (err) {
      console.error('Language detection failed, proceeding to analysis:', err);
      // If the probe fails, fall through to the full analysis which will
      // surface its own error to the user if the site is truly unreachable.
      setPhase(PHASES.ANALYZING);
    }
  };

  // Handle analysis complete - save the analysis and kick off confirmation.
  // Multi-language detection already happened before analysis (in
  // handleUrlSubmit), so by the time we reach here the language variant is
  // locked in and we just need to surface the results.
  const handleAnalysisComplete = (data) => {
    setAnalysisData(data);

    const newData = {
      ...interviewData,
      analysis: data,
      platform: data.platform?.name || null,
      businessName: data.businessInfo?.name || null,
      businessDescription: data.businessInfo?.description || null,
      businessNiche: data.businessInfo?.niche || null,
      selectedLanguage: interviewData.selectedLanguage || data.contentStyle?.language || null,
      availableLanguages: interviewData.availableLanguages || data.languages || [],
    };
    setInterviewData(newData);
    onAnswerSaved?.(newData, false);

    startConfirmationFlow(data);
  };

  // Start the confirmation flow
  const startConfirmationFlow = (data) => {
    setPhase(PHASES.CONFIRMATION);
    setConfirmationStep(0);

    const questions = getConfirmationQuestions(data);
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

  // Handle user picking a language variant. At this point the full analysis
  // hasn't run yet - we just capture the choice, point at the variant URL,
  // and transition to ANALYZING so /analyze runs against the right locale.
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

    setWebsiteUrl(variant.url);
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
                : phase === PHASES.DETECTING_LANGUAGES
                  ? t('interviewWizard.proactive.detectingLanguages')
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
                    <Image src="/favicon-white.svg" alt="Ghost" width={20} height={20} />
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

          {/* SEO Issues audit (shown for the seoIssues continue-type question) */}
          {phase === PHASES.CONFIRMATION &&
           currentQuestion?.id === 'seoIssues' &&
           !isTyping && (
            <div className={styles.seoIssuesContainer}>
              <ul className={styles.seoIssuesList}>
                {(currentQuestion.issues || []).map((issue, idx) => {
                  const titleKey = `interviewWizard.proactive.seoIssues.${issue.type}.title`;
                  const descKey = `interviewWizard.proactive.seoIssues.${issue.type}.description`;
                  const title = t(titleKey, issue.meta || {});
                  const description = t(descKey, issue.meta || {});
                  return (
                    <li key={idx} className={styles.seoIssueItem}>
                      <div className={styles.seoIssueTitle}>{title}</div>
                      <div className={styles.seoIssueDescription}>{description}</div>
                    </li>
                  );
                })}
              </ul>
              <p className={styles.seoIssuesOutro}>
                {t('interviewWizard.proactive.seoIssuesOutro')}
              </p>
              <button
                className={`${styles.confirmButton} ${styles.confirmYes}`}
                onClick={() => handleConfirmation(true)}
              >
                <Check size={16} />
                {locale === 'he' ? 'להמשיך' : 'Continue'}
              </button>
            </div>
          )}

          {/* Typing Indicator */}
          {isTyping && (
            <div className={`${styles.interviewMessageRow} ${styles.agentRow}`}>
              <div className={`${styles.interviewMessageWrapper} ${styles.agentWrapper}`}>
                <div className={`${styles.interviewAvatar} ${styles.agentAvatar}`}>
                  <Image src="/favicon-white.svg" alt="Ghost" width={20} height={20} />
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
          {phase === PHASES.COMPLETE && !isResumed && (
            <div className={styles.interviewComplete}>
              <CheckCircle2 size={32} className={styles.completeIcon} />
            </div>
          )}

          {/* Resumed summary - shown when returning to an already-completed
              interview step. Recaps what we learned so the user has context,
              plus a Continue button to advance manually (no auto-advance). */}
          {phase === PHASES.COMPLETE && isResumed && (
            <div className={styles.interviewResumeSummary}>
              <div className={styles.interviewResumeHeader}>
                <CheckCircle2 size={20} className={styles.completeIcon} />
                <span>{t('interviewWizard.proactive.resumedHeader') || (locale === 'he' ? 'הראיון הושלם' : 'Interview completed')}</span>
              </div>
              <ul className={styles.interviewResumeList}>
                {initialData.websiteUrl && (
                  <li><strong>{locale === 'he' ? 'אתר' : 'Site'}:</strong> {initialData.websiteUrl}</li>
                )}
                {initialData.businessName && (
                  <li><strong>{locale === 'he' ? 'שם' : 'Name'}:</strong> {initialData.businessName}</li>
                )}
                {initialData.platform && (
                  <li><strong>{locale === 'he' ? 'פלטפורמה' : 'Platform'}:</strong> {initialData.platform}</li>
                )}
                {initialData.selectedLanguage && (
                  <li><strong>{locale === 'he' ? 'שפה' : 'Language'}:</strong> {getLanguageLabel(initialData.selectedLanguage, locale)}</li>
                )}
                {Array.isArray(initialData.mainKeywords) && initialData.mainKeywords.length > 0 && (
                  <li><strong>{locale === 'he' ? 'מילות מפתח' : 'Keywords'}:</strong> {initialData.mainKeywords.slice(0, 5).join(', ')}</li>
                )}
                {Array.isArray(initialData.competitors) && initialData.competitors.length > 0 && (
                  <li><strong>{locale === 'he' ? 'מתחרים' : 'Competitors'}:</strong> {initialData.competitors.length}</li>
                )}
              </ul>
              <button
                className={`${styles.confirmButton} ${styles.confirmYes}`}
                onClick={() => onComplete(initialData)}
              >
                <Check size={16} />
                {locale === 'he' ? 'להמשיך' : 'Continue'}
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        {phase !== PHASES.COMPLETE &&
         phase !== PHASES.ANALYZING &&
         phase !== PHASES.LANGUAGE_SELECT &&
         phase !== PHASES.DETECTING_LANGUAGES && (
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
