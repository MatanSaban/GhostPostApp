'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Plus, Minus, Info, X, Settings, ChevronDown } from 'lucide-react';
import { ARTICLE_TYPES, ARTICLE_TYPE_KEY_MAP } from '../../wizardConfig';
import { useSite } from '@/app/context/site-context';
import styles from '../../page.module.css';

const DEFAULT_TYPE_SETTINGS = {
  wordCount: 0,
  featuredImage: true,
  contentImages: true,
  contentImagesCount: 2,
  hebrewSlug: false,
  metaTitle: true,
  metaDescription: true,
  faq: true,
};

function getTypeSettings(settings, typeId, typeDef) {
  const saved = settings[typeId];
  if (saved) return saved;
  return {
    ...DEFAULT_TYPE_SETTINGS,
    wordCount: Math.floor((typeDef.minWords + typeDef.maxWords) / 2),
  };
}

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
  const tSettings = translations.contentSettings;
  const isSinglePost = state.postsCount === 1;
  const [infoType, setInfoType] = useState(null);
  const [maxTypesPopup, setMaxTypesPopup] = useState(false);
  const { selectedSite } = useSite();
  const isHebrew = selectedSite?.contentLanguage === 'he';
  const settings = state.contentSettings;
  const [openAccordion, setOpenAccordion] = useState(null);

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

      {/* Content Settings Section */}
      {state.articleTypes.length > 0 && (
        <div className={styles.contentSettingsSection}>
          <div className={styles.contentSettingsSectionHeader}>
            <Settings size={18} />
            <h3>{tSettings.title}</h3>
          </div>
          <p className={styles.contentSettingsSectionDesc}>{tSettings.description}</p>

          <div className={styles.accordionList}>
            {state.articleTypes.map(({ id: typeId, count }) => {
              const typeDef = ARTICLE_TYPES.find(at => at.id === typeId);
              if (!typeDef) return null;
              const key = ARTICLE_TYPE_KEY_MAP[typeId];
              const typeT = t.types[key];
              const typeLabel = typeT?.label || typeId;
              const isOpen = openAccordion === typeId;
              const ts = getTypeSettings(settings, typeId, typeDef);
              const maxImages = Math.max(1, Math.floor(ts.wordCount / 500));

              const updateTypeSetting = (settingKey, value) => {
                const current = getTypeSettings(settings, typeId, typeDef);
                dispatch({
                  type: 'SET_FIELD',
                  field: 'contentSettings',
                  value: { ...settings, [typeId]: { ...current, [settingKey]: value } },
                });
              };

              return (
                <AccordionItem
                  key={typeId}
                  isOpen={isOpen}
                  onToggle={() => setOpenAccordion(prev => prev === typeId ? null : typeId)}
                  label={typeLabel}
                  count={count}
                  postsLabel={t.postsOfType}
                >
                  <div className={styles.accordionBody}>
                    <div className={styles.accordionSettingRow}>
                      <label className={styles.settingLabel}>
                        {tSettings.wordCountLabel.replace('{type}', typeLabel)}
                      </label>
                      <span className={styles.settingHint}>
                        {tSettings.recommended
                          .replace('{min}', typeDef.minWords.toLocaleString())
                          .replace('{max}', typeDef.maxWords.toLocaleString())}
                      </span>
                      <div className={styles.wordCountInput}>
                        <input
                          type="range"
                          min={typeDef.minWords}
                          max={typeDef.maxWords}
                          step={50}
                          value={ts.wordCount}
                          onChange={(e) => updateTypeSetting('wordCount', parseInt(e.target.value))}
                          className={styles.rangeInput}
                        />
                        <input
                          type="number"
                          className={styles.numberInput}
                          min={typeDef.minWords}
                          max={typeDef.maxWords}
                          value={ts.wordCount}
                          onChange={(e) => updateTypeSetting('wordCount', parseInt(e.target.value) || 0)}
                          onBlur={(e) => {
                            const clamped = Math.max(typeDef.minWords, Math.min(typeDef.maxWords, parseInt(e.target.value) || typeDef.minWords));
                            updateTypeSetting('wordCount', clamped);
                          }}
                        />
                        <span className={styles.wordCountHint}>{tSettings.words}</span>
                      </div>
                    </div>

                    <div className={styles.settingsToggles}>
                      <ToggleSetting
                        checked={ts.featuredImage}
                        onChange={(v) => updateTypeSetting('featuredImage', v)}
                        label={tSettings.featuredImage}
                      />
                      <ToggleSetting
                        checked={ts.contentImages}
                        onChange={(v) => updateTypeSetting('contentImages', v)}
                        label={tSettings.contentImages}
                      />
                      {ts.contentImages && (
                        <div className={styles.subSettingRow}>
                          <label className={styles.settingLabel}>{tSettings.contentImagesCount}</label>
                          <div className={styles.contentImagesRange}>
                            <input
                              type="range"
                              min={1}
                              max={maxImages}
                              value={Math.min(ts.contentImagesCount, maxImages)}
                              onChange={(e) => updateTypeSetting('contentImagesCount', parseInt(e.target.value))}
                              className={styles.rangeInput}
                            />
                            <span className={styles.rangeValue}>{ts.contentImagesCount} {tSettings.images}</span>
                          </div>
                        </div>
                      )}
                      {isHebrew && (
                        <ToggleSetting
                          checked={ts.hebrewSlug}
                          onChange={(v) => updateTypeSetting('hebrewSlug', v)}
                          label={tSettings.hebrewSlug}
                          hint={tSettings.hebrewSlugHint}
                        />
                      )}
                      <ToggleSetting
                        checked={ts.metaTitle}
                        onChange={(v) => updateTypeSetting('metaTitle', v)}
                        label={tSettings.metaTitle}
                      />
                      <ToggleSetting
                        checked={ts.metaDescription}
                        onChange={(v) => updateTypeSetting('metaDescription', v)}
                        label={tSettings.metaDescription}
                      />
                      <ToggleSetting
                        checked={ts.faq}
                        onChange={(v) => updateTypeSetting('faq', v)}
                        label={tSettings.faq}
                      />
                    </div>
                  </div>
                </AccordionItem>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AccordionItem({ isOpen, onToggle, label, count, postsLabel, children }) {
  const contentRef = useRef(null);
  const [height, setHeight] = useState(isOpen ? 'auto' : '0px');

  useEffect(() => {
    if (!contentRef.current) return;
    if (isOpen) {
      setHeight(`${contentRef.current.scrollHeight}px`);
      const timeout = setTimeout(() => setHeight('auto'), 250);
      return () => clearTimeout(timeout);
    } else {
      setHeight(`${contentRef.current.scrollHeight}px`);
      requestAnimationFrame(() => setHeight('0px'));
    }
  }, [isOpen]);

  return (
    <div className={`${styles.accordionItem} ${isOpen ? styles.accordionItemOpen : ''}`}>
      <button className={styles.accordionHeader} onClick={onToggle}>
        <div className={styles.accordionHeaderLeft}>
          <FileText size={18} className={styles.accordionTypeIcon} />
          <span className={styles.accordionLabel}>{label}</span>
          <span className={styles.accordionBadge}>{count} {postsLabel}</span>
        </div>
        <ChevronDown
          size={18}
          className={`${styles.accordionChevron} ${isOpen ? styles.accordionChevronOpen : ''}`}
        />
      </button>
      <div
        ref={contentRef}
        className={styles.accordionContent}
        style={{ maxHeight: height }}
      >
        {children}
      </div>
    </div>
  );
}

function ToggleSetting({ checked, onChange, label, hint }) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleInfo}>
        <span className={styles.toggleLabel}>{label}</span>
        {hint && <span className={styles.toggleHint}>{hint}</span>}
      </div>
      <button
        className={`${styles.toggleSwitch} ${checked ? styles.active : ''}`}
        onClick={() => onChange(!checked)}
      >
        <div className={styles.toggleKnob} />
      </button>
    </div>
  );
}
