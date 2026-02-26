'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Plus, Loader2, ExternalLink, Globe, Check } from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import styles from '../../page.module.css';

export default function KeywordsStep({ state, dispatch, translations }) {
  const t = translations.keywords;
  const { selectedSite } = useSite();
  const [keywords, setKeywords] = useState([]);
  const [gscQueries, setGscQueries] = useState([]);
  const [loadingKeywords, setLoadingKeywords] = useState(true);
  const [loadingGsc, setLoadingGsc] = useState(false);
  const [gscLoaded, setGscLoaded] = useState(false);
  const [gscConnected, setGscConnected] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [gscSearchQuery, setGscSearchQuery] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [connectingGsc, setConnectingGsc] = useState(false);
  const [tab, setTab] = useState('list'); // 'list' | 'gsc' | 'manual'

  // GSC site picker state
  const [showSitePicker, setShowSitePicker] = useState(false);
  const [gscSites, setGscSites] = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [savingSite, setSavingSite] = useState(false);

  useEffect(() => {
    if (!selectedSite?.id) return;
    fetchKeywords();
  }, [selectedSite?.id]);

  // Fetch GSC queries when GSC tab is first opened
  useEffect(() => {
    if (tab === 'gsc' && !gscLoaded && selectedSite?.id) {
      fetchGscQueries();
    }
  }, [tab, gscLoaded, selectedSite?.id]);

  const fetchKeywords = async () => {
    try {
      setLoadingKeywords(true);
      const res = await fetch(`/api/keywords?siteId=${selectedSite.id}`);
      const data = await res.json();
      setKeywords(data.keywords || []);
    } catch (err) {
      console.error('Failed to fetch keywords:', err);
    } finally {
      setLoadingKeywords(false);
    }
  };

  const fetchGscQueries = async () => {
    try {
      setLoadingGsc(true);
      const res = await fetch(`/api/dashboard/stats/gsc?siteId=${selectedSite.id}&section=topKeywords`);
      const data = await res.json();
      setGscQueries(data.topQueries || []);
      // gsc === null means GSC is not connected
      setGscConnected(data.gsc !== null || (data.topQueries && data.topQueries.length > 0));
      setGscLoaded(true);
    } catch (err) {
      console.error('Failed to fetch GSC queries:', err);
    } finally {
      setLoadingGsc(false);
    }
  };

  const loadGscSites = useCallback(async () => {
    if (!selectedSite?.id) return;
    setLoadingSites(true);
    try {
      const res = await fetch('/api/settings/integrations/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-sites', siteId: selectedSite.id }),
      });
      const data = await res.json();
      if (data.needsScopes) {
        // Need to re-auth with GSC scopes
        setShowSitePicker(false);
        handleConnectGsc();
        return;
      }
      setGscSites(data.sites || []);
      setShowSitePicker(true);
    } catch (err) {
      console.error('Failed to load GSC sites:', err);
    } finally {
      setLoadingSites(false);
    }
  }, [selectedSite?.id]);

  const saveGscSite = useCallback(async (gscSiteUrl) => {
    if (!selectedSite?.id) return;
    setSavingSite(true);
    try {
      await fetch('/api/settings/integrations/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-gsc', siteId: selectedSite.id, gscSiteUrl }),
      });
      setShowSitePicker(false);
      setGscConnected(true);
      setGscLoaded(false);
      fetchGscQueries();
    } catch (err) {
      console.error('Failed to save GSC site:', err);
    } finally {
      setSavingSite(false);
    }
  }, [selectedSite?.id]);

  const handleConnectGsc = useCallback(async () => {
    if (!selectedSite?.id) return;
    try {
      setConnectingGsc(true);
      const res = await fetch('/api/settings/integrations/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', siteId: selectedSite.id, fromInterview: true }),
      });
      const data = await res.json();
      if (!data.authUrl) return;

      const popup = window.open(data.authUrl, 'google-oauth', 'width=500,height=650,scrollbars=yes,resizable=yes');

      const onMessage = (event) => {
        if (event.data?.type === 'google-integration-success') {
          window.removeEventListener('message', onMessage);
          // After OAuth success, load available GSC sites for selection
          loadGscSites();
        }
        if (event.data?.type === 'google-integration-error') {
          window.removeEventListener('message', onMessage);
        }
      };
      window.addEventListener('message', onMessage);
    } catch (err) {
      console.error('Failed to start GSC connection:', err);
    } finally {
      setConnectingGsc(false);
    }
  }, [selectedSite?.id, loadGscSites]);

  const toggleKeyword = (keywordId) => {
    const selected = state.selectedKeywordIds;
    const updated = selected.includes(keywordId)
      ? selected.filter(id => id !== keywordId)
      : [...selected, keywordId];
    dispatch({ type: 'SET_FIELD', field: 'selectedKeywordIds', value: updated });
  };

  const toggleGscQuery = (query) => {
    const manual = state.manualKeywords;
    if (manual.includes(query)) {
      dispatch({ type: 'SET_FIELD', field: 'manualKeywords', value: manual.filter(k => k !== query) });
    } else {
      dispatch({ type: 'SET_FIELD', field: 'manualKeywords', value: [...manual, query] });
    }
  };

  const addManualKeyword = () => {
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    if (state.manualKeywords.includes(trimmed)) return;
    dispatch({
      type: 'SET_FIELD',
      field: 'manualKeywords',
      value: [...state.manualKeywords, trimmed],
    });
    setManualInput('');
  };

  const removeManualKeyword = (keyword) => {
    dispatch({
      type: 'SET_FIELD',
      field: 'manualKeywords',
      value: state.manualKeywords.filter(k => k !== keyword),
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addManualKeyword();
    }
  };

  const filteredKeywords = keywords.filter(kw =>
    kw.keyword.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGsc = gscQueries.filter(q =>
    q.query.toLowerCase().includes(gscSearchQuery.toLowerCase())
  );

  const totalSelected = state.selectedKeywordIds.length + state.manualKeywords.length;

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

      {totalSelected > 0 && (
        <div className={styles.selectedCount}>
          {t.selected.replace('{count}', totalSelected)}
        </div>
      )}

      {/* Tab toggle */}
      <div className={styles.keywordsTabToggle}>
        <button
          className={`${styles.keywordsTab} ${tab === 'list' ? styles.active : ''}`}
          onClick={() => setTab('list')}
        >
          {t.selectFromList}
        </button>
        <button
          className={`${styles.keywordsTab} ${tab === 'gsc' ? styles.active : ''}`}
          onClick={() => setTab('gsc')}
        >
          {t.fromGSC}
        </button>
        <button
          className={`${styles.keywordsTab} ${tab === 'manual' ? styles.active : ''}`}
          onClick={() => setTab('manual')}
        >
          {t.addManual}
        </button>
      </div>

      {tab === 'list' && (
        <div className={styles.keywordsListSection}>
          <div className={styles.keywordsSearch}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
            />
          </div>

          {loadingKeywords ? (
            <div className={styles.loadingState}>
              <Loader2 className={styles.spinner} size={24} />
            </div>
          ) : filteredKeywords.length === 0 ? (
            <p className={styles.emptyKeywords}>{t.noKeywords}</p>
          ) : (
            <div className={styles.keywordsCheckboxList}>
              {filteredKeywords.map((kw) => (
                <label key={kw.id} className={styles.keywordItem}>
                  <input
                    type="checkbox"
                    checked={state.selectedKeywordIds.includes(kw.id)}
                    onChange={() => toggleKeyword(kw.id)}
                    className={styles.keywordCheckbox}
                  />
                  <span className={styles.keywordText}>{kw.keyword}</span>
                  {kw.searchVolume != null && (
                    <span className={styles.keywordVolume}>{kw.searchVolume.toLocaleString()}</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'gsc' && (
        <div className={styles.keywordsListSection}>
          <div className={styles.keywordsSearch}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              value={gscSearchQuery}
              onChange={(e) => setGscSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
            />
          </div>

          {loadingGsc ? (
            <div className={styles.loadingState}>
              <Loader2 className={styles.spinner} size={24} />
            </div>
          ) : filteredGsc.length === 0 && !gscSearchQuery ? (
            <div className={styles.emptyGscState}>
              <p className={styles.emptyKeywords}>{gscConnected ? t.noGSCData : t.noGSC}</p>
              {!gscConnected && (
                <button
                  className={styles.connectGscBtn}
                  onClick={handleConnectGsc}
                  disabled={connectingGsc}
                >
                  {connectingGsc ? (
                    <Loader2 size={15} className={styles.spinner} />
                  ) : (
                    <ExternalLink size={15} />
                  )}
                  {t.connectGSC}
                </button>
              )}
            </div>
          ) : filteredGsc.length === 0 ? (
            <p className={styles.emptyKeywords}>{t.noResults}</p>
          ) : (
            <div className={styles.keywordsCheckboxList}>
              {filteredGsc.map((q) => (
                <label key={q.query} className={styles.keywordItem}>
                  <input
                    type="checkbox"
                    checked={state.manualKeywords.includes(q.query)}
                    onChange={() => toggleGscQuery(q.query)}
                    className={styles.keywordCheckbox}
                  />
                  <span className={styles.keywordText}>{q.query}</span>
                  <div className={styles.gscMetrics}>
                    <span className={styles.gscMetric} title={t.clicks}>
                      {q.clicks}
                    </span>
                    <span className={styles.gscMetricSep}>/</span>
                    <span className={styles.gscMetric} title={t.impressions}>
                      {q.impressions}
                    </span>
                    {q.position && (
                      <span className={styles.keywordVolume}>#{q.position}</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'manual' && (
        <div className={styles.manualKeywordsSection}>
          <div className={styles.manualKeywordInput}>
            <input
              type="text"
              className={styles.formInput}
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.manualPlaceholder}
            />
            <button className={styles.manualAddBtn} onClick={addManualKeyword}>
              <Plus size={16} />
            </button>
          </div>

          {state.manualKeywords.length > 0 && (
            <div className={styles.manualKeywordTags}>
              {state.manualKeywords.map((kw) => (
                <span key={kw} className={styles.keywordTag}>
                  {kw}
                  <button className={styles.keywordTagRemove} onClick={() => removeManualKeyword(kw)}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GSC Site Picker Popup */}
      {showSitePicker && typeof document !== 'undefined' && createPortal(
        <div className={styles.modalOverlay}>
          <div className={styles.validationPopup} style={{ maxWidth: 480 }}>
            <button className={styles.validationPopupClose} onClick={() => setShowSitePicker(false)}>
              <X size={16} />
            </button>
            <div className={styles.validationPopupIcon}>
              <Globe size={28} />
            </div>
            <h3 className={styles.gscPickerTitle}>{t.selectGSCSite}</h3>
            <p className={styles.gscPickerDesc}>{t.selectGSCSiteDesc}</p>

            {loadingSites ? (
              <div className={styles.gscPickerLoading}>
                <Loader2 size={24} className={styles.spinner} />
              </div>
            ) : gscSites.length === 0 ? (
              <p className={styles.gscPickerEmpty}>{t.noGSCSites}</p>
            ) : (
              <div className={styles.gscPickerList}>
                {gscSites.map((site) => {
                  const cleanUrl = site.siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '');
                  const permLabel = site.permissionLevel === 'siteOwner' ? (t.permOwner || 'Owner')
                    : site.permissionLevel === 'siteFullUser' ? (t.permFull || 'Full Access')
                    : site.permissionLevel === 'siteRestrictedUser' ? (t.permRestricted || 'Restricted')
                    : (t.permUnverified || 'Unverified');
                  const isOwner = site.permissionLevel === 'siteOwner';
                  return (
                    <button
                      key={site.siteUrl}
                      className={styles.gscPickerItem}
                      onClick={() => saveGscSite(site.siteUrl)}
                      disabled={savingSite}
                    >
                      <div className={styles.gscPickerItemInfo}>
                        <div className={styles.gscPickerItemName}>
                          <Globe size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                          {cleanUrl}
                        </div>
                        <div className={styles.gscPickerItemMeta}>
                          <span className={`${styles.gscPermBadge} ${isOwner ? styles.gscPermOwner : styles.gscPermOther}`}>
                            {permLabel}
                          </span>
                          {site.siteUrl.startsWith('sc-domain:') && (
                            <span className={styles.gscDomainTag}>{t.domainProperty || 'Domain Property'}</span>
                          )}
                        </div>
                      </div>
                      {savingSite && <Loader2 size={14} className={styles.spinner} />}
                    </button>
                  );
                })}
              </div>
            )}

            <button className={styles.validationPopupBtn} onClick={() => setShowSitePicker(false)}>
              {t.cancel || 'Cancel'}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
