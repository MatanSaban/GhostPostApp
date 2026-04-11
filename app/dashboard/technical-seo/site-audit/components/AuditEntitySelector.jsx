'use client';

import { useState, useEffect, useCallback } from 'react';
import { Layers, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './AuditEntitySelector.module.css';

/**
 * AuditEntitySelector - Shows entity types with counts and allows selecting
 * which ones to include in the audit. Entities are grouped by type.
 *
 * Props:
 *  - siteId: string
 *  - maxPages: number - current page limit
 *  - maxPagesPerEntity: number|null - per-entity limit
 *  - onSelectionChange: ({ selectedUrls: string[], entityCounts: Record<string, number> }) => void
 */
export default function AuditEntitySelector({ siteId, maxPages, onSelectionChange }) {
  const { t } = useLocale();
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState(new Set()); // entity type slugs

  // Fetch entities grouped by type
  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    fetch(`/api/entities?siteId=${siteId}`)
      .then(r => r.ok ? r.json() : { entities: [] })
      .then(data => {
        const ents = (data.entities || []).filter(e => e.url && e.status === 'PUBLISHED');
        setEntities(ents);
        // Default: select all types
        const types = new Set(ents.map(e => e.entityType?.slug).filter(Boolean));
        setSelectedTypes(types);
        setLoading(false);
      })
      .catch(() => {
        setEntities([]);
        setLoading(false);
      });
  }, [siteId]);

  // Group entities by type
  const grouped = entities.reduce((acc, e) => {
    const slug = e.entityType?.slug || 'unknown';
    const name = e.entityType?.name || slug;
    if (!acc[slug]) acc[slug] = { name, slug, entities: [] };
    acc[slug].entities.push(e);
    return acc;
  }, {});

  const typeList = Object.values(grouped).sort((a, b) => b.entities.length - a.entities.length);

  // Compute selected URLs
  const getSelectedUrls = useCallback(() => {
    return entities
      .filter(e => selectedTypes.has(e.entityType?.slug))
      .map(e => e.url)
      .filter(Boolean);
  }, [entities, selectedTypes]);

  // Notify parent of selection changes
  useEffect(() => {
    if (loading) return;
    const urls = getSelectedUrls();
    const counts = {};
    for (const [slug, group] of Object.entries(grouped)) {
      if (selectedTypes.has(slug)) {
        counts[slug] = group.entities.length;
      }
    }
    onSelectionChange?.({ selectedUrls: urls, entityCounts: counts });
  }, [selectedTypes, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleType = (slug) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedTypes.size === typeList.length) {
      setSelectedTypes(new Set());
    } else {
      setSelectedTypes(new Set(typeList.map(t => t.slug)));
    }
  };

  const totalSelected = getSelectedUrls().length;
  const allSelected = selectedTypes.size === typeList.length;

  if (loading) return null;
  if (typeList.length === 0) return null;

  return (
    <div className={styles.container}>
      <button className={styles.header} onClick={() => setExpanded(!expanded)}>
        <div className={styles.headerLeft}>
          <Layers size={16} />
          <span className={styles.headerTitle}>
            {t('siteAudit.entitySelector.title')}
          </span>
          <span className={styles.headerCount}>
            {totalSelected} {t('siteAudit.entitySelector.pages')}
            {totalSelected > maxPages && (
              <span className={styles.headerCapped}>
                ({t('siteAudit.entitySelector.cappedTo')} {maxPages})
              </span>
            )}
          </span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className={styles.body}>
          <label className={styles.typeRow}>
            <span className={styles.checkbox}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
              />
              {allSelected && <Check size={12} className={styles.checkIcon} />}
            </span>
            <span className={styles.typeName}>
              {t('siteAudit.entitySelector.selectAll')}
            </span>
            <span className={styles.typeCount}>{entities.length}</span>
          </label>

          <div className={styles.divider} />

          {typeList.map(({ name, slug, entities: typeEntities }) => (
            <label key={slug} className={styles.typeRow}>
              <span className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={selectedTypes.has(slug)}
                  onChange={() => toggleType(slug)}
                />
                {selectedTypes.has(slug) && <Check size={12} className={styles.checkIcon} />}
              </span>
              <span className={styles.typeName}>{name}</span>
              <span className={styles.typeCount}>{typeEntities.length}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
