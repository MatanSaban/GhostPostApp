'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSite } from '@/app/context/site-context';
import { useAICredits } from '@/app/hooks/useAICredits';

export function useCompetitors() {
  const { selectedSite, isLoading: isSiteLoading } = useSite();
  const { fetchWithCredits } = useAICredits();

  // Core state
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(3);
  const [error, setError] = useState('');
  const [scanningIds, setScanningIds] = useState(new Set());
  const [selectedCompetitor, setSelectedCompetitor] = useState(null);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);

  // Comparison state
  const [comparisonData, setComparisonData] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [userPageUrl, setUserPageUrl] = useState('');

  // AI Discovery state
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [showDiscoveryConfirm, setShowDiscoveryConfirm] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredCompetitors, setDiscoveredCompetitors] = useState([]);
  const [selectedDiscovered, setSelectedDiscovered] = useState(new Set());
  const [addingDiscovered, setAddingDiscovered] = useState(false);
  const [discoveryInfo, setDiscoveryInfo] = useState(null);

  // View mode
  const [viewMode, setViewMode] = useState('list');
  const [loadingPreferences, setLoadingPreferences] = useState(true);

  // Fetch UI preferences
  const fetchPreferences = useCallback(async () => {
    if (!selectedSite) return;
    try {
      const response = await fetch(`/api/user/preferences?siteId=${selectedSite.id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.uiPreferences?.competitorsView) {
          setViewMode(data.uiPreferences.competitorsView);
        }
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
    } finally {
      setLoadingPreferences(false);
    }
  }, [selectedSite]);

  // Save view mode
  const handleViewModeChange = async (mode) => {
    setViewMode(mode);
    if (!selectedSite) return;
    try {
      await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite.id,
          key: 'competitorsView',
          value: mode,
        }),
      });
    } catch (err) {
      console.error('Failed to save preference:', err);
    }
  };

  // Fetch competitors
  const fetchCompetitors = useCallback(async () => {
    if (!selectedSite) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/competitors?siteId=${selectedSite.id}`);
      if (response.ok) {
        const data = await response.json();
        setCompetitors(data.competitors || []);
        setLimit(data.limit || 3);
      }
    } catch (err) {
      console.error('Failed to fetch competitors:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    fetchCompetitors();
    fetchPreferences();
  }, [fetchCompetitors, fetchPreferences]);

  // Add competitor
  const handleAddCompetitor = async (e) => {
    e.preventDefault();
    if (!newUrl.trim() || !selectedSite) return;

    setAddingUrl(true);
    setError('');

    try {
      const response = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id, url: newUrl.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to add competitor');
        return;
      }

      setCompetitors(prev => [data.competitor, ...prev]);
      setNewUrl('');
      setShowAddForm(false);
      handleScanCompetitor(data.competitor.id);
    } catch (err) {
      setError('Failed to add competitor');
    } finally {
      setAddingUrl(false);
    }
  };

  // Remove competitor
  const handleRemoveCompetitor = async (competitorId) => {
    if (!selectedSite) return;
    try {
      const response = await fetch(
        `/api/competitors?id=${competitorId}&siteId=${selectedSite.id}`,
        { method: 'DELETE' }
      );
      if (response.ok) {
        setCompetitors(prev => prev.filter(c => c.id !== competitorId));
        if (selectedCompetitor?.id === competitorId) {
          setSelectedCompetitor(null);
          setComparisonData(null);
        }
      }
    } catch (err) {
      console.error('Failed to remove competitor:', err);
    }
  };

  // Scan competitor
  const handleScanCompetitor = async (competitorId) => {
    if (!selectedSite) return;
    setScanningIds(prev => new Set([...prev, competitorId]));

    try {
      const result = await fetchWithCredits('/api/competitors/scan', {
        method: 'POST',
        body: JSON.stringify({
          competitorId,
          siteId: selectedSite.id,
          includeAI: true,
        }),
      });

      if (result.ok) {
        setCompetitors(prev =>
          prev.map(c => c.id === competitorId ? result.data.competitor : c)
        );
      }
    } catch (err) {
      console.error('Failed to scan competitor:', err);
    } finally {
      setScanningIds(prev => {
        const next = new Set(prev);
        next.delete(competitorId);
        return next;
      });
    }
  };

  // Compare with competitor
  const handleCompare = async () => {
    if (!selectedCompetitor || !userPageUrl || !selectedSite) return;
    setComparing(true);
    setComparisonData(null);

    try {
      const result = await fetchWithCredits('/api/competitors/compare', {
        method: 'POST',
        body: JSON.stringify({
          competitorId: selectedCompetitor.id,
          siteId: selectedSite.id,
          userPageUrl,
        }),
      });
      if (result.ok) {
        setComparisonData(result.data);
      }
    } catch (err) {
      console.error('Failed to compare:', err);
    } finally {
      setComparing(false);
    }
  };

  // Discover competitors with AI
  const handleDiscoverCompetitors = async () => {
    if (!selectedSite) return;
    setDiscovering(true);
    setDiscoveredCompetitors([]);
    setSelectedDiscovered(new Set());
    setDiscoveryInfo(null);

    try {
      const result = await fetchWithCredits('/api/competitors/discover', {
        method: 'POST',
        body: JSON.stringify({ siteId: selectedSite.id }),
      });

      if (result.ok && result.data.competitors?.length > 0) {
        setDiscoveredCompetitors(result.data.competitors);
        setDiscoveryInfo({
          mainTopic: result.data.mainTopic,
          keywordsSearched: result.data.keywordsSearched,
          keywordSources: result.data.keywordSources,
        });
        const autoSelected = new Set(
          result.data.competitors.filter(c => c.autoSelected).map(c => c.domain)
        );
        setSelectedDiscovered(autoSelected);
      } else if (!result.ok) {
        setError(result.data.error || 'Failed to discover competitors');
      }
    } catch (err) {
      console.error('Failed to discover competitors:', err);
      setError('Failed to discover competitors');
    } finally {
      setDiscovering(false);
    }
  };

  // Toggle discovered competitor selection
  const toggleDiscoveredSelection = (domain) => {
    setSelectedDiscovered(prev => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  };

  // Add selected discovered competitors
  const handleAddDiscovered = async () => {
    if (selectedDiscovered.size === 0 || !selectedSite) return;
    setAddingDiscovered(true);

    try {
      const toAdd = discoveredCompetitors.filter(c => selectedDiscovered.has(c.domain));
      const addedCompetitors = [];

      for (const comp of toAdd) {
        const urlToAdd = comp.url || `https://${comp.domain}`;
        try {
          const response = await fetch('/api/competitors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              siteId: selectedSite.id,
              url: urlToAdd,
              name: comp.name || null,
              source: 'AI',
            }),
          });
          if (response.ok) {
            const data = await response.json();
            addedCompetitors.push(data.competitor);
            handleScanCompetitor(data.competitor.id);
          }
        } catch (err) {
          console.error(`Error adding ${comp.domain}:`, err);
        }
      }

      if (addedCompetitors.length > 0) {
        setCompetitors(prev => [...addedCompetitors, ...prev]);
      }

      setShowDiscoveryModal(false);
      setDiscoveredCompetitors([]);
      setSelectedDiscovered(new Set());
      await fetchCompetitors();
    } catch (err) {
      console.error('Failed to add discovered competitors:', err);
    } finally {
      setAddingDiscovered(false);
    }
  };

  // Stats data
  const statsData = [
    { iconName: 'Users', value: String(competitors.length), label: 'competitorAnalysis.trackedCompetitors', color: 'purple' },
    { iconName: 'Target', value: '0', label: 'competitorAnalysis.sharedKeywords', color: 'blue' },
    { iconName: 'BarChart2', value: String(competitors.reduce((sum, c) => sum + (c.contentGaps?.length || 0), 0)), label: 'competitorAnalysis.contentGaps', color: 'orange' },
  ];

  return {
    // Site
    selectedSite,
    isSiteLoading,
    // Competitors
    competitors,
    loading,
    limit,
    error,
    setError,
    scanningIds,
    selectedCompetitor,
    setSelectedCompetitor,
    statsData,
    // Add form
    showAddForm,
    setShowAddForm,
    newUrl,
    setNewUrl,
    addingUrl,
    handleAddCompetitor,
    // Actions
    handleRemoveCompetitor,
    handleScanCompetitor,
    fetchCompetitors,
    // Comparison
    comparisonData,
    comparing,
    userPageUrl,
    setUserPageUrl,
    handleCompare,
    setComparisonData,
    // Discovery
    showDiscoveryModal,
    setShowDiscoveryModal,
    showDiscoveryConfirm,
    setShowDiscoveryConfirm,
    discovering,
    discoveredCompetitors,
    selectedDiscovered,
    addingDiscovered,
    discoveryInfo,
    handleDiscoverCompetitors,
    toggleDiscoveredSelection,
    handleAddDiscovered,
    // View
    viewMode,
    handleViewModeChange,
  };
}
