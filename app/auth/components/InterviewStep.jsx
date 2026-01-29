'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { useLocale } from '@/app/context/locale-context';
import styles from '../auth.module.css';

export function InterviewStep({ translations, onComplete, initialData = {}, onAnswerSaved }) {
  const { t } = useLocale();
  
  const questions = [
    {
      id: 'welcome',
      question: t('interviewWizard.questions.welcome'),
      field: 'websiteUrl',
    },
    {
      id: 'businessType',
      question: t('interviewWizard.questions.businessType'),
      field: 'businessType',
    },
    {
      id: 'primaryProducts',
      question: t('interviewWizard.questions.primaryProducts'),
      field: 'primaryProducts',
    },
    {
      id: 'targetAudience',
      question: t('interviewWizard.questions.targetAudience'),
      field: 'targetAudience',
    },
    {
      id: 'mainKeywords',
      question: t('interviewWizard.questions.mainKeywords'),
      field: 'mainKeywords',
    },
    {
      id: 'seoGoals',
      question: t('interviewWizard.questions.seoGoals'),
      field: 'seoGoals',
    },
  ];

  const [messages, setMessages] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [interviewData, setInterviewData] = useState(initialData || {});
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Initialize messages from previous data when resuming
  useEffect(() => {
    if (initialized || questions.length === 0) return;
    
    // Find how many questions were previously answered
    let answeredCount = 0;
    for (const q of questions) {
      if (initialData && initialData[q.field]) {
        answeredCount++;
      } else {
        break; // Stop at first unanswered
      }
    }

    // Rebuild conversation history from saved data
    const restoredMessages = [];
    let messageId = 0;

    for (let i = 0; i < answeredCount; i++) {
      // Add agent question
      restoredMessages.push({
        id: messageId++,
        type: 'agent',
        content: questions[i].question,
        timestamp: new Date()
      });
      // Add user answer
      restoredMessages.push({
        id: messageId++,
        type: 'user',
        content: initialData[questions[i].field],
        timestamp: new Date()
      });
    }

    // Check if all questions were answered
    if (answeredCount >= questions.length) {
      // Interview was complete, add completion message
      restoredMessages.push({
        id: messageId++,
        type: 'agent',
        content: t('interviewWizard.questions.complete'),
        timestamp: new Date()
      });
      setMessages(restoredMessages);
      setCurrentQuestionIndex(questions.length - 1);
      setIsComplete(true);
      // Auto-continue
      setTimeout(() => {
        onComplete(initialData);
      }, 1500);
    } else {
      // Add the next question
      restoredMessages.push({
        id: messageId++,
        type: 'agent',
        content: questions[answeredCount].question,
        timestamp: new Date()
      });
      setMessages(restoredMessages);
      setCurrentQuestionIndex(answeredCount);
    }

    setInitialized(true);
  }, [initialized, questions, initialData, t, onComplete]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!isTyping) {
      inputRef.current?.focus();
    }
  }, [currentQuestionIndex, isTyping]);

  const handleSubmit = async () => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue || isTyping) return;

    const currentQuestion = questions[currentQuestionIndex];

    // Add user message
    const userMessage = {
      id: messages.length,
      type: 'user',
      content: trimmedValue,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    // Save data
    const newData = {
      ...interviewData,
      [currentQuestion.field]: trimmedValue
    };
    setInterviewData(newData);

    setInputValue('');
    setIsTyping(true);

    const nextIndex = currentQuestionIndex + 1;
    const isLastQuestion = nextIndex >= questions.length;

    // Save answer to server immediately
    if (onAnswerSaved) {
      try {
        await onAnswerSaved(newData, isLastQuestion);
      } catch (err) {
        console.error('Failed to save interview answer:', err);
        // Continue anyway - we have the data locally
      }
    }

    setTimeout(() => {
      if (!isLastQuestion) {
        const nextQuestion = questions[nextIndex];
        const agentMessage = {
          id: messages.length + 1,
          type: 'agent',
          content: nextQuestion.question,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, agentMessage]);
        setCurrentQuestionIndex(nextIndex);
        setIsTyping(false);
      } else {
        // Interview complete
        const completeMessage = {
          id: messages.length + 1,
          type: 'agent',
          content: t('interviewWizard.questions.complete'),
          timestamp: new Date()
        };
        setMessages(prev => [...prev, completeMessage]);
        setIsTyping(false);
        setIsComplete(true);
        
        // Auto-continue after delay
        setTimeout(() => {
          onComplete(newData);
        }, 2500);
      }
    }, 800 + Math.random() * 600);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const progressPercentage = ((currentQuestionIndex + 1) / questions.length) * 100;

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
            <span>{t('interviewWizard.questionProgress', { 
              current: Math.min(currentQuestionIndex + 1, questions.length), 
              total: questions.length 
            })}</span>
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
          {isComplete && (
            <div className={styles.interviewComplete}>
              <CheckCircle2 size={32} className={styles.completeIcon} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        {!isComplete && (
          <div className={styles.interviewInputArea}>
            <div className={styles.interviewInputWrapper}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isTyping}
                placeholder={t('interviewWizard.inputPlaceholder')}
                className={styles.interviewInput}
              />
              <button
                onClick={handleSubmit}
                disabled={!inputValue.trim() || isTyping}
                className={styles.interviewSendBtn}
              >
                {isTyping ? (
                  <Loader2 size={18} className={styles.spinIcon} />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
