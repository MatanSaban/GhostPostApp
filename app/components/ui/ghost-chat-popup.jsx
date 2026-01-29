'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { 
  Send, X, Plus, Paperclip, Mic, Image as ImageIcon, 
  Check, Search, Trash2, Edit2, Sparkles, Zap, 
  FileText, BarChart, Clock, ChevronDown 
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './ghost-chat-popup.module.css';

export const GhostChatPopup = forwardRef(function GhostChatPopup({ isOpen, onClose, context = 'Dashboard' }, ref) {
  const { t, isRtl } = useLocale();
  const [panelWidth, setPanelWidth] = useState(1200);
  const [isResizing, setIsResizing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef(null);
  // Left sidebar (280) + Right sidebar (320) + Chat area minimum (400) = 1000px
  const minWidth = 1000;
  const maxWidth = typeof window !== 'undefined' ? window.innerWidth - 50 : 1600;

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300); // Match animation duration
  }, [onClose]);

  // Expose handleClose to parent via ref
  useImperativeHandle(ref, () => ({
    close: handleClose
  }), [handleClose]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return;
    
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      setPanelWidth(newWidth);
    }
  }, [isResizing, maxWidth]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const getContextualMessage = () => {
    switch (context) {
      case 'Dashboard':
        return t('chat.contextMessages.dashboard');
      case 'Site Interview':
        return t('chat.contextMessages.siteInterview');
      case 'Content Planner':
        return t('chat.contextMessages.contentPlanner');
      case 'Automations':
        return t('chat.contextMessages.automations');
      case 'Link Building':
        return t('chat.contextMessages.linkBuilding');
      case 'Redirections':
        return t('chat.contextMessages.redirections');
      case 'SEO Frontend':
        return t('chat.contextMessages.seoFrontend');
      case 'SEO Backend':
        return t('chat.contextMessages.seoBackend');
      case 'Site Audit':
        return t('chat.contextMessages.siteAudit');
      case 'Keyword Strategy':
        return t('chat.contextMessages.keywordStrategy');
      case 'Settings':
        return t('chat.contextMessages.settings');
      default:
        return t('chat.contextMessages.default');
    }
  };

  const getCurrentTime = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  const [messages, setMessages] = useState([
    {
      type: 'agent',
      text: getContextualMessage(),
      timestamp: getCurrentTime(),
      actions: [t('chat.actions.startAnalysis'), t('common.cancel')]
    }
  ]);
  const [input, setInput] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [selectedTextEngine, setSelectedTextEngine] = useState('gpt-4');
  const [selectedTextModel, setSelectedTextModel] = useState('gpt-4-turbo');
  const [selectedImageEngine, setSelectedImageEngine] = useState('dall-e');
  const [selectedImageModel, setSelectedImageModel] = useState('dall-e-3');
  const [isTextEngineOpen, setIsTextEngineOpen] = useState(false);
  const [isTextModelOpen, setIsTextModelOpen] = useState(false);
  const [isImageEngineOpen, setIsImageEngineOpen] = useState(false);
  const [isImageModelOpen, setIsImageModelOpen] = useState(false);
  const [activeChat, setActiveChat] = useState('1');

  const [chats] = useState([
    {
      id: '1',
      title: t('chat.sampleChats.seoStrategy.title'),
      preview: t('chat.sampleChats.seoStrategy.preview'),
      timestamp: t('chat.timestamps.twoMinAgo'),
    },
    {
      id: '2',
      title: t('chat.sampleChats.contentCalendar.title'),
      preview: t('chat.sampleChats.contentCalendar.preview'),
      timestamp: t('chat.timestamps.oneHourAgo'),
    },
    {
      id: '3',
      title: t('chat.sampleChats.keywordResearch.title'),
      preview: t('chat.sampleChats.keywordResearch.preview'),
      timestamp: t('chat.timestamps.threeHoursAgo'),
    },
    {
      id: '4',
      title: t('chat.sampleChats.linkBuilding.title'),
      preview: t('chat.sampleChats.linkBuilding.preview'),
      timestamp: t('chat.timestamps.yesterday'),
    },
    {
      id: '5',
      title: t('chat.sampleChats.technicalSeo.title'),
      preview: t('chat.sampleChats.technicalSeo.preview'),
      timestamp: t('chat.timestamps.yesterday'),
    }
  ]);

  const textEngines = [
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'claude', name: 'Claude' },
    { id: 'gemini', name: 'Gemini' },
    { id: 'llama', name: 'Llama' }
  ];

  const textModels = {
    'gpt-4': ['gpt-4-turbo', 'gpt-4', 'gpt-4-32k'],
    'claude': ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
    'gemini': ['gemini-pro', 'gemini-ultra'],
    'llama': ['llama-2-70b', 'llama-2-13b', 'llama-2-7b']
  };

  const imageEngines = [
    { id: 'dall-e', name: 'DALL-E' },
    { id: 'midjourney', name: 'Midjourney' },
    { id: 'stable-diffusion', name: 'Stable Diffusion' }
  ];

  const imageModels = {
    'dall-e': ['dall-e-3', 'dall-e-2'],
    'midjourney': ['v6', 'v5.2', 'v5.1'],
    'stable-diffusion': ['SDXL 1.0', 'SD 2.1', 'SD 1.5']
  };

  const quickActions = [
    { icon: Sparkles, label: t('chat.quickActions.generateContent'), key: 'generateContent', color: 'purple' },
    { icon: Zap, label: t('chat.quickActions.quickSeoAudit'), key: 'quickSeoAudit', color: 'blue' },
    { icon: FileText, label: t('chat.quickActions.createBrief'), key: 'createBrief', color: 'green' },
    { icon: BarChart, label: t('chat.quickActions.analyticsReport'), key: 'analyticsReport', color: 'orange' }
  ];

  const handleSend = () => {
    if (!input.trim()) return;
    
    const newMessage = {
      type: 'user',
      text: input,
      timestamp: getCurrentTime()
    };
    
    setMessages([...messages, newMessage]);
    setInput('');
    
    // Simulate AI response
    setTimeout(() => {
      setMessages(prev => [...prev, {
        type: 'agent',
        text: t('chat.aiResponses.processing'),
        timestamp: getCurrentTime()
      }]);
    }, 500);
  };

  const handleAction = (action) => {
    const newMessages = [
      {
        type: 'user',
        text: action,
        timestamp: getCurrentTime()
      }
    ];

    if (action === t('chat.actions.startAnalysis')) {
      newMessages.push({
        type: 'success',
        text: t('chat.successMessages.analysisStarted'),
        timestamp: getCurrentTime()
      });
    }

    setMessages([...messages, ...newMessages]);
  };

  const handleQuickAction = (actionKey, label) => {
    setMessages(prev => [...prev, {
      type: 'user',
      text: label,
      timestamp: getCurrentTime()
    }]);

    setTimeout(() => {
      let response = '';
      switch (actionKey) {
        case 'generateContent':
          response = t('chat.quickActionResponses.generateContent');
          break;
        case 'quickSeoAudit':
          response = t('chat.quickActionResponses.quickSeoAudit');
          break;
        case 'createBrief':
          response = t('chat.quickActionResponses.createBrief');
          break;
        case 'analyticsReport':
          response = t('chat.quickActionResponses.analyticsReport');
          break;
        default:
          response = t('chat.quickActionResponses.default');
      }
      
      setMessages(prev => [...prev, {
        type: 'agent',
        text: response,
        timestamp: getCurrentTime()
      }]);
    }, 500);
  };

  if (!isOpen && !isClosing) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`${styles.backdrop} ${isClosing ? styles.backdropClosing : ''}`} 
        onClick={handleClose} 
      />

      {/* Chat Panel */}
      <div 
        ref={panelRef}
        className={`${styles.chatPanel} ${isClosing ? styles.chatPanelClosing : ''}`}
        style={{ width: `${panelWidth}px` }}
      >
        {/* Resize Handle */}
        <div 
          className={styles.resizeHandle}
          onMouseDown={handleMouseDown}
        >
          <div className={styles.resizeHandleLine}></div>
        </div>

        {/* Left Sidebar - Chat List */}
        <div className={styles.leftSidebar}>
          {/* Chat List Header */}
          <div className={styles.chatListHeader}>
            <div className={styles.chatListHeaderTop}>
              <h3 className={styles.chatListTitle}>{t('chat.sections.conversations')}</h3>
              <button className={styles.newChatButton}>
                <Plus size={16} />
              </button>
            </div>
            
            {/* Search */}
            <div className={styles.searchWrapper}>
              <Search className={styles.searchIcon} size={16} />
              <input
                type="text"
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder={t('chat.searchPlaceholder')}
                className={styles.searchInput}
              />
            </div>
          </div>

          {/* Chat List */}
          <div className={styles.chatList}>
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setActiveChat(chat.id)}
                className={`${styles.chatItem} ${activeChat === chat.id ? styles.chatItemActive : ''}`}
              >
                <div className={styles.chatItemHeader}>
                  <h4 className={styles.chatItemTitle}>{chat.title}</h4>
                  <span className={styles.chatItemTime}>{chat.timestamp}</span>
                </div>
                <p className={styles.chatItemPreview}>{chat.preview}</p>
                
                {/* Hover Actions */}
                <div className={styles.chatItemActions}>
                  <button className={styles.chatItemActionBtn} onClick={(e) => e.stopPropagation()}>
                    <Edit2 size={12} />
                  </button>
                  <button className={`${styles.chatItemActionBtn} ${styles.deleteBtn}`} onClick={(e) => e.stopPropagation()}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center - Chat Area */}
        <div className={styles.chatArea}>
          {/* Header */}
          <div className={styles.chatHeader}>
            <div className={styles.chatHeaderLeft}>
              <div className={styles.agentAvatar}>
                <img 
                  src="/ghostpost_logo.png" 
                  alt="Ghost" 
                  className={styles.agentAvatarImg}
                />
                <span className={styles.onlineIndicator}></span>
              </div>
              <div className={styles.agentInfo}>
                <h3 className={styles.agentName}>{t('chat.agentInfo.name')}</h3>
                <p className={styles.agentStatus}>{t('chat.agentInfo.status')}</p>
              </div>
            </div>
            
            <button onClick={handleClose} className={styles.closeButton}>
              <X size={16} />
            </button>
          </div>

          {/* Messages Area */}
          <div className={styles.messagesArea}>
            {messages.map((message, index) => (
              <div key={index} className={styles.messageGroup}>
                {/* Timestamp */}
                {message.timestamp && (
                  <div className={styles.messageTimestamp}>{message.timestamp}</div>
                )}
                
                {/* Agent Message */}
                {message.type === 'agent' && (
                  <div className={styles.agentMessage}>
                    <p className={styles.messageText}>{message.text}</p>
                    
                    {message.actions && (
                      <div className={styles.messageActions}>
                        {message.actions.map((action, i) => (
                          <button
                            key={i}
                            onClick={() => handleAction(action)}
                            className={i === 0 ? styles.primaryActionBtn : styles.secondaryActionBtn}
                          >
                            {i === 0 && <Check size={16} />}
                            {action}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* User Message */}
                {message.type === 'user' && (
                  <div className={styles.userMessageWrapper}>
                    <div className={styles.userMessage}>
                      <p className={styles.messageText}>{message.text}</p>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {message.type === 'error' && (
                  <div className={styles.errorMessage}>
                    <div className={styles.errorContent}>
                      <p className={styles.messageText}>{message.text}</p>
                      <button className={styles.errorCloseBtn}>
                        <X size={16} />
                      </button>
                    </div>
                    {message.hasRetry && (
                      <button className={styles.retryBtn}>{t('chat.buttons.retry')}</button>
                    )}
                  </div>
                )}

                {/* Success Message */}
                {message.type === 'success' && (
                  <div className={styles.successMessage}>
                    <Check size={16} />
                    <p className={styles.messageText}>{message.text}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input Area */}
          <div className={styles.inputArea}>
            <div className={styles.inputWrapper}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder={t('chat.inputPlaceholder')}
                className={styles.messageInput}
              />
              <div className={styles.inputActions}>
                <button className={styles.inputActionBtn}>
                  <ImageIcon size={16} />
                </button>
                <button className={styles.inputActionBtn}>
                  <Paperclip size={16} />
                </button>
                <button className={styles.inputActionBtn}>
                  <Mic size={16} />
                </button>
              </div>
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={styles.sendButton}
            >
              <Send size={20} />
            </button>
          </div>
        </div>

        {/* Right Sidebar - Quick Actions & AI Settings */}
        <div className={styles.rightSidebar}>
          {/* Quick Actions */}
          <div className={styles.quickActionsSection}>
            <h3 className={styles.sectionTitle}>{t('chat.sections.quickActions')}</h3>
            <div className={styles.quickActionsGrid}>
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickAction(action.key, action.label)}
                  className={`${styles.quickActionBtn} ${styles[`quickAction${action.color}`]}`}
                >
                  <action.icon size={20} />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* AI Settings */}
          <div className={styles.aiSettingsSection}>
            <h3 className={styles.sectionTitle}>{t('chat.sections.aiConfiguration')}</h3>
            
            {/* Text Generation */}
            <div className={styles.settingGroup}>
              <label className={styles.settingLabel}>{t('chat.aiConfig.textGeneration')}</label>
              
              {/* Engine Select */}
              <div className={styles.selectWrapper}>
                <button
                  onClick={() => setIsTextEngineOpen(!isTextEngineOpen)}
                  className={styles.selectButton}
                >
                  <span>{textEngines.find(e => e.id === selectedTextEngine)?.name}</span>
                  <ChevronDown size={16} className={isTextEngineOpen ? styles.rotated : ''} />
                </button>
                
                {isTextEngineOpen && (
                  <div className={styles.selectDropdown}>
                    {textEngines.map((engine) => (
                      <button
                        key={engine.id}
                        onClick={() => {
                          setSelectedTextEngine(engine.id);
                          setSelectedTextModel(textModels[engine.id][0]);
                          setIsTextEngineOpen(false);
                        }}
                        className={styles.selectOption}
                      >
                        {engine.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Model Select */}
              <div className={styles.selectWrapper}>
                <button
                  onClick={() => setIsTextModelOpen(!isTextModelOpen)}
                  className={styles.selectButton}
                >
                  <span>{selectedTextModel}</span>
                  <ChevronDown size={16} className={isTextModelOpen ? styles.rotated : ''} />
                </button>
                
                {isTextModelOpen && (
                  <div className={styles.selectDropdown}>
                    {textModels[selectedTextEngine]?.map((model) => (
                      <button
                        key={model}
                        onClick={() => {
                          setSelectedTextModel(model);
                          setIsTextModelOpen(false);
                        }}
                        className={styles.selectOption}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Image Generation */}
            <div className={styles.settingGroup}>
              <label className={styles.settingLabel}>{t('chat.aiConfig.imageGeneration')}</label>
              
              {/* Engine Select */}
              <div className={styles.selectWrapper}>
                <button
                  onClick={() => setIsImageEngineOpen(!isImageEngineOpen)}
                  className={styles.selectButton}
                >
                  <span>{imageEngines.find(e => e.id === selectedImageEngine)?.name}</span>
                  <ChevronDown size={16} className={isImageEngineOpen ? styles.rotated : ''} />
                </button>
                
                {isImageEngineOpen && (
                  <div className={styles.selectDropdown}>
                    {imageEngines.map((engine) => (
                      <button
                        key={engine.id}
                        onClick={() => {
                          setSelectedImageEngine(engine.id);
                          setSelectedImageModel(imageModels[engine.id][0]);
                          setIsImageEngineOpen(false);
                        }}
                        className={styles.selectOption}
                      >
                        {engine.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Model Select */}
              <div className={styles.selectWrapper}>
                <button
                  onClick={() => setIsImageModelOpen(!isImageModelOpen)}
                  className={styles.selectButton}
                >
                  <span>{selectedImageModel}</span>
                  <ChevronDown size={16} className={isImageModelOpen ? styles.rotated : ''} />
                </button>
                
                {isImageModelOpen && (
                  <div className={styles.selectDropdown}>
                    {imageModels[selectedImageEngine]?.map((model) => (
                      <button
                        key={model}
                        onClick={() => {
                          setSelectedImageModel(model);
                          setIsImageModelOpen(false);
                        }}
                        className={styles.selectOption}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Status Info */}
            <div className={styles.statusInfo}>
              <div className={styles.statusHeader}>
                <Clock size={16} />
                <span>{t('chat.sections.activeSession')}</span>
              </div>
              <p className={styles.statusText}>
                {t('chat.statusText.usingForResponses', { engine: textEngines.find(e => e.id === selectedTextEngine)?.name })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});
