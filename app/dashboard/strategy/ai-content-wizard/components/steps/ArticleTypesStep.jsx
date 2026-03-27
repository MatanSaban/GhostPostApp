'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Plus, Minus, Info, X } from 'lucide-react';
import { ARTICLE_TYPES, ARTICLE_TYPE_KEY_MAP } from '../../wizardConfig';
import styles from '../../page.module.css';

function ArticleTypeInfoPopup({ type, typeT, wordRange, onClose, t }) {
  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.articleInfoPopup} onClick={(e) => e.stopPropagation()}>
        <button className={styles.articleInfoClose} onClick={onClose}>
          <X size={18} />
        </button>
        <div className={styles.articleInfoHeader}>
          <div className={styles.articleInfoIconBadge}>
            <FileText size={22} />
          </div>
          <h3 className={styles.articleInfoTitle}>{typeT.label}</h3>
        </div>

        <div className={styles.articleInfoSection}>
          <span className={styles.articleInfoSectionTitle}>{t.whatIsThis}</span>
          <p className={styles.articleInfoText}>{typeT.description}</p>
        </div>

        <div className={styles.articleInfoSection}>
          <span className={styles.articleInfoSectionTitle}>{t.exampleLabel}</span>
          <div className={styles.articleInfoExample}>
            {typeT.example}
          </div>
        </div>

        <div className={styles.articleInfoSection}>
          <span className={styles.articleInfoSectionTitle}>{t.wordRangeLabel}</span>
          <p className={styles.articleInfoText}>{wordRange}</p>
        </div>

        <button className={styles.articleInfoDismiss} onClick={onClose}>
          {t.gotIt}
        </button>
      </div>
    </div>,
    document.body
  );
}

export default function ArticleTypesStep({ state, dispatch, translations }) {
  const t = translations.articleTypes;
  const isSinglePost = state.postsCount === 1;
  const [infoType, setInfoType] = useState(null);
  const [maxTypesPopup, setMaxTypesPopup] = useState(false);

  const selectedIds = new Set(state.articleTypes.map(at => at.id));
  const totalAllocated = state.articleTypes.reduce((sum, at) => sum + at.count, 0);

  const handleToggleType = (typeId) => {
    if (isSinglePost) {
      dispatch({
        type: 'SET_FIELD',
        field: 'articleTypes',
        value: [{ id: typeId, count: 1 }],
      });
      return;
    }

    if (selectedIds.has(typeId)) {
      // Deselect - must keep at least one
      if (state.articleTypes.length <= 1) return;

      const remaining = state.articleTypes.filter(at => at.id !== typeId);
      // Redistribute postsCount evenly among remaining types
      const perType = Math.floor(state.postsCount / remaining.length);
      const remainder = state.postsCount % remaining.length;
      const redistributed = remaining.map((at, i) => ({
        ...at,
        count: perType + (i < remainder ? 1 : 0),
      }));
      dispatch({ type: 'SET_FIELD', field: 'articleTypes', value: redistributed });
    } else {
      // Can't have more types than posts (each type needs at least 1 post)
      if (state.articleTypes.length >= state.postsCount) {
        setMaxTypesPopup(true);
        return;
      }

      // Select new type - redistribute postsCount evenly among all types
      const newTypes = [...state.articleTypes, { id: typeId, count: 0 }];
      const perType = Math.floor(state.postsCount / newTypes.length);
      const remainder = state.postsCount % newTypes.length;
      const redistributed = newTypes.map((at, i) => ({
        ...at,
        count: perType + (i < remainder ? 1 : 0),
      }));
      dispatch({ type: 'SET_FIELD', field: 'articleTypes', value: redistributed });
    }
  };

  const handleCountChange = (typeId, delta) => {
    const updated = state.articleTypes.map(at => {
      if (at.id !== typeId) return at;
      const newCount = at.count + delta;
      if (newCount < 1) return at;
      return { ...at, count: newCount };
    });

    const newTotal = updated.reduce((sum, at) => sum + at.count, 0);
    if (newTotal > state.postsCount && delta > 0) return;

    dispatch({ type: 'SET_FIELD', field: 'articleTypes', value: updated });
  };

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrapper}>
          <FileText className={styles.stepHeaderIcon} />
        </div>
        <div className={styles.stepInfo}>
          <h2 className={styles.stepTitle}>{t.title}</h2>
          <p className={styles.stepDescription}>{t.description}</p>
        </div>
      </div>

      <div className={styles.articleTypesGrid}>
        {ARTICLE_TYPES.map((type) => {
          const key = ARTICLE_TYPE_KEY_MAP[type.id];
          const typeT = t.types[key];
          const isSelected = selectedIds.has(type.id);
          const selectedType = state.articleTypes.find(at => at.id === type.id);

          return (
            <div
              key={type.id}
              className={`${styles.articleTypeCard} ${isSelected ? styles.selected : ''}`}
              onClick={() => handleToggleType(type.id)}
            >
              <div className={styles.articleTypeHeaderRow}>
                <div className={styles.articleTypeLeft}>
                  <span className={styles.articleTypeCheckbox}>
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path d="M11.5 3.5L5.5 10.5L2.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <span className={styles.articleTypeName}>{typeT.label}</span>
                </div>
                <button
                  className={styles.articleTypeInfoBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setInfoType({ type, typeT });
                  }}
                >
                  <Info size={16} />
                </button>
              </div>

              {/* Count stepper for multi-post mode */}
              {!isSinglePost && isSelected && (
                <div className={styles.articleTypeCount} onClick={(e) => e.stopPropagation()}>
                  <button
                    className={styles.countBtn}
                    onClick={() => handleCountChange(type.id, -1)}
                    disabled={selectedType?.count <= 1}
                  >
                    <Minus size={14} />
                  </button>
                  <span className={styles.countValue}>
                    {selectedType?.count || 0} {t.postsOfType}
                  </span>
                  <button
                    className={styles.countBtn}
                    onClick={() => handleCountChange(type.id, 1)}
                    disabled={totalAllocated >= state.postsCount}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      {!isSinglePost && (
        <div className={styles.articleTypeSummary}>
          <span>{t.total}: {totalAllocated} {t.of} {state.postsCount} {t.postsOfType}</span>
          {totalAllocated < state.postsCount && (
            <span className={styles.allocationWarning}>
              ({state.postsCount - totalAllocated} {t.unallocated})
            </span>
          )}
        </div>
      )}

      {/* Info popup */}
      {infoType && (
        <ArticleTypeInfoPopup
          type={infoType.type}
          typeT={infoType.typeT}
          wordRange={t.wordRange
            .replace('{min}', infoType.type.minWords.toLocaleString())
            .replace('{max}', infoType.type.maxWords.toLocaleString())}
          onClose={() => setInfoType(null)}
          t={t}
        />
      )}

      {/* Max types popup */}
      {maxTypesPopup && createPortal(
        <div className={styles.modalOverlay} onClick={() => setMaxTypesPopup(false)}>
          <div className={styles.validationPopup} onClick={(e) => e.stopPropagation()}>
            <button className={styles.validationPopupClose} onClick={() => setMaxTypesPopup(false)}>
              <X size={18} />
            </button>
            <div className={styles.validationPopupIcon}>
              <Info size={28} />
            </div>
            <p className={styles.validationPopupMessage}>
              {t.maxTypesError.replaceAll('{count}', state.postsCount)}
            </p>
            <button className={styles.validationPopupBtn} onClick={() => setMaxTypesPopup(false)}>
              {t.gotIt}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
