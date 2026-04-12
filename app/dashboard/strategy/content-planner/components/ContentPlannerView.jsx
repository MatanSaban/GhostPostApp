'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Plus,
  Pencil,
  FileText,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  RotateCcw,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { usePermissions, MODULES } from '@/app/hooks/usePermissions';
import { StatusBadge } from '../../../components';
import { ConfirmDialog } from '@/app/dashboard/admin/components/AdminModal';
import CalendarGrid from '../../_shared/CalendarGrid';
import PostPopover from '../../_shared/PostPopover';
import { activateCampaign, pauseCampaign, resumeCampaign } from '../../_shared/campaignActions';
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
  const [popover, setPopover] = useState(null); // { post, rect }
  const [activatingId, setActivatingId] = useState(null);
  const [pausingId, setPausingId] = useState(null);
  const [pipelineContents, setPipelineContents] = useState([]);
  const [pipelineStats, setPipelineStats] = useState(null);
  const [loadingPipeline, setLoadingPipeline] = useState(true);
  const [pendingReschedule, setPendingReschedule] = useState(null); // { post, newScheduledAt }
  const [rescheduling, setRescheduling] = useState(false);
  const { selectedSite } = useSite();
  
  // Permission checks for content planner
  const { canCreate, canEdit, canDelete } = usePermissions();
  const canCreateCampaign = canCreate(MODULES.CONTENT_PLANNER);
  const canEditCampaign = canEdit(MODULES.CONTENT_PLANNER);
  const canDeleteCampaign = canDelete(MODULES.CONTENT_PLANNER);

  // ── Popover helpers ────────────────────────────────────────────
  const openPopover = (post, e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ post, rect });
  };
  const closePopover = () => setPopover(null);

  // ── Update post date/time from popover ─────────────────────────
  const updatePostDate = (post, newDateStr) => {
    if (!newDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(newDateStr)) return; // Invalid date format
    const oldDate = new Date(post.scheduledAt);
    const [year, month, day] = newDateStr.split('-').map(Number);
    const newDate = new Date(year, month - 1, day, oldDate.getHours(), oldDate.getMinutes(), 0);
    if (isNaN(newDate.getTime())) return; // Invalid date
    const newScheduledAt = newDate.toISOString();

    if (post.source === 'plan') {
      const campaign = campaigns.find(c => c.id === post.campaignId);
      if (!campaign) return;
      const plan = [...(campaign.generatedPlan || [])];
      if (plan[post.planIndex]) {
        plan[post.planIndex] = { ...plan[post.planIndex], scheduledAt: newScheduledAt };
        setCampaigns(prev => prev.map(c =>
          c.id === post.campaignId ? { ...c, generatedPlan: plan } : c
        ));
        // Update popover post in state
        setPopover(prev => prev ? { ...prev, post: { ...prev.post, scheduledAt: newScheduledAt } } : null);
        fetch(`/api/campaigns/${post.campaignId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generatedPlan: plan }),
        }).catch(() => {});
      }
    } else if (post.source === 'pipeline') {
      setPipelineContents(prev => prev.map(c =>
        c.id === post.id ? { ...c, scheduledAt: newScheduledAt } : c
      ));
      setPopover(prev => prev ? { ...prev, post: { ...prev.post, scheduledAt: newScheduledAt } } : null);
      fetch(`/api/contents/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: newScheduledAt }),
      }).catch(() => {});
    }
  };

  const updatePostTime = (post, newTimeStr) => {
    if (!newTimeStr || !/^\d{1,2}:\d{2}$/.test(newTimeStr)) return; // Invalid time format
    const oldDate = new Date(post.scheduledAt);
    const [h, m] = newTimeStr.split(':').map(Number);
    const newDate = new Date(oldDate);
    newDate.setHours(h, m, 0, 0);
    if (isNaN(newDate.getTime())) return; // Invalid time
    const newScheduledAt = newDate.toISOString();

    if (post.source === 'plan') {
      const campaign = campaigns.find(c => c.id === post.campaignId);
      if (!campaign) return;
      const plan = [...(campaign.generatedPlan || [])];
      if (plan[post.planIndex]) {
        plan[post.planIndex] = { ...plan[post.planIndex], scheduledAt: newScheduledAt };
        setCampaigns(prev => prev.map(c =>
          c.id === post.campaignId ? { ...c, generatedPlan: plan } : c
        ));
        setPopover(prev => prev ? { ...prev, post: { ...prev.post, scheduledAt: newScheduledAt } } : null);
        fetch(`/api/campaigns/${post.campaignId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generatedPlan: plan }),
        }).catch(() => {});
      }
    } else if (post.source === 'pipeline') {
      setPipelineContents(prev => prev.map(c =>
        c.id === post.id ? { ...c, scheduledAt: newScheduledAt } : c
      ));
      setPopover(prev => prev ? { ...prev, post: { ...prev.post, scheduledAt: newScheduledAt } } : null);
      fetch(`/api/contents/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: newScheduledAt }),
      }).catch(() => {});
    }
  };

  // ── Drag & Drop handler (called by CalendarGrid) ─────────────
  const handleCalendarDrop = useCallback((draggedPost, targetCell) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const targetDay = targetCell.day;
    const oldDate = new Date(draggedPost.scheduledAt || draggedPost.publishedAt || draggedPost.createdAt);
    const newDate = new Date(year, month, targetDay, oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());

    // Same day - no-op
    if (oldDate.getDate() === targetDay && oldDate.getMonth() === month && oldDate.getFullYear() === year) return;

    const newScheduledAt = newDate.toISOString();
    const isPublished = draggedPost.dotStatus === 'published' || draggedPost.statusKey === 'PUBLISHED' || draggedPost.status === 'PUBLISHED';

    // Published posts require confirmation before rescheduling
    if (isPublished) {
      setPendingReschedule({ post: draggedPost, newScheduledAt });
      return;
    }

    if (draggedPost.source === 'plan') {
      const campaign = campaigns.find(c => c.id === draggedPost.campaignId);
      if (!campaign) return;
      const plan = [...(campaign.generatedPlan || [])];
      const planIdx = draggedPost.planIndex;
      if (plan[planIdx]) {
        plan[planIdx] = { ...plan[planIdx], scheduledAt: newScheduledAt };
        setCampaigns(prev => prev.map(c =>
          c.id === draggedPost.campaignId ? { ...c, generatedPlan: plan } : c
        ));
        fetch(`/api/campaigns/${draggedPost.campaignId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generatedPlan: plan }),
        }).catch(() => {});
      }
    } else if (draggedPost.source === 'pipeline') {
      if (draggedPost.statusKey === 'READY_TO_PUBLISH') {
        setPipelineContents(prev => prev.map(c =>
          c.id === draggedPost.id
            ? { ...c, scheduledAt: newScheduledAt, status: 'READY_TO_PUBLISH', statusKey: 'READY_TO_PUBLISH', dotStatus: 'readyToPublish' }
            : c
        ));
        fetch(`/api/contents/${draggedPost.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetStatus: 'READY_TO_PUBLISH', scheduledAt: newScheduledAt }),
        }).catch(() => {});
      } else {
        setPipelineContents(prev => prev.map(c =>
          c.id === draggedPost.id ? { ...c, scheduledAt: newScheduledAt } : c
        ));
        fetch(`/api/contents/${draggedPost.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduledAt: newScheduledAt }),
        }).catch(() => {});
      }
    } else if (draggedPost.source === 'entity') {
      // Non-published entity posts: simple date update
      setPosts(prev => prev.map(p =>
        p.id === draggedPost.id ? { ...p, scheduledAt: newScheduledAt } : p
      ));
      fetch(`/api/entities/${draggedPost.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: newScheduledAt }),
      }).catch(() => {});
    }
  }, [currentDate, campaigns]);

  // ── Reschedule published post (after confirmation) ───────────
  const executeReschedule = async () => {
    if (!pendingReschedule) return;
    const { post, newScheduledAt } = pendingReschedule;
    setRescheduling(true);

    try {
      if (post.source === 'pipeline') {
        // Pipeline published post → transition to READY_TO_PUBLISH
        setPipelineContents(prev => prev.map(c =>
          c.id === post.id
            ? { ...c, scheduledAt: newScheduledAt, status: 'READY_TO_PUBLISH', statusKey: 'READY_TO_PUBLISH', dotStatus: 'readyToPublish' }
            : c
        ));
        const res = await fetch(`/api/contents/${post.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetStatus: 'READY_TO_PUBLISH', scheduledAt: newScheduledAt }),
        });
        if (!res.ok) {
          // Revert optimistic update
          fetchPipeline();
        }
      } else if (post.source === 'entity') {
        // Entity published post → schedule on WP with new date
        setPosts(prev => prev.map(p =>
          p.id === post.id
            ? { ...p, scheduledAt: newScheduledAt, publishedAt: null, status: 'SCHEDULED' }
            : p
        ));
        const res = await fetch(`/api/entities/${post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'SCHEDULED', scheduledAt: newScheduledAt }),
        });
        if (!res.ok) {
          // Revert — refetch posts
          fetch(`/api/entities?siteId=${selectedSite.id}&type=posts`)
            .then(r => r.json())
            .then(data => setPosts(data.entities || []))
            .catch(() => {});
        }
      }
    } catch {
      // Network error — refetch
      if (post.source === 'pipeline') fetchPipeline();
    } finally {
      setRescheduling(false);
      setPendingReschedule(null);
    }
  };

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

  // Fetch Content pipeline records (always fetch ALL - filter locally for view)
  const fetchPipeline = useCallback(() => {
    if (!selectedSite?.id) return;
    fetch(`/api/contents?siteId=${selectedSite.id}`)
      .then(res => res.json())
      .then(data => {
        setPipelineContents(data.contents || []);
        setPipelineStats(data.stats || null);
      })
      .catch(() => {
        setPipelineContents([]);
        setPipelineStats(null);
      })
      .finally(() => setLoadingPipeline(false));
  }, [selectedSite?.id]);

  useEffect(() => {
    setLoadingPipeline(true);
    fetchPipeline();
  }, [fetchPipeline]);

  // Auto-refresh pipeline every 30s when active campaigns exist
  useEffect(() => {
    const hasActive = campaigns.some(c => c.status === 'ACTIVE');
    if (!hasActive) return;
    const interval = setInterval(fetchPipeline, 30_000);
    return () => clearInterval(interval);
  }, [campaigns, fetchPipeline]);

  // ── Campaign lifecycle handlers ────────────────────────────────
  const handleActivate = async (campaign) => {
    const tc = translations.campaigns || {};
    setActivatingId(campaign.id);
    const result = await activateCampaign(campaign, {
      translations: tc,
      onSuccess: (newStatus) => {
        setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: newStatus } : c));
        fetchPipeline();
      },
      onError: (err) => {
        if (err !== 'cancelled') alert(err);
      },
    });
    setActivatingId(null);
  };

  const handlePause = async (campaign) => {
    const tc = translations.campaigns || {};
    setPausingId(campaign.id);
    await pauseCampaign(campaign, {
      translations: tc,
      onSuccess: (newStatus) => {
        setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: newStatus } : c));
      },
      onError: (err) => alert(err),
    });
    setPausingId(null);
  };

  const handleResume = async (campaign) => {
    const tc = translations.campaigns || {};
    setActivatingId(campaign.id);
    await resumeCampaign(campaign, {
      translations: tc,
      onSuccess: (newStatus) => {
        setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: newStatus } : c));
      },
      onError: (err) => alert(err),
    });
    setActivatingId(null);
  };

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

  // Map entity/content status to dot type
  const statusToDot = (status) => {
    switch (status) {
      case 'PUBLISHED': return 'published';
      case 'SCHEDULED': return 'scheduled';
      case 'DRAFT': return 'draft';
      case 'PENDING': return 'draft';
      case 'PROCESSING': return 'processing';
      case 'READY_TO_PUBLISH': return 'readyToPublish';
      case 'FAILED': return 'failed';
      default: return null;
    }
  };

  // IDs of campaigns that already have Content records in the pipeline
  const activatedCampaignIds = new Set(pipelineContents.map(c => c.campaignId).filter(Boolean));

  // Filter pipeline contents by selected campaign (local filter)
  const filteredPipelineContents = selectedCampaignId
    ? pipelineContents.filter(c => c.campaignId === selectedCampaignId)
    : pipelineContents;

  // Build date → posts map for the current month
  const getPostsByDate = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const map = {};

    // Add entity posts (from WordPress sync)
    posts.forEach(post => {
      const dateStr = post.publishedAt || post.scheduledAt || post.createdAt;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const status = statusToDot(post.status);
      if (!status) return;
      const day = d.getDate();
      if (!map[day]) map[day] = [];
      map[day].push({ ...post, title: post.title || translations.untitled, dotStatus: status, source: 'entity' });
    });

    // Add pipeline content (from Content records) - only filtered ones
    filteredPipelineContents.forEach(content => {
      // For pipeline content, use scheduledAt as the calendar date.
      // publishedAt is just a record of when it was published, not the calendar position.
      // Only fall back to publishedAt if scheduledAt is missing (legacy data).
      const dateStr = content.scheduledAt || content.publishedAt;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const status = statusToDot(content.status);
      if (!status) return;
      const day = d.getDate();
      if (!map[day]) map[day] = [];
      map[day].push({
        ...content,
        title: content.title || translations.untitled,
        dotStatus: status,
        statusKey: content.status,
        source: 'pipeline',
        campaignColor: content.campaign?.color,
        campaignName: content.campaign?.name || content.campaignDeletedName,
        campaignDeleted: !content.campaign && !!content.campaignDeletedName,
      });
    });

    // Add planned posts from generatedPlan for campaigns that have NOT been
    // activated yet (no Content records). This ensures DRAFT campaign posts
    // are visible on the calendar.
    campaigns.forEach(campaign => {
      // Skip if this campaign already has Content records
      if (activatedCampaignIds.has(campaign.id)) return;
      // Skip if a specific campaign is selected and it's not this one
      if (selectedCampaignId && selectedCampaignId !== campaign.id) return;
      const plan = campaign.generatedPlan;
      if (!Array.isArray(plan) || plan.length === 0) return;

      plan.forEach((entry, i) => {
        if (!entry.scheduledAt) return;
        const d = new Date(entry.scheduledAt);
        if (d.getFullYear() !== year || d.getMonth() !== month) return;
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push({
          id: `plan-${campaign.id}-${i}`,
          title: entry.title || `${tp.postNumber || 'Post'} ${i + 1}`,
          dotStatus: 'scheduled', // planned posts show as scheduled
          source: 'plan',
          type: entry.type,
          scheduledAt: entry.scheduledAt,
          campaignColor: campaign.color,
          campaignName: campaign.name,
          campaignId: campaign.id,
          planIndex: i,
        });
      });
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
  const tp = translations.pipeline || {};
  const ts = translations.status || {};

  // Build planned-post items from generatedPlan for non-activated campaigns
  const plannedItems = campaigns.flatMap(campaign => {
    if (activatedCampaignIds.has(campaign.id)) return [];
    if (selectedCampaignId && selectedCampaignId !== campaign.id) return [];
    const plan = campaign.generatedPlan;
    if (!Array.isArray(plan) || plan.length === 0) return [];
    return plan.map((entry, i) => ({
      id: `plan-${campaign.id}-${i}`,
      title: entry.title || `${tp.postNumber || 'Post'} ${i + 1}`,
      status: 'SCHEDULED',
      dotStatus: 'scheduled',
      source: 'plan',
      type: entry.type,
      scheduledAt: entry.scheduledAt,
      campaignColor: campaign.color,
      campaignName: campaign.name,
      campaignId: campaign.id,
    }));
  });

  // Merge entity posts + pipeline contents + planned posts for the list view
  const allListItems = [
    ...posts.map(p => ({ ...p, source: 'entity', dotStatus: statusToDot(p.status) })),
    ...filteredPipelineContents.map(c => ({
      ...c,
      source: 'pipeline',
      dotStatus: statusToDot(c.status),
      campaignColor: c.campaign?.color,
      campaignName: c.campaign?.name || c.campaignDeletedName,
      campaignDeleted: !c.campaign && !!c.campaignDeletedName,
    })),
    ...plannedItems,
  ].sort((a, b) => {
    const dateA = new Date(a.scheduledAt || a.publishedAt || a.createdAt || 0);
    const dateB = new Date(b.scheduledAt || b.publishedAt || b.createdAt || 0);
    return dateA - dateB;
  });

  const getStatusText = (dotType) => {
    switch (dotType) {
      case 'published': return translations.published;
      case 'scheduled': return translations.scheduled;
      case 'processing': return tp.processing || 'Processing';
      case 'readyToPublish': return tp.readyToPublish || 'Ready';
      case 'failed': return tp.failed || 'Failed';
      default: return translations.draft;
    }
  };

  const getBadgeStatus = (dotType) => {
    switch (dotType) {
      case 'published': return 'complete';
      case 'scheduled': return 'pending';
      case 'processing': return 'pending';
      case 'readyToPublish': return 'pending';
      case 'failed': return 'error';
      default: return 'paused';
    }
  };

  const handleCampaignCreated = (campaign) => {
    setCampaigns(prev => [campaign, ...prev]);
  };

  const handleCampaignUpdated = (updated) => {
    setCampaigns(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
  };

  const handleCampaignDeleted = (id, deletedContentIds = []) => {
    const deletedCampaign = campaigns.find(c => c.id === id);
    setCampaigns(prev => prev.filter(c => c.id !== id));
    if (selectedCampaignId === id) setSelectedCampaignId(null);

    // Remove deleted (ungenerated) contents from pipeline state
    // and mark kept contents with the deleted campaign name
    setPipelineContents(prev => {
      const deletedSet = new Set(deletedContentIds);
      return prev
        .filter(c => !deletedSet.has(c.id))
        .map(c =>
          c.campaignId === id
            ? { ...c, campaignId: null, campaign: null, campaignDeletedName: deletedCampaign?.name || null }
            : c
        );
    });
  };

  const openCreateModal = () => setShowCreateModal(true);

  // ── Post editing handlers (for popover) ────────────────────────
  const handleTitleChange = async (post, newTitle) => {
    if (post.source === 'plan') {
      const campaign = campaigns.find(c => c.id === post.campaignId);
      if (!campaign) return;
      const plan = [...(campaign.generatedPlan || [])];
      if (plan[post.planIndex]) {
        plan[post.planIndex] = { ...plan[post.planIndex], title: newTitle };
        setCampaigns(prev => prev.map(c =>
          c.id === post.campaignId ? { ...c, generatedPlan: plan } : c
        ));
        setPopover(prev => prev ? { ...prev, post: { ...prev.post, title: newTitle } } : null);
        fetch(`/api/campaigns/${post.campaignId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generatedPlan: plan }),
        }).catch(() => {});
      }
    } else if (post.source === 'pipeline') {
      // Published posts: update WordPress first, then refetch to get synced data
      if (post.status === 'PUBLISHED' || post.dotStatus === 'published') {
        const res = await fetch(`/api/contents/${post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || tp.wpTitleUpdateFailed || 'Failed to update title on WordPress');
        }
        // WP updated — title will arrive via webhook. Refresh pipeline to pick it up.
        fetchPipeline();
        return;
      }
      // Non-published: optimistic update
      setPipelineContents(prev => prev.map(c =>
        c.id === post.id ? { ...c, title: newTitle } : c
      ));
      setPopover(prev => prev ? { ...prev, post: { ...prev.post, title: newTitle } } : null);
      fetch(`/api/contents/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      }).catch(() => {});
    } else if (post.source === 'entity') {
      // Entity posts (synced from WP): update via entity API, optimistic UI
      setPosts(prev => prev.map(p =>
        p.id === post.id ? { ...p, title: newTitle } : p
      ));
      setPopover(prev => prev ? { ...prev, post: { ...prev.post, title: newTitle } } : null);
      const res = await fetch(`/api/entities/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) {
        // Revert optimistic update
        setPosts(prev => prev.map(p =>
          p.id === post.id ? { ...p, title: post.title } : p
        ));
        setPopover(prev => prev ? { ...prev, post: { ...prev.post, title: post.title } } : null);
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || tp.wpTitleUpdateFailed || 'Failed to update title on WordPress');
      }
    }
  };

  const handleStatusChange = async (post, targetStatus) => {
    if (post.source !== 'pipeline') return;

    // Optimistic UI update for simple transitions
    const statusToDotMap = {
      DRAFT: 'draft',
      SCHEDULED: 'scheduled',
      PROCESSING: 'processing',
      READY_TO_PUBLISH: 'readyToPublish',
      PUBLISHED: 'published',
      FAILED: 'failed',
    };

    // Call the transition API which handles side effects
    const res = await fetch(`/api/contents/${post.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus }),
    });

    if (res.ok) {
      const data = await res.json();
      const finalStatus = data.content?.status || targetStatus;
      const dotStatus = statusToDotMap[finalStatus] || 'draft';

      // Update pipeline contents with the real final status
      setPipelineContents(prev => prev.map(c =>
        c.id === post.id ? { ...c, status: finalStatus, errorMessage: data.content?.errorMessage || null } : c
      ));
      setPopover(prev => prev ? {
        ...prev,
        post: { ...prev.post, dotStatus, statusKey: finalStatus, status: finalStatus },
      } : null);

      // Refresh pipeline to get latest state
      fetchPipeline();
    }
  };

  const handleGenerate = async (post) => {
    if (post.source !== 'pipeline') return;

    // Dispatch generation via transition API (target: PROCESSING triggers generate)
    const res = await fetch(`/api/contents/${post.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus: 'PROCESSING' }),
    });

    if (res.ok) {
      const data = await res.json();
      const finalStatus = data.content?.status || 'PROCESSING';
      const statusToDotMap = {
        DRAFT: 'draft', SCHEDULED: 'scheduled', PROCESSING: 'processing',
        READY_TO_PUBLISH: 'readyToPublish', PUBLISHED: 'published', FAILED: 'failed',
      };
      const dotStatus = statusToDotMap[finalStatus] || 'processing';

      setPipelineContents(prev => prev.map(c =>
        c.id === post.id ? { ...c, status: finalStatus } : c
      ));
      setPopover(prev => prev ? {
        ...prev,
        post: { ...prev.post, dotStatus, statusKey: finalStatus, status: finalStatus, aiResult: data.content?.aiResult || post.aiResult },
      } : null);

      fetchPipeline();
    }
  };

  const handleDelete = async (post) => {
    if (post.source === 'pipeline') {
      const res = await fetch(`/api/contents/${post.id}`, { method: 'DELETE' });
      if (res.ok) {
        setPipelineContents(prev => prev.filter(c => c.id !== post.id));
        setPopover(null);
      }
    } else if (post.source === 'plan') {
      const campaign = campaigns.find(c => c.id === post.campaignId);
      if (!campaign) return;
      const plan = [...(campaign.generatedPlan || [])];
      plan.splice(post.planIndex, 1);
      setCampaigns(prev => prev.map(c =>
        c.id === post.campaignId ? { ...c, generatedPlan: plan } : c
      ));
      setPopover(null);
      fetch(`/api/campaigns/${post.campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatedPlan: plan }),
      }).catch(() => {});
    }
  };

  return (
    <div className={styles.plannerLayout}>
      {/* Campaigns Sidebar */}
      <aside className={styles.campaignsSidebar}>
        <div className={styles.sidebarHeader}>
          <FolderOpen size={16} />
          <h3 className={styles.sidebarTitle}>{tc.title || 'Campaigns'}</h3>
          {canCreateCampaign && (
            <button className={styles.sidebarAddBtn} onClick={openCreateModal} title={tc.createNew || 'Create campaign'}>
              <Plus size={14} />
            </button>
          )}
        </div>

        {loadingCampaigns ? (
          <div className={styles.sidebarLoading}>
            <Loader2 size={18} className={styles.spinner} />
          </div>
        ) : campaigns.length === 0 ? (
          <div className={styles.sidebarEmpty}>
            <p>{tc.noCampaigns || 'No campaigns yet'}</p>
            <p className={styles.sidebarEmptyHint}>{tc.createFirst || 'Create your first campaign'}</p>
            {canCreateCampaign && (
              <button className={styles.sidebarWizardLink} onClick={openCreateModal}>
                <Sparkles size={14} />
                {tc.createNew || 'Create Campaign'}
              </button>
            )}
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
                {campaigns.reduce((sum, c) => {
                  const pipelineCount = pipelineContents.filter(p => p.campaignId === c.id).length;
                  return sum + (pipelineCount || (Array.isArray(c.generatedPlan) ? c.generatedPlan.length : 0));
                }, 0)}
              </span>
            </button>

            {campaigns.map(campaign => {
              // Calculate real counts from pipeline or generatedPlan
              const campaignContents = pipelineContents.filter(c => c.campaignId === campaign.id);
              const publishedCount = campaignContents.filter(c => c.status === 'PUBLISHED').length;
              const pipelineTotal = campaignContents.length;
              const planTotal = Array.isArray(campaign.generatedPlan) ? campaign.generatedPlan.length : 0;
              // Use pipeline count if campaign has been activated, otherwise use plan count
              const totalCount = pipelineTotal > 0 ? pipelineTotal : planTotal;
              const hasProgress = pipelineTotal > 0;

              return (
              <div key={campaign.id} className={styles.sidebarCampaignRow}>
                <button
                  className={`${styles.sidebarCampaignItem} ${selectedCampaignId === campaign.id ? styles.active : ''}`}
                  onClick={() => setSelectedCampaignId(campaign.id)}
                >
                  <span className={styles.sidebarCampaignDot} style={{ background: campaign.color }} />
                  <div className={styles.sidebarCampaignInfo}>
                    <span className={styles.sidebarCampaignName}>{campaign.name}</span>
                    <span className={styles.sidebarCampaignMeta}>
                      {hasProgress
                        ? `${publishedCount}/${totalCount} ${tc.postsPublished || 'published'}`
                        : `${totalCount} ${tc.posts || 'posts'}`
                      }
                      {' · '}
                      {tc[STATUS_MAP[campaign.status]] || campaign.status}
                    </span>
                    {hasProgress && campaign.status === 'ACTIVE' && (
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${totalCount > 0 ? (publishedCount / totalCount) * 100 : 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                </button>
                <div className={styles.campaignActions}>
                  {/* Lifecycle buttons */}
                  {campaign.status === 'DRAFT' && campaign.generatedPlan && (
                    <button
                      className={`${styles.campaignActionBtn} ${styles.activateBtn}`}
                      onClick={(e) => { e.stopPropagation(); handleActivate(campaign); }}
                      disabled={activatingId === campaign.id}
                      title={tc.activate || 'Activate'}
                    >
                      {activatingId === campaign.id ? <Loader2 size={13} className={styles.spinner} /> : <Play size={13} />}
                    </button>
                  )}
                  {campaign.status === 'ACTIVE' && (
                    <button
                      className={`${styles.campaignActionBtn} ${styles.pauseBtn}`}
                      onClick={(e) => { e.stopPropagation(); handlePause(campaign); }}
                      disabled={pausingId === campaign.id}
                      title={tc.pause || 'Pause'}
                    >
                      {pausingId === campaign.id ? <Loader2 size={13} className={styles.spinner} /> : <Pause size={13} />}
                    </button>
                  )}
                  {campaign.status === 'PAUSED' && (
                    <button
                      className={`${styles.campaignActionBtn} ${styles.activateBtn}`}
                      onClick={(e) => { e.stopPropagation(); handleResume(campaign); }}
                      disabled={activatingId === campaign.id}
                      title={tc.resume || 'Resume'}
                    >
                      {activatingId === campaign.id ? <Loader2 size={13} className={styles.spinner} /> : <Play size={13} />}
                    </button>
                  )}
                  {canEditCampaign && (
                    <button
                      className={`${styles.campaignActionBtn} ${styles.campaignActionSecondary}`}
                      onClick={(e) => { e.stopPropagation(); setEditingCampaign(campaign); }}
                      title={tc.editCampaign || 'Edit campaign'}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <Link
                    href={`/dashboard/strategy/ai-content-wizard?campaignId=${campaign.id}`}
                    className={`${styles.campaignActionBtn} ${styles.campaignActionSecondary}`}
                    title={(campaign._count?.contents || 0) > 0 ? (tc.editPosts || 'Edit posts') : (tc.createPosts || 'Create posts')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FileText size={13} />
                  </Link>
                </div>
              </div>
              );
            })}
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
        <CalendarGrid
          monthLabel={`${getMonthName(currentDate)} ${currentDate.getFullYear()}`}
          dayNames={translations.dayNames}
          calendarDays={calendarDays}
          onPrevMonth={goToPrevMonth}
          onNextMonth={goToNextMonth}
          onPostClick={(post, e) => openPopover(post, e)}
          onDrop={handleCalendarDrop}
          statusLabels={{
            published: ts.published || translations.published || 'Published',
            scheduled: ts.scheduled || translations.scheduled || 'Scheduled',
            processing: tp.processing || 'Processing',
            readyToPublish: tp.readyToPublish || 'Ready',
            failed: tp.failed || 'Failed',
            draft: ts.draft || translations.draft || 'Draft',
          }}
          legendItems={[
            { icon: '/icons/letter-p.svg', alt: 'P', label: ts.published || translations.published || 'Published' },
            { icon: '/icons/letter-s.svg', alt: 'S', label: ts.scheduled || translations.scheduled || 'Scheduled' },
            { icon: '/icons/letter-l.svg', alt: 'L', label: tp.processing || 'Processing' },
            { icon: '/icons/letter-r.svg', alt: 'R', label: tp.readyToPublish || 'Ready' },
            { icon: '/icons/letter-f.svg', alt: 'F', label: tp.failed || 'Failed' },
            { icon: '/icons/letter-d.svg', alt: 'D', label: ts.draft || translations.draft || 'Draft' },
          ]}
        />
      ) : (
        <div className={styles.calendarCard}>
          <div className={styles.calendarHeader}>
            <h3 className={styles.calendarTitle}>{translations.allContent}</h3>
            {pipelineStats && (
              <div className={styles.pipelineStatsBar}>
                {pipelineStats.scheduled > 0 && (
                  <span className={`${styles.statBadge} ${styles.scheduledBadge}`}>
                    <Clock size={12} /> {pipelineStats.scheduled}
                  </span>
                )}
                {pipelineStats.processing > 0 && (
                  <span className={`${styles.statBadge} ${styles.processingBadge}`}>
                    <Zap size={12} /> {pipelineStats.processing}
                  </span>
                )}
                {pipelineStats.readyToPublish > 0 && (
                  <span className={`${styles.statBadge} ${styles.readyBadge}`}>
                    <CheckCircle2 size={12} /> {pipelineStats.readyToPublish}
                  </span>
                )}
                {pipelineStats.published > 0 && (
                  <span className={`${styles.statBadge} ${styles.publishedBadge}`}>
                    <CheckCircle2 size={12} /> {pipelineStats.published}
                  </span>
                )}
                {pipelineStats.failed > 0 && (
                  <span className={`${styles.statBadge} ${styles.failedBadge}`}>
                    <AlertCircle size={12} /> {pipelineStats.failed}
                  </span>
                )}
              </div>
            )}
          </div>
          {(loadingPosts && loadingPipeline) ? (
            <div className={styles.sidebarLoading}>
              <Loader2 size={18} className={styles.spinner} />
            </div>
          ) : (allListItems.length === 0) ? (
            <div className={styles.sidebarEmpty}>
              <p>{translations.noPosts || 'No posts found'}</p>
            </div>
          ) : (
            <div className={styles.contentList}>
              {allListItems.map((item) => {
                const dotType = statusToDot(item.status);
                const statusText = getStatusText(dotType);
                const badgeStatus = getBadgeStatus(dotType);
                const dateStr = item.publishedAt || item.scheduledAt || item.createdAt;
                const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString() : '-';

                return (
                  <div key={`${item.source}-${item.id}`} className={styles.contentItem}>
                    {item.campaignColor && (
                      <span className={styles.contentCampaignDot} style={{ background: item.campaignColor }} />
                    )}
                    <div className={styles.contentInfo}>
                      <span className={styles.contentTitle}>{item.title}</span>
                      <span className={styles.contentMeta}>
                        {item.source === 'pipeline' ? (item.type || tp.defaultType || 'Post') : (item.entityType?.name || tp.defaultType || 'Post')}
                        {item.campaignName && ` · ${item.campaignName}`}
                      </span>
                    </div>
                    <StatusBadge status={badgeStatus}>
                      {statusText}
                    </StatusBadge>
                    <span className={styles.contentDate}>{formattedDate}</span>
                    {item.errorMessage && (
                      <span className={styles.contentError} title={item.errorMessage}>
                        <AlertCircle size={14} />
                      </span>
                    )}
                    {item.url && (
                      <div className={styles.contentActions}>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.actionButton}>
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
          onDeleted={canDeleteCampaign ? handleCampaignDeleted : undefined}
          canDelete={canDeleteCampaign}
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

      <ConfirmDialog
        isOpen={!!pendingReschedule}
        onClose={() => setPendingReschedule(null)}
        onConfirm={executeReschedule}
        title={translations.pipeline?.rescheduleTitle || 'Reschedule Post'}
        message={translations.pipeline?.rescheduleMessage || 'This post is currently published. Moving it to a new date will unpublish it and schedule it for the selected date. Continue?'}
        confirmText={translations.pipeline?.rescheduleConfirm || 'Yes, Reschedule'}
        cancelText={translations.pipeline?.rescheduleCancel || 'Cancel'}
        variant="warning"
        isLoading={rescheduling}
      />

      <PostPopover
        post={popover?.post}
        rect={popover?.rect}
        onClose={closePopover}
        translations={{
          ...translations.preview,
          published: translations.published,
          scheduled: translations.scheduled,
          draft: translations.draft,
          processing: translations.pipeline?.processing || 'Processing',
          readyToPublish: translations.pipeline?.readyToPublish || 'Ready to Publish',
          failed: translations.pipeline?.failed || 'Failed',
          retryPublish: translations.pipeline?.retryPublish || 'Retry',
          generate: translations.pipeline?.generate || 'Generate',
          generating: translations.pipeline?.generating || 'Generating...',
          previewContent: translations.pipeline?.viewContent || 'Preview',
          titleSaveError: translations.pipeline?.titleSaveError || 'Failed to save title',
          save: translations.pipeline?.save || 'Save',
          cancel: translations.pipeline?.cancel || 'Cancel',
          deletePost: translations.pipeline?.deletePost || 'Delete',
          deletePostTitle: translations.pipeline?.deletePostTitle || 'Delete Post',
          deletePostMessage: translations.pipeline?.deletePostMessage || 'Are you sure you want to remove this post from the campaign and from the calendar?',
          deletePostConfirm: translations.pipeline?.deletePostConfirm || 'Yes, Delete',
          deletePostCancel: translations.pipeline?.deletePostCancel || 'No, Keep',
          deleted: translations.pipeline?.campaignDeleted || 'deleted',
        }}
        onDateChange={
          popover?.post && 
          (popover.post.source === 'plan' || popover.post.source === 'pipeline') &&
          popover.post.dotStatus !== 'published'
            ? (date) => updatePostDate(popover.post, date)
            : undefined
        }
        onTimeChange={
          popover?.post && 
          (popover.post.source === 'plan' || popover.post.source === 'pipeline') &&
          popover.post.dotStatus !== 'published'
            ? (time) => updatePostTime(popover.post, time)
            : undefined
        }
        onRetrySuccess={fetchPipeline}
        onTitleChange={
          popover?.post && (popover.post.source === 'plan' || popover.post.source === 'pipeline' || popover.post.source === 'entity')
            ? (title) => handleTitleChange(popover.post, title)
            : undefined
        }
        onStatusChange={
          popover?.post && popover.post.source === 'pipeline'
            ? (status) => handleStatusChange(popover.post, status)
            : undefined
        }
        onGenerate={
          popover?.post && popover.post.source === 'pipeline' && !popover.post.aiResult
            ? () => handleGenerate(popover.post)
            : undefined
        }
        onDelete={
          popover?.post && (popover.post.source === 'pipeline' || popover.post.source === 'plan') && popover.post.dotStatus !== 'published'
            ? () => handleDelete(popover.post)
            : undefined
        }
      />
    </div>
  );
}

ContentPlannerView.OpenCreateModal = null; // placeholder for ref
