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
  MessageCircle, Network,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { useUser } from '@/app/context/user-context';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  normaliseSiteUrl,
  usePreviewBridge,
} from '@/app/hooks/usePreviewBridge';
import { handleLimitError, emitLimitError } from '@/app/context/limit-guard-context';
import styles from './ghost-chat-popup.module.css';

export const GhostChatPopup = forwardRef(function GhostChatPopup({ isOpen, onClose, context = 'Dashboard' }, ref) {
  const { t, isRtl } = useLocale();
  const translateToolName = useCallback((name) => {
    if (!name) return '';
    const key = `chat.actionCard.toolNames.${name}`;
    const translated = t(key);
    return translated === key ? name.replace(/_/g, ' ') : translated;
  }, [t]);
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
  const maxWidth = typeof window !== 'undefined' ? window.innerWidth : 1600;
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
  const [deletingConversationIds, setDeletingConversationIds] = useState(() => new Set());
  const [editingConversationId, setEditingConversationId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [toast, setToast] = useState(null);
  const notifiedUsersRef = useRef(new Set());
  const activeUsersIntervalRef = useRef(null);
  const skipNextLoadMessagesRef = useRef(false); // Skip loadMessages after inline conversation creation
  // Snapshot of the conversations array kept in a ref so the markConversationRead
  // callback can compute the post-mark total without rebinding on every change.
  const conversationsRef = useRef([]);

  // AI-GCoins pre-flight: probed when the popup opens and after every send so
  // an account that's already over its limit sees the upgrade banner inside
  // the chat (and the modal on click) without having to first burn a request
  // that 402s. Shape: null = unknown, { used, limit, remaining, isLimitReached } = loaded.
  const [aiCreditsUsage, setAiCreditsUsage] = useState(null);

  // Action plan state
  const [actionStatuses, setActionStatuses] = useState({}); // { actionId: { status, remainingSeconds } }
  const actionPollIntervals = useRef({});

  // Thinking/reasoning state (expandable per message)
  const [thinkingExpanded, setThinkingExpanded] = useState({}); // { messageId: true/false }

  // Live preview panel state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deviceWidth, setDeviceWidth] = useState('full'); // 'full' | 1440 | 1024 | 768 | 375
  const [pagesDropdownOpen, setPagesDropdownOpen] = useState(false);
  const [inputActionsOpen, setInputActionsOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const inputActionsRef = useRef(null);
  const [pagesList, setPagesList] = useState(null); // null = not fetched; [] = empty
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesSearch, setPagesSearch] = useState('');
  const iframeRef = useRef(null);
  const urlPillRef = useRef(null);
  const pagesDropdownRef = useRef(null);
  const chatAreaRef = useRef(null);
  const previewBridge = usePreviewBridge({
    siteUrl: selectedSite?.url,
    siteId: selectedSite?.id,
    iframeRef,
    enabled: previewOpen,
  });
  const {
    iframeReady: previewReady,
    currentPreviewUrl,
    selectedElement,
    inspectorEnabled,
    connectionState: previewConnectionState,
    tokenState: previewTokenState,
    iframeSrc: previewIframeSrcFromBridge,
    toggleInspector,
    clearSelection: clearPreviewSelection,
    reloadIframe,
    navigateIframe,
  } = previewBridge;
  const previewBridgeTimedOut = previewConnectionState === 'bridge_timeout';
  const previewSupported = selectedSite?.url && (selectedSite?.platform === 'wordpress' || !selectedSite?.platform);
  const previewIframeSrc = previewSupported ? previewIframeSrcFromBridge : '';
  const reloadIframeRef = useRef(reloadIframe);
  useEffect(() => { reloadIframeRef.current = reloadIframe; }, [reloadIframe]);

  // Blur the iframe during (re)loads - flips true when src or preview-url
  // changes, flips false on the iframe's onLoad event.
  useEffect(() => {
    if (previewIframeSrc) setPreviewLoading(true);
  }, [previewIframeSrc]);
  useEffect(() => {
    if (!previewIframeSrc) return;
    setPreviewLoading(true);
    const t = setTimeout(() => setPreviewLoading(false), 2500); // safety clear
    return () => clearTimeout(t);
  }, [currentPreviewUrl, previewIframeSrc]);
  const selectedElementRef = useRef(selectedElement);
  useEffect(() => { selectedElementRef.current = selectedElement; }, [selectedElement]);

  // When the AI calls request_element_placement, open the preview panel,
  // navigate to the target path, make sure the inspector is ON, and surface
  // a banner telling the user what to click. Tracked by message+tool id so
  // we react exactly once per tool call.
  const [placementRequest, setPlacementRequest] = useState(null); // { elementType, guidance, toolCallKey }
  const handledPlacementKeysRef = useRef(new Set());

  // When the preview opens, expand the popup to its max width and collapse
  // both the conversations sidebar and the chat area to their minimums so the
  // preview has as much room as possible. CSS transitions animate the
  // reshuffle smoothly; we lock chatArea's current (flex-based) width into an
  // explicit value for one frame first, so the width transition has a real
  // starting point instead of snapping from "auto".
  useEffect(() => {
    if (!previewOpen) return;
    const maxPanelW = typeof window !== 'undefined'
      ? Math.max(1400, window.innerWidth - 40)
      : 1600;
    setPanelWidth(maxPanelW);
    setLeftSidebarWidth(LEFT_SIDEBAR_MIN);

    const el = chatAreaRef.current;
    if (el && chatAreaWidth == null) {
      setChatAreaWidth(el.getBoundingClientRect().width);
      const id = requestAnimationFrame(() => setChatAreaWidth(CHAT_AREA_MIN));
      return () => cancelAnimationFrame(id);
    }
    setChatAreaWidth(CHAT_AREA_MIN);
  }, [previewOpen]);

  // Bridge-timeout surfaces as an inline toolbar warning (below), not a toast -
  // the site itself still renders fine, only the click-to-inspect feature is
  // unavailable, so a blocking notification is overkill.

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

  // Pre-fetch pages as soon as the preview opens so the URL pill can display
  // the page title instead of the raw id/path.
  useEffect(() => {
    if (previewOpen && pagesList === null && selectedSite?.id) fetchPages();
  }, [previewOpen, pagesList, selectedSite?.id, fetchPages]);

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

  // Close input-actions dropup on outside click / Esc
  useEffect(() => {
    if (!inputActionsOpen) return;
    const onDocClick = (e) => {
      if (inputActionsRef.current?.contains(e.target)) return;
      setInputActionsOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setInputActionsOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [inputActionsOpen]);

  // Auto-close the dropup if preview gets closed
  useEffect(() => { if (!previewOpen) setInputActionsOpen(false); }, [previewOpen]);

  // Poll action status for countdown and execution tracking
  const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'EXPIRED', 'REJECTED', 'ROLLED_BACK'];
  const startActionPolling = useCallback((actionId) => {
    if (actionPollIntervals.current[actionId]) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/chat/actions/${actionId}/status`);
        if (res.ok) {
          const data = await res.json();
          // Never let a polling response REGRESS the visible status from a
          // terminal one. Once we've seen COMPLETED / FAILED / EXPIRED /
          // REJECTED / ROLLED_BACK, ignore any subsequent non-terminal
          // payload that lands due to a stale poll race - it would otherwise
          // flash the EXECUTING spinner back onto a card that's already done.
          setActionStatuses(prev => {
            const existing = prev[actionId];
            if (existing && TERMINAL_STATUSES.includes(existing.status)
                && !TERMINAL_STATUSES.includes(data.status)) {
              return prev;
            }
            return { ...prev, [actionId]: data };
          });
          // Stop polling at terminal states and reload messages to show execution results
          if (TERMINAL_STATUSES.includes(data.status)) {
            clearInterval(actionPollIntervals.current[actionId]);
            delete actionPollIntervals.current[actionId];
            // Reload messages from DB to show execution result message
            const convId = activeConversationIdRef.current;
            if (convId && loadMessagesRef.current) {
              loadMessagesRef.current(convId);
            }
            // Refresh preview iframe on ANY terminal status. Even when the
            // action is marked FAILED (e.g. manipulate_element returned
            // render_mismatch), the DB write may have partially landed and
            // the user needs to see the current state of the live page.
            // Reloading a preview iframe is idempotent and safe.
            if (reloadIframeRef.current) {
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

  // In-flight guard: prevents double-clicks from triggering duplicate approve/reject/rollback
  // requests within the same React tick. Ref-based check fires synchronously (state updates
  // are async), state copy mirrors it for visual `disabled` styling on buttons.
  const inFlightActionsRef = useRef(new Set());
  const [inFlightActions, setInFlightActions] = useState(() => new Set());
  const lockAction = useCallback((actionId) => {
    if (inFlightActionsRef.current.has(actionId)) return false;
    inFlightActionsRef.current.add(actionId);
    setInFlightActions(prev => {
      const next = new Set(prev);
      next.add(actionId);
      return next;
    });
    return true;
  }, []);
  const unlockAction = useCallback((actionId) => {
    inFlightActionsRef.current.delete(actionId);
    setInFlightActions(prev => {
      if (!prev.has(actionId)) return prev;
      const next = new Set(prev);
      next.delete(actionId);
      return next;
    });
  }, []);

  // Per-action overrides (e.g. edited image prompt + reference images) keyed by `${actionId}:${index}`
  const [actionArgOverrides, setActionArgOverrides] = useState({});

  const handleApproveAction = useCallback(async (actionId) => {
    if (!lockAction(actionId)) return;
    try {
      // Don't optimistically flip to EXECUTING here. The Approve button
      // already shows its own loading spinner via `isPending` (lockAction),
      // and the server's approve endpoint may reject for credit-limit /
      // expired-action / network reasons - flipping the whole card to
      // EXECUTING and snapping it back on rejection looks like a sudden
      // unwanted spinner. Polling will pick up the real EXECUTING state
      // a moment later from the server, which is the source of truth.
      // Collect overrides for this action card (strip local-only preview fields)
      const argOverrides = {};
      Object.entries(actionArgOverrides).forEach(([k, v]) => {
        const [aId, idx] = k.split(':');
        if (aId === actionId && v && typeof v === 'object') {
          const clean = { ...v };
          if (Array.isArray(clean.referenceImages)) {
            clean.referenceImages = clean.referenceImages
              .filter(Boolean)
              .map(r => ({ base64: r.base64, mimeType: r.mimeType }));
          }
          argOverrides[idx] = clean;
        }
      });
      const res = await fetch(`/api/chat/actions/${actionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ argOverrides: Object.keys(argOverrides).length ? argOverrides : undefined }),
      });
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
        // approve route returns the standard limit payload as 402 when the
        // action's combined credit cost would exceed the account's limit.
        // Surface the global upgrade modal instead of a generic error toast,
        // and snap the card back to PENDING_APPROVAL so the user can re-try
        // after upgrading without losing the proposal.
        if (handleLimitError(data)) return;
        setToast({ message: data.error || t('chat.actionCard.approveFailed') || 'Failed to approve', type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Failed to approve action', type: 'error' });
    } finally {
      unlockAction(actionId);
    }
  }, [startActionPolling, lockAction, unlockAction, actionArgOverrides]);

  const handleRejectAction = useCallback(async (actionId) => {
    if (!lockAction(actionId)) return;
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
    } finally {
      unlockAction(actionId);
    }
  }, [lockAction, unlockAction]);

  const handleRollbackAction = useCallback(async (actionId) => {
    if (!lockAction(actionId)) return;
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
    } finally {
      unlockAction(actionId);
    }
  }, [lockAction, unlockAction]);

  // Try-again on a FAILED action: clones the original plan + steps into a new
  // PENDING_APPROVAL ChatAction. The user sees a fresh card they can approve
  // to retry. The backend gates this on status (only FAILED/REJECTED/EXPIRED/
  // ROLLED_BACK actions can be retried) so we don't need a client-side guard.
  const handleRetryAction = useCallback(async (actionId) => {
    if (!lockAction(actionId)) return;
    try {
      const res = await fetch(`/api/chat/actions/${actionId}/retry`, { method: 'POST' });
      if (res.ok) {
        setToast({ message: t('chat.actionCard.retrySuccess') || 'Created a new approval card - approve it to retry.', type: 'success' });
        // Reload conversation messages so the new PENDING action card appears
        // immediately (server already wrote it via createActionProposal).
        if (activeConversationIdRef.current) {
          loadMessagesRef.current?.(activeConversationIdRef.current);
        }
      } else {
        const data = await res.json();
        // Surface AI-GCoins limit errors using the global modal, same as
        // approve does. This catches the case where the user's account is
        // over budget right when they try to retry.
        if (handleLimitError(data)) return;
        setToast({ message: data.error || t('chat.actionCard.retryFailed') || 'Could not create a retry card', type: 'error' });
      }
    } catch (err) {
      setToast({ message: t('chat.actionCard.retryFailed') || 'Could not create a retry card', type: 'error' });
    } finally {
      unlockAction(actionId);
    }
  }, [lockAction, unlockAction, t]);

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
  // Inline edit state - when set, the matching user bubble renders as a textarea
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const editTextareaRef = useRef(null);
  // Map of messageId → selection body, populated when a message is sent with a
  // preview-inspector selection attached. Used to render the selection chip
  // above the matching user bubble without stuffing the chip into the visible text.
  const [selectionsByMessageId, setSelectionsByMessageId] = useState({});
  const pendingSelectionRef = useRef(null);
  const messageInputRef = useRef(null);
  useEffect(() => {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

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
      // Re-probe AI-GCoins usage so the banner appears mid-session as soon
      // as the user crosses the limit from a single expensive turn (e.g.
      // image generation = 10 credits) without waiting for the next open.
      refreshAiCreditsUsage();
    },
    onError: (error) => {
      console.error('[Chat] AI error:', error);
      // The Vercel AI SDK's HttpChatTransport throws on any non-OK response and
      // puts the response body verbatim in error.message. Our /api/chat 402
      // returns the standard limit payload `{ code: 'INSUFFICIENT_CREDITS',
      // resourceKey: 'aiCredits', usage }` - parse it and surface the global
      // upgrade modal exactly like the AddSiteModal / Entities flows do.
      try {
        const parsed = JSON.parse(error?.message || '');
        if (handleLimitError(parsed)) return;
      } catch { /* not JSON - fall through */ }
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

  // Expose handleClose + prefill to parent via ref
  useImperativeHandle(ref, () => ({
    close: handleClose,
    // Set input to a prefilled value (e.g. from a "Optimize with Ghost"
    // button on the dashboard). Does not auto-send so the user can review.
    prefill: (text) => {
      if (typeof text !== 'string') return;
      setInput(text);
    },
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

  // When preview opens, expand the whole chat panel to the full viewport width
  // so the preview iframe has room to render without squeezing the chat column.
  // Also collapse the conversations sidebar to a 70px icon rail.
  // Remember the previous widths so we can restore them when preview closes.
  const panelWidthBeforePreviewRef = useRef(null);
  const leftSidebarBeforePreviewRef = useRef(null);
  const COMPACT_SIDEBAR_WIDTH = 70;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (previewOpen) {
      panelWidthBeforePreviewRef.current = panelWidth;
      leftSidebarBeforePreviewRef.current = leftSidebarWidth;
      setPanelWidth(window.innerWidth);
      setLeftSidebarWidth(COMPACT_SIDEBAR_WIDTH);
    } else {
      if (panelWidthBeforePreviewRef.current != null) {
        setPanelWidth(panelWidthBeforePreviewRef.current);
        panelWidthBeforePreviewRef.current = null;
      }
      if (leftSidebarBeforePreviewRef.current != null) {
        setLeftSidebarWidth(leftSidebarBeforePreviewRef.current);
        leftSidebarBeforePreviewRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Surface the cross-conversation unread total to the dashboard
        // shell (floating chat bubble badge). Dispatched as a CustomEvent
        // so we don't have to wire prop drilling through the popup ref.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ghostseo:chat-unread', {
            detail: { totalUnread: data.totalUnread || 0, siteId: selectedSite.id },
          }));
        }
      }
    } catch (err) {
      console.error('[Chat] fetchConversations error:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [selectedSite?.id]);

  // Keep the ref in sync with the latest conversations snapshot - read by
  // markConversationRead to compute the post-mark unread total without
  // re-creating the callback on every change.
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Background poll: refresh the conversations list every 20s while the
  // popup is mounted so the user sees new "audit finished" messages from
  // long-running tasks even if they're chatting in another conversation.
  // The poll also keeps the floating chat-bubble badge in sync.
  useEffect(() => {
    if (!selectedSite?.id) return undefined;
    const id = setInterval(() => { fetchConversations(); }, 20000);
    return () => clearInterval(id);
  }, [selectedSite?.id, fetchConversations]);

  // Mark-read: when the user opens a conversation, bump their lastRead
  // timestamp on the server so the unread badge clears immediately and
  // doesn't keep firing on the next poll.
  const markConversationRead = useCallback(async (convId) => {
    if (!convId) return;
    try {
      await fetch(`/api/chat/conversations/${convId}/mark-read`, { method: 'POST' });
      setConversations((prev) => prev.map((c) =>
        c.id === convId ? { ...c, unreadCount: 0 } : c,
      ));
      // Also re-broadcast the unread total so the bubble badge updates without
      // waiting for the next poll tick.
      if (typeof window !== 'undefined') {
        const remaining = conversationsRef.current
          ? conversationsRef.current.reduce((sum, c) => sum + (c.id === convId ? 0 : (c.unreadCount || 0)), 0)
          : 0;
        window.dispatchEvent(new CustomEvent('ghostseo:chat-unread', {
          detail: { totalUnread: remaining, siteId: selectedSite?.id },
        }));
      }
    } catch (err) {
      console.error('[Chat] markConversationRead error:', err);
    }
  }, [selectedSite?.id]);

  const createConversation = useCallback(async () => {
    if (!selectedSite?.id || isCreatingConversation) return;

    // Reuse an existing empty conversation owned by the current user instead of
    // creating yet another one. An "empty" conversation has no title and no
    // messages persisted. If it's the active conversation, also confirm there
    // are no in-flight messages from useChat - those haven't bumped _count yet.
    const existingEmpty = conversations.find(c => {
      if (user?.id && c.createdByUserId !== user.id) return false;
      if (c.title) return false;
      if ((c._count?.messages ?? 0) > 0) return false;
      if (c.id === activeConversationId && (aiMessages.length > 0 || conversationMessages.length > 0)) return false;
      return true;
    });
    if (existingEmpty) {
      if (existingEmpty.id !== activeConversationId) {
        setActiveConversationId(existingEmpty.id);
        setConversationMessages([]);
        setAiMessages([]);
      }
      return;
    }

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
  }, [selectedSite?.id, isCreatingConversation, conversations, user?.id, activeConversationId, aiMessages, conversationMessages, setAiMessages]);

  const deleteConversation = useCallback(async (convId) => {
    setDeletingConversationIds(prev => {
      if (prev.has(convId)) return prev;
      const next = new Set(prev);
      next.add(convId);
      return next;
    });
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
    } finally {
      setDeletingConversationIds(prev => {
        if (!prev.has(convId)) return prev;
        const next = new Set(prev);
        next.delete(convId);
        return next;
      });
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

  // ── AI-GCoins pre-flight probe ───────────────────────────────────────
  // Hits /api/account/usage?resourceKey=aiCredits when the popup opens and
  // refreshes after each send so the over-limit banner inside the chat
  // appears immediately instead of only after a request 402s.
  const refreshAiCreditsUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/account/usage?resourceKey=aiCredits');
      if (!res.ok) return;
      const data = await res.json();
      setAiCreditsUsage(data);
    } catch (err) {
      // Non-fatal - just leave the previous value alone. The server-side
      // gates in /api/chat + /api/chat/actions/[id]/approve will still 402
      // and trigger the modal via handleLimitError.
      console.warn('[Chat] aiCredits probe failed:', err.message);
    }
  }, []);
  useEffect(() => {
    if (isOpen) refreshAiCreditsUsage();
  }, [isOpen, refreshAiCreditsUsage]);

  // True when the account has already burned through its monthly aiCredits
  // budget. Drives the persistent banner above the input + disables the Send
  // button so the user can't even fire a request that the server will refuse.
  const isOverAiCreditsLimit = !!aiCreditsUsage?.isLimitReached
    || (aiCreditsUsage && aiCreditsUsage.remaining !== null && aiCreditsUsage.remaining <= 0);

  const openAiCreditsLimitModal = useCallback(() => {
    emitLimitError({
      code: 'INSUFFICIENT_CREDITS',
      resourceKey: 'aiCredits',
      usage: aiCreditsUsage,
    });
  }, [aiCreditsUsage]);

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
      // Mark this conversation read on the server so the unread badge clears
      // immediately. Async, non-blocking - if it fails the next poll will
      // re-display the badge but no functional harm.
      markConversationRead(activeConversationId);
    }
  }, [activeConversationId, loadMessages, markConversationRead]);

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

  // ── Attach pending preview selection to the newest user message ──
  // handleSend stashes selectionBody in pendingSelectionRef right before
  // calling sendMessage; here we wait for useChat to append the optimistic
  // user message and then key the selection to that message's id, so the
  // chip renders above the right bubble even after re-renders.
  useEffect(() => {
    if (!pendingSelectionRef.current) return;
    for (let i = aiMessages.length - 1; i >= 0; i--) {
      const msg = aiMessages[i];
      if (msg.role !== 'user') continue;
      if (selectionsByMessageId[msg.id]) break;
      const sel = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      setSelectionsByMessageId((prev) => ({ ...prev, [msg.id]: sel }));
      break;
    }
  }, [aiMessages, selectionsByMessageId]);

  // ── React to request_element_placement tool completions ──
  // When the model calls this tool, auto-open the preview panel, navigate to
  // the requested path, ensure the inspector is ON, and surface a banner.
  useEffect(() => {
    if (!previewSupported) return;
    for (const msg of aiMessages) {
      if (msg.role !== 'assistant' || !Array.isArray(msg.parts)) continue;
      for (let i = 0; i < msg.parts.length; i++) {
        const p = msg.parts[i];
        const isPlacement =
          (p?.type === 'tool-request_element_placement') ||
          (p?.type === 'dynamic-tool' && p?.toolName === 'request_element_placement');
        if (!isPlacement) continue;
        if (p.state !== 'output-available') continue;
        const key = `${msg.id || 'msg'}:${p.toolCallId || i}`;
        if (handledPlacementKeysRef.current.has(key)) continue;
        handledPlacementKeysRef.current.add(key);
        const out = p.output || {};
        const pagePath = out.pagePath || '/';
        setPreviewOpen(true);
        // Navigate after the iframe mounts (next tick handles first open)
        setTimeout(() => {
          try { navigateIframe(pagePath); } catch { /* iframe not ready yet */ }
        }, 50);
        if (!inspectorEnabled) {
          try { toggleInspector(); } catch { /* noop */ }
        }
        setPlacementRequest({
          elementType: out.elementType || 'element',
          guidance: out.guidance || (t('chat.placement.guidance') || 'Click where you want the element placed, or describe the location.'),
          toolCallKey: key,
        });
      }
    }
  }, [aiMessages, previewSupported, navigateIframe, inspectorEnabled, toggleInspector, t]);

  // Clear placement banner when the user sends a reply (the model will consume it)
  const clearPlacementBanner = useCallback(() => setPlacementRequest(null), []);

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

    // Pre-flight: if the account is already over its AI-GCoins limit, skip
    // the network round-trip and pop the upgrade modal directly. The server
    // would 402 anyway and we'd surface the same modal via handleLimitError -
    // doing it client-side avoids a wasted request and is instantaneous.
    if (isOverAiCreditsLimit) {
      openAiCreditsLimitModal();
      return;
    }

    // Keep the visible message text clean - the user sees just what they typed.
    // Full element context (selector, elementor_id, outerHTML, ancestors, screenshot)
    // is passed separately in the request body so the server can inject it into the
    // AI conversation without polluting the chat bubble. A small selection chip is
    // rendered above the message bubble via selectionsByMessageId (see below).
    const sel = selectedElementRef.current;
    const messageText = rawText;
    let selectionBody = null;
    if (sel) {
      selectionBody = {
        tag: sel.tag,
        selector: sel.selector,
        text: sel.text,
        elementorId: sel.elementorId || null,
        elementorWidget: sel.elementorWidget || null,
        elementorAncestors: sel.elementorAncestors || null,
        outerHTML: sel.outerHTML || null,
        screenshot: sel.screenshot || null,
      };
      pendingSelectionRef.current = selectionBody;
    }

    // Clear input immediately
    setInput('');
    if (sel) clearPreviewSelection();
    clearPlacementBanner();

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
          skipNextLoadMessagesRef.current = true; // Don't load DB messages - useChat will manage them
          setActiveConversationId(data.conversation.id);
          // Update ref immediately so sendMessage picks up the new conversationId
          activeConversationIdRef.current = data.conversation.id;
          sendMessage({ text: messageText }, { body: { conversationId: data.conversation.id, siteId: selectedSiteIdRef.current, selection: selectionBody } });
        }
      } catch (err) {
        console.error('[Chat] auto-create error:', err);
      } finally {
        setIsCreatingConversation(false);
      }
      return;
    }

    // Submit to AI via useChat sendMessage
    sendMessage({ text: messageText }, { body: { conversationId: activeConversationIdRef.current, siteId: selectedSiteIdRef.current, selection: selectionBody } });
  }, [input, isAiLoading, activeConversationId, selectedSite?.id, sendMessage, clearPreviewSelection, isOverAiCreditsLimit, openAiCreditsLimitModal]);

  // Quick action sends the label as a message
  const handleQuickAction = useCallback(async (actionKey, label) => {
    if (!label?.trim() || isAiLoading) return;

    // Quick actions cost AI-GCoins too - same pre-flight gate as handleSend.
    if (isOverAiCreditsLimit) {
      openAiCreditsLimitModal();
      return;
    }

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
          skipNextLoadMessagesRef.current = true; // Don't load DB messages - useChat will manage them
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
  }, [isAiLoading, activeConversationId, selectedSite?.id, sendMessage, isOverAiCreditsLimit, openAiCreditsLimitModal]);

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

  // Live substep phase cycler shown during EXECUTING - no backend signal yet,
  // so we just rotate through the typical phases of a WP action so the user
  // sees *something* changing instead of a frozen "Executing..." label.
  const ExecutingProgress = ({ tool, startedAt }) => {
    const phases = (() => {
      if (tool === 'manipulate_element') {
        return [
          t('chat.actionCard.phase.locate') || 'Locating the element on your site…',
          t('chat.actionCard.phase.apply') || 'Applying the change through the plugin…',
          t('chat.actionCard.phase.cache') || 'Clearing caches so the live page updates…',
          t('chat.actionCard.phase.verify') || 'Verifying the result…',
        ];
      }
      if (tool === 'wp_update_post') {
        return [
          t('chat.actionCard.phase.snapshot') || 'Snapshotting the current post…',
          t('chat.actionCard.phase.write') || 'Writing the update to WordPress…',
          t('chat.actionCard.phase.cache') || 'Clearing caches so the live page updates…',
          t('chat.actionCard.phase.verify') || 'Verifying the result…',
        ];
      }
      return [
        t('chat.actionCard.phase.contact') || 'Contacting your site…',
        t('chat.actionCard.phase.apply') || 'Applying the change…',
        t('chat.actionCard.phase.verify') || 'Verifying the result…',
      ];
    })();
    const [phaseIdx, setPhaseIdx] = useState(0);
    useEffect(() => {
      const start = startedAt || Date.now();
      const pick = () => {
        const elapsed = (Date.now() - start) / 1000;
        // 0-2s → phase 0, 2-5s → phase 1, 5-9s → phase 2, then last
        const idx = elapsed < 2 ? 0 : elapsed < 5 ? 1 : elapsed < 9 ? 2 : Math.min(3, phases.length - 1);
        setPhaseIdx(idx);
      };
      pick();
      const int = setInterval(pick, 700);
      return () => clearInterval(int);
    }, [startedAt, phases.length]);
    const toolLabel = tool ? translateToolName(tool) : '';
    return (
      <div className={styles.actionExecuting}>
        <Loader2 size={14} className={styles.spinning} />
        <div className={styles.actionExecutingLabel}>
          <span>
            {t('chat.actionCard.executing') || 'Executing'}
            {toolLabel ? ` · ${toolLabel}` : ''}
          </span>
          <span key={phaseIdx} className={styles.actionExecutingPhase}>{phases[phaseIdx]}</span>
        </div>
      </div>
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
        className={`${styles.chatPanel} ${isClosing ? styles.chatPanelClosing : ''} ${activeResize ? styles.panelResizing : ''}`}
        style={{ width: `${panelWidth}px` }}
      >
        {/* Resize Handle (left edge of panel - resizes whole popup width) */}
        <div
          className={styles.resizeHandle}
          onMouseDown={startResize('panel')}
        >
          <div className={styles.resizeHandleLine}></div>
        </div>

        {/* Left Sidebar - Chat List */}
        <div
          className={`${styles.leftSidebar} ${previewOpen ? styles.leftSidebarCompact : ''}`}
          style={{ width: `${leftSidebarWidth}px` }}
        >
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
                title={previewOpen ? (t('chat.newConversation') || 'New conversation') : undefined}
              >
                {isCreatingConversation ? <Loader2 size={16} className={styles.spinning} /> : <Plus size={16} />}
              </button>
            </div>

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
              filteredConversations.map((conv) => {
                if (previewOpen) {
                  // Compact rail: icon, initiator initials, time - no actions/title/preview
                  const initiator = getUserDisplayName(conv.createdByUser) || '';
                  const initials = initiator
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(w => w[0]?.toUpperCase())
                    .join('') || '?';
                  return (
                    <div
                      key={conv.id}
                      onClick={() => setActiveConversationId(conv.id)}
                      className={`${styles.chatItem} ${styles.chatItemCompact} ${activeConversationId === conv.id ? styles.chatItemActive : ''}`}
                      title={conv.title || t('chat.untitledConversation') || 'New conversation'}
                    >
                      <MessageCircle size={18} className={styles.chatItemCompactIcon} />
                      <span className={styles.chatItemCompactInitiator} title={initiator}>{initials}</span>
                      <span className={styles.chatItemCompactTime}>{formatTime(conv.updatedAt)}</span>
                      {conv.unreadCount > 0 && conv.id !== activeConversationId && (
                        <span className={styles.unreadBadge} title={`${conv.unreadCount} unread`}>
                          {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                        </span>
                      )}
                      <div className={styles.chatItemCompactMeta}>
                        <span className={styles.chatItemCompactTitle}>
                          {conv.title || t('chat.untitledConversation') || 'New conversation'}
                        </span>
                        <span className={styles.chatItemCompactSubtitle}>
                          {initiator}
                          {conv._count?.messages ? ` · ${conv._count.messages} ${t('chat.messages') || 'messages'}` : ''}
                        </span>
                      </div>
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
                            disabled={deletingConversationIds.has(conv.id)}
                          >
                            {deletingConversationIds.has(conv.id)
                              ? <Loader2 size={12} className={styles.spinning} />
                              : <Trash2 size={12} />}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
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
                      {conv.unreadCount > 0 && conv.id !== activeConversationId && (
                        <span className={styles.unreadBadge} title={`${conv.unreadCount} unread`}>
                          {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                        </span>
                      )}
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
                          disabled={deletingConversationIds.has(conv.id)}
                        >
                          {deletingConversationIds.has(conv.id)
                            ? <Loader2 size={12} className={styles.spinning} />
                            : <Trash2 size={12} />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
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
          ref={chatAreaRef}
          className={styles.chatArea}
          style={chatAreaWidth != null ? { flex: '0 0 auto', width: `${chatAreaWidth}px` } : undefined}
        >
          {/* Header */}
          <div className={styles.chatHeader}>
            <div className={styles.chatHeaderLeft}>
              <div className={styles.agentAvatar}>
                <img
                  src="/favicon-white.svg"
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
              {selectedElement.screenshot ? (
                <img
                  src={selectedElement.screenshot}
                  alt=""
                  className={styles.selectionThumb}
                />
              ) : (
                <MousePointerClick size={14} />
              )}
              <span className={styles.selectionTag}>&lt;{selectedElement.tag}&gt;</span>
              <span className={styles.selectionText}>
                {(selectedElement.text || '').substring(0, 60) || (t('chat.preview.emptyText') || '(empty)')}
                {(selectedElement.text || '').length > 60 ? '…' : ''}
              </span>
              {selectedElement.outerHTML && (
                <span className={styles.selectionMeta} title={t('chat.preview.htmlAttached') || 'HTML attached'}>
                  HTML
                </span>
              )}
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

          {/* Placement request banner (AI is waiting for the user to point at / describe a location) */}
          {placementRequest && (
            <div className={styles.placementBanner}>
              <MousePointerClick size={14} />
              <span className={styles.placementBannerText}>
                <strong>{t('chat.placement.title') || 'Where should the'} {placementRequest.elementType} {t('chat.placement.go') || 'go?'}</strong>{' '}
                {placementRequest.guidance}
              </span>
              <button
                type="button"
                className={styles.selectionClear}
                onClick={clearPlacementBanner}
                title={t('chat.preview.clearSelection') || 'Dismiss'}
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
                  {(() => {
                    const suggestionKeys = ['siteAudit', 'analyzeHomepage', 'keywordOpportunities', 'agentInsights'];
                    const items = suggestionKeys
                      .map(key => ({
                        key,
                        label: t(`chat.welcome.suggestions.${key}.label`),
                        prompt: t(`chat.welcome.suggestions.${key}.prompt`),
                      }))
                      .filter(s => s.label && s.prompt && !s.label.startsWith('chat.welcome.'));
                    if (!items.length) return null;
                    return (
                      <div className={styles.welcomeSuggestions}>
                        {items.map(s => (
                          <button
                            key={s.key}
                            type="button"
                            className={styles.welcomeSuggestion}
                            onClick={() => handleSend(null, s.prompt)}
                            disabled={isAiLoading}
                          >
                            <Sparkles size={14} />
                            <span>{s.label}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
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
                      {/* Reasoning / thinking - collapsible, shows the model's thought process for this message.
                          BUT we hide it on "freeze fallback" replies, where the model emitted reasoning
                          ("I'm starting the scan...") but no actual text or tool call - the reasoning
                          contradicts the fallback body and confuses the user (they'd think work happened
                          when nothing did). Sentinel emoji + phrase let us recognise our own fallbacks. */}
                      {(() => {
                        const reasoningText = (message.parts || [])
                          .filter(p => p.type === 'reasoning' && p.text)
                          .map(p => p.text)
                          .join('\n\n')
                          .trim();
                        if (!reasoningText) return null;
                        const bodyText = (message.parts || [])
                          .filter(p => p.type === 'text' && p.text)
                          .map(p => p.text)
                          .join('\n')
                          .trim();
                        // Both HE and EN fallback markers from /api/chat/route.js's onFinish/onError.
                        const isFallbackBody = /^(🤔|⚠️|❌|🔍)\s*(חשבתי על השאלה|התגובה נחסמה|הגעתי למגבלת אורך|אספתי את המידע|נתקלתי בבעיה|I thought about your question|The response was blocked|I hit the response length|I gathered the data|I ran into a temporary error)/i.test(bodyText);
                        if (isFallbackBody) return null;
                        const expanded = !!thinkingExpanded[message.id];
                        return (
                          <div className={`${styles.thinkingContainer} ${styles.thinkingContainerInline}`}>
                            <div
                              className={styles.thinkingHeader}
                              onClick={() => setThinkingExpanded(prev => ({ ...prev, [message.id]: !prev[message.id] }))}
                            >
                              {expanded
                                ? <ChevronDown size={14} className={styles.thinkingChevron} />
                                : <ChevronRight size={14} className={styles.thinkingChevron} />}
                              <Sparkles size={14} className={styles.thinkingSpinner} />
                              <span className={styles.thinkingLabel}>
                                {t('chat.actionCard.reasoning') || 'Reasoning'}
                              </span>
                            </div>
                            {expanded && (
                              <div className={`${styles.thinkingContent} ${styles.thinkingContentReasoning}`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{reasoningText}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <div className={styles.messageText}>
                        {message.parts?.map((part, partIdx) => {
                          // reasoning parts already surfaced above
                          if (part.type === 'reasoning') return null;
                          if (part.type === 'text' && part.text) {
                            // Strip raw tool call syntax like "call: tool_name(...)" that the model sometimes outputs as text.
                            // Also strip <Action>...</Action>/<function_call>...</function_call> XML-style fake tool calls
                            // that Gemini 3.x preview models sometimes emit instead of using the function-calling protocol.
                            const cleanedText = part.text
                              .replace(/call:\s*\w+\([^)]*\)/gi, '')
                              .replace(/```tool[\s\S]*?```/gi, '')
                              .replace(/<\s*(?:action|function_call|tool_call|tool_use)\b[^>]*>[\s\S]*?<\s*\/\s*(?:action|function_call|tool_call|tool_use)\s*>/gi, '')
                              .replace(/<\s*(?:action|function_call|tool_call|tool_use)\b[^/>]*\/\s*>/gi, '')
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

                            // propose_action tool - render action card
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

                                  {/* Cluster context — auto-mapped from a wp_create_post action.
                                      Surfaces the matched cluster + any cannibalization preflight conflicts. */}
                                  {actionStatus?.clusterContext && (
                                    <div className={styles.clusterContextBox}>
                                      <div className={styles.clusterContextHeader}>
                                        <Network size={14} className={styles.clusterContextIcon} />
                                        <span className={styles.clusterContextLabel}>
                                          {t('chat.actionCard.cluster.label') || 'Cluster'}:
                                        </span>
                                        <span className={styles.clusterContextName}>
                                          {actionStatus.clusterContext.clusterName}
                                        </span>
                                        <span className={styles.clusterContextScore}>
                                          {Math.round((actionStatus.clusterContext.matchScore || 0) * 100)}%
                                        </span>
                                      </div>
                                      {actionStatus.clusterContext.preflight?.hasConflict && (
                                        <div className={styles.clusterContextWarning}>
                                          <AlertTriangle size={14} className={styles.clusterContextWarningIcon} />
                                          <div className={styles.clusterContextWarningBody}>
                                            <strong>
                                              {(t('chat.actionCard.cluster.warning') || '{n} potential conflict(s)')
                                                .replace(
                                                  '{n}',
                                                  String(actionStatus.clusterContext.preflight.conflicts?.length || 0),
                                                )}
                                            </strong>
                                            <ul className={styles.clusterContextConflicts}>
                                              {(actionStatus.clusterContext.preflight.conflicts || [])
                                                .slice(0, 3)
                                                .map((c, ci) => (
                                                  <li key={`${c.entityId}-${ci}`}>
                                                    <span className={styles.clusterContextConflictTitle}>
                                                      {c.entityTitle}
                                                    </span>
                                                    <span className={styles.clusterContextConflictScore}>
                                                      {Math.round((c.score || 0) * 100)}%
                                                    </span>
                                                  </li>
                                                ))}
                                            </ul>
                                          </div>
                                        </div>
                                      )}
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

                                  {/* Image prompt review + reference images - only for generate_image
                                      actions that are still pending approval. */}
                                  {currentStatus === 'PENDING_APPROVAL' && actionId && input.actions?.map((action, i) => {
                                    if (action.tool !== 'generate_image') return null;
                                    const overrideKey = `${actionId}:${i}`;
                                    const override = actionArgOverrides[overrideKey] || {};
                                    const promptValue = override.prompt ?? (action.args?.prompt || '');
                                    const refs = Array.isArray(override.referenceImages) ? override.referenceImages : [];
                                    const setOverride = (patch) => {
                                      setActionArgOverrides(prev => ({
                                        ...prev,
                                        [overrideKey]: { ...(prev[overrideKey] || {}), ...patch },
                                      }));
                                    };
                                    const handleFile = async (file, slot) => {
                                      if (!file) return;
                                      if (file.size > 4 * 1024 * 1024) {
                                        setToast({ message: t('chat.imagePrompt.tooLarge') || 'Image too large (max 4MB)', type: 'error' });
                                        return;
                                      }
                                      const base64 = await new Promise((resolve, reject) => {
                                        const reader = new FileReader();
                                        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
                                        reader.onerror = reject;
                                        reader.readAsDataURL(file);
                                      });
                                      const next = [...refs];
                                      next[slot] = { base64, mimeType: file.type || 'image/png', preview: URL.createObjectURL(file) };
                                      setOverride({ referenceImages: next.filter(Boolean).slice(0, 2) });
                                    };
                                    const removeRef = (slot) => {
                                      const next = refs.filter((_, idx) => idx !== slot);
                                      setOverride({ referenceImages: next });
                                    };
                                    return (
                                      <div key={`imgprompt-${i}`} className={styles.imagePromptPanel}>
                                        <div className={styles.imagePromptHeader}>
                                          <ImageIcon size={14} />
                                          <span>{t('chat.imagePrompt.title') || 'Review & edit the image prompt'}</span>
                                        </div>
                                        <div className={styles.imagePromptHint}>
                                          {t('chat.imagePrompt.hint') || 'Edit the prompt if you want, and attach up to 2 reference images the AI should use as inspiration.'}
                                        </div>
                                        <textarea
                                          className={styles.imagePromptTextarea}
                                          value={promptValue}
                                          onChange={(e) => setOverride({ prompt: e.target.value })}
                                          rows={4}
                                          placeholder={t('chat.imagePrompt.placeholder') || 'Describe the image in English…'}
                                        />
                                        <div className={styles.imagePromptRefs}>
                                          {[0, 1].map(slot => {
                                            const ref = refs[slot];
                                            return (
                                              <label key={slot} className={styles.imagePromptRefSlot}>
                                                {ref ? (
                                                  <>
                                                    <img src={ref.preview || `data:${ref.mimeType};base64,${ref.base64}`} alt="" className={styles.imagePromptRefPreview} />
                                                    <button
                                                      type="button"
                                                      className={styles.imagePromptRefRemove}
                                                      onClick={(e) => { e.preventDefault(); removeRef(slot); }}
                                                      aria-label="Remove"
                                                    >
                                                      <X size={12} />
                                                    </button>
                                                  </>
                                                ) : (
                                                  <>
                                                    <Paperclip size={14} />
                                                    <span>{t('chat.imagePrompt.attach') || 'Add reference'}</span>
                                                    <input
                                                      type="file"
                                                      accept="image/*"
                                                      style={{ display: 'none' }}
                                                      onChange={(e) => handleFile(e.target.files?.[0], slot)}
                                                    />
                                                  </>
                                                )}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Timer */}
                                  {currentStatus === 'PENDING_APPROVAL' && remainingSeconds != null && (
                                    <div className={`${styles.actionTimer} ${remainingSeconds < 120 ? styles.actionTimerWarning : ''}`}>
                                      <Timer size={14} />
                                      <span>{formatRemainingTime(remainingSeconds)}</span>
                                    </div>
                                  )}

                                  {/* Buttons */}
                                  <div className={styles.actionCardButtons}>
                                    {currentStatus === 'PENDING_APPROVAL' && actionId && (() => {
                                      const isPending = inFlightActions.has(actionId);
                                      return (
                                        <>
                                          <button
                                            className={`${styles.actionBtn} ${styles.actionBtnApprove}`}
                                            onClick={() => handleApproveAction(actionId)}
                                            disabled={isPending}
                                            aria-busy={isPending}
                                          >
                                            {isPending ? (
                                              <Loader2 size={14} className={styles.spinning} />
                                            ) : (
                                              <CheckCircle size={14} />
                                            )}
                                            <span>{t('chat.actionCard.approve') || 'Approve'}</span>
                                          </button>
                                          <button
                                            className={`${styles.actionBtn} ${styles.actionBtnReject}`}
                                            onClick={() => handleRejectAction(actionId)}
                                            disabled={isPending}
                                            aria-busy={isPending}
                                          >
                                            <XCircle size={14} />
                                            <span>{t('chat.actionCard.reject') || 'Reject'}</span>
                                          </button>
                                        </>
                                      );
                                    })()}
                                    {currentStatus === 'EXECUTING' && (
                                      <ExecutingProgress
                                        tool={input?.actions?.[0]?.tool}
                                        startedAt={actionStatus.approvedAt ? new Date(actionStatus.approvedAt).getTime() : undefined}
                                      />
                                    )}
                                    {(currentStatus === 'COMPLETED' || currentStatus === 'FAILED') && actionId && (() => {
                                      const isPending = inFlightActions.has(actionId);
                                      return (
                                        <button
                                          className={`${styles.actionBtn} ${styles.actionBtnRollback}`}
                                          onClick={() => handleRollbackAction(actionId)}
                                          disabled={isPending}
                                          aria-busy={isPending}
                                          title={t('chat.actionCard.rollbackHint') || 'Changed your mind? You can undo this action.'}
                                        >
                                          {isPending ? (
                                            <Loader2 size={14} className={styles.spinning} />
                                          ) : (
                                            <RotateCcw size={14} />
                                          )}
                                          <span>{t('chat.actionCard.rollback') || 'Rollback'}</span>
                                        </button>
                                      );
                                    })()}
                                    {/* Try again - only on FAILED. Clones the plan into a fresh
                                        PENDING_APPROVAL action so the user can re-approve and rerun. */}
                                    {currentStatus === 'FAILED' && actionId && (() => {
                                      const isPending = inFlightActions.has(actionId);
                                      return (
                                        <button
                                          className={`${styles.actionBtn} ${styles.actionBtnRetry}`}
                                          onClick={() => handleRetryAction(actionId)}
                                          disabled={isPending}
                                          aria-busy={isPending}
                                          title={t('chat.actionCard.retryHint') || 'Try the same plan again - opens a new approval card.'}
                                        >
                                          {isPending ? (
                                            <Loader2 size={14} className={styles.spinning} />
                                          ) : (
                                            <RotateCcw size={14} />
                                          )}
                                          <span>{t('chat.actionCard.retry') || 'Try again'}</span>
                                        </button>
                                      );
                                    })()}
                                  </div>
                                  {currentStatus === 'COMPLETED' && actionId && (
                                    <div className={styles.rollbackHint}>
                                      <RotateCcw size={12} />
                                      <span>{t('chat.actionCard.rollbackHint') || 'Changed your mind? You can undo this action any time using the Rollback button above.'}</span>
                                    </div>
                                  )}
                                  {currentStatus === 'FAILED' && actionStatus.error && (
                                    <div className={styles.actionErrorBox}>
                                      <AlertTriangle size={14} className={styles.actionErrorIcon} />
                                      <div>
                                        <div className={styles.actionErrorTitle}>
                                          {t('chat.actionCard.whatWentWrong') || 'What went wrong'}
                                        </div>
                                        <div className={styles.actionErrorDetail}>{actionStatus.error}</div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            // Other tool invocations - show loading or hide result
                            if (toolState === 'input-streaming' || toolState === 'input-available') {
                              return (
                                <div key={partIdx} className={styles.toolLoading}>
                                  <Loader2 size={14} className={styles.spinning} />
                                  <span>{t('chat.actionCard.fetchingData') || 'Fetching data'}{toolName ? ` (${translateToolName(toolName)})` : ''}...</span>
                                </div>
                              );
                            }

                            // Tool completed (output-available, output-error) - don't render (the AI will summarize)
                            return null;
                          }

                          return null;
                        })}
                      </div>
                    </div>
                  )}

                  {/* User Message */}
                  {message.role === 'user' && (() => {
                    const attachedSel = selectionsByMessageId[message.id];
                    const messageText = message.parts?.filter(p => p.type === 'text').map(p => p.text).join('') || '';
                    const isEditing = editingMessageId === message.id;

                    const startEditing = () => {
                      setEditingMessageId(message.id);
                      setEditingText(messageText);
                      setTimeout(() => {
                        const el = editTextareaRef.current;
                        if (el) {
                          el.focus();
                          el.setSelectionRange(el.value.length, el.value.length);
                          el.style.height = 'auto';
                          el.style.height = `${el.scrollHeight}px`;
                        }
                      }, 0);
                    };
                    const cancelEditing = () => {
                      setEditingMessageId(null);
                      setEditingText('');
                    };
                    const saveEditing = () => {
                      const next = (editingText || '').trim();
                      setEditingMessageId(null);
                      setEditingText('');
                      if (!next || isAiLoading) return;
                      if (next === messageText) return;
                      handleSend(null, next);
                    };

                    return (
                      <div className={styles.userMessageWrapper}>
                        {attachedSel && (
                          <div className={styles.userMessageSelection}>
                            {attachedSel.screenshot ? (
                              <img
                                src={attachedSel.screenshot}
                                alt=""
                                className={styles.userMessageSelectionThumb}
                              />
                            ) : (
                              <MousePointerClick size={14} />
                            )}
                            <span className={styles.selectionTag}>&lt;{attachedSel.tag}&gt;</span>
                            <span className={styles.selectionText}>
                              {(attachedSel.text || '').substring(0, 60) || (t('chat.preview.emptyText') || '(empty)')}
                              {(attachedSel.text || '').length > 60 ? '…' : ''}
                            </span>
                          </div>
                        )}
                        {isEditing ? (
                          <div className={`${styles.userMessage} ${styles.userMessageEditing}`}>
                            <textarea
                              ref={editTextareaRef}
                              className={styles.userMessageEditTextarea}
                              value={editingText}
                              onChange={(e) => {
                                setEditingText(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelEditing();
                                } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                  e.preventDefault();
                                  saveEditing();
                                }
                              }}
                              rows={1}
                            />
                            <div className={styles.userMessageEditFooter}>
                              <button
                                type="button"
                                className={`${styles.userMessageActionBtn} ${styles.userMessageActionBtnGhost}`}
                                onClick={cancelEditing}
                              >
                                {t('chat.cancel') || 'Cancel'}
                              </button>
                              <button
                                type="button"
                                className={`${styles.userMessageActionBtn} ${styles.userMessageActionBtnPrimary}`}
                                onClick={saveEditing}
                                disabled={isAiLoading || !editingText.trim() || editingText.trim() === messageText}
                              >
                                {t('chat.sendEdited') || 'Send'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.userMessage}>
                            <p className={styles.messageText}>
                              {messageText}
                            </p>
                          </div>
                        )}
                        {!isEditing && (
                          <div className={styles.userMessageActions}>
                            <button
                              type="button"
                              className={styles.userMessageActionBtn}
                              onClick={startEditing}
                              title={t('chat.editMessage') || 'Edit'}
                              aria-label={t('chat.editMessage') || 'Edit'}
                              disabled={isAiLoading}
                            >
                              <Edit2 size={13} />
                              <span>{t('chat.editMessage') || 'Edit'}</span>
                            </button>
                            <button
                              type="button"
                              className={styles.userMessageActionBtn}
                              onClick={async () => {
                                if (!messageText || isAiLoading) return;
                                const convId = activeConversationIdRef.current;
                                const idx = aiMessages.findIndex(m => m.id === message.id);
                                if (convId) {
                                  try {
                                    await fetch(`/api/chat/conversations/${convId}/messages`, {
                                      method: 'DELETE',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        fromMessageId: message.id,
                                        fromContent: messageText,
                                        fromRole: 'USER',
                                      }),
                                    });
                                  } catch (err) {
                                    console.warn('[Chat] Resend: DB truncate failed', err);
                                  }
                                }
                                if (idx >= 0) {
                                  setAiMessages(prev => prev.slice(0, idx));
                                }
                                handleSend(null, messageText);
                              }}
                              title={t('chat.resendMessage') || 'Resend'}
                              aria-label={t('chat.resendMessage') || 'Resend'}
                              disabled={isAiLoading || !messageText}
                            >
                              <RotateCcw size={13} />
                              <span>{t('chat.resendMessage') || 'Resend'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
                      {thinkingExpanded._loading
                        ? <ChevronDown size={14} className={styles.thinkingChevron} />
                        : <ChevronRight size={14} className={styles.thinkingChevron} />}
                      <Loader2 size={14} className={`${styles.thinkingSpinner} ${styles.spinning}`} />
                      <span className={styles.thinkingLabel}>
                        {t('chat.actionCard.thinking') || 'Thinking'}
                        <span className={styles.thinkingDots}>
                          <span></span><span></span><span></span>
                        </span>
                      </span>
                    </div>
                    {thinkingExpanded._loading && (() => {
                      // Collect reasoning + tool parts from the latest streaming assistant message
                      const lastAssistant = [...(aiMessages || [])].reverse().find(m => m.role === 'assistant');
                      const reasoningText = (lastAssistant?.parts || [])
                        .filter(p => p.type === 'reasoning' && p.text)
                        .map(p => p.text)
                        .join('\n\n')
                        .trim();
                      const toolParts = lastAssistant?.parts?.filter(p => {
                        const isTool = p.type?.startsWith('tool-') || p.type === 'dynamic-tool';
                        if (!isTool) return false;
                        const tn = p.type === 'dynamic-tool' ? p.toolName : p.type.replace(/^tool-/, '');
                        return tn !== 'propose_action';
                      }) || [];
                      if (!reasoningText && toolParts.length === 0) {
                        return (
                          <div className={styles.thinkingContent}>
                            <span>{t('chat.actionCard.analyzing') || 'Analyzing your request...'}</span>
                          </div>
                        );
                      }
                      return (
                        <div className={`${styles.thinkingContent} ${reasoningText ? styles.thinkingContentReasoning : ''}`}>
                          {reasoningText && (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{reasoningText}</ReactMarkdown>
                          )}
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
                                <span>{translateToolName(tn)}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* AI-GCoins over-limit banner. Pops as soon as the popup opens
              if the account is already over its monthly Ai-GCoins budget,
              so the user understands BEFORE typing a message that the chat
              is paused. The "Upgrade" button opens the same global limit
              modal that AddSiteModal / Entities / SmartActionButton use. */}
          {isOverAiCreditsLimit && (
            <div className={styles.creditLimitBanner} role="alert">
              <div className={styles.creditLimitBannerIcon}>
                <AlertTriangle size={16} />
              </div>
              <div className={styles.creditLimitBannerBody}>
                <div className={styles.creditLimitBannerTitle}>
                  {t('chat.aiCredits.overLimitTitle') || 'AI-GCoins limit reached'}
                </div>
                <div className={styles.creditLimitBannerSubtitle}>
                  {t('chat.aiCredits.overLimitSubtitle')
                    || `You've used ${aiCreditsUsage?.used ?? '?'} of ${aiCreditsUsage?.limit ?? '?'} credits this period. Upgrade your plan or buy more credits to keep using the assistant.`}
                </div>
              </div>
              <button
                type="button"
                className={styles.creditLimitBannerBtn}
                onClick={openAiCreditsLimitModal}
              >
                {t('chat.aiCredits.upgradeBtn') || 'Upgrade plan'}
              </button>
            </div>
          )}

          {/* Input Area */}
          <form id="ghost-chat-form" onSubmit={handleSend} className={`${styles.inputArea} ${previewOpen ? styles.inputAreaCompact : ''}`}>
            <div className={`${styles.inputWrapper} ${previewOpen ? styles.inputWrapperCompact : ''}`}>
              <textarea
                ref={messageInputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder={isOverAiCreditsLimit
                  ? (t('chat.aiCredits.inputPlaceholderBlocked') || 'Upgrade your plan to keep chatting…')
                  : t('chat.inputPlaceholder')}
                className={styles.messageInput}
                disabled={isAiLoading || isOverAiCreditsLimit}
              />
              {previewOpen ? (
                <div className={styles.inputActions} ref={inputActionsRef}>
                  <button
                    type="button"
                    className={`${styles.inputActionBtn} ${inputActionsOpen ? styles.inputActionBtnActive : ''}`}
                    onClick={() => setInputActionsOpen(v => !v)}
                    aria-haspopup="menu"
                    aria-expanded={inputActionsOpen}
                    title={t('chat.inputActions.more') || 'More actions'}
                  >
                    <Plus size={16} />
                  </button>
                  {inputActionsOpen && (
                    <div className={styles.inputActionsDropup} role="menu">
                      <button type="button" className={styles.inputActionsDropupItem} onClick={() => setInputActionsOpen(false)}>
                        <ImageIcon size={16} />
                        <span>{t('chat.inputActions.image') || 'Image'}</span>
                      </button>
                      <button type="button" className={styles.inputActionsDropupItem} onClick={() => setInputActionsOpen(false)}>
                        <Paperclip size={16} />
                        <span>{t('chat.inputActions.file') || 'File'}</span>
                      </button>
                      <button type="button" className={styles.inputActionsDropupItem} onClick={() => setInputActionsOpen(false)}>
                        <Mic size={16} />
                        <span>{t('chat.inputActions.voice') || 'Voice'}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
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
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isAiLoading || isOverAiCreditsLimit}
              title={isOverAiCreditsLimit
                ? (t('chat.aiCredits.sendBlockedTitle') || 'Send is paused while your account is over its AI-GCoins limit.')
                : undefined}
              className={`${styles.sendButton} ${previewOpen ? styles.sendButtonCompact : ''}`}
            >
              {isAiLoading ? (
                <Loader2 size={previewOpen ? 14 : 20} className={styles.spinning} />
              ) : (
                <Send size={previewOpen ? 14 : 20} />
              )}
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

        {/* Right Sidebar - Preview panel when open, Quick Actions otherwise */}
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
                  disabled={previewBridgeTimedOut && !previewReady}
                >
                  <MousePointerClick size={15} />
                </button>
                {previewBridgeTimedOut && !previewReady && (
                  <span
                    className={styles.previewStatusWarn}
                    title={
                      t('chat.preview.error.bridgeMissing') ||
                      "Preview loaded, but the GhostSEO Connector bridge didn't respond. Make sure the plugin is installed and updated to the latest version."
                    }
                  >
                    <AlertTriangle size={12} />
                    <span>{t('chat.preview.inspectorUnavailable') || 'Inspector unavailable'}</span>
                  </span>
                )}
              </div>
              <div className={styles.previewToolbarCenter}>
                <button
                  type="button"
                  ref={urlPillRef}
                  className={`${styles.previewUrlPill} ${pagesDropdownOpen ? styles.previewUrlPillActive : ''}`}
                  onClick={() => setPagesDropdownOpen(v => !v)}
                  title={t('chat.preview.pages.title') || 'Pages & posts'}
                >
                  <span className={styles.previewUrlPillText}>{(() => {
                    const path = currentPreviewUrl || '/';
                    if (path === '/' || path === '') return t('chat.preview.pages.homepage') || 'Homepage';
                    const list = pagesList || [];
                    const pathNoQuery = path.split('?')[0];
                    const match = list.find(p => p.path === path)
                      || list.find(p => p.path === pathNoQuery)
                      || list.find(p => p.path.split('?')[0] === pathNoQuery);
                    if (match?.title) return match.title;
                    // Fallback to slug (last non-empty path segment)
                    const segments = decodeURIComponent(pathNoQuery).split('/').filter(Boolean);
                    return segments[segments.length - 1] || path;
                  })()}</span>
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
                            <span className={styles.pagesDropdownItemPath}>{decodeURIComponent(p.path)}</span>
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
                className={`${styles.previewIframeFrame} ${deviceWidth !== 'full' ? styles.previewIframeFrameFixed : ''}`}
                style={deviceWidth === 'full' ? undefined : { width: `${deviceWidth}px` }}
              >
                {previewIframeSrc ? (
                  <iframe
                    ref={iframeRef}
                    src={previewIframeSrc}
                    className={`${styles.previewIframe} ${previewLoading ? styles.previewIframeLoading : ''}`}
                    title="Site preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    onLoad={() => setPreviewLoading(false)}
                  />
                ) : (
                  <div className={styles.previewIframePlaceholder}>
                    <Loader2 size={20} className={styles.spinning} />
                    <span>{t('chat.preview.loading') || 'Loading preview…'}</span>
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
