'use client';

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, CheckCircle2, Loader2, ChevronDown, Edit2, Check, RotateCcw, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { useLocale } from '@/app/context/locale-context';
import AddCreditsModal from '@/app/components/ui/AddCreditsModal';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import { EntitiesSelectionPanel } from '@/app/components/ui/EntitiesSelectionPanel';
import { useEntitiesScan } from '@/app/hooks/useEntitiesScan';
import styles from './interview-wizard.module.css';

export const InterviewWizard = forwardRef(function InterviewWizard({ onClose, onComplete, site }, ref) {
  const { t, dictionary, locale, isLoading: isDictionaryLoading } = useLocale();
  const { isMaximized, toggleMaximize } = useModalResize();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [interviewId, setInterviewId] = useState(null);
  const [responses, setResponses] = useState({});
  const responsesRef = useRef({});
  // Keep ref in sync so setTimeout closures always read the latest responses
  useEffect(() => { responsesRef.current = responses; }, [responses]);
  const [externalData, setExternalData] = useState({});
  const [editableData, setEditableData] = useState({});
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [urlSuggestion, setUrlSuggestion] = useState(null);
  const [questionsData, setQuestionsData] = useState(null);
  // AI suggestions state for INPUT_WITH_AI questions
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState([]);
  const [isLoadingAiSuggestions, setIsLoadingAiSuggestions] = useState(false);
  const [aiSuggestionsPhase, setAiSuggestionsPhase] = useState('input'); // 'input' | 'suggestions' | 'confirmed'
  // AI_SUGGESTION state - for questions that show AI-recommended option
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const [isLoadingAiRecommendation, setIsLoadingAiRecommendation] = useState(false);
  // Platform detection state
  const [detectedPlatform, setDetectedPlatform] = useState(null);
  const [isDetectingPlatform, setIsDetectingPlatform] = useState(false);
  // Dynamic question state (for FETCH_ARTICLES, etc.)
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [isLoadingDynamicOptions, setIsLoadingDynamicOptions] = useState(false);
  const [selectedDynamicOptions, setSelectedDynamicOptions] = useState([]);
  // Blog discovery fallback state
  const [blogDiscoveryPhase, setBlogDiscoveryPhase] = useState('initial'); // 'initial' | 'askHasBlog' | 'enterUrl' | 'fetching' | 'done'
  const [manualBlogUrl, setManualBlogUrl] = useState('');
  const [blogFetchError, setBlogFetchError] = useState(null);
  // Competitor suggestions state
  const [competitorSuggestions, setCompetitorSuggestions] = useState([]);
  const [isLoadingCompetitors, setIsLoadingCompetitors] = useState(false);
  const [selectedCompetitors, setSelectedCompetitors] = useState([]);
  // Internal links default value
  const [internalLinksDefault, setInternalLinksDefault] = useState(null);
  // Interview start state (for greeting before questions)
  const [hasStarted, setHasStarted] = useState(false);
  // Auto action state (for AUTO_ACTION questions)
  const [isAutoActionRunning, setIsAutoActionRunning] = useState(false);
  const autoActionInProgress = useRef(false); // Use ref to avoid stale closure issues
  // Auto action error state (e.g., website unreachable)
  const [autoActionError, setAutoActionError] = useState(null);
  // Ai-GCoins error state
  const [creditsError, setCreditsError] = useState(null);
  // Edit modal state for EDITABLE_DATA
  const [showEditModal, setShowEditModal] = useState(false);
  const [editableDataConfirmed, setEditableDataConfirmed] = useState(false);
  // Searchable select filter state
  const [searchFilter, setSearchFilter] = useState('');
  // Edit message state
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editContent, setEditContent] = useState('');
  // Google Integration state
  const [interviewSiteId, setInterviewSiteId] = useState(null);
  const [googleIntegrationStatus, setGoogleIntegrationStatus] = useState('idle'); // 'idle' | 'connecting' | 'connected' | 'error'
  const [isGoogleAlreadyConnected, setIsGoogleAlreadyConnected] = useState(false); // Pre-check: skip GOOGLE_INTEGRATION if already connected
  // WordPress Plugin connection state
  const [wpPluginStatus, setWpPluginStatus] = useState('idle'); // 'idle' | 'downloaded' | 'checking' | 'connected' | 'error'
  const wpPluginPollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messageIdCounter = useRef(0);
  // Tracks whether a competitor search is in flight (foreground or
  // background prefetch). Defined here at the top of the component because
  // both the early prefetch effect and the on-question fallback effect
  // reference it; declaring it inline next to one of them caused a TDZ
  // error in the prefetch path.
  const competitorSearchInProgress = useRef(false);

  // Entity-scan hook for the optional ENTITIES_SELECTION sub-step. When the
  // site has no enabled entity types, fetchInterview injects an
  // ENTITIES_SELECTION question into the questions array so the user can
  // pick what to import. When the site already has entity types, the hook's
  // initial load returns COMPLETED and the panel skips silently.
  const entitiesScan = useEntitiesScan({ type: 'site', siteId: site?.id });

  // Retry the entity scan when the WP plugin transitions to 'connected', if
  // an earlier scan attempt FAILED. The plugin gives us access to the REST
  // API content endpoints, so a previously-blocked / non-WP / WAF-dropped
  // discover may now work. Silent retry - the user has likely already
  // passed the entity panel by this point, so we just refresh the data on
  // the site for the dashboard to use later. EMPTY scans aren't retried;
  // the spec says "if the discover or population failed" specifically.
  const lastWpStatusRef = useRef(wpPluginStatus);
  useEffect(() => {
    if (
      wpPluginStatus === 'connected' &&
      lastWpStatusRef.current !== 'connected' &&
      entitiesScan.status === 'FAILED'
    ) {
      entitiesScan.triggerScan({});
    }
    lastWpStatusRef.current = wpPluginStatus;
  }, [wpPluginStatus, entitiesScan.status, entitiesScan.triggerScan]);

  // Debug: Log component mount and state
  console.log('[InterviewWizard] Rendering - loading:', loading, 'isDictionaryLoading:', isDictionaryLoading, 'error:', error);

  // Lock body scroll when wizard is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = originalOverflow;
      // Clean up WP plugin polling on unmount
      if (wpPluginPollRef.current) {
        clearInterval(wpPluginPollRef.current);
        wpPluginPollRef.current = null;
      }
    };
  }, []);

  // Fetch interview data on mount
  useEffect(() => {
    console.log('[InterviewWizard] useEffect - calling fetchInterview');
    fetchInterview();
  }, []);

  // Check if dictionary is ready (loaded and not empty)
  const isDictionaryReady = !isDictionaryLoading && dictionary && Object.keys(dictionary).length > 0;

  // Initialize messages when dictionary is loaded AND interview has started
  // If resuming an interview (currentQuestionIndex > 0), restore full chat history
  useEffect(() => {
    console.log('[InterviewWizard] Message init check:', { 
      isDictionaryReady, 
      questionsDataLength: questionsData?.length,
      messagesLength: messages.length,
      hasStarted,
      currentQuestionIndex,
      responsesKeys: Object.keys(responses)
    });
    if (hasStarted && isDictionaryReady && questionsData?.length > 0 && messages.length === 0) {
      const messagesToAdd = [];
      
      // If we're resuming an interview (have responses), reconstruct the chat history
      if (currentQuestionIndex > 0 && Object.keys(responses).length > 0) {
        console.log('[InterviewWizard] Restoring chat history for resumed interview');
        
        // Reconstruct messages for all answered questions
        for (let i = 0; i < currentQuestionIndex && i < questionsData.length; i++) {
          const question = questionsData[i];
          const questionText = t(question.translationKey);
          const responseValue = responses[question.id];
          
          // Skip questions that were auto-skipped (no response)
          if (responseValue === undefined || responseValue === null) {
            continue;
          }
          
          // Add agent question message
          const agentMsgId = messageIdCounter.current++;
          messagesToAdd.push({
            id: `msg-${agentMsgId}`,
            type: 'agent',
            content: questionText,
            questionType: question.questionType,
            inputConfig: question.inputConfig,
            questionId: question.id,
            timestamp: new Date()
          });
          
          // Add user response message (format response for display)
          const userMsgId = messageIdCounter.current++;
          let displayResponse = responseValue;
          
          // Format response based on question type for better display
          if (Array.isArray(responseValue)) {
            displayResponse = responseValue.join(', ');
          } else if (typeof responseValue === 'object') {
            displayResponse = JSON.stringify(responseValue);
          }
          
          messagesToAdd.push({
            id: `msg-${userMsgId}`,
            type: 'user',
            content: String(displayResponse),
            questionId: question.id,
            timestamp: new Date()
          });
        }
      }
      
      // Add current question message
      const currentQuestion = questionsData[currentQuestionIndex];
      if (currentQuestion) {
        const questionText = t(currentQuestion.translationKey);
        console.log('[InterviewWizard] Adding current question message:', { 
          translationKey: currentQuestion.translationKey,
          questionText,
          questionType: currentQuestion.questionType
        });
        const messageId = messageIdCounter.current++;
        messagesToAdd.push({
          id: `msg-${messageId}`,
          type: 'agent',
          content: questionText,
          questionType: currentQuestion.questionType,
          inputConfig: currentQuestion.inputConfig,
          questionId: currentQuestion.id,
          timestamp: new Date()
        });
      }
      
      setMessages(messagesToAdd);
    }
  }, [isDictionaryReady, questionsData, messages.length, t, hasStarted, currentQuestionIndex, responses]);

  // Handle starting the interview
  const handleStartInterview = () => {
    console.log('[InterviewWizard] Starting interview');
    setHasStarted(true);
  };

  // Check Ai-GCoin balance on mount
  useEffect(() => {
    const checkCredits = async () => {
      try {
        const res = await fetch('/api/credits/balance');
        if (res.ok) {
          const data = await res.json();
          // -1 means unlimited
          if (data.limit !== -1 && data.used >= data.limit) {
            setCreditsError({
              message: t('interviewWizard.errors.insufficientCredits') || 'Insufficient Ai-GCoins',
              currentUsage: data.used,
              limit: data.limit,
            });
          }
        }
      } catch (err) {
        console.error('[InterviewWizard] Error checking credits:', err);
      }
    };
    checkCredits();
  }, []);

  // Check if Google is already connected for this site
  useEffect(() => {
    const checkGoogleIntegration = async () => {
      const siteId = interviewSiteId || site?.id;
      if (!siteId) return;
      
      try {
        const res = await fetch(`/api/settings/integrations/google?siteId=${siteId}`);
        if (res.ok) {
          const data = await res.json();
          // Consider connected if refresh token exists (user authorized the app)
          if (data.connected || data.refreshToken) {
            console.log('[InterviewWizard] Google integration already connected for site:', siteId);
            setIsGoogleAlreadyConnected(true);
          }
        }
      } catch (err) {
        console.error('[InterviewWizard] Error checking Google integration:', err);
      }
    };
    checkGoogleIntegration();
  }, [interviewSiteId, site?.id]);

  // Auto-skip GOOGLE_INTEGRATION if already connected when interview loads on that question
  useEffect(() => {
    if (!questionsData || currentQuestionIndex === undefined) return;
    if (!isGoogleAlreadyConnected) return;
    
    const currentQuestion = questionsData[currentQuestionIndex];
    if (currentQuestion?.questionType === 'GOOGLE_INTEGRATION') {
      console.log('[InterviewWizard] Current question is GOOGLE_INTEGRATION but already connected - auto-skipping');
      // Auto-advance by submitting 'connected' as the response
      handleSubmit('connected');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGoogleAlreadyConnected, questionsData, currentQuestionIndex]);

  const fetchInterview = async () => {
    console.log('[InterviewWizard] fetchInterview started, site:', site?.url);
    try {
      setLoading(true);
      // Include siteId in the request if a site is provided
      const url = site?.id ? `/api/interview?siteId=${site.id}` : '/api/interview';
      const res = await fetch(url);
      console.log('[InterviewWizard] API response status:', res.status);
      if (!res.ok) {
        if (res.status === 401) {
          console.log('[InterviewWizard] 401 Unauthorized - setting error');
          setError('Please log in to continue');
          return;
        }
        throw new Error('Failed to fetch interview');
      }
      const data = await res.json();
      console.log('[InterviewWizard] API data:', {
        questionsCount: data.questions?.length,
        interview: data.interview?.id,
        firstQuestion: data.questions?.[0]?.translationKey
      });

      let questions = data.questions || [];

      // Inject an ENTITIES_SELECTION question for sites that have never had
      // entities populated. The position is just before the WORDPRESS_PLUGIN
      // question so the order matches the registration chat (and the user
      // spec: "before the plugin, GSC and GA4 connections"). If the site
      // already has enabled entity types, we skip injection - the user
      // already went through this in registration or on the dashboard.
      if (site?.id && !questions.some(q => q.questionType === 'ENTITIES_SELECTION')) {
        try {
          const typesRes = await fetch(`/api/entities/types?siteId=${site.id}`);
          if (typesRes.ok) {
            const typesData = await typesRes.json();
            const hasEnabled = (typesData?.types || []).some(t => t.isEnabled);
            if (!hasEnabled) {
              const entitiesQuestion = {
                id: 'entities-selection-injected',
                translationKey: 'interviewWizard.entitiesSelection.intro',
                questionType: 'ENTITIES_SELECTION',
                inputConfig: {},
              };
              const pluginIdx = questions.findIndex(q => q.questionType === 'WORDPRESS_PLUGIN');
              if (pluginIdx >= 0) {
                questions = [
                  ...questions.slice(0, pluginIdx),
                  entitiesQuestion,
                  ...questions.slice(pluginIdx),
                ];
              } else {
                questions = [...questions, entitiesQuestion];
              }
            }
          }
        } catch (e) {
          // Silent: failing to inject just means the panel won't appear.
          // The user can still hit /dashboard/entities directly.
          console.warn('[InterviewWizard] Entity-types probe failed:', e.message);
        }
      }

      setQuestions(questions);
      setQuestionsData(questions);
      setInterviewId(data.interview?.id);
      setInterviewSiteId(data.interview?.siteId || site?.id || null);
      setResponses(data.interview?.responses || {});
      setExternalData(data.interview?.externalData || {});
      setCurrentQuestionIndex(data.interview?.currentQuestionIndex || 0);
      
      // Initialize editable data from crawled data if available
      if (data.interview?.externalData?.crawledData) {
        const crawled = data.interview.externalData.crawledData;
        setEditableData({
          businessName: crawled.businessName || '',
          phone: crawled.phones?.[0] || crawled.phone || '',
          email: crawled.emails?.[0] || crawled.email || '',
          about: crawled.description || '',
          category: crawled.category || '',
          address: crawled.address || '',
        });
      }
    } catch (err) {
      console.error('Error fetching interview:', err);
      setError('Failed to load interview. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
    }, 300);
  };

  useImperativeHandle(ref, () => ({
    close: handleClose
  }));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // When dynamic options (e.g. fetched blog posts grid) finish loading or
  // change size, the panel below the chat grows and pushes the active
  // question off-screen. Re-scroll so the user can see the new grid + the
  // confirm/skip actions without manually scrolling.
  useEffect(() => {
    if (!isLoadingDynamicOptions && dynamicOptions.length > 0) {
      // Use rAF + small delay so the layout has flushed before we scroll.
      const id = requestAnimationFrame(() => {
        setTimeout(() => scrollToBottom(), 50);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isLoadingDynamicOptions, dynamicOptions.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentQuestionIndex]);

  // Debug: Log when externalData or editableData changes
  useEffect(() => {
    console.log('[State Change] externalData:', externalData);
    console.log('[State Change] externalData.crawledData:', externalData?.crawledData);
  }, [externalData]);

  useEffect(() => {
    console.log('[State Change] editableData:', editableData);
  }, [editableData]);

  // Set default values from crawled data when question changes
  useEffect(() => {
    if (!questionsData || currentQuestionIndex === undefined) return;
    
    const currentQuestion = questionsData[currentQuestionIndex];
    if (!currentQuestion) return;
    
    const config = currentQuestion.inputConfig || {};
    
    // Handle defaultFromCrawl for SELECTION questions
    if (currentQuestion.questionType === 'SELECTION' && config.defaultFromCrawl) {
      const crawledData = externalData?.crawledData || {};
      let defaultValue = crawledData[config.defaultFromCrawl];

      // For language: prefer the site's already-chosen contentLanguage over auto-detection
      // (the user may have picked a specific language variant when adding the site)
      if (config.defaultFromCrawl === 'language' && site?.contentLanguage) {
        defaultValue = site.contentLanguage;
      }

      // For detectedCountry: also derive from user's contentLanguage response
      // (more reliable since the user may have changed the language in Q2)
      if (config.defaultFromCrawl === 'detectedCountry' && !defaultValue) {
        const contentLang = site?.contentLanguage || responses?.contentLanguage || crawledData.language;
        if (contentLang) {
          const langToCountry = {
            he: 'IL', ar: 'AE', ja: 'JP', ko: 'KR', zh: 'CN', ru: 'RU',
            pt: 'BR', de: 'DE', fr: 'FR', es: 'ES', it: 'IT', nl: 'NL',
            pl: 'PL', sv: 'SE', no: 'NO', da: 'DK', fi: 'FI', el: 'GR',
            tr: 'TR', th: 'TH', vi: 'VN', id: 'ID', ms: 'MY', hi: 'IN',
            en: 'worldwide',
          };
          defaultValue = langToCountry[contentLang] || 'worldwide';
          console.log('[Default from Language] Derived country from contentLanguage:', contentLang, '->', defaultValue);
        }
      }
      
      if (defaultValue && !inputValue) {
        console.log('[Default from Crawl] Setting', config.defaultFromCrawl, 'to:', defaultValue);
        setInputValue(defaultValue);
      }
    }
  }, [currentQuestionIndex, questionsData, externalData]);

  // Trigger AI analysis for AI_SUGGESTION questions
  useEffect(() => {
    if (!questionsData || currentQuestionIndex === undefined) return;
    
    const currentQuestion = questionsData[currentQuestionIndex];
    if (!currentQuestion) return;
    
    // Only for AI_SUGGESTION questions with a suggestionsSource
    if (currentQuestion.questionType !== 'AI_SUGGESTION') return;
    
    // Skip AI actions if credits are exhausted
    if (creditsError) return;
    
    const config = currentQuestion.inputConfig || {};
    const source = config.suggestionsSource;
    
    // Handle Writing Style analysis
    if (source === 'analyzeWritingStyle') {
      // Check if we already have the analysis in externalData
      if (externalData?.writingStyleAnalysis) {
        const analysis = externalData.writingStyleAnalysis;
        setAiRecommendation({
          value: analysis.style?.tone || 'professional',
          confidence: analysis.style?.confidence || 0.5,
          characteristics: analysis.style?.characteristics || [],
        });
        return;
      }
      
      // Trigger the analysis action
      const triggerWritingStyleAnalysis = async () => {
        if (isLoadingAiRecommendation) return;
        
        setIsLoadingAiRecommendation(true);
        const websiteUrl = responses.websiteUrl || externalData?.crawledData?.url;
        
        if (!websiteUrl) {
          setIsLoadingAiRecommendation(false);
          return;
        }
        
        try {
          const result = await triggerAiAction('ANALYZE_WRITING_STYLE', { url: websiteUrl });
          
          if (result.success) {
            const analysis = result.externalData?.writingStyleAnalysis || result.result;
            if (analysis?.style) {
              setAiRecommendation({
                value: analysis.style.tone,
                confidence: analysis.style.confidence || 0.5,
                characteristics: analysis.style.characteristics || [],
              });
            }
          }
        } catch (err) {
          console.error('Error triggering AI analysis:', err);
        } finally {
          setIsLoadingAiRecommendation(false);
        }
      };
      
      triggerWritingStyleAnalysis();
      return;
    }
    
    // Handle Keywords generation
    if (source === 'generateKeywords') {
      // Filter out keywords with dynamic placeholders like [עיר], [שם], etc.
      const filterPlaceholders = (keywords) => 
        keywords.filter(k => !/\[.*?\]/.test(typeof k === 'string' ? k : k.keyword));
      
      // Check if we already have keywords in externalData
      if (externalData?.keywordSuggestions && externalData.keywordSuggestions.length > 0) {
        const filtered = filterPlaceholders(externalData.keywordSuggestions);
        setAiSuggestions(filtered);
        // Pre-select primary keywords
        const preSelected = filtered
          .filter(k => k.type === 'primary')
          .slice(0, 10)
          .map(k => k.keyword);
        setSelectedSuggestions(preSelected);
        return;
      }
      
      // Trigger keywords generation
      const triggerKeywordsGeneration = async () => {
        if (isLoadingAiSuggestions) return;
        
        setIsLoadingAiSuggestions(true);
        const websiteUrl = responses.websiteUrl || externalData?.crawledData?.url;
        
        try {
          const result = await triggerAiAction('GENERATE_KEYWORDS', { 
            url: websiteUrl,
            category: externalData?.crawledData?.category,
          });
          
          if (result.success) {
            const rawKeywords = result.externalData?.keywordSuggestions || result.result?.keywords || [];
            const keywords = filterPlaceholders(rawKeywords);
            if (keywords.length > 0) {
              setAiSuggestions(keywords);
              // Pre-select primary keywords
              const preSelected = keywords
                .filter(k => k.type === 'primary')
                .slice(0, 10)
                .map(k => k.keyword);
              setSelectedSuggestions(preSelected);
            }
          }
        } catch (err) {
          console.error('Error generating keywords:', err);
        } finally {
          setIsLoadingAiSuggestions(false);
        }
      };
      
      triggerKeywordsGeneration();
    }
  }, [currentQuestionIndex, questionsData]);

  // Trigger platform detection for websitePlatform question (detection only, no auto-submit)
  useEffect(() => {
    if (!questionsData || currentQuestionIndex === undefined) return;
    
    const currentQuestion = questionsData[currentQuestionIndex];
    if (!currentQuestion) return;
    
    // Only for the websitePlatform question
    if (currentQuestion.saveToField !== 'websitePlatform') return;
    
    // First priority: Check if site already has platform saved (from entities page or previous detection)
    if (site?.platform) {
      setDetectedPlatform({ platform: site.platform, confidence: 1.0 });
      return;
    }
    
    // Check if we already have platform data in externalData
    if (externalData?.platformData?.platform) {
      setDetectedPlatform(externalData.platformData);
      return;
    }
    
    // Check if platform was detected during crawl
    if (externalData?.crawledData?.platform) {
      setDetectedPlatform({ platform: externalData.crawledData.platform, confidence: 0.9 });
      return;
    }
    
    // Trigger platform detection
    const detectPlatform = async () => {
      if (isDetectingPlatform) return;
      
      setIsDetectingPlatform(true);
      const websiteUrl = responses.websiteUrl || externalData?.crawledData?.url;
      
      if (!websiteUrl) {
        setIsDetectingPlatform(false);
        return;
      }
      
      try {
        const result = await triggerAiAction('DETECT_PLATFORM', { url: websiteUrl });
        
        if (result.success) {
          const platformData = result.externalData?.platformData || result.result;
          if (platformData?.platform) {
            setDetectedPlatform(platformData);
          }
        }
      } catch (err) {
        console.error('Error detecting platform:', err);
      } finally {
        setIsDetectingPlatform(false);
      }
    };
    
    detectPlatform();
  }, [currentQuestionIndex, questionsData, site?.platform]);

  // Trigger article fetching for DYNAMIC questions with articles source
  useEffect(() => {
    if (!questionsData || currentQuestionIndex === undefined) return;
    
    const currentQuestion = questionsData[currentQuestionIndex];
    if (!currentQuestion) return;
    
    // Only for DYNAMIC questions with articles source (crawledArticles or fetchedArticles)
    const config = currentQuestion.inputConfig || {};
    const isArticlesQuestion = currentQuestion.questionType === 'DYNAMIC' && 
      (config.optionsSource === 'crawledArticles' || config.optionsSource === 'fetchedArticles');
    
    if (!isArticlesQuestion) return;
    
    // Check if we already have articles in externalData
    if (externalData?.articles && externalData.articles.length > 0) {
      setDynamicOptions(externalData.articles);
      return;
    }
    
    // Trigger article fetching
    const fetchArticles = async () => {
      if (isLoadingDynamicOptions) return;
      
      setIsLoadingDynamicOptions(true);
      const websiteUrl = responses.websiteUrl || externalData?.crawledData?.url;
      
      if (!websiteUrl) {
        setIsLoadingDynamicOptions(false);
        return;
      }
      
      try {
        const result = await triggerAiAction('FETCH_ARTICLES', { url: websiteUrl });
        
        if (result.success) {
          const articles = result.externalData?.articles || result.result?.articles || [];
          if (articles.length > 0) {
            setDynamicOptions(articles);
          }
        }
      } catch (err) {
        console.error('Error fetching articles:', err);
      } finally {
        setIsLoadingDynamicOptions(false);
      }
    };
    
    fetchArticles();
  }, [currentQuestionIndex, questionsData]);

  // Handle AUTO_ACTION questions - automatically trigger action and advance
  useEffect(() => {
    if (!questionsData || currentQuestionIndex === undefined) return;
    
    const currentQuestion = questionsData[currentQuestionIndex];
    if (!currentQuestion) return;
    
    // Only for AUTO_ACTION questions
    if (currentQuestion.questionType !== 'AUTO_ACTION') return;
    
    // Skip if credits are exhausted
    if (creditsError) return;
    
    const config = currentQuestion.inputConfig || {};
    // Support multiple config formats: 'autoAction', 'actionToRun', or 'autoActions' array
    const actionName = config.autoAction || config.actionToRun || 
      (currentQuestion.autoActions?.[0]?.action);
    
    if (!actionName) {
      console.warn('[InterviewWizard] AUTO_ACTION question missing action config:', currentQuestion);
      return;
    }
    
    // Run the auto action
    const runAutoAction = async () => {
      // Use ref to avoid stale closure issues
      if (autoActionInProgress.current) {
        console.log('[InterviewWizard] Auto-action already in progress, skipping');
        return;
      }
      
      autoActionInProgress.current = true;
      console.log('[InterviewWizard] Running auto-action:', actionName);
      setIsAutoActionRunning(true);
      setAutoActionError(null); // Clear previous errors
      const websiteUrl = responses.websiteUrl || externalData?.crawledData?.url;
      
      try {
        const result = await triggerAiAction(actionName, { url: websiteUrl });
        console.log('[InterviewWizard] Auto-action result:', result);
        
        if (result.success) {
          // If action stores articles, update dynamicOptions for next question
          if (result.externalData?.articles) {
            console.log('[InterviewWizard] Articles stored:', result.externalData.articles.length);
            setDynamicOptions(result.externalData.articles);
          }
          
          // Auto-advance to next question after successful action
          const submitResult = await submitResponse(currentQuestion.id, 'auto_completed');
          if (submitResult.success) {
            moveToNextQuestion();
          }
        } else {
          console.warn('[InterviewWizard] Auto-action failed:', result.error);
          // Show error to user (e.g., website unreachable, credits insufficient)
          if (result.creditsError) {
            setCreditsError(result.creditsError);
          } else {
            setAutoActionError({
              actionName,
              error: result.error || t('interviewWizard.errors.autoActionFailed') || 'Something went wrong. Please try again.',
            });
          }
        }
      } catch (err) {
        console.error('[InterviewWizard] Error running auto action:', err);
        if (err.creditsError) {
          setCreditsError(err.creditsError);
        } else {
          setAutoActionError({
            actionName,
            error: err.message || t('interviewWizard.errors.autoActionFailed') || 'Something went wrong. Please try again.',
          });
        }
      } finally {
        setIsAutoActionRunning(false);
        autoActionInProgress.current = false;
      }
    };
    
    runAutoAction();
  }, [currentQuestionIndex, questionsData]);

  // Handle competitor finding for AI_SUGGESTION questions with findCompetitors source.
  // (competitorSearchInProgress ref declared at the top of the component so
  // the prefetch effect can also touch it.)
  useEffect(() => {
    // Early exit if a competitor search was already completed or is in progress
    if (competitorSearchInProgress.current) return;
    
    if (!questionsData || currentQuestionIndex === undefined) return;
    
    // Skip if credits are exhausted
    if (creditsError) return;
    
    const currentQuestion = questionsData[currentQuestionIndex];
    if (!currentQuestion) return;
    
    // Only for AI_SUGGESTION questions with findCompetitors source
    if (currentQuestion.questionType !== 'AI_SUGGESTION') return;
    
    const config = currentQuestion.inputConfig || {};
    if (config.suggestionsSource !== 'findCompetitors') return;
    
    console.log('[findCompetitors] Competitor question detected, checking keywords...');
    console.log('[findCompetitors] Current responses:', Object.keys(responses));
    console.log('[findCompetitors] responses.keywords:', responses.keywords);
    
    // Get selected keywords from responses
    const selectedKeywords = responses.keywords || [];
    if (selectedKeywords.length === 0) {
      console.log('[findCompetitors] No keywords selected, skipping');
      return;
    }
    
    // Check if we already have competitor suggestions (in local state OR externalData)
    // This prevents re-fetching after user submits their selection
    if (competitorSuggestions.length > 0) {
      console.log('[findCompetitors] Already have competitors in local state:', competitorSuggestions.length);
      return;
    }
    
    const cachedCompetitors = externalData?.competitorSuggestions || [];
    if (cachedCompetitors.length > 0) {
      console.log('[findCompetitors] Using cached competitors from externalData:', cachedCompetitors.length);
      setCompetitorSuggestions(cachedCompetitors);
      
      // Auto-select competitors marked with autoSelected: true
      const autoSelectedUrls = cachedCompetitors
        .filter(c => c.autoSelected)
        .map(c => {
          try { const parsed = new URL(c.url); return `${parsed.protocol}//${parsed.host}`; } catch { return c.url; }
        });
      if (autoSelectedUrls.length > 0) {
        console.log('[findCompetitors] Auto-selecting', autoSelectedUrls.length, 'competitors');
        setSelectedCompetitors(autoSelectedUrls);
      }
      return;
    }
    
    // Prevent duplicate searches
    if (competitorSearchInProgress.current || isLoadingCompetitors) {
      console.log('[findCompetitors] Search already in progress, skipping');
      return;
    }
    
    // Need to find competitors based on selected keywords
    const findCompetitors = async () => {
      competitorSearchInProgress.current = true;
      
      console.log('[findCompetitors] Fetching fresh competitors for keywords:', selectedKeywords.slice(0, 3));
      setIsLoadingCompetitors(true);
      setCompetitorSuggestions([]); // Clear old suggestions
      
      try {
        const result = await triggerAiAction('FIND_COMPETITORS', { 
          keywords: selectedKeywords,
        });
        
        console.log('[findCompetitors] Action result:', result);
        
        if (result.success) {
          const competitors = result.externalData?.competitorSuggestions || [];
          console.log('[findCompetitors] Got competitors from action:', competitors.length);
          if (competitors.length > 0) {
            setCompetitorSuggestions(competitors);
            
            // Auto-select competitors marked with autoSelected: true
            const autoSelectedUrls = competitors
              .filter(c => c.autoSelected)
              .map(c => {
                try { const parsed = new URL(c.url); return `${parsed.protocol}//${parsed.host}`; } catch { return c.url; }
              });
            if (autoSelectedUrls.length > 0) {
              console.log('[findCompetitors] Auto-selecting', autoSelectedUrls.length, 'competitors');
              setSelectedCompetitors(autoSelectedUrls);
            }
          }
        } else {
          console.error('[findCompetitors] Action failed:', result.error);
        }
      } catch (err) {
        console.error('Error finding competitors:', err);
      } finally {
        setIsLoadingCompetitors(false);
        // NOTE: Do NOT reset competitorSearchInProgress.current here.
        // Keep it true so the effect doesn't re-trigger when responses update.
        // It gets reset in moveToNextQuestion when advancing past this question.
      }
    };
    
    findCompetitors();
  }, [currentQuestionIndex, questionsData, responses.keywords]);

  // Set internal links default from article analysis
  useEffect(() => {
    if (!questionsData || currentQuestionIndex === undefined) return;
    
    const currentQuestion = questionsData[currentQuestionIndex];
    if (!currentQuestion) return;
    
    // Only for the internalLinksCount question
    if (currentQuestion.saveToField !== 'internalLinksCount') return;
    
    const config = currentQuestion.inputConfig || {};
    
    // Check if we have analyzed internal links
    if (externalData?.internalLinksAnalysis) {
      const analysis = externalData.internalLinksAnalysis;
      const recommendedCount = analysis.recommendation || analysis.averageLinksPerThousand || 3;
      setInternalLinksDefault(recommendedCount);
      
      // Set as default value if not already set
      if (!responses[currentQuestion.id]) {
        setResponses(prev => ({
          ...prev,
          [currentQuestion.id]: recommendedCount
        }));
      }
      return;
    }
    
    // Trigger analysis if we have articles
    const analyzeInternalLinks = async () => {
      const articles = externalData?.articles || [];
      if (articles.length === 0) {
        // Use default from config
        setInternalLinksDefault(config.defaultValue || 3);
        return;
      }
      
      try {
        const result = await triggerAiAction('ANALYZE_INTERNAL_LINKS', { 
          articles: articles,
        });
        
        if (result.success) {
          const analysis = result.externalData?.internalLinksAnalysis || {};
          const recommendedCount = analysis.recommendation || 3;
          setInternalLinksDefault(recommendedCount);
          
          if (!responses[currentQuestion.id]) {
            setResponses(prev => ({
              ...prev,
              [currentQuestion.id]: recommendedCount
            }));
          }
        }
      } catch (err) {
        console.error('Error analyzing internal links:', err);
        setInternalLinksDefault(config.defaultValue || 3);
      }
    };
    
    analyzeInternalLinks();
  }, [currentQuestionIndex, questionsData, externalData?.articles]);

  const submitResponse = async (questionId, response) => {
    try {
      setIsProcessing(true);
      // Send the chat's UI locale so submit-time auto-actions (e.g.
      // CRAWL_WEBSITE on the URL question) extract description/category/etc.
      // in the user's language rather than the site's content language.
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, response, interviewId, userLocale: locale }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        if (data.validationError) {
          setValidationError(data.error);
          // If there's a URL suggestion, store it
          if (data.suggestion && data.canAutoCorrect) {
            setUrlSuggestion(data.suggestion);
          } else {
            setUrlSuggestion(null);
          }
          return { success: false };
        }
        throw new Error(data.error || 'Failed to submit response');
      }
      
      const data = await res.json();
      setValidationError(null);
      setUrlSuggestion(null);
      
      // Update local responses state with server data to keep in sync
      // This ensures that subsequent questions can access the saved values (e.g., keywords for competitors)
      if (data.interview?.responses) {
        setResponses(data.interview.responses);
      }
      
      // Return the updated interview data
      return { 
        success: true, 
        interview: data.interview,
        nextQuestion: data.nextQuestion,
        isComplete: data.isComplete,
      };
    } catch (err) {
      console.error('Error submitting response:', err);
      setError('Failed to submit response. Please try again.');
      return { success: false };
    } finally {
      setIsProcessing(false);
    }
  };

  // Refresh interview data to get latest externalData
  const refreshInterviewData = async () => {
    try {
      const url = site?.id ? `/api/interview?siteId=${site.id}` : '/api/interview';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log('[refreshInterviewData] Full response:', data);
        console.log('[refreshInterviewData] externalData:', data.interview?.externalData);
        console.log('[refreshInterviewData] crawledData:', data.interview?.externalData?.crawledData);
        
        setExternalData(data.interview?.externalData || {});
        
        // Update siteId if it became available (e.g., after crawl)
        if (data.interview?.siteId && !interviewSiteId) {
          setInterviewSiteId(data.interview.siteId);
        }
        
        // Update editable data from crawled data
        if (data.interview?.externalData?.crawledData) {
          const crawled = data.interview.externalData.crawledData;
          const newEditableData = {
            businessName: crawled.businessName || '',
            phone: crawled.phones?.[0] || crawled.phone || '',
            email: crawled.emails?.[0] || crawled.email || '',
            about: crawled.description || '',
            category: crawled.category || '',
            address: crawled.address || '',
          };
          console.log('[refreshInterviewData] Setting editableData:', newEditableData);
          setEditableData(newEditableData);
        }
        
        return data.interview?.externalData || {};
      }
    } catch (err) {
      console.error('Error refreshing interview data:', err);
    }
    return {};
  };

  // Trigger an AI action and get suggestions. We tack the user's UI locale
  // onto every action's parameters so handlers that produce human-readable
  // text (CRAWL_WEBSITE, GENERATE_KEYWORDS, ANALYZE_WRITING_STYLE,
  // FIND_COMPETITORS) can write their output in the chat's language rather
  // than the website's language. Handlers ignore unknown params, so this is
  // safe to send to all of them unconditionally.
  const triggerAiAction = async (actionName, params) => {
    try {
      setIsLoadingAiSuggestions(true);
      const res = await fetch('/api/interview/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionName,
          parameters: { userLocale: locale, ...params },
          interviewId,
        }),
      });
      
      if (!res.ok) {
        // Handle 402 - insufficient credits
        if (res.status === 402) {
          const data = await res.json().catch(() => ({}));
          const creditsErr = {
            message: data.error || t('interviewWizard.errors.insufficientCredits') || 'Insufficient Ai-GCoins',
            currentUsage: data.currentUsage,
            limit: data.limit,
          };
          setCreditsError(creditsErr);
          return { success: false, error: creditsErr.message, creditsError: creditsErr };
        }
        throw new Error('Failed to trigger AI action');
      }
      
      const data = await res.json();
      
      // Refresh external data to get the latest stored results
      const freshData = await refreshInterviewData();
      
      // Return the result with fresh data
      return {
        ...data,
        externalData: freshData,
      };
    } catch (err) {
      console.error('Error triggering AI action:', err);
      return { success: false, error: err.message, creditsError: err.creditsError };
    } finally {
      setIsLoadingAiSuggestions(false);
    }
  };

  // Silent variant of triggerAiAction. Fires the same /api/interview/actions
  // endpoint but does NOT toggle any user-visible loading state. Used for
  // background prefetches kicked off mid-interview (e.g. competitor search
  // and writing-style analysis) so the chat doesn't flash a spinner banner
  // for an action the user hasn't actually reached yet. Caller is expected
  // to refresh interview data themselves if they need the result locally.
  const triggerAiActionSilently = async (actionName, params) => {
    try {
      const res = await fetch('/api/interview/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionName,
          parameters: { userLocale: locale, ...params },
          interviewId,
        }),
      });
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}` };
      }
      return await res.json();
    } catch (err) {
      console.warn(`[Prefetch] ${actionName} failed silently:`, err.message);
      return { success: false, error: err.message };
    }
  };

  // Mirrors competitorSearchInProgress ref into state so the UI can react
  // to it. We need both: the ref short-circuits effects synchronously,
  // while the state lets the empty-state JSX hide the "no competitors
  // found" panel during a background prefetch.
  const [isCompetitorSearchInFlight, setIsCompetitorSearchInFlight] = useState(false);

  // Background prefetch — competitor search.
  // The competitor question takes 5–10s to render because FIND_COMPETITORS
  // calls Google Search via Gemini grounding for each selected keyword.
  // Once the user has answered keywords AND target locations, we have
  // everything the handler needs, so we kick the search off NOW and let it
  // populate externalData while the user continues through later questions.
  // By the time they reach the competitor step, results are cached and the
  // step renders instantly without the noisy "מחפש מתחרים בגוגל..." banner.
  const competitorPrefetchTriggered = useRef(false);
  useEffect(() => {
    if (competitorPrefetchTriggered.current) return;
    if (!interviewId) return;
    if (creditsError) return;
    // Need both keywords and at least one target location to prefetch.
    const kws = responses?.keywords;
    const locs = responses?.targetLocations;
    const hasKws = Array.isArray(kws) ? kws.length > 0 : !!kws;
    const hasLocs = Array.isArray(locs) ? locs.length > 0 : !!locs;
    if (!hasKws || !hasLocs) return;
    // Skip if we already have results cached from a previous run.
    if ((externalData?.competitorSuggestions?.length || 0) > 0) return;
    if (competitorSearchInProgress.current) return;

    competitorPrefetchTriggered.current = true;
    competitorSearchInProgress.current = true;
    setIsCompetitorSearchInFlight(true);
    console.log('[Prefetch] Starting background competitor search');

    triggerAiActionSilently('FIND_COMPETITORS', {
      keywords: Array.isArray(kws) ? kws : [kws],
    })
      .then(async (result) => {
        if (!result.success) {
          // Reset so the on-question fallback can try again if it fires.
          competitorSearchInProgress.current = false;
          competitorPrefetchTriggered.current = false;
          setIsCompetitorSearchInFlight(false);
          return;
        }
        // Pull the freshly-stored suggestions back into local state.
        const fresh = await refreshInterviewData();
        const suggestions = fresh?.competitorSuggestions || [];
        if (suggestions.length > 0) {
          setCompetitorSuggestions(suggestions);
          const autoSelectedUrls = suggestions
            .filter((c) => c.autoSelected)
            .map((c) => {
              try {
                const parsed = new URL(c.url);
                return `${parsed.protocol}//${parsed.host}`;
              } catch {
                return c.url;
              }
            });
          if (autoSelectedUrls.length > 0) {
            setSelectedCompetitors(autoSelectedUrls);
          }
        }
        setIsCompetitorSearchInFlight(false);
      })
      .catch((err) => {
        console.warn('[Prefetch] competitor search failed:', err);
        competitorSearchInProgress.current = false;
        competitorPrefetchTriggered.current = false;
        setIsCompetitorSearchInFlight(false);
      });
    // We intentionally don't list externalData/competitorSearchInProgress as
    // deps — they're checked imperatively above. Re-running on every responses
    // change is the trigger point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses?.keywords, responses?.targetLocations, interviewId]);

  // Background prefetch — keyword generation.
  // GENERATE_KEYWORDS reads the crawled site content + category and asks
  // an LLM for a list of real SEO search queries. It's a 5-10s call that
  // currently fires when the user reaches the keywords question and shows
  // a loading banner. We kick it off as soon as the crawl finishes so by
  // the time the user gets to "Pick relevant keywords" the suggestions
  // are already populated and the step renders instantly.
  const keywordPrefetchTriggered = useRef(false);
  useEffect(() => {
    if (keywordPrefetchTriggered.current) return;
    if (!interviewId) return;
    if (creditsError) return;
    const url = responses?.websiteUrl || externalData?.crawledData?.url;
    if (!url) return;
    if (!externalData?.crawledData) return;
    // Skip if suggestions are already cached.
    if ((externalData?.keywordSuggestions?.length || 0) > 0) return;

    keywordPrefetchTriggered.current = true;
    console.log('[Prefetch] Starting background keyword generation');

    const filterPlaceholders = (keywords) =>
      (keywords || []).filter((k) => !/\[.*?\]/.test(typeof k === 'string' ? k : k.keyword));

    triggerAiActionSilently('GENERATE_KEYWORDS', {
      url,
      category: externalData?.crawledData?.category,
    })
      .then(async (result) => {
        if (!result.success) {
          keywordPrefetchTriggered.current = false;
          return;
        }
        const fresh = await refreshInterviewData();
        const rawKeywords = fresh?.keywordSuggestions || result.result?.keywords || [];
        const keywords = filterPlaceholders(rawKeywords);
        if (keywords.length > 0) {
          setAiSuggestions(keywords);
          const preSelected = keywords
            .filter((k) => k.type === 'primary')
            .slice(0, 10)
            .map((k) => k.keyword);
          if (preSelected.length > 0) setSelectedSuggestions(preSelected);
        }
      })
      .catch((err) => {
        console.warn('[Prefetch] keyword generation failed:', err);
        keywordPrefetchTriggered.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses?.websiteUrl, externalData?.crawledData, interviewId]);

  // Background prefetch — writing-style analysis.
  // Same idea as the competitor prefetch: ANALYZE_WRITING_STYLE takes a few
  // seconds because the handler scrapes the site and runs an LLM on a
  // content sample. We kick it off as soon as the URL is confirmed AND
  // crawl data is available, so by the time the user reaches the writing
  // style question the recommendation is already populated and the banner
  // doesn't appear.
  const writingStylePrefetchTriggered = useRef(false);
  useEffect(() => {
    if (writingStylePrefetchTriggered.current) return;
    if (!interviewId) return;
    if (creditsError) return;
    // Need a confirmed URL and finished crawl to bother running this.
    const url = responses?.websiteUrl || externalData?.crawledData?.url;
    if (!url) return;
    if (!externalData?.crawledData) return;
    // Skip if analysis already cached.
    if (externalData?.writingStyleAnalysis) return;

    writingStylePrefetchTriggered.current = true;
    console.log('[Prefetch] Starting background writing-style analysis');

    triggerAiActionSilently('ANALYZE_WRITING_STYLE', { url })
      .then(async (result) => {
        if (!result.success) {
          writingStylePrefetchTriggered.current = false;
          return;
        }
        const fresh = await refreshInterviewData();
        const analysis = fresh?.writingStyleAnalysis;
        if (analysis?.style) {
          setAiRecommendation({
            value: analysis.style.tone,
            confidence: analysis.style.confidence || 0.5,
            characteristics: analysis.style.characteristics || [],
          });
        }
      })
      .catch((err) => {
        console.warn('[Prefetch] writing-style analysis failed:', err);
        writingStylePrefetchTriggered.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses?.websiteUrl, externalData?.crawledData, interviewId]);

  // Handle manual blog URL fetch (when automatic discovery fails)
  const handleBlogUrlFetch = async (url) => {
    setBlogDiscoveryPhase('fetching');
    setBlogFetchError(null);
    
    try {
      const res = await fetch('/api/interview/fetch-blog-articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogUrl: url, interviewId }),
      });
      
      const data = await res.json();
      
      if (data.success && data.articles && data.articles.length > 0) {
        setDynamicOptions(data.articles);
        setBlogDiscoveryPhase('done');
        // Refresh external data
        await refreshInterviewData();
      } else {
        setBlogFetchError(t('interviewWizard.blogDiscovery.noArticlesFromUrl'));
        setBlogDiscoveryPhase('enterUrl');
      }
    } catch (err) {
      console.error('Error fetching blog articles:', err);
      setBlogFetchError(t('interviewWizard.blogDiscovery.fetchError'));
      setBlogDiscoveryPhase('enterUrl');
    }
  };

  // Handle INPUT_WITH_AI first phase: user submits input, triggers AI
  const handleInputWithAiSubmit = async (inputText) => {
    const currentQuestion = questions[currentQuestionIndex];
    const config = currentQuestion.inputConfig || {};
    
    // If empty and not required, just skip
    if (!inputText.trim() && !config.validation?.required) {
      const result = await submitResponse(currentQuestion.id, '');
      if (result.success) {
        moveToNextQuestion();
      }
      return;
    }
    
    // Save the raw input first
    setResponses(prev => ({
      ...prev,
      [currentQuestion.id]: inputText,
    }));
    
    // Add user message
    const userMessageId = messageIdCounter.current++;
    setMessages(prev => [...prev, {
      id: `msg-${userMessageId}`,
      type: 'user',
      content: inputText,
      timestamp: new Date()
    }]);
    
    setInputValue('');
    
    // If there's an AI action to trigger
    if (config.aiAction && inputText.trim()) {
      // Add processing message
      const processingMsgId = messageIdCounter.current++;
      setMessages(prev => [...prev, {
        id: `msg-${processingMsgId}`,
        type: 'agent',
        content: t('interviewWizard.messages.analyzingCompetitors') || 'Analyzing your competitors...',
        isProcessing: true,
        timestamp: new Date()
      }]);
      
      // Trigger the AI action
      const result = await triggerAiAction(config.aiAction, { 
        competitors: inputText 
      });
      
      // Remove processing message
      setMessages(prev => prev.filter(m => !m.isProcessing));
      
      if (result.success) {
        // Get suggestions from the result - handler returns suggestedKeywords directly
        const suggestions = result.result?.suggestedKeywords || [];
        
        if (suggestions.length > 0) {
          setAiSuggestions(suggestions);
          
          // Pre-select high priority keywords
          const preSelected = suggestions
            .filter(s => s.priority === 'high')
            .map(s => s.keyword);
          setSelectedSuggestions(preSelected);
          
          // Move to suggestions phase
          setAiSuggestionsPhase('suggestions');
          
          // Add message showing we found suggestions
          const suggestionMsgId = messageIdCounter.current++;
          const suggestionCount = suggestions.length;
          setMessages(prev => [...prev, {
            id: `msg-${suggestionMsgId}`,
            type: 'agent',
            content: t('interviewWizard.messages.foundKeywords', { count: suggestionCount }) 
              || `Found ${suggestionCount} keyword suggestions based on your competitors. Select the ones you want to target:`,
            timestamp: new Date()
          }]);
          return;
        }
      }
      
      // AI failed or no suggestions, just continue to next question
      const submitResult = await submitResponse(currentQuestion.id, inputText);
      if (submitResult.success) {
        setAiSuggestionsPhase('input');
        moveToNextQuestion();
      }
    } else {
      // No AI action, just submit normally
      const result = await submitResponse(currentQuestion.id, inputText);
      if (result.success) {
        moveToNextQuestion();
      }
    }
  };

  // Handle confirming AI suggestions
  const handleConfirmAiSuggestions = async () => {
    const currentQuestion = questions[currentQuestionIndex];
    
    // Save both the original input and selected keywords
    const finalResponse = {
      rawInput: responses[currentQuestion.id],
      selectedKeywords: selectedSuggestions,
    };
    
    // Immediately hide the keyword selection UI
    const keywordsToSave = [...selectedSuggestions];
    setAiSuggestions(null);
    setSelectedSuggestions([]);
    setAiSuggestionsPhase('input');
    
    // Submit the combined response
    const result = await submitResponse(currentQuestion.id, finalResponse);
    
    if (result.success) {
      moveToNextQuestion();
    }
  };

  // Toggle a keyword selection
  const toggleSuggestionSelection = (keyword) => {
    setSelectedSuggestions(prev => 
      prev.includes(keyword)
        ? prev.filter(k => k !== keyword)
        : [...prev, keyword]
    );
  };

  // Skip AI suggestions
  const handleSkipAiSuggestions = async () => {
    const currentQuestion = questions[currentQuestionIndex];
    
    // Submit just the raw input
    const result = await submitResponse(currentQuestion.id, responses[currentQuestion.id]);
    
    if (result.success) {
      setAiSuggestions(null);
      setSelectedSuggestions([]);
      setAiSuggestionsPhase('input');
      moveToNextQuestion();
    }
  };

  const handleSubmit = async (value) => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion || isTyping || isProcessing) return;

    const submittedValue = value ?? inputValue;
    
    // Immediately clear keyword selection UI on submit
    // NOTE: Do NOT clear competitorSuggestions here - it causes the competitor useEffect
    // to re-trigger a search (the guard checks competitorSuggestions.length > 0).
    // Competitors are cleared in moveToNextQuestion instead.
    if (currentQuestion.questionType === 'AI_SUGGESTION') {
      setAiSuggestions(null);
      setSelectedSuggestions([]);
      setSelectedCompetitors([]);
      // Only mark competitor search as "done" when submitting the competitor question itself,
      // NOT when submitting the keywords question (which comes before competitors)
      const submitConfig = currentQuestion.inputConfig || {};
      if (submitConfig.suggestionsSource === 'findCompetitors') {
        competitorSearchInProgress.current = true;
      }
    }
    
    // For GREETING type, just move to next question
    if (currentQuestion.questionType === 'GREETING') {
      moveToNextQuestion();
      return;
    }

    // Validate required fields (except for EDITABLE_DATA which has its own validation)
    if (currentQuestion.questionType !== 'EDITABLE_DATA') {
      if (currentQuestion.validation?.required && !submittedValue) {
        setValidationError(t('interviewWizard.validation.required'));
        return;
      }
    }

    // For INPUT type with URL, we'll show processing message after user message
    const isUrlInput = currentQuestion.inputConfig?.inputType === 'url';

    // Add user message first (except for EDITABLE_DATA)
    if (currentQuestion.questionType !== 'EDITABLE_DATA') {
      const userMessageId = messageIdCounter.current++;
      // Format array values as comma-separated string for display
      let displayContent = submittedValue;
      
      // For selection-based questions, show the translated label instead of raw value
      const config = currentQuestion.inputConfig || {};
      if (config.options && typeof submittedValue === 'string') {
        const matchedOption = config.options.find(opt => opt.value === submittedValue);
        if (matchedOption?.labelKey) {
          displayContent = t(matchedOption.labelKey) || submittedValue;
        }
      }
      
      // For Google Integration, show a friendly message
      if (currentQuestion.questionType === 'GOOGLE_INTEGRATION') {
        if (submittedValue === 'connected') {
          displayContent = t('interviewWizard.googleIntegration.connectedMessage') || '✓ Google account connected';
        } else {
          displayContent = t('interviewWizard.messages.skipped') || 'Skipped';
        }
      }
      
      if (Array.isArray(submittedValue)) {
        // Decode percent-encoded URLs (e.g., Hebrew characters) for readable display
        // Show each item on its own line in the chat bubble
        displayContent = submittedValue.map(item => {
          try { return decodeURI(item); } catch { return item; }
        }).join('\n');
      } else if (typeof submittedValue === 'string' && submittedValue.includes('%')) {
        try { displayContent = decodeURI(submittedValue); } catch { /* keep original */ }
      } else if (typeof submittedValue !== 'string') {
        displayContent = String(submittedValue);
      }

      // If value is empty (user skipped), show a translated "Skipped" text
      const isEmpty = !displayContent || 
        (Array.isArray(submittedValue) && submittedValue.length === 0) ||
        (typeof displayContent === 'string' && !displayContent.trim());
      if (isEmpty) {
        displayContent = t('interviewWizard.messages.skipped') || 'Skipped';
      }

      const userMessage = {
        id: `msg-${userMessageId}`,
        type: 'user',
        content: displayContent,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);
    }

    // For URL input, add processing message after user message
    if (isUrlInput) {
      const processingMsgId = messageIdCounter.current++;
      setMessages(prev => [...prev, {
        id: `msg-${processingMsgId}`,
        type: 'agent',
        content: t('interviewWizard.messages.analyzing') || 'Analyzing your website...',
        isProcessing: true,
        timestamp: new Date()
      }]);
    }

    // Save response locally (include saveToField so showCondition checks work immediately)
    setResponses(prev => ({
      ...prev,
      [currentQuestion.id]: submittedValue,
      ...(currentQuestion.saveToField ? { [currentQuestion.saveToField]: submittedValue } : {}),
    }));

    setInputValue('');
    setIsTyping(true);

    // Submit to API
    const result = await submitResponse(currentQuestion.id, submittedValue);
    
    if (result.success) {
      // Remove processing message if any
      if (isUrlInput) {
        setMessages(prev => prev.filter(m => !m.isProcessing));
      }
      
      // Refresh external data after URL submission (crawl completes)
      if (isUrlInput) {
        await refreshInterviewData();
      }
      
      // Hand the just-submitted answer + saveToField to moveToNextQuestion
      // directly so the showCondition lookup never races against the
      // setResponses commit. Previously moveToNextQuestion read
      // responsesRef.current inside setTimeout(0); under some scheduling
      // (e.g. submitResponse resolving inside the same task as the state
      // update flush), the ref still held the prior value and a question
      // like wordpressPlugin would display even after the user picked
      // "custom" on the platform step.
      const justAnswered = {
        questionId: currentQuestion.id,
        saveToField: currentQuestion.saveToField,
        value: submittedValue,
      };
      moveToNextQuestion(justAnswered);
    } else {
      // Remove processing message on error
      if (isUrlInput) {
        setMessages(prev => prev.filter(m => !m.isProcessing));
      }
      setIsTyping(false);
    }
  };

  const moveToNextQuestion = async (justAnswered = null) => {
    // Reset dynamic options state when moving to next question
    setDynamicOptions([]);
    setSelectedDynamicOptions([]);
    setEditableDataConfirmed(false);
    setGoogleIntegrationStatus('idle');
    // Clean up WP plugin polling if active
    if (wpPluginPollRef.current) {
      clearInterval(wpPluginPollRef.current);
      wpPluginPollRef.current = null;
    }
    setWpPluginStatus('idle');
    
    setTimeout(async () => {
      // Clear competitor UI state inside setTimeout, AFTER the index advances.
      // NOTE: Do NOT reset competitorSearchInProgress.current here - keeping it true
      // prevents the competitor useEffect from re-triggering a search when we move
      // past the competitor question. It stays true until a new interview starts.
      setCompetitorSuggestions([]);
      
      // Find next question that passes showCondition.
      // Build "latest responses" by overlaying the just-answered field on top
      // of the ref. This ensures the showCondition for the very next step
      // sees the correct value even if the React commit -> ref update -> our
      // setTimeout race resolved in the wrong order.
      const latestResponses = { ...responsesRef.current };
      if (justAnswered) {
        if (justAnswered.questionId) latestResponses[justAnswered.questionId] = justAnswered.value;
        if (justAnswered.saveToField) latestResponses[justAnswered.saveToField] = justAnswered.value;
      }
      let nextIndex = currentQuestionIndex + 1;
      while (nextIndex < questions.length) {
        const candidate = questions[nextIndex];
        
        // Skip GOOGLE_INTEGRATION question if Google is already connected
        if (candidate.questionType === 'GOOGLE_INTEGRATION' && isGoogleAlreadyConnected) {
          console.log('[InterviewWizard] Skipping GOOGLE_INTEGRATION (already connected)');
          nextIndex++;
          continue;
        }
        
        if (candidate.showCondition) {
          try {
            const condition = typeof candidate.showCondition === 'string'
              ? JSON.parse(candidate.showCondition)
              : candidate.showCondition;
            const fieldValue = latestResponses[condition.field];
            let passes = true;
            switch (condition.operator) {
              case 'equals': passes = fieldValue === condition.value; break;
              case 'notEquals': passes = fieldValue !== condition.value; break;
              case 'contains': passes = Array.isArray(fieldValue) ? fieldValue.includes(condition.value) : String(fieldValue || '').includes(condition.value); break;
              case 'in': passes = Array.isArray(condition.value) ? condition.value.includes(fieldValue) : false; break;
              default: passes = true;
            }
            if (!passes) {
              console.log('[InterviewWizard] Skipping question (showCondition not met):', candidate.translationKey);
              nextIndex++;
              continue;
            }
          } catch (e) {
            console.error('[InterviewWizard] Error evaluating showCondition:', e);
          }
        }
        break; // Found a valid question
      }
      
      if (nextIndex < questions.length) {
        const nextQuestion = questions[nextIndex];
        const questionText = t(nextQuestion.translationKey);
        
        // For AUTO_ACTION, skip adding a chat message - just advance the index
        // The AUTO_ACTION useEffect will handle running the action and showing progress
        if (nextQuestion.questionType === 'AUTO_ACTION') {
          setCurrentQuestionIndex(nextIndex);
          setIsTyping(false);
          return;
        }

        // For EDITABLE_DATA, refresh data first to ensure we have crawled data
        if (nextQuestion.questionType === 'EDITABLE_DATA') {
          const freshData = await refreshInterviewData();
          
          // If we have crawled data, add a data preview message
          if (freshData?.crawledData) {
            const dataMessageId = messageIdCounter.current++;
            const crawled = freshData.crawledData;
            
            // Add bot message with data card
            setMessages(prev => [...prev, {
              id: `msg-${dataMessageId}`,
              type: 'agent',
              content: questionText,
              questionType: nextQuestion.questionType,
              inputConfig: nextQuestion.inputConfig,
              questionId: nextQuestion.id,
              dataCard: {
                businessName: crawled.businessName,
                description: crawled.description,
                phone: crawled.phones?.[0] || crawled.phone,
                email: crawled.emails?.[0] || crawled.email,
                category: crawled.category,
                address: crawled.address,
                seoScore: crawled.seoScore,
                language: site?.contentLanguage || crawled.language,
                hasSitemap: crawled.hasSitemap,
              },
              timestamp: new Date()
            }]);
            setCurrentQuestionIndex(nextIndex);
            setIsTyping(false);
            return;
          }
        }
        
        const agentMessageId = messageIdCounter.current++;
        const agentMessage = {
          id: `msg-${agentMessageId}`,
          type: 'agent',
          content: questionText,
          questionType: nextQuestion.questionType,
          inputConfig: nextQuestion.inputConfig,
          questionId: nextQuestion.id,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, agentMessage]);
        setCurrentQuestionIndex(nextIndex);
        setIsTyping(false);
      } else {
        // Interview complete
        setIsComplete(true);
        setIsTyping(false);
        setTimeout(() => {
          onComplete?.(responsesRef.current);
        }, 2000);
      }
    }, 800 + Math.random() * 500);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-submit websiteUrl question when site is provided
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    // Only auto-submit once
    if (autoSubmittedRef.current) return;
    
    // Check conditions: site URL available, questions loaded, first question is websiteUrl, messages initialized
    if (!site?.url) return;
    if (!questionsData?.length) return;
    if (messages.length === 0) return;
    if (currentQuestionIndex !== 0) return;
    
    const firstQuestion = questionsData[0];
    if (firstQuestion?.translationKey !== 'registration.interview.questions.websiteUrl') return;
    
    console.log('[InterviewWizard] Auto-submitting websiteUrl with site URL:', site.url);
    autoSubmittedRef.current = true;
    
    // Use setTimeout to let the UI render the question first, then auto-submit
    setTimeout(() => {
      handleSubmit(site.url);
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.url, questionsData, messages.length, currentQuestionIndex]);

  // Retry a user message - revert to that question and resend the same message
  const handleRetryMessage = async (messageId) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const messageToRetry = messages[messageIndex];
    if (messageToRetry.type !== 'user') return;

    // Find the question index for this message
    // Look at the agent message before this one to determine the question
    let questionIdx = 0;
    let questionId = null;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'agent' && messages[i].questionId) {
        questionId = messages[i].questionId;
        const qIdx = questions.findIndex(q => q.id === messages[i].questionId);
        if (qIdx !== -1) {
          questionIdx = qIdx;
          break;
        }
      }
    }

    // Call API to revert interview to this question
    try {
      const res = await fetch('/api/interview', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIndex: questionIdx, questionId, interviewId }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        console.error('Error reverting interview:', error);
        return;
      }
      
      const data = await res.json();
      
      // Update local state with server response
      if (data.interview?.responses) {
        setResponses(data.interview.responses);
      }
      if (data.interview?.externalData) {
        setExternalData(data.interview.externalData);
      }
    } catch (err) {
      console.error('Error reverting interview:', err);
      return;
    }

    // Remove all messages from this one onwards (including the user message)
    setMessages(prev => prev.slice(0, messageIndex));
    setCurrentQuestionIndex(questionIdx);
    setIsTyping(false);
    setIsProcessing(false);
    
    // Clear related state
    setCompetitorSuggestions([]);
    setSelectedCompetitors([]);
    setAiSuggestions(null);
    setSelectedSuggestions([]);

    // Re-add the agent question message
    const question = questions[questionIdx];
    if (question) {
      const agentMsgId = messageIdCounter.current++;
      setMessages(prev => [...prev, {
        id: `msg-${agentMsgId}`,
        type: 'agent',
        content: t(question.translationKey),
        questionType: question.questionType,
        inputConfig: question.inputConfig,
        questionId: question.id,
        timestamp: new Date()
      }]);
    }

    // Directly resend the same message (use setTimeout to ensure state is updated)
    setTimeout(() => {
      handleSubmit(messageToRetry.content);
    }, 100);
  };

  // Edit a user message - show edit mode
  const handleStartEdit = (messageId) => {
    const message = messages.find(m => m.id === messageId);
    if (message && message.type === 'user') {
      setEditingMessageId(messageId);
      setEditContent(message.content);
    }
  };

  // Save edited message and resend
  const handleSaveEdit = async () => {
    if (!editingMessageId || !editContent.trim()) {
      setEditingMessageId(null);
      setEditContent('');
      return;
    }

    const messageIndex = messages.findIndex(m => m.id === editingMessageId);
    if (messageIndex === -1) {
      setEditingMessageId(null);
      setEditContent('');
      return;
    }

    const editedContent = editContent.trim();

    // Find the question index for this message
    let questionIdx = 0;
    let questionId = null;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'agent' && messages[i].questionId) {
        questionId = messages[i].questionId;
        const qIdx = questions.findIndex(q => q.id === messages[i].questionId);
        if (qIdx !== -1) {
          questionIdx = qIdx;
          break;
        }
      }
    }

    // Call API to revert interview to this question
    try {
      const res = await fetch('/api/interview', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIndex: questionIdx, questionId, interviewId }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        console.error('Error reverting interview:', error);
        return;
      }
      
      const data = await res.json();
      
      // Update local state with server response
      if (data.interview?.responses) {
        setResponses(data.interview.responses);
      }
      if (data.interview?.externalData) {
        setExternalData(data.interview.externalData);
      }
    } catch (err) {
      console.error('Error reverting interview:', err);
      return;
    }

    // Remove all messages from this one onwards
    setMessages(prev => prev.slice(0, messageIndex));
    setCurrentQuestionIndex(questionIdx);
    setEditingMessageId(null);
    setIsTyping(false);
    setIsProcessing(false);

    // Clear related state
    setCompetitorSuggestions([]);
    setSelectedCompetitors([]);
    setAiSuggestions(null);
    setSelectedSuggestions([]);

    // Re-add the agent question message
    const question = questions[questionIdx];
    if (question) {
      const agentMsgId = messageIdCounter.current++;
      setMessages(prev => [...prev, {
        id: `msg-${agentMsgId}`,
        type: 'agent',
        content: t(question.translationKey),
        questionType: question.questionType,
        inputConfig: question.inputConfig,
        questionId: question.id,
        timestamp: new Date()
      }]);
    }

    // Submit the edited content
    setInputValue('');
    setEditContent('');
    
    // Small delay to ensure state is updated
    setTimeout(() => {
      handleSubmit(editedContent);
    }, 100);
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleOptionSelect = (value) => {
    handleSubmit(value);
  };

  const handleMultiSelect = (value) => {
    const currentQuestion = questions[currentQuestionIndex];
    const currentSelection = Array.isArray(responses[currentQuestion?.id]) 
      ? responses[currentQuestion.id] 
      : [];
    
    const newSelection = currentSelection.includes(value)
      ? currentSelection.filter(v => v !== value)
      : [...currentSelection, value];
    
    setResponses(prev => ({
      ...prev,
      [currentQuestion.id]: newSelection
    }));
  };

  // Render inline selection content (for searchable SELECTION inside agent bubble)
  const renderInlineSelectionContent = (config) => {
    if (!config) return null;
    
    // Get detected value from crawl data
    let detectedValue = config.defaultFromCrawl ? externalData?.crawledData?.[config.defaultFromCrawl] : null;

    // For language: prefer the site's already-chosen contentLanguage over auto-detection
    if (config.defaultFromCrawl === 'language' && site?.contentLanguage) {
      detectedValue = site.contentLanguage;
    }

    // For detectedCountry: derive from user's contentLanguage or crawl language
    const isCountryDetection = config.defaultFromCrawl === 'detectedCountry';
    if (isCountryDetection && !detectedValue) {
      const contentLang = site?.contentLanguage || responses?.contentLanguage || externalData?.crawledData?.language;
      if (contentLang) {
        const langToCountry = {
          he: 'IL', ar: 'AE', ja: 'JP', ko: 'KR', zh: 'CN', ru: 'RU',
          pt: 'BR', de: 'DE', fr: 'FR', es: 'ES', it: 'IT', nl: 'NL',
          pl: 'PL', sv: 'SE', no: 'NO', da: 'DK', fi: 'FI', el: 'GR',
          tr: 'TR', th: 'TH', vi: 'VN', id: 'ID', ms: 'MY', hi: 'IN',
          en: 'worldwide',
        };
        detectedValue = langToCountry[contentLang] || 'worldwide';
      }
    }
    
    // Determine which detection message to show based on what was detected
    const isPlatformDetection = config.defaultFromCrawl === 'platform';
    const isLanguageDetection = config.defaultFromCrawl === 'language';
    
    // Helper to get option label from value
    const getOptionLabel = (value) => {
      const option = config.options?.find(opt => opt.value === value);
      return option ? t(option.labelKey) : value;
    };
    
    // Get the appropriate detection message
    const getDetectionMessage = () => {
      if (!detectedValue) return null;
      
      if (isPlatformDetection) {
        return t('interviewWizard.messages.detectedPlatform', { platform: getOptionLabel(detectedValue) });
      }
      if (isLanguageDetection) {
        return t('interviewWizard.messages.languageDetected', { language: getOptionLabel(detectedValue) });
      }
      if (isCountryDetection) {
        return t('interviewWizard.messages.detectedCountry', { country: getOptionLabel(detectedValue) });
      }
      // Generic detected message
      return `${t('common.detected') || 'Detected'}: ${getOptionLabel(detectedValue)}`;
    };
    
    return (
      <div className={styles.inlineSelectionContent}>
        {detectedValue && (
          <div className={styles.detectedValueBanner}>
            <span className={styles.detectedIcon}>{isPlatformDetection ? '🔧' : isCountryDetection ? '🌍' : '🔍'}</span>
            <span>{getDetectionMessage()}</span>
          </div>
        )}
        
        <div className={styles.searchableSelect}>
          <div className={styles.searchInputWrapper}>
            <input
              type="text"
              className={styles.searchInput}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={t('interviewWizard.questionTypes.selection.searchPlaceholder') || 'Search...'}
            />
            {searchFilter && (
              <button 
                className={styles.clearSearchBtn}
                onClick={() => setSearchFilter('')}
              >
                ×
              </button>
            )}
          </div>
          <div className={styles.searchableOptions}>
            {config.options
              ?.filter(opt => {
                const label = t(opt.labelKey) || opt.value;
                return label.toLowerCase().includes(searchFilter.toLowerCase());
              })
              .map((opt, i) => {
                const isDetected = opt.value === detectedValue;
                const isSelected = inputValue === opt.value;
                
                return (
                  <button
                    key={i}
                    className={`${styles.searchableOption} ${isSelected ? styles.selected : ''} ${isDetected && !isSelected ? styles.detected : ''}`}
                    onClick={() => {
                      setInputValue(opt.value);
                      setSearchFilter('');
                    }}
                  >
                    {isDetected && <span className={styles.detectedBadge}>🔍</span>}
                    {t(opt.labelKey)}
                    {isSelected && <Check size={14} className={styles.selectedCheck} />}
                  </button>
                );
              })}
            {config.options?.filter(opt => {
              const label = t(opt.labelKey) || opt.value;
              return label.toLowerCase().includes(searchFilter.toLowerCase());
            }).length === 0 && (
              <div className={styles.noResults}>
                {t('interviewWizard.questionTypes.selection.noResults') || 'No results found'}
              </div>
            )}
          </div>
        </div>
        
        {inputValue && (
          <div className={styles.inlineSelectionActions}>
            <div className={styles.selectedValuePreview}>
              <span>{getOptionLabel(inputValue)}</span>
            </div>
            <button 
              onClick={() => handleSubmit(inputValue)}
              className={styles.confirmButton}
              disabled={isProcessing}
            >
              <Check size={16} />
              {t('common.confirm')}
            </button>
          </div>
        )}
      </div>
    );
  };

  // Render different input types based on question type
  const renderQuestionInput = () => {
    const currentQuestion = questions[currentQuestionIndex];
    console.log('[InterviewWizard] renderQuestionInput:', { 
      currentQuestionIndex, 
      currentQuestion: currentQuestion?.translationKey,
      questionType: currentQuestion?.questionType,
      isComplete,
      questionsLength: questions.length
    });
    if (!currentQuestion || isComplete) return null;

    const config = currentQuestion.inputConfig || {};

    switch (currentQuestion.questionType) {
      case 'GREETING':
        return (
          <div className={styles.greetingActions}>
            <button 
              onClick={() => handleSubmit('continue')}
              className={styles.primaryButton}
            >
              {t('interviewWizard.questionTypes.greeting.continue')}
            </button>
          </div>
        );

      case 'AUTO_ACTION':
        // Auto-action runs via useEffect and advances automatically
        // Show credits error UI if credits are insufficient
        if (creditsError) {
          return (
            <div className={styles.autoActionErrorContainer}>
              <div className={styles.autoActionErrorBanner} style={{ borderColor: 'rgba(255, 165, 0, 0.25)', background: 'rgba(255, 165, 0, 0.08)', color: '#ffa500' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div className={styles.autoActionErrorText}>
                  <strong style={{ color: '#ffa500' }}>{t('interviewWizard.errors.insufficientCredits') || 'Insufficient Ai-GCoins'}</strong>
                  <p>{t('interviewWizard.errors.insufficientCreditsDesc') || 'You have run out of Ai-GCoins. Please upgrade your plan to continue using AI features.'}</p>
                </div>
              </div>
              <div className={styles.autoActionErrorActions}>
                <button
                  onClick={handleClose}
                  className={styles.secondaryButton}
                >
                  {t('common.close') || 'Close'}
                </button>
              </div>
            </div>
          );
        }
        // Show error UI if action failed (e.g., website unreachable)
        if (autoActionError) {
          return (
            <div className={styles.autoActionErrorContainer}>
              <div className={styles.autoActionErrorBanner}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <div className={styles.autoActionErrorText}>
                  <strong>{t('interviewWizard.errors.websiteUnreachable') || 'Website is not reachable'}</strong>
                  <p>{t('interviewWizard.errors.websiteUnreachableDesc') || 'We could not access the website you provided. Please check the URL and try again.'}</p>
                </div>
              </div>
              <div className={styles.autoActionErrorActions}>
                <button
                  onClick={() => {
                    setAutoActionError(null);
                    // Revert to the URL question
                    const urlQuestionIndex = questionsData.findIndex(q => q.saveToField === 'websiteUrl');
                    if (urlQuestionIndex !== -1) {
                      // Reset state
                      setCurrentQuestionIndex(urlQuestionIndex);
                      setInputValue(responses.websiteUrl || '');
                      // Remove messages after the URL question
                      const urlAgentMsgIdx = messages.findIndex(m => m.questionId === questionsData[urlQuestionIndex]?.id);
                      if (urlAgentMsgIdx !== -1) {
                        setMessages(prev => prev.slice(0, urlAgentMsgIdx));
                      }
                      // Re-add the URL question message
                      const agentMsgId = messageIdCounter.current++;
                      setMessages(prev => [...prev, {
                        id: `msg-${agentMsgId}`,
                        type: 'agent',
                        content: t(questionsData[urlQuestionIndex].translationKey),
                        questionType: questionsData[urlQuestionIndex].questionType,
                        inputConfig: questionsData[urlQuestionIndex].inputConfig,
                        questionId: questionsData[urlQuestionIndex].id,
                        timestamp: new Date()
                      }]);
                    }
                  }}
                  className={styles.primaryButton}
                >
                  {t('interviewWizard.errors.changeUrl') || 'Change URL'}
                </button>
                <button
                  onClick={() => {
                    setAutoActionError(null);
                    autoActionInProgress.current = false;
                    // Retry with same URL
                    const websiteUrl = responses.websiteUrl || externalData?.crawledData?.url;
                    setIsAutoActionRunning(true);
                    triggerAiAction(autoActionError.actionName, { url: websiteUrl }).then(result => {
                      if (result.success) {
                        if (result.externalData?.articles) {
                          setDynamicOptions(result.externalData.articles);
                        }
                        submitResponse(currentQuestion.id, 'auto_completed').then(submitResult => {
                          if (submitResult.success) moveToNextQuestion();
                        });
                      } else {
                        if (result.creditsError) {
                          setCreditsError(result.creditsError);
                        } else {
                          setAutoActionError({
                            actionName: autoActionError.actionName,
                            error: result.error,
                          });
                        }
                      }
                      setIsAutoActionRunning(false);
                    });
                  }}
                  className={styles.secondaryButton}
                >
                  {t('common.retry') || 'Try Again'}
                </button>
              </div>
            </div>
          );
        }
        // Show loading spinner during auto action
        if (isAutoActionRunning) {
          return (
            <div className={styles.autoActionLoading}>
              <Loader2 size={20} className={styles.spinIcon} />
              <span>{t('interviewWizard.messages.analyzing') || 'Analyzing your website...'}</span>
            </div>
          );
        }
        // If no error and not running, auto-action hasn't started yet - return loading
        return (
          <div className={styles.autoActionLoading}>
            <Loader2 size={20} className={styles.spinIcon} />
            <span>{t('interviewWizard.messages.analyzing') || 'Analyzing your website...'}</span>
          </div>
        );

      case 'INPUT_WITH_AI':
        // Two-phase input: first textarea, then AI suggestions
        if (aiSuggestionsPhase === 'suggestions' && aiSuggestions) {
          // Phase 2: Show AI suggestions for selection
          return (
            <div className={styles.aiSuggestionsContainer}>
              <div className={styles.keywordTagsGrid}>
                {aiSuggestions.map((suggestion, i) => {
                  const keyword = typeof suggestion === 'string' ? suggestion : suggestion.keyword;
                  const isSelected = selectedSuggestions.includes(keyword);
                  const priority = suggestion.priority || 'medium';
                  
                  return (
                    <button
                      key={i}
                      className={`${styles.keywordTag} ${isSelected ? styles.selected : ''} ${styles[`priority${priority.charAt(0).toUpperCase() + priority.slice(1)}`]}`}
                      onClick={() => toggleSuggestionSelection(keyword)}
                    >
                      {keyword}
                      {isSelected && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
              
              <div className={styles.aiSuggestionsActions}>
                <button
                  onClick={handleSkipAiSuggestions}
                  className={styles.secondaryButton}
                  disabled={isProcessing}
                >
                  {t('common.skip') || 'Skip'}
                </button>
                <button
                  onClick={handleConfirmAiSuggestions}
                  className={styles.primaryButton}
                  disabled={isProcessing || selectedSuggestions.length === 0}
                >
                  <Check size={16} />
                  {t('common.confirm')} ({selectedSuggestions.length})
                </button>
              </div>
            </div>
          );
        }
        
        // Phase 1: Show textarea for input
        const aiPlaceholderKey = config.placeholderKey;
        const aiPlaceholder = aiPlaceholderKey 
          ? t(aiPlaceholderKey) 
          : t('interviewWizard.inputPlaceholder');
        
        return (
          <div className={styles.inputArea}>
            <div className={styles.textareaWrapper}>
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isTyping || isLoadingAiSuggestions}
                placeholder={aiPlaceholder}
                className={styles.textarea}
                rows={config.rows || 4}
              />
              <button
                onClick={() => handleInputWithAiSubmit(inputValue)}
                disabled={isTyping || isLoadingAiSuggestions}
                className={styles.sendButton}
              >
                {isLoadingAiSuggestions ? (
                  <Loader2 size={20} className={styles.spinIcon} />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>
            {!config.validation?.required && (
              <button
                onClick={() => handleInputWithAiSubmit('')}
                className={styles.skipLink}
                disabled={isTyping || isLoadingAiSuggestions}
              >
                {t('common.skip') || 'Skip'}
              </button>
            )}
          </div>
        );

      case 'AI_SUGGESTION':
        // Check selection mode: 'cards' for writing style, 'tags' for keywords, 'competitorCards' for competitors
        const isTagsMode = config.selectionMode === 'tags';
        const isCompetitorCardsMode = config.selectionMode === 'competitorCards';
        
        if (isCompetitorCardsMode) {
          // Competitor cards mode - show competitor websites with checkboxes
          const minCompetitors = config.minSelections || 0;
          const maxCompetitors = config.maxSelections || 10;
          
          return (
            <div className={styles.aiSuggestionContainer}>
              {/* Competitor search now prefetches in the background as soon
                  as keywords + targetLocations are answered, so by the time
                  the user reaches this step results are usually already
                  cached. The old "Searching Google for competitors..."
                  banner was loud and gave the impression of a long blocking
                  wait, so we replaced it with a subtle inline pending row.
                  Show it whenever ANY search is in flight (foreground via
                  isLoadingCompetitors, or background via the prefetch flag)
                  AND we don't yet have results — otherwise the user briefly
                  sees the "no competitors found" empty state while the
                  prefetch is still running, which is exactly the bug. */}
              {(isLoadingCompetitors || isCompetitorSearchInFlight) && competitorSuggestions.length === 0 && (
                <div className={styles.competitorPendingRow}>
                  <Loader2 size={14} className={styles.spinIcon} />
                </div>
              )}

              {!isLoadingCompetitors && competitorSuggestions.length > 0 && (
                <>
                  <div className={styles.competitorCardsGrid}>
                    {competitorSuggestions.map((competitor, i) => {
                      const rawUrl = typeof competitor === 'string' ? competitor : competitor.url;
                      // Normalize to homepage URL only (no deep links)
                      let url = rawUrl;
                      try {
                        const parsed = new URL(rawUrl);
                        url = `${parsed.protocol}//${parsed.host}`;
                      } catch { /* keep rawUrl if parsing fails */ }
                      const name = competitor.name || competitor.domain || url;
                      const domain = competitor.domain || '';
                      const keywordCount = competitor.keywordCount || 0;
                      const keywords = competitor.keywords || [];
                      const isSelected = selectedCompetitors.includes(url);
                      const isAutoSelected = competitor.autoSelected;

                      // Prefer the meta-description scraped server-side (a
                      // real one-line summary of the competitor) over the
                      // synthesized "Ranks for: ..." line. Fall back to the
                      // keyword line when no description was available.
                      let description = competitor.description || '';
                      if (!description && keywordCount > 0) {
                        const keywordNames = keywords.map(k => k.keyword).slice(0, 3).join(', ');
                        description = keywordCount > 1
                          ? `${t('interviewWizard.messages.ranksFor') || 'Ranks for'}: ${keywordNames}${keywords.length > 3 ? '...' : ''}`
                          : `${t('interviewWizard.messages.ranksFor') || 'Ranks for'}: ${keywordNames}`;
                      }
                      
                      return (
                        <button
                          key={i}
                          className={`${styles.competitorCard} ${isSelected ? styles.selected : ''} ${isAutoSelected && !isSelected ? styles.recommended : ''}`}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedCompetitors(prev => prev.filter(c => c !== url));
                            } else if (selectedCompetitors.length < maxCompetitors) {
                              setSelectedCompetitors(prev => [...prev, url]);
                            }
                          }}
                          disabled={!isSelected && selectedCompetitors.length >= maxCompetitors}
                        >
                          <div className={styles.competitorInfo}>
                            <span className={styles.competitorName}>
                              {domain || name}
                              <a
                                href={url}
                                target="_blank"
                                rel="nofollow noopener noreferrer"
                                className={styles.competitorExternalLink}
                                onClick={(e) => e.stopPropagation()}
                                title={t('interviewWizard.messages.visitWebsite') || 'Visit website'}
                              >
                                <ExternalLink size={14} />
                              </a>
                            </span>
                            {keywordCount > 1 && (
                              <span className={styles.competitorScore}>
                                {t('interviewWizard.messages.foundInKeywords', { count: keywordCount }) || `Found in ${keywordCount} keywords`}
                              </span>
                            )}
                            {description && <span className={styles.competitorDescription}>{description}</span>}
                            <span className={styles.competitorUrl}>{url}</span>
                          </div>
                          {isSelected && (
                            <div className={styles.selectedBadge}>
                              <Check size={14} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* Manual competitor URL input */}
                  <div className={styles.manualCompetitorInput}>
                    <input
                      type="url"
                      placeholder={t('interviewWizard.placeholders.enterCompetitorUrl') || 'Add competitor URL (e.g., https://competitor.com)'}
                      className={styles.competitorUrlInput}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          const url = e.target.value.trim();
                          // Validate URL format
                          try {
                            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
                            // Normalize to homepage URL (protocol + host only).
                            // CRITICAL: this must match the same normalization
                            // applied above when rendering existing cards
                            // (`${parsed.protocol}//${parsed.host}`). Otherwise
                            // selectedCompetitors holds the trailing-slash
                            // form ("https://x.com/") while the card lookup
                            // uses the no-slash form ("https://x.com"), so
                            // `includes()` returns false and the card never
                            // shows as selected even though it counts toward
                            // the limit — and clicking again adds a *second*
                            // entry for the same site.
                            const normalizedUrl = `${urlObj.protocol}//${urlObj.host}`;
                            if (!selectedCompetitors.includes(normalizedUrl) && selectedCompetitors.length < maxCompetitors) {
                              setSelectedCompetitors(prev => [...prev, normalizedUrl]);
                              // Also add to suggestions so it shows in the grid
                              setCompetitorSuggestions(prev => [...prev, {
                                url: normalizedUrl,
                                name: urlObj.hostname.replace('www.', ''),
                                domain: urlObj.hostname.replace(/^www\./, ''),
                                description: t('interviewWizard.messages.manuallyAdded') || 'Manually added',
                                isManual: true,
                              }]);
                            }
                            e.target.value = '';
                          } catch {
                            // Invalid URL - could add validation message here
                          }
                        }
                      }}
                    />
                    <span className={styles.inputHint}>
                      {t('interviewWizard.hints.pressEnterToAdd') || 'Press Enter to add'}
                    </span>
                  </div>
                  
                  <div className={styles.keywordsStatus}>
                    <span>
                      {selectedCompetitors.length} / {maxCompetitors} {t('common.selected') || 'selected'}
                      {minCompetitors > 0 && ` (${t('common.minimum') || 'min'}: ${minCompetitors})`}
                    </span>
                  </div>
                  
                  <div className={styles.aiSuggestionsActions}>
                    <button
                      onClick={() => handleSubmit(selectedCompetitors)}
                      className={styles.primaryButton}
                      disabled={isProcessing || selectedCompetitors.length < minCompetitors}
                    >
                      <Check size={16} />
                      {t('common.confirm')}
                    </button>
                    {minCompetitors === 0 && (
                      <button
                        onClick={() => handleSubmit([])}
                        className={styles.skipLink}
                        disabled={isProcessing}
                      >
                        {t('common.skip')}
                      </button>
                    )}
                  </div>
                </>
              )}
              
              {/* Only show the "no competitors found" empty state once we're
                  certain there's no search still running. Without the
                  isCompetitorSearchInFlight check the user briefly sees
                  "No competitors found" while the background prefetch
                  is still working, then the cards pop in afterwards. */}
              {!isLoadingCompetitors && !isCompetitorSearchInFlight && competitorSuggestions.length === 0 && (
                <div className={styles.noSuggestions}>
                  <p>{t('interviewWizard.messages.noCompetitorsFound') || 'No competitors found. Add your own or skip this step.'}</p>
                  
                  {/* Manual competitor URL input when no suggestions */}
                  <div className={styles.manualCompetitorInput}>
                    <input
                      type="url"
                      placeholder={t('interviewWizard.placeholders.enterCompetitorUrl') || 'Add competitor URL (e.g., https://competitor.com)'}
                      className={styles.competitorUrlInput}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          const url = e.target.value.trim();
                          try {
                            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
                            // Same normalization as the populated-state branch
                            // and as the existing competitor cards. See the
                            // longer comment above; mismatched normalization
                            // is what caused the "added but not selected" bug.
                            const normalizedUrl = `${urlObj.protocol}//${urlObj.host}`;
                            if (!selectedCompetitors.includes(normalizedUrl) && selectedCompetitors.length < maxCompetitors) {
                              setSelectedCompetitors(prev => [...prev, normalizedUrl]);
                              setCompetitorSuggestions(prev => [...prev, {
                                url: normalizedUrl,
                                name: urlObj.hostname.replace('www.', ''),
                                domain: urlObj.hostname.replace(/^www\./, ''),
                                description: t('interviewWizard.messages.manuallyAdded') || 'Manually added',
                                isManual: true,
                              }]);
                            }
                            e.target.value = '';
                          } catch {
                            // Invalid URL
                          }
                        }
                      }}
                    />
                    <span className={styles.inputHint}>
                      {t('interviewWizard.hints.pressEnterToAdd') || 'Press Enter to add'}
                    </span>
                  </div>
                  
                  {selectedCompetitors.length > 0 && (
                    <div className={styles.aiSuggestionsActions}>
                      <button
                        onClick={() => handleSubmit(selectedCompetitors)}
                        className={styles.primaryButton}
                        disabled={isProcessing}
                      >
                        <Check size={16} />
                        {t('common.confirm')} ({selectedCompetitors.length})
                      </button>
                    </div>
                  )}
                  
                  <button
                    onClick={() => handleSubmit([])}
                    className={styles.skipLink}
                    disabled={isProcessing}
                  >
                    {t('common.skip')}
                  </button>
                </div>
              )}
            </div>
          );
        }
        
        if (isTagsMode) {
          // Tags mode for keywords
          const minSelections = config.minSelections || 0;
          const maxSelections = config.maxSelections || 50;
          
          return (
            <div className={styles.aiSuggestionContainer}>
              {/* Keyword generation now prefetches in the background as
                  soon as the crawl finishes (see keywordPrefetchTriggered
                  effect). The loud banner only shows now if the user
                  somehow got here before the prefetch completed. */}
              {isLoadingAiSuggestions && (!aiSuggestions || aiSuggestions.length === 0) && (
                <div className={styles.competitorPendingRow}>
                  <Loader2 size={14} className={styles.spinIcon} />
                </div>
              )}

              {!isLoadingAiSuggestions && aiSuggestions && aiSuggestions.length > 0 && (
                <>
                  <div className={styles.keywordTagsGrid}>
                    {aiSuggestions.map((suggestion, i) => {
                      const keyword = typeof suggestion === 'string' ? suggestion : suggestion.keyword;
                      const isSelected = selectedSuggestions.includes(keyword);
                      const keywordType = suggestion.type || 'primary';
                      
                      return (
                        <button
                          key={i}
                          className={`${styles.keywordTag} ${isSelected ? styles.selected : ''} ${styles[`type${keywordType.charAt(0).toUpperCase() + keywordType.slice(1)}`]}`}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedSuggestions(prev => prev.filter(k => k !== keyword));
                            } else if (selectedSuggestions.length < maxSelections) {
                              setSelectedSuggestions(prev => [...prev, keyword]);
                            }
                          }}
                          disabled={!isSelected && selectedSuggestions.length >= maxSelections}
                        >
                          {keyword}
                          {isSelected && <Check size={14} />}
                        </button>
                      );
                    })}
                    {/* Show user-added keywords that aren't in AI suggestions */}
                    {selectedSuggestions
                      .filter(kw => !aiSuggestions.some(s => (typeof s === 'string' ? s : s.keyword) === kw))
                      .map((keyword, i) => (
                        <button
                          key={`custom-${i}`}
                          className={`${styles.keywordTag} ${styles.selected} ${styles.typeCustom}`}
                          onClick={() => setSelectedSuggestions(prev => prev.filter(k => k !== keyword))}
                        >
                          {keyword}
                          <Check size={14} />
                        </button>
                      ))
                    }
                  </div>
                  
                  {/* Input to add custom keywords */}
                  <div className={styles.keywordInputWrapper}>
                    <input
                      type="text"
                      placeholder={t('interviewWizard.placeholders.enterKeyword') || 'Add your own keyword...'}
                      className={styles.keywordInput}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          const newKeyword = e.target.value.trim();
                          if (!selectedSuggestions.includes(newKeyword) && selectedSuggestions.length < maxSelections) {
                            setSelectedSuggestions(prev => [...prev, newKeyword]);
                          }
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>
                  
                  <div className={styles.keywordsStatus}>
                    <span>
                      {selectedSuggestions.length} / {maxSelections} {t('common.selected') || 'selected'}
                      {minSelections > 0 && ` (${t('common.minimum') || 'min'}: ${minSelections})`}
                    </span>
                  </div>
                  
                  <div className={styles.aiSuggestionsActions}>
                    <button
                      onClick={() => handleSubmit(selectedSuggestions)}
                      className={styles.primaryButton}
                      disabled={isProcessing || selectedSuggestions.length < minSelections}
                    >
                      <Check size={16} />
                      {t('common.confirm')}
                    </button>
                  </div>
                </>
              )}
              
              {!isLoadingAiSuggestions && !isProcessing && !isTyping && (!aiSuggestions || aiSuggestions.length === 0) && (
                <div className={styles.manualKeywordInput}>
                  <p className={styles.noSuggestionsText}>{t('interviewWizard.messages.noKeywordSuggestions') || 'No keyword suggestions available. Enter your own keywords below.'}</p>
                  <div className={styles.keywordInputWrapper}>
                    <input
                      type="text"
                      placeholder={t('interviewWizard.placeholders.enterKeyword') || 'Enter a keyword and press Enter'}
                      className={styles.keywordInput}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          const newKeyword = e.target.value.trim();
                          if (!selectedSuggestions.includes(newKeyword) && selectedSuggestions.length < maxSelections) {
                            setSelectedSuggestions(prev => [...prev, newKeyword]);
                          }
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>
                  {selectedSuggestions.length > 0 && (
                    <div className={styles.keywordTagsGrid}>
                      {selectedSuggestions.map((keyword, i) => (
                        <button
                          key={i}
                          className={`${styles.keywordTag} ${styles.selected}`}
                          onClick={() => setSelectedSuggestions(prev => prev.filter(k => k !== keyword))}
                        >
                          {keyword}
                          <Check size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedSuggestions.length > 0 && (
                    <div className={styles.aiSuggestionsActions}>
                      <button
                        onClick={() => handleSubmit(selectedSuggestions)}
                        className={styles.primaryButton}
                        disabled={isProcessing || selectedSuggestions.length < minSelections}
                      >
                        <Check size={16} />
                        {t('common.confirm')} ({selectedSuggestions.length})
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }
        
        // Cards mode for writing style
        const aiValue = aiRecommendation?.value;
        const aiConfidence = aiRecommendation?.confidence || 0;
        
        return (
          <div className={styles.aiSuggestionContainer}>
            {/* Writing-style analysis prefetches in the background as soon
                as the site crawl finishes (see the
                writingStylePrefetchTriggered effect above). The old
                "Analyzing your content style..." banner only shows now if
                the user got here before the prefetch finished. */}
            {isLoadingAiRecommendation && !aiRecommendation && (
              <div className={styles.competitorPendingRow}>
                <Loader2 size={14} className={styles.spinIcon} />
              </div>
            )}

            {!isLoadingAiRecommendation && aiRecommendation && aiConfidence > 0.3 && (
              <div className={styles.aiRecommendationBanner}>
                <span className={styles.aiRecommendationIcon}>✨</span>
                <span>
                  {t('interviewWizard.messages.recommendedStyle', { style: t(`registration.interview.writingStyles.${aiValue}`) || aiValue }) 
                    || `Recommended: ${aiValue}`}
                </span>
                <span className={styles.confidenceBadge}>
                  {Math.round(aiConfidence * 100)}% {t('common.match') || 'match'}
                </span>
              </div>
            )}
            
            {!isLoadingAiRecommendation && (
            <div className={styles.cardsGrid}>
              {config.options?.map((opt, i) => {
                const isRecommended = opt.value === aiValue;
                
                return (
                  <button
                    key={i}
                    className={`${styles.optionCard} ${isRecommended ? styles.recommended : ''}`}
                    onClick={() => handleOptionSelect(opt.value)}
                  >
                    {isRecommended && <span className={styles.recommendedBadge}>✨</span>}
                    <span>{t(opt.labelKey)}</span>
                  </button>
                );
              })}
            </div>
            )}
          </div>
        );

      case 'SELECTION':
        // Hide options immediately after selection while processing
        if (isProcessing || isTyping) {
          return (
            <div className={styles.selectionContainer}>
              <div className={styles.aiLoadingBanner}>
                <Loader2 size={16} className={styles.spinIcon} />
                <span>{t('interviewWizard.messages.processing') || 'Processing...'}</span>
              </div>
            </div>
          );
        }
        
        // Check if this is the platform question and we have a detection
        const isPlatformQuestion = currentQuestion.saveToField === 'websitePlatform';
        const platformValue = detectedPlatform?.platform;
        const platformConfidence = detectedPlatform?.confidence || 0;
        
        // Searchable mode is rendered inline in the messages area, not in input area
        if (config.selectionMode === 'searchable') {
          return null;
        }
        
        return (
          <div className={styles.selectionContainer}>
            {isPlatformQuestion && isDetectingPlatform && (
              <div className={styles.aiLoadingBanner}>
                <Loader2 size={16} className={styles.spinIcon} />
                <span>{t('interviewWizard.messages.detectingPlatform') || 'Detecting your website platform...'}</span>
              </div>
            )}
            
            {isPlatformQuestion && platformValue && platformConfidence > 0.5 && (
              <div className={styles.aiRecommendationBanner}>
                <span className={styles.aiRecommendationIcon}>✨</span>
                <span>
                  {t('interviewWizard.messages.detectedPlatform', { 
                    platform: t(`registration.interview.platforms.${platformValue}`) || platformValue 
                  }) || `Detected: ${platformValue}`}
                </span>
                <span className={styles.confidenceBadge}>
                  {Math.round(platformConfidence * 100)}% {t('common.confident') || 'confident'}
                </span>
              </div>
            )}

            {isPlatformQuestion && platformValue && platformConfidence > 0.5 && (
              <div className={styles.detectedPlatformConfirm}>
                <button
                  onClick={() => handleOptionSelect(platformValue)}
                  className={styles.primaryButton}
                  disabled={isProcessing}
                >
                  <Check size={16} />
                  {t('interviewWizard.messages.confirmPlatform', { platform: t(`registration.interview.platforms.${platformValue}`) || platformValue })
                    || `Confirm ${t(`registration.interview.platforms.${platformValue}`) || platformValue}`}
                </button>
              </div>
            )}
            
            {config.selectionMode === 'dropdown' ? (
              <>
                <div className={styles.dropdownWrapper}>
                  <select 
                    className={styles.dropdown}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  >
                    <option value="">{t('interviewWizard.questionTypes.selection.placeholder')}</option>
                    {config.options?.map((opt, i) => (
                      <option key={i} value={opt.value}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className={styles.dropdownIcon} size={16} />
                </div>
                {inputValue && (
                  <button 
                    onClick={() => handleSubmit(inputValue)}
                    className={styles.confirmButton}
                  >
                    {t('common.confirm')}
                  </button>
                )}
              </>
            ) : config.selectionMode === 'searchable' ? (
              <>
                <div className={styles.searchableSelect}>
                  <div className={styles.searchInputWrapper}>
                    <input
                      type="text"
                      className={styles.searchInput}
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder={t('interviewWizard.questionTypes.selection.searchPlaceholder') || 'Search...'}
                    />
                    {searchFilter && (
                      <button 
                        className={styles.clearSearchBtn}
                        onClick={() => setSearchFilter('')}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className={styles.searchableOptions}>
                    {config.options
                      ?.filter(opt => {
                        const label = t(opt.labelKey) || opt.value;
                        return label.toLowerCase().includes(searchFilter.toLowerCase());
                      })
                      .map((opt, i) => (
                        <button
                          key={i}
                          className={`${styles.searchableOption} ${inputValue === opt.value ? styles.selected : ''}`}
                          onClick={() => {
                            setInputValue(opt.value);
                            setSearchFilter('');
                          }}
                        >
                          {t(opt.labelKey)}
                        </button>
                      ))}
                    {config.options?.filter(opt => {
                      const label = t(opt.labelKey) || opt.value;
                      return label.toLowerCase().includes(searchFilter.toLowerCase());
                    }).length === 0 && (
                      <div className={styles.noResults}>
                        {t('interviewWizard.questionTypes.selection.noResults') || 'No results found'}
                      </div>
                    )}
                  </div>
                </div>
                {inputValue && (
                  <div className={styles.selectedValue}>
                    <span>{t(`registration.interview.languages.${inputValue}`) || inputValue}</span>
                    <button 
                      onClick={() => handleSubmit(inputValue)}
                      className={styles.confirmButton}
                    >
                      {t('common.confirm')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.cardsGrid}>
                {config.options?.map((opt, i) => {
                  const isDetected = isPlatformQuestion && opt.value === platformValue;
                  
                  return (
                    <button
                      key={i}
                      className={`${styles.optionCard} ${isDetected ? styles.recommended : ''}`}
                      onClick={() => handleOptionSelect(opt.value)}
                    >
                      {isDetected && <span className={styles.recommendedBadge}>✨</span>}
                      <span>{t(opt.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'MULTI_SELECTION':
        // Hide options immediately after confirmation while processing
        if (isProcessing || isTyping) {
          return (
            <div className={styles.multiSelectionContainer}>
              <div className={styles.aiLoadingBanner}>
                <Loader2 size={16} className={styles.spinIcon} />
                <span>{t('interviewWizard.messages.processing') || 'Processing...'}</span>
              </div>
            </div>
          );
        }
        
        const currentSelection = Array.isArray(responses[currentQuestion?.id]) 
          ? responses[currentQuestion.id] 
          : [];
        return (
          <div className={styles.multiSelectionContainer}>
            <div className={styles.checkboxGrid}>
              {config.options?.map((opt, i) => (
                <label key={i} className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={currentSelection.includes(opt.value)}
                    onChange={() => handleMultiSelect(opt.value)}
                    className={styles.checkbox}
                  />
                  <span>{t(opt.labelKey)}</span>
                </label>
              ))}
            </div>
            {currentSelection.length > 0 && (
              <button 
                onClick={() => handleSubmit(currentSelection)}
                className={styles.confirmButton}
              >
                {t('common.confirm')} ({currentSelection.length} {t('common.selected').toLowerCase()})
              </button>
            )}
          </div>
        );

      case 'SLIDER':
        // Hide options immediately after confirmation while processing
        if (isProcessing || isTyping) {
          return (
            <div className={styles.sliderContainer}>
              <div className={styles.aiLoadingBanner}>
                <Loader2 size={16} className={styles.spinIcon} />
                <span>{t('interviewWizard.messages.processing') || 'Processing...'}</span>
              </div>
            </div>
          );
        }
        
        const sliderValue = responses[currentQuestion?.id] ?? internalLinksDefault ?? config.defaultValue ?? config.min;
        const isInternalLinksQuestion = currentQuestion.saveToField === 'internalLinksPer1000Words' || currentQuestion.saveToField === 'internalLinksCount';
        
        if (isInternalLinksQuestion) {
          // Range buttons mode for internal links
          const internalLinksRanges = [
            { label: '0', value: '0' },
            { label: '1-2', value: '1-2' },
            { label: '2-3', value: '2-3', recommended: true },
            { label: '3-4', value: '3-4' },
            { label: '4-5', value: '4-5' },
          ];
          const selectedRange = responses[currentQuestion?.id] || null;
          
          return (
            <div className={styles.sliderContainer}>
              <div className={styles.sliderHint}>
                <span className={styles.hintIcon}>💡</span>
                <span>
                  {t('registration.interview.hints.internalLinksExplanation') || 'The recommendation is 2-3 internal links per 1000 words in an article. Internal links help search engines understand your site structure and improve user navigation.'}
                </span>
              </div>
              <div className={styles.rangeButtonsGrid}>
                {internalLinksRanges.map((range, i) => (
                  <button
                    key={i}
                    className={`${styles.rangeButton} ${selectedRange === range.value ? styles.selected : ''} ${range.recommended ? styles.recommended : ''}`}
                    onClick={() => {
                      setResponses(prev => ({
                        ...prev,
                        [currentQuestion.id]: range.value,
                      }));
                    }}
                  >
                    <span className={styles.rangeButtonLabel}>{range.label}</span>
                    {range.recommended && <span className={styles.recommendedBadge}>✨</span>}
                  </button>
                ))}
              </div>
              {selectedRange && (
                <button 
                  onClick={() => handleSubmit(selectedRange)}
                  className={styles.confirmButton}
                >
                  {t('common.confirm')}
                </button>
              )}
            </div>
          );
        }
        
        // Default slider mode for other SLIDER questions
        const recommendedMin = config.recommendedMin ?? 3;
        const recommendedMax = config.recommendedMax ?? 5;
        
        return (
          <div className={styles.sliderContainer}>
            <input
              type="range"
              min={config.min}
              max={config.max}
              step={config.step}
              value={sliderValue}
              onChange={(e) => setResponses(prev => ({
                ...prev,
                [currentQuestion.id]: parseInt(e.target.value)
              }))}
              className={styles.slider}
            />
            <div className={styles.sliderValue}>{sliderValue}</div>
            <button 
              onClick={() => handleSubmit(sliderValue)}
              className={styles.confirmButton}
            >
              {t('common.confirm')}
            </button>
          </div>
        );

      case 'EDITABLE_DATA':
        // Get data from externalData based on dataSource
        const dataSource = config.dataSource || 'crawledData';
        const sourceData = externalData[dataSource] || {};
        
        // Map field keys to sourceData properties (handles naming differences)
        const getFieldValue = (fieldKey) => {
          // First check editableData (user edits take priority)
          // For businessName: never allow empty - fall through to sourceData
          // For all other fields: if user explicitly set a value (even empty), use it
          if (fieldKey !== 'businessName' && editableData[fieldKey] !== undefined) {
            return editableData[fieldKey];
          }
          if (fieldKey === 'businessName' && editableData[fieldKey]) {
            return editableData[fieldKey];
          }
          // Fall back to sourceData with proper mapping
          let value = '';
          switch (fieldKey) {
            case 'businessName':
              value = sourceData.businessName || '';
              break;
            case 'phone':
              value = sourceData.phone || sourceData.phones?.[0] || '';
              break;
            case 'email':
              value = sourceData.email || sourceData.emails?.[0] || '';
              break;
            case 'about':
              value = sourceData.description || '';
              break;
            case 'category':
              value = sourceData.category || '';
              break;
            case 'address':
              value = sourceData.address || '';
              break;
            default:
              value = sourceData[fieldKey] || '';
          }
          return value;
        };
        
        // Build current values object for submission
        const getCurrentValues = () => {
          const values = {};
          config.editableFields?.forEach(field => {
            values[field.key] = getFieldValue(field.key);
          });
          return values;
        };
        
        // Compact inline data card display
        if (editableDataConfirmed) return null;
        return (
          <div className={styles.inlineEditableData}>
            <div className={styles.inlineDataCard}>
              {config.editableFields?.map((field) => {
                const value = getFieldValue(field.key);
                if (!value) return null;
                return (
                  <div key={field.key} className={styles.inlineDataRow}>
                    <span className={styles.inlineDataLabel}>{t(field.labelKey)}:</span>
                    <span className={styles.inlineDataValue}>{value}</span>
                  </div>
                );
              })}
            </div>
            
            <div className={styles.inlineDataActions}>
              <button 
                onClick={() => { setEditableDataConfirmed(true); handleSubmit(getCurrentValues()); }}
                className={styles.primaryButton}
                disabled={isTyping || isProcessing}
              >
                <Check size={16} />
                {t('registration.interview.actions.confirm')}
              </button>
              <button 
                onClick={() => setShowEditModal(true)}
                className={styles.secondaryButton}
                disabled={isTyping || isProcessing}
              >
                <Edit2 size={16} />
                {t('registration.interview.actions.edit')}
              </button>
            </div>
          </div>
        );

      case 'DYNAMIC':
        // Dynamic content based on optionsSource (e.g., crawledArticles)
        const maxDynamicSelections = config.maxSelections || 5;
        
        // Toggle selection for dynamic options
        const toggleDynamicSelection = (url) => {
          setSelectedDynamicOptions(prev => {
            if (prev.includes(url)) {
              return prev.filter(u => u !== url);
            }
            if (prev.length >= maxDynamicSelections) {
              return prev;
            }
            return [...prev, url];
          });
        };
        
        return (
          <div className={styles.dynamicContainer}>
            {isLoadingDynamicOptions && (
              <div className={styles.aiLoadingBanner}>
                <Loader2 size={16} className={styles.spinIcon} />
                <span>{t('interviewWizard.messages.fetchingArticles')}</span>
              </div>
            )}
            
            {!isLoadingDynamicOptions && dynamicOptions.length > 0 && (
              <>
                <div className={styles.articlesGrid}>
                  {dynamicOptions.map((article, index) => {
                    const hasImage = !!article.image;
                    const title = article.title || t('interviewWizard.messages.untitledArticle');
                    return (
                      <button
                        key={article.url || index}
                        className={`${styles.articleCard} ${
                          selectedDynamicOptions.includes(article.url) ? styles.selected : ''
                        }`}
                        onClick={() => toggleDynamicSelection(article.url)}
                        disabled={
                          !selectedDynamicOptions.includes(article.url) &&
                          selectedDynamicOptions.length >= maxDynamicSelections
                        }
                        title={title}
                      >
                        {hasImage ? (
                          <div className={styles.articleImage}>
                            <img src={article.image} alt="" />
                          </div>
                        ) : (
                          <div className={styles.articleNoImage}>
                            {t('interviewWizard.messages.noFeaturedImage')}
                          </div>
                        )}
                        <div className={styles.articleContent}>
                          <h4 className={styles.articleTitle}>{title}</h4>
                          {hasImage && article.excerpt && (
                            <p className={styles.articleExcerpt}>{article.excerpt}</p>
                          )}
                          {!hasImage && (
                            <span className={styles.articleNoImageNote}>
                              {t('interviewWizard.messages.noFeaturedImageNote')}
                            </span>
                          )}
                        </div>
                        {article.url && (
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.articleLink}
                            onClick={(e) => e.stopPropagation()}
                            title={t('common.openInNewTab')}
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                        {selectedDynamicOptions.includes(article.url) && (
                          <div className={styles.selectedBadge}>
                            <Check size={14} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                
                <div className={styles.dynamicActions}>
                  {selectedDynamicOptions.length > 0 && (
                    <button 
                      onClick={() => handleSubmit(selectedDynamicOptions)}
                      className={styles.confirmButton}
                    >
                      {t('common.confirm')} ({selectedDynamicOptions.length}/{maxDynamicSelections})
                    </button>
                  )}
                  <button 
                    onClick={() => handleSubmit([])}
                    className={styles.skipLink}
                  >
                    {t('common.skip')}
                  </button>
                </div>
              </>
            )}
            
            {!isLoadingDynamicOptions && dynamicOptions.length === 0 && (
              <div className={styles.blogDiscoveryContainer}>
                {/* Phase: Ask if user has a blog */}
                {(blogDiscoveryPhase === 'initial' || blogDiscoveryPhase === 'askHasBlog') && (
                  <div className={styles.blogDiscoveryAsk}>
                    <p className={styles.blogDiscoveryText}>
                      {t('interviewWizard.blogDiscovery.hasBlog')}
                    </p>
                    <div className={styles.blogDiscoveryButtons}>
                      <button
                        onClick={() => setBlogDiscoveryPhase('enterUrl')}
                        className={styles.blogDiscoveryYes}
                      >
                        {t('interviewWizard.blogDiscovery.yes')}
                      </button>
                      <button
                        onClick={() => handleSubmit([])}
                        className={styles.blogDiscoveryNo}
                      >
                        {t('interviewWizard.blogDiscovery.no')}
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Phase: Enter blog URL */}
                {blogDiscoveryPhase === 'enterUrl' && (
                  <div className={styles.blogDiscoveryUrl}>
                    <p className={styles.blogDiscoveryText}>
                      {t('interviewWizard.blogDiscovery.enterUrl')}
                    </p>
                    <div className={styles.blogUrlInputWrapper}>
                      <input
                        type="url"
                        value={manualBlogUrl}
                        onChange={(e) => setManualBlogUrl(e.target.value)}
                        placeholder={t('interviewWizard.blogDiscovery.placeholder')}
                        className={styles.blogUrlInput}
                        dir="ltr"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && manualBlogUrl.trim()) {
                            handleBlogUrlFetch(manualBlogUrl.trim());
                          }
                        }}
                      />
                      <button
                        onClick={() => handleBlogUrlFetch(manualBlogUrl.trim())}
                        disabled={!manualBlogUrl.trim()}
                        className={styles.blogUrlSubmit}
                      >
                        <Send size={18} />
                      </button>
                    </div>
                    {blogFetchError && (
                      <p className={styles.blogFetchError}>{blogFetchError}</p>
                    )}
                    <button
                      onClick={() => handleSubmit([])}
                      className={styles.skipLink}
                    >
                      {t('common.skip')}
                    </button>
                  </div>
                )}
                
                {/* Phase: Fetching articles from manual URL */}
                {blogDiscoveryPhase === 'fetching' && (
                  <div className={styles.aiLoadingBanner}>
                    <Loader2 size={16} className={styles.spinIcon} />
                    <span>{t('interviewWizard.blogDiscovery.fetching')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'ENTITIES_SELECTION': {
        // Sub-step that lets the user pick which entity types to import for
        // a site that hasn't been populated yet. Renders the shared panel
        // which races a 10s wait if the discover scan is still in flight,
        // and silently calls onSkip on FAILED/EMPTY/timeout per spec.
        const handleEntitiesConfirm = async (slugs) => {
          // Persist the selection. We don't kick off populate here - the
          // dashboard's existing populate flow handles that, triggered by
          // the user from /dashboard/entities once the wizard closes. This
          // keeps the wizard fast and avoids duplicating populate logic.
          await entitiesScan.saveSelection(slugs);
          handleSubmit(slugs);
        };

        const handleEntitiesSkip = () => {
          // 'skipped' matches the convention used by WORDPRESS_PLUGIN /
          // GOOGLE_INTEGRATION skip paths, so the server-side interview
          // pipeline records this question as deliberately skipped.
          handleSubmit('skipped');
        };

        // The panel auto-triggers the scan via its own effect when status is
        // IDLE - see EntitiesSelectionPanel. No render-time side effect here.

        return (
          <div className={styles.integrationContainer}>
            <EntitiesSelectionPanel
              scan={entitiesScan}
              onConfirm={handleEntitiesConfirm}
              onSkip={handleEntitiesSkip}
              waitTimeoutMs={10000}
            />
          </div>
        );
      }

      case 'WORDPRESS_PLUGIN': {
        const pluginSiteId = interviewSiteId || site?.id;
        const pluginSiteKey = site?.siteKey;
        const pluginDownloadUrl = pluginSiteId
          ? `/api/plugin/download?site_key=${pluginSiteKey || ''}`
          : null;
        
        const handleDownloadPlugin = () => {
          if (pluginDownloadUrl) {
            window.open(pluginDownloadUrl, '_blank');
            setWpPluginStatus('downloaded');
          }
        };

        const startConnectionPolling = () => {
          if (wpPluginPollRef.current || !pluginSiteId) return;
          setWpPluginStatus('checking');
          let attempts = 0;
          const maxAttempts = 30; // ~60 seconds
          wpPluginPollRef.current = setInterval(async () => {
            attempts++;
            try {
              const res = await fetch(`/api/sites/${pluginSiteId}/connection-status?_t=${Date.now()}`);
              if (res.ok) {
                const data = await res.json();
                if (data.connectionStatus === 'CONNECTED') {
                  clearInterval(wpPluginPollRef.current);
                  wpPluginPollRef.current = null;
                  setWpPluginStatus('connected');
                  setTimeout(() => handleSubmit('connected'), 1500);
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
        
        return (
          <div className={styles.integrationContainer}>
            <div className={styles.integrationCard}>
              <div className={styles.integrationIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#21759b"/>
                  <path d="M3.01 12c0 4.97 4.02 8.99 8.99 8.99s8.99-4.02 8.99-8.99S16.97 3.01 12 3.01 3.01 7.03 3.01 12zM12 4.52c2.05 0 3.93.75 5.37 2l-1.73 4.95L11 5.07c.32-.04.66-.06 1-.06.35 0 .68.02 1 .06L10.63 6.5l-1.73-4.95-.02.01C7.43 2.81 5.32 4.18 4.16 6.14l2.22 6.15-3.36-4.41C3.02 8.54 3 8.77 3 9c0 1.7.56 3.27 1.51 4.54L7.67 19c-2.87-1.62-4.82-4.69-4.82-8.24 0-1.28.26-2.5.72-3.62l2.81 7.81-3.37-2.95z" fill="#21759b" opacity="0.3"/>
                </svg>
              </div>
              <div className={styles.integrationInfo}>
                <h4 className={styles.integrationTitle}>
                  {t('interviewWizard.wordpressPlugin.title') || 'Install GhostSEO WordPress Plugin'}
                </h4>
                <p className={styles.integrationDesc}>
                  {t('interviewWizard.wordpressPlugin.description') || 'Install our WordPress plugin to enable automatic article publishing directly to your website.'}
                </p>
                <ul className={styles.integrationBenefits}>
                  <li>{t('interviewWizard.wordpressPlugin.benefit1') || 'Automatic article publishing to WordPress'}</li>
                  <li>{t('interviewWizard.wordpressPlugin.benefit2') || 'SEO optimization built-in'}</li>
                  <li>{t('interviewWizard.wordpressPlugin.benefit3') || 'Manage content directly from GhostSEO'}</li>
                </ul>
              </div>
            </div>
            
            <div className={styles.integrationActions}>
              {wpPluginStatus === 'connected' && (
                <div className={styles.integrationSuccess}>
                  <CheckCircle2 size={18} />
                  <span>{t('interviewWizard.wordpressPlugin.connected') || 'WordPress plugin connected successfully!'}</span>
                </div>
              )}
              
              {wpPluginStatus === 'checking' && (
                <div className={styles.integrationConnecting}>
                  <Loader2 size={16} className={styles.spinIcon} />
                  <span>{t('interviewWizard.wordpressPlugin.waitingForConnection') || 'Waiting for plugin connection... Install and activate the plugin in WordPress.'}</span>
                </div>
              )}

              {wpPluginStatus === 'error' && (
                <>
                  <p className={styles.integrationError}>
                    {t('interviewWizard.wordpressPlugin.connectionTimeout') || "We couldn't detect the plugin connection. You can try again or skip and set it up later in Settings."}
                  </p>
                  <button
                    onClick={() => {
                      setWpPluginStatus('downloaded');
                    }}
                    className={styles.secondaryButton}
                  >
                    {t('common.retry') || 'Try Again'}
                  </button>
                </>
              )}

              {(wpPluginStatus === 'idle' || wpPluginStatus === 'downloaded') && pluginDownloadUrl && (
                <>
                  <button
                    onClick={handleDownloadPlugin}
                    className={styles.wordpressPluginButton}
                    disabled={isProcessing}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    {t('interviewWizard.wordpressPlugin.downloadButton') || 'Download Plugin'}
                  </button>
                  
                  {wpPluginStatus === 'downloaded' && (
                    <button
                      onClick={startConnectionPolling}
                      className={styles.primaryButton}
                      disabled={isProcessing}
                    >
                      <CheckCircle2 size={16} />
                      {t('interviewWizard.wordpressPlugin.checkConnection') || 'I installed & activated it - Check Connection'}
                    </button>
                  )}
                </>
              )}

              {!pluginDownloadUrl && wpPluginStatus === 'idle' && (
                <p className={styles.integrationDesc}>
                  {t('interviewWizard.wordpressPlugin.noSiteKey') || 'Plugin will be available after setup is complete.'}
                </p>
              )}
              
              {wpPluginStatus !== 'connected' && (
                <button
                  onClick={() => {
                    if (wpPluginPollRef.current) {
                      clearInterval(wpPluginPollRef.current);
                      wpPluginPollRef.current = null;
                    }
                    handleSubmit('skipped');
                  }}
                  className={styles.skipLink}
                  disabled={isProcessing || wpPluginStatus === 'checking'}
                >
                  {t('interviewWizard.wordpressPlugin.skipText') || "Skip - I'll install it later"}
                </button>
              )}
            </div>
          </div>
        );
      }

      case 'GOOGLE_INTEGRATION': {
        const siteIdForGoogle = interviewSiteId || site?.id;
        
        const handleConnectGoogle = async () => {
          if (!siteIdForGoogle) {
            console.error('[GoogleIntegration] No siteId available');
            return;
          }
          
          setGoogleIntegrationStatus('connecting');
          
          try {
            const res = await fetch('/api/settings/integrations/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'connect',
                siteId: siteIdForGoogle,
                fromInterview: true,
              }),
            });
            
            const data = await res.json();
            
            if (data.authUrl) {
              // Open OAuth in popup
              const popup = window.open(
                data.authUrl,
                'google-oauth',
                'width=500,height=650,scrollbars=yes,resizable=yes'
              );
              
              // Check if the popup was blocked by the browser
              if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                console.warn('[GoogleIntegration] Popup was blocked by browser');
                setGoogleIntegrationStatus('popup-blocked');
                return;
              }
              
              // Listen for postMessage from popup
              const messageHandler = (event) => {
                if (event.data?.type === 'google-integration-success') {
                  setGoogleIntegrationStatus('connected');
                  window.removeEventListener('message', messageHandler);
                  // Auto-submit after a short delay to show success
                  setTimeout(() => {
                    handleSubmit('connected');
                  }, 1500);
                } else if (event.data?.type === 'google-integration-error') {
                  setGoogleIntegrationStatus('error');
                  window.removeEventListener('message', messageHandler);
                }
              };
              window.addEventListener('message', messageHandler);
              
              // Also check if popup was closed manually
              const checkClosed = setInterval(() => {
                if (popup?.closed) {
                  clearInterval(checkClosed);
                  // User closed popup without completing - reset to idle so skip button works
                  // Note: if success message was received, the interval was already cleared by messageHandler
                  setGoogleIntegrationStatus('idle');
                  window.removeEventListener('message', messageHandler);
                }
              }, 1000);
            }
          } catch (err) {
            console.error('[GoogleIntegration] Error:', err);
            setGoogleIntegrationStatus('error');
          }
        };
        
        return (
          <div className={styles.integrationContainer}>
            <div className={styles.integrationCard}>
              <div className={styles.integrationIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div className={styles.integrationInfo}>
                <h4 className={styles.integrationTitle}>
                  {t('interviewWizard.googleIntegration.title') || 'Connect Google Analytics & Search Console'}
                </h4>
                <p className={styles.integrationDesc}>
                  {t('interviewWizard.googleIntegration.description') || 'Connecting Google Analytics (GA4) and Search Console (GSC) lets us understand how your site performs in search results and identify the best opportunities to grow your traffic.'}
                </p>
                <ul className={styles.integrationBenefits}>
                  <li>{t('interviewWizard.googleIntegration.benefit1') || 'See which pages bring the most traffic and how visitors behave'}</li>
                  <li>{t('interviewWizard.googleIntegration.benefit2') || 'Track your search rankings, impressions, and click-through rates'}</li>
                  <li>{t('interviewWizard.googleIntegration.benefit3') || 'Get smarter AI recommendations based on real performance data'}</li>
                </ul>
              </div>
            </div>
            
            <div className={styles.integrationActions}>
              {googleIntegrationStatus === 'idle' && (
                <button
                  onClick={handleConnectGoogle}
                  className={styles.googleConnectButton}
                  disabled={!siteIdForGoogle || isProcessing}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {t('interviewWizard.googleIntegration.connectButton') || 'Connect Google Account'}
                </button>
              )}
              
              {googleIntegrationStatus === 'connecting' && (
                <div className={styles.integrationConnecting}>
                  <Loader2 size={16} className={styles.spinIcon} />
                  <span>{t('interviewWizard.googleIntegration.connecting') || 'Connecting... Complete the sign-in in the popup window.'}</span>
                </div>
              )}
              
              {googleIntegrationStatus === 'connected' && (
                <div className={styles.integrationSuccess}>
                  <CheckCircle2 size={18} />
                  <span>{t('interviewWizard.googleIntegration.connected') || 'Google account connected successfully!'}</span>
                </div>
              )}
              
              {googleIntegrationStatus === 'error' && (
                <>
                  <p className={styles.integrationError}>
                    {t('interviewWizard.googleIntegration.error') || 'Connection failed. You can try again or skip this step.'}
                  </p>
                  <button
                    onClick={() => {
                      setGoogleIntegrationStatus('idle');
                    }}
                    className={styles.secondaryButton}
                  >
                    {t('common.retry') || 'Try Again'}
                  </button>
                </>
              )}
              
              {googleIntegrationStatus === 'popup-blocked' && (
                <>
                  <div className={styles.integrationWarning}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span>{t('interviewWizard.googleIntegration.popupBlocked') || 'The sign-in popup was blocked by your browser. Please allow popups for this site and try again.'}</span>
                  </div>
                  <button
                    onClick={() => {
                      setGoogleIntegrationStatus('idle');
                      // Small delay then retry
                      setTimeout(() => handleConnectGoogle(), 100);
                    }}
                    className={styles.secondaryButton}
                  >
                    {t('common.retry') || 'Try Again'}
                  </button>
                </>
              )}
              
              {googleIntegrationStatus !== 'connected' && (
                <button
                  onClick={() => handleSubmit('skipped')}
                  className={styles.skipLink}
                  disabled={isProcessing || googleIntegrationStatus === 'connecting'}
                >
                  {t('interviewWizard.googleIntegration.skipText') || 'Skip - I\'ll set this up later in Settings'}
                </button>
              )}
            </div>
          </div>
        );
      }

      case 'INPUT':
      default:
        const placeholderKey = config.placeholderKey;
        const placeholder = placeholderKey 
          ? t(placeholderKey) 
          : t('interviewWizard.inputPlaceholder');
        
        if (config.inputType === 'textarea') {
          return (
            <div className={styles.inputArea}>
              <div className={styles.textareaWrapper}>
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={isTyping}
                  placeholder={placeholder}
                  className={styles.textarea}
                  rows={config.rows || 3}
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={!inputValue.trim() || isTyping}
                  className={styles.sendButton}
                >
                  {isTyping ? <Loader2 size={20} className={styles.spinIcon} /> : <Send size={20} />}
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className={styles.inputArea}>
            <div className={styles.inputWrapper}>
              <input
                ref={inputRef}
                type={config.inputType || 'text'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isTyping}
                placeholder={placeholder}
                className={styles.input}
              />
              <button
                onClick={() => handleSubmit()}
                disabled={!inputValue.trim() || isTyping}
                className={styles.sendButton}
              >
                {isTyping ? <Loader2 size={20} className={styles.spinIcon} /> : <Send size={20} />}
              </button>
            </div>
          </div>
        );
    }
  };

  const progressPercentage = questions.length > 0 
    ? ((currentQuestionIndex + 1) / questions.length) * 100 
    : 0;

  // Show loading while fetching data OR while dictionary is not ready
  if (loading || !isDictionaryReady) {
    return createPortal(
      <div className={styles.overlay}>
        <div className={styles.wizardContainer}>
          <div className={styles.loadingContainer}>
            <Loader2 size={32} className={styles.spinIcon} />
            <p>{isDictionaryReady ? t('common.loading') : 'Loading...'}</p>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (error) {
    return createPortal(
      <div className={styles.overlay}>
        <div className={styles.wizardContainer}>
          <div className={styles.errorContainer}>
            <p>{error}</p>
            <button onClick={handleClose} className={styles.closeButtonText}>
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // If credits are exhausted, show add-credits modal instead of interview
  if (creditsError) {
    return <AddCreditsModal isOpen={true} onClose={onClose} />;
  }

  // Welcome screen - show before interview starts
  if (!hasStarted) {
    return createPortal(
      <div className={`${styles.overlay} ${isClosing ? styles.overlayClosing : ''}`}>
        <div className={`${styles.wizardContainer} ${isClosing ? styles.wizardClosing : ''}`}>
          {/* Ambient Glow */}
          <div className={styles.ambientGlow}></div>
          
          {/* Main Container */}
          <div className={styles.mainContainer}>
            
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerContent}>
                <div className={styles.headerIcon}>
                  <Image src="/favicon.svg" alt="Ghost" width={20} height={20} className={styles.logo} />
                </div>
                <div className={styles.headerText}>
                  <h2 className={styles.headerTitle}>{t('interviewWizard.title')}</h2>
                </div>
              </div>
              <button onClick={handleClose} className={styles.closeButton}>
                <X size={16} />
              </button>
            </div>

            {/* Welcome Content */}
            <div className={styles.welcomeScreen}>
              <div className={styles.welcomeIcon}>
                <Image src="/favicon.svg" alt="Ghost" width={80} height={80} className={styles.welcomeLogo} />
              </div>
              <h3 className={styles.welcomeTitle}>{t('interviewWizard.welcome.title')}</h3>
              <p className={styles.welcomeDescription}>
                {t('interviewWizard.welcome.description')}
              </p>
              <div className={styles.welcomeInfo}>
                <div className={styles.welcomeInfoItem}>
                  <span className={styles.welcomeInfoIcon}>⏱️</span>
                  <span>{t('interviewWizard.welcome.duration')}</span>
                </div>
                <div className={styles.welcomeInfoItem}>
                  <span className={styles.welcomeInfoIcon}>❓</span>
                  <span>{t('interviewWizard.welcome.questions', { count: questions.length })}</span>
                </div>
                <div className={styles.welcomeInfoItem}>
                  <span className={styles.welcomeInfoIcon}>🪙</span>
                  <span>{t('interviewWizard.welcome.estimatedCredits')}</span>
                </div>
              </div>
              <p className={styles.welcomeCreditsNote}>
                {t('interviewWizard.welcome.creditsNote')}
              </p>
              <button className={styles.welcomeStartButton} onClick={handleStartInterview}>
                {t('interviewWizard.welcome.startButton')}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className={`${styles.overlay} ${isClosing ? styles.overlayClosing : ''}`}>
      <div className={`${styles.wizardContainer} ${isClosing ? styles.wizardClosing : ''} ${isMaximized ? 'modal-maximized' : ''}`}>
        {/* Ambient Glow */}
        <div className={styles.ambientGlow}></div>
        
        {/* Main Container */}
        <div className={styles.mainContainer}>
          
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerContent}>
              <div className={styles.headerIcon}>
                <Image src="/favicon.svg" alt="Ghost" width={20} height={20} className={styles.logo} />
              </div>
              <div className={styles.headerText}>
                <h2 className={styles.headerTitle}>{t('interviewWizard.title')}</h2>
                <p className={styles.headerSubtitle}>
                  {t('interviewWizard.questionProgress', { current: Math.min(currentQuestionIndex + 1, questions.length), total: questions.length })}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <ModalResizeButton isMaximized={isMaximized} onToggle={toggleMaximize} className={styles.closeButton} />
              <button onClick={handleClose} className={styles.closeButton}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill}
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>

          {/* Messages Area */}
          <div className={styles.messagesArea}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.messageRow} ${message.type === 'user' ? styles.userRow : styles.agentRow}`}
              >
                <div className={`${styles.messageWrapper} ${message.type === 'user' ? styles.userWrapper : styles.agentWrapper}`}>
                  {/* Avatar */}
                  <div className={`${styles.avatar} ${message.type === 'agent' ? styles.agentAvatar : styles.userAvatar}`}>
                    {message.type === 'agent' ? (
                      <Image src="/favicon.svg" alt="Ghost" width={16} height={16} className={styles.logo} />
                    ) : (
                      <div className={styles.userDot}></div>
                    )}
                  </div>

                  {/* User message hover actions */}
                  {message.type === 'user' && !message.isProcessing && !isTyping && !isProcessing && (
                    <div className={styles.messageHoverActions}>
                      {/* Retry button */}
                      <button
                        type="button"
                        className={styles.messageHoverBtn}
                        onClick={() => handleRetryMessage(message.id)}
                        title={t('interviewWizard.actions.retry') || 'Retry'}
                      >
                        <RotateCcw size={14} />
                      </button>
                      {/* Edit button */}
                      <button
                        type="button"
                        className={styles.messageHoverBtn}
                        onClick={() => handleStartEdit(message.id)}
                        title={t('interviewWizard.actions.edit') || 'Edit'}
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className={`${styles.messageBubble} ${message.type === 'agent' ? styles.agentBubble : styles.userBubble} ${editingMessageId === message.id ? styles.editingBubble : ''}`}>
                    {message.isProcessing ? (
                      <div className={styles.processingMessage}>
                        <Loader2 size={16} className={styles.spinIcon} />
                        <p className={styles.messageText}>{message.content}</p>
                      </div>
                    ) : editingMessageId === message.id ? (
                      /* Edit mode for user message */
                      <div className={styles.messageEditMode}>
                        <textarea
                          className={styles.messageEditInput}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          autoFocus
                          rows={3}
                        />
                        <div className={styles.messageEditActions}>
                          <button
                            type="button"
                            className={styles.messageEditSave}
                            onClick={handleSaveEdit}
                          >
                            {t('interviewWizard.actions.saveAndSend') || 'Save & Send'}
                          </button>
                          <button
                            type="button"
                            className={styles.messageEditCancel}
                            onClick={handleCancelEdit}
                          >
                            {t('common.cancel') || 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className={styles.messageText}>{message.content}</p>
                        
                        {/* Data Card for EDITABLE_DATA messages */}
                        {message.dataCard && (() => {
                          // Use live editableData state so edits are reflected immediately
                          const dc = {
                            businessName: editableData.businessName || message.dataCard.businessName,
                            description: editableData.about !== undefined ? editableData.about : message.dataCard.description,
                            email: editableData.email !== undefined ? editableData.email : message.dataCard.email,
                            phone: editableData.phone !== undefined ? editableData.phone : message.dataCard.phone,
                            category: editableData.category !== undefined ? editableData.category : message.dataCard.category,
                            address: editableData.address !== undefined ? editableData.address : message.dataCard.address,
                            seoScore: message.dataCard.seoScore,
                          };
                          return (
                          <div className={styles.messageDataCard}>
                            {dc.businessName && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('registration.interview.fields.businessName')}</span>
                                <span className={styles.dataCardValue}>{dc.businessName}</span>
                              </div>
                            )}
                            {dc.description && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('registration.interview.fields.about')}</span>
                                <span className={styles.dataCardValue}>{dc.description}</span>
                              </div>
                            )}
                            {dc.email && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('registration.interview.fields.email')}</span>
                                <span className={styles.dataCardValue}>{dc.email}</span>
                              </div>
                            )}
                            {dc.phone && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('registration.interview.fields.phone')}</span>
                                <span className={styles.dataCardValue}>{dc.phone}</span>
                              </div>
                            )}
                            {dc.category && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('registration.interview.fields.category')}</span>
                                <span className={styles.dataCardValue}>{dc.category}</span>
                              </div>
                            )}
                            {dc.seoScore !== undefined && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('interviewWizard.seoScore') || 'SEO Score'}</span>
                                <span className={`${styles.dataCardValue} ${
                                  dc.seoScore >= 70 ? styles.seoGood : 
                                  dc.seoScore >= 40 ? styles.seoWarning : styles.seoBad
                                }`}>
                                  {dc.seoScore}/100
                                </span>
                              </div>
                            )}
                          </div>
                          );
                        })()}
                        
                        {/* Inline Searchable Selection for SELECTION questions */}
                        {message.type === 'agent' && 
                         message.questionType === 'SELECTION' && 
                         message.inputConfig?.selectionMode === 'searchable' &&
                         message.questionId === questions[currentQuestionIndex]?.id &&
                         !isTyping && !isProcessing && (
                          renderInlineSelectionContent(
                            // Use fresh question config (has up-to-date options) over stored message config
                            questions[currentQuestionIndex]?.inputConfig || message.inputConfig
                          )
                        )}
                      </>
                    )}
                    <span className={styles.messageTime}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className={`${styles.messageRow} ${styles.agentRow}`}>
                <div className={`${styles.messageWrapper} ${styles.agentWrapper}`}>
                  <div className={`${styles.avatar} ${styles.agentAvatar}`}>
                    <Image src="/favicon.svg" alt="Ghost" width={16} height={16} className={styles.logo} />
                  </div>
                  <div className={`${styles.messageBubble} ${styles.agentBubble}`}>
                    <div className={styles.typingIndicator}>
                      <div className={styles.typingDot} style={{ animationDelay: '0ms' }}></div>
                      <div className={styles.typingDot} style={{ animationDelay: '150ms' }}></div>
                      <div className={styles.typingDot} style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Validation Error */}
            {validationError && (
              <div className={styles.validationError}>
                {validationError}
                {urlSuggestion && (
                  <button 
                    className={styles.suggestionButton}
                    onClick={() => {
                      setInputValue(urlSuggestion);
                      setValidationError(null);
                      setUrlSuggestion(null);
                    }}
                  >
                    {t('interviewWizard.useSuggestion', { defaultValue: 'Use this' })} →
                  </button>
                )}
              </div>
            )}

            {/* Completion Message */}
            {isComplete && (
              <div className={styles.completionContainer}>
                <div className={styles.completionCard}>
                  <div className={styles.completionGlow}></div>
                  <div className={styles.completionContent}>
                    <CheckCircle2 size={48} className={styles.completionIcon} />
                    <h3 className={styles.completionTitle}>{t('interviewWizard.interviewComplete')}</h3>
                    <p className={styles.completionText}>{t('interviewWizard.creatingStrategy')}</p>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Dynamic Input Area based on question type */}
          {!isComplete && renderQuestionInput()}
        </div>

        {/* Edit Modal for EDITABLE_DATA */}
        {showEditModal && (
          <div className={styles.editModalOverlay} onClick={() => setShowEditModal(false)}>
            <div className={styles.editModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.editModalHeader}>
                <h3>{t('registration.interview.actions.edit')}</h3>
                <button 
                  className={styles.editModalClose}
                  onClick={() => setShowEditModal(false)}
                >
                  <X size={20} />
                </button>
              </div>
              <div className={styles.editModalBody}>
                {questions[currentQuestionIndex]?.inputConfig?.editableFields?.map((field) => {
                  const currentValue = editableData[field.key] ?? 
                    (externalData?.crawledData?.[field.key] || 
                     externalData?.crawledData?.[field.key === 'about' ? 'description' : field.key] || 
                     externalData?.crawledData?.[field.key === 'phone' ? 'phones' : field.key]?.[0] ||
                     externalData?.crawledData?.[field.key === 'email' ? 'emails' : field.key]?.[0] || '');
                  return (
                    <div key={field.key} className={styles.editModalField}>
                      <label className={styles.editModalLabel}>
                        {t(field.labelKey)}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          className={styles.editModalTextarea}
                          value={currentValue}
                          onChange={(e) => setEditableData(prev => ({
                            ...prev,
                            [field.key]: e.target.value
                          }))}
                          rows={3}
                        />
                      ) : (
                        <input
                          type={field.type || 'text'}
                          className={styles.editModalInput}
                          value={currentValue}
                          onChange={(e) => setEditableData(prev => ({
                            ...prev,
                            [field.key]: e.target.value
                          }))}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className={styles.editModalFooter}>
                <button 
                  className={styles.secondaryButton}
                  onClick={() => setShowEditModal(false)}
                >
                  {t('common.cancel')}
                </button>
                <button 
                  className={styles.primaryButton}
                  onClick={() => setShowEditModal(false)}
                >
                  <Check size={16} />
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
});
