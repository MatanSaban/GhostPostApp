'use client';

import { useState, useRef, useEffect } from 'react';
import { Settings, ChevronDown, FileText } from 'lucide-react';
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

export default function ContentSettingsStep({ state, dispatch, translations }) {
  const t = translations.contentSettings;
  const settings = state.contentSettings;
  const { selectedSite } = useSite();
  const isHebrew = selectedSite?.contentLanguage === 'he';
  const [openAccordion, setOpenAccordion] = useState(
    () => state.articleTypes[0]?.id || null
  );

  const toggleAccordion = (typeId) => {
    setOpenAccordion(prev => prev === typeId ? null : typeId);
  };

  const updateTypeSetting = (typeId, key, value, typeDef) => {
    const current = getTypeSettings(settings, typeId, typeDef);
    dispatch({
      type: 'SET_FIELD',
      field: 'contentSettings',
      value: {
        ...settings,
        [typeId]: { ...current, [key]: value },
      },
    });
  };

  const handleWordCountBlur = (typeId, value, min, max, typeDef) => {
    const clamped = Math.max(min, Math.min(max, value || min));
    updateTypeSetting(typeId, 'wordCount', clamped, typeDef);
  };

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrapper}>
          <Settings className={styles.stepHeaderIcon} />
        </div>
        <div className={styles.stepInfo}>
          <h2 className={styles.stepTitle}>{t.title}</h2>
          <p className={styles.stepDescription}>{t.description}</p>
        </div>
      </div>

      {/* Accordion per article type */}
      <div className={styles.accordionList}>
        {state.articleTypes.map(({ id: typeId, count }) => {
          const typeDef = ARTICLE_TYPES.find(at => at.id === typeId);
          if (!typeDef) return null;
          const key = ARTICLE_TYPE_KEY_MAP[typeId];
          const typeT = translations.articleTypes.types[key];
          const typeLabel = typeT?.label || typeId;
          const isOpen = openAccordion === typeId;
          const ts = getTypeSettings(settings, typeId, typeDef);
          const maxImages = Math.max(1, Math.floor(ts.wordCount / 500));

          return (
            <AccordionItem
              key={typeId}
              isOpen={isOpen}
              onToggle={() => toggleAccordion(typeId)}
              label={typeLabel}
              count={count}
              postsLabel={translations.articleTypes.postsOfType}
            >
              <div className={styles.accordionBody}>
                {/* Word Count */}
                <div className={styles.accordionSettingRow}>
                  <label className={styles.settingLabel}>
                    {t.wordCountLabel.replace('{type}', typeLabel)}
                  </label>
                  <span className={styles.settingHint}>
                    {t.recommended
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
                      onChange={(e) => updateTypeSetting(typeId, 'wordCount', parseInt(e.target.value), typeDef)}
                      className={styles.rangeInput}
                    />
                    <input
                      type="number"
                      className={styles.numberInput}
                      min={typeDef.minWords}
                      max={typeDef.maxWords}
                      value={ts.wordCount}
                      onChange={(e) => updateTypeSetting(typeId, 'wordCount', parseInt(e.target.value) || 0, typeDef)}
                      onBlur={(e) => handleWordCountBlur(typeId, parseInt(e.target.value), typeDef.minWords, typeDef.maxWords, typeDef)}
                    />
                    <span className={styles.wordCountHint}>{t.words}</span>
                  </div>
                </div>

                {/* Toggles */}
                <div className={styles.settingsToggles}>
                  <ToggleSetting
                    checked={ts.featuredImage}
                    onChange={(v) => updateTypeSetting(typeId, 'featuredImage', v, typeDef)}
                    label={t.featuredImage}
                  />

                  <ToggleSetting
                    checked={ts.contentImages}
                    onChange={(v) => updateTypeSetting(typeId, 'contentImages', v, typeDef)}
                    label={t.contentImages}
                  />

                  {ts.contentImages && (
                    <div className={styles.subSettingRow}>
                      <label className={styles.settingLabel}>{t.contentImagesCount}</label>
                      <div className={styles.contentImagesRange}>
                        <input
                          type="range"
                          min={1}
                          max={maxImages}
                          value={Math.min(ts.contentImagesCount, maxImages)}
                          onChange={(e) => updateTypeSetting(typeId, 'contentImagesCount', parseInt(e.target.value), typeDef)}
                          className={styles.rangeInput}
                        />
                        <span className={styles.rangeValue}>{ts.contentImagesCount} {t.images}</span>
                      </div>
                    </div>
                  )}

                  {isHebrew && (
                    <ToggleSetting
                      checked={ts.hebrewSlug}
                      onChange={(v) => updateTypeSetting(typeId, 'hebrewSlug', v, typeDef)}
                      label={t.hebrewSlug}
                      hint={t.hebrewSlugHint}
                    />
                  )}

                  <ToggleSetting
                    checked={ts.metaTitle}
                    onChange={(v) => updateTypeSetting(typeId, 'metaTitle', v, typeDef)}
                    label={t.metaTitle}
                  />

                  <ToggleSetting
                    checked={ts.metaDescription}
                    onChange={(v) => updateTypeSetting(typeId, 'metaDescription', v, typeDef)}
                    label={t.metaDescription}
                  />

                  <ToggleSetting
                    checked={ts.faq}
                    onChange={(v) => updateTypeSetting(typeId, 'faq', v, typeDef)}
                    label={t.faq}
                  />
                </div>
              </div>
            </AccordionItem>
          );
        })}
      </div>
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
