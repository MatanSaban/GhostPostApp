import { WizardContent } from './components';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

export default async function AIContentWizardPage() {
  const t = await getTranslations();

  const steps = [
    { id: 1, name: t('aiWizard.steps.topic'), iconName: 'Target' },
    { id: 2, name: t('aiWizard.steps.preferences'), iconName: 'SettingsIcon' },
    { id: 3, name: t('aiWizard.steps.scheduling'), iconName: 'Calendar' },
    { id: 4, name: t('aiWizard.steps.review'), iconName: 'Sparkles' },
  ];

  const contentTypes = [
    { id: 'blog-post', name: t('aiWizard.contentTypes.blogPost'), description: t('aiWizard.contentTypes.blogPostDesc') },
    { id: 'product-page', name: t('aiWizard.contentTypes.productPage'), description: t('aiWizard.contentTypes.productPageDesc') },
    { id: 'landing-page', name: t('aiWizard.contentTypes.landingPage'), description: t('aiWizard.contentTypes.landingPageDesc') },
    { id: 'social-media', name: t('aiWizard.contentTypes.socialMedia'), description: t('aiWizard.contentTypes.socialMediaDesc') },
  ];

  const toneOptions = [
    { id: 'professional', name: t('aiWizard.tones.professional') },
    { id: 'casual', name: t('aiWizard.tones.casual') },
    { id: 'friendly', name: t('aiWizard.tones.friendly') },
    { id: 'authoritative', name: t('aiWizard.tones.authoritative') },
    { id: 'conversational', name: t('aiWizard.tones.conversational') },
  ];

  const lengthOptions = [
    { id: 'short', name: t('aiWizard.lengths.short'), words: t('aiWizard.lengths.shortWords') },
    { id: 'medium', name: t('aiWizard.lengths.medium'), words: t('aiWizard.lengths.mediumWords') },
    { id: 'long', name: t('aiWizard.lengths.long'), words: t('aiWizard.lengths.longWords') },
  ];

  const translations = {
    // Step 1
    step1Title: t('aiWizard.step1.title'),
    step1Description: t('aiWizard.step1.description'),
    topicLabel: t('aiWizard.step1.topicLabel'),
    topicPlaceholder: t('aiWizard.step1.topicPlaceholder'),
    keywordsLabel: t('aiWizard.step1.keywordsLabel'),
    keywordsPlaceholder: t('aiWizard.step1.keywordsPlaceholder'),
    keywordsHint: t('aiWizard.step1.keywordsHint'),
    audienceLabel: t('aiWizard.step1.audienceLabel'),
    audiencePlaceholder: t('aiWizard.step1.audiencePlaceholder'),
    // Step 2
    step2Title: t('aiWizard.step2.title'),
    step2Description: t('aiWizard.step2.description'),
    contentTypeLabel: t('aiWizard.step2.contentTypeLabel'),
    toneLabel: t('aiWizard.step2.toneLabel'),
    lengthLabel: t('aiWizard.step2.lengthLabel'),
    // Step 3
    step3Title: t('aiWizard.step3.title'),
    step3Description: t('aiWizard.step3.description'),
    publishDateLabel: t('aiWizard.step3.publishDateLabel'),
    publishDateHint: t('aiWizard.step3.publishDateHint'),
    aiImagesLabel: t('aiWizard.step3.aiImagesLabel'),
    aiImagesDesc: t('aiWizard.step3.aiImagesDesc'),
    seoLabel: t('aiWizard.step3.seoLabel'),
    seoDesc: t('aiWizard.step3.seoDesc'),
    autoPublishLabel: t('aiWizard.step3.autoPublishLabel'),
    autoPublishDesc: t('aiWizard.step3.autoPublishDesc'),
    // Step 4
    step4Title: t('aiWizard.step4.title'),
    step4Description: t('aiWizard.step4.description'),
    contentDetails: t('aiWizard.step4.contentDetails'),
    summaryTopicLabel: t('aiWizard.step4.topicLabel'),
    summaryKeywordsLabel: t('aiWizard.step4.keywordsLabel'),
    summaryAudienceLabel: t('aiWizard.step4.audienceLabel'),
    notSpecified: t('aiWizard.step4.notSpecified'),
    writingStyle: t('aiWizard.step4.writingStyle'),
    summaryTypeLabel: t('aiWizard.step4.typeLabel'),
    summaryToneLabel: t('aiWizard.step4.toneLabel'),
    summaryLengthLabel: t('aiWizard.step4.lengthLabel'),
    publishingOptions: t('aiWizard.step4.publishingOptions'),
    summaryPublishDateLabel: t('aiWizard.step4.publishDateLabel'),
    saveAsDraft: t('aiWizard.step4.saveAsDraft'),
    summaryAiImages: t('aiWizard.step4.aiImages'),
    summarySeoOptimization: t('aiWizard.step4.seoOptimization'),
    summaryAutoPublish: t('aiWizard.step4.autoPublish'),
    generateContent: t('aiWizard.generateContent'),
    // Navigation
    previous: t('common.previous'),
    next: t('common.next'),
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('aiWizard.title')}</h1>
          <p className={styles.pageSubtitle}>{t('aiWizard.subtitle')}</p>
        </div>
      </div>

      <WizardContent 
        translations={translations}
        steps={steps}
        contentTypes={contentTypes}
        toneOptions={toneOptions}
        lengthOptions={lengthOptions}
      />
    </div>
  );
}
