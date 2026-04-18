'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '@ai-sdk/react';
import { 
  Send, X, Plus, Paperclip, Mic, Image as ImageIcon, 
  Check, Search, Trash2, Edit2, Sparkles, Zap, 
  FileText, BarChart, Clock, ChevronDown, 
  Globe, Target, Users, Wrench, TrendingUp, Link2, CalendarDays, ShieldCheck,
  Loader2
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { useUser } from '@/app/context/user-context';
import styles from './ghost-chat-popup.module.css';

export const GhostChatPopup = forwardRef(function GhostChatPopup({ isOpen, onClose, context = 'Dashboard' }, ref) {
  const { t, isRtl } = useLocale();
  const { selectedSite } = useSite();
  const { user } = useUser();
  const [panelWidth, setPanelWidth] = useState(1200);
  const [isResizing, setIsResizing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef(null);
  const messagesEndRef = useRef(null);
  const minWidth = 1000;
  const maxWidth = typeof window !== 'undefined' ? window.innerWidth - 50 : 1600;

  // Conversation state
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [chatSearch, setChatSearch] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [toast, setToast] = useState(null);
  const notifiedUsersRef = useRef(new Set());
  const activeUsersIntervalRef = useRef(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // AI chat via Vercel AI SDK useChat
  const { messages: aiMessages, input, setInput, handleSubmit, isLoading: isAiLoading, setMessages: setAiMessages } = useChat({
    api: '/api/chat',
    body: { conversationId: activeConversationId, siteId: selectedSite?.id },
    onFinish: (message) => {
      // After first AI response, generate title if conversation has no title
      const conv = conversations.find(c => c.id === activeConversationId);
      if (conv && !conv.title) {
        generateTitle(activeConversationId);
      }
      // Refresh conversations list to update timestamps
      fetchConversations();
    },
    onError: (error) => {
      console.error('[Chat] AI error:', error);
      setToast({ message: t('chat.errors.aiError') || 'Error getting AI response', type: 'error' });
    },
  });

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

  // ── API Functions ──

  const fetchConversations = useCallback(async () => {
    if (!selectedSite?.id) return;
    setIsLoadingConversations(true);
    try {
      const res = await fetch(`/api/chat/conversations?siteId=${selectedSite.id}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('[Chat] fetchConversations error:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [selectedSite?.id]);

  const createConversation = useCallback(async () => {
    if (!selectedSite?.id || isCreatingConversation) return;
    setIsCreatingConversation(true);
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(prev => [data.conversation, ...prev]);
        setActiveConversationId(data.conversation.id);
        setConversationMessages([]);
        setAiMessages([]);
      }
    } catch (err) {
      console.error('[Chat] createConversation error:', err);
    } finally {
      setIsCreatingConversation(false);
    }
  }, [selectedSite?.id, isCreatingConversation, setAiMessages]);

  const deleteConversation = useCallback(async (convId) => {
    try {
      const res = await fetch(`/api/chat/conversations/${convId}`, { method: 'DELETE' });
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== convId));
        if (activeConversationId === convId) {
          setActiveConversationId(null);
          setConversationMessages([]);
          setAiMessages([]);
        }
      } else {
        const data = await res.json();
        setToast({ message: data.error || 'Failed to delete', type: 'error' });
      }
    } catch (err) {
      console.error('[Chat] deleteConversation error:', err);
    }
  }, [activeConversationId, setAiMessages]);

  const renameConversation = useCallback(async (convId, newTitle) => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch(`/api/chat/conversations/${convId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: newTitle.trim() } : c));
      }
    } catch (err) {
      console.error('[Chat] renameConversation error:', err);
    }
    setEditingConversationId(null);
  }, []);

  const loadMessages = useCallback(async (convId) => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/conversations/${convId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setConversationMessages(data.messages || []);
        // Set AI messages for useChat context continuation
        const aiMsgs = (data.messages || []).map(m => ({
          id: m.id,
          role: m.role === 'USER' ? 'user' : 'assistant',
          content: m.content,
        }));
        setAiMessages(aiMsgs);
      }
    } catch (err) {
      console.error('[Chat] loadMessages error:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [setAiMessages]);

  const generateTitle = useCallback(async (convId) => {
    try {
      const res = await fetch('/api/chat/generate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title) {
          setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: data.title } : c));
        }
      }
    } catch (err) {
      console.error('[Chat] generateTitle error:', err);
    }
  }, []);

  // ── Fetch conversations when site changes or panel opens ──
  useEffect(() => {
    if (isOpen && selectedSite?.id) {
      fetchConversations();
    }
  }, [isOpen, selectedSite?.id, fetchConversations]);

  // ── Load messages when active conversation changes ──
  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId, loadMessages]);

  // ── Active users polling for concurrent usage detection ──
  useEffect(() => {
    if (!activeConversationId) {
      if (activeUsersIntervalRef.current) {
        clearInterval(activeUsersIntervalRef.current);
        activeUsersIntervalRef.current = null;
      }
      notifiedUsersRef.current = new Set();
      return;
    }

    // Reset notified users when switching conversations
    notifiedUsersRef.current = new Set();

    const checkActiveUsers = async () => {
      try {
        const res = await fetch(`/api/chat/conversations/${activeConversationId}/active-users`);
        if (res.ok) {
          const data = await res.json();
          if (data.activeUsers && data.activeUsers.length > 0) {
            data.activeUsers.forEach(u => {
              if (!notifiedUsersRef.current.has(u.userId)) {
                setToast({ message: `${u.userName} ${t('chat.activeUser') || 'is also in this conversation'}`, type: 'info' });
                notifiedUsersRef.current.add(u.userId);
              }
            });
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    };

    checkActiveUsers();
    activeUsersIntervalRef.current = setInterval(checkActiveUsers, 15000);

    return () => {
      if (activeUsersIntervalRef.current) {
        clearInterval(activeUsersIntervalRef.current);
        activeUsersIntervalRef.current = null;
      }
    };
  }, [activeConversationId, t]);

  // ── Scroll to bottom on new messages ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  const getCurrentTime = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  const quickActions = [
    { icon: Sparkles, label: t('chat.quickActions.generateContent'), key: 'generateContent', color: 'purple' },
    { icon: ShieldCheck, label: t('chat.quickActions.quickSeoAudit'), key: 'quickSeoAudit', color: 'blue' },
    { icon: Target, label: t('chat.quickActions.keywordResearch'), key: 'keywordResearch', color: 'green' },
    { icon: Users, label: t('chat.quickActions.competitorAnalysis'), key: 'competitorAnalysis', color: 'orange' },
    { icon: Wrench, label: t('chat.quickActions.fixSeoIssues'), key: 'fixSeoIssues', color: 'cyan' },
    { icon: CalendarDays, label: t('chat.quickActions.contentPlanner'), key: 'contentPlanner', color: 'pink' },
    { icon: TrendingUp, label: t('chat.quickActions.analyticsReport'), key: 'analyticsReport', color: 'blue' },
    { icon: Link2, label: t('chat.quickActions.linkBuilding'), key: 'linkBuilding', color: 'purple' }
  ];

  // Send via useChat - auto-create conversation if none selected
  const handleSend = useCallback(async (e, overrideInput) => {
    if (e) e.preventDefault();
    const messageText = overrideInput || input;
    if (!messageText.trim() || isAiLoading) return;

    // If no active conversation, create one first
    if (!activeConversationId) {
      if (!selectedSite?.id) return;
      setIsCreatingConversation(true);
      try {
        const res = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: selectedSite.id }),
        });
        if (res.ok) {
          const data = await res.json();
          setConversations(prev => [data.conversation, ...prev]);
          setActiveConversationId(data.conversation.id);
          // useChat will pick up the new conversationId from body on next render
          // We need to submit after state update, so queue it
          setTimeout(() => {
            if (overrideInput) {
              setInput(overrideInput);
            }
            // The handleSubmit from useChat needs the form event or we call it differently
            // We'll use the input state approach
          }, 100);
        }
      } catch (err) {
        console.error('[Chat] auto-create error:', err);
      } finally {
        setIsCreatingConversation(false);
      }
      return;
    }

    // Submit to AI via useChat
    handleSubmit(e);
  }, [input, isAiLoading, activeConversationId, selectedSite?.id, handleSubmit]);

  // Quick action sends the label as a message
  const handleQuickAction = useCallback(async (actionKey, label) => {
    if (!label.trim() || isAiLoading) return;

    // If no active conversation, create one first
    if (!activeConversationId) {
      if (!selectedSite?.id) return;
      setIsCreatingConversation(true);
      try {
        const res = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: selectedSite.id }),
        });
        if (res.ok) {
          const data = await res.json();
          setConversations(prev => [data.conversation, ...prev]);
          setActiveConversationId(data.conversation.id);
          // After state settles, set input and submit
          setTimeout(() => {
            setInput(label);
          }, 100);
        }
      } catch (err) {
        console.error('[Chat] auto-create error:', err);
      } finally {
        setIsCreatingConversation(false);
      }
      return;
    }

    setInput(label);
    // Need to wait for input state to update then submit
    setTimeout(() => {
      const form = document.getElementById('ghost-chat-form');
      if (form) form.requestSubmit();
    }, 50);
  }, [isAiLoading, activeConversationId, selectedSite?.id]);

  // Can current user delete this conversation?
  const canDelete = useCallback((conv) => {
    if (!user) return false;
    return conv.createdByUserId === user.id || user.isOwner;
  }, [user]);

  // Filter conversations by search
  const filteredConversations = conversations.filter(c => {
    if (!chatSearch.trim()) return true;
    const search = chatSearch.toLowerCase();
    return (c.title || '').toLowerCase().includes(search) ||
      (c.createdByUser?.firstName || '').toLowerCase().includes(search) ||
      (c.createdByUser?.lastName || '').toLowerCase().includes(search);
  });

  // Format relative time
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return t('chat.timestamps.justNow') || 'Just now';
    if (diffMin < 60) return `${diffMin} ${t('chat.timestamps.minutesAgo') || 'min ago'}`;
    if (diffHours < 24) return `${diffHours} ${t('chat.timestamps.hoursAgo') || 'hours ago'}`;
    if (diffDays === 1) return t('chat.timestamps.yesterday') || 'Yesterday';
    return date.toLocaleDateString();
  };

  const getUserDisplayName = (userObj) => {
    if (!userObj) return '';
    return [userObj.firstName, userObj.lastName].filter(Boolean).join(' ') || userObj.email || '';
  };

  if (!isOpen && !isClosing) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className={`${styles.backdrop} ${isClosing ? styles.backdropClosing : ''}`} 
        onClick={handleClose} 
      />

      {/* Toast notification */}
      {toast && (
        <div className={`${styles.toast} ${styles[`toast_${toast.type}`]}`}>
          {toast.message}
        </div>
      )}

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
              <h3 className={styles.chatListTitle}>
                {t('chat.sections.conversationsForSite') || 'שיחות על האתר'} : {selectedSite?.name || ''}
              </h3>
              <button 
                className={styles.newChatButton}
                onClick={createConversation}
                disabled={isCreatingConversation}
              >
                {isCreatingConversation ? <Loader2 size={16} className={styles.spinning} /> : <Plus size={16} />}
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
            {isLoadingConversations ? (
              <div className={styles.loadingState}>
                <Loader2 size={20} className={styles.spinning} />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className={styles.emptyState}>
                <p>{t('chat.noConversations') || 'No conversations yet'}</p>
                <button className={styles.newChatButton} onClick={createConversation}>
                  <Plus size={14} />
                  <span>{t('chat.newConversation') || 'New conversation'}</span>
                </button>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`${styles.chatItem} ${activeConversationId === conv.id ? styles.chatItemActive : ''}`}
                >
                  <div className={styles.chatItemHeader}>
                    {editingConversationId === conv.id ? (
                      <input
                        className={styles.editTitleInput}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => renameConversation(conv.id, editTitle)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameConversation(conv.id, editTitle);
                          if (e.key === 'Escape') setEditingConversationId(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <h4 className={styles.chatItemTitle}>
                        {conv.title || t('chat.untitledConversation') || 'New conversation'}
                      </h4>
                    )}
                    <span className={styles.chatItemTime}>{formatTime(conv.updatedAt)}</span>
                  </div>
                  <p className={styles.chatItemPreview}>
                    {getUserDisplayName(conv.createdByUser)}
                    {conv._count?.messages ? ` · ${conv._count.messages} ${t('chat.messages') || 'messages'}` : ''}
                  </p>
                  
                  {/* Hover Actions */}
                  <div className={styles.chatItemActions}>
                    <button 
                      className={styles.chatItemActionBtn} 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingConversationId(conv.id);
                        setEditTitle(conv.title || '');
                      }}
                    >
                      <Edit2 size={12} />
                    </button>
                    {canDelete(conv) && (
                      <button 
                        className={`${styles.chatItemActionBtn} ${styles.deleteBtn}`} 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
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
                <p className={styles.agentStatus}>
                  {isAiLoading ? (t('chat.agentInfo.thinking') || 'Thinking...') : t('chat.agentInfo.status')}
                </p>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className={styles.messagesArea}>
            {/* Welcome message if no conversation or empty */}
            {(!activeConversationId || aiMessages.length === 0) && !isLoadingMessages && (
              <div className={styles.messageGroup}>
                <div className={styles.agentMessage}>
                  <p className={styles.messageText}>{getContextualMessage()}</p>
                </div>
              </div>
            )}

            {isLoadingMessages ? (
              <div className={styles.loadingState}>
                <Loader2 size={24} className={styles.spinning} />
              </div>
            ) : (
              aiMessages.map((message) => (
                <div key={message.id} className={styles.messageGroup}>
                  {/* AI Message */}
                  {message.role === 'assistant' && (
                    <div className={styles.agentMessage}>
                      <p className={styles.messageText}>{message.content}</p>
                    </div>
                  )}

                  {/* User Message */}
                  {message.role === 'user' && (
                    <div className={styles.userMessageWrapper}>
                      <div className={styles.userMessage}>
                        <p className={styles.messageText}>{message.content}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* AI loading indicator */}
            {isAiLoading && (
              <div className={styles.messageGroup}>
                <div className={styles.agentMessage}>
                  <div className={styles.typingIndicator}>
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form id="ghost-chat-form" onSubmit={handleSend} className={styles.inputArea}>
            <div className={styles.inputWrapper}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('chat.inputPlaceholder')}
                className={styles.messageInput}
                disabled={isAiLoading}
              />
              <div className={styles.inputActions}>
                <button type="button" className={styles.inputActionBtn}>
                  <ImageIcon size={16} />
                </button>
                <button type="button" className={styles.inputActionBtn}>
                  <Paperclip size={16} />
                </button>
                <button type="button" className={styles.inputActionBtn}>
                  <Mic size={16} />
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isAiLoading}
              className={styles.sendButton}
            >
              {isAiLoading ? <Loader2 size={20} className={styles.spinning} /> : <Send size={20} />}
            </button>
          </form>
        </div>

        {/* Right Sidebar - Quick Actions */}
        <div className={styles.rightSidebar}>
          {/* Quick Actions */}
          <div className={styles.quickActionsSection}>
            <h3 className={styles.sectionTitle}>{t('chat.sections.quickActions')}</h3>
            <div className={styles.quickActionsGrid}>
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickAction(action.key, action.label)}
                  disabled={isAiLoading}
                  className={`${styles.quickActionBtn} ${styles[`quickAction${action.color}`]}`}
                >
                  <action.icon size={20} />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
});
