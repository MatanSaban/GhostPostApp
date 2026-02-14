'use client';

import { useState, useEffect, useCallback } from 'react';

const initialFormData = {
  name: '',
  slug: '',
  description: '',
  price: '',
  yearlyPrice: '',
  isActive: true,
};

export function usePlans(isSuperAdmin, t) {
  const [plans, setPlans] = useState([]);
  const [stats, setStats] = useState({ totalPlans: 0, totalSubscribers: 0, avgPrice: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState(null);

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  
  // Features and limitations states
  const [features, setFeatures] = useState([]);
  const [limitations, setLimitations] = useState([]);

  // Translation states
  const [selectedLanguage, setSelectedLanguage] = useState('HE');
  const [translationData, setTranslationData] = useState({
    name: '',
    description: '',
    features: [],
    limitations: [],
  });
  const [existingTranslations, setExistingTranslations] = useState({});

  // Predefined limitation types for quick add
  const predefinedLimitations = [
    { key: 'maxMembers', label: t('admin.plans.form.maxMembers'), defaultValue: '1', type: 'number' },
    { key: 'maxSites', label: t('admin.plans.form.maxSites'), defaultValue: '1', type: 'number' },
    { key: 'aiCredits', label: t('admin.plans.form.aiCredits'), defaultValue: '0', type: 'number' },
    { key: 'maxKeywords', label: t('admin.plans.form.maxKeywords'), defaultValue: '100', type: 'number' },
    { key: 'maxContent', label: t('admin.plans.form.maxContent'), defaultValue: '50', type: 'number' },
    { key: 'siteAudits', label: t('admin.plans.form.siteAudits'), defaultValue: '5', type: 'number' },
    { key: 'maxAddOnSeats', label: t('admin.plans.form.maxAddOnSeats'), defaultValue: '', type: 'number' },
    { key: 'maxAddOnSites', label: t('admin.plans.form.maxAddOnSites'), defaultValue: '', type: 'number' },
  ];

  // Load plans from API
  const loadPlans = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/plans');
      if (!response.ok) throw new Error('Failed to fetch plans');
      const data = await response.json();
      setPlans(data.plans || []);
      setStats(data.stats || { totalPlans: 0, totalSubscribers: 0, avgPrice: 0 });
    } catch (error) {
      console.error('Failed to load plans:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadPlans();
    }
  }, [isSuperAdmin, loadPlans]);

  // Filter plans by search query
  const filteredPlans = plans.filter(plan =>
    plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plan.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Feature management
  const addFeature = () => {
    setFeatures([...features, { 
      id: `feature_${Date.now()}`,
      key: '', 
      label: '', 
    }]);
  };

  const removeFeature = (index) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const updateFeature = (index, field, value) => {
    setFeatures(features.map((f, i) => 
      i === index ? { ...f, [field]: value } : f
    ));
  };

  // Limitation management
  const addLimitation = (limitationType = null) => {
    if (limitationType) {
      if (limitations.some(l => l.key === limitationType.key)) return;
      setLimitations([...limitations, { 
        id: `predefined_${limitationType.key}`,
        key: limitationType.key, 
        label: limitationType.label, 
        value: limitationType.defaultValue,
        type: limitationType.type 
      }]);
    } else {
      setLimitations([...limitations, { 
        id: `custom_${Date.now()}`,
        key: '', 
        label: '', 
        value: '',
        type: 'number',
        isCustom: true 
      }]);
    }
  };

  const removeLimitation = (index) => {
    setLimitations(limitations.filter((_, i) => i !== index));
  };

  const updateLimitation = (index, field, value) => {
    setLimitations(limitations.map((l, i) => 
      i === index ? { ...l, [field]: value } : l
    ));
  };

  // Open edit modal
  const handleEdit = (plan) => {
    setSelectedPlan(plan);
    setFormData({
      name: plan.name,
      slug: plan.slug,
      description: plan.description || '',
      price: plan.monthlyPrice?.toString() || '',
      yearlyPrice: plan.yearlyPrice?.toString() || '',
      isActive: plan.status === 'active',
    });
    
    const planFeatures = Array.isArray(plan.features) 
      ? plan.features.map((f, idx) => ({
          id: f.id || `feature_${idx}_${Date.now()}`,
          key: f.key || '',
          label: f.label || '',
        }))
      : [];
    setFeatures(planFeatures);
    
    const planLimitations = [];
    if (plan.limitations && Array.isArray(plan.limitations)) {
      plan.limitations.forEach((l, idx) => {
        planLimitations.push({ 
          id: l.id || `limitation_${idx}`, 
          key: l.key,
          label: l.label,
          value: l.value?.toString() || '',
          type: l.type || 'number',
        });
      });
    }
    setLimitations(planLimitations);
    setEditModalOpen(true);
  };

  // Open add modal
  const handleAdd = () => {
    setSelectedPlan(null);
    setFormData(initialFormData);
    setFeatures([]);
    setLimitations([
      { id: 'new_maxMembers', key: 'maxMembers', label: t('admin.plans.form.maxMembers'), value: '1', type: 'number' },
      { id: 'new_maxSites', key: 'maxSites', label: t('admin.plans.form.maxSites'), value: '1', type: 'number' },
      { id: 'new_aiCredits', key: 'aiCredits', label: t('admin.plans.form.aiCredits'), value: '0', type: 'number' },
    ]);
    setEditModalOpen(true);
  };

  // Close edit modal
  const closeEditModal = () => {
    setEditModalOpen(false);
    setSelectedPlan(null);
  };

  // Submit edit/add form
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const featuresArray = features
        .filter(f => f.key.trim() || f.label.trim())
        .map(f => ({
          key: f.key.trim(),
          label: f.label.trim(),
        }));

      const limitationsArray = limitations
        .filter(l => l.key.trim())
        .map(l => ({
          key: l.key.trim(),
          label: l.label.trim(),
          value: l.type === 'number' ? parseInt(l.value) || 0 : l.value,
          type: l.type || 'number',
        }));

      const payload = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        price: parseFloat(formData.price) || 0,
        yearlyPrice: formData.yearlyPrice ? parseFloat(formData.yearlyPrice) : null,
        features: featuresArray,
        isActive: formData.isActive,
        limitations: limitationsArray,
      };

      let response;
      if (selectedPlan) {
        response = await fetch(`/api/admin/plans/${selectedPlan.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch('/api/admin/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save plan');
      }

      closeEditModal();
      loadPlans();
    } catch (error) {
      console.error('Error saving plan:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Duplicate plan
  const handleDuplicate = async (plan) => {
    try {
      const response = await fetch(`/api/admin/plans/${plan.id}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to duplicate plan');
      }

      loadPlans();
    } catch (error) {
      console.error('Error duplicating plan:', error);
      alert(error.message);
    }
  };

  // Open delete confirmation
  const handleDeleteClick = (plan) => {
    setSelectedPlan(plan);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!selectedPlan) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/plans/${selectedPlan.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete plan');
      }

      setDeleteDialogOpen(false);
      setSelectedPlan(null);
      loadPlans();
    } catch (error) {
      console.error('Error deleting plan:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Archive/Activate plan
  const handleToggleActive = async (plan) => {
    try {
      const response = await fetch(`/api/admin/plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: plan.status !== 'active' }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update plan');
      }

      loadPlans();
    } catch (error) {
      console.error('Error updating plan:', error);
      alert(error.message);
    }
  };

  // Translation helpers
  const getAllPlanLimitations = (plan) => {
    if (!plan) return [];
    if (plan.limitations && Array.isArray(plan.limitations)) {
      return plan.limitations.map(l => ({ key: l.key, label: l.label }));
    }
    return [];
  };

  const updateLimitationTranslation = (key, translatedLabel) => {
    setTranslationData(prev => {
      const existing = prev.limitations.find(l => l.key === key);
      if (existing) {
        return {
          ...prev,
          limitations: prev.limitations.map(l => 
            l.key === key ? { ...l, label: translatedLabel } : l
          ),
        };
      } else {
        return {
          ...prev,
          limitations: [...prev.limitations, { key, label: translatedLabel }],
        };
      }
    });
  };

  const updateFeatureTranslation = (key, translatedLabel) => {
    setTranslationData(prev => {
      const existing = prev.features.find(f => f.key === key);
      if (existing) {
        return {
          ...prev,
          features: prev.features.map(f => 
            f.key === key ? { ...f, label: translatedLabel } : f
          ),
        };
      } else {
        return {
          ...prev,
          features: [...prev.features, { key, label: translatedLabel }],
        };
      }
    });
  };

  // Open translate modal
  const handleTranslate = (plan) => {
    setSelectedPlan(plan);
    setExistingTranslations(plan.translations || {});
    const firstLang = 'HE';
    setSelectedLanguage(firstLang);
    const existing = plan.translations?.[firstLang];
    setTranslationData({
      name: existing?.name || '',
      description: existing?.description || '',
      features: existing?.features || [],
      limitations: existing?.limitations || [],
    });
    setTranslateModalOpen(true);
  };

  // Handle language change in translate modal
  const handleLanguageChange = (lang) => {
    setSelectedLanguage(lang);
    const existing = existingTranslations[lang];
    setTranslationData({
      name: existing?.name || '',
      description: existing?.description || '',
      features: existing?.features || [],
      limitations: existing?.limitations || [],
    });
  };

  // Submit translation
  const handleTranslationSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setIsSubmitting(true);

    try {
      const featuresArray = translationData.features
        .filter(f => f.label && f.label.trim())
        .map(f => ({ key: f.key, label: f.label.trim() }));

      const limitationsArray = translationData.limitations
        .filter(l => l.label && l.label.trim())
        .map(l => ({ key: l.key, label: l.label.trim() }));

      const response = await fetch(`/api/admin/plans/${selectedPlan.id}/translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: selectedLanguage,
          name: translationData.name,
          description: translationData.description,
          features: featuresArray,
          limitations: limitationsArray,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save translation');
      }

      setExistingTranslations(prev => ({
        ...prev,
        [selectedLanguage]: {
          name: translationData.name,
          description: translationData.description,
          features: featuresArray,
          limitations: limitationsArray,
        },
      }));

      loadPlans();
      alert(t('admin.plans.translations.saved'));
    } catch (error) {
      console.error('Error saving translation:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete translation
  const handleDeleteTranslation = async () => {
    if (!selectedPlan || !selectedLanguage) return;
    
    if (!confirm(t('admin.plans.translations.confirmDelete'))) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/admin/plans/${selectedPlan.id}/translations?language=${selectedLanguage}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete translation');
      }

      setExistingTranslations(prev => {
        const updated = { ...prev };
        delete updated[selectedLanguage];
        return updated;
      });

      setTranslationData({ name: '', description: '', features: [], limitations: [] });
      loadPlans();
    } catch (error) {
      console.error('Error deleting translation:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    // Data
    plans,
    filteredPlans,
    stats,
    isLoading,
    expandedPlan,
    setExpandedPlan,
    // Search
    searchQuery,
    setSearchQuery,
    // Modal states
    editModalOpen,
    setEditModalOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    translateModalOpen,
    setTranslateModalOpen,
    selectedPlan,
    isSubmitting,
    // Form
    formData,
    setFormData,
    features,
    limitations,
    predefinedLimitations,
    // Feature/Limitation actions
    addFeature,
    removeFeature,
    updateFeature,
    addLimitation,
    removeLimitation,
    updateLimitation,
    // Translation
    selectedLanguage,
    translationData,
    setTranslationData,
    existingTranslations,
    getAllPlanLimitations,
    updateLimitationTranslation,
    updateFeatureTranslation,
    handleLanguageChange,
    handleTranslationSubmit,
    handleDeleteTranslation,
    // Actions
    loadPlans,
    handleEdit,
    handleAdd,
    closeEditModal,
    handleSubmit,
    handleDuplicate,
    handleDeleteClick,
    handleDeleteConfirm,
    handleToggleActive,
    handleTranslate,
  };
}
