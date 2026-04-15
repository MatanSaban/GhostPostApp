'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Crown, FileText, ArrowRight, ChevronDown, ChevronUp,
  Loader2, CheckCircle, AlertCircle, ExternalLink, Sparkles, Zap,
  Clock, Shield, Monitor, Wrench,
} from 'lucide-react';
import styles from './DifferentiationModal.module.css';

const CREDITS_PER_PAGE = 25;

/**
 * Surgical Diff Modal for the Content Differentiation Engine.
 * 
 * States:
 * - Confirm: Pre-confirmation step explaining the process
 * - Processing: Shows progress bar + current message
 * - Completed: Shows Alpha Page box, supporting page diffs (tabs/accordions), action buttons  
 * - Failed: Shows error with retry option
 * 
 * @param {{ open, onClose, job, onExecute, isExecuting, translations, confirmData, onConfirmStart }} props
 */
export default function DifferentiationModal({ open, onClose, job, onExecute, isExecuting, translations, confirmData, onConfirmStart }) {
  const [expandedPage, setExpandedPage] = useState(null);
  const tt = translations?.agent?.differentiation?.modal || {};
  const tc = translations?.agent?.differentiation?.confirm || {};

  // Whether we're in the pre-confirmation phase
  const isConfirmPhase = !!confirmData && !job;

  // Calculate page count for confirmation
  const confirmPageCount = (() => {
    if (!confirmData) return 0;
    const issueIndex = confirmData.itemIndices?.[0] ?? 0;
    const issue = confirmData.insight?.data?.issues?.[issueIndex];
    return issue?.urls?.filter(Boolean)?.length || 0;
  })();
  const supportingCount = Math.max(0, confirmPageCount - 1); // minus alpha page
  const analysisCost = supportingCount * CREDITS_PER_PAGE;

  // Auto-expand first page when completed
  useEffect(() => {
    if (job?.status === 'COMPLETED' && job?.resultData?.supportingPages?.length > 0) {
      const firstSuccess = job.resultData.supportingPages.find(p => !p.error);
      if (firstSuccess) setExpandedPage(firstSuccess.pageId);
    }
  }, [job?.status, job?.resultData?.supportingPages]);

  if (!open) return null;

  const isProcessing = job?.status === 'PENDING' || job?.status === 'PROCESSING';
  const isCompleted = job?.status === 'COMPLETED';
  const isFailed = job?.status === 'FAILED';
  const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  const resultData = job?.resultData;
  const alphaPage = resultData?.alphaPage;
  const supportingPages = resultData?.supportingPages || [];
  const summary = resultData?.summary;
  const alreadyExecuted = !!resultData?.executionResult;

  const togglePage = (pageId) => {
    setExpandedPage(prev => prev === pageId ? null : pageId);
  };

  const handleClose = () => {
    onClose();
  };

  // Helper for template strings
  const tpl = (str, vars) => {
    if (!str) return '';
    return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), str);
  };

  return createPortal(
    <div className={styles.overlay} onClick={handleClose}>
      <div
        className={styles.modal}
        onClick={e => e.stopPropagation()}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* ─── Header ──────────────────────────────────────────── */}
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.headerTitle}>
              <Sparkles size={20} className={styles.sparkleIcon} />
              <h2 className={styles.title}>
                {isConfirmPhase && (tc.title || 'Content Differentiation')}
                {isProcessing && (tt.processingTitle || 'Content Differentiation in Progress')}
                {isCompleted && (tt.completedTitle || 'Content Differentiation Strategy Ready')}
                {isFailed && (tt.failedTitle || 'Differentiation Failed')}
              </h2>
            </div>
            <button className={styles.closeBtn} onClick={handleClose} aria-label={tt.closeButton || 'Close'}>
              <X size={18} />
            </button>
          </div>
          {isConfirmPhase && (
            <p className={styles.subtitle}>{tc.subtitle || 'AI-powered content differentiation for competing pages'}</p>
          )}
          {isCompleted && summary && (
            <p className={styles.subtitle}>
              {tpl(tt.successSummary || '{success} of {total} supporting pages differentiated', {
                success: summary.successfulDiffs,
                total: summary.totalPages - 1,
              })}
              {summary.failedDiffs > 0 && ` ${tpl(tt.failedSuffix || '({failed} failed)', { failed: summary.failedDiffs })}`}
            </p>
          )}
        </div>

        {/* ─── Body ────────────────────────────────────────────── */}
        <div className={styles.body}>
          {/* Confirmation Phase */}
          {isConfirmPhase && (
            <div className={styles.confirmPhase}>
              <p className={styles.confirmDescription}>
                {tc.description || 'Our AI will analyze your competing pages and create a unique content strategy for each one, so they stop cannibalizing each other in search results.'}
              </p>

              <h4 className={styles.confirmSectionTitle}>{tc.whatHappens || 'What will happen?'}</h4>
              <ol className={styles.confirmSteps}>
                <li>{tc.step1 || 'AI identifies your strongest page (Alpha Page) based on traffic, backlinks, and content quality'}</li>
                <li>{tc.step2 || 'Each supporting page gets a new, unique search intent and differentiated content'}</li>
                <li>{tc.step3 || 'H1 tags and key paragraphs are rewritten to target different angles of the topic'}</li>
                <li>{tc.step4 || 'Internal links are added from supporting pages to the Alpha Page'}</li>
              </ol>

              <div className={styles.confirmDetails}>
                <div className={styles.confirmDetail}>
                  <div className={styles.confirmDetailIcon}><Zap size={18} /></div>
                  <div className={styles.confirmDetailText}>
                    <strong>{tc.creditsCost || 'Credits Cost'}</strong>
                    <span>{tpl(tc.creditsExplanation || 'This process costs {creditsPerPage} AI credits per supporting page. For {pageCount} competing pages, the analysis will cost {analysisCost} credits. Execution costs will be shown before approval.', {
                      creditsPerPage: CREDITS_PER_PAGE,
                      pageCount: confirmPageCount,
                      analysisCost: analysisCost,
                    })}</span>
                  </div>
                </div>

                <div className={styles.confirmDetail}>
                  <div className={styles.confirmDetailIcon}><Clock size={18} /></div>
                  <div className={styles.confirmDetailText}>
                    <strong>{tc.estimatedTime || 'Estimated Time'}</strong>
                    <span>{tc.timeExplanation || 'The AI analysis typically takes 1-3 minutes depending on content length. You can navigate away — the process runs in the background and you\'ll be notified when it\'s ready.'}</span>
                  </div>
                </div>

                <div className={styles.confirmDetail}>
                  <div className={styles.confirmDetailIcon}><Monitor size={18} /></div>
                  <div className={styles.confirmDetailText}>
                    <strong>{tc.whileRunning || 'While Running'}</strong>
                    <span>{tc.whileRunningExplanation || 'You can continue using the platform normally. The analysis runs in the background. A notification will appear when the strategy is ready for your review.'}</span>
                  </div>
                </div>

                <div className={styles.confirmDetail}>
                  <div className={styles.confirmDetailIcon}><Shield size={18} /></div>
                  <div className={styles.confirmDetailText}>
                    <strong>{tc.reviewBefore || 'Review Before Applying'}</strong>
                    <span>{tc.reviewExplanation || 'No changes are made to your site until you review and approve them. You\'ll see a detailed preview of every proposed change before anything is executed.'}</span>
                  </div>
                </div>

                <div className={styles.confirmDetail}>
                  <div className={styles.confirmDetailIcon}><Wrench size={18} /></div>
                  <div className={styles.confirmDetailText}>
                    <strong>{tc.requirements || 'Requirements'}</strong>
                    <span>{tc.requirementsExplanation || 'Your WordPress plugin must be connected for changes to be applied. If not connected, you can still review the strategy and apply changes manually.'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Processing State */}
          {isProcessing && (
            <div className={styles.processingState}>
              <Loader2 size={40} className={styles.spinning} />
              <div className={styles.progressSection}>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${job.progress || 0}%` }}
                  />
                </div>
                <span className={styles.progressText}>{job.progress || 0}%</span>
              </div>
              {job.message && (
                <p className={styles.processingMessage}>{job.message}</p>
              )}
              <p className={styles.processingHint}>{tt.processingHint || 'You can close this window — the process continues in the background.'}</p>
            </div>
          )}

          {/* Failed State */}
          {isFailed && (
            <div className={styles.failedState}>
              <AlertCircle size={40} className={styles.failedIcon} />
              <h3 className={styles.failedTitle}>{tt.failedTitle || 'Something went wrong'}</h3>
              <p className={styles.failedMessage}>{job.error || tt.failedMessage || 'An unexpected error occurred'}</p>
            </div>
          )}

          {/* Completed State */}
          {isCompleted && resultData && (
            <>
              {/* Alpha Page Box */}
              {alphaPage && (
                <div className={styles.alphaBox}>
                  <div className={styles.alphaHeader}>
                    <Crown size={22} className={styles.crownIcon} />
                    <div>
                      <h3 className={styles.alphaTitle}>{alphaPage.title}</h3>
                      <p className={styles.alphaUrl}>{alphaPage.url || alphaPage.slug}</p>
                    </div>
                  </div>
                  <p className={styles.alphaDescription}>
                    {tt.alphaDescription || 'This is your strongest page. It will not be altered. Other pages will link to it.'}
                  </p>
                  {alphaPage.gscClicks > 0 && (
                    <span className={styles.alphaBadge}>
                      {tpl(tt.gscClicks || '{clicks} GSC clicks', { clicks: alphaPage.gscClicks })}
                    </span>
                  )}
                </div>
              )}

              {/* Supporting Pages Accordions */}
              <div className={styles.supportingSection}>
                <h3 className={styles.sectionTitle}>
                  <FileText size={16} />
                  {tt.supportingTitle || 'Supporting Pages — Proposed Changes'}
                </h3>

                {supportingPages.map((page) => {
                  const isExpanded = expandedPage === page.pageId;
                  const hasError = !!page.error;

                  return (
                    <div
                      key={page.pageId}
                      className={`${styles.pageAccordion} ${hasError ? styles.pageError : ''}`}
                    >
                      {/* Accordion Header */}
                      <button
                        type="button"
                        className={styles.accordionHeader}
                        onClick={() => togglePage(page.pageId)}
                      >
                        <div className={styles.accordionTitleArea}>
                          {hasError ? (
                            <AlertCircle size={16} className={styles.errorIconSmall} />
                          ) : (
                            <CheckCircle size={16} className={styles.successIconSmall} />
                          )}
                          <span className={styles.accordionTitle}>{page.title}</span>
                        </div>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {/* Accordion Body */}
                      {isExpanded && (
                        <div className={styles.accordionBody}>
                          {hasError ? (
                            <p className={styles.pageErrorMessage}>{page.error}</p>
                          ) : (
                            <>
                              {/* New Intent */}
                              <div className={styles.diffSection}>
                                <span className={styles.diffLabel}>{tt.newIntent || 'New Search Intent'}</span>
                                <span className={styles.newIntent}>{page.newFocusIntent}</span>
                              </div>

                              {/* H1 Diff */}
                              <div className={styles.diffSection}>
                                <span className={styles.diffLabel}>{tt.h1Change || 'H1 Change'}</span>
                                <div className={styles.h1Diff}>
                                  <span className={styles.oldText}>
                                    <del>{page.oldH1}</del>
                                  </span>
                                  <ArrowRight size={14} className={styles.arrowIcon} />
                                  <span className={styles.newText}>{page.newH1}</span>
                                </div>
                              </div>

                              {/* Content Diffs */}
                              {page.contentDiffs?.length > 0 && (
                                <div className={styles.diffSection}>
                                  <span className={styles.diffLabel}>
                                    {page.contentDiffs.length === 1
                                      ? tpl(tt.contentChanges || 'Content Changes ({count} paragraph)', { count: page.contentDiffs.length })
                                      : tpl(tt.contentChangesPlural || 'Content Changes ({count} paragraphs)', { count: page.contentDiffs.length })
                                    }
                                  </span>
                                  {page.contentDiffs.map((diff, idx) => (
                                    <div key={idx} className={styles.contentDiff}>
                                      <div className={styles.diffOld}>
                                        <span className={styles.diffBadgeOld}>{tt.diffOld || 'Old'}</span>
                                        <p>{diff.oldParagraph}</p>
                                      </div>
                                      <div className={styles.diffNew}>
                                        <span className={styles.diffBadgeNew}>{tt.diffNew || 'New'}</span>
                                        <p>{diff.newParagraph}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Internal Link */}
                              {page.internalLinkSentence && (
                                <div className={styles.diffSection}>
                                  <span className={styles.diffLabel}>
                                    <ExternalLink size={12} /> {tt.internalLink || 'Internal Link to Alpha Page'}
                                  </span>
                                  <p className={styles.linkPreview}>
                                    &ldquo;{page.internalLinkSentence}&rdquo;
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ─── Footer ──────────────────────────────────────────── */}
        {isConfirmPhase && (
          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>
              {tc.cancelButton || 'Cancel'}
            </button>
            <button
              type="button"
              className={styles.executeBtn}
              onClick={onConfirmStart}
            >
              <Sparkles size={16} />
              {tc.startButton || 'Start Differentiation'}
            </button>
          </div>
        )}

        {isCompleted && !alreadyExecuted && (
          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>
              {tt.closeButton || 'Close'}
            </button>
            <button
              type="button"
              className={styles.executeBtn}
              onClick={onExecute}
              disabled={isExecuting || summary?.successfulDiffs === 0}
            >
              {isExecuting ? (
                <>
                  <Loader2 size={16} className={styles.spinning} />
                  {tt.executingButton || 'Executing...'}
                </>
              ) : (
                <>
                  <Zap size={16} />
                  {tpl(tt.executeButton || 'Approve & Execute Fixes ({credits} Credits)', { credits: summary?.estimatedCredits || 0 })}
                </>
              )}
            </button>
          </div>
        )}

        {isCompleted && alreadyExecuted && (
          <div className={styles.footer}>
            <div className={styles.executedBanner}>
              <CheckCircle size={16} />
              {tpl(tt.executedBanner || 'Fixes executed on {date} — {credits} credits used', {
                date: new Date(resultData.executionResult.executedAt).toLocaleDateString(),
                credits: resultData.executionResult.creditsDeducted,
              })}
            </div>
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>
              {tt.closeButton || 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
