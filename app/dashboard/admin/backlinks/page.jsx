'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Link2,
  CheckCircle,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminModal, ConfirmDialog, FormInput, FormTextarea, FormSelect, FormActions, PrimaryButton, SecondaryButton } from '../components/AdminModal';
import { AdminPageSkeleton, Button } from '@/app/dashboard/components';
import styles from '../admin.module.css';

// ──────────────────────────────────────────────
// Listing Edit/Create Modal
// ──────────────────────────────────────────────
function ListingFormModal({ isOpen, onClose, listing, onSubmit, isSubmitting, t }) {
  const isEditing = !!listing?.id;

  const [form, setForm] = useState({
    domain: '',
    title: '',
    description: '',
    category: '',
    language: 'en',
    linkType: 'DOFOLLOW',
    domainAuthority: '',
    domainRating: '',
    monthlyTraffic: '',
    price: '',
    aiCreditsPrice: '',
    maxSlots: '',
    turnaroundDays: '7',
    sampleUrl: '',
    contentRequirements: '',
    publisherType: 'PLATFORM',
    status: 'ACTIVE',
    isActive: true,
  });

  useEffect(() => {
    if (listing) {
      setForm({
        domain: listing.domain || '',
        title: listing.title || '',
        description: listing.description || '',
        category: listing.category || '',
        language: listing.language || 'en',
        linkType: listing.linkType || 'DOFOLLOW',
        domainAuthority: listing.domainAuthority ?? '',
        domainRating: listing.domainRating ?? '',
        monthlyTraffic: listing.monthlyTraffic ?? '',
        price: listing.price ?? '',
        aiCreditsPrice: listing.aiCreditsPrice ?? '',
        maxSlots: listing.maxSlots ?? '',
        turnaroundDays: listing.turnaroundDays ?? '7',
        sampleUrl: listing.sampleUrl || '',
        contentRequirements: listing.contentRequirements || '',
        publisherType: listing.publisherType || 'PLATFORM',
        status: listing.status || 'ACTIVE',
        isActive: listing.isActive !== false,
      });
    } else {
      setForm({
        domain: '', title: '', description: '', category: '', language: 'en',
        linkType: 'DOFOLLOW', domainAuthority: '', domainRating: '', monthlyTraffic: '',
        price: '', aiCreditsPrice: '', maxSlots: '', turnaroundDays: '7',
        sampleUrl: '', contentRequirements: '', publisherType: 'PLATFORM',
        status: 'ACTIVE', isActive: true,
      });
    }
  }, [listing]);

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? t('admin.backlinks.editListing') : t('admin.backlinks.addListing')}
      size="large"
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <FormInput
          label={t('admin.backlinks.fields.domain')}
          placeholder={t('admin.backlinks.fields.domainPlaceholder')}
          value={form.domain}
          onChange={handleChange('domain')}
          required
        />
        <FormInput
          label={t('admin.backlinks.fields.title')}
          placeholder={t('admin.backlinks.fields.titlePlaceholder')}
          value={form.title}
          onChange={handleChange('title')}
          required
        />
      </div>

      <FormTextarea
        label={t('admin.backlinks.fields.description')}
        placeholder={t('admin.backlinks.fields.descriptionPlaceholder')}
        value={form.description}
        onChange={handleChange('description')}
        rows={3}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <FormInput
          label={t('admin.backlinks.fields.category')}
          placeholder={t('admin.backlinks.fields.categoryPlaceholder')}
          value={form.category}
          onChange={handleChange('category')}
        />
        <FormInput
          label={t('admin.backlinks.fields.language')}
          value={form.language}
          onChange={handleChange('language')}
        />
        <FormSelect
          label={t('admin.backlinks.fields.linkType')}
          value={form.linkType}
          onChange={handleChange('linkType')}
          options={[
            { value: 'DOFOLLOW', label: t('admin.backlinks.fields.dofollow') },
            { value: 'NOFOLLOW', label: t('admin.backlinks.fields.nofollow') },
          ]}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <FormInput
          label={t('admin.backlinks.fields.domainAuthority')}
          type="number"
          min="0"
          max="100"
          value={form.domainAuthority}
          onChange={handleChange('domainAuthority')}
        />
        <FormInput
          label={t('admin.backlinks.fields.domainRating')}
          type="number"
          min="0"
          max="100"
          value={form.domainRating}
          onChange={handleChange('domainRating')}
        />
        <FormInput
          label={t('admin.backlinks.fields.monthlyTraffic')}
          type="number"
          min="0"
          value={form.monthlyTraffic}
          onChange={handleChange('monthlyTraffic')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <FormInput
          label={t('admin.backlinks.fields.price')}
          type="number"
          min="0"
          step="0.01"
          value={form.price}
          onChange={handleChange('price')}
        />
        <FormInput
          label={t('admin.backlinks.fields.aiCreditsPrice')}
          type="number"
          min="0"
          value={form.aiCreditsPrice}
          onChange={handleChange('aiCreditsPrice')}
        />
        <FormInput
          label={t('admin.backlinks.fields.maxSlots')}
          type="number"
          min="0"
          value={form.maxSlots}
          onChange={handleChange('maxSlots')}
          placeholder={t('admin.backlinks.fields.maxSlotsHelp')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <FormInput
          label={t('admin.backlinks.fields.turnaroundDays')}
          type="number"
          min="1"
          value={form.turnaroundDays}
          onChange={handleChange('turnaroundDays')}
        />
        <FormInput
          label={t('admin.backlinks.fields.sampleUrl')}
          type="url"
          value={form.sampleUrl}
          onChange={handleChange('sampleUrl')}
        />
      </div>

      <FormTextarea
        label={t('admin.backlinks.fields.contentRequirements')}
        value={form.contentRequirements}
        onChange={handleChange('contentRequirements')}
        rows={2}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <FormSelect
          label={t('admin.backlinks.fields.publisherType')}
          value={form.publisherType}
          onChange={handleChange('publisherType')}
          options={[
            { value: 'PLATFORM', label: t('admin.backlinks.fields.platform') },
            { value: 'USER', label: t('admin.backlinks.fields.user') },
          ]}
        />
        <FormSelect
          label={t('admin.backlinks.fields.status')}
          value={form.status}
          onChange={handleChange('status')}
          options={[
            { value: 'ACTIVE', label: t('admin.backlinks.filters.active') },
            { value: 'PAUSED', label: t('admin.backlinks.filters.paused') },
            { value: 'DRAFT', label: t('admin.backlinks.filters.draft') },
            { value: 'ARCHIVED', label: t('admin.backlinks.filters.archived') },
          ]}
        />
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={handleChange('isActive')} />
            {t('admin.backlinks.fields.isActive')}
          </label>
        </div>
      </div>

      <FormActions>
        <SecondaryButton onClick={onClose}>
          {t('admin.common.cancel')}
        </SecondaryButton>
        <PrimaryButton
          isLoading={isSubmitting}
          onClick={() => onSubmit(form)}
        >
          {isEditing ? t('admin.common.save') : t('admin.common.create')}
        </PrimaryButton>
      </FormActions>
    </AdminModal>
  );
}

// ──────────────────────────────────────────────
// Purchase Status Modal
// ──────────────────────────────────────────────
function PurchaseStatusModal({ isOpen, onClose, purchase, onSubmit, isSubmitting, t }) {
  const [status, setStatus] = useState(purchase?.status || 'PENDING');
  const [publishedUrl, setPublishedUrl] = useState(purchase?.publishedUrl || '');
  const [rejectedReason, setRejectedReason] = useState(purchase?.rejectedReason || '');

  useEffect(() => {
    if (purchase) {
      setStatus(purchase.status);
      setPublishedUrl(purchase.publishedUrl || '');
      setRejectedReason(purchase.rejectedReason || '');
    }
  }, [purchase]);

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('admin.backlinks.purchaseStatusUpdate')}
      size="small"
    >
      <FormSelect
        label={t('admin.backlinks.columns.purchaseStatus')}
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        options={[
          { value: 'PENDING', label: t('admin.backlinks.purchaseFilters.pending') },
          { value: 'APPROVED', label: t('admin.backlinks.purchaseFilters.approved') },
          { value: 'PUBLISHED', label: t('admin.backlinks.purchaseFilters.published') },
          { value: 'REJECTED', label: t('admin.backlinks.purchaseFilters.rejected') },
          { value: 'REFUNDED', label: t('admin.backlinks.purchaseFilters.refunded') },
          { value: 'CANCELED', label: t('admin.backlinks.purchaseFilters.canceled') },
        ]}
      />

      {status === 'PUBLISHED' && (
        <FormInput
          label={t('admin.backlinks.publishedUrl')}
          placeholder={t('admin.backlinks.publishedUrlPlaceholder')}
          type="url"
          value={publishedUrl}
          onChange={(e) => setPublishedUrl(e.target.value)}
        />
      )}

      {status === 'REJECTED' && (
        <FormTextarea
          label={t('admin.backlinks.rejectReason')}
          placeholder={t('admin.backlinks.rejectReasonPlaceholder')}
          value={rejectedReason}
          onChange={(e) => setRejectedReason(e.target.value)}
          rows={3}
        />
      )}

      <FormActions>
        <SecondaryButton onClick={onClose}>
          {t('admin.common.cancel')}
        </SecondaryButton>
        <PrimaryButton
          isLoading={isSubmitting}
          onClick={() => onSubmit({ purchaseId: purchase.id, status, publishedUrl, rejectedReason })}
        >
          {t('admin.common.save')}
        </PrimaryButton>
      </FormActions>
    </AdminModal>
  );
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────
export default function AdminBacklinksPage() {
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();

  // Tab state
  const [tab, setTab] = useState('listings'); // 'listings' | 'purchases'

  // Listings state
  const [listings, setListings] = useState([]);
  const [listingStats, setListingStats] = useState(null);
  const [listingFilter, setListingFilter] = useState('all');
  const [listingSearch, setListingSearch] = useState('');
  const [listingPage, setListingPage] = useState(1);
  const [listingTotalPages, setListingTotalPages] = useState(1);
  const [isLoadingListings, setIsLoadingListings] = useState(true);

  // Purchases state
  const [purchases, setPurchases] = useState([]);
  const [purchaseFilter, setPurchaseFilter] = useState('all');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchaseTotalPages, setPurchaseTotalPages] = useState(1);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(true);

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingListing, setDeletingListing] = useState(null);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Fetch listings ──
  const fetchListings = useCallback(async () => {
    setIsLoadingListings(true);
    try {
      const params = new URLSearchParams({
        status: listingFilter,
        search: listingSearch,
        page: listingPage.toString(),
        limit: '25',
      });
      const res = await fetch(`/api/admin/backlinks?${params}`);
      const data = await res.json();
      setListings(data.listings || []);
      setListingTotalPages(data.totalPages || 1);
      setListingStats(data.stats || null);
    } catch (error) {
      console.error('Failed to fetch listings:', error);
    } finally {
      setIsLoadingListings(false);
    }
  }, [listingFilter, listingSearch, listingPage]);

  // ── Fetch purchases ──
  const fetchPurchases = useCallback(async () => {
    setIsLoadingPurchases(true);
    try {
      const params = new URLSearchParams({
        status: purchaseFilter,
        search: purchaseSearch,
        page: purchasePage.toString(),
        limit: '25',
      });
      const res = await fetch(`/api/admin/backlinks/purchases?${params}`);
      const data = await res.json();
      setPurchases(data.purchases || []);
      setPurchaseTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch purchases:', error);
    } finally {
      setIsLoadingPurchases(false);
    }
  }, [purchaseFilter, purchaseSearch, purchasePage]);

  useEffect(() => { fetchListings(); }, [fetchListings]);
  useEffect(() => { fetchPurchases(); }, [fetchPurchases]);

  // Reset page on filter/search change
  useEffect(() => { setListingPage(1); }, [listingFilter, listingSearch]);
  useEffect(() => { setPurchasePage(1); }, [purchaseFilter, purchaseSearch]);

  // ── Listing CRUD ──
  const handleAddListing = () => {
    setSelectedListing(null);
    setEditModalOpen(true);
  };

  const handleEditListing = (listing) => {
    setSelectedListing(listing);
    setEditModalOpen(true);
  };

  const handleSubmitListing = async (form) => {
    setIsSubmitting(true);
    try {
      const url = selectedListing?.id
        ? `/api/admin/backlinks/${selectedListing.id}`
        : '/api/admin/backlinks';
      const method = selectedListing?.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error('Failed');
      setEditModalOpen(false);
      fetchListings();
    } catch (error) {
      console.error('Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (listing) => {
    setDeletingListing(listing);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingListing) return;
    setIsSubmitting(true);
    try {
      await fetch(`/api/admin/backlinks/${deletingListing.id}`, { method: 'DELETE' });
      setDeleteDialogOpen(false);
      setDeletingListing(null);
      fetchListings();
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Purchase status update ──
  const handlePurchaseStatusClick = (purchase) => {
    setSelectedPurchase(purchase);
    setPurchaseModalOpen(true);
  };

  const handlePurchaseStatusSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/backlinks/purchases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed');
      setPurchaseModalOpen(false);
      fetchPurchases();
      fetchListings(); // refresh stats
    } catch (error) {
      console.error('Status update error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading / Auth ──
  if (isUserLoading) {
    return <AdminPageSkeleton statsCount={5} columns={8} />;
  }
  if (!isSuperAdmin) return null;

  const statusColor = (s) => {
    const map = {
      ACTIVE: 'active', PUBLISHED: 'active',
      PAUSED: 'pending', PENDING: 'pending', APPROVED: 'pending', TRIALING: 'trialing',
      DRAFT: 'inactive', ARCHIVED: 'inactive', CANCELED: 'canceled',
      SOLD_OUT: 'suspended', REJECTED: 'suspended', REFUNDED: 'suspended',
    };
    return map[s] || 'inactive';
  };

  return (
    <div className={styles.adminPage}>
      {/* Header */}
      <div className={styles.adminHeader}>
        <h1 className={styles.adminTitle}>{t('admin.backlinks.title')}</h1>
        <p className={styles.adminSubtitle}>{t('admin.backlinks.subtitle')}</p>
      </div>

      {/* Stats */}
      {listingStats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('admin.stats.totalListings')}</div>
            <div className={styles.statValue}>{listingStats.totalListings}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('admin.stats.activeListings')}</div>
            <div className={styles.statValue}>{listingStats.activeListings}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('admin.stats.totalPurchases')}</div>
            <div className={styles.statValue}>{listingStats.totalPurchases}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('admin.stats.pendingPurchases')}</div>
            <div className={styles.statValue}>{listingStats.pendingPurchases}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('admin.stats.totalRevenue')}</div>
            <div className={styles.statValue}>${listingStats.totalRevenue?.toLocaleString() || 0}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.adminToolbar}>
        <div className={styles.toolbarLeft}>
          <button
            className={`${styles.filterButton} ${tab === 'listings' ? styles.filterButtonActive : ''}`}
            onClick={() => setTab('listings')}
          >
            <Link2 size={16} />
            {t('admin.backlinks.tabs.listings')}
          </button>
          <button
            className={`${styles.filterButton} ${tab === 'purchases' ? styles.filterButtonActive : ''}`}
            onClick={() => setTab('purchases')}
          >
            <CheckCircle size={16} />
            {t('admin.backlinks.tabs.purchases')}
          </button>
        </div>
      </div>

      {/* ──── LISTINGS TAB ──── */}
      {tab === 'listings' && (
        <>
          <div className={styles.adminToolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrapper}>
                <Search className={styles.searchIcon} />
                <input
                  className={styles.searchInput}
                  type="text"
                  placeholder={t('admin.backlinks.searchPlaceholder')}
                  value={listingSearch}
                  onChange={(e) => setListingSearch(e.target.value)}
                />
              </div>
              <select
                className={styles.filterSelect}
                value={listingFilter}
                onChange={(e) => setListingFilter(e.target.value)}
              >
                {['all', 'ACTIVE', 'PAUSED', 'DRAFT', 'ARCHIVED', 'SOLD_OUT'].map(f => (
                  <option key={f} value={f}>
                    {f === 'all' ? t('admin.backlinks.filters.all') :
                     f === 'SOLD_OUT' ? t('admin.backlinks.filters.soldOut') :
                     t(`admin.backlinks.filters.${f.toLowerCase()}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.toolbarRight}>
              <button className={styles.refreshButton} onClick={fetchListings}>
                <RefreshCw size={16} />
              </button>
              <Button variant="primary" onClick={handleAddListing}>
                <Plus size={16} />
                {t('admin.backlinks.addListing')}
              </Button>
            </div>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead className={styles.tableHeader}>
                <tr>
                  <th>{t('admin.backlinks.columns.domain')}</th>
                  <th>{t('admin.backlinks.columns.title')}</th>
                  <th>{t('admin.backlinks.columns.linkType')}</th>
                  <th>{t('admin.backlinks.columns.da')}</th>
                  <th>{t('admin.backlinks.columns.dr')}</th>
                  <th>{t('admin.backlinks.columns.price')}</th>
                  <th>{t('admin.backlinks.columns.slots')}</th>
                  <th>{t('admin.backlinks.columns.status')}</th>
                  <th>{t('admin.backlinks.columns.actions')}</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {isLoadingListings ? (
                  <tr>
                    <td colSpan={9}>
                      <div className={styles.loadingState}>
                        <div className={styles.spinner} />
                      </div>
                    </td>
                  </tr>
                ) : listings.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className={styles.emptyState}>
                        <Link2 className={styles.emptyIcon} />
                        <h3 className={styles.emptyTitle}>{t('admin.backlinks.noListings')}</h3>
                        <p className={styles.emptyMessage}>{t('admin.backlinks.createFirst')}</p>
                      </div>
                    </td>
                  </tr>
                ) : listings.map(listing => (
                  <tr key={listing.id}>
                    <td>
                      <span style={{ direction: 'ltr', display: 'inline-block' }}>{listing.domain}</span>
                    </td>
                    <td>{listing.title}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${listing.linkType === 'DOFOLLOW' ? styles.active : styles.pending}`}>
                        {listing.linkType}
                      </span>
                    </td>
                    <td>{listing.domainAuthority ?? '-'}</td>
                    <td>{listing.domainRating ?? '-'}</td>
                    <td>
                      {listing.price != null ? `$${listing.price}` : '-'}
                      {listing.aiCreditsPrice != null && (
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                          {listing.aiCreditsPrice} credits
                        </span>
                      )}
                    </td>
                    <td>
                      {listing.maxSlots
                        ? `${listing.soldCount}/${listing.maxSlots}`
                        : `${listing.soldCount} ${t('admin.backlinks.sold')}`}
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[statusColor(listing.status)]}`}>
                        {listing.status}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        <Button
                          variant="icon"
                          onClick={() => handleEditListing(listing)}
                          title={t('admin.backlinks.editListing')}
                        >
                          <Edit2 size={16} />
                        </Button>
                        <Button
                          variant="icon"
                          iconDanger
                          onClick={() => handleDeleteClick(listing)}
                          title={t('admin.backlinks.deleteListing')}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {listingTotalPages > 1 && (
              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>
                  {t('admin.backlinks.tabs.listings')} - {listingPage} / {listingTotalPages}
                </span>
                <div className={styles.paginationButtons}>
                  <button
                    className={styles.paginationButton}
                    disabled={listingPage <= 1}
                    onClick={() => setListingPage(p => p - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className={styles.paginationButton}
                    disabled={listingPage >= listingTotalPages}
                    onClick={() => setListingPage(p => p + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ──── PURCHASES TAB ──── */}
      {tab === 'purchases' && (
        <>
          <div className={styles.adminToolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrapper}>
                <Search className={styles.searchIcon} />
                <input
                  className={styles.searchInput}
                  type="text"
                  placeholder={t('admin.backlinks.searchPlaceholder')}
                  value={purchaseSearch}
                  onChange={(e) => setPurchaseSearch(e.target.value)}
                />
              </div>
              <select
                className={styles.filterSelect}
                value={purchaseFilter}
                onChange={(e) => setPurchaseFilter(e.target.value)}
              >
                {['all', 'PENDING', 'APPROVED', 'PUBLISHED', 'REJECTED', 'REFUNDED', 'CANCELED'].map(f => (
                  <option key={f} value={f}>
                    {f === 'all' ? t('admin.backlinks.purchaseFilters.all') :
                     t(`admin.backlinks.purchaseFilters.${f.toLowerCase()}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.toolbarRight}>
              <button className={styles.refreshButton} onClick={fetchPurchases}>
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead className={styles.tableHeader}>
                <tr>
                  <th>{t('admin.backlinks.columns.domain')}</th>
                  <th>{t('admin.backlinks.columns.buyer')}</th>
                  <th>{t('admin.backlinks.columns.targetUrl')}</th>
                  <th>{t('admin.backlinks.columns.anchorText')}</th>
                  <th>{t('admin.backlinks.columns.payment')}</th>
                  <th>{t('admin.backlinks.columns.purchaseDate')}</th>
                  <th>{t('admin.backlinks.columns.purchaseStatus')}</th>
                  <th>{t('admin.backlinks.columns.actions')}</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {isLoadingPurchases ? (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.loadingState}>
                        <div className={styles.spinner} />
                      </div>
                    </td>
                  </tr>
                ) : purchases.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.emptyState}>
                        <CheckCircle className={styles.emptyIcon} />
                        <h3 className={styles.emptyTitle}>{t('admin.backlinks.noPurchases')}</h3>
                      </div>
                    </td>
                  </tr>
                ) : purchases.map(purchase => (
                  <tr key={purchase.id}>
                    <td>
                      <span style={{ direction: 'ltr', display: 'inline-block' }}>
                        {purchase.listing?.domain || '-'}
                      </span>
                    </td>
                    <td>{purchase.buyerAccountId?.slice(-6) || '-'}</td>
                    <td>
                      <span style={{ direction: 'ltr', display: 'inline-block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {purchase.targetUrl}
                      </span>
                    </td>
                    <td>{purchase.anchorText || '-'}</td>
                    <td>
                      {purchase.paymentMethod === 'DIRECT' && purchase.amountPaid != null
                        ? `$${purchase.amountPaid}`
                        : purchase.paymentMethod === 'AI_CREDITS' && purchase.creditsPaid != null
                        ? `${purchase.creditsPaid} credits`
                        : purchase.paymentMethod?.replace('_', ' ')}
                    </td>
                    <td>{new Date(purchase.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[statusColor(purchase.status)]}`}>
                        {purchase.status}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        <Button
                          variant="icon"
                          onClick={() => handlePurchaseStatusClick(purchase)}
                          title={t('admin.backlinks.purchaseStatusUpdate')}
                        >
                          <Edit2 size={16} />
                        </Button>
                        {purchase.publishedUrl && (
                          <a
                            href={purchase.publishedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.actionButton}
                            title={t('admin.backlinks.publishedUrl')}
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {purchaseTotalPages > 1 && (
              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>
                  {t('admin.backlinks.tabs.purchases')} - {purchasePage} / {purchaseTotalPages}
                </span>
                <div className={styles.paginationButtons}>
                  <button
                    className={styles.paginationButton}
                    disabled={purchasePage <= 1}
                    onClick={() => setPurchasePage(p => p - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className={styles.paginationButton}
                    disabled={purchasePage >= purchaseTotalPages}
                    onClick={() => setPurchasePage(p => p + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ──── Modals ──── */}
      <ListingFormModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        listing={selectedListing}
        onSubmit={handleSubmitListing}
        isSubmitting={isSubmitting}
        t={t}
      />

      <PurchaseStatusModal
        isOpen={purchaseModalOpen}
        onClose={() => setPurchaseModalOpen(false)}
        purchase={selectedPurchase}
        onSubmit={handlePurchaseStatusSubmit}
        isSubmitting={isSubmitting}
        t={t}
      />

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('admin.backlinks.deleteTitle')}
        message={t('admin.backlinks.deleteMessage')}
        isLoading={isSubmitting}
      />
    </div>
  );
}
