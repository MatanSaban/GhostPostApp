import styles from './input.module.css';

export function Input({
  label,
  error,
  helperText,
  className = '',
  ...props
}) {
  const inputClasses = [
    styles.input,
    error ? styles.error : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.inputWrapper}>
      {label && <label className={styles.label}>{label}</label>}
      <input className={inputClasses} {...props} />
      {error && <span className={styles.errorMessage}>{error}</span>}
      {helperText && !error && <span className={styles.helperText}>{helperText}</span>}
    </div>
  );
}
