'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, PlayCircle, CheckCircle2, Clock, Lock, RotateCcw } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useOnboarding } from './OnboardingProvider';
import {
  GUIDES_CATALOG,
  GUIDE_CATEGORY_ORDER,
  getGuidesByCategory,
} from '@/lib/guides';
import { isGuideLaunchable } from './guideTours';
import styles from './GuidesCenter.module.css';

export function GuidesCenter({ isOpen, onClose }) {
  const { t } = useLocale();
  const { restart, closeGuide, completed, completedGuides, launchGuide } = useOnboarding();
  const [activeCategory, setActiveCategory] = useState('ALL');

  const grouped = useMemo(() => getGuidesByCategory(), []);

  if (!isOpen) return null;

  const handleReplayFirstRun = async () => {
    await restart();
    closeGuide();
    onClose();
  };

  const handleGuideClick = (guide) => {
    if (!isGuideLaunchable(guide.id)) return;
    launchGuide(guide.id);
    closeGuide();
    onClose();
  };

  const visibleCategories =
    activeCategory === 'ALL'
      ? GUIDE_CATEGORY_ORDER
      : GUIDE_CATEGORY_ORDER.filter((c) => c === activeCategory);

  const completionCount = completedGuides.length;
  const totalCount = GUIDES_CATALOG.length;

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>{t('onboarding.guidesCenter.title')}</h2>
            <p className={styles.progress}>
              {t('onboarding.guidesCenter.progress', {
                completed: completionCount,
                total: totalCount,
              })}
            </p>
          </div>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t('onboarding.common.close')}
          >
            <X size={20} />
          </button>
        </div>
        <p className={styles.subtitle}>{t('onboarding.guidesCenter.subtitle')}</p>

        {/* Featured: full first-run onboarding replay. */}
        <button
          className={`${styles.featuredItem} ${completed ? styles.featuredItemCompleted : ''}`}
          onClick={handleReplayFirstRun}
        >
          {completed ? (
            <CheckCircle2 size={22} className={styles.guideIconCompleted} />
          ) : (
            <RotateCcw size={22} className={styles.guideIcon} />
          )}
          <div className={styles.guideText}>
            <span className={styles.guideTitle}>{t('onboarding.guidesCenter.replayFirstRun')}</span>
            <span className={styles.guideHint}>
              {completed
                ? t('onboarding.guidesCenter.replayFirstRunCompletedHint')
                : t('onboarding.guidesCenter.replayFirstRunHint')}
            </span>
          </div>
        </button>

        {/* Category filter chips */}
        <div className={styles.chipRow}>
          <button
            className={`${styles.chip} ${activeCategory === 'ALL' ? styles.chipActive : ''}`}
            onClick={() => setActiveCategory('ALL')}
          >
            {t('onboarding.guidesCenter.categories.ALL')}
          </button>
          {GUIDE_CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              className={`${styles.chip} ${activeCategory === cat ? styles.chipActive : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {t(`onboarding.guidesCenter.categories.${cat}`)}
            </button>
          ))}
        </div>

        {/* Categorized guide list */}
        <div className={styles.categorySections}>
          {visibleCategories.map((cat) => {
            const guides = grouped[cat] || [];
            if (guides.length === 0) return null;
            return (
              <section key={cat} className={styles.categorySection}>
                <h3 className={styles.categoryTitle}>
                  {t(`onboarding.guidesCenter.categories.${cat}`)}
                </h3>
                <div className={styles.list}>
                  {guides.map((guide) => {
                    const done = completedGuides.includes(guide.id);
                    const launchable = isGuideLaunchable(guide.id);
                    return (
                      <button
                        key={guide.id}
                        className={[
                          styles.guideItem,
                          done ? styles.guideItemCompleted : '',
                          !launchable ? styles.guideItemDisabled : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => handleGuideClick(guide)}
                        disabled={!launchable}
                      >
                        {done ? (
                          <CheckCircle2 size={20} className={styles.guideIconCompleted} />
                        ) : launchable ? (
                          <PlayCircle size={20} className={styles.guideIcon} />
                        ) : (
                          <Lock size={20} className={styles.guideIconMuted} />
                        )}
                        <div className={styles.guideText}>
                          <span className={styles.guideTitle}>
                            {t(`onboarding.guides.${guide.id}.title`)}
                          </span>
                          <span className={styles.guideHint}>
                            {t(`onboarding.guides.${guide.id}.description`)}
                          </span>
                        </div>
                        <div className={styles.guideMeta}>
                          {guide.durationMinutes && (
                            <span className={styles.durationBadge}>
                              <Clock size={12} />
                              {t('onboarding.guidesCenter.minutes', { n: guide.durationMinutes })}
                            </span>
                          )}
                          {!launchable && (
                            <span className={styles.comingSoonBadge}>
                              {t('onboarding.guidesCenter.comingSoonBadge')}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
