'use client';

import { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  ExternalLink,
  Plus,
  Trash2,
  GripVertical,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../edit.module.css';

// Individual field renderers
function TextField({ field, value, onChange }) {
  return (
    <input
      type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={styles.textInput}
      placeholder={field.placeholder || ''}
      maxLength={field.maxlength || undefined}
    />
  );
}

function TextareaField({ field, value, onChange }) {
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={styles.textareaInput}
      placeholder={field.placeholder || ''}
      rows={4}
    />
  );
}

function NumberField({ field, value, onChange }) {
  return (
    <input
      type="number"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={styles.textInput}
      min={field.min}
      max={field.max}
      step={field.step || 1}
    />
  );
}

function WysiwygField({ field, value, onChange }) {
  const [isSource, setIsSource] = useState(false);
  
  return (
    <div className={styles.wysiwygField}>
      <div className={styles.wysiwygToolbar}>
        <button
          type="button"
          onClick={() => setIsSource(!isSource)}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            borderRadius: 'var(--radius-sm)',
            background: isSource ? 'var(--primary)' : 'transparent',
            color: isSource ? 'var(--primary-foreground)' : 'var(--foreground)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
          }}
        >
          {isSource ? 'Visual' : 'HTML'}
        </button>
      </div>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={styles.wysiwygContent}
        style={{
          width: '100%',
          border: 'none',
          resize: 'vertical',
          fontFamily: isSource ? 'monospace' : 'inherit',
          fontSize: isSource ? '0.8125rem' : '0.9375rem',
        }}
        rows={8}
      />
    </div>
  );
}

function SelectField({ field, value, onChange }) {
  const choices = Object.entries(field.choices || {});
  
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={styles.selectInput}
      multiple={field.multiple}
    >
      {field.allow_null && <option value="">&mdash; Select &mdash;</option>}
      {choices.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}

function CheckboxField({ field, value, onChange }) {
  const choices = Object.entries(field.choices || {});
  const currentValues = Array.isArray(value) ? value : [];

  const handleChange = (key, checked) => {
    const newValues = checked
      ? [...currentValues, key]
      : currentValues.filter(v => v !== key);
    onChange(newValues);
  };

  return (
    <div className={styles.checkboxGroup}>
      {choices.map(([key, label]) => (
        <label key={key} className={styles.checkboxOption}>
          <input
            type="checkbox"
            checked={currentValues.includes(key)}
            onChange={(e) => handleChange(key, e.target.checked)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function RadioField({ field, value, onChange }) {
  const choices = Object.entries(field.choices || {});

  return (
    <div className={styles.radioGroup}>
      {choices.map(([key, label]) => (
        <label key={key} className={styles.radioOption}>
          <input
            type="radio"
            name={field.name}
            checked={value === key}
            onChange={() => onChange(key)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function TrueFalseField({ field, value, onChange }) {
  const isActive = value === true || value === 1 || value === '1';

  return (
    <div className={styles.toggleField}>
      <div 
        className={`${styles.toggle} ${isActive ? styles.active : ''}`}
        onClick={() => onChange(!isActive)}
      />
      <div className={styles.toggleLabels}>
        <span>{isActive ? (field.ui_on_text || 'Yes') : (field.ui_off_text || 'No')}</span>
      </div>
    </div>
  );
}

function ImageField({ field, value }) {
  const imageUrl = typeof value === 'object' ? value?.url : value;

  return (
    <div className={styles.imageField}>
      {imageUrl ? (
        <div className={styles.imagePreview}>
          <img src={imageUrl} alt="" />
        </div>
      ) : (
        <div className={styles.imagePreview}>
          <div className={styles.noImage}>
            <span>No image</span>
          </div>
        </div>
      )}
    </div>
  );
}

function GalleryField({ field, value }) {
  const images = Array.isArray(value) ? value : [];

  return (
    <div className={styles.galleryField}>
      {images.map((img, index) => {
        const imageUrl = typeof img === 'object' ? img?.url : img;
        return (
          <div key={index} className={styles.galleryItem}>
            {imageUrl && <img src={imageUrl} alt="" />}
          </div>
        );
      })}
      {images.length === 0 && (
        <div className={styles.noImage}>
          <span>No images</span>
        </div>
      )}
    </div>
  );
}

function LinkField({ field, value }) {
  const linkData = typeof value === 'object' ? value : { url: value };

  return (
    <div className={styles.linkField}>
      {linkData?.url ? (
        <a 
          href={linkData.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className={styles.linkPreview}
        >
          <ExternalLink style={{ width: '1rem', height: '1rem' }} />
          {linkData.title || linkData.url}
        </a>
      ) : (
        <span style={{ color: 'var(--muted-foreground)' }}>No link set</span>
      )}
    </div>
  );
}

function DateField({ field, value, onChange }) {
  return (
    <input
      type={field.type === 'date_time_picker' ? 'datetime-local' : field.type === 'time_picker' ? 'time' : 'date'}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={styles.textInput}
    />
  );
}

function ColorField({ field, value, onChange }) {
  return (
    <div className={styles.colorField}>
      <div 
        className={styles.colorPreview}
        style={{ backgroundColor: value || '#ffffff' }}
      />
      <input
        type="color"
        value={value || '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '3rem', height: '2rem', cursor: 'pointer' }}
      />
      <span className={styles.colorValue}>{value || '#ffffff'}</span>
    </div>
  );
}

function RepeaterField({ field, value }) {
  const rows = Array.isArray(value) ? value : [];
  const [expanded, setExpanded] = useState(rows.map(() => false));

  const toggleRow = (index) => {
    const newExpanded = [...expanded];
    newExpanded[index] = !newExpanded[index];
    setExpanded(newExpanded);
  };

  return (
    <div className={styles.repeaterField}>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className={styles.repeaterItem}>
          <div 
            className={styles.repeaterItemHeader}
            onClick={() => toggleRow(rowIndex)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <GripVertical style={{ width: '1rem', height: '1rem', color: 'var(--muted-foreground)' }} />
              <span className={styles.repeaterItemTitle}>
                {field.label} #{rowIndex + 1}
              </span>
            </div>
            {expanded[rowIndex] ? <ChevronDown /> : <ChevronRight />}
          </div>
          {expanded[rowIndex] && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {field.sub_fields?.map(subField => (
                <div key={subField.key} className={styles.acfField}>
                  <label className={styles.acfFieldLabel}>
                    {subField.label}
                  </label>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                    {JSON.stringify(row[subField.name])}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {rows.length === 0 && (
        <div style={{ color: 'var(--muted-foreground)', padding: '1rem', textAlign: 'center' }}>
          No rows added
        </div>
      )}
    </div>
  );
}

function GroupField({ field, value }) {
  const groupData = typeof value === 'object' ? value : {};
  
  return (
    <div style={{ 
      background: 'var(--muted)', 
      borderRadius: 'var(--radius-md)', 
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      {field.sub_fields?.map(subField => (
        <div key={subField.key} className={styles.acfField}>
          <label className={styles.acfFieldLabel}>
            {subField.label}
          </label>
          <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
            {JSON.stringify(groupData[subField.name])}
          </div>
        </div>
      ))}
    </div>
  );
}

// Main ACF Field renderer
function ACFFieldRenderer({ field, value, onChange }) {
  const handleChange = (newValue) => {
    onChange(field.name, newValue);
  };

  switch (field.type) {
    case 'text':
    case 'email':
    case 'url':
    case 'password':
      return <TextField field={field} value={value} onChange={handleChange} />;
    
    case 'textarea':
      return <TextareaField field={field} value={value} onChange={handleChange} />;
    
    case 'number':
    case 'range':
      return <NumberField field={field} value={value} onChange={handleChange} />;
    
    case 'wysiwyg':
      return <WysiwygField field={field} value={value} onChange={handleChange} />;
    
    case 'select':
      return <SelectField field={field} value={value} onChange={handleChange} />;
    
    case 'checkbox':
      return <CheckboxField field={field} value={value} onChange={handleChange} />;
    
    case 'radio':
    case 'button_group':
      return <RadioField field={field} value={value} onChange={handleChange} />;
    
    case 'true_false':
      return <TrueFalseField field={field} value={value} onChange={handleChange} />;
    
    case 'image':
    case 'file':
      return <ImageField field={field} value={value} />;
    
    case 'gallery':
      return <GalleryField field={field} value={value} />;
    
    case 'link':
      return <LinkField field={field} value={value} />;
    
    case 'date_picker':
    case 'date_time_picker':
    case 'time_picker':
      return <DateField field={field} value={value} onChange={handleChange} />;
    
    case 'color_picker':
      return <ColorField field={field} value={value} onChange={handleChange} />;
    
    case 'repeater':
      return <RepeaterField field={field} value={value} />;
    
    case 'group':
      return <GroupField field={field} value={value} />;
    
    default:
      // Fallback for unknown field types - show as JSON
      return (
        <div style={{ 
          background: 'var(--muted)', 
          padding: '0.75rem',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'monospace',
          fontSize: '0.8125rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {JSON.stringify(value, null, 2)}
        </div>
      );
  }
}

// Main ACF Fields component
export function ACFFields({ acfData, onChange }) {
  const { t } = useLocale();
  
  if (!acfData?.fields || Object.keys(acfData.fields).length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{t('entities.edit.acf.title')}</h3>
        </div>
        <div className={styles.cardContent}>
          <p style={{ color: 'var(--muted-foreground)' }}>
            {t('entities.edit.acf.noFields')}
          </p>
        </div>
      </div>
    );
  }

  const handleFieldChange = (fieldName, newValue) => {
    const updatedFields = {
      ...acfData.fields,
      [fieldName]: {
        ...acfData.fields[fieldName],
        value: newValue,
      },
    };
    
    onChange({
      ...acfData,
      fields: updatedFields,
    });
  };

  // Group fields by their ACF group
  const groups = acfData.groups || {};
  const fieldsByGroup = {};
  const ungroupedFields = [];

  Object.entries(acfData.fields).forEach(([name, field]) => {
    const groupKey = field.parent;
    if (groupKey && groups[groupKey]) {
      if (!fieldsByGroup[groupKey]) {
        fieldsByGroup[groupKey] = [];
      }
      fieldsByGroup[groupKey].push({ name, ...field });
    } else {
      ungroupedFields.push({ name, ...field });
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Grouped fields */}
      {Object.entries(fieldsByGroup).map(([groupKey, fields]) => (
        <div key={groupKey} className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              {groups[groupKey]?.title || 'Custom Fields'}
            </h3>
          </div>
          <div className={styles.cardContent}>
            <div className={styles.acfFields}>
              {fields.map(field => (
                <div key={field.key} className={styles.acfField}>
                  <label className={styles.acfFieldLabel}>
                    {field.label}
                    {field.required && <span className={styles.requiredBadge}>*</span>}
                  </label>
                  {field.instructions && (
                    <span className={styles.acfFieldInstructions}>
                      {field.instructions}
                    </span>
                  )}
                  <ACFFieldRenderer 
                    field={field} 
                    value={field.value}
                    onChange={handleFieldChange}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Ungrouped fields */}
      {ungroupedFields.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              {t('entities.edit.acf.otherFields')}
            </h3>
          </div>
          <div className={styles.cardContent}>
            <div className={styles.acfFields}>
              {ungroupedFields.map(field => (
                <div key={field.key} className={styles.acfField}>
                  <label className={styles.acfFieldLabel}>
                    {field.label}
                    {field.required && <span className={styles.requiredBadge}>*</span>}
                  </label>
                  {field.instructions && (
                    <span className={styles.acfFieldInstructions}>
                      {field.instructions}
                    </span>
                  )}
                  <ACFFieldRenderer 
                    field={field} 
                    value={field.value}
                    onChange={handleFieldChange}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
