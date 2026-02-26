'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { 
  Calendar, 
  List, 
  ChevronLeft,
  ChevronRight,
  Eye,
  FolderOpen,
  Loader2,
  Sparkles,
  Pencil,
  FileText,
  X,
  ExternalLink,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { StatusBadge } from '../../../components';
import CreateCampaignModal from './CreateCampaignModal';
import EditCampaignModal from './EditCampaignModal';
import WpConnectionModal from './WpConnectionModal';
import styles from '../page.module.css';

const STATUS_MAP = {
  ACTIVE: 'active',
  DRAFT: 'draft',
  PAUSED: 'paused',
  COMPLETED: 'completed',
};

export function ContentPlannerView({ translations }) {
  const [viewMode, setViewMode] = useState('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null); // null = "All"
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [showWpModal, setShowWpModal] = useState(false);
  const [previewPost, setPreviewPost] = useState(null);
  const { selectedSite } = useSite();

  // Check WP connection on mount
  useEffect(() => {
    if (!selectedSite) return;
    const isWordpress = selectedSite.platform === 'wordpress';
    const isConnected = selectedSite.connectionStatus === 'CONNECTED';
    if (!isWordpress || !isConnected) {
      setShowWpModal(true);
    }
  }, [selectedSite]);

  useEffect(() => {
    if (!selectedSite?.id) return;
    setLoadingCampaigns(true);
    fetch(`/api/campaigns?siteId=${selectedSite.id}`)
      .then(res => res.json())
      .then(data => setCampaigns(data.campaigns || []))
      .catch(() => setCampaigns([]))
      .finally(() => setLoadingCampaigns(false));
  }, [selectedSite?.id]);

  // Listen for campaign-created event from header button
  useEffect(() => {
    const handleExternalCreate = () => {
      if (!selectedSite?.id) return;
      fetch(`/api/campaigns?siteId=${selectedSite.id}`)
        .then(res => res.json())
        .then(data => setCampaigns(data.campaigns || []))
        .catch(() => {});
    };
    window.addEventListener('campaign-created', handleExternalCreate);
    return () => window.removeEventListener('campaign-created', handleExternalCreate);
  }, [selectedSite?.id]);

  // Fetch posts from entities API
  useEffect(() => {
    if (!selectedSite?.id) return;
    setLoadingPosts(true);
    fetch(`/api/entities?siteId=${selectedSite.id}&type=posts`)
      .then(res => res.json())
      .then(data => setPosts(data.entities || []))
      .catch(() => setPosts([]))
      .finally(() => setLoadingPosts(false));
  }, [selectedSite?.id]);

  const goToPrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const getMonthName = (date) => {
    const months = translations.months;
    return months[date.getMonth()];
  };

  // Map entity status to dot type
  const statusToDot = (status) => {
    switch (status) {
      case 'PUBLISHED': return 'published';
      case 'SCHEDULED': return 'scheduled';
      case 'DRAFT': return 'draft';
      case 'PENDING': return 'draft';
      default: return null;
    }
  };

  // Build date → posts map for the current month
  const getPostsByDate = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const map = {};

    posts.forEach(post => {
      const dateStr = post.publishedAt || post.scheduledAt || post.createdAt;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const status = statusToDot(post.status);
      if (!status) return;
      const day = d.getDate();
      if (!map[day]) map[day] = [];
      map[day].push({ ...post, title: post.title || translations.untitled, dotStatus: status });
    });

    return map;
  };

  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const days = [];
    const today = new Date();
    const postsByDate = getPostsByDate();
    
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, month: 'prev' });
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      const isToday = today.getDate() === i && 
                      today.getMonth() === month && 
                      today.getFullYear() === year;
      days.push({ 
        day: i, 
        today: isToday,
        posts: postsByDate[i] || undefined
      });
    }
    
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, month: 'next' });
    }
    
    return days;
  };

  const calendarDays = generateCalendarDays();
  const tc = translations.campaigns || {};

  const handleCampaignCreated = (campaign) => {
    setCampaigns(prev => [campaign, ...prev]);
  };

  const handleCampaignUpdated = (updated) => {
    setCampaigns(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
  };

  const handleCampaignDeleted = (id) => {
    setCampaigns(prev => prev.filter(c => c.id !== id));
    if (selectedCampaignId === id) setSelectedCampaignId(null);
  };

  const openCreateModal = () => setShowCreateModal(true);

  return (
    <div className={styles.plannerLayout}>
      {/* Campaigns Sidebar */}
      <aside className={styles.campaignsSidebar}>
        <div className={styles.sidebarHeader}>
          <FolderOpen size={16} />
          <h3 className={styles.sidebarTitle}>{tc.title || 'Campaigns'}</h3>
          <button className={styles.sidebarAddBtn} onClick={openCreateModal} title={tc.createNew || 'Create campaign'}>
            <Sparkles size={14} />
          </button>
        </div>

        {loadingCampaigns ? (
          <div className={styles.sidebarLoading}>
            <Loader2 size={18} className={styles.spinner} />
          </div>
        ) : campaigns.length === 0 ? (
          <div className={styles.sidebarEmpty}>
            <p>{tc.noCampaigns || 'No campaigns yet'}</p>
            <p className={styles.sidebarEmptyHint}>{tc.createFirst || 'Create your first campaign'}</p>
            <button className={styles.sidebarWizardLink} onClick={openCreateModal}>
              <Sparkles size={14} />
              {tc.createNew || 'Create Campaign'}
            </button>
          </div>
        ) : (
          <div className={styles.sidebarCampaignList}>
            {/* All filter */}
            <button
              className={`${styles.sidebarCampaignItem} ${selectedCampaignId === null ? styles.active : ''}`}
              onClick={() => setSelectedCampaignId(null)}
            >
              <span className={styles.sidebarCampaignDot} style={{ background: 'var(--muted-foreground)' }} />
              <span className={styles.sidebarCampaignName}>{tc.all || 'All'}</span>
              <span className={styles.sidebarCampaignCount}>
                {campaigns.reduce((sum, c) => sum + (c._count?.contents || 0), 0)}
              </span>
            </button>

            {campaigns.map(campaign => (
              <div key={campaign.id} className={styles.sidebarCampaignRow}>
                <button
                  className={`${styles.sidebarCampaignItem} ${selectedCampaignId === campaign.id ? styles.active : ''}`}
                  onClick={() => setSelectedCampaignId(campaign.id)}
                >
                  <span className={styles.sidebarCampaignDot} style={{ background: campaign.color }} />
                  <div className={styles.sidebarCampaignInfo}>
                    <span className={styles.sidebarCampaignName}>{campaign.name}</span>
                    <span className={styles.sidebarCampaignMeta}>
                      {campaign._count?.contents || 0} {tc.posts || 'posts'}
                      {' · '}
                      {tc[STATUS_MAP[campaign.status]] || campaign.status}
                    </span>
                  </div>
                  <span className={styles.sidebarCampaignCount}>{campaign._count?.contents || 0}</span>
                </button>
                <div className={styles.campaignActions}>
                  <button
                    className={styles.campaignActionBtn}
                    onClick={(e) => { e.stopPropagation(); setEditingCampaign(campaign); }}
                    title={tc.editCampaign || 'Edit campaign'}
                  >
                    <Pencil size={13} />
                  </button>
                  <Link
                    href={`/dashboard/strategy/ai-content-wizard?campaignId=${campaign.id}`}
                    className={styles.campaignActionBtn}
                    title={(campaign._count?.contents || 0) > 0 ? (tc.editPosts || 'Edit posts') : (tc.createPosts || 'Create posts')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FileText size={13} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className={styles.plannerMain}>
        <div className={styles.viewToggle}>
        <button 
          className={`${styles.viewButton} ${viewMode === 'calendar' ? styles.active : ''}`}
          onClick={() => setViewMode('calendar')}
        >
          <Calendar size={16} />
          {translations.calendar}
        </button>
        <button 
          className={`${styles.viewButton} ${viewMode === 'list' ? styles.active : ''}`}
          onClick={() => setViewMode('list')}
        >
          <List size={16} />
          {translations.list}
        </button>
      </div>

      {viewMode === 'calendar' ? (
        <div className={styles.calendarCard}>
          <div className={styles.calendarHeader}>
            <h3 className={styles.calendarTitle}>{getMonthName(currentDate)} {currentDate.getFullYear()}</h3>
            <div className={styles.calendarNav}>
              <button className={styles.calendarNavButton} onClick={goToPrevMonth}>
                <ChevronLeft size={16} />
              </button>
              <button className={styles.calendarNavButton} onClick={goToNextMonth}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className={styles.calendarGrid}>
            {translations.dayNames.map((day) => (
              <div key={day} className={styles.calendarDayHeader}>{day}</div>
            ))}
            {calendarDays.map((item, index) => (
              <div 
                key={index} 
                className={`${styles.calendarDay} ${item.today ? styles.today : ''} ${item.month ? styles.otherMonth : ''}`}
              >
                <span className={styles.dayNumber}>{item.day}</span>
                {item.posts && (
                  <div className={styles.dayPosts}>
                    {item.posts.map((post) => (
                      <div key={post.id} className={styles.dayPostItem} onClick={() => setPreviewPost(post)}>
                        <span className={`${styles.dayPostDot} ${styles[post.dotStatus]}`} />
                        <span className={styles.dayPostTitle}>{post.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.published}`} />
              {translations.published}
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.scheduled}`} />
              {translations.scheduled}
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.draft}`} />
              {translations.draft}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.calendarCard}>
          <div className={styles.calendarHeader}>
            <h3 className={styles.calendarTitle}>{translations.allContent}</h3>
          </div>
          {loadingPosts ? (
            <div className={styles.sidebarLoading}>
              <Loader2 size={18} className={styles.spinner} />
            </div>
          ) : posts.length === 0 ? (
            <div className={styles.sidebarEmpty}>
              <p>{translations.noPosts || 'No posts found'}</p>
            </div>
          ) : (
            <div className={styles.contentList}>
              {posts.map((post) => {
                const dotType = statusToDot(post.status);
                const statusText = dotType === 'published' ? translations.published
                  : dotType === 'scheduled' ? translations.scheduled
                  : translations.draft;
                const badgeStatus = dotType === 'published' ? 'complete'
                  : dotType === 'scheduled' ? 'pending' : 'paused';
                const dateStr = post.publishedAt || post.scheduledAt || post.createdAt;
                const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString() : '-';

                return (
                  <div key={post.id} className={styles.contentItem}>
                    <div className={styles.contentInfo}>
                      <span className={styles.contentTitle}>{post.title}</span>
                      <span className={styles.contentMeta}>{post.entityType?.name || 'Post'}</span>
                    </div>
                    <StatusBadge status={badgeStatus}>
                      {statusText}
                    </StatusBadge>
                    <span className={styles.contentDate}>{formattedDate}</span>
                    {post.url && (
                      <div className={styles.contentActions}>
                        <a href={post.url} target="_blank" rel="noopener noreferrer" className={styles.actionButton}>
                          <Eye size={14} />
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>

      {showCreateModal && (
        <CreateCampaignModal
          translations={translations.createModal || {}}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCampaignCreated}
        />
      )}

      {editingCampaign && (
        <EditCampaignModal
          campaign={editingCampaign}
          translations={translations.editModal || {}}
          onClose={() => setEditingCampaign(null)}
          onUpdated={handleCampaignUpdated}
          onDeleted={handleCampaignDeleted}
        />
      )}

      {showWpModal && (
        <WpConnectionModal
          translations={translations.wpConnection || {}}
          onClose={() => setShowWpModal(false)}
          onConnected={() => {
            setShowWpModal(false);
            // Re-fetch posts now that the site is connected
            if (selectedSite?.id) {
              setLoadingPosts(true);
              fetch(`/api/entities?siteId=${selectedSite.id}&type=posts`)
                .then(res => res.json())
                .then(data => setPosts(data.entities || []))
                .catch(() => setPosts([]))
                .finally(() => setLoadingPosts(false));
            }
          }}
        />
      )}

      {previewPost && createPortal(
        <div className={styles.modalOverlay} onClick={() => setPreviewPost(null)}>
          <div className={`${styles.modal} ${styles.previewModal}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{translations.preview?.title || 'Post Preview'}</h3>
              <button className={styles.modalClose} onClick={() => setPreviewPost(null)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {previewPost.featuredImage && (
                <div className={styles.previewImage}>
                  <img src={previewPost.featuredImage} alt={previewPost.title} />
                </div>
              )}
              <h4 className={styles.previewTitle}>{previewPost.title}</h4>
              <div className={styles.previewMeta}>
                <StatusBadge status={
                  previewPost.dotStatus === 'published' ? 'complete'
                    : previewPost.dotStatus === 'scheduled' ? 'pending' : 'paused'
                }>
                  {previewPost.dotStatus === 'published' ? translations.published
                    : previewPost.dotStatus === 'scheduled' ? translations.scheduled
                    : translations.draft}
                </StatusBadge>
                {(previewPost.publishedAt || previewPost.scheduledAt) && (
                  <span className={styles.previewDate}>
                    {new Date(previewPost.publishedAt || previewPost.scheduledAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              {previewPost.excerpt && (
                <p className={styles.previewExcerpt}>{previewPost.excerpt}</p>
              )}
              {previewPost.content && (
                <div className={styles.previewContent} dangerouslySetInnerHTML={{ __html: previewPost.content }} />
              )}
              {!previewPost.excerpt && !previewPost.content && (
                <p className={styles.previewEmpty}>{translations.preview?.noContent || 'No content available'}</p>
              )}
            </div>
            {previewPost.url && (
              <div className={styles.modalFooter}>
                <a
                  href={previewPost.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.previewLink}
                >
                  <ExternalLink size={14} />
                  {translations.preview?.viewOnSite || 'View on site'}
                </a>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

ContentPlannerView.OpenCreateModal = null; // placeholder for ref
