'use client';

import styles from './button.module.css';

/**
 * Reusable Button component
 * 
 * @param {'default'|'primary'|'danger'|'ghost'|'icon'|'warning'} variant - Visual style
 * @param {'sm'|'md'|'lg'} size - Size preset
 * @param {boolean} iconOnly - Whether the button contains only an icon (square shape)
 * @param {boolean} iconDanger - For icon variant: red hover style (e.g. delete actions)
 * @param {string} className - Additional CSS class
 * @param {React.ReactNode} children - Button content
 */
export function Button({
  variant = 'default',
  size = 'md',
  iconOnly = false,
  iconDanger = false,
  className = '',
  children,
  ...props
}) {
  const classes = [
    styles.btn,
    styles[variant],
    styles[size],
    iconOnly ? styles.iconOnly : '',
    iconDanger ? styles.iconDanger : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
