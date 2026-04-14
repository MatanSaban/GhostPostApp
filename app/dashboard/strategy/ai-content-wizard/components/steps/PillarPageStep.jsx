'use client';

import { useState, useEffect, useRef } from 'react';
import { Globe, Search, ExternalLink, X, Loader2, Link2 } from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import styles from '../../page.module.css';

/** Safely decode a URI that may contain percent-encoded Hebrew/Unicode */
function decodeUrl(url) {
  if (!url) return '';
  try { return decodeURIComponent(url); } catch { return url; }
}

export default function PillarPageStep({ state, dispatch, translations }) {
  const t = translations.pillarPage;
  const { selectedSite } = useSite();
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState(state.pillarEntityId ? 'select' : state.pillarPageUrl ? 'custom' : 'select');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch ALL enabled entity types (posts, pages, custom post types)
  useEffect(() => {
    if (!selectedSite?.id) return;
    setLoading(true);
    fetch(`/api/entities?siteId=${selectedSite.id}&status=PUBLISHED`)
      .then(res => res.json())
      .then(data => setEntities(data.entities || []))
      .catch(() => setEntities([]))
      .finally(() => setLoading(false));
  }, [selectedSite?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = entities.filter(e => {
    const q = search.toLowerCase();
    return e.title?.toLowerCase().includes(q) ||
      e.slug?.toLowerCase().includes(q) ||
      decodeUrl(e.slug)?.toLowerCase().includes(q) ||
      e.entityType?.name?.toLowerCase().includes(q);
  });

  const selectedEntity = state.pillarEntityId
    ? entities.find(e => e.id === state.pillarEntityId)
    : null;

  const handleSelectEntity = (entity) => {
    const url = entity.wpUrl || entity.url || `/${entity.slug}`;
    dispatch({ type: 'SET_FIELD', field: 'pillarPageUrl', value: url });
    dispatch({ type: 'SET_FIELD', field: 'pillarEntityId', value: entity.id });
    setShowDropdown(false);
    setSearch('');
  };

  const handleClearSelection = () => {
    dispatch({ type: 'SET_FIELD', field: 'pillarPageUrl', value: '' });
    dispatch({ type: 'SET_FIELD', field: 'pillarEntityId', value: null });
  };

  const handleCustomUrlChange = (url) => {
    dispatch({ type: 'SET_FIELD', field: 'pillarPageUrl', value: url });
    dispatch({ type: 'SET_FIELD', field: 'pillarEntityId', value: null });
  };

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrapper}>
          <Globe className={styles.stepHeaderIcon} />
        </div>
        <div className={styles.stepInfo}>
          <h2 className={styles.stepTitle}>{t.title}</h2>
          <p className={styles.stepDescription}>{t.description}</p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className={styles.campaignToggle}>
        <button
          className={`${styles.campaignToggleBtn} ${mode === 'select' ? styles.active : ''}`}
          onClick={() => { setMode('select'); handleClearSelection(); }}
        >
          <Search size={16} />
          {t.selectEntity}
        </button>
        <button
          className={`${styles.campaignToggleBtn} ${mode === 'custom' ? styles.active : ''}`}
          onClick={() => { setMode('custom'); handleClearSelection(); }}
        >
          <Link2 size={16} />
          {t.customUrl}
        </button>
      </div>

      {mode === 'select' ? (
        <div className={styles.pillarPageSelector}>
          {/* Selected entity preview */}
          {selectedEntity ? (
            <div className={styles.pillarSelectedCard}>
              <div className={styles.pillarSelectedInfo}>
                <span className={styles.pillarSelectedTitle}>{selectedEntity.title}</span>
                <span className={styles.pillarSelectedUrl}>{decodeUrl(state.pillarPageUrl)}</span>
              </div>
              <button className={styles.pillarClearBtn} onClick={handleClearSelection}>
                <X size={16} />
              </button>
            </div>
          ) : (
            <div ref={dropdownRef} className={styles.pillarCombobox}>
              <div className={styles.pillarSearchBox}>
                <Search size={16} className={styles.pillarSearchIcon} />
                <input
                  type="text"
                  className={styles.pillarSearchInput}
                  placeholder={t.searchPlaceholder}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                />
              </div>
              {showDropdown && (
                <div className={styles.pillarDropdown}>
                  {loading ? (
                    <div className={styles.pillarDropdownLoading}>
                      <Loader2 size={20} className={styles.spinner} />
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className={styles.pillarDropdownEmpty}>{t.noResults}</div>
                  ) : (
                    filtered.slice(0, 30).map((entity) => (
                      <button
                        key={entity.id}
                        className={styles.pillarDropdownItem}
                        onClick={() => handleSelectEntity(entity)}
                      >
                        <div className={styles.pillarDropdownItemTop}>
                          <span className={styles.pillarDropdownTitle}>{entity.title}</span>
                          {entity.entityType?.name && (
                            <span className={styles.pillarDropdownTypeBadge}>{entity.entityType.name}</span>
                          )}
                        </div>
                        <span className={styles.pillarDropdownSlug}>/{decodeUrl(entity.slug)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.pillarCustomUrl}>
          <label className={styles.formLabel}>{t.customUrlLabel}</label>
          <div className={styles.pillarUrlInputWrapper}>
            <ExternalLink size={16} className={styles.pillarUrlIcon} />
            <input
              type="url"
              className={styles.pillarUrlInput}
              placeholder={t.customUrlPlaceholder}
              value={state.pillarPageUrl}
              onChange={(e) => handleCustomUrlChange(e.target.value)}
            />
          </div>
          <p className={styles.formHint}>{t.customUrlHint}</p>
        </div>
      )}

      {/* Preview when URL is set */}
      {state.pillarPageUrl && (
        <div className={styles.pillarPreview}>
          <Globe size={16} />
          <span className={styles.pillarPreviewUrl}>{decodeUrl(state.pillarPageUrl)}</span>
        </div>
      )}
    </div>
  );
}
