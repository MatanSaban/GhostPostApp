'use client';

import { useLocale } from '@/app/context/locale-context';
import {
  AdminModal,
  FormInput,
  FormTextarea,
  FormSelect,
  FormActions,
  PrimaryButton,
  SecondaryButton,
} from '../../components/AdminModal';
import styles from '../../admin.module.css';

export default function PlanTranslateModal({
  isOpen,
  onClose,
  selectedPlan,
  selectedLanguage,
  availableLanguages,
  existingTranslations,
  translationData,
  setTranslationData,
  onLanguageChange,
  onUpdateFeatureTranslation,
  onUpdateLimitationTranslation,
  getAllPlanLimitations,
  onSubmit,
  onDeleteTranslation,
  isSubmitting,
}) {
  const { t } = useLocale();
  
  if (!selectedPlan) return null;
  
  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('admin.plans.actions.translate')}: ${selectedPlan?.name || ''}`}
      size="large"
    >
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <FormSelect
            label={t('admin.plans.translations.selectLanguage')}
            value={selectedLanguage}
            onChange={(e) => onLanguageChange(e.target.value)}
            options={availableLanguages.filter(l => l !== 'EN').map(lang => ({
              value: lang,
              label: `${lang} ${existingTranslations[lang] ? '✓' : ''}`,
            }))}
          />
        </div>

        <div style={{ 
          background: 'var(--muted)', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          marginBottom: '1rem',
          fontSize: '0.875rem',
        }}>
          <strong>{t('admin.plans.translations.original')} (EN):</strong>
          <div style={{ marginTop: '0.5rem' }}>
            <div><strong>{t('admin.plans.columns.name')}:</strong> {selectedPlan.name}</div>
            <div><strong>{t('admin.plans.columns.description')}:</strong> {selectedPlan.description || '-'}</div>
            <div><strong>{t('admin.plans.columns.features')}:</strong></div>
            <ul style={{ margin: '0.25rem 0 0 1.5rem', padding: 0 }}>
              {selectedPlan.features.map((f, idx) => (
                <li key={idx}>{f.label || f.key}</li>
              ))}
            </ul>
          </div>
        </div>

        <FormInput
          label={`${t('admin.plans.columns.name')} (${selectedLanguage})`}
          value={translationData.name}
          onChange={(e) => setTranslationData({ ...translationData, name: e.target.value })}
          required
          placeholder={selectedPlan.name}
        />
        <FormTextarea
          label={`${t('admin.plans.columns.description')} (${selectedLanguage})`}
          value={translationData.description}
          onChange={(e) => setTranslationData({ ...translationData, description: e.target.value })}
          rows={2}
          placeholder={selectedPlan.description || ''}
        />

        {/* Features Translations */}
        {selectedPlan.features.length > 0 && (
          <div className={styles.formSection} style={{ marginTop: '1.5rem' }}>
            <h4 className={styles.formSectionTitle}>{t('admin.plans.translations.features')}</h4>
            <p className={styles.formSectionHint}>{t('admin.plans.translations.featuresHint')}</p>
            <div className={styles.limitationsList}>
              {selectedPlan.features.map((feature) => {
                const translatedValue = translationData.features.find(f => f.key === feature.key)?.label || '';
                return (
                  <div key={feature.key} className={styles.limitationItem}>
                    <div className={styles.limitationOriginal}>
                      <code className={styles.limitationKey}>{feature.key}</code>
                      <span className={styles.limitationLabel}>{feature.label}</span>
                    </div>
                    <input
                      type="text"
                      className={styles.limitationTranslationInput}
                      placeholder={`${feature.label} (${selectedLanguage})`}
                      value={translatedValue}
                      onChange={(e) => onUpdateFeatureTranslation(feature.key, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Limitations Translations */}
        {getAllPlanLimitations(selectedPlan).length > 0 && (
          <div className={styles.formSection} style={{ marginTop: '1.5rem' }}>
            <h4 className={styles.formSectionTitle}>{t('admin.plans.translations.limitations')}</h4>
            <p className={styles.formSectionHint}>{t('admin.plans.translations.limitationsHint')}</p>
            <div className={styles.limitationsList}>
              {getAllPlanLimitations(selectedPlan).map((limitation) => {
                const translatedValue = translationData.limitations.find(l => l.key === limitation.key)?.label || '';
                return (
                  <div key={limitation.key} className={styles.limitationItem}>
                    <div className={styles.limitationOriginal}>
                      <code className={styles.limitationKey}>{limitation.key}</code>
                      <span className={styles.limitationLabel}>{limitation.label}</span>
                    </div>
                    <input
                      type="text"
                      className={styles.limitationTranslationInput}
                      placeholder={`${limitation.label} (${selectedLanguage})`}
                      value={translatedValue}
                      onChange={(e) => onUpdateLimitationTranslation(limitation.key, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <FormActions>
          {existingTranslations[selectedLanguage] && (
            <button
              type="button"
              onClick={onDeleteTranslation}
              disabled={isSubmitting}
              style={{
                background: 'transparent',
                border: '1px solid var(--destructive)',
                color: 'var(--destructive)',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                marginRight: 'auto',
              }}
            >
              {t('admin.plans.translations.deleteTranslation')}
            </button>
          )}
          <SecondaryButton type="button" onClick={onClose}>
            {t('admin.common.close')}
          </SecondaryButton>
          <PrimaryButton type="submit" isLoading={isSubmitting}>
            {t('admin.plans.translations.save')}
          </PrimaryButton>
        </FormActions>
      </form>
    </AdminModal>
  );
}
