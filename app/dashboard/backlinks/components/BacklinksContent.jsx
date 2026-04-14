'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link2, ExternalLink, Globe, Tag, Languages, Search, X, Shield, ShoppingBag, DollarSign, Plus, Loader2, Info, LayoutGrid, List, Upload } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { useSite } from '@/app/context/site-context';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import { Button, DataTable } from '@/app/dashboard/components';
import BulkAddListingsModal from './BulkAddListingsModal';
import styles from '../backlinks.module.css';

// ── Currency symbol mapping ──
const CURRENCY_SYMBOLS = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' };
const getCurrencySymbol = (code) => CURRENCY_SYMBOLS[code] || code;
const getCurrencyName = (code, t) => t(`backlinks.currencyNames.${code}`) || code;

// ──────────────────────────────────────────────
// Create Listing Modal
// ──────────────────────────────────────────────
function CreateListingModal({ userSites, t, onClose, onSubmit }) {
  const { isMaximized, toggleMaximize } = useModalResize();
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
  const [currency, setCurrency] = useState('ILS');
  const [aiCreditsPrice, setAiCreditsPrice] = useState('');
  const [maxSlots, setMaxSlots] = useState('');
  const [turnaroundDays, setTurnaroundDays] = useState('7');
  const [isProcessing, setIsProcessing] = useState(false);
  const [infoPopup, setInfoPopup] = useState(null); // 'da' | 'dr' | null
  const [publishMode, setPublishMode] = useState('manual');
  const [aiGenerating, setAiGenerating] = useState(false);

  const selectedSite = selectedSiteIdx !== '' ? userSites[Number(selectedSiteIdx)] : null;
  const domain = selectedSite?.siteUrl || '';

  // Auto-fill category, language, and publishMode when a site is selected
  // Then trigger AI generation for title & description
  useEffect(() => {
    if (selectedSite) {
      if (selectedSite.businessCategory) setCategory(selectedSite.businessCategory);
      if (selectedSite.contentLanguage) setLanguage(selectedSite.contentLanguage);
      // Auto-set publishMode: auto only if WordPress + plugin connected
      if (selectedSite.isWordPress && selectedSite.hasPlugin) {
        setPublishMode('auto');
      } else {
        setPublishMode('manual');
      }

      // AI-generate title & description
      setTitle('');
      setDescription('');
      setAiGenerating(true);
      const lang = selectedSite.contentLanguage || 'en';
      fetch('/api/backlinks/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: selectedSite.siteUrl,
          businessName: selectedSite.businessName || selectedSite.siteName || '',
          businessAbout: selectedSite.businessAbout || '',
          businessCategory: selectedSite.businessCategory || '',
          language: lang,
        }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.title) setTitle(data.title);
          if (data.description) setDescription(data.description);
        })
        .catch(() => {
          // Fallback to basic data if AI fails
          setTitle(selectedSite.businessName || selectedSite.siteName || '');
          setDescription(selectedSite.businessAbout || '');
        })
        .finally(() => setAiGenerating(false));
    } else {
      setCategory('');
      setLanguage('en');
      setTitle('');
      setDescription('');
      setPublishMode('manual');
      setAiGenerating(false);
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

    const metricsUrl = `/api/backlinks/domain-metrics?domain=${encodeURIComponent(domain)}${selectedSite?.siteId ? `&siteId=${encodeURIComponent(selectedSite.siteId)}` : ''}`;
    fetch(metricsUrl)
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
  }, [domain, selectedSite?.siteId]);

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
        publishMode,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide} ${isMaximized ? 'modal-maximized' : ''}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t('backlinks.createListing.title')}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <ModalResizeButton isMaximized={isMaximized} onToggle={toggleMaximize} className={styles.modalClose} />
            <Button variant="ghost" iconOnly onClick={onClose}><X size={18} /></Button>
          </div>
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
            <label className={styles.modalLabel}>
              {t('backlinks.createListing.listingTitle')}
              {aiGenerating && <Loader2 size={12} className={styles.metricSpinner} />}
            </label>
            <input
              className={styles.modalInput}
              type="text"
              placeholder={aiGenerating ? t('backlinks.createListing.aiGenerating') : t('backlinks.createListing.titlePlaceholder')}
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>
              {t('backlinks.createListing.description')}
              {aiGenerating && <Loader2 size={12} className={styles.metricSpinner} />}
            </label>
            <textarea
              className={`${styles.modalInput} ${styles.modalTextarea}`}
              rows={3}
              placeholder={aiGenerating ? t('backlinks.createListing.aiGenerating') : t('backlinks.createListing.descriptionPlaceholder')}
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
                <span
                  className={`${styles.infoIconBtn} ${styles.hasTooltip}`}
                  data-tooltip={t('backlinks.createListing.daInfo')}
                  onClick={() => setInfoPopup('da')}
                >
                  <Info size={14} />
                </span>
              </label>
              <input
                className={styles.modalInput}
                type="number" min="0" max="100"
                placeholder={metricsLoading ? '...' : '0-100'}
                value={domainAuthority}
                onChange={e => setDomainAuthority(e.target.value)}
              />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>
                {t('backlinks.card.dr')}
                {metricsLoading && <Loader2 size={12} className={styles.metricSpinner} />}
                <span
                  className={`${styles.infoIconBtn} ${styles.hasTooltip}`}
                  data-tooltip={t('backlinks.createListing.drInfo')}
                  onClick={() => setInfoPopup('dr')}
                >
                  <Info size={14} />
                </span>
              </label>
              <input
                className={styles.modalInput}
                type="number" min="0" max="100"
                placeholder={metricsLoading ? '...' : '0-100'}
                value={domainRating}
                onChange={e => setDomainRating(e.target.value)}
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
                  <option value="ILS">₪ ILS</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                  <option value="GBP">£ GBP</option>
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

          {/* Publish Mode */}
          {selectedSite && (
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>{t('backlinks.createListing.publishMode')}</label>
              <select
                className={styles.modalSelect}
                value={publishMode}
                onChange={e => setPublishMode(e.target.value)}
              >
                <option value="manual">{t('backlinks.createListing.publishManual')}</option>
                {selectedSite.isWordPress && selectedSite.hasPlugin && (
                  <option value="auto">{t('backlinks.createListing.publishAuto')}</option>
                )}
              </select>
              <span className={styles.publishModeHint}>
                {publishMode === 'auto'
                  ? t('backlinks.createListing.publishAutoHint')
                  : selectedSite.isWordPress && selectedSite.hasPlugin
                    ? t('backlinks.createListing.publishManualHint')
                    : t('backlinks.createListing.publishManualOnly')
                }
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <Button onClick={onClose}>
            {t('backlinks.purchase.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isProcessing ? t('backlinks.purchase.processing') : t('backlinks.createListing.submit')}
          </Button>
        </div>
      </div>

      {/* DA/DR Info Popup */}
      {infoPopup && (
        <div className={styles.infoPopupOverlay} onClick={() => setInfoPopup(null)}>
          <div className={styles.infoPopup} onClick={e => e.stopPropagation()}>
            <button className={styles.infoPopupClose} onClick={() => setInfoPopup(null)}>
              <X size={18} />
            </button>
            <div className={styles.infoPopupHeader}>
              <div className={styles.infoPopupIconBadge}>
                <Info size={22} />
              </div>
              <h3 className={styles.infoPopupTitle}>
                {infoPopup === 'da' ? t('backlinks.createListing.daInfoTitle') : t('backlinks.createListing.drInfoTitle')}
              </h3>
            </div>
            <div className={styles.infoPopupBody}
              dangerouslySetInnerHTML={{
                __html: infoPopup === 'da'
                  ? t('backlinks.createListing.daInfoLong')
                  : t('backlinks.createListing.drInfoLong')
              }}
            />
            <button className={styles.infoPopupDismiss} onClick={() => setInfoPopup(null)}>
              {t('backlinks.createListing.gotIt')}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
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

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t('backlinks.purchase.title')}</h2>
          <Button variant="ghost" iconOnly onClick={onClose}>
            <X size={18} />
          </Button>
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
                    .replace('{currency}', getCurrencySymbol(listing.currency))}
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
                    .replace('{balance}', '-')}
                </span>
              </div>
            </div>
          )}
        </div>

        </div>{/* end modalBody */}

        {/* Actions */}
        <div className={styles.modalFooter}>
          <Button onClick={onClose}>
            {t('backlinks.purchase.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!paymentMethod || !targetUrl || isProcessing}
            onClick={handleConfirm}
          >
            {isProcessing ? t('backlinks.purchase.processing') : t('backlinks.purchase.confirm')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ──────────────────────────────────────────────
// Listing Card
// ──────────────────────────────────────────────
function ListingCard({ listing, t, onPurchaseClick, isOwn, getDisplayTitle }) {
  const isSoldOut = listing.maxSlots && listing.soldCount >= listing.maxSlots;
  const hasPurchase = !!listing.purchase;

  return (
    <div className={styles.listingCard}>
      {/* Header: domain */}
      <div className={styles.cardHeader}>
        <div className={styles.domainInfo}>
          <span className={styles.domainName}>{listing.domain?.startsWith('http') ? listing.domain : `https://${listing.domain}`}</span>
          <span className={styles.cardTitle}>{getDisplayTitle(listing)}</span>
        </div>
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
            <Languages size={10} /> {t('backlinks.siteInLanguage').replace('{language}', t(`backlinks.languageNames.${listing.language}`) || listing.language.toUpperCase())}
          </span>
        )}
      </div>

      {/* Footer: price + action */}
      <div className={styles.cardFooter}>
        <div className={styles.priceGroup}>
          {listing.price != null && (
            <span className={`${styles.priceMain} ${styles.hasTooltip}`} data-tooltip={getCurrencyName(listing.currency, t)}>
              {getCurrencySymbol(listing.currency)}{listing.price}
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

        {isOwn ? (
          <span className={`${styles.purchaseButton} ${styles.purchasedBadge}`}>
            {t('backlinks.card.yourListing')}
          </span>
        ) : hasPurchase ? (
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
  const { t, locale } = useLocale();
  const { user } = useUser();
  const { selectedSite } = useSite();

  const [listings, setListings] = useState([]);
  const [titleTranslations, setTitleTranslations] = useState({});
  const [stats, setStats] = useState(null);
  const [sites, setSites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [purchaseModal, setPurchaseModal] = useState(null); // listing object or null
  const [createModal, setCreateModal] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);
  const [userSites, setUserSites] = useState([]);
  const [toast, setToast] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gp_backlinks_view') || 'cards';
    }
    return 'cards';
  });

  // Get the current account ID (user object from /api/user/me has a flat accountId)
  const accountId = user?.accountId;

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
    const params = accountId ? `?accountId=${accountId}` : '';
    fetch(`/api/backlinks/stats${params}`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, [accountId]);

  // Fetch listings
  const fetchListings = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        filter,
        search,
        sort,
        page: page.toString(),
        limit: '20',
      });
      if (accountId) params.set('accountId', accountId);
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

  // Translate listing titles to user's locale
  useEffect(() => {
    if (!listings.length || !locale) return;
    const needsTranslation = listings.filter(l => l.language !== locale && !titleTranslations[l.id]);
    if (needsTranslation.length === 0) return;

    fetch('/api/backlinks/translate-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingIds: needsTranslation.map(l => l.id), targetLang: locale }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.translations) {
          setTitleTranslations(prev => ({ ...prev, ...data.translations }));
        }
      })
      .catch(() => {}); // Silent fail — original titles still show
  }, [listings, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get display title (translated or original)
  const getDisplayTitle = useCallback((listing) => {
    if (listing.language === locale) return listing.title;
    return titleTranslations[listing.id] || listing.title;
  }, [locale, titleTranslations]);

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

  // View mode toggle
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('gp_backlinks_view', mode);
  };

  // Table columns definition
  const tableColumns = [
    {
      key: 'domain',
      label: t('backlinks.card.domain'),
      render: (_, row) => (
        <div className={styles.tableDomainCell}>
          <span className={styles.tableDomainName}>{row.domain}</span>
          {row.title && <span className={styles.tableDomainTitle}>{getDisplayTitle(row)}</span>}
        </div>
      ),
    },
    {
      key: 'domainAuthority',
      label: t('backlinks.card.da'),
      align: 'center',
      render: (val) => val ?? '-',
    },
    {
      key: 'domainRating',
      label: t('backlinks.card.dr'),
      align: 'center',
      render: (val) => val ?? '-',
    },
    {
      key: 'monthlyTraffic',
      label: t('backlinks.card.traffic'),
      align: 'center',
      render: (val) => val != null ? val.toLocaleString() : '-',
    },
    {
      key: 'category',
      label: t('backlinks.card.category'),
      render: (val) => val || '-',
    },
    {
      key: 'price',
      label: t('backlinks.card.price'),
      align: 'center',
      render: (_, row) => {
        if (row.price != null) return <span className={styles.hasTooltip} data-tooltip={getCurrencyName(row.currency, t)}>{getCurrencySymbol(row.currency)}{row.price}</span>;
        if (row.aiCreditsPrice != null) return `${row.aiCreditsPrice} ${t('backlinks.card.aiCreditsPrice')}`;
        return t('backlinks.purchase.planAllocation');
      },
    },
    {
      key: 'actions',
      label: '',
      align: 'center',
      width: '120px',
      render: (_, row) => {
        const isOwn = row.publisherAccountId === accountId;
        const isSoldOut = row.maxSlots && row.soldCount >= row.maxSlots;
        const hasPurchase = !!row.purchase;
        if (isOwn) return <span className={styles.tableBadge}>{t('backlinks.card.yourListing')}</span>;
        if (hasPurchase) return <span className={styles.tableBadge}>{t('backlinks.card.purchased')}</span>;
        if (isSoldOut) return <span className={styles.tableBadgeMuted}>{t('backlinks.card.outOfStock')}</span>;
        return (
          <button className={`${styles.purchaseButton} ${styles.purchaseButtonPrimary} ${styles.purchaseButtonSmall}`} onClick={() => setPurchaseModal(row)}>
            {t('backlinks.card.purchase')}
          </button>
        );
      },
    },
  ];

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
      setFilter('myListings'); // Switch to My Listings so user sees the new listing
      // fetchListings() triggered automatically via useEffect when filter changes
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
            <span className={styles.statValue}>{stats?.totalAvailable ?? '-'}</span>
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
              {stats?.planQuota ? `${stats.planQuota.used}/${stats.planQuota.limit}` : '-'}
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
            <span className={styles.statValue}>{stats?.totalPurchased ?? '-'}</span>
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
              {stats?.totalSpent != null ? `$${stats.totalSpent.toLocaleString()}` : '-'}
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

        {user?.isSuperAdmin && (
          <button
            className={`${styles.purchaseButton} ${styles.addListingButton}`}
            onClick={() => setBulkModal(true)}
          >
            <Upload size={16} />
            {t('backlinks.bulk.button') || 'Bulk Add'}
          </button>
        )}

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

        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewButton} ${viewMode === 'table' ? styles.viewButtonActive : ''}`}
            onClick={() => handleViewModeChange('table')}
            title={t('backlinks.viewToggle.table')}
          >
            <List size={18} />
          </button>
          <button
            className={`${styles.viewButton} ${viewMode === 'cards' ? styles.viewButtonActive : ''}`}
            onClick={() => handleViewModeChange('cards')}
            title={t('backlinks.viewToggle.cards')}
          >
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && viewMode === 'cards' && (
        <div className={styles.loadingGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      )}
      {isLoading && viewMode === 'table' && (
        <div className={styles.skeletonTableWrap}>
          <div className={styles.skeletonTableHeader}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={styles.skeletonHeaderCell} />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonTableRow}>
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className={styles.skeletonTableCell} />
              ))}
            </div>
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
 
      {/* Listings */}
      {!isLoading && listings.length > 0 && (
        <>
          {viewMode === 'cards' ? (
            <div className={styles.listingsGrid}>
              {listings.map(listing => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  t={t}
                  onPurchaseClick={setPurchaseModal}
                  isOwn={listing.publisherAccountId === accountId}
                  getDisplayTitle={getDisplayTitle}
                />
              ))}
            </div>
          ) : (
            <DataTable
              columns={tableColumns}
              data={listings}
              onRowClick={(row) => {
                const isOwn = row.publisherAccountId === accountId;
                const isSoldOut = row.maxSlots && row.soldCount >= row.maxSlots;
                const hasPurchase = !!row.purchase;
                if (!isOwn && !hasPurchase && !isSoldOut) setPurchaseModal(row);
              }}
              emptyMessage={t('backlinks.empty.title')}
            />
          )}

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

      {/* Bulk Add Modal (admin only) */}
      {bulkModal && (
        <BulkAddListingsModal
          t={t}
          onClose={() => setBulkModal(false)}
          onDone={fetchListings}
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
