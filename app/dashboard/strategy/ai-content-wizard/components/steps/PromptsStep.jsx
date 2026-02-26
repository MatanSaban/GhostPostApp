'use client';

import { MessageSquare } from 'lucide-react';
import styles from '../../page.module.css';

export default function PromptsStep({ state, dispatch, translations }) {
  const t = translations.prompts;

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrapper}>
          <MessageSquare className={styles.stepHeaderIcon} />
        </div>
        <div className={styles.stepInfo}>
          <h2 className={styles.stepTitle}>{t.title}</h2>
          <p className={styles.stepDescription}>{t.description}</p>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>{t.textPromptLabel}</label>
        <textarea
          className={styles.formTextarea}
          value={state.textPrompt}
          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'textPrompt', value: e.target.value })}
          placeholder={t.textPromptPlaceholder}
          rows={5}
        />
        <p className={styles.formHint}>{t.textPromptHint}</p>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>{t.imagePromptLabel}</label>
        <textarea
          className={styles.formTextarea}
          value={state.imagePrompt}
          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'imagePrompt', value: e.target.value })}
          placeholder={t.imagePromptPlaceholder}
          rows={5}
        />
        <p className={styles.formHint}>{t.imagePromptHint}</p>
      </div>
    </div>
  );
}
