'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Sparkles, Loader2, Check } from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import styles from '../../page.module.css';

export default function MainKeywordStep({ state, dispatch, translations }) {
  const t = translations.mainKeyword;
  const { selectedSite } = useSite();
  const { locale } = useLocale();
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestError, setSuggestError] = useState(null);
  const hasSuggested = useRef(false);

  // Auto-suggest when pillar page is set and keyword is empty
  useEffect(() => {
    if (
      !hasSuggested.current &&
      state.pillarPageUrl &&
      !state.mainKeyword &&
      selectedSite?.id &&
      !suggesting
    ) {
      hasSuggested.current = true;
      handleSuggest();
    }
  }, [state.pillarPageUrl, selectedSite?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSuggest = async () => {
    if (!selectedSite?.id || !state.pillarPageUrl) return;
    setSuggesting(true);
    setSuggestError(null);

    try {
      const res = await fetch('/api/campaigns/suggest-keyword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite.id,
          pillarEntityId: state.pillarEntityId || null,
          pillarPageUrl: state.pillarPageUrl,
          locale,
        }),
      });

      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestError(t.suggestError || 'Failed to get suggestions');
    } finally {
      setSuggesting(false);
    }
  };

  const selectSuggestion = (keyword) => {
    dispatch({ type: 'SET_FIELD', field: 'mainKeyword', value: keyword });
  };

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrapper}>
          <Search className={styles.stepHeaderIcon} />
        </div>
        <div className={styles.stepInfo}>
          <h2 className={styles.stepTitle}>{t.title}</h2>
          <p className={styles.stepDescription}>{t.description}</p>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>{t.label}</label>
        <input
          type="text"
          className={styles.formInput}
          placeholder={t.placeholder}
          value={state.mainKeyword}
          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'mainKeyword', value: e.target.value })}
        />
        <p className={styles.formHint}>{t.hint}</p>
      </div>

      {/* AI Suggestions */}
      {state.pillarPageUrl && (
        <div className={styles.keywordSuggestSection}>
          <button
            className={styles.keywordSuggestBtn}
            onClick={handleSuggest}
            disabled={suggesting}
          >
            {suggesting ? (
              <><Loader2 size={16} className={styles.spinner} /> {t.suggesting || 'Suggesting...'}</>
            ) : (
              <><Sparkles size={16} /> {t.suggestWithAI || 'Suggest with AI'}</>
            )}
          </button>

          {suggestError && (
            <p className={styles.keywordSuggestError}>{suggestError}</p>
          )}

          {suggestions.length > 0 && (
            <div className={styles.keywordSuggestions}>
              {suggestions.map((s, i) => {
                const isActive = state.mainKeyword === s.keyword;
                return (
                  <button
                    key={i}
                    className={`${styles.keywordSuggestionItem} ${isActive ? styles.keywordSuggestionItemActive : ''}`}
                    onClick={() => selectSuggestion(s.keyword)}
                  >
                    <div className={styles.keywordSuggestionHeader}>
                      <span className={styles.keywordSuggestionKeyword}>{s.keyword}</span>
                      {isActive && <Check size={14} className={styles.keywordSuggestionCheck} />}
                    </div>
                    <span className={styles.keywordSuggestionExplanation}>{s.explanation}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={styles.topicClusterInfo}>
        <p className={styles.topicClusterInfoText}>{t.helpText}</p>
      </div>
    </div>
  );
}
