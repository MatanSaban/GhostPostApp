'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, GripVertical } from 'lucide-react';
import styles from './ContentEditor.module.css';

// Pages that have content in the dictionary
const PAGE_KEYS = [
  { key: 'metadata', label: 'Metadata (Global)' },
  { key: 'nav', label: 'Navigation' },
  { key: 'hero', label: 'Hero Section' },
  { key: 'features', label: 'Features' },
  { key: 'howItWorks', label: 'How It Works' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'cta', label: 'CTA Section' },
  { key: 'about', label: 'About Page' },
  { key: 'contact', label: 'Contact Page' },
  { key: 'faq', label: 'FAQ Page' },
  { key: 'blog', label: 'Blog' },
  { key: 'blogPost', label: 'Blog Post' },
  { key: 'footer', label: 'Footer' },
  { key: 'auth', label: 'Auth Pages' },
  { key: 'terms', label: 'Terms of Service' },
  { key: 'privacy', label: 'Privacy Policy' },
  { key: 'common', label: 'Common Texts' }
];

// Field types for smarter editing
function getFieldType(key, value) {
  if (key.toLowerCase().includes('description') || key.toLowerCase().includes('content') || key.toLowerCase().includes('paragraph')) {
    return 'textarea';
  }
  if (key.toLowerCase().includes('url') || key.toLowerCase().includes('link')) {
    return 'url';
  }
  if (key.toLowerCase().includes('email')) {
    return 'email';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'object' && value !== null) {
    return 'object';
  }
  return 'text';
}

// Recursive field editor
function FieldEditor({ fieldKey, value, path, onChange, level = 0 }) {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const fieldType = getFieldType(fieldKey, value);
  const fullPath = path ? `${path}.${fieldKey}` : fieldKey;

  const handleChange = useCallback((newValue) => {
    onChange(fullPath, newValue);
  }, [fullPath, onChange]);

  // For arrays
  if (fieldType === 'array') {
    return (
      <div className={styles.arrayField}>
        <div 
          className={styles.arrayHeader}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className={styles.fieldKey}>{fieldKey}</span>
          <span className={styles.arrayCount}>{value.length} items</span>
        </div>
        
        {isExpanded && (
          <div className={styles.arrayItems}>
            {value.map((item, idx) => (
              <div key={idx} className={styles.arrayItem}>
                <div className={styles.arrayItemHeader}>
                  <GripVertical size={14} className={styles.dragHandle} />
                  <span className={styles.arrayItemIndex}>#{idx + 1}</span>
                  <button
                    type="button"
                    className={styles.removeItemBtn}
                    onClick={() => {
                      const newArray = [...value];
                      newArray.splice(idx, 1);
                      handleChange(newArray);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                
                {typeof item === 'object' && item !== null ? (
                  <div className={styles.nestedObject}>
                    {Object.entries(item).map(([k, v]) => (
                      <FieldEditor
                        key={k}
                        fieldKey={k}
                        value={v}
                        path={`${fullPath}.${idx}`}
                        onChange={onChange}
                        level={level + 1}
                      />
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={item}
                    className={styles.textInput}
                    onChange={(e) => {
                      const newArray = [...value];
                      newArray[idx] = e.target.value;
                      handleChange(newArray);
                    }}
                  />
                )}
              </div>
            ))}
            
            <button
              type="button"
              className={styles.addItemBtn}
              onClick={() => {
                const newItem = value.length > 0 && typeof value[0] === 'object'
                  ? { ...Object.fromEntries(Object.keys(value[0]).map(k => [k, ''])) }
                  : '';
                handleChange([...value, newItem]);
              }}
            >
              <Plus size={14} />
              Add Item
            </button>
          </div>
        )}
      </div>
    );
  }

  // For nested objects
  if (fieldType === 'object') {
    return (
      <div className={styles.objectField}>
        <div 
          className={styles.objectHeader}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className={styles.fieldKey}>{fieldKey}</span>
          <span className={styles.fieldCount}>{Object.keys(value).length} fields</span>
        </div>
        
        {isExpanded && (
          <div className={styles.objectFields}>
            {Object.entries(value).map(([k, v]) => (
              <FieldEditor
                key={k}
                fieldKey={k}
                value={v}
                path={fullPath}
                onChange={onChange}
                level={level + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // For textarea
  if (fieldType === 'textarea') {
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{fieldKey}</label>
        <textarea
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          className={styles.textareaInput}
          rows={3}
        />
      </div>
    );
  }

  // For simple text/url/email
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{fieldKey}</label>
      <input
        type={fieldType}
        value={value || ''}
        onChange={(e) => handleChange(e.target.value)}
        className={styles.textInput}
      />
    </div>
  );
}

export default function ContentEditor({ content, onChange, pageId }) {
  const [expandedSections, setExpandedSections] = useState(['metadata', 'hero']);

  const toggleSection = (key) => {
    setExpandedSections(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const handleFieldChange = useCallback((path, newValue) => {
    // Parse path and update nested value
    const keys = path.split('.');
    const newContent = JSON.parse(JSON.stringify(content));
    
    let current = newContent;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      // Handle array indices
      if (!isNaN(key)) {
        current = current[parseInt(key)];
      } else {
        current = current[key];
      }
    }
    
    const lastKey = keys[keys.length - 1];
    if (!isNaN(lastKey)) {
      current[parseInt(lastKey)] = newValue;
    } else {
      current[lastKey] = newValue;
    }
    
    onChange(newContent);
  }, [content, onChange]);

  if (!content) {
    return <div className={styles.empty}>No content loaded</div>;
  }

  // Single page mode - show fields directly without section accordion
  if (pageId) {
    return (
      <div className={styles.editor}>
        <div className={styles.sectionContent}>
          {Object.entries(content).map(([fieldKey, fieldValue]) => (
            <FieldEditor
              key={fieldKey}
              fieldKey={fieldKey}
              value={fieldValue}
              path=""
              onChange={handleFieldChange}
            />
          ))}
        </div>
      </div>
    );
  }

  // Full dictionary mode - show all sections
  return (
    <div className={styles.editor}>
      {PAGE_KEYS.map(({ key, label }) => {
        if (!content[key]) return null;
        const isExpanded = expandedSections.includes(key);
        
        return (
          <div key={key} className={styles.section}>
            <div 
              className={styles.sectionHeader}
              onClick={() => toggleSection(key)}
            >
              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <span className={styles.sectionTitle}>{label}</span>
              <span className={styles.sectionKey}>{key}</span>
            </div>
            
            {isExpanded && (
              <div className={styles.sectionContent}>
                {Object.entries(content[key]).map(([fieldKey, fieldValue]) => (
                  <FieldEditor
                    key={fieldKey}
                    fieldKey={fieldKey}
                    value={fieldValue}
                    path={key}
                    onChange={handleFieldChange}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
