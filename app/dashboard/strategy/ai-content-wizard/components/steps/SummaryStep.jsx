'use client';

import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Edit3, Loader2, FileText, Tag, Type, AlignLeft, Hash } from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { ARTICLE_TYPE_KEY_MAP, ARTICLE_TYPES, WEEK_DAYS } from '../../wizardConfig';
import styles from '../../page.module.css';

export default function SummaryStep({ state, dispatch, translations }) {
  const t = translations.summary;
  const scheduleT = translations.schedule;
  const articleTypesT = translations.articleTypes;
  const { selectedSite } = useSite();
  const [loading, setLoading] = useState(false);
  const [expandedPosts, setExpandedPosts] = useState(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  // Subject accordion state (index of open subject, null = none)
  const [openSubject, setOpenSubject] = useState(null);

  // Resolve subjects to serializable data for API
  const resolveSubjects = () => {
    return state.subjects.map(s => {
      if (!s || typeof s === 'string') return s; // backward compat
      return {
        keyword: s.keyword,
        articleType: s.articleType,
        title: s.title || '',
        explanation: s.explanation || '',
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
            keywordIds: state.selectedKeywordIds,
            textPrompt: state.textPrompt,
            imagePrompt: state.imagePrompt,
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.error || 'Failed to create campaign');
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
            keywordIds: state.selectedKeywordIds,
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
      if (!planRes.ok) throw new Error(planData.error || 'Failed to generate plan');

      dispatch({ type: 'SET_FIELD', field: 'generatedPlan', value: planData.plan });
    } catch (err) {
      console.error('Failed to generate plan:', err);
    } finally {
      setLoading(false);
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
              {state.campaignName || '—'}
            </span>
          </div>
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
                        {subject.keyword} · {typeLabel}
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
                        <div className={styles.summarySubjectDetail}>
                          <Tag size={14} className={styles.summarySubjectDetailIcon} />
                          <div>
                            <span className={styles.summarySubjectDetailLabel}>{t.postKeyword}</span>
                            <span className={styles.summarySubjectDetailValue}>{subject.keyword}</span>
                          </div>
                        </div>

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
        <div className={styles.plannedPostsSection}>
          <div className={styles.plannedPostsHeader}>
            <h3 className={styles.plannedPostsTitle}>
              {t.plannedPosts} ({state.generatedPlan.length})
            </h3>
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
                        <span>{post.subject || t.noSubject}</span>
                      </div>
                      <div className={styles.detailRow}>
                        <label className={styles.detailLabel}>{t.postKeyword}</label>
                        <span>{post.keywordText || t.noKeyword}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
