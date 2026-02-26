'use client';

import { Hash } from 'lucide-react';
import styles from '../../page.module.css';

export default function PostCountStep({ state, dispatch, translations }) {
  const t = translations.postCount;

  const handleChange = (value) => {
    const num = Math.max(1, Math.min(100, parseInt(value) || 1));
    dispatch({ type: 'SET_POSTS_COUNT', value: num });
  };

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrapper}>
          <Hash className={styles.stepHeaderIcon} />
        </div>
        <div className={styles.stepInfo}>
          <h2 className={styles.stepTitle}>{t.title}</h2>
          <p className={styles.stepDescription}>{t.description}</p>
        </div>
      </div>

      <div className={styles.postCountWrapper}>
        <label className={styles.formLabel}>{t.label}</label>
        <div className={styles.postCountInput}>
          <button
            className={styles.postCountBtn}
            onClick={() => handleChange(state.postsCount - 1)}
            disabled={state.postsCount <= 1}
          >
            −
          </button>
          <input
            type="number"
            className={styles.postCountNumber}
            value={state.postsCount}
            onChange={(e) => handleChange(e.target.value)}
            min={1}
            max={100}
          />
          <button
            className={styles.postCountBtn}
            onClick={() => handleChange(state.postsCount + 1)}
            disabled={state.postsCount >= 100}
          >
            +
          </button>
        </div>
        <p className={styles.formHint}>{t.hint}</p>
      </div>
    </div>
  );
}
