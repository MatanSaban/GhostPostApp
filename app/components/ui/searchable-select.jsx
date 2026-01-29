"use client";
import React, { useState, useRef, useEffect } from 'react';
import styles from './searchable-select.module.css';

// Lightweight searchable select (combobox style)
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  clearable = true,
  className,
  style,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target) && !(listRef.current?.contains(e.target))) {
        setOpen(false);
        setQuery('');
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { 
      document.removeEventListener('mousedown', onDoc); 
      document.removeEventListener('keydown', onKey); 
    };
  }, [open]);

  const selected = options.find(o => o.value === value);

  const selectValue = (val) => {
    onChange(val);
    setOpen(false);
    setQuery('');
  };

  // Keyboard navigation inside list
  useEffect(() => {
    if (!open) return;
    let idx = -1;
    const handler = (e) => {
      if (!listRef.current) return;
      const items = Array.from(listRef.current.querySelectorAll('li[data-opt="true"]'));
      if (!items.length) return;
      if (e.key === 'ArrowDown') { 
        e.preventDefault(); 
        idx = Math.min(items.length - 1, idx + 1); 
        items[idx].focus(); 
      }
      else if (e.key === 'ArrowUp') { 
        e.preventDefault(); 
        idx = Math.max(0, idx - 1); 
        items[idx].focus(); 
      }
      else if (e.key === 'Enter') {
        const el = document.activeElement;
        if (el && el.dataset.value) { selectValue(el.dataset.value); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div ref={wrapRef} className={`${styles.root} ${className || ''}`} style={style}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={styles.label}>
          {selected ? selected.label : <span className={styles.placeholder}>{placeholder}</span>}
        </span>
        <span className={styles.caret}>▾</span>
        {clearable && selected && selected.value !== '' && selected.value !== '__ALL__' && (
          <span
            role="button"
            aria-label="Clear selection"
            onClick={(e) => { e.stopPropagation(); selectValue(undefined); }}
            className={styles.clear}
          >×</span>
        )}
      </button>
      {open && (
        <div className={styles.menu}>
          <div className={styles.searchWrap}>
            <input
              ref={inputRef}
              className={styles.search}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
            />
          </div>
          <ul ref={listRef} role="listbox" className={styles.list}>
            {filtered.length === 0 && (
              <li className={styles.empty} tabIndex={-1}>No results</li>
            )}
            {filtered.map(o => (
              <li
                key={o.value}
                data-opt="true"
                data-value={o.value}
                tabIndex={0}
                onClick={() => selectValue(o.value)}
                className={`${styles.option} ${o.value === value ? styles.isSelected : ''}`}
                onKeyDown={(e) => { if (e.key === 'Enter') { selectValue(o.value); } }}
              >{o.label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SearchableSelect;
