import styles from './shared.module.css';

export function ProgressBar({ value = 0, max = 100 }) {
  const percentage = Math.min((value / max) * 100, 100);
  
  return (
    <div className={styles.progressBar}>
      <div 
        className={styles.progressBarFill} 
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export default ProgressBar;
