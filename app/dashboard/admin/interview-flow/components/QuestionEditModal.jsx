'use client';

import { RefreshCw, Save, Bot, Zap } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { 
  AdminModal, 
  FormInput, 
  FormTextarea, 
  FormSelect, 
  FormCheckbox, 
  FormActions, 
  PrimaryButton, 
  SecondaryButton 
} from '../../components/AdminModal';
import InputConfigForm from './InputConfigForm';
import { questionTypes, getTypeLabel } from './useInterviewFlow';
import styles from '../../admin.module.css';

export default function QuestionEditModal({
  isOpen,
  onClose,
  selectedQuestion,
  formData,
  setFormData,
  activeTab,
  setActiveTab,
  botActions,
  isSubmitting,
  onSubmit,
  onTypeChange,
}) {
  const { t } = useLocale();
  
  const tabs = [
    { key: 'basic', label: t('admin.interviewFlow.tabs.basic') },
    { key: 'input', label: t('admin.interviewFlow.tabs.input') },
    { key: 'validation', label: t('admin.interviewFlow.tabs.validation') },
    { key: 'ai', label: t('admin.interviewFlow.tabs.ai') },
    { key: 'conditions', label: t('admin.interviewFlow.tabs.conditions') },
  ];
  
  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={selectedQuestion 
        ? t('admin.interviewFlow.editQuestion')
        : t('admin.interviewFlow.addQuestion')
      }
      size="large"
    >
      <form onSubmit={onSubmit}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: activeTab === tab.key ? 'var(--primary)' : 'transparent',
                color: activeTab === tab.key ? 'white' : 'var(--foreground)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Basic Tab */}
        {activeTab === 'basic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormInput
              label={`${t('admin.interviewFlow.fields.translationKey')} *`}
              value={formData.translationKey}
              onChange={(e) => setFormData(prev => ({ ...prev, translationKey: e.target.value }))}
              placeholder="interview.questions.businessName"
              required
            />
            <FormSelect
              label={t('admin.interviewFlow.fields.type')}
              value={formData.questionType}
              onChange={(e) => onTypeChange(e.target.value)}
              options={questionTypes.map(type => ({ value: type, label: getTypeLabel(t, type) }))}
            />
            <FormInput
              label={t('admin.interviewFlow.fields.saveToField')}
              value={formData.saveToField}
              onChange={(e) => setFormData(prev => ({ ...prev, saveToField: e.target.value }))}
              placeholder={t('admin.interviewFlow.fields.saveToFieldPlaceholder')}
            />
            <FormCheckbox
              label={t('admin.common.active')}
              checked={formData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
            />
          </div>
        )}

        {/* Input Config Tab */}
        {activeTab === 'input' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
              {t('admin.interviewFlow.inputConfig.title')} - {getTypeLabel(t, formData.questionType)}
            </h4>
            <InputConfigForm
              questionType={formData.questionType}
              inputConfig={formData.inputConfig}
              setFormData={setFormData}
              botActions={botActions}
            />
          </div>
        )}

        {/* Validation Tab */}
        {activeTab === 'validation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormCheckbox
              label={t('admin.interviewFlow.validation.required')}
              checked={formData.validation.required || false}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                validation: { ...prev.validation, required: e.target.checked }
              }))}
            />
            <FormInput
              label={t('admin.interviewFlow.validation.minLength')}
              type="number"
              value={formData.validation.minLength || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                validation: { ...prev.validation, minLength: e.target.value ? parseInt(e.target.value) : undefined }
              }))}
            />
            <FormInput
              label={t('admin.interviewFlow.validation.maxLength')}
              type="number"
              value={formData.validation.maxLength || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                validation: { ...prev.validation, maxLength: e.target.value ? parseInt(e.target.value) : undefined }
              }))}
            />
            <FormInput
              label={t('admin.interviewFlow.validation.pattern')}
              value={formData.validation.pattern || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                validation: { ...prev.validation, pattern: e.target.value || undefined }
              }))}
              placeholder={t('admin.interviewFlow.validation.patternPlaceholder')}
            />
            <FormInput
              label={t('admin.interviewFlow.validation.errorMessage')}
              value={formData.validation.errorMessage || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                validation: { ...prev.validation, errorMessage: e.target.value || undefined }
              }))}
            />
          </div>
        )}

        {/* AI Config Tab */}
        {activeTab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormTextarea
              label={t('admin.interviewFlow.fields.aiPromptHint')}
              value={formData.aiPromptHint}
              onChange={(e) => setFormData(prev => ({ ...prev, aiPromptHint: e.target.value }))}
              rows={3}
              placeholder={t('admin.interviewFlow.fields.aiPromptHintHelp')}
            />
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
                {t('admin.interviewFlow.aiConfig.allowedActions')}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {botActions.map(action => (
                  <label
                    key={action.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      background: formData.allowedActions.includes(action.name) ? 'var(--primary)' : 'var(--muted)',
                      color: formData.allowedActions.includes(action.name) ? 'white' : 'var(--foreground)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.allowedActions.includes(action.name)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData(prev => ({
                            ...prev,
                            allowedActions: [...prev.allowedActions, action.name]
                          }));
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            allowedActions: prev.allowedActions.filter(a => a !== action.name)
                          }));
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                    <Bot size={14} />
                    {action.name}
                  </label>
                ))}
              </div>
              {botActions.length === 0 && (
                <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', marginTop: '8px' }}>
                  {t('admin.interviewFlow.aiConfig.noActionsAvailable')}
                </p>
              )}
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
                {t('admin.interviewFlow.aiConfig.autoActions')} ({t('admin.interviewFlow.aiConfig.autoActionsHelp')})
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {botActions.map(action => (
                  <label
                    key={action.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      background: formData.autoActions.includes(action.name) ? 'var(--warning)' : 'var(--muted)',
                      color: formData.autoActions.includes(action.name) ? 'var(--warning-foreground)' : 'var(--foreground)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.autoActions.includes(action.name)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData(prev => ({
                            ...prev,
                            autoActions: [...prev.autoActions, action.name]
                          }));
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            autoActions: prev.autoActions.filter(a => a !== action.name)
                          }));
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                    <Zap size={14} />
                    {action.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Conditions Tab */}
        {activeTab === 'conditions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormInput
              label={t('admin.interviewFlow.conditions.dependsOn')}
              value={formData.dependsOn}
              onChange={(e) => setFormData(prev => ({ ...prev, dependsOn: e.target.value }))}
              placeholder={t('admin.interviewFlow.conditions.dependsOnPlaceholder')}
            />
            <FormTextarea
              label={t('admin.interviewFlow.conditions.showCondition')}
              value={formData.showCondition}
              onChange={(e) => setFormData(prev => ({ ...prev, showCondition: e.target.value }))}
              rows={4}
              placeholder={t('admin.interviewFlow.conditions.showConditionPlaceholder')}
            />
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem', margin: 0 }}>
              {t('admin.interviewFlow.conditions.showConditionHelp')}
            </p>
          </div>
        )}

        <FormActions>
          <SecondaryButton type="button" onClick={onClose}>
            {t('admin.common.cancel')}
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <RefreshCw size={16} className={styles.spinning} />
            ) : (
              <Save size={16} />
            )}
            {selectedQuestion 
              ? t('admin.common.save') 
              : t('admin.common.create')
            }
          </PrimaryButton>
        </FormActions>
      </form>
    </AdminModal>
  );
}
