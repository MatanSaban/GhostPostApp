'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Save, 
  ExternalLink,
  FileText,
  Settings,
  Search as SearchIcon,
  Image as ImageIcon,
  Code,
  Loader2,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import styles from './edit.module.css';

// Field components
import { BasicFields } from './components/BasicFields';
import { ContentEditor } from './components/ContentEditor';
import { SEOFields } from './components/SEOFields';
import { ACFFields } from './components/ACFFields';
import { MetadataFields } from './components/MetadataFields';

export default function EntityEditPage({ params }) {
  const { type, id } = use(params);
  const router = useRouter();
  const { t } = useLocale();
  const { selectedSite } = useSite();
  
  const [entity, setEntity] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('content');
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    status: 'DRAFT',
    featuredImage: '',
    seoData: null,
    acfData: null,
    metadata: null,
  });

  useEffect(() => {
    if (id) {
      fetchEntity();
    }
  }, [id]);

  const fetchEntity = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/entities/${id}`);
      if (!response.ok) {
        throw new Error('Entity not found');
      }
      
      const data = await response.json();
      setEntity(data.entity);
      
      // Initialize form data
      setFormData({
        title: data.entity.title || '',
        slug: data.entity.slug || '',
        excerpt: data.entity.excerpt || '',
        content: data.entity.content || '',
        status: data.entity.status || 'DRAFT',
        featuredImage: data.entity.featuredImage || '',
        seoData: data.entity.seoData || null,
        acfData: data.entity.acfData || null,
        metadata: data.entity.metadata || null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      const response = await fetch(`/api/entities/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      const data = await response.json();
      setEntity(data.entity);
      setHasChanges(false);
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'content', label: t('entities.edit.tabs.content'), icon: FileText },
    { id: 'seo', label: t('entities.edit.tabs.seo'), icon: SearchIcon },
    { id: 'acf', label: t('entities.edit.tabs.customFields'), icon: Code },
    { id: 'media', label: t('entities.edit.tabs.media'), icon: ImageIcon },
    { id: 'settings', label: t('entities.edit.tabs.settings'), icon: Settings },
  ];

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <Loader2 className={styles.loadingSpinner} />
          <span className={styles.loadingText}>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (error || !entity) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <h2>{t('common.error')}</h2>
          <p>{error || t('entities.notFound')}</p>
          <button onClick={() => router.back()} className={styles.backButton}>
            <ArrowLeft />
            {t('common.goBack')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button 
            onClick={() => router.back()} 
            className={styles.backButton}
          >
            <ArrowLeft />
          </button>
          <div className={styles.headerInfo}>
            <h1 className={styles.title}>{formData.title || t('entities.untitled')}</h1>
            <div className={styles.meta}>
              <span className={styles.entityType}>{entity.entityType?.name}</span>
              <span className={styles.separator}>•</span>
              <span className={`${styles.status} ${styles[formData.status.toLowerCase()]}`}>
                {t(`entities.${formData.status.toLowerCase()}`)}
              </span>
            </div>
          </div>
        </div>
        
        <div className={styles.headerActions}>
          {entity.url && (
            <a 
              href={entity.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className={styles.viewButton}
            >
              <ExternalLink />
              {t('entities.viewOnSite')}
            </a>
          )}
          <button 
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className={styles.saveButton}
          >
            {isSaving ? <Loader2 className={styles.spinning} /> : <Save />}
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          // Hide ACF tab if no ACF data
          if (tab.id === 'acf' && !formData.acfData?.fields) return null;
          
          return (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className={styles.content}>
        {activeTab === 'content' && (
          <div className={styles.contentTab}>
            <BasicFields 
              formData={formData}
              onChange={handleFieldChange}
            />
            <ContentEditor 
              content={formData.content}
              onChange={(value) => handleFieldChange('content', value)}
            />
          </div>
        )}

        {activeTab === 'seo' && (
          <SEOFields 
            seoData={formData.seoData}
            onChange={(value) => handleFieldChange('seoData', value)}
          />
        )}

        {activeTab === 'acf' && formData.acfData && (
          <ACFFields 
            acfData={formData.acfData}
            onChange={(value) => handleFieldChange('acfData', value)}
          />
        )}

        {activeTab === 'media' && (
          <div className={styles.mediaTab}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                {t('entities.edit.featuredImage')}
              </label>
              <div className={styles.featuredImagePreview}>
                {formData.featuredImage ? (
                  <img src={formData.featuredImage} alt={formData.title} />
                ) : (
                  <div className={styles.noImage}>
                    <ImageIcon />
                    <span>{t('entities.edit.noFeaturedImage')}</span>
                  </div>
                )}
              </div>
              <input
                type="url"
                value={formData.featuredImage || ''}
                onChange={(e) => handleFieldChange('featuredImage', e.target.value)}
                placeholder={t('entities.edit.featuredImageUrl')}
                className={styles.textInput}
              />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <MetadataFields 
            metadata={formData.metadata}
            entity={entity}
          />
        )}
      </div>
    </div>
  );
}
