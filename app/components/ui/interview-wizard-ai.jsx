'use client';

import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Send, 
  Loader2, 
  Bot, 
  User, 
  CheckCircle2, 
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Upload,
  Check,
} from 'lucide-react';
import Image from 'next/image';
import { useLocale } from '@/app/context/locale-context';
import styles from './interview-wizard-ai.module.css';

// Question type renderers
const QuestionRenderers = {
  GREETING: ({ question, onSubmit, t }) => (
    <div className={styles.greetingContainer}>
      <p className={styles.greetingText}>
        {t(question.translationKey) || 'Welcome! Let\'s get started.'}
      </p>
      <button 
        className={styles.primaryButton}
        onClick={() => onSubmit('started')}
      >
        {t('interview.buttons.getStarted') || 'Get Started'}
        <ChevronRight size={18} />
      </button>
    </div>
  ),

  INPUT: ({ question, value, onChange, onSubmit, isSubmitting, t }) => {
    const config = question.inputConfig || {};
    const inputType = config.inputType || 'text';
    
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && inputType !== 'textarea') {
        e.preventDefault();
        if (value.trim()) onSubmit(value);
      }
    };

    return (
      <div className={styles.inputContainer}>
        {inputType === 'textarea' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={config.placeholder || t('interview.placeholders.typeAnswer')}
            className={styles.textareaInput}
            rows={4}
            maxLength={config.maxLength}
            disabled={isSubmitting}
          />
        ) : (
          <input
            type={inputType}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={config.placeholder || t('interview.placeholders.typeAnswer')}
            className={styles.textInput}
            maxLength={config.maxLength}
            disabled={isSubmitting}
          />
        )}
        <button 
          className={styles.sendButton}
          onClick={() => value.trim() && onSubmit(value)}
          disabled={!value.trim() || isSubmitting}
        >
          {isSubmitting ? <Loader2 size={20} className={styles.spinning} /> : <Send size={20} />}
        </button>
      </div>
    );
  },

  CONFIRMATION: ({ question, onSubmit, isSubmitting, t }) => {
    const config = question.inputConfig || {};
    return (
      <div className={styles.confirmationContainer}>
        <button
          className={styles.confirmButton}
          onClick={() => onSubmit(true)}
          disabled={isSubmitting}
        >
          <Check size={18} />
          {config.confirmLabel || t('interview.buttons.yes') || 'Yes'}
        </button>
        <button
          className={styles.denyButton}
          onClick={() => onSubmit(false)}
          disabled={isSubmitting}
        >
          <X size={18} />
          {config.denyLabel || t('interview.buttons.no') || 'No'}
        </button>
      </div>
    );
  },

  SELECTION: ({ question, onSubmit, isSubmitting, t }) => {
    const config = question.inputConfig || {};
    const options = config.options || [];
    
    return (
      <div className={styles.selectionContainer}>
        {options.map((option, index) => (
          <button
            key={index}
            className={styles.selectionOption}
            onClick={() => onSubmit(option)}
            disabled={isSubmitting}
          >
            {t(`interview.options.${option}`) || option}
          </button>
        ))}
      </div>
    );
  },

  MULTI_SELECTION: ({ question, value, onChange, onSubmit, isSubmitting, t }) => {
    const config = question.inputConfig || {};
    const options = config.options || [];
    const selected = Array.isArray(value) ? value : [];
    const minSelect = config.minSelect || 1;
    
    const toggleOption = (option) => {
      if (selected.includes(option)) {
        onChange(selected.filter(o => o !== option));
      } else {
        if (!config.maxSelect || selected.length < config.maxSelect) {
          onChange([...selected, option]);
        }
      }
    };

    return (
      <div className={styles.multiSelectionContainer}>
        <div className={styles.optionsGrid}>
          {options.map((option, index) => (
            <button
              key={index}
              className={`${styles.multiOption} ${selected.includes(option) ? styles.selected : ''}`}
              onClick={() => toggleOption(option)}
              disabled={isSubmitting}
            >
              {selected.includes(option) && <Check size={16} />}
              {t(`interview.options.${option}`) || option}
            </button>
          ))}
        </div>
        <button
          className={styles.primaryButton}
          onClick={() => onSubmit(selected)}
          disabled={selected.length < minSelect || isSubmitting}
        >
          {t('interview.buttons.continue') || 'Continue'}
          <ChevronRight size={18} />
        </button>
      </div>
    );
  },

  SLIDER: ({ question, value, onChange, onSubmit, isSubmitting, t }) => {
    const config = question.inputConfig || {};
    const min = config.min ?? 0;
    const max = config.max ?? 100;
    const step = config.step ?? 1;
    const currentValue = value ?? Math.round((min + max) / 2);

    return (
      <div className={styles.sliderContainer}>
        <div className={styles.sliderValue}>{currentValue}</div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className={styles.slider}
          disabled={isSubmitting}
        />
        <div className={styles.sliderLabels}>
          <span>{min}</span>
          <span>{max}</span>
        </div>
        <button
          className={styles.primaryButton}
          onClick={() => onSubmit(currentValue)}
          disabled={isSubmitting}
        >
          {t('interview.buttons.continue') || 'Continue'}
          <ChevronRight size={18} />
        </button>
      </div>
    );
  },

  FILE_UPLOAD: ({ question, onSubmit, isSubmitting, t }) => {
    const config = question.inputConfig || {};
    const [files, setFiles] = useState([]);
    
    const handleFileChange = (e) => {
      const newFiles = Array.from(e.target.files);
      setFiles(config.multiple ? [...files, ...newFiles] : newFiles);
    };

    return (
      <div className={styles.fileUploadContainer}>
        <label className={styles.fileUploadLabel}>
          <Upload size={24} />
          <span>{t('interview.buttons.chooseFile') || 'Choose file'}</span>
          <input
            type="file"
            accept={config.accept || '*/*'}
            multiple={config.multiple}
            onChange={handleFileChange}
            className={styles.fileInput}
            disabled={isSubmitting}
          />
        </label>
        {files.length > 0 && (
          <div className={styles.fileList}>
            {files.map((file, i) => (
              <div key={i} className={styles.fileItem}>
                {file.name}
              </div>
            ))}
          </div>
        )}
        <button
          className={styles.primaryButton}
          onClick={() => onSubmit(files)}
          disabled={files.length === 0 || isSubmitting}
        >
          {t('interview.buttons.upload') || 'Upload'}
        </button>
      </div>
    );
  },

  DYNAMIC: ({ question, value, onChange, onSubmit, isSubmitting, dynamicData, t }) => {
    // Dynamic questions are rendered based on data from bot actions
    if (!dynamicData) {
      return (
        <div className={styles.loadingContainer}>
          <Loader2 size={24} className={styles.spinning} />
          <span>{t('interview.loading') || 'Loading...'}</span>
        </div>
      );
    }

    // Render based on what the dynamic data contains
    if (Array.isArray(dynamicData)) {
      return (
        <div className={styles.selectionContainer}>
          {dynamicData.map((item, index) => (
            <button
              key={index}
              className={styles.selectionOption}
              onClick={() => onSubmit(item)}
              disabled={isSubmitting}
            >
              {typeof item === 'object' ? item.label || item.name || JSON.stringify(item) : item}
            </button>
          ))}
        </div>
      );
    }

    return (
      <div className={styles.inputContainer}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={styles.textInput}
          disabled={isSubmitting}
        />
        <button 
          className={styles.sendButton}
          onClick={() => value && onSubmit(value)}
          disabled={!value || isSubmitting}
        >
          <Send size={20} />
        </button>
      </div>
    );
  },

  EDITABLE_DATA: ({ question, value, onChange, onSubmit, isSubmitting, t }) => {
    const config = question.inputConfig || {};
    const fields = config.fields || [];
    const data = value || {};

    const updateField = (key, val) => {
      onChange({ ...data, [key]: val });
    };

    return (
      <div className={styles.editableDataContainer}>
        {fields.map((field) => (
          <div key={field.key} className={styles.editableField}>
            <label>{field.label}</label>
            <input
              type={field.type || 'text'}
              value={data[field.key] || ''}
              onChange={(e) => updateField(field.key, e.target.value)}
              className={styles.textInput}
              disabled={isSubmitting}
            />
          </div>
        ))}
        <button
          className={styles.primaryButton}
          onClick={() => onSubmit(data)}
          disabled={isSubmitting}
        >
          {t('interview.buttons.confirm') || 'Confirm'}
          <Check size={18} />
        </button>
      </div>
    );
  },

  AI_SUGGESTION: ({ question, value, onChange, onSubmit, isSubmitting, suggestions, t }) => {
    const config = question.inputConfig || {};
    
    return (
      <div className={styles.aiSuggestionContainer}>
        {suggestions && suggestions.length > 0 && (
          <div className={styles.suggestionsGrid}>
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                className={styles.suggestionChip}
                onClick={() => onChange(suggestion)}
                disabled={isSubmitting}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {config.allowCustom !== false && (
          <div className={styles.inputContainer}>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t('interview.placeholders.orTypeCustom') || 'Or type your own...'}
              className={styles.textInput}
              disabled={isSubmitting}
            />
            <button 
              className={styles.sendButton}
              onClick={() => value && onSubmit(value)}
              disabled={!value || isSubmitting}
            >
              <Send size={20} />
            </button>
          </div>
        )}
      </div>
    );
  },
};

// Default renderer for unknown types
const DefaultRenderer = ({ question, value, onChange, onSubmit, isSubmitting, t }) => (
  <div className={styles.inputContainer}>
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('interview.placeholders.typeAnswer') || 'Type your answer...'}
      className={styles.textInput}
      disabled={isSubmitting}
    />
    <button 
      className={styles.sendButton}
      onClick={() => value && onSubmit(value)}
      disabled={!value || isSubmitting}
    >
      <Send size={20} />
    </button>
  </div>
);

export const InterviewWizardAI = forwardRef(function InterviewWizardAI({ onClose, onComplete }, ref) {
  const { t } = useLocale();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [interview, setInterview] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [chatMode, setChatMode] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [dynamicData, setDynamicData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Close handler
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
    }, 300);
  }, [onClose]);

  useImperativeHandle(ref, () => ({
    close: handleClose
  }));

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load interview data
  useEffect(() => {
    loadInterview();
  }, []);

  const loadInterview = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/interview');
      if (!response.ok) throw new Error('Failed to load interview');
      
      const data = await response.json();
      setInterview(data.interview);
      setQuestions(data.questions);
      setCurrentQuestion(data.currentQuestion);
      
      // Convert existing messages
      const formattedMessages = data.messages.map(m => ({
        id: m.id,
        type: m.role === 'USER' ? 'user' : 'agent',
        content: m.content,
        timestamp: new Date(m.createdAt),
      }));
      setMessages(formattedMessages);
      
      // If no messages yet, add the first question
      if (formattedMessages.length === 0 && data.currentQuestion) {
        const questionText = t(data.currentQuestion.translationKey) || 'Let\'s get started!';
        setMessages([{
          id: 'initial',
          type: 'agent',
          content: questionText,
          timestamp: new Date(),
        }]);
      }
      
      // Execute auto-actions if any
      if (data.currentQuestion?.autoActions?.length > 0) {
        executeAutoActions(data.currentQuestion.autoActions);
      }
      
      setIsComplete(data.interview.status === 'COMPLETED');
    } catch (err) {
      console.error('Error loading interview:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Execute auto-actions for a question
  const executeAutoActions = async (actionNames) => {
    for (const actionName of actionNames) {
      try {
        await fetch('/api/interview/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionName }),
        });
      } catch (err) {
        console.error(`Error executing auto-action ${actionName}:`, err);
      }
    }
  };

  // Submit answer to current question
  const handleSubmitAnswer = async (answer) => {
    if (!currentQuestion || isSubmitting) return;
    
    setIsSubmitting(true);
    
    // Add user message
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'user',
      content: typeof answer === 'object' ? JSON.stringify(answer) : String(answer),
      timestamp: new Date(),
    }]);
    
    setInputValue('');
    
    try {
      const response = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          response: answer,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit answer');
      }
      
      const data = await response.json();
      
      if (data.isComplete) {
        setIsComplete(true);
        setMessages(prev => [...prev, {
          id: 'complete',
          type: 'agent',
          content: t('interview.complete') || 'Thank you! Your interview is complete.',
          timestamp: new Date(),
        }]);
        onComplete?.(data.interview.responses);
      } else if (data.nextQuestion) {
        setCurrentQuestion(data.nextQuestion);
        setInterview(data.interview);
        
        // Add next question message
        const questionText = t(data.nextQuestion.translationKey) || 'Next question...';
        setMessages(prev => [...prev, {
          id: `q-${data.nextQuestion.id}`,
          type: 'agent',
          content: questionText,
          timestamp: new Date(),
        }]);
        
        // Execute auto-actions
        if (data.nextQuestion.autoActions?.length > 0) {
          executeAutoActions(data.nextQuestion.autoActions);
        }
      }
    } catch (err) {
      console.error('Error submitting answer:', err);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        type: 'agent',
        content: err.message || t('interview.error') || 'Something went wrong. Please try again.',
        isError: true,
        timestamp: new Date(),
      }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Send chat message to AI
  const handleSendChat = async () => {
    if (!chatInput.trim() || isSubmitting) return;
    
    const message = chatInput;
    setChatInput('');
    setIsSubmitting(true);
    
    // Add user message
    setMessages(prev => [...prev, {
      id: `chat-user-${Date.now()}`,
      type: 'user',
      content: message,
      timestamp: new Date(),
    }]);
    
    try {
      const response = await fetch('/api/interview/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          questionId: currentQuestion?.id,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to send message');
      
      const data = await response.json();
      
      // Add AI response
      setMessages(prev => [...prev, {
        id: data.message.id,
        type: 'agent',
        content: data.message.content,
        timestamp: new Date(data.message.createdAt),
      }]);
      
      // If action was executed and returned data, update dynamic data
      if (data.actionResult) {
        setDynamicData(data.actionResult);
      }
    } catch (err) {
      console.error('Error in chat:', err);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        type: 'agent',
        content: t('interview.chatError') || 'I couldn\'t process that. Please try again.',
        isError: true,
        timestamp: new Date(),
      }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get renderer for current question type
  const getRenderer = () => {
    if (!currentQuestion) return null;
    const Renderer = QuestionRenderers[currentQuestion.questionType] || DefaultRenderer;
    return (
      <Renderer
        question={currentQuestion}
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmitAnswer}
        isSubmitting={isSubmitting}
        dynamicData={dynamicData}
        suggestions={suggestions}
        t={t}
      />
    );
  };

  // Calculate progress
  const progress = questions.length > 0 && interview
    ? Math.round(((interview.currentQuestionIndex || 0) / questions.length) * 100)
    : 0;

  if (isLoading) {
    return (
      <div className={`${styles.overlay} ${isClosing ? styles.closing : ''}`}>
        <div className={styles.wizard}>
          <div className={styles.loadingContainer}>
            <Loader2 size={40} className={styles.spinning} />
            <p>{t('interview.loading') || 'Loading interview...'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.overlay} ${isClosing ? styles.closing : ''}`}>
        <div className={styles.wizard}>
          <div className={styles.errorContainer}>
            <AlertCircle size={40} />
            <p>{error}</p>
            <button onClick={loadInterview} className={styles.retryButton}>
              <RefreshCw size={18} />
              {t('interview.retry') || 'Retry'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return createPortal(
    <div className={`${styles.overlay} ${isClosing ? styles.closing : ''}`}>
      <div className={styles.wizard}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.agentAvatar}>
              <Image
                src="/ghost-avatar.svg"
                alt="Ghost"
                width={40}
                height={40}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
            <div className={styles.headerInfo}>
              <h2 className={styles.headerTitle}>{t('interview.title') || 'Site Interview'}</h2>
              <span className={styles.headerProgress}>
                {isComplete 
                  ? (t('interview.completed') || 'Completed')
                  : `${progress}% ${t('interview.complete') || 'complete'}`
                }
              </span>
            </div>
          </div>
          <button className={styles.closeButton} onClick={handleClose}>
            <X size={24} />
          </button>
        </div>

        {/* Progress bar */}
        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill} 
            style={{ width: `${isComplete ? 100 : progress}%` }}
          />
        </div>

        {/* Messages */}
        <div className={styles.messagesContainer}>
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`${styles.message} ${styles[msg.type]} ${msg.isError ? styles.error : ''}`}
            >
              {msg.type === 'agent' && (
                <div className={styles.messageAvatar}>
                  <Bot size={20} />
                </div>
              )}
              <div className={styles.messageContent}>
                {msg.content}
              </div>
              {msg.type === 'user' && (
                <div className={styles.messageAvatar}>
                  <User size={20} />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        {!isComplete && (
          <div className={styles.inputArea}>
            {/* Question-specific input or chat toggle */}
            <div className={styles.modeToggle}>
              <button 
                className={`${styles.modeButton} ${!chatMode ? styles.active : ''}`}
                onClick={() => setChatMode(false)}
              >
                {t('interview.modes.answer') || 'Answer'}
              </button>
              <button 
                className={`${styles.modeButton} ${chatMode ? styles.active : ''}`}
                onClick={() => setChatMode(true)}
              >
                <Bot size={16} />
                {t('interview.modes.askAI') || 'Ask AI'}
              </button>
            </div>

            {chatMode ? (
              <div className={styles.chatInputContainer}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder={t('interview.placeholders.askQuestion') || 'Ask me anything...'}
                  className={styles.chatInput}
                  disabled={isSubmitting}
                />
                <button 
                  className={styles.sendButton}
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || isSubmitting}
                >
                  {isSubmitting ? <Loader2 size={20} className={styles.spinning} /> : <Send size={20} />}
                </button>
              </div>
            ) : (
              getRenderer()
            )}
          </div>
        )}

        {/* Complete state */}
        {isComplete && (
          <div className={styles.completeContainer}>
            <CheckCircle2 size={48} className={styles.completeIcon} />
            <h3>{t('interview.allDone') || 'All done!'}</h3>
            <p>{t('interview.thankYou') || 'Thank you for completing the interview.'}</p>
            <button className={styles.primaryButton} onClick={handleClose}>
              {t('interview.buttons.close') || 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
});
