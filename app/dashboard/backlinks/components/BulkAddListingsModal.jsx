'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Plus, Trash2, Download, Loader2, AlertCircle } from 'lucide-react';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import styles from '../backlinks.module.css';
import * as XLSX from 'xlsx';

const EMPTY_ITEM = () => ({
  _key: Math.random().toString(36).slice(2),
  domain: '',
  url: '',
  title: '',
  monthlyTraffic: '',
  price: '',
  dr: '',
  ur: '',
  da: '',
  language: '',
  category: '',
  maxSlots: '',
  currency: 'ILS',
});

// Column header → field key mapping (case-insensitive)
const COLUMN_MAP = {
  'website name': 'domain',
  'website name *': 'domain',
  'name': 'domain',
  'website url': 'url',
  'website url *': 'url',
  'url': 'url',
  'website title': 'title',
  'title': 'title',
  'monthly traffic': 'monthlyTraffic',
  'traffic': 'monthlyTraffic',
  'price': 'price',
  'price *': 'price',
  'dr': 'dr',
  'ur': 'ur',
  'da': 'da',
  'language': 'language',
  'language *': 'language',
  'website language': 'language',
  'website language *': 'language',
  'category': 'category',
  'max capacity': 'maxSlots',
  'maxslots': 'maxSlots',
  'max slots': 'maxSlots',
  'capacity': 'maxSlots',
  'currency': 'currency',
};

function mapColumnName(header) {
  const normalized = String(header).trim().toLowerCase();
  return COLUMN_MAP[normalized] || null;
}

export default function BulkAddListingsModal({ t, onClose, onDone }) {
  const { isMaximized, toggleMaximize } = useModalResize();
  const fileInputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { created, errors }
  const [parseError, setParseError] = useState(null);

  // ── File parsing ──────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length === 0) {
          setParseError(t('backlinks.bulk.noRows') || 'No data rows found in file');
          return;
        }

        // Map columns
        const headers = Object.keys(rows[0]);
        const colMapping = {};
        headers.forEach(h => {
          const field = mapColumnName(h);
          if (field) colMapping[h] = field;
        });

        const parsed = rows.map(row => {
          const item = EMPTY_ITEM();
          Object.entries(colMapping).forEach(([header, field]) => {
            const val = String(row[header] ?? '').trim();
            if (val) item[field] = val;
          });
          return item;
        }).filter(item => item.domain || item.url); // skip completely empty rows

        if (parsed.length === 0) {
          setParseError(t('backlinks.bulk.noValidRows') || 'No valid rows found. Make sure column headers match the template.');
          return;
        }

        setItems(prev => [...prev, ...parsed]);
      } catch {
        setParseError(t('backlinks.bulk.parseError') || 'Failed to parse file. Please use the template format.');
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  // ── Item management ───────────────────────
  const addEmptyItem = () => setItems(prev => [...prev, EMPTY_ITEM()]);

  const removeItem = (key) => setItems(prev => prev.filter(i => i._key !== key));

  const updateItem = (key, field, value) => {
    setItems(prev => prev.map(i => i._key === key ? { ...i, [field]: value } : i));
  };

  // ── Validation ────────────────────────────
  const getRowErrors = (item) => {
    const errors = [];
    if (!item.domain.trim()) errors.push('name');
    if (!item.url.trim()) errors.push('url');
    if (!item.price || isNaN(parseFloat(item.price))) errors.push('price');
    if (!item.language.trim()) errors.push('language');
    return errors;
  };

  // ── Submit ────────────────────────────────
  const handleSubmit = async () => {
    if (items.length === 0) return;

    // Check all rows valid
    const hasErrors = items.some(i => getRowErrors(i).length > 0);
    if (hasErrors) return; // UI highlights the errors

    setSubmitting(true);
    setResult(null);

    try {
      const payload = items.map(({ _key, ...rest }) => rest);
      const res = await fetch('/api/backlinks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listings: payload }),
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({ created: 0, errors: [{ row: 0, message: data.error || t('backlinks.bulk.serverError') }] });
      } else {
        setResult(data);
        if (data.created > 0 && data.errors.length === 0) {
          // All succeeded - close after brief delay
          setTimeout(() => {
            onDone();
            onClose();
          }, 1500);
        }
      }
    } catch {
      setResult({ created: 0, errors: [{ row: 0, message: t('backlinks.bulk.networkError') }] });
    } finally {
      setSubmitting(false);
    }
  };

  const allValid = items.length > 0 && items.every(i => getRowErrors(i).length === 0);

  return createPortal(
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`${styles.modal} ${styles.bulkModal} ${isMaximized ? styles.modalMaximized : ''}`}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {t('backlinks.bulk.title') || 'Bulk Add Websites'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ModalResizeButton isMaximized={isMaximized} toggleMaximize={toggleMaximize} />
            <button className={styles.modalClose} onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {/* File upload + template download */}
          <div className={styles.bulkActions}>
            <button
              className={styles.bulkUploadBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} />
              {t('backlinks.bulk.uploadFile') || 'Upload CSV/XLSX'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <a
              href="/templates/backlinks-bulk-template.xlsx"
              download="backlinks-bulk-template.xlsx"
              className={styles.bulkTemplateLink}
            >
              <Download size={14} />
              {t('backlinks.bulk.downloadTemplate') || 'Download Template'}
            </a>
          </div>

          {parseError && (
            <div className={styles.bulkError}>
              <AlertCircle size={14} />
              {parseError}
            </div>
          )}

          {/* Items list */}
          {items.length > 0 && (
            <div className={styles.bulkItemsContainer}>
              <div className={styles.bulkItemsHeader}>
                <span>{items.length} {t('backlinks.bulk.sites') || 'sites'}</span>
                <button className={styles.bulkClearBtn} onClick={() => setItems([])}>
                  {t('backlinks.bulk.clearAll') || 'Clear All'}
                </button>
              </div>
              <div className={styles.bulkItemsList}>
                {items.map((item, idx) => {
                  const errors = getRowErrors(item);
                  return (
                    <div key={item._key} className={`${styles.bulkItem} ${errors.length > 0 ? styles.bulkItemError : ''}`}>
                      <div className={styles.bulkItemNum}>{idx + 1}</div>
                      <div className={styles.bulkItemFields}>
                        <div className={styles.bulkItemRow}>
                          <input
                            className={`${styles.bulkInput} ${errors.includes('name') ? styles.bulkInputError : ''}`}
                            placeholder={t('backlinks.bulk.websiteName') || 'Website Name *'}
                            value={item.domain}
                            onChange={e => updateItem(item._key, 'domain', e.target.value)}
                          />
                          <input
                            className={`${styles.bulkInput} ${styles.bulkInputWide} ${errors.includes('url') ? styles.bulkInputError : ''}`}
                            placeholder={t('backlinks.bulk.websiteUrl') || 'Website URL *'}
                            value={item.url}
                            onChange={e => updateItem(item._key, 'url', e.target.value)}
                          />
                        </div>
                        <div className={styles.bulkItemRow}>
                          <input
                            className={styles.bulkInput}
                            placeholder={t('backlinks.bulk.websiteTitle') || 'Website Title'}
                            value={item.title}
                            onChange={e => updateItem(item._key, 'title', e.target.value)}
                          />
                          <input
                            className={`${styles.bulkInput} ${styles.bulkInputSmall} ${errors.includes('price') ? styles.bulkInputError : ''}`}
                            placeholder={t('backlinks.bulk.price') || 'Price *'}
                            type="number"
                            value={item.price}
                            onChange={e => updateItem(item._key, 'price', e.target.value)}
                          />
                          <input
                            className={`${styles.bulkInput} ${styles.bulkInputSmall} ${errors.includes('language') ? styles.bulkInputError : ''}`}
                            placeholder={t('backlinks.bulk.language') || 'Language *'}
                            value={item.language}
                            onChange={e => updateItem(item._key, 'language', e.target.value)}
                          />
                          <select
                            className={`${styles.bulkInput} ${styles.bulkInputSmall}`}
                            value={item.currency}
                            onChange={e => updateItem(item._key, 'currency', e.target.value)}
                          >
                            <option value="ILS">₪ ILS</option>
                            <option value="USD">$ USD</option>
                            <option value="EUR">€ EUR</option>
                            <option value="GBP">£ GBP</option>
                          </select>
                        </div>
                        <div className={styles.bulkItemRow}>
                          <input
                            className={`${styles.bulkInput} ${styles.bulkInputSmall}`}
                            placeholder="DA"
                            type="number"
                            value={item.da}
                            onChange={e => updateItem(item._key, 'da', e.target.value)}
                          />
                          <input
                            className={`${styles.bulkInput} ${styles.bulkInputSmall}`}
                            placeholder="DR"
                            type="number"
                            value={item.dr}
                            onChange={e => updateItem(item._key, 'dr', e.target.value)}
                          />
                          <input
                            className={`${styles.bulkInput} ${styles.bulkInputSmall}`}
                            placeholder="UR"
                            type="number"
                            value={item.ur}
                            onChange={e => updateItem(item._key, 'ur', e.target.value)}
                          />
                          <input
                            className={`${styles.bulkInput} ${styles.bulkInputSmall}`}
                            placeholder={t('backlinks.bulk.traffic') || 'Traffic'}
                            type="number"
                            value={item.monthlyTraffic}
                            onChange={e => updateItem(item._key, 'monthlyTraffic', e.target.value)}
                          />
                          <input
                            className={`${styles.bulkInput} ${styles.bulkInputSmall}`}
                            placeholder={t('backlinks.bulk.category') || 'Category'}
                            value={item.category}
                            onChange={e => updateItem(item._key, 'category', e.target.value)}
                          />
                          <input
                            className={`${styles.bulkInput} ${styles.bulkInputSmall}`}
                            placeholder={t('backlinks.bulk.maxCapacity') || 'Max Capacity'}
                            type="number"
                            value={item.maxSlots}
                            onChange={e => updateItem(item._key, 'maxSlots', e.target.value)}
                          />
                        </div>
                      </div>
                      <button className={styles.bulkItemRemove} onClick={() => removeItem(item._key)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual add button */}
          <button className={styles.bulkAddManual} onClick={addEmptyItem}>
            <Plus size={15} />
            {t('backlinks.bulk.addManually') || 'Add Website Manually'}
          </button>

          {/* Result feedback */}
          {result && (
            <div className={result.errors.length === 0 ? styles.bulkSuccess : styles.bulkError}>
              {result.created > 0 && (
                <span>{result.created} {t('backlinks.bulk.created') || 'websites added successfully'}</span>
              )}
              {result.errors.length > 0 && (
                <div>
                  {result.errors.map((err, i) => (
                    <div key={i}>
                      {err.row > 0 ? `Row ${err.row}: ` : ''}{err.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button
            className={`${styles.purchaseButton}`}
            onClick={onClose}
            disabled={submitting}
          >
            {t('backlinks.bulk.cancel') || 'Cancel'}
          </button>
          <button
            className={`${styles.purchaseButton} ${styles.purchaseButtonPrimary}`}
            onClick={handleSubmit}
            disabled={submitting || !allValid}
          >
            {submitting ? (
              <><Loader2 size={16} className={styles.spinner} /> {t('backlinks.bulk.adding') || 'Adding...'}</>
            ) : (
              `${t('backlinks.bulk.addAll') || 'Add All'} (${items.length})`
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
