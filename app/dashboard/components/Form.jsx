'use client';

import styles from './shared.module.css';

/**
 * Form Field wrapper component
 * @param {string} label - Field label
 * @param {string} error - Error message
 * @param {string} hint - Optional hint text
 * @param {boolean} required - Whether the field is required
 * @param {boolean} fullWidth - Whether to span full width in grid layouts
 */
export function FormField({ label, error, hint, required, fullWidth, children, className = '' }) {
  return (
    <div className={`${styles.formField} ${fullWidth ? styles.fullWidth : ''} ${className}`}>
      {label && (
        <label className={styles.formLabel}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      {children}
      {hint && !error && <span className={styles.formHint}>{hint}</span>}
      {error && <span className={styles.formError}>{error}</span>}
    </div>
  );
}

/**
 * Reusable Input component
 */
export function Input({ label, error, hint, required, fullWidth, className = '', ...props }) {
  if (label || error || hint) {
    return (
      <FormField label={label} error={error} hint={hint} required={required} fullWidth={fullWidth}>
        <input className={`${styles.formInput} ${error ? styles.hasError : ''} ${className}`} {...props} />
      </FormField>
    );
  }
  return <input className={`${styles.formInput} ${error ? styles.hasError : ''} ${className}`} {...props} />;
}

/**
 * Reusable Textarea component
 */
export function Textarea({ label, error, hint, required, fullWidth, className = '', rows = 4, ...props }) {
  if (label || error || hint) {
    return (
      <FormField label={label} error={error} hint={hint} required={required} fullWidth={fullWidth}>
        <textarea 
          className={`${styles.formTextarea} ${error ? styles.hasError : ''} ${className}`} 
          rows={rows}
          {...props} 
        />
      </FormField>
    );
  }
  return (
    <textarea 
      className={`${styles.formTextarea} ${error ? styles.hasError : ''} ${className}`} 
      rows={rows}
      {...props} 
    />
  );
}

/**
 * Reusable Select component
 * @param {Array} options - Array of options: [{ value, label }] or ['value1', 'value2']
 * @param {string} placeholder - Optional placeholder text
 */
export function Select({ label, error, hint, required, fullWidth, options = [], placeholder, className = '', ...props }) {
  const normalizedOptions = options.map(opt => 
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const selectElement = (
    <select className={`${styles.formSelect} ${error ? styles.hasError : ''} ${className}`} {...props}>
      {placeholder && <option value="">{placeholder}</option>}
      {normalizedOptions.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );

  if (label || error || hint) {
    return (
      <FormField label={label} error={error} hint={hint} required={required} fullWidth={fullWidth}>
        {selectElement}
      </FormField>
    );
  }
  return selectElement;
}

/**
 * Reusable Checkbox component
 */
export function Checkbox({ label, className = '', ...props }) {
  return (
    <label className={`${styles.checkboxLabel} ${className}`}>
      <input type="checkbox" className={styles.checkbox} {...props} />
      {label && <span>{label}</span>}
    </label>
  );
}

/**
 * Reusable Radio component
 */
export function Radio({ label, className = '', ...props }) {
  return (
    <label className={`${styles.radioLabel} ${className}`}>
      <input type="radio" className={styles.radio} {...props} />
      {label && <span>{label}</span>}
    </label>
  );
}

/**
 * Form Grid layout component
 * @param {number} columns - Number of columns (1, 2, 3, or 4)
 */
export function FormGrid({ children, columns = 2, className = '' }) {
  const columnClass = styles[`formGridCols${columns}`] || styles.formGridCols2;
  return (
    <div className={`${styles.formGrid} ${columnClass} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Form Actions container (for submit/cancel buttons)
 * @param {string} align - Alignment: 'start' | 'center' | 'end' | 'space-between'
 */
export function FormActions({ children, align = 'end', className = '' }) {
  return (
    <div className={`${styles.formActions} ${styles[`align${align.charAt(0).toUpperCase() + align.slice(1)}`]} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Form component wrapper
 */
export function Form({ children, className = '', onSubmit, ...props }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit?.(e);
  };

  return (
    <form className={`${styles.form} ${className}`} onSubmit={handleSubmit} {...props}>
      {children}
    </form>
  );
}
