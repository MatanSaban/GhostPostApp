'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  MousePointerClick,
  Eye,
  EyeOff,
  RotateCcw,
  ExternalLink,
  Send,
  Loader2,
  ArrowLeft,
  X,
} from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import ReactMarkdown from 'react-markdown';
import { useSite } from '@/app/context/site-context';
import { useUser } from '@/app/context/user-context';
import { useLocale } from '@/app/context/locale-context';
import {
  normaliseSiteUrl,
  usePreviewBridge,
} from '@/app/hooks/usePreviewBridge';
import styles from './visual-editor.module.css';

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function VisualEditorPage() {
  const { selectedSite } = useSite();
  const { user } = useUser();
  const { t, isRtl } = useLocale();

  /* ---- iframe + bridge ---- */
  const iframeRef = useRef(null);
  const {
    iframeReady,
    currentPreviewUrl,
    selectedElement,
    hoveredElement,
    inspectorEnabled,
    iframeSrc,
    toggleInspector,
    resetPreviews,
    clearSelection,
  } = usePreviewBridge({ siteUrl: selectedSite?.url, siteId: selectedSite?.id, iframeRef });

  /* ---- chat state ---- */
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const messagesEndRef = useRef(null);
  const siteIdRef = useRef(selectedSite?.id);
  const conversationIdRef = useRef(null);

  /* keep refs in sync */
  useEffect(() => { siteIdRef.current = selectedSite?.id; }, [selectedSite?.id]);
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);

  /* ---- AI SDK chat ---- */
  const {
    messages: aiMessages,
    sendMessage,
    status,
    setMessages: setAiMessages,
  } = useChat({
    api: '/api/chat',
    onError: (err) => console.error('[VisualEditor] chat error:', err),
  });

  const isAiLoading = status === 'submitted' || status === 'streaming';

  /* ---- auto-scroll ---- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  /* ---------------------------------------------------------------- */
  /*  Chat send                                                       */
  /* ---------------------------------------------------------------- */
  const handleSend = useCallback(async (e) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || isAiLoading) return;

    setInput('');

    // Build context prefix if an element is selected
    let messageText = text;
    if (selectedElement) {
      const ctx = `[Targeting: <${selectedElement.tag}> "${selectedElement.text?.substring(0, 80)}" — selector: ${selectedElement.selector}]\n\n`;
      messageText = ctx + text;
    }

    // Create conversation if needed
    let convId = conversationIdRef.current;
    if (!convId) {
      try {
        const res = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: siteIdRef.current, title: 'Visual Editor' }),
        });
        const data = await res.json();
        convId = data.id;
        setConversationId(convId);
        conversationIdRef.current = convId;
      } catch (err) {
        console.error('[VisualEditor] create conversation failed:', err);
        return;
      }
    }

    sendMessage(
      { text: messageText },
      { body: { conversationId: convId, siteId: siteIdRef.current } },
    );
  }, [input, isAiLoading, selectedElement, sendMessage]);

  /* ---------------------------------------------------------------- */
  /*  Render guards                                                   */
  /* ---------------------------------------------------------------- */
  if (!selectedSite) {
    return (
      <div className={styles.emptyState}>
        <p>Select a site to use the Visual Editor.</p>
      </div>
    );
  }

  if (selectedSite.platform !== 'wordpress' || !selectedSite.siteKey) {
    return (
      <div className={styles.emptyState}>
        <p>Visual Editor requires a connected WordPress site with the Ghost Post plugin.</p>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  JSX                                                             */
  /* ---------------------------------------------------------------- */
  return (
    <div className={styles.container} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ---- Toolbar ---- */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button className={styles.toolbarBtn} onClick={() => setChatOpen(!chatOpen)} title={chatOpen ? 'Hide chat' : 'Show chat'}>
            {chatOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <span className={styles.toolbarDivider} />
          <button
            className={`${styles.toolbarBtn} ${inspectorEnabled ? styles.toolbarBtnActive : ''}`}
            onClick={toggleInspector}
            title={inspectorEnabled ? 'Disable inspector' : 'Enable inspector'}
          >
            <MousePointerClick size={18} />
          </button>
          <button className={styles.toolbarBtn} onClick={resetPreviews} title="Reset previews">
            <RotateCcw size={18} />
          </button>
        </div>

        <div className={styles.toolbarCenter}>
          <span className={styles.urlDisplay}>{currentPreviewUrl}</span>
        </div>

        <div className={styles.toolbarRight}>
          {!iframeReady && <Loader2 size={16} className={styles.spinner} />}
          {iframeReady && <span className={styles.readyDot} />}
          <a
            href={normaliseSiteUrl(selectedSite.url)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.toolbarBtn}
            title="Open site in new tab"
          >
            <ExternalLink size={18} />
          </a>
        </div>
      </div>

      {/* ---- Main split ---- */}
      <div className={styles.splitContainer}>
        {/* ---- Chat panel ---- */}
        {chatOpen && (
          <div className={styles.chatPanel}>
            {/* Selected element badge */}
            {selectedElement && (
              <div className={styles.selectionBadge}>
                <MousePointerClick size={14} />
                <span className={styles.selectionTag}>&lt;{selectedElement.tag}&gt;</span>
                <span className={styles.selectionText}>
                  {selectedElement.text?.substring(0, 60) || '(empty)'}
                  {selectedElement.text?.length > 60 ? '…' : ''}
                </span>
                <button className={styles.selectionClear} onClick={clearSelection}><X size={14} /></button>
              </div>
            )}

            {/* Messages */}
            <div className={styles.messages}>
              {aiMessages.length === 0 && (
                <div className={styles.welcomeMessage}>
                  <h3>Visual AI Editor</h3>
                  <p>Click on any element in the preview to target it, then describe your changes.</p>
                </div>
              )}
              {aiMessages.map((msg) => (
                <div key={msg.id} className={`${styles.message} ${styles[msg.role]}`}>
                  <div className={styles.messageBubble}>
                    {msg.parts ? (
                      msg.parts
                        .filter((p) => p.type === 'text')
                        .map((p, i) => (
                          <ReactMarkdown key={i}>{p.text}</ReactMarkdown>
                        ))
                    ) : (
                      <ReactMarkdown>{typeof msg.content === 'string' ? msg.content : ''}</ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className={`${styles.message} ${styles.assistant}`}>
                  <div className={styles.messageBubble}>
                    <Loader2 size={16} className={styles.spinner} /> Thinking…
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form className={styles.inputBar} onSubmit={handleSend}>
              <input
                type="text"
                className={styles.chatInput}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={selectedElement ? `Describe changes for <${selectedElement.tag}>…` : 'Ask the AI editor…'}
                disabled={isAiLoading}
              />
              <button type="submit" className={styles.sendBtn} disabled={isAiLoading || !input.trim()}>
                {isAiLoading ? <Loader2 size={18} className={styles.spinner} /> : <Send size={18} />}
              </button>
            </form>
          </div>
        )}

        {/* ---- Iframe preview ---- */}
        <div className={styles.previewPanel}>
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className={styles.previewIframe}
            title="Site Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
          {/* Hover tooltip */}
          {hoveredElement && inspectorEnabled && (
            <div className={styles.hoverTooltip}>
              <span className={styles.hoverTag}>&lt;{hoveredElement.tag}&gt;</span>
              <span className={styles.hoverText}>{hoveredElement.text?.substring(0, 40)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
