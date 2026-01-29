'use client';

import { useState } from 'react';
import { 
  Sparkles, 
  Target, 
  Calendar, 
  FileText, 
  Image as ImageIcon, 
  Settings as SettingsIcon,
  Check,
  ArrowLeft,
  ArrowRight,
  Zap
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../page.module.css';

const iconMap = {
  Target,
  SettingsIcon,
  Calendar,
  Sparkles,
};

export function WizardContent({ translations, steps, contentTypes, toneOptions, lengthOptions }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    topic: '',
    keywords: '',
    contentType: 'blog-post',
    tone: 'professional',
    length: 'medium',
    targetAudience: '',
    publishDate: '',
    includeImages: true,
    seoOptimize: true,
    autoPublish: false,
  });

  const { isRtl } = useLocale();
  const PrevArrow = isRtl ? ArrowRight : ArrowLeft;
  const NextArrow = isRtl ? ArrowLeft : ArrowRight;

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    console.log('Submitting wizard:', formData);
  };

  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      {/* Progress Steps */}
      <div className={styles.progressCard}>
        <div className={styles.stepsWrapper}>
          {steps.map((step, index) => {
            const StepIcon = iconMap[step.iconName];
            return (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div className={styles.stepItem}>
                  <div className={`${styles.stepCircle} ${
                    currentStep === step.id ? styles.active :
                    currentStep > step.id ? styles.completed : styles.pending
                  }`}>
                    {currentStep > step.id ? (
                      <Check className={styles.stepIcon} />
                    ) : (
                      <StepIcon className={styles.stepIcon} />
                    )}
                  </div>
                  <span className={`${styles.stepName} ${
                    currentStep >= step.id ? styles.active : ''
                  }`}>
                    {step.name}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`${styles.stepConnector} ${
                    currentStep > step.id ? styles.completed : ''
                  }`}></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className={styles.contentCard}>
        {/* Step 1: Topic & Keywords */}
        {currentStep === 1 && (
          <>
            <div className={styles.stepHeader}>
              <div className={styles.stepIconWrapper}>
                <Target className={styles.stepHeaderIcon} />
              </div>
              <div className={styles.stepInfo}>
                <h2 className={styles.stepTitle}>{translations.step1Title}</h2>
                <p className={styles.stepDescription}>{translations.step1Description}</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{translations.topicLabel}</label>
              <input
                type="text"
                className={styles.formInput}
                value={formData.topic}
                onChange={(e) => updateFormData('topic', e.target.value)}
                placeholder={translations.topicPlaceholder}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{translations.keywordsLabel}</label>
              <textarea
                className={styles.formTextarea}
                value={formData.keywords}
                onChange={(e) => updateFormData('keywords', e.target.value)}
                placeholder={translations.keywordsPlaceholder}
              />
              <p className={styles.formHint}>{translations.keywordsHint}</p>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{translations.audienceLabel}</label>
              <input
                type="text"
                className={styles.formInput}
                value={formData.targetAudience}
                onChange={(e) => updateFormData('targetAudience', e.target.value)}
                placeholder={translations.audiencePlaceholder}
              />
            </div>
          </>
        )}

        {/* Step 2: Content Settings */}
        {currentStep === 2 && (
          <>
            <div className={styles.stepHeader}>
              <div className={styles.stepIconWrapper}>
                <SettingsIcon className={styles.stepHeaderIcon} />
              </div>
              <div className={styles.stepInfo}>
                <h2 className={styles.stepTitle}>{translations.step2Title}</h2>
                <p className={styles.stepDescription}>{translations.step2Description}</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{translations.contentTypeLabel}</label>
              <div className={styles.contentTypeGrid}>
                {contentTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => updateFormData('contentType', type.id)}
                    className={`${styles.contentTypeButton} ${
                      formData.contentType === type.id ? styles.selected : ''
                    }`}
                  >
                    <div className={styles.contentTypeHeader}>
                      <FileText className={styles.contentTypeIcon} />
                      <span className={styles.contentTypeName}>{type.name}</span>
                    </div>
                    <p className={styles.contentTypeDesc}>{type.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{translations.toneLabel}</label>
              <div className={styles.toneOptions}>
                {toneOptions.map((tone) => (
                  <button
                    key={tone.id}
                    onClick={() => updateFormData('tone', tone.id)}
                    className={`${styles.toneButton} ${
                      formData.tone === tone.id ? styles.selected : ''
                    }`}
                  >
                    {tone.name}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{translations.lengthLabel}</label>
              <div className={styles.lengthOptions}>
                {lengthOptions.map((length) => (
                  <button
                    key={length.id}
                    onClick={() => updateFormData('length', length.id)}
                    className={`${styles.lengthButton} ${
                      formData.length === length.id ? styles.selected : ''
                    }`}
                  >
                    <div className={styles.lengthName}>{length.name}</div>
                    <div className={styles.lengthWords}>{length.words}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Step 3: Scheduling */}
        {currentStep === 3 && (
          <>
            <div className={styles.stepHeader}>
              <div className={styles.stepIconWrapper}>
                <Calendar className={styles.stepHeaderIcon} />
              </div>
              <div className={styles.stepInfo}>
                <h2 className={styles.stepTitle}>{translations.step3Title}</h2>
                <p className={styles.stepDescription}>{translations.step3Description}</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{translations.publishDateLabel}</label>
              <input
                type="datetime-local"
                className={styles.formInput}
                value={formData.publishDate}
                onChange={(e) => updateFormData('publishDate', e.target.value)}
              />
              <p className={styles.formHint}>{translations.publishDateHint}</p>
            </div>

            <div className={styles.optionsSection}>
              <div className={styles.optionRow}>
                <div className={styles.optionInfo}>
                  <ImageIcon className={styles.optionIcon} />
                  <div className={styles.optionContent}>
                    <span className={styles.optionLabel}>{translations.aiImagesLabel}</span>
                    <span className={styles.optionDescription}>{translations.aiImagesDesc}</span>
                  </div>
                </div>
                <button
                  className={`${styles.toggleSwitch} ${formData.includeImages ? styles.active : ''}`}
                  onClick={() => updateFormData('includeImages', !formData.includeImages)}
                >
                  <div className={styles.toggleKnob}></div>
                </button>
              </div>

              <div className={styles.optionRow}>
                <div className={styles.optionInfo}>
                  <Zap className={styles.optionIcon} />
                  <div className={styles.optionContent}>
                    <span className={styles.optionLabel}>{translations.seoLabel}</span>
                    <span className={styles.optionDescription}>{translations.seoDesc}</span>
                  </div>
                </div>
                <button
                  className={`${styles.toggleSwitch} ${formData.seoOptimize ? styles.active : ''}`}
                  onClick={() => updateFormData('seoOptimize', !formData.seoOptimize)}
                >
                  <div className={styles.toggleKnob}></div>
                </button>
              </div>

              <div className={styles.optionRow}>
                <div className={styles.optionInfo}>
                  <Sparkles className={styles.optionIcon} />
                  <div className={styles.optionContent}>
                    <span className={styles.optionLabel}>{translations.autoPublishLabel}</span>
                    <span className={styles.optionDescription}>{translations.autoPublishDesc}</span>
                  </div>
                </div>
                <button
                  className={`${styles.toggleSwitch} ${formData.autoPublish ? styles.active : ''}`}
                  onClick={() => updateFormData('autoPublish', !formData.autoPublish)}
                >
                  <div className={styles.toggleKnob}></div>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 4: Review & Launch */}
        {currentStep === 4 && (
          <>
            <div className={styles.stepHeader}>
              <div className={`${styles.stepIconWrapper} ${styles.launch}`}>
                <Sparkles className={styles.stepHeaderIcon} style={{ color: 'white' }} />
              </div>
              <div className={styles.stepInfo}>
                <h2 className={styles.stepTitle}>{translations.step4Title}</h2>
                <p className={styles.stepDescription}>{translations.step4Description}</p>
              </div>
            </div>

            <div className={styles.summaryGrid}>
              <div className={`${styles.summaryCard} ${styles.topic}`}>
                <h3 className={styles.summaryTitle}>{translations.contentDetails}</h3>
                <p className={styles.summaryItem}><strong>{translations.summaryTopicLabel}</strong> {formData.topic || translations.notSpecified}</p>
                <p className={styles.summaryItem}><strong>{translations.summaryKeywordsLabel}</strong> {formData.keywords || translations.notSpecified}</p>
                <p className={styles.summaryItem}><strong>{translations.summaryAudienceLabel}</strong> {formData.targetAudience || translations.notSpecified}</p>
              </div>

              <div className={`${styles.summaryCard} ${styles.settings}`}>
                <h3 className={styles.summaryTitle}>{translations.writingStyle}</h3>
                <p className={styles.summaryItem}><strong>{translations.summaryTypeLabel}</strong> {contentTypes.find(ct => ct.id === formData.contentType)?.name}</p>
                <p className={styles.summaryItem}><strong>{translations.summaryToneLabel}</strong> {toneOptions.find(to => to.id === formData.tone)?.name}</p>
                <p className={styles.summaryItem}><strong>{translations.summaryLengthLabel}</strong> {lengthOptions.find(l => l.id === formData.length)?.name}</p>
              </div>

              <div className={`${styles.summaryCard} ${styles.publish}`}>
                <h3 className={styles.summaryTitle}>{translations.publishingOptions}</h3>
                <p className={styles.summaryItem}><strong>{translations.summaryPublishDateLabel}</strong> {formData.publishDate || translations.saveAsDraft}</p>
                <div className={styles.summaryOptions}>
                  <span>{formData.includeImages ? '✅' : '❌'} {translations.summaryAiImages}</span>
                  <span>{formData.seoOptimize ? '✅' : '❌'} {translations.summarySeoOptimization}</span>
                  <span>{formData.autoPublish ? '✅' : '❌'} {translations.summaryAutoPublish}</span>
                </div>
              </div>
            </div>

            <button onClick={handleSubmit} className={styles.launchButton}>
              <div className={styles.launchButtonBg}></div>
              <div className={styles.launchButtonGlow}></div>
              <div className={styles.launchButtonContent}>
                <Sparkles className={styles.launchIcon} />
                <span>{translations.generateContent}</span>
              </div>
            </button>
          </>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className={styles.navigationButtons}>
        <button
          onClick={handlePrevious}
          disabled={currentStep === 1}
          className={`${styles.navButton} ${styles.prev}`}
        >
          <PrevArrow className={styles.navIcon} />
          {translations.previous}
        </button>

        {currentStep < steps.length && (
          <button onClick={handleNext} className={`${styles.navButton} ${styles.next}`}>
            {translations.next}
            <NextArrow className={styles.navIcon} />
          </button>
        )}
      </div>
    </>
  );
}
