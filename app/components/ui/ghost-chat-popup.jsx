'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '@ai-sdk/react';
import {
  Send, X, Plus, Paperclip, Mic, Image as ImageIcon,
  Check, Search, Trash2, Edit2, Sparkles, Zap,
  FileText, BarChart, Clock, ChevronDown, ChevronRight,
  Globe, Target, Users, Wrench, TrendingUp, Link2, CalendarDays, ShieldCheck,
  Loader2, CheckCircle, XCircle, AlertTriangle, RotateCcw, Timer,
  Monitor, Smartphone, Tablet, MousePointerClick, ExternalLink,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { useUser } from '@/app/context/user-context';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  normaliseSiteUrl,
  buildIframeSrc,
  usePreviewBridge,
} from '@/app/hooks/usePreviewBridge';
import styles from './ghost-chat-popup.module.css';

export const GhostChatPopup = forwardRef(function GhostChatPopup({ isOpen, onClose, context = 'Dashboard' }, ref) {
  const { t, isRtl } = useLocale();
  const { selectedSite } = useSite();
  const { user } = useUser();
  const [panelWidth, setPanelWidth] = useState(1200);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(280);
  const [chatAreaWidth, setChatAreaWidth] = useState(null); // null = auto/flex
  // 'panel' | 'leftSidebar' | 'chatArea' | null
  const [activeResize, setActiveResize] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef(null);
  const messagesEndRef = useRef(null);
  const minWidth = 1000;
  const maxWidth = typeof window !== 'undefined' ? window.innerWidth - 50 : 1600;
  const LEFT_SIDEBAR_MIN = 150;
  const LEFT_SIDEBAR_MAX = 500;
  const CHAT_AREA_MIN = 300;
  const PREVIEW_MIN = 480;

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
  const skipNextLoadMessagesRef = useRef(false); // Skip loadMessages after inline conversation creation

  // Action plan state
  const [actionStatuses, setActionStatuses] = useState({}); // { actionId: { status, remainingSeconds } }
  const actionPollIntervals = useRef({});

  // Thinking/reasoning state (expandable per message)
  const [thinkingExpanded, setThinkingExpanded] = useState({}); // { messageId: true/false }

  // Live preview panel state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deviceWidth, setDeviceWidth] = useState('full'); // 'full' | 1440 | 1024 | 768 | 375
  const [pagesDropdownOpen, setPagesDropdownOpen] = useState(false);
  const [pagesList, setPagesList] = useState(null); // null = not fetched; [] = empty
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesSearch, setPagesSearch] = useState('');
  const iframeRef = useRef(null);
  const urlPillRef = useRef(null);
  const pagesDropdownRef = useRef(null);
  const previewBridge = usePreviewBridge({
    siteUrl: selectedSite?.url,
    iframeRef,
    enabled: previewOpen,
  });
  const {
    iframeReady: previewReady,
    currentPreviewUrl,
    selectedElement,
    inspectorEnabled,
    connectionState: previewConnectionState,
    toggleInspector,
    clearSelection: clearPreviewSelection,
    reloadIframe,
    navigateIframe,
  } = previewBridge;
  const previewBridgeTimedOut = previewConnectionState === 'bridge_timeout';
  const previewSupported = selectedSite?.url && (selectedSite?.platform === 'wordpress' || !selectedSite?.platform);
  const previewIframeSrc = previewSupported ? buildIframeSrc(selectedSite.url, '/') : '';
  const reloadIframeRef = useRef(reloadIframe);
  useEffect(() => { reloadIframeRef.current = reloadIframe; }, [reloadIframe]);
  const selectedElementRef = useRef(selectedElement);
  useEffect(() => { selectedElementRef.current = selectedElement; }, [selectedElement]);

  // When the preview opens, make sure the popup is wide enough to show it.
  useEffect(() => {
    if (!previewOpen) return;
    const target = typeof window !== 'undefined'
      ? Math.min(1600, Math.max(0, window.innerWidth - 40))
      : 1400;
    setPanelWidth(prev => (prev < 1400 ? Math.max(1400, Math.min(target, 1600)) : prev));
  }, [previewOpen]);

  // Convert an absolute entity URL into a path relative to the site origin.
  const urlToPath = useCallback((entityUrl) => {
    if (!entityUrl) return '/';
    try {
      const u = new URL(entityUrl);
      return (u.pathname || '/') + (u.search || '');
    } catch {
      // Treat as already a path
      return entityUrl.startsWith('/') ? entityUrl : `/${entityUrl}`;
    }
  }, []);

  // Fetch pages/posts entities for the dropdown
  const fetchPages = useCallback(async () => {
    if (!selectedSite?.id) return;
    setPagesLoading(true);
    try {
      const res = await fetch(`/api/entities?siteId=${selectedSite.id}`);
      if (res.ok) {
        const data = await res.json();
        const entities = Array.isArray(data.entities) ? data.entities : [];
        // Keep only published entities with a URL
        const filtered = entities
          .filter(e => (e.status === 'PUBLISHED' || !e.status) && e.url && e.title)
          .map(e => ({
            id: e.id,
            title: e.title,
            url: e.url,
            path: urlToPath(e.url),
            typeSlug: e.entityType?.slug || 'other',
            typeName: e.entityType?.name || 'Other',
          }));
        setPagesList(filtered);
      } else {
        setPagesList([]);
      }
    } catch (err) {
      console.error('[Preview] fetchPages error:', err);
      setPagesList([]);
    } finally {
      setPagesLoading(false);
    }
  }, [selectedSite?.id, urlToPath]);

  // Fetch the pages list when the dropdown opens the first time (or after site change)
  useEffect(() => {
    if (pagesDropdownOpen && pagesList === null) fetchPages();
  }, [pagesDropdownOpen, pagesList, fetchPages]);

  // Reset cached pages when site changes so stale data isn't shown
  useEffect(() => {
    setPagesList(null);
    setPagesSearch('');
    setPagesDropdownOpen(false);
  }, [selectedSite?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!pagesDropdownOpen) return;
    const onDocClick = (e) => {
      const pill = urlPillRef.current;
      const dropdown = pagesDropdownRef.current;
      if (pill?.contains(e.target) || dropdown?.contains(e.target)) return;
      setPagesDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pagesDropdownOpen]);

  // Poll action status for countdown and execution tracking
  const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'EXPIRED', 'REJECTED', 'ROLLED_BACK'];
  const startActionPolling = useCallback((actionId) => {
    if (actionPollIntervals.current[actionId]) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/chat/actions/${actionId}/status`);
        if (res.ok) {
          const data = await res.json();
          setActionStatuses(prev => ({ ...prev, [actionId]: data }));
          // Stop polling at terminal states and reload messages to show execution results
          if (TERMINAL_STATUSES.includes(data.status)) {
            clearInterval(actionPollIntervals.current[actionId]);
            delete actionPollIntervals.current[actionId];
            // Reload messages from DB to show execution result message
            const convId = activeConversationIdRef.current;
            if (convId && loadMessagesRef.current) {
              loadMessagesRef.current(convId);
            }
            // Refresh preview iframe so the site reflects the applied change
            if (data.status === 'COMPLETED' && reloadIframeRef.current) {
              reloadIframeRef.current();
            }
          }
        }
      } catch { /* ignore */ }
    };
    poll();
    actionPollIntervals.current[actionId] = setInterval(poll, 3000);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      Object.values(actionPollIntervals.current).forEach(clearInterval);
      actionPollIntervals.current = {};
    };
  }, []);

  const handleApproveAction = useCallback(async (actionId) => {
    try {
      setActionStatuses(prev => ({ ...prev, [actionId]: { ...prev[actionId], status: 'EXECUTING' } }));
      const res = await fetch(`/api/chat/actions/${actionId}/approve`, { method: 'POST' });
      if (res.ok) {
        setToast({ message: t('chat.actionCard.actionApproved') || 'Action approved and executing...', type: 'success' });
        // Clear any existing polling and restart to track execution progress
        if (actionPollIntervals.current[actionId]) {
          clearInterval(actionPollIntervals.current[actionId]);
          delete actionPollIntervals.current[actionId];
        }
        startActionPolling(actionId);
      } else {
        const data = await res.json();
        setToast({ message: data.error || t('chat.actionCard.approveFailed') || 'Failed to approve', type: 'error' });
        setActionStatuses(prev => ({ ...prev, [actionId]: { ...prev[actionId], status: 'PENDING_APPROVAL' } }));
      }
    } catch (err) {
      setToast({ message: 'Failed to approve action', type: 'error' });
    }
  }, [startActionPolling]);

  const handleRejectAction = useCallback(async (actionId) => {
    try {
      const res = await fetch(`/api/chat/actions/${actionId}/reject`, { method: 'POST' });
      if (res.ok) {
        setActionStatuses(prev => ({ ...prev, [actionId]: { ...prev[actionId], status: 'REJECTED' } }));
        setToast({ message: 'Action rejected', type: 'info' });
      } else {
        const data = await res.json();
        setToast({ message: data.error || 'Failed to reject', type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Failed to reject action', type: 'error' });
    }
  }, []);

  const handleRollbackAction = useCallback(async (actionId) => {
    try {
      setActionStatuses(prev => ({ ...prev, [actionId]: { ...prev[actionId], status: 'ROLLING_BACK' } }));
      const res = await fetch(`/api/chat/actions/${actionId}/rollback`, { method: 'POST' });
      if (res.ok) {
        setActionStatuses(prev => ({ ...prev, [actionId]: { ...prev[actionId], status: 'ROLLED_BACK' } }));
        setToast({ message: t('chat.actionCard.rollbackSuccess') || 'Action rolled back successfully', type: 'success' });
      } else {
        const data = await res.json();
        setToast({ message: data.error || t('chat.actionCard.rollbackFailed') || 'Rollback failed', type: 'error' });
        setActionStatuses(prev => ({ ...prev, [actionId]: { ...prev[actionId], status: 'COMPLETED' } }));
      }
    } catch (err) {
      setToast({ message: t('chat.actionCard.rollbackFailed') || 'Rollback failed', type: 'error' });
    }
  }, []);

  // Refs for latest values to pass as body in sendMessage calls
  const activeConversationIdRef = useRef(activeConversationId);
  const selectedSiteIdRef = useRef(selectedSite?.id);
  const loadMessagesRef = useRef(null); // Will be set after loadMessages is defined
  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => { selectedSiteIdRef.current = selectedSite?.id; }, [selectedSite?.id]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Local input state (AI SDK v6 no longer manages input)
  const [input, setInput] = useState('');

  // AI chat via Vercel AI SDK useChat (v6 API)
  const { messages: aiMessages, sendMessage, status, setMessages: setAiMessages } = useChat({
    api: '/api/chat',
    onFinish: ({ message }) => {
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

  const isAiLoading = status === 'submitted' || status === 'streaming';

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

  const startResize = useCallback((target) => (e) => {
    e.preventDefault();
    setActiveResize(target);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!activeResize) return;
    const panelEl = panelRef.current;
    const panelRect = panelEl?.getBoundingClientRect();

    if (activeResize === 'panel') {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setPanelWidth(newWidth);
      }
      return;
    }

    if (!panelRect) return;
    const dirSign = isRtl ? -1 : 1;

    if (activeResize === 'leftSidebar') {
      // When RTL the left sidebar is visually on the right; measure from panel start
      const offsetFromStart = isRtl
        ? panelRect.right - e.clientX
        : e.clientX - panelRect.left;
      const clamped = Math.max(LEFT_SIDEBAR_MIN, Math.min(LEFT_SIDEBAR_MAX, offsetFromStart));
      setLeftSidebarWidth(clamped);
      return;
    }

    if (activeResize === 'chatArea') {
      // Compute chat-area width from the handle position
      const startX = isRtl ? panelRect.right - leftSidebarWidth : panelRect.left + leftSidebarWidth;
      const rawWidth = (e.clientX - startX) * dirSign;
      const maxChatWidth = panelRect.width - leftSidebarWidth - PREVIEW_MIN;
      const clamped = Math.max(CHAT_AREA_MIN, Math.min(maxChatWidth, rawWidth));
      setChatAreaWidth(clamped);
    }
  }, [activeResize, maxWidth, isRtl, leftSidebarWidth]);

  const handleMouseUp = useCallback(() => {
    setActiveResize(null);
  }, []);

  useEffect(() => {
    if (activeResize) {
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
  }, [activeResize, handleMouseMove, handleMouseUp]);

  // Reset chat-area width when preview closes, so chatArea flexes back to fill
  useEffect(() => {
    if (!previewOpen) setChatAreaWidth(null);
  }, [previewOpen]);

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
        // Set AI messages for useChat context continuation (UIMessage format with parts)
        const aiMsgs = (data.messages || [])
          .filter(m => m.content) // Skip messages with empty content
          .map(m => ({
            id: m.id,
            role: m.role === 'USER' ? 'user' : 'assistant',
            parts: [{ type: 'text', text: m.content }],
          }));
        setAiMessages(aiMsgs);
      }
    } catch (err) {
      console.error('[Chat] loadMessages error:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [setAiMessages]);

  // Keep ref in sync for polling callback
  useEffect(() => { loadMessagesRef.current = loadMessages; }, [loadMessages]);

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
      // Skip loading when conversation was just created via handleSend/handleQuickAction
      // to avoid overwriting the in-progress streaming response from useChat
      if (skipNextLoadMessagesRef.current) {
        skipNextLoadMessagesRef.current = false;
        return;
      }
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
    const rawText = (overrideInput || input || '').trim();
    if (!rawText || isAiLoading) return;

    // Prefix targeted-element context when the user has clicked an element in the preview
    const sel = selectedElementRef.current;
    const messageText = sel
      ? `[Targeting: <${sel.tag}> "${(sel.text || '').substring(0, 80)}" — selector: ${sel.selector}]\n\n${rawText}`
      : rawText;

    // Clear input immediately
    setInput('');
    if (sel) clearPreviewSelection();

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
          skipNextLoadMessagesRef.current = true; // Don't load DB messages — useChat will manage them
          setActiveConversationId(data.conversation.id);
          // Update ref immediately so sendMessage picks up the new conversationId
          activeConversationIdRef.current = data.conversation.id;
          sendMessage({ text: messageText }, { body: { conversationId: data.conversation.id, siteId: selectedSiteIdRef.current } });
        }
      } catch (err) {
        console.error('[Chat] auto-create error:', err);
      } finally {
        setIsCreatingConversation(false);
      }
      return;
    }

    // Submit to AI via useChat sendMessage
    sendMessage({ text: messageText }, { body: { conversationId: activeConversationIdRef.current, siteId: selectedSiteIdRef.current } });
  }, [input, isAiLoading, activeConversationId, selectedSite?.id, sendMessage, clearPreviewSelection]);

  // Quick action sends the label as a message
  const handleQuickAction = useCallback(async (actionKey, label) => {
    if (!label?.trim() || isAiLoading) return;

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
          skipNextLoadMessagesRef.current = true; // Don't load DB messages — useChat will manage them
          setActiveConversationId(data.conversation.id);
          // Update ref immediately so sendMessage picks up the new conversationId
          activeConversationIdRef.current = data.conversation.id;
          sendMessage({ text: label }, { body: { conversationId: data.conversation.id, siteId: selectedSiteIdRef.current } });
        }
      } catch (err) {
        console.error('[Chat] auto-create error:', err);
      } finally {
        setIsCreatingConversation(false);
      }
      return;
    }

    sendMessage({ text: label }, { body: { conversationId: activeConversationIdRef.current, siteId: selectedSiteIdRef.current } });
  }, [isAiLoading, activeConversationId, selectedSite?.id, sendMessage]);

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

  // Status badge component for action cards
  const ActionStatusBadge = ({ status }) => {
    const config = {
      PENDING_APPROVAL: { label: t('chat.actionCard.pending') || 'Pending', icon: Clock, className: styles.statusPending },
      APPROVED: { label: t('chat.actionCard.approved') || 'Approved', icon: Check, className: styles.statusApproved },
      EXECUTING: { label: t('chat.actionCard.executing') || 'Executing', icon: Loader2, className: styles.statusExecuting },
      COMPLETED: { label: t('chat.actionCard.completed') || 'Completed', icon: CheckCircle, className: styles.statusCompleted },
      FAILED: { label: t('chat.actionCard.failed') || 'Failed', icon: AlertTriangle, className: styles.statusFailed },
      EXPIRED: { label: t('chat.actionCard.expired') || 'Expired', icon: Clock, className: styles.statusExpired },
      REJECTED: { label: t('chat.actionCard.rejected') || 'Rejected', icon: XCircle, className: styles.statusRejected },
      ROLLED_BACK: { label: t('chat.actionCard.rolledBack') || 'Rolled Back', icon: RotateCcw, className: styles.statusRolledBack },
      ROLLING_BACK: { label: t('chat.actionCard.rollingBack') || 'Rolling Back', icon: Loader2, className: styles.statusExecuting },
      LOADING: { label: t('chat.actionCard.creating') || 'Creating...', icon: Loader2, className: styles.statusExecuting },
    };
    const c = config[status] || config.LOADING;
    const Icon = c.icon;
    return (
      <span className={`${styles.statusBadge} ${c.className}`}>
        <Icon size={12} className={c.icon === Loader2 ? styles.spinning : ''} />
        {c.label}
      </span>
    );
  };

  // Format remaining time with translations
  const formatRemainingTime = (seconds) => {
    if (seconds > 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}${t('chat.actionCard.minuteShort') || 'm'} ${secs}${t('chat.actionCard.secondShort') || 's'} ${t('chat.actionCard.remaining') || 'remaining'}`;
    }
    return `${seconds}${t('chat.actionCard.secondShort') || 's'} ${t('chat.actionCard.remaining') || 'remaining'}`;
  };

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
        {/* Resize Handle (left edge of panel — resizes whole popup width) */}
        <div
          className={styles.resizeHandle}
          onMouseDown={startResize('panel')}
        >
          <div className={styles.resizeHandleLine}></div>
        </div>

        {/* Left Sidebar - Chat List */}
        <div className={styles.leftSidebar} style={{ width: `${leftSidebarWidth}px` }}>
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

        {/* Column resize handle between left sidebar and chat area */}
        <div
          className={styles.columnResizeHandle}
          onMouseDown={startResize('leftSidebar')}
          title="Resize"
        />

        {/* Center - Chat Area */}
        <div
          className={styles.chatArea}
          style={chatAreaWidth != null ? { flex: '0 0 auto', width: `${chatAreaWidth}px` } : undefined}
        >
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
            {previewSupported && (
              <button
                type="button"
                onClick={() => setPreviewOpen(v => !v)}
                className={`${styles.previewToggleBtn} ${previewOpen ? styles.previewToggleBtnActive : ''}`}
                title={previewOpen ? (t('chat.preview.hide') || 'Hide preview') : (t('chat.preview.show') || 'Show live preview')}
              >
                <Monitor size={16} />
                <span>{t('chat.preview.label') || 'Preview'}</span>
              </button>
            )}
          </div>

          {/* Selected element badge from preview inspector */}
          {selectedElement && (
            <div className={styles.selectionBadge}>
              <MousePointerClick size={14} />
              <span className={styles.selectionTag}>&lt;{selectedElement.tag}&gt;</span>
              <span className={styles.selectionText}>
                {(selectedElement.text || '').substring(0, 60) || (t('chat.preview.emptyText') || '(empty)')}
                {(selectedElement.text || '').length > 60 ? '…' : ''}
              </span>
              <button
                type="button"
                className={styles.selectionClear}
                onClick={clearPreviewSelection}
                title={t('chat.preview.clearSelection') || 'Clear selection'}
              >
                <X size={14} />
              </button>
            </div>
          )}

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
                      <div className={styles.messageText}>
                        {message.parts?.map((part, partIdx) => {
                          if (part.type === 'text' && part.text) {
                            // Strip raw tool call syntax like "call: tool_name(...)" that the model sometimes outputs as text
                            const cleanedText = part.text
                              .replace(/call:\s*\w+\([^)]*\)/gi, '')
                              .replace(/```tool[\s\S]*?```/gi, '')
                              .trim();
                            if (!cleanedText) return null;
                            return (
                              <ReactMarkdown key={partIdx} remarkPlugins={[remarkGfm]}>
                                {cleanedText}
                              </ReactMarkdown>
                            );
                          }

                          // v6 tool parts: type is "tool-{toolName}" or "dynamic-tool"
                          const isToolPart = part.type?.startsWith('tool-') || part.type === 'dynamic-tool';
                          if (isToolPart) {
                            // Extract tool name from part type (e.g., "tool-analyze_page" → "analyze_page")
                            const toolName = part.type === 'dynamic-tool' ? part.toolName : part.type.replace(/^tool-/, '');
                            const { state: toolState, input, output, errorText } = part;

                            // propose_action tool — render action card
                            if (toolName === 'propose_action' && input) {
                              let parsedOutput = null;
                              try {
                                parsedOutput = typeof output === 'string' ? JSON.parse(output) : output;
                              } catch { parsedOutput = output; }

                              const actionId = parsedOutput?.actionId;
                              const actionStatus = actionStatuses[actionId] || {};
                              const currentStatus = actionStatus.status || parsedOutput?.status || (toolState === 'output-available' ? 'PENDING_APPROVAL' : 'LOADING');
                              const remainingSeconds = actionStatus.remainingSeconds;

                              // Start polling when we get an actionId
                              if (actionId && currentStatus === 'PENDING_APPROVAL') {
                                startActionPolling(actionId);
                              }

                              return (
                                <div key={partIdx} className={styles.actionCard}>
                                  <div className={styles.actionCardHeader}>
                                    <div className={styles.actionCardTitle}>
                                      <Zap size={16} className={styles.actionCardIcon} />
                                      <span>{input.title || 'Action Plan'}</span>
                                    </div>
                                    <ActionStatusBadge status={currentStatus} />
                                  </div>

                                  {input.description && (
                                    <div className={styles.actionCardDescription}>
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {input.description}
                                      </ReactMarkdown>
                                    </div>
                                  )}

                                  {input.actions?.length > 0 && (
                                    <div className={styles.actionCardSteps}>
                                      {input.actions.map((action, i) => (
                                        <div key={i} className={styles.actionStep}>
                                          <span className={styles.actionStepNumber}>{i + 1}</span>
                                          <span className={styles.actionStepText}>{action.description}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Timer */}
                                  {currentStatus === 'PENDING_APPROVAL' && remainingSeconds != null && (
                                    <div className={`${styles.actionTimer} ${remainingSeconds < 120 ? styles.actionTimerWarning : ''}`}>
                                      <Timer size={14} />
                                      <span>{formatRemainingTime(remainingSeconds)}</span>
                                    </div>
                                  )}

                                  {/* Buttons */}
                                  <div className={styles.actionCardButtons}>
                                    {currentStatus === 'PENDING_APPROVAL' && actionId && (
                                      <>
                                        <button
                                          className={`${styles.actionBtn} ${styles.actionBtnApprove}`}
                                          onClick={() => handleApproveAction(actionId)}
                                        >
                                          <CheckCircle size={14} />
                                          <span>{t('chat.actionCard.approve') || 'Approve'}</span>
                                        </button>
                                        <button
                                          className={`${styles.actionBtn} ${styles.actionBtnReject}`}
                                          onClick={() => handleRejectAction(actionId)}
                                        >
                                          <XCircle size={14} />
                                          <span>{t('chat.actionCard.reject') || 'Reject'}</span>
                                        </button>
                                      </>
                                    )}
                                    {currentStatus === 'EXECUTING' && (
                                      <div className={styles.actionExecuting}>
                                        <Loader2 size={14} className={styles.spinning} />
                                        <span>{t('chat.actionCard.executing') || 'Executing...'}</span>
                                      </div>
                                    )}
                                    {(currentStatus === 'COMPLETED' || currentStatus === 'FAILED') && actionId && (
                                      <button
                                        className={`${styles.actionBtn} ${styles.actionBtnRollback}`}
                                        onClick={() => handleRollbackAction(actionId)}
                                      >
                                        <RotateCcw size={14} />
                                        <span>{t('chat.actionCard.rollback') || 'Rollback'}</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            // Other tool invocations — show loading or hide result
                            if (toolState === 'input-streaming' || toolState === 'input-available') {
                              return (
                                <div key={partIdx} className={styles.toolLoading}>
                                  <Loader2 size={14} className={styles.spinning} />
                                  <span>{t('chat.actionCard.fetchingData') || 'Fetching data'}{toolName ? ` (${toolName.replace(/_/g, ' ')})` : ''}...</span>
                                </div>
                              );
                            }

                            // Tool completed (output-available, output-error) — don't render (the AI will summarize)
                            return null;
                          }

                          return null;
                        })}
                      </div>
                    </div>
                  )}

                  {/* User Message */}
                  {message.role === 'user' && (
                    <div className={styles.userMessageWrapper}>
                      <div className={styles.userMessage}>
                        <p className={styles.messageText}>
                          {message.parts?.filter(p => p.type === 'text').map(p => p.text).join('') || ''}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* AI thinking indicator (expandable reasoning like ChatGPT/Gemini) */}
            {isAiLoading && (
              <div className={styles.messageGroup}>
                <div className={styles.agentMessage}>
                  <div className={styles.thinkingContainer}>
                    <div
                      className={styles.thinkingHeader}
                      onClick={() => setThinkingExpanded(prev => ({ ...prev, _loading: !prev._loading }))}
                    >
                      <ChevronRight size={14} className={`${styles.thinkingChevron} ${thinkingExpanded._loading ? styles.thinkingChevronOpen : ''}`} />
                      <Loader2 size={14} className={`${styles.thinkingSpinner} ${styles.spinning}`} />
                      <span className={styles.thinkingLabel}>
                        {t('chat.actionCard.thinking') || 'Thinking'}
                        <span className={styles.thinkingDots}>
                          <span></span><span></span><span></span>
                        </span>
                      </span>
                    </div>
                    {thinkingExpanded._loading && (() => {
                      // Collect tool parts from the latest streaming assistant message
                      const lastAssistant = [...(aiMessages || [])].reverse().find(m => m.role === 'assistant');
                      const toolParts = lastAssistant?.parts?.filter(p => {
                        const isTool = p.type?.startsWith('tool-') || p.type === 'dynamic-tool';
                        if (!isTool) return false;
                        const tn = p.type === 'dynamic-tool' ? p.toolName : p.type.replace(/^tool-/, '');
                        return tn !== 'propose_action';
                      }) || [];
                      return toolParts.length > 0 ? (
                        <div className={styles.thinkingContent}>
                          {toolParts.map((p, i) => {
                            const tn = p.type === 'dynamic-tool' ? p.toolName : p.type.replace(/^tool-/, '');
                            const isLoading = p.state === 'input-streaming' || p.state === 'input-available';
                            const isDone = p.state === 'output-available';
                            return (
                              <div key={i} className={styles.toolLoading}>
                                {isLoading ? (
                                  <Loader2 size={12} className={styles.spinning} />
                                ) : isDone ? (
                                  <CheckCircle size={12} style={{ color: 'var(--success)' }} />
                                ) : (
                                  <AlertTriangle size={12} style={{ color: 'var(--danger)' }} />
                                )}
                                <span>{tn?.replace(/_/g, ' ')}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={styles.thinkingContent}>
                          <span>{t('chat.actionCard.analyzing') || 'Analyzing your request...'}</span>
                        </div>
                      );
                    })()}
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

        {/* Column resize handle between chat area and preview panel */}
        {previewOpen && previewSupported && (
          <div
            className={styles.columnResizeHandle}
            onMouseDown={startResize('chatArea')}
            title="Resize"
          />
        )}

        {/* Right Sidebar — Preview panel when open, Quick Actions otherwise */}
        {previewOpen && previewSupported ? (
          <div className={styles.previewPanel}>
            <div className={styles.previewToolbar}>
              <div className={styles.previewToolbarLeft}>
                <button
                  type="button"
                  onClick={() => reloadIframe()}
                  className={styles.previewIconBtn}
                  title={t('chat.preview.reload') || 'Reload'}
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  type="button"
                  onClick={toggleInspector}
                  className={`${styles.previewIconBtn} ${inspectorEnabled ? styles.previewIconBtnActive : ''}`}
                  title={inspectorEnabled ? (t('chat.preview.disableInspector') || 'Disable inspector') : (t('chat.preview.enableInspector') || 'Enable inspector')}
                >
                  <MousePointerClick size={15} />
                </button>
              </div>
              <div className={styles.previewToolbarCenter}>
                <button
                  type="button"
                  ref={urlPillRef}
                  className={`${styles.previewUrlPill} ${pagesDropdownOpen ? styles.previewUrlPillActive : ''}`}
                  onClick={() => setPagesDropdownOpen(v => !v)}
                  title={t('chat.preview.pages.title') || 'Pages & posts'}
                >
                  <span className={styles.previewUrlPillText}>{currentPreviewUrl || '/'}</span>
                  <ChevronDown size={13} className={styles.previewUrlPillChevron} />
                </button>
                {pagesDropdownOpen && (
                  <div ref={pagesDropdownRef} className={styles.pagesDropdown}>
                    <div className={styles.pagesDropdownHeader}>
                      <Search size={13} className={styles.pagesDropdownSearchIcon} />
                      <input
                        type="text"
                        className={styles.pagesDropdownSearch}
                        value={pagesSearch}
                        onChange={(e) => setPagesSearch(e.target.value)}
                        placeholder={t('chat.preview.pages.search') || 'Search pages…'}
                        autoFocus
                      />
                    </div>
                    <div className={styles.pagesDropdownBody}>
                      {pagesLoading ? (
                        <div className={styles.pagesDropdownState}>
                          <Loader2 size={14} className={styles.spinning} />
                          <span>{t('chat.preview.pages.loading') || 'Loading pages…'}</span>
                        </div>
                      ) : (() => {
                        const q = pagesSearch.trim().toLowerCase();
                        const all = pagesList || [];
                        const match = (p) => !q || p.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q);
                        const homepage = { id: '__home', title: t('chat.preview.pages.homepage') || 'Homepage', path: '/', typeSlug: 'homepage' };
                        const showHome = match(homepage);
                        const groups = all.filter(match).reduce((acc, item) => {
                          const key = item.typeSlug || 'other';
                          (acc[key] = acc[key] || []).push(item);
                          return acc;
                        }, {});
                        const order = ['pages', 'page', 'posts', 'post'];
                        const sortedKeys = [
                          ...order.filter(k => groups[k]),
                          ...Object.keys(groups).filter(k => !order.includes(k)),
                        ];
                        const groupLabel = (slug, fallback) => {
                          if (slug === 'pages' || slug === 'page') return t('chat.preview.pages.pagesGroup') || 'Pages';
                          if (slug === 'posts' || slug === 'post') return t('chat.preview.pages.postsGroup') || 'Posts';
                          return fallback || t('chat.preview.pages.other') || 'Other';
                        };
                        const renderItem = (p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={`${styles.pagesDropdownItem} ${currentPreviewUrl === p.path ? styles.pagesDropdownItemActive : ''}`}
                            onClick={() => {
                              navigateIframe(p.path);
                              setPagesDropdownOpen(false);
                            }}
                          >
                            <span className={styles.pagesDropdownItemTitle}>{p.title}</span>
                            <span className={styles.pagesDropdownItemPath}>{p.path}</span>
                          </button>
                        );
                        const isEmpty = !showHome && sortedKeys.length === 0;
                        if (isEmpty && all.length === 0) {
                          return (
                            <div className={styles.pagesDropdownState}>
                              <span>{t('chat.preview.pages.empty') || 'No pages found. Use the Entities tab to sync your site content.'}</span>
                            </div>
                          );
                        }
                        return (
                          <>
                            {showHome && renderItem(homepage)}
                            {sortedKeys.map(key => (
                              <div key={key}>
                                <div className={styles.pagesDropdownGroupLabel}>{groupLabel(key, groups[key][0]?.typeName)}</div>
                                {groups[key].map(renderItem)}
                              </div>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
              <div className={styles.previewToolbarRight}>
                <div className={styles.deviceToggle} role="tablist">
                  {[
                    { key: 'full', icon: Monitor, label: t('chat.preview.device.full') || 'Full' },
                    { key: 1024, icon: Tablet, label: '1024' },
                    { key: 375, icon: Smartphone, label: '375' },
                  ].map(d => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setDeviceWidth(d.key)}
                      className={`${styles.deviceToggleBtn} ${deviceWidth === d.key ? styles.deviceToggleBtnActive : ''}`}
                      title={typeof d.label === 'string' ? d.label : String(d.label)}
                    >
                      <d.icon size={14} />
                    </button>
                  ))}
                </div>
                {previewReady ? (
                  <span className={styles.previewReadyDot} title={t('chat.preview.ready') || 'Connected'} />
                ) : previewBridgeTimedOut ? (
                  <span
                    className={styles.previewErrorDot}
                    title={t('chat.preview.error.title') || "Couldn't load the site preview"}
                  />
                ) : (
                  <Loader2
                    size={14}
                    className={styles.spinning}
                    aria-label={t('chat.preview.connecting') || 'Connecting to site…'}
                  />
                )}
                <a
                  href={normaliseSiteUrl(selectedSite?.url || '')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.previewIconBtn}
                  title={t('chat.preview.openNewTab') || 'Open in new tab'}
                >
                  <ExternalLink size={15} />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className={styles.previewIconBtn}
                  title={t('chat.preview.close') || 'Close preview'}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className={styles.previewIframeWrap}>
              <div
                className={styles.previewIframeFrame}
                style={deviceWidth === 'full' ? undefined : { width: `${deviceWidth}px`, margin: '0 auto' }}
              >
                <iframe
                  ref={iframeRef}
                  src={previewIframeSrc}
                  className={styles.previewIframe}
                  title="Site preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
                {previewBridgeTimedOut && (
                  <div className={styles.previewErrorOverlay}>
                    <div className={styles.previewErrorCard}>
                      <AlertTriangle size={24} className={styles.previewErrorIcon} />
                      <h4 className={styles.previewErrorTitle}>
                        {t('chat.preview.error.title') || "Couldn't load the site preview"}
                      </h4>
                      <p className={styles.previewErrorText}>
                        {(t('chat.preview.error.cannotConnect') || "The browser couldn't reach {url}.").replace(
                          '{url}',
                          normaliseSiteUrl(selectedSite?.url || ''),
                        )}
                      </p>
                      <p className={styles.previewErrorHint}>
                        {t('chat.preview.error.bridgeMissing') || 'The site loaded, but the Ghost Post Connector bridge didn\'t respond. Make sure the plugin is installed and updated to the latest version, then reload.'}
                      </p>
                      <div className={styles.previewErrorActions}>
                        <button
                          type="button"
                          className={styles.previewErrorBtnPrimary}
                          onClick={() => reloadIframe()}
                        >
                          <RotateCcw size={14} />
                          <span>{t('chat.preview.error.retry') || 'Try again'}</span>
                        </button>
                        <a
                          href={normaliseSiteUrl(selectedSite?.url || '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.previewErrorBtnSecondary}
                        >
                          <ExternalLink size={14} />
                          <span>{t('chat.preview.error.openDirectly') || 'Open site directly'}</span>
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </>,
    document.body
  );
});
