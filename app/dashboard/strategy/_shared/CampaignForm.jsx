'use client';

import { useState } from 'react';
import styles from './CampaignForm.module.css';

export const CAMPAIGN_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#a855f7', '#14b8a6', '#06b6d4', '#0ea5e9', '#d946ef',
];

const RESERVED_COLORS = [
  '#10b981', '#00ff9d',
  '#3b82f6',
  '#f59e0b',
  '#22c55e',
  '#eab308',
];

function hexDistance(a, b) {
  const parse = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function isReservedColor(hex) {
  return RESERVED_COLORS.some((rc) => hexDistance(hex.toLowerCase(), rc.toLowerCase()) < 35);
}

/**
 * Shared campaign form fields (name + color picker).
 * Used by both the AI Content Wizard CampaignStep and the Content Planner CreateCampaignModal.
 *
 * @param {object} props
 * @param {string} props.name - Campaign name value
 * @param {(name: string) => void} props.onNameChange - Handler for name changes
 * @param {string} props.color - Selected color value
 * @param {(color: string) => void} props.onColorChange - Handler for color changes
 * @param {object} props.translations - { nameLabel, namePlaceholder, colorLabel, reservedColor }
 * @param {boolean} [props.autoFocus] - Whether to auto-focus the name input
 */
export default function CampaignForm({ name, onNameChange, color, onColorChange, translations, autoFocus = false }) {
  const t = translations;
  const [colorWarning, setColorWarning] = useState('');

  return (
    <div className={styles.campaignForm}>
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>{t.nameLabel}</label>
        <input
          type="text"
          className={styles.formInput}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t.namePlaceholder}
          autoFocus={autoFocus}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>{t.colorLabel}</label>
        <div className={styles.colorPicker}>
          {CAMPAIGN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.colorSwatch} ${color === c ? styles.selected : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => {
                setColorWarning('');
                onColorChange(c);
              }}
            />
          ))}
          <label
            className={`${styles.colorSwatch} ${styles.customColorSwatch} ${!CAMPAIGN_COLORS.includes(color) ? styles.selected : ''}`}
            style={!CAMPAIGN_COLORS.includes(color) ? { background: color } : undefined}
          >
            <input
              type="color"
              className={styles.colorInput}
              value={color}
              onChange={(e) => {
                const hex = e.target.value;
                if (isReservedColor(hex)) {
                  setColorWarning(t.reservedColor || 'This color is too similar to status colors and cannot be used.');
                } else {
                  setColorWarning('');
                  onColorChange(hex);
                }
              }}
            />
            {CAMPAIGN_COLORS.includes(color) && <span className={styles.colorInputIcon}>+</span>}
          </label>
        </div>
        {colorWarning && <p className={styles.colorWarning}>{colorWarning}</p>}
      </div>
    </div>
  );
}
