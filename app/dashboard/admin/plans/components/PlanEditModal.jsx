'use client';

import { Plus, X } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import {
  AdminModal,
  FormInput,
  FormTextarea,
  FormCheckbox,
  FormActions,
  PrimaryButton,
  SecondaryButton,
} from '../../components/AdminModal';
import styles from '../../admin.module.css';

export default function PlanEditModal({
  isOpen,
  onClose,
  selectedPlan,
  formData,
  setFormData,
  features,
  limitations,
  predefinedLimitations,
  onAddFeature,
  onUpdateFeature,
  onRemoveFeature,
  onAddLimitation,
  onUpdateLimitation,
  onRemoveLimitation,
  onSubmit,
  isSubmitting,
}) {
  const { t } = useLocale();
  
  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={selectedPlan ? t('admin.plans.actions.edit') : t('admin.plans.addPlan')}
      size="medium"
    >
      <form onSubmit={onSubmit}>
        <FormInput
          label={t('admin.plans.columns.name')}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
        <FormInput
          label="Slug"
          value={formData.slug}
          onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
          required
          disabled={selectedPlan?.subscribersCount > 0}
        />
        <FormTextarea
          label={t('admin.plans.columns.description')}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={2}
        />
        <FormInput
          label={`${t('admin.plans.columns.price')} (${t('admin.plans.form.monthly')})`}
          type="number"
          step="0.01"
          min="0"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          required
        />
        <FormInput
          label={`${t('admin.plans.columns.price')} (${t('admin.plans.form.yearly')})`}
          type="number"
          step="0.01"
          min="0"
          value={formData.yearlyPrice}
          onChange={(e) => setFormData({ ...formData, yearlyPrice: e.target.value })}
          placeholder={t('admin.plans.form.yearlyPlaceholder')}
        />

        {/* Dynamic Features Section */}
        <div className={styles.formSection}>
          <div className={styles.formSectionHeader}>
            <h4 className={styles.formSectionTitle}>{t('admin.plans.columns.features')}</h4>
            <button 
              type="button" 
              className={styles.addLimitationBtn}
              onClick={onAddFeature}
              title={t('admin.plans.form.addFeature')}
            >
              <Plus size={16} />
            </button>
          </div>
          
          {features.length === 0 ? (
            <p className={styles.formSectionHint}>{t('admin.plans.form.noFeatures')}</p>
          ) : (
            <div className={styles.limitationsList}>
              {features.map((feature, index) => (
                <div key={feature.id} className={styles.limitationItem}>
                  <input
                    type="text"
                    className={styles.limitationKeyInput}
                    placeholder={t('admin.plans.form.featureKey')}
                    value={feature.key}
                    onChange={(e) => onUpdateFeature(index, 'key', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  />
                  <input
                    type="text"
                    className={styles.limitationLabelInput}
                    placeholder={t('admin.plans.form.featureLabel')}
                    value={feature.label}
                    onChange={(e) => onUpdateFeature(index, 'label', e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.removeLimitationBtn}
                    onClick={() => onRemoveFeature(index)}
                    title={t('admin.common.remove')}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Limitations Section */}
        <div className={styles.formSection}>
          <div className={styles.formSectionHeader}>
            <h4 className={styles.formSectionTitle}>{t('admin.plans.form.limitations')}</h4>
            <div className={styles.limitationActions}>
              <select 
                className={styles.limitationSelect}
                onChange={(e) => {
                  const selected = predefinedLimitations.find(l => l.key === e.target.value);
                  if (selected) onAddLimitation(selected);
                  e.target.value = '';
                }}
                value=""
              >
                <option value="">{t('admin.plans.form.addLimitation')}</option>
                {predefinedLimitations
                  .filter(l => !limitations.some(existing => existing.key === l.key))
                  .map(l => (
                    <option key={l.key} value={l.key}>{l.label}</option>
                  ))
                }
              </select>
              <button 
                type="button" 
                className={styles.addLimitationBtn}
                onClick={() => onAddLimitation()}
                title={t('admin.plans.form.addCustomLimitation')}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          
          {limitations.length === 0 ? (
            <p className={styles.formSectionHint}>{t('admin.plans.form.noLimitations')}</p>
          ) : (
            <div className={styles.limitationsList}>
              {limitations.map((limitation, index) => (
                <div key={limitation.id} className={styles.limitationItem}>
                  {limitation.isCustom ? (
                    <>
                      <input
                        type="text"
                        className={styles.limitationKeyInput}
                        placeholder={t('admin.plans.form.limitationKey')}
                        value={limitation.key}
                        onChange={(e) => onUpdateLimitation(index, 'key', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      />
                      <input
                        type="text"
                        className={styles.limitationLabelInput}
                        placeholder={t('admin.plans.form.limitationLabel')}
                        value={limitation.label}
                        onChange={(e) => onUpdateLimitation(index, 'label', e.target.value)}
                      />
                    </>
                  ) : (
                    <>
                      <code className={styles.limitationKey}>{limitation.key}</code>
                      <span className={styles.limitationLabel}>{limitation.label}</span>
                    </>
                  )}
                  <input
                    type="number"
                    className={styles.limitationValueInput}
                    placeholder={t('admin.plans.form.unlimitedPlaceholder')}
                    value={limitation.value}
                    onChange={(e) => onUpdateLimitation(index, 'value', e.target.value)}
                    min="0"
                  />
                  <button
                    type="button"
                    className={styles.removeLimitationBtn}
                    onClick={() => onRemoveLimitation(index)}
                    title={t('admin.common.remove')}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <FormCheckbox
          label={t('admin.plans.statuses.active')}
          checked={formData.isActive}
          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
        />
        <FormActions>
          <SecondaryButton type="button" onClick={onClose}>
            {t('admin.common.cancel')}
          </SecondaryButton>
          <PrimaryButton type="submit" isLoading={isSubmitting}>
            {t('admin.common.save')}
          </PrimaryButton>
        </FormActions>
      </form>
    </AdminModal>
  );
}
