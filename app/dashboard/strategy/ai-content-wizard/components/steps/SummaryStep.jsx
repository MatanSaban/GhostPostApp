'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Sparkles, ChevronDown, ChevronUp,
  Edit3, Loader2, FileText, Tag, Type, AlignLeft, Hash,
  Calendar, List,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import CalendarGrid from '../../../_shared/CalendarGrid';

/** Safely decode a URI that may contain percent-encoded Hebrew/Unicode */
function decodeUrl(url) {
  if (!url) return '';
  try { return decodeURIComponent(url); } catch { return url; }
}
import PostPopover from '../../../_shared/PostPopover';
import { ARTICLE_TYPE_KEY_MAP, ARTICLE_TYPES, WEEK_DAYS, translateIntent } from '../../wizardConfig';
import styles from '../../page.module.css';

export default function SummaryStep({ state, dispatch, translations }) {
  const t = translations.summary;
  const scheduleT = translations.schedule;
  const articleTypesT = translations.articleTypes;
  const intentsMap = translations.subjects?.intents || {};
  const months = translations.months || [];
  const dayNames = translations.dayNames || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const { selectedSite } = useSite();
  const [loading, setLoading] = useState(false);
  const [expandedPosts, setExpandedPosts] = useState(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [planView, setPlanView] = useState('calendar'); // 'calendar' | 'list'
  const [calMonth, setCalMonth] = useState(null); // calendar month being viewed
  const [existingPosts, setExistingPosts] = useState([]);
  const [otherCampaignPosts, setOtherCampaignPosts] = useState([]); // posts from other campaigns

  // Fetch existing site posts for the calendar
  useEffect(() => {
    if (!selectedSite?.id) return;
    fetch(`/api/entities?siteId=${selectedSite.id}&type=posts`)
      .then(res => res.json())
      .then(data => setExistingPosts(data.entities || []))
      .catch(() => setExistingPosts([]));
  }, [selectedSite?.id]);

  // Fetch other campaigns' planned posts
  useEffect(() => {
    if (!selectedSite?.id) return;
    fetch(`/api/campaigns?siteId=${selectedSite.id}`)
      .then(res => res.json())
      .then(data => {
        const campaigns = data.campaigns || data || [];
        const posts = [];
        campaigns.forEach(c => {
          if (c.id === state.campaignId) return; // skip current campaign
          if (!Array.isArray(c.generatedPlan)) return;
          c.generatedPlan.forEach(p => {
            if (!p.scheduledAt) return;
            posts.push({
              ...p,
              _campaignId: c.id,
              _campaignName: c.name,
              _campaignColor: c.color || '#6366f1',
            });
          });
        });
        setOtherCampaignPosts(posts);
      })
      .catch(() => setOtherCampaignPosts([]));
  }, [selectedSite?.id, state.campaignId]);

  // Initialize calendar to the campaign's start month when plan is generated
  useEffect(() => {
    if (state.generatedPlan?.length > 0 && !calMonth) {
      const first = new Date(state.generatedPlan[0].scheduledAt);
      setCalMonth(new Date(first.getFullYear(), first.getMonth(), 1));
    }
  }, [state.generatedPlan]); // eslint-disable-line react-hooks/exhaustive-deps
  // Subject accordion state (index of open subject, null = none)
  const [openSubject, setOpenSubject] = useState(null);

  // Ref to hold generatePlan – assigned after function definition below
  const generatePlanRef = useRef(null);

  // Auto-regenerate plan if schedule was changed
  useEffect(() => {
    if (state.planNeedsRegeneration && state.campaignId) {
      dispatch({ type: 'SET_FIELD', field: 'planNeedsRegeneration', value: false });
      generatePlanRef.current?.();
    }
  }, [state.planNeedsRegeneration, state.campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve subjects to serializable data for API
  const resolveSubjects = () => {
    return state.subjects.map(s => {
      if (!s || typeof s === 'string') return s; // backward compat
      return {
        articleType: s.articleType,
        title: s.title || '',
        explanation: s.explanation || '',
        intent: s.intent || '',
      };
    }).filter(s => s && (typeof s === 'string' ? s : s.title));
  };

  const generatePlan = async () => {
    if (!state.campaignId && !state.isNewCampaign) return;

    try {
      setLoading(true);

      // If new campaign, create it first
      let campaignId = state.campaignId;
      if (state.isNewCampaign) {
        const createRes = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: selectedSite.id,
            name: state.campaignName,
            color: state.campaignColor,
            startDate: state.startDate,
            endDate: state.endDate,
            publishDays: state.publishDays,
            publishTimeMode: state.publishTimeMode,
            publishTimeStart: state.publishTimeStart,
            publishTimeEnd: state.publishTimeEnd,
            postsCount: state.postsCount,
            articleTypes: state.articleTypes,
            contentSettings: state.contentSettings,
            subjects: resolveSubjects(),
            subjectSuggestions: state.subjectSuggestions || [],
            keywordIds: state.selectedKeywordIds,
            pillarPageUrl: state.pillarPageUrl || '',
            mainKeyword: state.mainKeyword || '',
            pillarEntityId: state.pillarEntityId || null,
            textPrompt: state.textPrompt,
            imagePrompt: state.imagePrompt,
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.error || t.createCampaignError || 'Failed to create campaign');
        campaignId = createData.campaign.id;
        dispatch({ type: 'SET_FIELD', field: 'campaignId', value: campaignId });
      } else {
        // Update existing campaign with current wizard data
        await fetch(`/api/campaigns/${campaignId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate: state.startDate,
            endDate: state.endDate,
            publishDays: state.publishDays,
            publishTimeMode: state.publishTimeMode,
            publishTimeStart: state.publishTimeStart,
            publishTimeEnd: state.publishTimeEnd,
            postsCount: state.postsCount,
            articleTypes: state.articleTypes,
            contentSettings: state.contentSettings,
            subjects: resolveSubjects(),
            subjectSuggestions: state.subjectSuggestions || [],
            keywordIds: state.selectedKeywordIds,
            pillarPageUrl: state.pillarPageUrl || '',
            mainKeyword: state.mainKeyword || '',
            pillarEntityId: state.pillarEntityId || null,
            textPrompt: state.textPrompt,
            imagePrompt: state.imagePrompt,
          }),
        });
      }

      // Generate plan
      const planRes = await fetch(`/api/campaigns/${campaignId}/generate-plan`, {
        method: 'POST',
      });
      const planData = await planRes.json();
      if (!planRes.ok) throw new Error(planData.error || t.generatePlanError || 'Failed to generate plan');

      dispatch({ type: 'SET_FIELD', field: 'generatedPlan', value: planData.plan });

      // Save the generated plan to the campaign
      await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatedPlan: planData.plan }),
      });
    } catch (err) {
      console.error('Failed to generate plan:', err);
    } finally {
      setLoading(false);
    }
  };

  // Keep a ref to generatePlan so the auto-regen effect can call it
  generatePlanRef.current = generatePlan;

  // ── Post popover state ──────────────────────────────────────────
  const [popover, setPopover] = useState(null); // { type: 'planned'|'existing'|'other-campaign', planIndex?, post?, rect }


  const openPostPopover = (planIndex, e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ type: 'planned', planIndex, rect });
  };

  const openExistingPopover = (post, e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ type: 'existing', post, rect });
  };

  const openOtherCampaignPopover = (post, e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ type: 'other-campaign', post, rect });
  };

  const closePopover = () => setPopover(null);

  const updatePostTime = (planIndex, newTime) => {
    if (!newTime || !/^\d{1,2}:\d{2}$/.test(newTime)) return; // Invalid time format
    const updated = [...state.generatedPlan];
    const post = { ...updated[planIndex] };
    const d = new Date(post.scheduledAt);
    const [h, m] = newTime.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    if (isNaN(d.getTime())) return; // Invalid time
    post.scheduledAt = d.toISOString();
    updated[planIndex] = post;
    dispatch({ type: 'SET_FIELD', field: 'generatedPlan', value: updated });
    // Persist
    if (state.campaignId) {
      fetch(`/api/campaigns/${state.campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatedPlan: updated }),
      }).catch(() => {});
    }
  };

  const updatePostDate = (planIndex, newDate) => {
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return; // Invalid date format
    const updated = [...state.generatedPlan];
    const post = { ...updated[planIndex] };
    const oldDate = new Date(post.scheduledAt);
    const [year, month, day] = newDate.split('-').map(Number);
    const d = new Date(year, month - 1, day, oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    if (isNaN(d.getTime())) return; // Invalid date
    post.scheduledAt = d.toISOString();
    updated[planIndex] = post;
    dispatch({ type: 'SET_FIELD', field: 'generatedPlan', value: updated });
    // Persist
    if (state.campaignId) {
      fetch(`/api/campaigns/${state.campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatedPlan: updated }),
      }).catch(() => {});
    }
  };

  // ── Drag & Drop handler (called by CalendarGrid) ────────────────
  const handleCalendarDrop = useCallback((draggedPost, targetCell) => {
    if (!draggedPost?.planIndex == null || !state.generatedPlan) return;

    const idx = draggedPost.planIndex;
    if (idx == null || !state.generatedPlan[idx]) return;

    const updated = [...state.generatedPlan];
    const post = { ...updated[idx] };
    const oldDate = new Date(post.scheduledAt);
    const newDate = new Date(targetCell.date);
    newDate.setHours(oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds(), 0);
    post.scheduledAt = newDate.toISOString();
    updated[idx] = post;
    dispatch({ type: 'SET_FIELD', field: 'generatedPlan', value: updated });

    if (state.campaignId) {
      fetch(`/api/campaigns/${state.campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatedPlan: updated }),
      }).catch(() => {});
    }
  }, [state.generatedPlan, state.campaignId, dispatch]);

  // ── Unified post click handler (dispatches to correct popover) ──
  const handlePostClick = (post, e) => {
    if (post.source === 'plan') {
      openPostPopover(post.planIndex, e);
    } else if (post.source === 'entity') {
      openExistingPopover(post, e);
    } else if (post.source === 'other-campaign') {
      openOtherCampaignPopover(post, e);
    }
  };

  const togglePost = (index) => {
    const updated = new Set(expandedPosts);
    if (updated.has(index)) {
      updated.delete(index);
    } else {
      updated.add(index);
    }
    setExpandedPosts(updated);
  };

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedPosts(new Set());
    } else {
      setExpandedPosts(new Set(state.generatedPlan?.map((_, i) => i) || []));
    }
    setAllExpanded(!allExpanded);
  };

  const updatePlanTitle = (index, newTitle) => {
    const updated = [...state.generatedPlan];
    updated[index] = { ...updated[index], title: newTitle };
    dispatch({ type: 'SET_FIELD', field: 'generatedPlan', value: updated });
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  // ── Calendar helpers ──────────────────────────────────────────────
  const campaignStart = state.startDate ? new Date(state.startDate) : null;
  const campaignEnd = state.endDate ? new Date(state.endDate) : null;

  const calendarDays = useMemo(() => {
    if (!calMonth) return [];
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build planned posts map by date key (YYYY-MM-DD) - include plan index
    const plannedByKey = {};
    (state.generatedPlan || []).forEach((post, idx) => {
      const d = new Date(post.scheduledAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!plannedByKey[key]) plannedByKey[key] = [];
      plannedByKey[key].push({ ...post, _planIndex: idx });
    });

    // Build existing posts map by date key (only published posts)
    // Priority: publishedAt > metadata.publishDate (from crawl) > createdAt
    const existingByKey = {};
    existingPosts
      .filter((post) => post.status === 'PUBLISHED')
      .forEach((post) => {
        const dateStr = post.publishedAt || post.metadata?.publishDate || post.createdAt;
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!existingByKey[key]) existingByKey[key] = [];
        existingByKey[key].push(post);
      });

    // Build other campaigns' posts map by date key
    const otherCampaignsByKey = {};
    otherCampaignPosts.forEach((post) => {
      const d = new Date(post.scheduledAt);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!otherCampaignsByKey[key]) otherCampaignsByKey[key] = [];
      otherCampaignsByKey[key].push(post);
    });

    const buildCell = (cellDate, isOther) => {
      const key = `${cellDate.getFullYear()}-${cellDate.getMonth()}-${cellDate.getDate()}`;
      const isToday = cellDate.getTime() === today.getTime();
      const inRange = campaignStart && campaignEnd && cellDate >= campaignStart && cellDate <= campaignEnd;

      // Build flat posts array - same shape CalendarGrid expects
      const posts = [];
      (existingByKey[key] || []).forEach(post => {
        posts.push({
          ...post,
          dotStatus: 'published',
          source: 'entity',
        });
      });
      (otherCampaignsByKey[key] || []).forEach((post, idx) => {
        posts.push({
          ...post,
          id: `oc-${post._campaignId}-${idx}`,
          dotStatus: 'scheduled',
          source: 'other-campaign',
          campaignColor: post._campaignColor,
          campaignName: post._campaignName,
        });
      });
      (plannedByKey[key] || []).forEach(post => {
        posts.push({
          ...post,
          id: `plan-${post._planIndex}`,
          dotStatus: 'scheduled',
          source: 'plan',
          campaignColor: state.campaignColor,
          campaignName: state.campaignName,
          planIndex: post._planIndex,
        });
      });

      return {
        date: new Date(cellDate),
        dateKey: key,
        day: cellDate.getDate(),
        other: isOther,
        today: isToday,
        inRange: isOther ? false : inRange,
        posts: posts.length > 0 ? posts : undefined,
      };
    };

    const days = [];

    // Previous month trailing days (if month doesn't start on Sunday)
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i);
      days.push(buildCell(d, true));
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(buildCell(new Date(year, month, i), false));
    }

    // Next month padding - always fill to exactly 42 cells (6 full rows)
    let nextDay = 1;
    while (days.length < 42) {
      days.push(buildCell(new Date(year, month + 1, nextDay++), true));
    }

    return days;
  }, [calMonth, state.generatedPlan, state.campaignColor, state.campaignName, existingPosts, otherCampaignPosts, campaignStart, campaignEnd]);

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <div className={`${styles.stepIconWrapper} ${styles.launch}`}>
          <Sparkles className={styles.stepHeaderIcon} style={{ color: 'white' }} />
        </div>
        <div className={styles.stepInfo}>
          <h2 className={styles.stepTitle}>{t.title}</h2>
          <p className={styles.stepDescription}>{t.description}</p>
        </div>
      </div>

      {/* Campaign overview */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{t.campaignName}</span>
            <span className={styles.summaryValue}>
              <span className={styles.summaryColorDot} style={{ backgroundColor: state.campaignColor }} />
              {state.campaignName || '-'}
            </span>
          </div>
          {state.pillarPageUrl && (
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>{t.pillarPage}</span>
              <span className={styles.summaryValue}>{decodeUrl(state.pillarPageUrl)}</span>
            </div>
          )}
          {state.mainKeyword && (
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>{t.mainKeyword}</span>
              <span className={styles.summaryValue}>{state.mainKeyword}</span>
            </div>
          )}
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{t.totalPosts}</span>
            <span className={styles.summaryValue}>{state.postsCount}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{t.dateRange}</span>
            <span className={styles.summaryValue}>{state.startDate} → {state.endDate}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{t.publishDays}</span>
            <span className={styles.summaryValue}>
              {state.publishDays.map(d => scheduleT.days[d]).join(', ')}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{t.publishTime}</span>
            <span className={styles.summaryValue}>
              {state.publishTimeMode === 'random'
                ? `${t.random} (${state.publishTimeStart} - ${state.publishTimeEnd})`
                : `${t.fixed} (${state.publishTimeStart})`}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{t.articleTypes}</span>
            <span className={styles.summaryValue}>
              {state.articleTypes.map(at => {
                const key = ARTICLE_TYPE_KEY_MAP[at.id];
                const label = articleTypesT.types[key]?.label || at.id;
                return `${label} (${at.count})`;
              }).join(', ')}
            </span>
          </div>
        </div>
      </div>

      {/* Subjects accordion */}
      {state.subjects.length > 0 && (
        <div className={styles.summarySubjectsSection}>
          <h3 className={styles.summarySubjectsSectionTitle}>
            <FileText size={18} />
            {t.subjectsTitle} ({state.subjects.length})
          </h3>

          <div className={styles.summarySubjectsList}>
            {state.subjects.map((subject, idx) => {
              const isOpen = openSubject === idx;
              const typeKey = ARTICLE_TYPE_KEY_MAP[subject.articleType];
              const typeLabel = articleTypesT.types[typeKey]?.label || subject.articleType;
              const typeDef = ARTICLE_TYPES.find(at => at.id === subject.articleType);

              return (
                <div key={idx} className={`${styles.summarySubjectItem} ${isOpen ? styles.summarySubjectItemOpen : ''}`}>
                  <button
                    type="button"
                    className={styles.summarySubjectHeader}
                    onClick={() => setOpenSubject(isOpen ? null : idx)}
                  >
                    <span className={styles.summarySubjectIndex}>{idx + 1}</span>
                    <div className={styles.summarySubjectHeaderInfo}>
                      <span className={styles.summarySubjectTitle}>{subject.title}</span>
                      <span className={styles.summarySubjectHeaderMeta}>
                        {typeLabel}{subject.intent ? ` · ${translateIntent(subject.intent, intentsMap)}` : ''}
                        {subject.isCustom && <span className={styles.summarySubjectCustomBadge}>{t.custom}</span>}
                      </span>
                    </div>
                    <ChevronDown size={16} className={`${styles.summarySubjectChevron} ${isOpen ? styles.summarySubjectChevronOpen : ''}`} />
                  </button>

                  {isOpen && (
                    <div className={styles.summarySubjectBody}>
                      {subject.explanation && (
                        <div className={styles.summarySubjectDetail}>
                          <AlignLeft size={14} className={styles.summarySubjectDetailIcon} />
                          <div>
                            <span className={styles.summarySubjectDetailLabel}>{t.explanation}</span>
                            <p className={styles.summarySubjectDetailValue}>{subject.explanation}</p>
                          </div>
                        </div>
                      )}

                      <div className={styles.summarySubjectDetailRow}>
                        {subject.intent && (
                          <div className={styles.summarySubjectDetail}>
                            <Tag size={14} className={styles.summarySubjectDetailIcon} />
                            <div>
                              <span className={styles.summarySubjectDetailLabel}>{t.postIntent || 'Intent'}</span>
                              <span className={styles.summarySubjectDetailValue}>{translateIntent(subject.intent, intentsMap)}</span>
                            </div>
                          </div>
                        )}

                        <div className={styles.summarySubjectDetail}>
                          <Type size={14} className={styles.summarySubjectDetailIcon} />
                          <div>
                            <span className={styles.summarySubjectDetailLabel}>{t.postType}</span>
                            <span className={styles.summarySubjectDetailValue}>{typeLabel}</span>
                          </div>
                        </div>

                        {typeDef && (
                          <div className={styles.summarySubjectDetail}>
                            <Hash size={14} className={styles.summarySubjectDetailIcon} />
                            <div>
                              <span className={styles.summarySubjectDetailLabel}>{t.wordCount}</span>
                              <span className={styles.summarySubjectDetailValue}>
                                {typeDef.minWords.toLocaleString()} – {typeDef.maxWords.toLocaleString()} {t.words}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Generate Plan button */}
      {!state.generatedPlan && (
        <button
          onClick={generatePlan}
          disabled={loading || !state.campaignName || !state.startDate || !state.endDate}
          className={styles.generatePlanBtn}
        >
          {loading ? (
            <>
              <Loader2 className={styles.spinner} size={18} />
              {t.generatingPlan}
            </>
          ) : (
            <>
              <Sparkles size={18} />
              {t.generatePlan}
            </>
          )}
        </button>
      )}

      {/* Generated plan posts */}
      {state.generatedPlan && (
        <div className={styles.planCalendarSection}>
          <div className={styles.plannedPostsHeader}>
            <h3 className={styles.plannedPostsTitle}>
              {t.plannedPosts} ({state.generatedPlan.length})
            </h3>
            <div className={styles.planViewToggle}>
              <button
                className={`${styles.planViewBtn} ${planView === 'calendar' ? styles.planViewBtnActive : ''}`}
                onClick={() => setPlanView('calendar')}
              >
                <Calendar size={14} />
              </button>
              <button
                className={`${styles.planViewBtn} ${planView === 'list' ? styles.planViewBtnActive : ''}`}
                onClick={() => setPlanView('list')}
              >
                <List size={14} />
              </button>
            </div>
          </div>

          {/* ── Calendar View ─────────────────────────────────── */}
          {planView === 'calendar' && calMonth && (
            <>
              <CalendarGrid
                monthLabel={`${months[calMonth.getMonth()]} ${calMonth.getFullYear()}`}
                dayNames={dayNames}
                calendarDays={calendarDays}
                onPrevMonth={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                onNextMonth={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                onPostClick={(post, e) => handlePostClick(post, e)}
                onDrop={handleCalendarDrop}
                statusLabels={{
                  published: t.published || 'Published',
                  scheduled: t.scheduled || 'Scheduled',
                  processing: t.processing || 'Processing',
                  readyToPublish: t.readyToPublish || 'Ready',
                  failed: t.failed || 'Failed',
                  draft: t.draft || 'Draft',
                }}
                legendItems={[
                  { icon: '/icons/letter-p.svg', alt: 'P', label: t.published || 'Published' },
                  { icon: '/icons/letter-s.svg', alt: 'S', label: t.scheduled || 'Scheduled' },
                  { icon: '/icons/letter-l.svg', alt: 'L', label: t.processing || 'Processing' },
                  { icon: '/icons/letter-r.svg', alt: 'R', label: t.readyToPublish || 'Ready' },
                  { icon: '/icons/letter-f.svg', alt: 'F', label: t.failed || 'Failed' },
                  { icon: '/icons/letter-d.svg', alt: 'D', label: t.draft || 'Draft' },
                ]}
              />

              {/* Unified Post Popover */}
              {popover && (() => {
                // Build normalized post based on popover type
                let normalizedPost = null;
                let showEdit = false;

                if (popover.type === 'planned' && state.generatedPlan?.[popover.planIndex]) {
                  const post = state.generatedPlan[popover.planIndex];
                  const typeKey = ARTICLE_TYPE_KEY_MAP[post.type];
                  normalizedPost = {
                    ...post,
                    campaignName: state.campaignName,
                    campaignColor: state.campaignColor,
                    typeLabel: articleTypesT.types[typeKey]?.label || post.type,
                  };
                  showEdit = true;
                } else if (popover.type === 'existing' && popover.post) {
                  normalizedPost = {
                    ...popover.post,
                    dotStatus: 'published',
                    source: 'entity',
                  };
                } else if (popover.type === 'other-campaign' && popover.post) {
                  const post = popover.post;
                  const typeKey = ARTICLE_TYPE_KEY_MAP[post.type];
                  normalizedPost = {
                    ...post,
                    campaignName: post.campaignName || post._campaignName,
                    campaignColor: post.campaignColor || post._campaignColor,
                    typeLabel: articleTypesT.types[typeKey]?.label || post.type,
                  };
                }

                if (!normalizedPost) return null;

                return (
                  <PostPopover
                    post={normalizedPost}
                    rect={popover.rect}
                    onClose={closePopover}
                    translations={{
                      campaign: t.campaignName,
                      status: t.existingStatus || 'Status',
                      type: t.postType,
                      keyword: t.postKeyword,
                      date: t.postDate,
                      time: t.publishTime || t.postTime,
                      source: t.source || 'Source',
                      viewOnSite: t.viewPost || 'View on site',
                      published: t.published || 'Published',
                      scheduled: t.scheduled || 'Scheduled',
                      processing: t.processing || 'Processing',
                      readyToPublish: t.readyToPublish || 'Ready',
                      failed: t.failed || 'Failed',
                      draft: t.draft || 'Draft',
                    }}
                    onDateChange={showEdit ? (date) => updatePostDate(popover.planIndex, date) : undefined}
                    onTimeChange={showEdit ? (time) => updatePostTime(popover.planIndex, time) : undefined}
                  />
                );
              })()}
            </>
          )}

          {/* ── List View ─────────────────────────────────────── */}
          {planView === 'list' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={toggleAll} className={styles.expandToggle}>
                  {allExpanded ? t.collapseAll : t.expandAll}
                </button>
              </div>
              <div className={styles.plannedPostsList}>
                {state.generatedPlan.map((post, index) => {
                  const isExpanded = expandedPosts.has(index);
                  const typeKey = ARTICLE_TYPE_KEY_MAP[post.type];
                  const typeLabel = articleTypesT.types[typeKey]?.label || post.type;

                  return (
                    <div key={index} className={styles.plannedPost}>
                      <div
                        className={styles.plannedPostHeader}
                        onClick={() => togglePost(index)}
                      >
                        <span className={styles.plannedPostIndex}>{index + 1}</span>
                        <div className={styles.plannedPostInfo}>
                          <span className={styles.plannedPostTitle}>{post.title}</span>
                          <span className={styles.plannedPostMeta}>
                            {typeLabel} · {formatDate(post.scheduledAt)}
                          </span>
                        </div>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>

                      {isExpanded && (
                        <div className={styles.plannedPostDetails}>
                          <div className={styles.detailRow}>
                            <label className={styles.detailLabel}>{t.postTitle}</label>
                            <div className={styles.editableTitle}>
                              <input
                                type="text"
                                className={styles.formInput}
                                value={post.title}
                                onChange={(e) => updatePlanTitle(index, e.target.value)}
                              />
                              <Edit3 size={14} className={styles.editIcon} />
                            </div>
                          </div>
                          <div className={styles.detailRow}>
                            <label className={styles.detailLabel}>{t.postType}</label>
                            <span>{typeLabel}</span>
                          </div>
                          <div className={styles.detailRow}>
                            <label className={styles.detailLabel}>{t.postDate}</label>
                            <span>{formatDate(post.scheduledAt)}</span>
                          </div>
                          <div className={styles.detailRow}>
                            <label className={styles.detailLabel}>{t.postSubject}</label>
                            <span>{typeof post.subject === 'object' ? post.subject?.title : post.subject || t.noSubject}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
