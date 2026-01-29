import styles from './card.module.css';

export function Card({
  children,
  title,
  description,
  hoverable = false,
  clickable = false,
  className = '',
  onClick,
  ...props
}) {
  const cardClasses = [
    styles.card,
    hoverable ? styles.hoverable : '',
    clickable ? styles.clickable : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} onClick={onClick} {...props}>
      <div className={styles.cardGlow}></div>
      <div className={styles.cardContent}>
        {(title || description) && (
          <div className={styles.cardHeader}>
            {title && <h3 className={styles.cardTitle}>{title}</h3>}
            {description && <p className={styles.cardDescription}>{description}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
