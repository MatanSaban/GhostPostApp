'use client';

import { useState, useEffect, useCallback } from 'react';
import { Link2, ExternalLink, Globe, Tag, Languages, Search, X, Shield, ShoppingBag, DollarSign, Plus, Loader2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { useSite } from '@/app/context/site-context';
import styles from '../backlinks.module.css';

// ──────────────────────────────────────────────
// Create Listing Modal
// ──────────────────────────────────────────────
function CreateListingModal({ userSites, t, onClose, onSubmit }) {
  const [selectedSiteIdx, setSelectedSiteIdx] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [language, setLanguage] = useState('en');
  const [linkType, setLinkType] = useState('DOFOLLOW');
  const [domainAuthority, setDomainAuthority] = useState('');
  const [domainRating, setDomainRating] = useState('');
  const [monthlyTraffic, setMonthlyTraffic] = useState('');
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsSources, setMetricsSources] = useState([]);
  const [metricsAutoMode, setMetricsAutoMode] = useState(null); // null=unknown, true=API on, false=manual
  const [pricingType, setPricingType] = useState('money');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [aiCreditsPrice, setAiCreditsPrice] = useState('');
  const [maxSlots, setMaxSlots] = useState('');
  const [turnaroundDays, setTurnaroundDays] = useState('7');
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedSite = selectedSiteIdx !== '' ? userSites[Number(selectedSiteIdx)] : null;
  const domain = selectedSite ? selectedSite.siteUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';

  // Auto-fill category and language when a site is selected
  useEffect(() => {
    if (selectedSite) {
      if (selectedSite.businessCategory) setCategory(selectedSite.businessCategory);
      if (selectedSite.contentLanguage) setLanguage(selectedSite.contentLanguage);
    } else {
      setCategory('');
      setLanguage('en');
    }
  }, [selectedSite]);

  // Auto-fetch DA/DR/traffic when site changes (only if API is enabled)
  useEffect(() => {
    if (!domain) {
      setDomainAuthority('');
      setDomainRating('');
      setMonthlyTraffic('');
      setMetricsSources([]);
      return;
    }

    let cancelled = false;
    setMetricsLoading(true);
    setDomainAuthority('');
    setDomainRating('');
    setMonthlyTraffic('');
    setMetricsSources([]);

    fetch(`/api/backlinks/domain-metrics?domain=${encodeURIComponent(domain)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setMetricsAutoMode(data.enabled === true);
        if (data.enabled) {
          if (data.domainAuthority != null) setDomainAuthority(String(data.domainAuthority));
          if (data.domainRating != null) setDomainRating(String(data.domainRating));
          if (data.monthlyTraffic != null) setMonthlyTraffic(String(data.monthlyTraffic));
          setMetricsSources(data.sources || []);
        }
      })
      .catch(() => { setMetricsAutoMode(false); })
      .finally(() => { if (!cancelled) setMetricsLoading(false); });

    return () => { cancelled = true; };
  }, [domain]);

  const isManualMetrics = metricsAutoMode !== true;

  // Group sites by account
  const sitesByAccount = userSites.reduce((acc, site, idx) => {
    const key = site.accountId;
    if (!acc[key]) acc[key] = { accountName: site.accountName, sites: [] };
    acc[key].sites.push({ ...site, _idx: idx });
    return acc;
  }, {});

  const canSubmit = selectedSite && !selectedSite.hasActiveListing && title.trim() && !isProcessing;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsProcessing(true);
    try {
      await onSubmit({
        accountId: selectedSite.accountId,
        siteId: selectedSite.siteId,
        domain,
        title,
        description,
        category,
        language,
        linkType,
        domainAuthority: domainAuthority ? parseInt(domainAuthority, 10) : null,
        domainRating: domainRating ? parseInt(domainRating, 10) : null,
        monthlyTraffic: monthlyTraffic ? parseInt(monthlyTraffic, 10) : null,
        price: pricingType === 'money' && price ? parseFloat(price) : null,
        currency: pricingType === 'money' ? currency : null,
        aiCreditsPrice: pricingType === 'credits' && aiCreditsPrice ? parseInt(aiCreditsPrice, 10) : null,
        maxSlots: maxSlots ? parseInt(maxSlots, 10) : null,
        turnaroundDays: turnaroundDays ? parseInt(turnaroundDays, 10) : 7,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t('backlinks.createListing.title')}</h2>
          <button className={styles.modalClose} onClick={onClose}><X size={18} /></button>
        </div>

        <div className={styles.modalBody}>
          {/* Site selector grouped by account */}
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>{t('backlinks.createListing.selectSite')}</label>
            <select
              className={styles.modalSelect}
              value={selectedSiteIdx}
              onChange={e => setSelectedSiteIdx(e.target.value)}
            >
              <option value="">{t('backlinks.createListing.chooseSite')}</option>
              {Object.values(sitesByAccount).map(group => (
                <optgroup key={group.accountName} label={group.accountName}>
                  {group.sites.map(s => (
                    <option
                      key={s.siteId}
                      value={s._idx}
                      disabled={s.hasActiveListing}
                    >
                      {s.siteName} – {s.siteUrl}{s.hasActiveListing ? ` (${t('backlinks.createListing.alreadyListed')})` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectedSite?.hasActiveListing && (
              <span className={styles.fieldHint}>{t('backlinks.createListing.alreadyListedHint')}</span>
            )}
          </div>

          {/* Domain (auto-filled, read-only) */}
          {domain && (
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>{t('backlinks.createListing.domain')}</label>
              <input className={styles.modalInput} type="text" value={domain} readOnly />
            </div>
          )}

          {/* Title */}
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>{t('backlinks.createListing.listingTitle')}</label>
            <input
              className={styles.modalInput}
              type="text"
              placeholder={t('backlinks.createListing.titlePlaceholder')}
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>{t('backlinks.createListing.description')}</label>
            <textarea
              className={`${styles.modalInput} ${styles.modalTextarea}`}
              rows={3}
              placeholder={t('backlinks.createListing.descriptionPlaceholder')}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Row: Category + Language */}
          <div className={styles.formRow}>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>{t('backlinks.createListing.category')}</label>
              <input
                className={`${styles.modalInput} ${selectedSite?.businessCategory ? styles.readonlyMetric : ''}`}
                type="text"
                placeholder={t('backlinks.createListing.categoryPlaceholder')}
                value={category}
                onChange={selectedSite?.businessCategory ? undefined : e => setCategory(e.target.value)}
                readOnly={!!selectedSite?.businessCategory}
              />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>{t('backlinks.createListing.language')}</label>
              <select
                className={`${styles.modalSelect} ${selectedSite?.contentLanguage ? styles.readonlyMetric : ''}`}
                value={language}
                onChange={selectedSite?.contentLanguage ? undefined : e => setLanguage(e.target.value)}
                disabled={!!selectedSite?.contentLanguage}
              >
                <option value="en">English</option>
                <option value="he">עברית</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="pt">Português</option>
                <option value="ar">العربية</option>
              </select>
            </div>
          </div>

          {/* Row: DA + DR + Traffic */}
          <div className={styles.formRowThree}>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>
                {t('backlinks.card.da')}
                {metricsLoading && <Loader2 size={12} className={styles.metricSpinner} />}
              </label>
              <input
                className={`${styles.modalInput} ${!isManualMetrics ? styles.readonlyMetric : ''}`}
                type="number" min="0" max="100"
                placeholder={metricsLoading ? '...' : '0-100'}
                value={domainAuthority}
                onChange={isManualMetrics ? e => setDomainAuthority(e.target.value) : undefined}
                readOnly={!isManualMetrics}
              />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>
                {t('backlinks.card.dr')}
                {metricsLoading && <Loader2 size={12} className={styles.metricSpinner} />}
              </label>
              <input
                className={`${styles.modalInput} ${!isManualMetrics ? styles.readonlyMetric : ''}`}
                type="number" min="0" max="100"
                placeholder={metricsLoading ? '...' : '0-100'}
                value={domainRating}
                onChange={isManualMetrics ? e => setDomainRating(e.target.value) : undefined}
                readOnly={!isManualMetrics}
              />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>
                {t('backlinks.createListing.monthlyTraffic')}
                {metricsLoading && <Loader2 size={12} className={styles.metricSpinner} />}
              </label>
              <input
                className={`${styles.modalInput} ${!isManualMetrics ? styles.readonlyMetric : ''}`}
                type="number" min="0"
                placeholder={metricsLoading ? '...' : t('backlinks.createListing.monthlyVisitors')}
                value={monthlyTraffic}
                onChange={isManualMetrics ? e => setMonthlyTraffic(e.target.value) : undefined}
                readOnly={!isManualMetrics}
              />
            </div>
          </div>
          {metricsSources.length > 0 && (
            <span className={styles.metricSourceHint}>
              {t('backlinks.createListing.metricsSource')}: {metricsSources.join(', ')}
            </span>
          )}

          {/* Pricing Type Selector */}
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>{t('backlinks.createListing.pricingMethod')}</label>
            <select
              className={styles.modalSelect}
              value={pricingType}
              onChange={e => setPricingType(e.target.value)}
            >
              <option value="money">{t('backlinks.createListing.sellForMoney')}</option>
              <option value="credits">{t('backlinks.createListing.sellForCredits')}</option>
            </select>
          </div>

          {/* Pricing fields based on selection */}
          {pricingType === 'money' ? (
            <div className={styles.formRowThree}>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>{t('backlinks.createListing.price')}</label>
                <input className={styles.modalInput} type="number" min="0" step="0.01" placeholder="0.00" value={price} onChange={e => setPrice(e.target.value)} />
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>{t('backlinks.createListing.currency')}</label>
                <select className={styles.modalSelect} value={currency} onChange={e => setCurrency(e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="ILS">ILS</option>
                </select>
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>{t('backlinks.createListing.maxSlots')}</label>
                <input className={styles.modalInput} type="number" min="1" placeholder={t('backlinks.createListing.unlimited')} value={maxSlots} onChange={e => setMaxSlots(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className={styles.formRow}>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>{t('backlinks.createListing.aiCredits')}</label>
                <input className={styles.modalInput} type="number" min="0" placeholder="0" value={aiCreditsPrice} onChange={e => setAiCreditsPrice(e.target.value)} />
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>{t('backlinks.createListing.maxSlots')}</label>
                <input className={styles.modalInput} type="number" min="1" placeholder={t('backlinks.createListing.unlimited')} value={maxSlots} onChange={e => setMaxSlots(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button className={styles.modalCancel} onClick={onClose}>
            {t('backlinks.purchase.cancel')}
          </button>
          <button
            className={styles.modalConfirm}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isProcessing ? t('backlinks.purchase.processing') : t('backlinks.createListing.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Purchase Modal
// ──────────────────────────────────────────────
function PurchaseModal({ listing, sites, stats, t, onClose, onPurchase }) {
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || '');
  const [targetUrl, setTargetUrl] = useState('');
  const [anchorText, setAnchorText] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const planAvailable =
    stats?.planQuota?.limit > 0 &&
    stats.planQuota.used < stats.planQuota.limit;

  const hasDirectPrice = listing.price != null && listing.price > 0;
  const hasCreditsPrice = listing.aiCreditsPrice != null && listing.aiCreditsPrice > 0;

  const handleConfirm = async () => {
    if (!paymentMethod || !targetUrl || !selectedSiteId) return;
    setIsProcessing(true);
    try {
      await onPurchase({
        listingId: listing.id,
        siteId: selectedSiteId,
        paymentMethod,
        targetUrl,
        anchorText,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t('backlinks.purchase.title')}</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.modalBody}>
        {/* Target site selector */}
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>{t('backlinks.purchase.selectSite')}</label>
          <select
            className={styles.modalSelect}
            value={selectedSiteId}
            onChange={e => setSelectedSiteId(e.target.value)}
          >
            {sites.map(s => (
              <option key={s.id} value={s.id}>{s.name} – {s.url}</option>
            ))}
          </select>
        </div>

        {/* Target URL */}
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>{t('backlinks.purchase.targetUrl')}</label>
          <input
            className={styles.modalInput}
            type="url"
            placeholder="https://..."
            value={targetUrl}
            onChange={e => setTargetUrl(e.target.value)}
          />
        </div>

        {/* Anchor text */}
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>{t('backlinks.purchase.anchorText')}</label>
          <input
            className={styles.modalInput}
            type="text"
            placeholder={t('backlinks.purchase.anchorPlaceholder')}
            value={anchorText}
            onChange={e => setAnchorText(e.target.value)}
          />
        </div>

        {/* Payment options */}
        <div className={styles.paymentOptions}>
          <span className={styles.paymentOptionsLabel}>{t('backlinks.purchase.paymentMethod')}</span>
          {/* Plan allocation */}
          <div
            className={`${styles.paymentOption} ${paymentMethod === 'PLAN_ALLOCATION' ? styles.paymentOptionSelected : ''} ${!planAvailable ? styles.paymentOptionDisabled : ''}`}
            onClick={() => planAvailable && setPaymentMethod('PLAN_ALLOCATION')}
          >
            <div className={`${styles.paymentRadio} ${paymentMethod === 'PLAN_ALLOCATION' ? styles.paymentRadioSelected : ''}`} />
            <div className={styles.paymentInfo}>
              <span className={styles.paymentName}>{t('backlinks.purchase.planAllocation')}</span>
              <span className={styles.paymentDesc}>
                {planAvailable
                  ? t('backlinks.purchase.planAllocationDesc')
                      .replace('{used}', stats.planQuota.used)
                      .replace('{total}', stats.planQuota.limit)
                  : t('backlinks.purchase.planAllocationFull')}
              </span>
            </div>
          </div>

          {/* Direct purchase */}
          {hasDirectPrice && (
            <div
              className={`${styles.paymentOption} ${paymentMethod === 'DIRECT' ? styles.paymentOptionSelected : ''}`}
              onClick={() => setPaymentMethod('DIRECT')}
            >
              <div className={`${styles.paymentRadio} ${paymentMethod === 'DIRECT' ? styles.paymentRadioSelected : ''}`} />
              <div className={styles.paymentInfo}>
                <span className={styles.paymentName}>{t('backlinks.purchase.directPurchase')}</span>
                <span className={styles.paymentDesc}>
                  {t('backlinks.purchase.directPurchaseDesc')
                    .replace('{price}', listing.price)
                    .replace('{currency}', listing.currency)}
                </span>
              </div>
            </div>
          )}

          {/* AI Credits */}
          {hasCreditsPrice && (
            <div
              className={`${styles.paymentOption} ${paymentMethod === 'AI_CREDITS' ? styles.paymentOptionSelected : ''}`}
              onClick={() => setPaymentMethod('AI_CREDITS')}
            >
              <div className={`${styles.paymentRadio} ${paymentMethod === 'AI_CREDITS' ? styles.paymentRadioSelected : ''}`} />
              <div className={styles.paymentInfo}>
                <span className={styles.paymentName}>{t('backlinks.purchase.aiCredits')}</span>
                <span className={styles.paymentDesc}>
                  {t('backlinks.purchase.aiCreditsDesc')
                    .replace('{credits}', listing.aiCreditsPrice)
                    .replace('{balance}', '—')}
                </span>
              </div>
            </div>
          )}
        </div>

        </div>{/* end modalBody */}

        {/* Actions */}
        <div className={styles.modalFooter}>
          <button className={styles.modalCancel} onClick={onClose}>
            {t('backlinks.purchase.cancel')}
          </button>
          <button
            className={styles.modalConfirm}
            disabled={!paymentMethod || !targetUrl || isProcessing}
            onClick={handleConfirm}
          >
            {isProcessing ? t('backlinks.purchase.processing') : t('backlinks.purchase.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Listing Card
// ──────────────────────────────────────────────
function ListingCard({ listing, t, onPurchaseClick }) {
  const isSoldOut = listing.maxSlots && listing.soldCount >= listing.maxSlots;
  const hasPurchase = !!listing.purchase;

  return (
    <div className={styles.listingCard}>
      {/* Header: domain + link type badge */}
      <div className={styles.cardHeader}>
        <div className={styles.domainInfo}>
          <span className={styles.domainName}>{listing.domain}</span>
          <span className={styles.cardTitle}>{listing.title}</span>
        </div>
        <span className={`${styles.linkTypeBadge} ${listing.linkType === 'DOFOLLOW' ? styles.dofollow : styles.nofollow}`}>
          {listing.linkType === 'DOFOLLOW' ? t('backlinks.card.dofollow') : t('backlinks.card.nofollow')}
        </span>
      </div>

      {/* Metrics */}
      <div className={styles.metricsRow}>
        {listing.domainAuthority != null && (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>{t('backlinks.card.da')}</span>
            <span className={styles.metricValue}>{listing.domainAuthority}</span>
          </div>
        )}
        {listing.domainRating != null && (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>{t('backlinks.card.dr')}</span>
            <span className={styles.metricValue}>{listing.domainRating}</span>
          </div>
        )}
        {listing.monthlyTraffic != null && (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>{t('backlinks.card.traffic')}</span>
            <span className={styles.metricValue}>{listing.monthlyTraffic.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      <div className={styles.tagsRow}>
        {listing.category && (
          <span className={styles.tag}>
            <Tag size={10} /> {listing.category}
          </span>
        )}
        {listing.language && (
          <span className={styles.tag}>
            <Languages size={10} /> {listing.language.toUpperCase()}
          </span>
        )}
      </div>

      {/* Publisher */}
      <div className={styles.publisherRow}>
        <span>{t('backlinks.card.publishedBy')}</span>
        <span className={`${styles.publisherBadge} ${listing.publisherType === 'PLATFORM' ? styles.publisherPlatform : styles.publisherUser}`}>
          {listing.publisherType === 'PLATFORM' ? t('backlinks.card.platform') : t('backlinks.card.user')}
        </span>
      </div>

      {/* Footer: price + action */}
      <div className={styles.cardFooter}>
        <div className={styles.priceGroup}>
          {listing.price != null && (
            <span className={styles.priceMain}>
              {listing.currency === 'USD' ? '$' : listing.currency}{listing.price}
            </span>
          )}
          {listing.aiCreditsPrice != null && (
            <span className={styles.priceAlt}>
              {t('backlinks.card.aiCreditsPrice')}: {listing.aiCreditsPrice}
            </span>
          )}
          {!listing.price && !listing.aiCreditsPrice && (
            <span className={styles.priceMain}>{t('backlinks.purchase.planAllocation')}</span>
          )}
        </div>

        {hasPurchase ? (
          <span className={`${styles.purchaseButton} ${styles.purchasedBadge}`}>
            {t('backlinks.card.purchased')}
          </span>
        ) : isSoldOut ? (
          <span className={`${styles.purchaseButton} ${styles.purchaseButtonOutline}`}>
            {t('backlinks.card.outOfStock')}
          </span>
        ) : (
          <button
            className={`${styles.purchaseButton} ${styles.purchaseButtonPrimary}`}
            onClick={() => onPurchaseClick(listing)}
          >
            {t('backlinks.card.purchase')}
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Content
// ──────────────────────────────────────────────
export function BacklinksContent() {
  const { t } = useLocale();
  const { user } = useUser();
  const { selectedSite } = useSite();

  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState(null);
  const [sites, setSites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('available');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [purchaseModal, setPurchaseModal] = useState(null); // listing object or null
  const [createModal, setCreateModal] = useState(false);
  const [userSites, setUserSites] = useState([]);
  const [toast, setToast] = useState(null);

  // Get the current account ID
  const accountId = user?.lastSelectedAccountId || user?.accountMemberships?.[0]?.accountId;

  // Fetch sites for the purchase modal site selector
  useEffect(() => {
    if (!accountId) return;
    fetch('/api/sites')
      .then(r => r.json())
      .then(data => setSites(data.sites || []))
      .catch(() => {});
  }, [accountId]);

  // Fetch stats
  useEffect(() => {
    if (!accountId) return;
    fetch(`/api/backlinks/stats?accountId=${accountId}`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, [accountId]);

  // Fetch listings
  const fetchListings = useCallback(async () => {
    if (!accountId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        accountId,
        filter,
        search,
        sort,
        page: page.toString(),
        limit: '20',
      });
      const res = await fetch(`/api/backlinks?${params}`);
      const data = await res.json();
      setListings(data.listings || []);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch listings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [accountId, filter, search, sort, page]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // Reset page when filter/search/sort changes
  useEffect(() => {
    setPage(1);
  }, [filter, search, sort]);

  // Show toast
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Purchase handler
  const handlePurchase = async ({ listingId, siteId, paymentMethod, targetUrl, anchorText }) => {
    try {
      const res = await fetch('/api/backlinks/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          siteId,
          listingId,
          paymentMethod,
          targetUrl,
          anchorText,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || t('backlinks.toast.purchaseFailed'), 'error');
        return;
      }

      showToast(t('backlinks.toast.purchaseSuccess'));
      setPurchaseModal(null);
      fetchListings(); // Refresh
      // Refresh stats
      fetch(`/api/backlinks/stats?accountId=${accountId}`)
        .then(r => r.json())
        .then(setStats)
        .catch(() => {});
    } catch {
      showToast(t('backlinks.toast.purchaseFailed'), 'error');
    }
  };

  // Search debounce
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch user sites across all accounts (for create listing)
  const fetchUserSites = useCallback(async () => {
    try {
      const res = await fetch('/api/backlinks/my-sites');
      const data = await res.json();
      setUserSites(data.sites || []);
    } catch {
      setUserSites([]);
    }
  }, []);

  const handleOpenCreateModal = async () => {
    await fetchUserSites();
    setCreateModal(true);
  };

  // Create listing handler
  const handleCreateListing = async (payload) => {
    try {
      const res = await fetch('/api/backlinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || t('backlinks.toast.createFailed'), 'error');
        return;
      }

      showToast(t('backlinks.toast.listingCreated'));
      setCreateModal(false);
      fetchListings();
      // Refresh stats
      fetch(`/api/backlinks/stats?accountId=${accountId}`)
        .then(r => r.json())
        .then(setStats)
        .catch(() => {});
    } catch {
      showToast(t('backlinks.toast.createFailed'), 'error');
    }
  };

  return (
    <div className={styles.container}>
      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconPurple}`}>
                <Link2 className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('backlinks.stats.totalAvailable')}</span>
            <span className={styles.statValue}>{stats?.totalAvailable ?? '—'}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconBlue}`}>
                <Shield className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('backlinks.stats.planQuota')}</span>
            <span className={styles.statValue}>
              {stats?.planQuota ? `${stats.planQuota.used}/${stats.planQuota.limit}` : '—'}
            </span>
            <span className={styles.statSub}>{t('backlinks.purchase.planAllocation')}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconGreen}`}>
                <ShoppingBag className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('backlinks.stats.purchased')}</span>
            <span className={styles.statValue}>{stats?.totalPurchased ?? '—'}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardGlow} />
          <div className={styles.statCardContent}>
            <div className={styles.statHeader}>
              <div className={`${styles.statIconWrap} ${styles.statIconOrange}`}>
                <DollarSign className={styles.statIcon} />
              </div>
            </div>
            <span className={styles.statLabel}>{t('backlinks.stats.spent')}</span>
            <span className={styles.statValue}>
              {stats?.totalSpent != null ? `$${stats.totalSpent.toLocaleString()}` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="text"
            placeholder={t('backlinks.searchPlaceholder')}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>

        <button
          className={`${styles.purchaseButton} ${styles.purchaseButtonPrimary} ${styles.addListingButton}`}
          onClick={handleOpenCreateModal}
        >
          <Plus size={16} />
          {t('backlinks.createListing.button')}
        </button>

        <div className={styles.filterGroup}>
          {['all', 'available', 'purchased', 'myListings'].map(f => (
            <button
              key={f}
              className={`${styles.filterButton} ${filter === f ? styles.filterButtonActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(`backlinks.filters.${f}`)}
            </button>
          ))}
        </div>

        <select
          className={styles.sortSelect}
          value={sort}
          onChange={e => setSort(e.target.value)}
        >
          <option value="newest">{t('backlinks.sort.newest')}</option>
          <option value="priceAsc">{t('backlinks.sort.priceAsc')}</option>
          <option value="priceDesc">{t('backlinks.sort.priceDesc')}</option>
          <option value="daHighest">{t('backlinks.sort.daHighest')}</option>
          <option value="drHighest">{t('backlinks.sort.drHighest')}</option>
        </select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className={styles.loadingGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && listings.length === 0 && (
        <div className={styles.emptyState}>
          <Link2 className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>{t('backlinks.empty.title')}</h3>
          <p className={styles.emptyDesc}>{t('backlinks.empty.description')}</p>
        </div>
      )}

      {/* Listings Grid */}
      {!isLoading && listings.length > 0 && (
        <>
          <div className={styles.listingsGrid}>
            {listings.map(listing => (
              <ListingCard
                key={listing.id}
                listing={listing}
                t={t}
                onPurchaseClick={setPurchaseModal}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageButton}
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                ‹
              </button>
              <span className={styles.pageInfo}>{page} / {totalPages}</span>
              <button
                className={styles.pageButton}
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                ›
              </button>
            </div>
          )}
        </>
      )}

      {/* Create Listing Modal */}
      {createModal && (
        <CreateListingModal
          userSites={userSites}
          t={t}
          onClose={() => setCreateModal(false)}
          onSubmit={handleCreateListing}
        />
      )}

      {/* Purchase Modal */}
      {purchaseModal && (
        <PurchaseModal
          listing={purchaseModal}
          sites={sites}
          stats={stats}
          t={t}
          onClose={() => setPurchaseModal(null)}
          onPurchase={handlePurchase}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
