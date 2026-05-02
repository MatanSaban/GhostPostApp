'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import useAICredits from '@/app/hooks/useAICredits';
import { useBackgroundTasks } from '@/app/context/background-tasks-context';
import { useLocale } from '@/app/context/locale-context';

/**
 * Recheck flow controller.
 *
 * Manages: confirmation modal, in-flight set, "recently resolved" set used for
 * the pulse animation, and the global "rechecks happened — score is stale" flag.
 *
 * Per the agreed UX:
 *  - Cost is urls.length GCoins, deducted up-front. No partial rechecks.
 *  - Insufficient GCoins → 402 hits the global LimitGuard modal, no inline UI.
 *  - On success the parent `audit.issues` + `pageResults` are swapped wholesale
 *    with what the server returned; we do NOT recompute score/summary client
 *    side either — the stale-score banner nudges the user to run a full audit.
 *  - The fetch runs in the background after the user confirms — the modal closes
 *    immediately and progress + completion surface through the floating
 *    background-tasks bar so the user can navigate freely while it runs.
 */
export function useRecheck({ auditId, siteId, onAuditUpdated }) {
  const { t } = useLocale();
  const { fetchWithCredits, getCreditsInfo } = useAICredits();
  const { addTask, updateTask } = useBackgroundTasks();

  const [pendingConfirm, setPendingConfirm] = useState(null); // { urls, label, issueKey, key }
  const [inFlightKeys, setInFlightKeys] = useState(() => new Set()); // keys whose fetch is alive
  const [recentlyResolved, setRecentlyResolved] = useState(() => new Set()); // (issueKey|url) keys
  const [hasRechecked, setHasRechecked] = useState(false); // sticky session flag for banner

  // Animation cleanup timers per-key so we can drop the pulse after a moment
  // without state stomping if a second recheck lands.
  const clearTimersRef = useRef(new Map());

  // Stays true while the page is mounted. The fetch promises capture this ref
  // so they can short-circuit React state updates after unmount — but the
  // background task + DB write still complete normally.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  /**
   * Open the confirmation modal. Caller specifies the URLs being rechecked
   * and an optional label/issueKey for context (used by the modal copy and
   * the busy-state spinner placement).
   */
  const requestRecheck = useCallback(({ urls, label, issueKey, key }) => {
    if (!auditId || !siteId || !urls?.length) return;
    setPendingConfirm({
      urls,
      label: label || '',
      issueKey: issueKey || null,
      // `key` is what the in-flight/animation state is keyed off. For per-row
      // rechecks it's `${issueKey}|${url}`; for aggregate it's the issueKey.
      key: key || (issueKey || urls.join(',')),
    });
  }, [auditId, siteId]);

  const cancelConfirm = useCallback(() => setPendingConfirm(null), []);

  /**
   * Fire the recheck. Closes the modal immediately and runs the fetch in the
   * background — the floating background-tasks bar surfaces progress and the
   * outcome. Returns synchronously; the caller doesn't need to await.
   */
  const confirmRecheck = useCallback(() => {
    if (!pendingConfirm) return;
    const { urls, key, label } = pendingConfirm;

    // 1) Close the modal and mark this key in-flight so its button shows a
    //    spinner. Other recheck buttons stay clickable — multiple rechecks
    //    can run in parallel.
    setPendingConfirm(null);
    setInFlightKeys((prev) => new Set(prev).add(key));

    // 2) Register a background task so the user has a persistent indicator
    //    while they navigate around the platform.
    const taskId = `audit-recheck-${auditId}-${key}-${Date.now()}`;
    const startMessage = urls.length === 1
      ? (t('siteAudit.recheck.taskMessageOne') || 'Rechecking 1 page…')
      : (t('siteAudit.recheck.taskMessageN') || 'Rechecking {n} pages…').replace('{n}', urls.length);
    addTask({
      id: taskId,
      type: 'audit-recheck',
      title: t('siteAudit.recheck.taskTitle') || 'Site audit recheck',
      message: startMessage,
      status: 'running',
      progress: 0,
      cancelable: false,
      metadata: { auditId, siteId, key, urlsCount: urls.length },
    });

    // 3) Fire the fetch without awaiting in the React handler. Errors and
    //    completion are reported through the background task; React state
    //    updates only happen if the page is still mounted.
    (async () => {
      try {
        const { ok, status, data, limitError } = await fetchWithCredits('/api/audit/recheck', {
          method: 'POST',
          body: JSON.stringify({ auditId, siteId, urls }),
        });

        if (!ok) {
          updateTask(taskId, {
            status: 'error',
            progress: 100,
            message: limitError
              ? (t('siteAudit.recheck.taskErrorCredits') || 'Insufficient GCoins')
              : (data?.error || `Recheck failed (${status})`),
          });
          return;
        }

        const totalResolved = data.urlResults.reduce((sum, r) => sum + r.resolved.length, 0);
        const totalNew = data.urlResults.reduce((sum, r) => sum + r.newIssues.length, 0);

        // React state updates — only if the page is still mounted. If not,
        // the next visit to the site-audit page will pull fresh data via
        // fetchAudits and pick up the changes from the DB.
        if (aliveRef.current) {
          onAuditUpdated?.({
            issues: data.issues,
            pageResults: data.pageResults,
          });

          if (totalResolved > 0) {
            const newPulseKeys = [];
            setRecentlyResolved((prev) => {
              const fresh = new Set(prev);
              for (const r of data.urlResults) {
                for (const msg of r.resolved) {
                  fresh.add(`${msg}|${r.url}`);
                  fresh.add(msg);
                  newPulseKeys.push(`${msg}|${r.url}`, msg);
                }
              }
              return fresh;
            });
            setHasRechecked(true);

            // Drop the pulse class after the animation runs.
            if (newPulseKeys.length) {
              const timerId = setTimeout(() => {
                setRecentlyResolved((prev) => {
                  const next = new Set(prev);
                  for (const k of newPulseKeys) next.delete(k);
                  return next;
                });
                clearTimersRef.current.delete(timerId);
              }, 2200);
              clearTimersRef.current.set(timerId, true);
            }
          } else {
            // Even with zero resolutions we flip the banner so the user knows
            // the audit's score is now stale relative to what they verified.
            setHasRechecked(true);
          }
        }

        // Background task completion message reflects the outcome regardless
        // of whether the page is still mounted.
        let resultMsg;
        if (totalResolved > 0 && totalNew > 0) {
          resultMsg = (t('siteAudit.recheck.taskCompleteMixed')
            || '{r} resolved · {n} new found').replace('{r}', totalResolved).replace('{n}', totalNew);
        } else if (totalResolved > 0) {
          resultMsg = (t('siteAudit.recheck.taskCompleteResolved')
            || '{n} issue(s) resolved').replace('{n}', totalResolved);
        } else if (totalNew > 0) {
          resultMsg = (t('siteAudit.recheck.taskCompleteNew')
            || '{n} new issue(s) found').replace('{n}', totalNew);
        } else {
          resultMsg = t('siteAudit.recheck.taskCompleteNoChange') || 'No changes detected';
        }
        updateTask(taskId, {
          status: 'completed',
          progress: 100,
          message: resultMsg,
        });
      } catch (err) {
        console.error('[Recheck] Background fetch error:', err);
        updateTask(taskId, {
          status: 'error',
          progress: 100,
          message: err.message || 'Recheck failed',
        });
      } finally {
        if (aliveRef.current) {
          setInFlightKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
    })();
  }, [pendingConfirm, auditId, siteId, fetchWithCredits, onAuditUpdated, addTask, updateTask, t]);

  /**
   * Reset hasRechecked + recentlyResolved. Called when a fresh full audit lands
   * — the stale-score banner is no longer applicable and old "recently fixed"
   * highlights should clear.
   */
  const reset = useCallback(() => {
    setHasRechecked(false);
    setRecentlyResolved(new Set());
    for (const id of clearTimersRef.current.keys()) clearTimeout(id);
    clearTimersRef.current.clear();
  }, []);

  /**
   * Manually mark a set of (issueKey, url?) pairs as recently resolved —
   * triggers the same green pulse + stale-banner the recheck flow uses.
   *
   * Used by the fix flow: after an apply-fix endpoint succeeds and the audit
   * is re-fetched, the page diffs old vs. new issues and reports anything
   * that flipped from active → passed/removed back through this method.
   */
  const markResolved = useCallback((resolvedItems) => {
    if (!resolvedItems || resolvedItems.length === 0) return;
    const newPulseKeys = [];
    setRecentlyResolved((prev) => {
      const fresh = new Set(prev);
      for (const item of resolvedItems) {
        if (!item?.issueKey) continue;
        if (item.url) {
          const k = `${item.issueKey}|${item.url}`;
          fresh.add(k);
          newPulseKeys.push(k);
        }
        // Aggregate-level marker so the agg row pulses too if all its URLs cleared.
        fresh.add(item.issueKey);
        newPulseKeys.push(item.issueKey);
      }
      return fresh;
    });
    setHasRechecked(true);
    if (newPulseKeys.length) {
      const timerId = setTimeout(() => {
        setRecentlyResolved((prev) => {
          const next = new Set(prev);
          for (const k of newPulseKeys) next.delete(k);
          return next;
        });
        clearTimersRef.current.delete(timerId);
      }, 2200);
      clearTimersRef.current.set(timerId, true);
    }
  }, []);

  const credits = getCreditsInfo();

  // Convenience: callers ask "is THIS key currently in flight?" rather than
  // comparing to a single busyKey value.
  const isKeyInFlight = useCallback((key) => inFlightKeys.has(key), [inFlightKeys]);
  const anyInFlight = inFlightKeys.size > 0;

  return {
    pendingConfirm,
    isKeyInFlight,
    anyInFlight,
    recentlyResolved,
    hasRechecked,
    creditsRemaining: credits.remaining,
    requestRecheck,
    confirmRecheck,
    cancelConfirm,
    markResolved,
    reset,
  };
}
