'use client';

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { X, Send, CheckCircle2, Loader2, ChevronDown, Edit2, Check, RotateCcw } from 'lucide-react';
import Image from 'next/image';
import { useLocale } from '@/app/context/locale-context';
import styles from './interview-wizard.module.css';

export const InterviewWizard = forwardRef(function InterviewWizard({ onClose, onComplete }, ref) {
  const { t, dictionary, isLoading: isDictionaryLoading } = useLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [interviewId, setInterviewId] = useState(null);
  const [responses, setResponses] = useState({});
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
  // Edit modal state for EDITABLE_DATA
  const [showEditModal, setShowEditModal] = useState(false);
  // Searchable select filter state
  const [searchFilter, setSearchFilter] = useState('');
  // Edit message state
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messageIdCounter = useRef(0);

  // Fetch interview data on mount
  useEffect(() => {
    fetchInterview();
  }, []);

  // Check if dictionary is ready (loaded and not empty)
  const isDictionaryReady = !isDictionaryLoading && dictionary && Object.keys(dictionary).length > 0;

  // Initialize messages when dictionary is loaded
  useEffect(() => {
    if (isDictionaryReady && questionsData?.length > 0 && messages.length === 0) {
      const firstQuestion = questionsData[0];
      const questionText = t(firstQuestion.translationKey);
      const messageId = messageIdCounter.current++;
      setMessages([{
        id: `msg-${messageId}`,
        type: 'agent',
        content: questionText,
        questionType: firstQuestion.questionType,
        inputConfig: firstQuestion.inputConfig,
        questionId: firstQuestion.id,
        timestamp: new Date()
      }]);
    }
  }, [isDictionaryReady, questionsData, messages.length, t]);

  const fetchInterview = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/interview');
      if (!res.ok) {
        if (res.status === 401) {
          setError('Please log in to continue');
          return;
        }
        throw new Error('Failed to fetch interview');
      }
      const data = await res.json();
      
      setQuestions(data.questions || []);
      setQuestionsData(data.questions || []);
      setInterviewId(data.interview?.id);
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
      const defaultValue = crawledData[config.defaultFromCrawl];
      
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
      // Check if we already have keywords in externalData
      if (externalData?.keywordSuggestions && externalData.keywordSuggestions.length > 0) {
        setAiSuggestions(externalData.keywordSuggestions);
        // Pre-select primary keywords
        const preSelected = externalData.keywordSuggestions
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
            const keywords = result.externalData?.keywordSuggestions || result.result?.keywords || [];
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

  // Trigger platform detection for websitePlatform question
  useEffect(() => {
    if (!questionsData || currentQuestionIndex === undefined) return;
    
    const currentQuestion = questionsData[currentQuestionIndex];
    if (!currentQuestion) return;
    
    // Only for the websitePlatform question
    if (currentQuestion.saveToField !== 'websitePlatform') return;
    
    // Check if we already have platform data in externalData
    if (externalData?.platformData?.platform) {
      setDetectedPlatform(externalData.platformData);
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
  }, [currentQuestionIndex, questionsData]);

  // Trigger article fetching for DYNAMIC questions with crawledArticles source
  useEffect(() => {
    if (!questionsData || currentQuestionIndex === undefined) return;
    
    const currentQuestion = questionsData[currentQuestionIndex];
    if (!currentQuestion) return;
    
    // Only for DYNAMIC questions with crawledArticles source
    const config = currentQuestion.inputConfig || {};
    if (currentQuestion.questionType !== 'DYNAMIC' || config.optionsSource !== 'crawledArticles') return;
    
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
        }
      } catch (err) {
        console.error('[InterviewWizard] Error running auto action:', err);
      } finally {
        setIsAutoActionRunning(false);
        autoActionInProgress.current = false;
      }
    };
    
    runAutoAction();
  }, [currentQuestionIndex, questionsData]);

  // Handle competitor finding for AI_SUGGESTION questions with findCompetitors source
  const competitorSearchInProgress = useRef(false);
  
  useEffect(() => {
    if (!questionsData || currentQuestionIndex === undefined) return;
    
    const currentQuestion = questionsData[currentQuestionIndex];
    if (!currentQuestion) return;
    
    // Only for AI_SUGGESTION questions with findCompetitors source
    if (currentQuestion.questionType !== 'AI_SUGGESTION') return;
    
    const config = currentQuestion.inputConfig || {};
    if (config.suggestionsSource !== 'findCompetitors') return;
    
    // Get selected keywords from responses
    const selectedKeywords = responses.keywords || [];
    if (selectedKeywords.length === 0) {
      console.log('[findCompetitors] No keywords selected, skipping');
      return;
    }
    
    // Check if we already have competitor suggestions in externalData
    // Only check once per question visit using the ref
    const cachedCompetitors = externalData?.competitorSuggestions || [];
    if (cachedCompetitors.length > 0) {
      console.log('[findCompetitors] Using cached competitors from externalData:', cachedCompetitors.length);
      setCompetitorSuggestions(cachedCompetitors);
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
        
        if (result.success) {
          const competitors = result.externalData?.competitorSuggestions || [];
          console.log('[findCompetitors] Got competitors from action:', competitors.length);
          if (competitors.length > 0) {
            setCompetitorSuggestions(competitors);
          }
        }
      } catch (err) {
        console.error('Error finding competitors:', err);
      } finally {
        setIsLoadingCompetitors(false);
        competitorSearchInProgress.current = false;
      }
    };
    
    findCompetitors();
  }, [currentQuestionIndex, questionsData]);

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
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, response }),
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
      const res = await fetch('/api/interview');
      if (res.ok) {
        const data = await res.json();
        console.log('[refreshInterviewData] Full response:', data);
        console.log('[refreshInterviewData] externalData:', data.interview?.externalData);
        console.log('[refreshInterviewData] crawledData:', data.interview?.externalData?.crawledData);
        
        setExternalData(data.interview?.externalData || {});
        
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

  // Trigger an AI action and get suggestions
  const triggerAiAction = async (actionName, params) => {
    try {
      setIsLoadingAiSuggestions(true);
      const res = await fetch('/api/interview/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          actionName, 
          parameters: params,
        }),
      });
      
      if (!res.ok) {
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
      return { success: false, error: err.message };
    } finally {
      setIsLoadingAiSuggestions(false);
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
    
    // Submit the combined response
    const result = await submitResponse(currentQuestion.id, finalResponse);
    
    if (result.success) {
      // Reset AI suggestions state
      setAiSuggestions(null);
      setSelectedSuggestions([]);
      setAiSuggestionsPhase('input');
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

    // For INPUT type with URL, show processing message
    const isUrlInput = currentQuestion.inputConfig?.inputType === 'url';
    if (isUrlInput) {
      // Add processing message
      const processingMsgId = messageIdCounter.current++;
      setMessages(prev => [...prev, {
        id: `msg-${processingMsgId}`,
        type: 'agent',
        content: t('interviewWizard.messages.analyzing') || 'Analyzing your website...',
        isProcessing: true,
        timestamp: new Date()
      }]);
    }

    // Add user message (except for EDITABLE_DATA)
    if (currentQuestion.questionType !== 'EDITABLE_DATA') {
      const userMessageId = messageIdCounter.current++;
      // Format array values as comma-separated string for display
      let displayContent = submittedValue;
      if (Array.isArray(submittedValue)) {
        displayContent = submittedValue.join(', ');
      } else if (typeof submittedValue !== 'string') {
        displayContent = String(submittedValue);
      }
      const userMessage = {
        id: `msg-${userMessageId}`,
        type: 'user',
        content: displayContent,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);
    }

    // Save response locally
    setResponses(prev => ({
      ...prev,
      [currentQuestion.id]: submittedValue,
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
      
      moveToNextQuestion();
    } else {
      // Remove processing message on error
      if (isUrlInput) {
        setMessages(prev => prev.filter(m => !m.isProcessing));
      }
      setIsTyping(false);
    }
  };

  const moveToNextQuestion = async () => {
    // Reset dynamic options state when moving to next question
    setDynamicOptions([]);
    setSelectedDynamicOptions([]);
    
    setTimeout(async () => {
      const nextIndex = currentQuestionIndex + 1;
      
      if (nextIndex < questions.length) {
        const nextQuestion = questions[nextIndex];
        const questionText = t(nextQuestion.translationKey);
        
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
                language: crawled.language,
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
          onComplete?.(responses);
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

  // Retry a user message - remove all messages after it and resend the same message
  const handleRetryMessage = async (messageId) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const messageToRetry = messages[messageIndex];
    if (messageToRetry.type !== 'user') return;

    // Find the question index for this message
    // Look at the agent message before this one to determine the question
    let questionIdx = 0;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'agent' && messages[i].questionId) {
        const qIdx = questions.findIndex(q => q.id === messages[i].questionId);
        if (qIdx !== -1) {
          questionIdx = qIdx;
          break;
        }
      }
    }

    // Remove all messages from this one onwards (including the user message)
    setMessages(prev => prev.slice(0, messageIndex));
    setCurrentQuestionIndex(questionIdx);
    setIsTyping(false);
    setIsProcessing(false);

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

    const originalMessage = messages[messageIndex];

    // Find the question index for this message
    let questionIdx = 0;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'agent' && messages[i].questionId) {
        const qIdx = questions.findIndex(q => q.id === messages[i].questionId);
        if (qIdx !== -1) {
          questionIdx = qIdx;
          break;
        }
      }
    }

    // Remove all messages from this one onwards
    setMessages(prev => prev.slice(0, messageIndex));
    setCurrentQuestionIndex(questionIdx);
    setEditingMessageId(null);

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
      handleSubmit(editContent.trim());
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
    const detectedValue = config.defaultFromCrawl ? externalData?.crawledData?.[config.defaultFromCrawl] : null;
    
    // Helper to get language label from code
    const getOptionLabel = (value) => {
      const option = config.options?.find(opt => opt.value === value);
      return option ? t(option.labelKey) : value;
    };
    
    return (
      <div className={styles.inlineSelectionContent}>
        {detectedValue && (
          <div className={styles.detectedValueBanner}>
            <span className={styles.detectedIcon}>🔍</span>
            <span>
              {t('interviewWizard.messages.languageDetected', { 
                language: getOptionLabel(detectedValue)
              }) || `Detected: ${getOptionLabel(detectedValue)}`}
            </span>
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
        // Auto-action question that shows progress while running action
        return (
          <div className={styles.autoActionContainer}>
            <div className={styles.aiLoadingBanner}>
              <Loader2 size={20} className={styles.spinIcon} />
              <span>{t('interviewWizard.messages.fetchingBlogPosts') || 'Fetching your blog posts...'}</span>
            </div>
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
              {isLoadingCompetitors && (
                <div className={styles.aiLoadingBanner}>
                  <Loader2 size={16} className={styles.spinIcon} />
                  <span>{t('interviewWizard.messages.findingCompetitors') || 'Finding competitors based on your keywords...'}</span>
                </div>
              )}
              
              {!isLoadingCompetitors && competitorSuggestions.length > 0 && (
                <>
                  <div className={styles.competitorCardsGrid}>
                    {competitorSuggestions.map((competitor, i) => {
                      const url = typeof competitor === 'string' ? competitor : competitor.url;
                      const name = competitor.name || url;
                      const description = competitor.description || '';
                      const isSelected = selectedCompetitors.includes(url);
                      
                      return (
                        <button
                          key={i}
                          className={`${styles.competitorCard} ${isSelected ? styles.selected : ''}`}
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
                            <span className={styles.competitorName}>{name}</span>
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
                            const normalizedUrl = urlObj.href;
                            if (!selectedCompetitors.includes(normalizedUrl) && selectedCompetitors.length < maxCompetitors) {
                              setSelectedCompetitors(prev => [...prev, normalizedUrl]);
                              // Also add to suggestions so it shows in the grid
                              setCompetitorSuggestions(prev => [...prev, { 
                                url: normalizedUrl, 
                                name: urlObj.hostname.replace('www.', ''),
                                description: t('interviewWizard.messages.manuallyAdded') || 'Manually added',
                                isManual: true
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
              
              {!isLoadingCompetitors && competitorSuggestions.length === 0 && (
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
                            const normalizedUrl = urlObj.href;
                            if (!selectedCompetitors.includes(normalizedUrl) && selectedCompetitors.length < maxCompetitors) {
                              setSelectedCompetitors(prev => [...prev, normalizedUrl]);
                              setCompetitorSuggestions(prev => [...prev, { 
                                url: normalizedUrl, 
                                name: urlObj.hostname.replace('www.', ''),
                                description: t('interviewWizard.messages.manuallyAdded') || 'Manually added',
                                isManual: true
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
              {isLoadingAiSuggestions && (
                <div className={styles.aiLoadingBanner}>
                  <Loader2 size={16} className={styles.spinIcon} />
                  <span>{t('interviewWizard.messages.generatingKeywords') || 'Generating keyword suggestions...'}</span>
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
              
              {!isLoadingAiSuggestions && (!aiSuggestions || aiSuggestions.length === 0) && (
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
            {isLoadingAiRecommendation && (
              <div className={styles.aiLoadingBanner}>
                <Loader2 size={16} className={styles.spinIcon} />
                <span>{t('interviewWizard.messages.analyzingStyle') || 'Analyzing your content style...'}</span>
              </div>
            )}
            
            {aiRecommendation && aiConfidence > 0.3 && (
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
          </div>
        );

      case 'SELECTION':
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
                <span className={styles.aiRecommendationIcon}>🔍</span>
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
                      {isDetected && <span className={styles.recommendedBadge}>🔍</span>}
                      <span>{t(opt.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'MULTI_SELECTION':
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
        const sliderValue = responses[currentQuestion?.id] ?? internalLinksDefault ?? config.defaultValue ?? config.min;
        const isInternalLinksQuestion = currentQuestion.saveToField === 'internalLinksCount';
        
        return (
          <div className={styles.sliderContainer}>
            {isInternalLinksQuestion && internalLinksDefault && (
              <div className={styles.sliderHint}>
                <span className={styles.hintIcon}>💡</span>
                <span>
                  {t('registration.interview.hints.internalLinksRecommendation', { count: internalLinksDefault })
                    || `Based on your posts, we recommend ${internalLinksDefault} internal links per 1000 words. SEO best practice: 2-4 links per 1000 words.`}
                </span>
              </div>
            )}
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
          if (editableData[fieldKey] !== undefined && editableData[fieldKey] !== '') {
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
                onClick={() => handleSubmit(getCurrentValues())}
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
                  {dynamicOptions.map((article, index) => (
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
                    >
                      {article.image && (
                        <div className={styles.articleImage}>
                          <img src={article.image} alt="" />
                        </div>
                      )}
                      <div className={styles.articleContent}>
                        <h4 className={styles.articleTitle}>
                          {article.title || t('interviewWizard.messages.untitledArticle')}
                        </h4>
                        {article.excerpt && (
                          <p className={styles.articleExcerpt}>{article.excerpt}</p>
                        )}
                      </div>
                      {selectedDynamicOptions.includes(article.url) && (
                        <div className={styles.selectedBadge}>
                          <Check size={14} />
                        </div>
                      )}
                    </button>
                  ))}
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
              <div className={styles.noSuggestions}>
                <p>{t('interviewWizard.messages.noArticlesFound')}</p>
                <button 
                  onClick={() => handleSubmit([])}
                  className={styles.skipLink}
                >
                  {t('common.skip')}
                </button>
              </div>
            )}
          </div>
        );

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
    return (
      <div className={styles.overlay}>
        <div className={styles.wizardContainer}>
          <div className={styles.loadingContainer}>
            <Loader2 size={32} className={styles.spinIcon} />
            <p>{isDictionaryReady ? t('common.loading') : 'Loading...'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.overlay}>
        <div className={styles.wizardContainer}>
          <div className={styles.errorContainer}>
            <p>{error}</p>
            <button onClick={handleClose} className={styles.closeButtonText}>
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
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
                <Image src="/ghostpost_logo.png" alt="Ghost" width={20} height={20} className={styles.logo} />
              </div>
              <div className={styles.headerText}>
                <h2 className={styles.headerTitle}>{t('interviewWizard.title')}</h2>
                <p className={styles.headerSubtitle}>
                  {t('interviewWizard.questionProgress', { current: Math.min(currentQuestionIndex + 1, questions.length), total: questions.length })}
                </p>
              </div>
            </div>
            <button onClick={handleClose} className={styles.closeButton}>
              <X size={16} />
            </button>
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
                      <Image src="/ghostpost_logo.png" alt="Ghost" width={16} height={16} className={styles.logo} />
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
                        {message.dataCard && (
                          <div className={styles.messageDataCard}>
                            {message.dataCard.businessName && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('registration.interview.fields.businessName')}</span>
                                <span className={styles.dataCardValue}>{message.dataCard.businessName}</span>
                              </div>
                            )}
                            {message.dataCard.description && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('registration.interview.fields.about')}</span>
                                <span className={styles.dataCardValue}>{message.dataCard.description}</span>
                              </div>
                            )}
                            {message.dataCard.email && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('registration.interview.fields.email')}</span>
                                <span className={styles.dataCardValue}>{message.dataCard.email}</span>
                              </div>
                            )}
                            {message.dataCard.phone && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('registration.interview.fields.phone')}</span>
                                <span className={styles.dataCardValue}>{message.dataCard.phone}</span>
                              </div>
                            )}
                            {message.dataCard.category && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('registration.interview.fields.category')}</span>
                                <span className={styles.dataCardValue}>{message.dataCard.category}</span>
                              </div>
                            )}
                            {message.dataCard.seoScore !== undefined && (
                              <div className={styles.dataCardItem}>
                                <span className={styles.dataCardLabel}>{t('interviewWizard.seoScore') || 'SEO Score'}</span>
                                <span className={`${styles.dataCardValue} ${
                                  message.dataCard.seoScore >= 70 ? styles.seoGood : 
                                  message.dataCard.seoScore >= 40 ? styles.seoWarning : styles.seoBad
                                }`}>
                                  {message.dataCard.seoScore}/100
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        
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
                    <Image src="/ghostpost_logo.png" alt="Ghost" width={16} height={16} className={styles.logo} />
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
    </div>
  );
});
