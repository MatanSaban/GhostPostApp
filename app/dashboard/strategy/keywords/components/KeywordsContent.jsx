'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus, Search, Loader2, Tag, Trash2, Plus, X, Sparkles, BarChart3, Crosshair, Trophy, ChevronDown, Info, Navigation, ShoppingCart, DollarSign, ExternalLink, FileText, Wand2 } from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useTranslation } from '@/app/context/locale-context';
import { Skeleton } from '@/app/dashboard/components/Skeleton';
import GeneratePostModal from './GeneratePostModal';
import styles from '../page.module.css';

const getPositionClass = (position) => {
  if (!position) return 'below20';
  if (position <= 3) return 'top3';
  if (position <= 10) return 'top10';
  if (position <= 20) return 'top20';
  return 'below20';
};

const getDifficultyLevel = (difficulty) => {
  if (!difficulty) return null;
  if (difficulty <= 30) return 'easy';
  if (difficulty <= 60) return 'medium';
  return 'hard';
};

function KeywordsPageSkeleton() {
  return (
    <>
      {/* Stat Cards Skeleton */}
      <div className={styles.statsRow}>
        {['purple', 'blue', 'green', 'orange'].map((color) => (
          <div key={color} className={styles.statCard}>
            <div className={styles.statCardGlow} />
            <div className={styles.statCardContent}>
              <div className={styles.statHeader}>
                <Skeleton width="2.25rem" height="2.25rem" borderRadius="lg" />
              </div>
              <Skeleton width="60%" height="0.75rem" borderRadius="sm" />
              <Skeleton width="3rem" height="1.4rem" borderRadius="sm" />
            </div>
          </div>
        ))}
      </div>

      {/* Add Keyword Button Skeleton */}
      <Skeleton width="9rem" height="2.25rem" borderRadius="md" className={styles.skeletonAddBtn} />

      {/* Filter Tabs Skeleton */}
      <div className={styles.filterTabs}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width={`${60 + i * 8}px`} height="2rem" borderRadius="full" />
        ))}
      </div>

      {/* Table Skeleton */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <Skeleton width="10rem" height="1.25rem" borderRadius="sm" />
            <Skeleton width="6rem" height="0.8rem" borderRadius="sm" className={styles.skeletonSubtitle} />
          </div>
        </div>
        <div className={styles.tableHeader}>
          <Skeleton width="4rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="4rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="3rem" height="0.75rem" borderRadius="sm" />
          <Skeleton width="1rem" height="0.75rem" borderRadius="sm" />
        </div>
        <div className={styles.tableBody}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.tableRow}>
              <div className={styles.keywordCell}>
                <Skeleton width={`${55 + (i % 3) * 15}%`} height="0.875rem" borderRadius="sm" />
              </div>
              <div className={`${styles.cell} ${styles.positionCell}`}>
                <Skeleton width="2.5rem" height="1.5rem" borderRadius="full" />
              </div>
              <div className={`${styles.cell} ${styles.volumeCell}`}>
                <Skeleton width="3rem" height="0.875rem" borderRadius="sm" />
              </div>
              <div className={`${styles.cell} ${styles.intentCell}`}>
                <Skeleton width="4rem" height="1.4rem" borderRadius="full" />
              </div>
              <div className={`${styles.cell} ${styles.relatedPostCell}`}>
                <Skeleton width="2rem" height="1.4rem" borderRadius="sm" />
              </div>
              <div className={`${styles.cell} ${styles.statusCell}`}>
                <Skeleton width="4.5rem" height="1.4rem" borderRadius="full" />
              </div>
              <div className={`${styles.cell} ${styles.actionsCell}`}>
                <Skeleton width="1.5rem" height="1.5rem" borderRadius="sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function KeywordsContent() {
  const { t } = useTranslation();
  const { selectedSite, isLoading: isSiteLoading } = useSite();
  const [keywords, setKeywords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, tracking, targeting, ranking, archived
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [addError, setAddError] = useState('');
  const [editingStatus, setEditingStatus] = useState(null); // keywordId being edited
  const [editingIntent, setEditingIntent] = useState(null); // keywordId being edited
  const [updatingKeyword, setUpdatingKeyword] = useState(null); // keywordId being updated
  const [generatePostKeyword, setGeneratePostKeyword] = useState(null); // keyword for post generation modal
  const dropdownRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setEditingStatus(null);
        setEditingIntent(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!selectedSite?.id) {
      // Only stop loading if site context finished resolving and there's truly no site
      if (!isSiteLoading) {
        setIsLoading(false);
      }
      return;
    }
    fetchKeywords(selectedSite.id);
  }, [selectedSite?.id, isSiteLoading]);

  const fetchKeywords = async (siteId) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/keywords?siteId=${siteId}`);
      if (res.ok) {
        const data = await res.json();
        setKeywords(data.keywords || []);
      }
    } catch (err) {
      console.error('Error fetching keywords:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddKeyword = async (e) => {
    e?.preventDefault();
    const kw = newKeyword.trim();
    if (!kw || !selectedSite?.id) return;

    setAddingKeyword(true);
    setAddError('');

    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id, keywords: kw }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAddError(data.duplicates
          ? t('keywordStrategy.duplicateKeyword')
          : (data.error || t('keywordStrategy.addError')));
        return;
      }

      setKeywords(prev => [...(data.keywords || []), ...prev]);
      setNewKeyword('');
      setShowAddForm(false);
    } catch (err) {
      setAddError(t('keywordStrategy.addError'));
    } finally {
      setAddingKeyword(false);
    }
  };

  const handleUpdateStatus = async (keywordId, newStatus) => {
    setUpdatingKeyword(keywordId);
    try {
      const res = await fetch('/api/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId, status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeywords(prev => prev.map(kw => 
          kw.id === keywordId ? { ...kw, status: data.keyword.status } : kw
        ));
      }
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setUpdatingKeyword(null);
      setEditingStatus(null);
    }
  };

  const handleUpdateIntent = async (keywordId, intentToToggle) => {
    const keyword = keywords.find(kw => kw.id === keywordId);
    if (!keyword) return;

    setUpdatingKeyword(keywordId);
    
    // Get current intents array (or empty)
    const currentIntents = keyword.intents || [];
    
    // Toggle the intent
    let newIntents;
    if (currentIntents.includes(intentToToggle)) {
      // Remove it
      newIntents = currentIntents.filter(i => i !== intentToToggle);
    } else {
      // Add it
      newIntents = [...currentIntents, intentToToggle];
    }

    try {
      const res = await fetch('/api/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId, intents: newIntents }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeywords(prev => prev.map(kw => 
          kw.id === keywordId ? { ...kw, intents: data.keyword.intents } : kw
        ));
      }
    } catch (err) {
      console.error('Error updating intents:', err);
    } finally {
      setUpdatingKeyword(null);
    }
  };

  const handleClearIntents = async (keywordId) => {
    setUpdatingKeyword(keywordId);
    try {
      const res = await fetch('/api/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId, intents: [] }),
      });
      if (res.ok) {
        setKeywords(prev => prev.map(kw => 
          kw.id === keywordId ? { ...kw, intents: [] } : kw
        ));
      }
    } catch (err) {
      console.error('Error clearing intents:', err);
    } finally {
      setUpdatingKeyword(null);
      setEditingIntent(null);
    }
  };

  const handleAnalyzeIntent = async (keywordId) => {
    setUpdatingKeyword(keywordId);
    try {
      const res = await fetch('/api/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId, analyzeIntent: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeywords(prev => prev.map(kw => 
          kw.id === keywordId ? { ...kw, intents: data.keyword.intents } : kw
        ));
      }
    } catch (err) {
      console.error('Error analyzing intent:', err);
    } finally {
      setUpdatingKeyword(null);
    }
  };

  const handleDeleteKeyword = async (keywordId) => {
    if (!confirm(t('keywordStrategy.confirmDelete'))) return;
    
    try {
      const res = await fetch(`/api/keywords?keywordId=${keywordId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setKeywords(prev => prev.filter(kw => kw.id !== keywordId));
      }
    } catch (err) {
      console.error('Error deleting keyword:', err);
    }
  };

  // Intent options
  const intentOptions = [
    { value: 'INFORMATIONAL', label: t('keywordStrategy.intent.informational'), desc: t('keywordStrategy.intent.informationalDesc'), icon: Info },
    { value: 'NAVIGATIONAL', label: t('keywordStrategy.intent.navigational'), desc: t('keywordStrategy.intent.navigationalDesc'), icon: Navigation },
    { value: 'TRANSACTIONAL', label: t('keywordStrategy.intent.transactional'), desc: t('keywordStrategy.intent.transactionalDesc'), icon: ShoppingCart },
    { value: 'COMMERCIAL', label: t('keywordStrategy.intent.commercial'), desc: t('keywordStrategy.intent.commercialDesc'), icon: DollarSign },
  ];

  // Status options
  const statusOptions = [
    { value: 'TRACKING', label: t('keywordStrategy.statusLabels.tracking') },
    { value: 'TARGETING', label: t('keywordStrategy.statusLabels.targeting') },
    { value: 'RANKING', label: t('keywordStrategy.statusLabels.ranking') },
    { value: 'ARCHIVED', label: t('keywordStrategy.statusLabels.archived') },
  ];

  const getIntentLabel = (intent) => {
    const option = intentOptions.find(o => o.value === intent);
    return option?.label || intent;
  };

  const getIntentDesc = (intent) => {
    const option = intentOptions.find(o => o.value === intent);
    return option?.desc || '';
  };

  const filteredKeywords = filter === 'all'
    ? keywords
    : keywords.filter(kw => kw.status === filter.toUpperCase());

  // Stats
  const totalKeywords = keywords.length;
  const trackingCount = keywords.filter(kw => kw.status === 'TRACKING').length;
  const targetingCount = keywords.filter(kw => kw.status === 'TARGETING').length;
  const rankingCount = keywords.filter(kw => kw.status === 'RANKING').length;
  const withPosition = keywords.filter(kw => kw.position);
  const top10Count = withPosition.filter(kw => kw.position <= 10).length;

  const getDifficultyText = (level) => {
    switch (level) {
      case 'easy': return t('keywordStrategy.easy');
      case 'medium': return t('keywordStrategy.medium');
      case 'hard': return t('keywordStrategy.hard');
      default: return '';
    }
  };

  if (isSiteLoading || isLoading) {
    return <KeywordsPageSkeleton />;
  }

  if (!selectedSite) {
    return (
      <div className={styles.emptyState}>
        <Search size={32} />
        <p>{t('keywordStrategy.noSiteSelected')}</p>
      </div>
    );
  }

  return (
    <>
      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconPurple}`}>
                <Tag className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('keywordStrategy.trackedKeywords')}</span>
            <span className={styles.statValue}>{totalKeywords}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconBlue}`}>
                <BarChart3 className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('keywordStrategy.tracking')}</span>
            <span className={styles.statValue}>{trackingCount}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconGreen}`}>
                <Trophy className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('keywordStrategy.topRankings')}</span>
            <span className={styles.statValue}>{top10Count}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconOrange}`}>
                <Crosshair className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('keywordStrategy.targeting')}</span>
            <span className={styles.statValue}>{targetingCount}</span>
          </div>
        </div>
      </div>

      {/* Add Keyword */}
      {showAddForm ? (
        <div className={styles.addKeywordCard}>
          <form onSubmit={handleAddKeyword} className={styles.addKeywordForm}>
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder={t('keywordStrategy.enterKeyword')}
              className={styles.addKeywordInput}
              autoFocus
            />
            <button
              type="submit"
              className={styles.addKeywordBtn}
              disabled={addingKeyword || !newKeyword.trim()}
            >
              {addingKeyword ? <Loader2 size={14} className={styles.spinner} /> : <Plus size={14} />}
              {t('common.add')}
            </button>
            <button
              type="button"
              className={styles.addKeywordCancel}
              onClick={() => { setShowAddForm(false); setAddError(''); }}
            >
              <X size={14} />
            </button>
          </form>
          {addError && <p className={styles.addError}>{addError}</p>}
        </div>
      ) : (
        <button
          className={styles.addKeywordToggle}
          onClick={() => setShowAddForm(true)}
        >
          <Plus size={14} />
          {t('keywordStrategy.addKeyword')}
        </button>
      )}

      {/* Filter Tabs */}
      <div className={styles.filterTabs}>
        {['all', 'tracking', 'targeting', 'ranking', 'archived'].map((f) => (
          <button
            key={f}
            className={`${styles.filterTab} ${filter === f ? styles.active : ''}`}
            onClick={() => setFilter(f)}
          >
            {t(`keywordStrategy.filter.${f}`)}
            <span className={styles.filterCount}>
              {f === 'all' ? keywords.length : keywords.filter(kw => kw.status === f.toUpperCase()).length}
            </span>
          </button>
        ))}
      </div>

      {/* Keywords Table */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>{t('keywordStrategy.currentRankings')}</h3>
            <p className={styles.cardSubtitle}>
              {filteredKeywords.length} {t('keywordStrategy.keywordsFound')}
            </p>
          </div>
        </div>

        {filteredKeywords.length === 0 ? (
          <div className={styles.emptyState}>
            <Tag size={24} />
            <p>{t('keywordStrategy.noKeywords')}</p>
            <p className={styles.emptyStateHint}>{t('keywordStrategy.noKeywordsHint')}</p>
            <Link href="/dashboard/strategy/site-profile" className={styles.startInterviewBtn}>
              <Sparkles size={16} />
              {t('keywordStrategy.startInterview')}
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.tableHeader}>
              <span>{t('keywordStrategy.keyword')}</span>
              <span>{t('keywordStrategy.position')}</span>
              <span>{t('keywordStrategy.volume')}</span>
              <span>{t('keywordStrategy.intent.label')}</span>
              <span>{t('keywordStrategy.columns.relatedPost')}</span>
              <span>{t('keywordStrategy.status')}</span>
              <span></span>
            </div>
            <div className={styles.tableBody}>
              {filteredKeywords.map((kw) => {
                const diffLevel = getDifficultyLevel(kw.difficulty);
                const isUpdating = updatingKeyword === kw.id;
                return (
                  <div key={kw.id} className={styles.tableRow}>
                    <div className={styles.keywordCell}>
                      {kw.keyword}
                      {kw.tags?.includes('interview') && (
                        <span className={styles.interviewBadge}>
                          {t('keywordStrategy.fromInterview')}
                        </span>
                      )}
                      {kw.tags?.includes('gsc') && (
                        <span className={styles.gscBadge}>GSC</span>
                      )}
                      {kw.tags?.includes('manual') && (
                        <span className={styles.manualBadge}>
                          {t('keywordStrategy.fromManual')}
                        </span>
                      )}
                    </div>
                    <div className={`${styles.cell} ${styles.positionCell}`}>
                      {kw.position ? (
                        <span className={`${styles.positionBadge} ${styles[getPositionClass(kw.position)]}`}>
                          #{kw.position}
                        </span>
                      ) : (
                        <span className={styles.noData}>—</span>
                      )}
                    </div>
                    <div className={`${styles.cell} ${styles.volumeCell}`}>
                      {kw.searchVolume ? kw.searchVolume.toLocaleString() : '—'}
                    </div>
                    {/* Intent Column */}
                    <div className={`${styles.cell} ${styles.intentCell}`} ref={editingIntent === kw.id ? dropdownRef : null}>
                      <div className={styles.dropdownWrapper}>
                        {kw.intents?.length > 0 ? (
                          <div 
                            className={styles.intentBadges}
                            onClick={() => setEditingIntent(editingIntent === kw.id ? null : kw.id)}
                          >
                            {isUpdating ? (
                              <Loader2 size={12} className={styles.spinner} />
                            ) : (
                              kw.intents.map(intent => (
                                <span 
                                  key={intent}
                                  className={`${styles.intentBadge} ${styles[`intent${intent}`]} ${styles.hasTooltip}`}
                                  data-tooltip={getIntentDesc(intent)}
                                >
                                  {getIntentLabel(intent)}
                                </span>
                              ))
                            )}
                          </div>
                        ) : (
                          <button 
                            className={styles.analyzeIntentBtn}
                            onClick={() => handleAnalyzeIntent(kw.id)}
                            disabled={isUpdating}
                          >
                            {isUpdating ? <Loader2 size={12} className={styles.spinner} /> : <Sparkles size={12} />}
                            {t('keywordStrategy.setIntent')}
                          </button>
                        )}
                        {editingIntent === kw.id && (
                          <div className={styles.dropdown}>
                            {intentOptions.map((opt) => {
                              const Icon = opt.icon;
                              const isSelected = kw.intents?.includes(opt.value);
                              return (
                                <button
                                  key={opt.value}
                                  className={`${styles.dropdownItem} ${isSelected ? styles.active : ''}`}
                                  onClick={() => handleUpdateIntent(kw.id, opt.value)}
                                >
                                  <span className={styles.checkmark}>{isSelected ? '✓' : ''}</span>
                                  <Icon size={14} />
                                  {opt.label}
                                </button>
                              );
                            })}
                            {kw.intents?.length > 0 && (
                              <>
                                <div className={styles.dropdownDivider} />
                                <button
                                  className={styles.dropdownItem}
                                  onClick={() => { handleAnalyzeIntent(kw.id); setEditingIntent(null); }}
                                >
                                  <Sparkles size={14} />
                                  {t('keywordStrategy.reanalyze')}
                                </button>
                                <button
                                  className={styles.dropdownItem}
                                  onClick={() => handleClearIntents(kw.id)}
                                >
                                  <X size={14} />
                                  {t('common.clear')}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Related Post Column */}
                    <div className={`${styles.cell} ${styles.relatedPostCell}`}>
                      {kw.relatedPost ? (
                        <div className={styles.relatedPostLinks}>
                          <Link 
                            href={`/dashboard/entities/posts/${kw.relatedPost.id}`}
                            className={styles.relatedPostLink}
                            title={kw.relatedPost.title}
                          >
                            <FileText size={12} />
                          </Link>
                          {kw.relatedPost.url && (
                            <a 
                              href={kw.relatedPost.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.externalLink}
                              title={kw.relatedPost.url}
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      ) : (
                        <button 
                          className={styles.addPostBtn}
                          onClick={() => setGeneratePostKeyword(kw)}
                          title={t('keywordStrategy.generatePost')}
                        >
                          <Wand2 size={12} />
                          <Plus size={10} />
                        </button>
                      )}
                    </div>
                    {/* Status Column */}
                    <div className={`${styles.cell} ${styles.statusCell}`} ref={editingStatus === kw.id ? dropdownRef : null}>
                      <div className={styles.dropdownWrapper}>
                        <span 
                          className={`${styles.statusBadge} ${styles[`status${kw.status}`]}`}
                          onClick={() => setEditingStatus(editingStatus === kw.id ? null : kw.id)}
                        >
                          {isUpdating ? <Loader2 size={12} className={styles.spinner} /> : (t(`keywordStrategy.statusLabels.${kw.status.toLowerCase()}`) || kw.status)}
                        </span>
                        {editingStatus === kw.id && (
                          <div className={styles.dropdown}>
                            {statusOptions.map((opt) => (
                              <button
                                key={opt.value}
                                className={`${styles.dropdownItem} ${kw.status === opt.value ? styles.active : ''}`}
                                onClick={() => handleUpdateStatus(kw.id, opt.value)}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className={`${styles.cell} ${styles.actionsCell}`}>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteKeyword(kw.id)}
                        title={t('common.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      
      {/* Generate Post Modal */}
      <GeneratePostModal
        isOpen={!!generatePostKeyword}
        onClose={() => setGeneratePostKeyword(null)}
        keyword={generatePostKeyword}
        onSuccess={(content) => {
          // Refresh keywords to update related post
          fetchKeywords(selectedSite.id);
        }}
      />
    </>
  );
}
