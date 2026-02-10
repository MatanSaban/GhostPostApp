'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Bot,
  Play,
  Pause,
  Code,
  FileJson,
  Eye,
  EyeOff,
  Save,
  X,
  Zap,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { AdminModal, ConfirmDialog, FormInput, FormTextarea, FormSelect, FormCheckbox, FormActions, PrimaryButton, SecondaryButton } from '../components/AdminModal';
import { AdminPageSkeleton, TableSkeleton } from '@/app/dashboard/components';
import styles from '../admin.module.css';

export default function BotActionsPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  const [actions, setActions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

  // Test state
  const [testParams, setTestParams] = useState('{}');
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    handler: '',
    parameters: '{}',
    returns: '{}',
    example: '',
    isActive: true,
  });

  // Redirect non-admin users
  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  // Load actions from API
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/bot-actions');
      if (!response.ok) throw new Error('Failed to fetch actions');
      const data = await response.json();
      setActions(data.actions || []);
    } catch (error) {
      console.error('Failed to load actions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadData();
    }
  }, [isSuperAdmin, loadData]);

  // Filter actions
  const filteredActions = actions.filter(a => {
    const matchesSearch = 
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && a.isActive) ||
      (filterStatus === 'inactive' && !a.isActive);
    return matchesSearch && matchesStatus;
  });

  // Toggle action active status
  const handleToggleActive = async (action) => {
    try {
      const response = await fetch(`/api/admin/bot-actions/${action.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !action.isActive }),
      });

      if (!response.ok) throw new Error('Failed to update action');

      setActions(prev => prev.map(a => 
        a.id === action.id ? { ...a, isActive: !a.isActive } : a
      ));
    } catch (error) {
      console.error('Error toggling active:', error);
    }
  };

  // Open edit modal
  const handleEdit = (action) => {
    setSelectedAction(action);
    setFormData({
      name: action.name,
      description: action.description || '',
      handler: action.handler,
      parameters: JSON.stringify(action.parameters || {}, null, 2),
      returns: JSON.stringify(action.returns || {}, null, 2),
      example: action.example || '',
      isActive: action.isActive,
    });
    setActiveTab('basic');
    setEditModalOpen(true);
  };

  // Open add modal
  const handleAdd = () => {
    setSelectedAction(null);
    setFormData({
      name: '',
      description: '',
      handler: '',
      parameters: JSON.stringify({
        type: 'object',
        properties: {},
        required: [],
      }, null, 2),
      returns: JSON.stringify({
        type: 'object',
        properties: {},
      }, null, 2),
      example: '',
      isActive: true,
    });
    setActiveTab('basic');
    setEditModalOpen(true);
  };

  // Open test modal
  const handleTest = (action) => {
    setSelectedAction(action);
    setTestParams(action.example || '{}');
    setTestResult(null);
    setTestModalOpen(true);
  };

  // Run test
  const handleRunTest = async () => {
    if (!selectedAction) return;
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const params = JSON.parse(testParams);
      
      // Call test endpoint (we'll create this)
      const response = await fetch('/api/admin/bot-actions/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionName: selectedAction.name,
          parameters: params,
        }),
      });

      const data = await response.json();
      
      setTestResult({
        success: response.ok,
        data: data,
      });
    } catch (error) {
      setTestResult({
        success: false,
        data: { error: error.message },
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Open delete dialog
  const handleDeleteClick = (action) => {
    setSelectedAction(action);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!selectedAction) return;

    try {
      const response = await fetch(`/api/admin/bot-actions/${selectedAction.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete action');

      setDeleteDialogOpen(false);
      setSelectedAction(null);
      await loadData();
    } catch (error) {
      console.error('Error deleting action:', error);
      alert(error.message);
    }
  };

  // Handle form submit (create or update)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate JSON fields
      let parameters, returns;
      try {
        parameters = JSON.parse(formData.parameters);
      } catch (err) {
        throw new Error('Invalid JSON in parameters schema');
      }
      try {
        returns = JSON.parse(formData.returns);
      } catch (err) {
        throw new Error('Invalid JSON in returns schema');
      }

      const payload = {
        name: formData.name,
        description: formData.description || null,
        handler: formData.handler,
        parameters,
        returns,
        example: formData.example || null,
        isActive: formData.isActive,
      };

      const url = selectedAction
        ? `/api/admin/bot-actions/${selectedAction.id}`
        : '/api/admin/bot-actions';
      
      const method = selectedAction ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save action');
      }

      setEditModalOpen(false);
      setSelectedAction(null);
      await loadData();
    } catch (error) {
      console.error('Error saving action:', error);
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format JSON for display
  const formatJSON = (json) => {
    try {
      if (typeof json === 'string') {
        return JSON.stringify(JSON.parse(json), null, 2);
      }
      return JSON.stringify(json, null, 2);
    } catch {
      return String(json);
    }
  };

  if (isUserLoading) {
    return <AdminPageSkeleton statsCount={3} columns={5} />;
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className={styles.adminPage}>
      {/* Header */}
      <div className={styles.adminHeader}>
        <h1 className={styles.adminTitle}>{t('admin.botActions.title')}</h1>
        <p className={styles.adminSubtitle}>{t('admin.botActions.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.totalActions')}</div>
          <div className={styles.statValue}>{actions.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.activeActions')}</div>
          <div className={styles.statValue}>{actions.filter(a => a.isActive).length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t('admin.stats.inactiveActions')}</div>
          <div className={styles.statValue}>{actions.filter(a => !a.isActive).length}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.adminToolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('admin.botActions.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">{t('admin.common.allStatus')}</option>
            <option value="active">{t('admin.common.active')}</option>
            <option value="inactive">{t('admin.common.inactive')}</option>
          </select>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.refreshButton} onClick={loadData}>
            <RefreshCw size={16} />
          </button>
          <button className={styles.addButton} onClick={handleAdd}>
            <Plus size={16} />
            <span>{t('admin.botActions.addAction')}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        {isLoading ? (
          <TableSkeleton rows={8} columns={5} hasActions />
        ) : filteredActions.length === 0 ? (
          <div className={styles.emptyState}>
            <Bot className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>{t('admin.botActions.noActions')}</h3>
            <p className={styles.emptyMessage}>{t('admin.common.noResults')}</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>{t('admin.botActions.columns.name')}</th>
                <th>{t('admin.botActions.columns.handler')}</th>
                <th>{t('admin.botActions.columns.description')}</th>
                <th style={{ width: '100px' }}>{t('admin.botActions.columns.status')}</th>
                <th style={{ width: '160px' }}>{t('admin.common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredActions.map((action) => (
                <tr key={action.id} className={!action.isActive ? styles.inactiveRow : ''}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Bot size={16} style={{ color: 'var(--primary)' }} />
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{action.name}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ 
                      fontFamily: 'monospace', 
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      background: 'var(--muted)',
                      borderRadius: '4px',
                    }}>
                      {action.handler}
                    </span>
                  </td>
                  <td style={{ maxWidth: '300px' }}>
                    <span style={{ 
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      fontSize: '0.875rem',
                      color: 'var(--muted-foreground)',
                    }}>
                      {action.description || '-'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleToggleActive(action)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        background: action.isActive ? 'var(--success-bg)' : 'var(--muted)',
                        color: action.isActive ? 'var(--success)' : 'var(--muted-foreground)',
                      }}
                    >
                      {action.isActive ? <Eye size={12} /> : <EyeOff size={12} />}
                      {action.isActive ? t('admin.common.active') : t('admin.common.inactive')}
                    </button>
                  </td>
                  <td>
                    <div className={styles.actionButtons}>
                      <button
                        className={styles.actionButton}
                        onClick={() => handleTest(action)}
                        title="Test"
                        style={{ color: 'var(--primary)' }}
                      >
                        <Play size={14} />
                      </button>
                      <button
                        className={styles.actionButton}
                        onClick={() => handleEdit(action)}
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className={`${styles.actionButton} ${styles.deleteButton}`}
                        onClick={() => handleDeleteClick(action)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit/Add Modal */}
      <AdminModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={selectedAction 
          ? t('admin.botActions.editAction')
          : t('admin.botActions.addAction')
        }
        size="large"
      >
        <form onSubmit={handleSubmit}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            {[
              { key: 'basic', label: t('admin.botActions.tabs.basic') },
              { key: 'schema', label: t('admin.botActions.tabs.schema') },
              { key: 'example', label: t('admin.botActions.tabs.example') },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  background: activeTab === tab.key ? 'var(--primary)' : 'transparent',
                  color: activeTab === tab.key ? 'white' : 'var(--foreground)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Basic Tab */}
          {activeTab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FormInput
                label={`${t('admin.botActions.fields.name')} *`}
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))}
                placeholder={t('admin.botActions.fields.namePlaceholder')}
                required
              />
              <FormInput
                label={`${t('admin.botActions.fields.handler')} *`}
                value={formData.handler}
                onChange={(e) => setFormData(prev => ({ ...prev, handler: e.target.value }))}
                placeholder={t('admin.botActions.fields.handlerPlaceholder')}
                required
              />
              <FormTextarea
                label={t('admin.botActions.fields.description')}
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                placeholder={t('admin.botActions.fields.descriptionPlaceholder')}
              />
              <FormCheckbox
                label={t('admin.botActions.fields.isActive')}
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              />
            </div>
          )}

          {/* Schema Tab */}
          {activeTab === 'schema' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
                  {t('admin.botActions.fields.parametersSchema')}
                </label>
                <textarea
                  value={formData.parameters}
                  onChange={(e) => setFormData(prev => ({ ...prev, parameters: e.target.value }))}
                  rows={10}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    background: 'var(--muted)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--foreground)',
                    resize: 'vertical',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
                  {t('admin.botActions.fields.returnsSchema')}
                </label>
                <textarea
                  value={formData.returns}
                  onChange={(e) => setFormData(prev => ({ ...prev, returns: e.target.value }))}
                  rows={10}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    background: 'var(--muted)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--foreground)',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>
          )}

          {/* Example Tab */}
          {activeTab === 'example' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
                  {t('admin.botActions.fields.exampleParameters')}
                </label>
                <textarea
                  value={formData.example}
                  onChange={(e) => setFormData(prev => ({ ...prev, example: e.target.value }))}
                  rows={10}
                  placeholder={t('admin.botActions.fields.examplePlaceholder')}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    background: 'var(--muted)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--foreground)',
                    resize: 'vertical',
                  }}
                />
                <p style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem', marginTop: '4px' }}>
                  {t('admin.botActions.fields.exampleHelp')}
                </p>
              </div>
            </div>
          )}

          <FormActions>
            <SecondaryButton type="button" onClick={() => setEditModalOpen(false)}>
              {t('admin.common.cancel')}
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <RefreshCw size={16} className={styles.spinning} />
              ) : (
                <Save size={16} />
              )}
              {selectedAction 
                ? t('admin.common.save')
                : t('admin.common.create')
              }
            </PrimaryButton>
          </FormActions>
        </form>
      </AdminModal>

      {/* Test Modal */}
      <AdminModal
        isOpen={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        title={`${t('admin.botActions.test.title')}: ${selectedAction?.name || ''}`}
        size="large"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
              {t('admin.botActions.test.parameters')}
            </label>
            <textarea
              value={testParams}
              onChange={(e) => setTestParams(e.target.value)}
              rows={8}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                background: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--foreground)',
                resize: 'vertical',
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleRunTest}
            disabled={isTesting}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isTesting ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
              opacity: isTesting ? 0.7 : 1,
            }}
          >
            {isTesting ? (
              <>
                <RefreshCw size={16} className={styles.spinning} />
                {t('admin.botActions.test.running')}
              </>
            ) : (
              <>
                <Play size={16} />
                {t('admin.botActions.test.run')}
              </>
            )}
          </button>

          {testResult && (
            <div style={{
              padding: '1rem',
              background: testResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                {testResult.success ? (
                  <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                ) : (
                  <AlertCircle size={16} style={{ color: '#ef4444' }} />
                )}
                <span style={{ fontWeight: 600, color: testResult.success ? 'var(--success)' : '#ef4444' }}>
                  {testResult.success ? t('admin.botActions.test.success') : t('admin.botActions.test.error')}
                </span>
              </div>
              <pre style={{
                margin: 0,
                padding: '0.75rem',
                background: 'var(--muted)',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                overflow: 'auto',
                maxHeight: '300px',
              }}>
                {formatJSON(testResult.data)}
              </pre>
            </div>
          )}
        </div>
      </AdminModal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('admin.botActions.deleteTitle')}
        message={t('admin.botActions.deleteMessage')}
        confirmText={t('admin.common.delete')}
        cancelText={t('admin.common.cancel')}
      />
    </div>
  );
}
