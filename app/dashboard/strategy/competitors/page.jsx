import { getTranslations } from '@/i18n/server';
import { CompetitorsPageContent } from './components';

export default async function CompetitorAnalysisPage() {
  const t = await getTranslations();
  
  // Pre-translate all strings needed by client components
  const translations = {
    // Page header
    title: t('competitorAnalysis.title'),
    subtitle: t('competitorAnalysis.subtitle'),
    
    // Actions
    findWithAI: t('competitorAnalysis.findWithAI'),
    addCompetitor: t('competitorAnalysis.addCompetitor'),
    addFirstCompetitor: t('competitorAnalysis.addFirstCompetitor'),
    
    // Stats
    trackedCompetitors: t('competitorAnalysis.trackedCompetitors'),
    sharedKeywords: t('competitorAnalysis.sharedKeywords'),
    contentGaps: t('competitorAnalysis.contentGaps'),
    
    // Empty state
    selectSite: t('competitorAnalysis.selectSite'),
    noCompetitors: t('competitorAnalysis.noCompetitors'),
    noCompetitorsDescription: t('competitorAnalysis.noCompetitorsDescription'),
    
    // Card/Table
    scanning: t('competitorAnalysis.scanning'),
    lastScanned: t('competitorAnalysis.lastScanned'),
    scanError: t('competitorAnalysis.scanError'),
    pending: t('competitorAnalysis.pending'),
    words: t('competitorAnalysis.words'),
    images: t('competitorAnalysis.images'),
    ms: t('competitorAnalysis.ms'),
    rescan: t('competitorAnalysis.rescan'),
    remove: t('competitorAnalysis.remove'),
    
    // Table headers
    competitor: t('competitorAnalysis.competitor'),
    status: t('competitorAnalysis.status'),
    wordCount: t('competitorAnalysis.wordCount'),
    speed: t('competitorAnalysis.speed'),
    actions: t('competitorAnalysis.actions'),
    
    // Discovery
    discoverTitle: t('competitorAnalysis.discoverTitle'),
    discoverDescription: t('competitorAnalysis.discoverDescription'),
    discovering: t('competitorAnalysis.discovering'),
    foundCompetitors: t('competitorAnalysis.foundCompetitors'),
    addSelected: t('competitorAnalysis.addSelected'),
    cancel: t('common.cancel'),
    
    // Add form
    addTitle: t('competitorAnalysis.addTitle'),
    urlPlaceholder: t('competitorAnalysis.urlPlaceholder'),
    add: t('common.add'),
    adding: t('competitorAnalysis.adding'),
    limitReached: t('competitorAnalysis.limitReached'),
    enterUrl: t('competitorAnalysis.enterUrl'),
    remaining: t('competitorAnalysis.remaining'),
    addUrl: t('competitorAnalysis.addUrl'),
    
    // Comparison
    comparison: t('competitorAnalysis.comparison'),
    compareWithUrl: t('competitorAnalysis.compareWithUrl'),
    enterYourUrl: t('competitorAnalysis.enterYourUrl'),
    compare: t('competitorAnalysis.compare'),
    comparing: t('competitorAnalysis.comparing'),
    
    // View toggle
    listView: t('competitorAnalysis.listView'),
    tableView: t('competitorAnalysis.tableView'),
    
    // Discovery confirm
    discoverConfirmTitle: t('competitorAnalysis.discoverConfirmTitle'),
    discoverConfirmDescription: t('competitorAnalysis.discoverConfirmDescription'),
    discoverConfirmWarning: t('competitorAnalysis.discoverConfirmWarning'),
    discoverWithAI: t('competitorAnalysis.discoverWithAI'),
  };

  return <CompetitorsPageContent translations={translations} />;
}
