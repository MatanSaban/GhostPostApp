'use client';

import { useLocale } from '@/app/context/locale-context';
import { FormInput, FormTextarea, FormSelect, FormCheckbox } from '../../components/AdminModal';

export default function InputConfigForm({ questionType, inputConfig, setFormData, botActions }) {
  const { t } = useLocale();
  const config = inputConfig;
  
  const updateConfig = (updates) => {
    setFormData(prev => ({
      ...prev,
      inputConfig: { ...prev.inputConfig, ...updates }
    }));
  };
  
  switch (questionType) {
    case 'GREETING':
      return (
        <FormTextarea
          label={t('admin.interviewFlow.inputConfig.message')}
          value={config.message || ''}
          onChange={(e) => updateConfig({ message: e.target.value })}
          rows={3}
        />
      );

    case 'INPUT':
      return (
        <>
          <FormSelect
            label={t('admin.interviewFlow.inputConfig.inputType')}
            value={config.inputType || 'text'}
            onChange={(e) => updateConfig({ inputType: e.target.value })}
            options={[
              { value: 'text', label: t('admin.interviewFlow.inputConfig.inputTypes.text') },
              { value: 'email', label: t('admin.interviewFlow.inputConfig.inputTypes.email') },
              { value: 'tel', label: t('admin.interviewFlow.inputConfig.inputTypes.tel') },
              { value: 'url', label: t('admin.interviewFlow.inputConfig.inputTypes.url') },
              { value: 'number', label: t('admin.interviewFlow.inputConfig.inputTypes.number') },
              { value: 'textarea', label: t('admin.interviewFlow.inputConfig.inputTypes.textarea') },
            ]}
          />
          <FormInput
            label={t('admin.interviewFlow.inputConfig.placeholder')}
            value={config.placeholder || ''}
            onChange={(e) => updateConfig({ placeholder: e.target.value })}
          />
          <FormInput
            label={t('admin.interviewFlow.validation.maxLength')}
            type="number"
            value={config.maxLength || ''}
            onChange={(e) => updateConfig({ maxLength: e.target.value ? parseInt(e.target.value) : null })}
          />
        </>
      );

    case 'CONFIRMATION':
      return (
        <>
          <FormInput
            label={t('admin.interviewFlow.inputConfig.confirmLabel')}
            value={config.confirmLabel || 'Yes'}
            onChange={(e) => updateConfig({ confirmLabel: e.target.value })}
          />
          <FormInput
            label={t('admin.interviewFlow.inputConfig.denyLabel')}
            value={config.denyLabel || 'No'}
            onChange={(e) => updateConfig({ denyLabel: e.target.value })}
          />
        </>
      );

    case 'SELECTION':
    case 'MULTI_SELECTION':
      return (
        <>
          <FormTextarea
            label={`${t('admin.interviewFlow.inputConfig.options')} (${t('admin.interviewFlow.inputConfig.optionsHelp')})`}
            value={(config.options || []).join('\n')}
            onChange={(e) => updateConfig({ 
              options: e.target.value.split('\n').filter(o => o.trim())
            })}
            rows={5}
            placeholder={t('admin.interviewFlow.inputConfig.optionsPlaceholder')}
          />
          {questionType === 'MULTI_SELECTION' && (
            <>
              <FormInput
                label={t('admin.interviewFlow.inputConfig.minSelections')}
                type="number"
                value={config.minSelect || 1}
                onChange={(e) => updateConfig({ minSelect: parseInt(e.target.value) || 1 })}
              />
              <FormInput
                label={t('admin.interviewFlow.inputConfig.maxSelections')}
                type="number"
                value={config.maxSelect || ''}
                onChange={(e) => updateConfig({ maxSelect: e.target.value ? parseInt(e.target.value) : null })}
              />
            </>
          )}
        </>
      );

    case 'DYNAMIC':
      return (
        <>
          <FormSelect
            label={t('admin.interviewFlow.inputConfig.sourceAction')}
            value={config.sourceAction || ''}
            onChange={(e) => updateConfig({ sourceAction: e.target.value })}
            options={[
              { value: '', label: t('admin.interviewFlow.inputConfig.selectAction') },
              ...botActions.map(a => ({ value: a.name, label: a.name }))
            ]}
          />
          <FormTextarea
            label={t('admin.interviewFlow.inputConfig.displayTemplate')}
            value={config.template || ''}
            onChange={(e) => updateConfig({ template: e.target.value })}
            rows={3}
            placeholder={t('admin.interviewFlow.inputConfig.templateHelp')}
          />
        </>
      );

    case 'FILE_UPLOAD':
      return (
        <>
          <FormInput
            label={t('admin.interviewFlow.inputConfig.accept')}
            value={config.accept || '*/*'}
            onChange={(e) => updateConfig({ accept: e.target.value })}
            placeholder="image/*,application/pdf"
          />
          <FormInput
            label={t('admin.interviewFlow.inputConfig.maxSize')}
            type="number"
            value={config.maxSize || 5242880}
            onChange={(e) => updateConfig({ maxSize: parseInt(e.target.value) })}
          />
          <FormCheckbox
            label={t('admin.interviewFlow.inputConfig.multiple')}
            checked={config.multiple || false}
            onChange={(e) => updateConfig({ multiple: e.target.checked })}
          />
        </>
      );

    case 'SLIDER':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <FormInput
            label={t('admin.interviewFlow.inputConfig.min')}
            type="number"
            value={config.min ?? 0}
            onChange={(e) => updateConfig({ min: parseInt(e.target.value) })}
          />
          <FormInput
            label={t('admin.interviewFlow.inputConfig.max')}
            type="number"
            value={config.max ?? 100}
            onChange={(e) => updateConfig({ max: parseInt(e.target.value) })}
          />
          <FormInput
            label={t('admin.interviewFlow.inputConfig.step')}
            type="number"
            value={config.step ?? 1}
            onChange={(e) => updateConfig({ step: parseInt(e.target.value) })}
          />
        </div>
      );

    case 'AI_SUGGESTION':
      return (
        <>
          <FormInput
            label={t('admin.interviewFlow.inputConfig.suggestionType')}
            value={config.suggestionType || ''}
            onChange={(e) => updateConfig({ suggestionType: e.target.value })}
            placeholder={t('admin.interviewFlow.inputConfig.suggestionTypePlaceholder')}
          />
          <FormCheckbox
            label={t('admin.interviewFlow.inputConfig.allowCustom')}
            checked={config.allowCustom !== false}
            onChange={(e) => updateConfig({ allowCustom: e.target.checked })}
          />
        </>
      );

    case 'EDITABLE_DATA':
      return (
        <>
          <FormTextarea
            label={t('admin.interviewFlow.inputConfig.fieldsJson')}
            value={JSON.stringify(config.fields || [], null, 2)}
            onChange={(e) => {
              try {
                const fields = JSON.parse(e.target.value);
                updateConfig({ fields });
              } catch (err) {
                // Invalid JSON, ignore
              }
            }}
            rows={5}
            placeholder={t('admin.interviewFlow.inputConfig.fieldsPlaceholder')}
          />
          <FormCheckbox
            label={t('admin.interviewFlow.inputConfig.allowAddItems')}
            checked={config.allowAdd || false}
            onChange={(e) => updateConfig({ allowAdd: e.target.checked })}
          />
          <FormCheckbox
            label={t('admin.interviewFlow.inputConfig.allowRemoveItems')}
            checked={config.allowRemove || false}
            onChange={(e) => updateConfig({ allowRemove: e.target.checked })}
          />
        </>
      );

    default:
      return null;
  }
}
