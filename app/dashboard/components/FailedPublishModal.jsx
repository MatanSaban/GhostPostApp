'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, RefreshCw, FileText, ExternalLink, Loader2 } from 'lucide-react';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import { Button } from '@/app/dashboard/components';
import styles from './FailedPublishModal.module.css';

/**
 * Parse common WordPress error codes into human-readable messages
 */
function parseErrorMessage(errorMessage, commonErrors) {
  if (!errorMessage) return null;
  
  // Check for known error patterns
  if (errorMessage.includes('rest_no_route')) {
    return commonErrors?.rest_no_route || 'The GhostSEO plugin endpoint was not found.';
  }
  if (errorMessage.includes('connection_refused') || errorMessage.includes('ECONNREFUSED')) {
    return commonErrors?.connection_refused || 'Could not connect to your WordPress site.';
  }
  if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
    return commonErrors?.timeout || 'The request timed out.';
  }
  if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
    return commonErrors?.unauthorized || 'Authentication failed.';
  }
  
  // Return original message if no pattern matches
  return errorMessage;
}

export default function FailedPublishModal({ data, translations, onClose, onRetrySuccess }) {
  const { isMaximized, toggleMaximize } = useModalResize();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);
  const [retrySuccess, setRetrySuccess] = useState(false);
  
  const t = translations || {};
  const aiResult = data?.aiResult || {};
  
  // Don't render if no data
  if (!data) return null;
  
  const handleRetry = async () => {
    if (!data.contentId) return;
    
    setRetrying(true);
    setRetryError(null);
    
    try {
      // Determine which phase failed based on whether aiResult exists
      // If aiResult exists → failed during publish → retry publish
      // If no aiResult → failed during processing → retry processing
      const hasAiResult = aiResult && (aiResult.html || aiResult.title);
      
      const retryData = hasAiResult 
        ? {
            status: 'READY_TO_PUBLISH',
            publishAttempts: 0,
            errorMessage: null,
          }
        : {
            status: 'SCHEDULED',
            processingAttempts: 0,
            errorMessage: null,
          };

      const res = await fetch(`/api/contents/${data.contentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retryData),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reset content status');
      }
      
      setRetrySuccess(true);
      onRetrySuccess?.();
      
      // Close modal after short delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setRetryError(err.message);
    } finally {
      setRetrying(false);
    }
  };
  
  const friendlyError = parseErrorMessage(data.errorMessage, t.commonErrors);

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${isMaximized ? 'modal-maximized' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <AlertTriangle size={20} className={styles.warningIcon} />
            <h2 className={styles.title}>{t.title || 'Publishing Failed'}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <ModalResizeButton isMaximized={isMaximized} onToggle={toggleMaximize} className={styles.closeBtn} />
            <button className={styles.closeBtn} onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>
        
        {/* Body */}
        <div className={styles.body}>
          <p className={styles.subtitle}>{t.subtitle || 'The following content could not be published to your website'}</p>
          
          {/* Error Section */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <AlertTriangle size={16} />
              {t.errorLabel || 'Error Details'}
            </h3>
            <div className={styles.errorBox}>
              {friendlyError}
            </div>
          </div>
          
          {/* Post Data Section */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <FileText size={16} />
              {t.postDataLabel || 'Post Data'}
            </h3>
            <div className={styles.dataGrid}>
              <div className={styles.dataRow}>
                <span className={styles.dataLabel}>{t.titleLabel || 'Title'}:</span>
                <span className={styles.dataValue}>{aiResult.title || data.contentTitle || '-'}</span>
              </div>
              {aiResult.excerpt && (
                <div className={styles.dataRow}>
                  <span className={styles.dataLabel}>{t.excerptLabel || 'Excerpt'}:</span>
                  <span className={styles.dataValue}>{aiResult.excerpt}</span>
                </div>
              )}
              {aiResult.metaTitle && (
                <div className={styles.dataRow}>
                  <span className={styles.dataLabel}>{t.metaTitleLabel || 'Meta Title'}:</span>
                  <span className={styles.dataValue}>{aiResult.metaTitle}</span>
                </div>
              )}
              {aiResult.metaDescription && (
                <div className={styles.dataRow}>
                  <span className={styles.dataLabel}>{t.metaDescriptionLabel || 'Meta Description'}:</span>
                  <span className={styles.dataValue}>{aiResult.metaDescription}</span>
                </div>
              )}
              {aiResult.wordCount && (
                <div className={styles.dataRow}>
                  <span className={styles.dataLabel}>{t.wordCountLabel || 'Word Count'}:</span>
                  <span className={styles.dataValue}>{aiResult.wordCount}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Content Preview */}
          {aiResult.html && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>
                <FileText size={16} />
                {t.contentPreviewLabel || 'Content Preview'}
              </h3>
              <div 
                className={styles.contentPreview}
                dangerouslySetInnerHTML={{ __html: aiResult.html }}
              />
            </div>
          )}
          
          {/* WP Not Connected Warning */}
          {!data.isConnected && (
            <div className={styles.warningBox}>
              <AlertTriangle size={16} />
              <span>{t.wpNotConnected || 'WordPress plugin is not connected.'}</span>
            </div>
          )}
          
          {/* Retry Error */}
          {retryError && (
            <div className={styles.errorBox}>
              {retryError}
            </div>
          )}
          
          {/* Retry Success */}
          {retrySuccess && (
            <div className={styles.successBox}>
              {t.retryQueued || 'Content queued for retry. It will be published on the next pipeline run.'}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className={styles.footer}>
          <Button onClick={onClose}>
            {t.close || 'Close'}
          </Button>
          {data.isConnected && !retrySuccess && (
            <Button 
              variant="primary" 
              onClick={handleRetry}
              disabled={retrying}
            >
              {retrying ? (
                <>
                  <Loader2 size={16} className={styles.spinner} />
                  {t.retrying || 'Retrying...'}
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  {t.retryPublish || 'Retry Publishing'}
                </>
              )}
            </Button>
          )}
          {!data.isConnected && (
            <a 
              href="/dashboard/settings?tab=general"
              className={styles.primaryBtn}
              onClick={onClose}
            >
              <ExternalLink size={16} />
              {t.connectWordPress || 'Connect WordPress'}
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
