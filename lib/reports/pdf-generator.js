/**
 * White-Label PDF Report Generator
 * 
 * Uses @react-pdf/renderer to generate professional SEO performance reports
 * that agencies can send to their clients with custom branding.
 * 
 * Required: npm install @react-pdf/renderer
 */

import React from 'react';
import path from 'path';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  StyleSheet,
  renderToBuffer,
  Font,
} from '@react-pdf/renderer';
import { languageNamesFromCodes } from '@/lib/reports/language-names';

// Register Polin font for Hebrew and English support
// Using local font files from public/fonts/polin/
const fontPath = path.join(process.cwd(), 'public', 'fonts', 'polin');

Font.register({
  family: 'Polin',
  fonts: [
    {
      src: path.join(fontPath, 'Polin-Regular.ttf'),
      fontWeight: 400,
    },
    {
      src: path.join(fontPath, 'Polin-Semibold.ttf'),
      fontWeight: 600,
    },
    {
      src: path.join(fontPath, 'Polin-Extrabold.ttf'),
      fontWeight: 700,
    },
  ],
});

// Disable hyphenation for proper Hebrew text handling
Font.registerHyphenationCallback(word => [word]);

// Use Polin font - supports both English and Hebrew
const FONT_FAMILY = 'Polin';

/**
 * Utility to lighten/darken a hex color
 */
function adjustColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

/**
 * Create dynamic styles based on agency branding and locale
 */
function createStyles(primaryColor = '#7b2cbf', isRTL = false) {
  const lightBg = adjustColor(primaryColor, 85);
  const textAlign = isRTL ? 'right' : 'left';
  const flexDirection = isRTL ? 'row-reverse' : 'row';
  
  return StyleSheet.create({
    page: {
      fontFamily: FONT_FAMILY,
      fontSize: 10,
      paddingTop: 40,
      paddingBottom: 80,
      paddingHorizontal: 40,
      backgroundColor: '#ffffff',
      color: '#1a1a2e',
      direction: isRTL ? 'rtl' : 'ltr',
    },
    // Header
    header: {
      flexDirection: flexDirection,
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
      paddingBottom: 15,
      borderBottomWidth: 2,
      borderBottomColor: primaryColor,
    },
    headerLeft: {
      flexDirection: 'column',
      alignItems: isRTL ? 'flex-end' : 'flex-start',
    },
    logo: {
      // Match the site logo block (40×40) so the agency mark and the
      // client mark read as a balanced pair rather than one dominating.
      width: 40,
      height: 40,
      objectFit: 'contain',
      marginBottom: 6,
    },
    agencyName: {
      fontSize: 14,
      fontWeight: 700,
      color: primaryColor,
      textAlign: isRTL ? 'right' : 'left',
    },
    // Contact lines under the agency name. Always LTR so URLs and
    // phone numbers stay readable inside Hebrew documents.
    agencyContact: {
      fontSize: 8,
      color: '#6b7280',
      marginTop: 1,
      textAlign: isRTL ? 'right' : 'left',
      direction: 'ltr',
    },
    headerRight: {
      textAlign: isRTL ? 'left' : 'right',
      alignItems: isRTL ? 'flex-start' : 'flex-end',
    },
    reportTitle: {
      fontSize: 16,
      fontWeight: 700,
      color: primaryColor,
      marginBottom: 4,
      textAlign: isRTL ? 'left' : 'right',
    },
    reportDate: {
      fontSize: 10,
      color: '#666666',
      textAlign: isRTL ? 'left' : 'right',
    },
    comparisonPill: {
      marginTop: 4,
      paddingVertical: 2,
      paddingHorizontal: 8,
      backgroundColor: lightBg,
      borderRadius: 999,
      fontSize: 9,
      color: primaryColor,
      alignSelf: isRTL ? 'flex-start' : 'flex-end',
    },
    // Sections
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: 700,
      color: primaryColor,
      marginBottom: 12,
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: '#e0e0e0',
      textAlign: textAlign,
    },
    // Site Info
    siteInfo: {
      marginBottom: 20,
    },
    siteName: {
      fontSize: 12,
      fontWeight: 600,
      marginBottom: 2,
      textAlign: textAlign,
    },
    siteUrl: {
      fontSize: 9,
      color: '#6b7280',
      textAlign: textAlign,
    },
    // Executive Summary Box
    summaryBox: {
      backgroundColor: lightBg,
      borderRadius: 8,
      padding: 16,
      ...(isRTL ? {
        borderRightWidth: 4,
        borderRightColor: primaryColor,
      } : {
        borderLeftWidth: 4,
        borderLeftColor: primaryColor,
      }),
    },
    summaryText: {
      fontSize: 11,
      lineHeight: 1.6,
      color: '#333333',
      textAlign: textAlign,
    },
    // Score Display
    scoreContainer: {
      flexDirection: flexDirection,
      alignItems: 'center',
      marginBottom: 16,
    },
    scoreCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: primaryColor,
      justifyContent: 'center',
      alignItems: 'center',
      ...(isRTL ? { marginLeft: 20 } : { marginRight: 20 }),
    },
    scoreValue: {
      fontSize: 28,
      fontWeight: 700,
      color: '#ffffff',
    },
    scoreLabel: {
      fontSize: 8,
      color: '#ffffff',
      opacity: 0.9,
    },
    scoreDetails: {
      flex: 1,
      alignItems: isRTL ? 'flex-end' : 'flex-start',
    },
    previousScoreText: {
      fontSize: 9,
      color: '#6b7280',
      textAlign: textAlign,
    },
    deltaBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 12,
      marginBottom: 8,
    },
    deltaBadgePositive: {
      backgroundColor: '#dcfce7',
    },
    deltaBadgeNegative: {
      backgroundColor: '#fee2e2',
    },
    deltaBadgeNeutral: {
      backgroundColor: '#f3f4f6',
    },
    deltaText: {
      fontSize: 12,
      fontWeight: 600,
    },
    deltaTextPositive: {
      color: '#16a34a',
    },
    deltaTextNegative: {
      color: '#dc2626',
    },
    deltaTextNeutral: {
      color: '#6b7280',
    },
    // Category Grid
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 12,
    },
    categoryCard: {
      width: '48%',
      backgroundColor: '#f9fafb',
      borderRadius: 6,
      padding: 12,
      borderWidth: 1,
      borderColor: '#e5e7eb',
    },
    categoryName: {
      fontSize: 9,
      color: '#6b7280',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      textAlign: textAlign,
    },
    categoryScoreRow: {
      flexDirection: flexDirection,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    categoryScore: {
      fontSize: 18,
      fontWeight: 700,
      color: '#1a1a2e',
    },
    categoryDelta: {
      fontSize: 10,
      fontWeight: 600,
    },
    // Actions Table
    actionsTable: {
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 6,
      overflow: 'hidden',
    },
    actionsHeader: {
      flexDirection: flexDirection,
      backgroundColor: '#f9fafb',
      borderBottomWidth: 1,
      borderBottomColor: '#e5e7eb',
    },
    actionsHeaderCell: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 9,
      fontWeight: 600,
      color: '#6b7280',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      textAlign: textAlign,
    },
    actionsRow: {
      flexDirection: flexDirection,
      borderBottomWidth: 1,
      borderBottomColor: '#f3f4f6',
    },
    actionsRowLast: {
      borderBottomWidth: 0,
    },
    actionsCell: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 10,
      color: '#374151',
      textAlign: textAlign,
    },
    actionsCellDate: {
      width: '20%',
    },
    actionsCellType: {
      width: '25%',
    },
    actionsCellDescription: {
      width: '55%',
    },
    statusBadge: {
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 4,
      backgroundColor: '#dcfce7',
      alignSelf: 'flex-start',
    },
    statusText: {
      fontSize: 8,
      fontWeight: 600,
      color: '#16a34a',
    },
    // Footer
    footer: {
      position: 'absolute',
      bottom: 20,
      left: 40,
      right: 40,
      flexDirection: flexDirection,
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
    },
    footerContent: {
      flexDirection: 'row', // Keep LTR order for mixed text
      alignItems: 'center',
    },
    footerText: {
      fontSize: 8,
      color: '#9ca3af',
    },
    footerLink: {
      fontSize: 8,
      color: '#6366f1',
      textDecoration: 'none',
    },
    pageNumber: {
      fontSize: 8,
      color: '#9ca3af',
    },
    // No Data
    noData: {
      textAlign: 'center',
      color: '#9ca3af',
      paddingVertical: 20,
    },
    // ─ New section styles ─────────────────────────────────────────────
    overviewGrid: {
      flexDirection: flexDirection,
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    overviewTile: {
      width: '48%',
      padding: 14,
      backgroundColor: lightBg,
      borderRadius: 8,
      borderLeftWidth: 3,
      borderLeftColor: primaryColor,
    },
    overviewTileLabel: {
      fontSize: 9,
      color: '#6b7280',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
      textAlign: textAlign,
    },
    overviewTileValue: {
      fontSize: 22,
      fontWeight: 700,
      color: primaryColor,
      textAlign: textAlign,
    },
    keyValueRow: {
      flexDirection: flexDirection,
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: '#f3f4f6',
    },
    keyValueLabel: {
      fontSize: 10,
      color: '#6b7280',
    },
    keyValueValue: {
      fontSize: 10,
      fontWeight: 600,
      color: '#1f2937',
    },
    dataTable: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 6,
      overflow: 'hidden',
    },
    dataTableHeader: {
      flexDirection: flexDirection,
      backgroundColor: '#f9fafb',
      borderBottomWidth: 1,
      borderBottomColor: '#e5e7eb',
    },
    dataTableHeaderCell: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      fontSize: 9,
      fontWeight: 600,
      color: '#6b7280',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      textAlign: textAlign,
    },
    dataTableRow: {
      flexDirection: flexDirection,
      borderBottomWidth: 1,
      borderBottomColor: '#f3f4f6',
    },
    dataTableRowLast: {
      borderBottomWidth: 0,
    },
    dataTableCell: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      fontSize: 10,
      color: '#374151',
      textAlign: textAlign,
    },
    sectionSub: {
      fontSize: 10,
      color: '#6b7280',
      marginBottom: 6,
      textAlign: textAlign,
    },
    chipsRow: {
      flexDirection: flexDirection,
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
    },
    chip: {
      paddingVertical: 3,
      paddingHorizontal: 10,
      backgroundColor: lightBg,
      borderRadius: 999,
      fontSize: 9,
      color: primaryColor,
    },
  });
}

/**
 * Get default PDF translations
 */
export function getDefaultPdfTranslations(locale = 'en') {
  const translations = {
    en: {
      reportTitle: 'SEO Performance Report',
      executiveSummary: 'Executive Summary',
      siteHealthProgression: 'Site Health Progression',
      healthScore: 'Health Score',
      pointsVsLastMonth: 'Points vs Last Month',
      pointsVsPreviousPeriod: 'Points vs {previousPeriod}',
      previousScore: 'Previous score:',
      firstAuditForThisMonth: 'First audit for this month',
      comparingPeriods: '{previousPeriod}  vs  {currentPeriod}',
      periodLabel: 'Period',
      periodVs: 'vs',
      automatedAiWork: 'Automated AI Work Completed',
      date: 'Date',
      actionType: 'Action Type',
      description: 'Description',
      noActionsThisMonth: 'No automated actions were executed this month.',
      moreActions: 'more actions',
      generatedBy: 'Generated by',
      page: 'Page',
      of: 'of',
      defaultAgencyName: 'Your SEO Agency',
      seoOptimizationApplied: 'SEO optimization applied',
      // New sections
      overview: 'Overview',
      overviewKeywords: 'Tracked Keywords',
      overviewCompetitors: 'Tracked Competitors',
      overviewContent: 'Content Pieces',
      overviewActions: 'AI Actions This Month',
      keywordsTitle: 'Keywords Performance',
      keywordsTotal: 'Total tracked',
      keywordsTop: 'Top tracked keywords',
      keywordColumn: 'Keyword',
      positionColumn: 'Position',
      volumeColumn: 'Volume',
      statusColumn: 'Status',
      noKeywords: 'No keywords tracked yet.',
      competitorsTitle: 'Competitors',
      competitorsTotal: 'Total active',
      competitorDomain: 'Competitor',
      competitorName: 'Name',
      noCompetitors: 'No competitors tracked yet.',
      seoTitle: 'SEO Insights',
      seoStrategy: 'Strategy',
      writingStyle: 'Writing style',
      seoBusinessCategory: 'Category',
      seoBusinessAbout: 'About',
      seoCategoryBreakdown: 'Category breakdown',
      seoNoData: 'No SEO insights recorded yet.',
      geoTitle: 'Geographic Performance',
      geoTargetLocations: 'Target locations',
      geoContentLanguage: 'Content language',
      geoNoTargetLocations: 'No target locations configured — defaulting to site domain.',
      geoNoData: 'No geographic targeting configured.',
      auditSectionTitle: 'Site Audit History',
      auditHistoryEmpty: 'No past audits available.',
      auditDate: 'Date',
      auditScore: 'Score',
      auditStatus: 'Status',
      auditStatuses: {
        PENDING: 'Pending',
        RUNNING: 'Running',
        COMPLETED: 'Completed',
        FAILED: 'Failed',
        pending: 'Pending',
        running: 'Running',
        completed: 'Completed',
        failed: 'Failed',
      },
      categories: {
        technical: 'Technical',
        performance: 'Performance',
        visual: 'Visual',
        accessibility: 'Accessibility',
      },
      actionTypes: {
        update_meta: 'Meta Optimization',
        add_internal_link: 'Internal Linking',
        fix_broken_link: 'Link Repair',
        optimize_image: 'Image Optimization',
        fix_heading_structure: 'Heading Structure',
        add_schema_markup: 'Schema Markup',
        improve_content: 'Content Enhancement',
        fix_accessibility: 'Accessibility Fix',
        default: 'SEO Improvement',
      },
    },
    he: {
      reportTitle: 'דוח ביצועים חודשי',
      executiveSummary: 'סיכום מנהלים',
      siteHealthProgression: 'התקדמות בריאות האתר',
      healthScore: 'ציון בריאות',
      pointsVsLastMonth: 'נקודות לעומת החודש שעבר',
      pointsVsPreviousPeriod: 'נקודות לעומת {previousPeriod}',
      previousScore: 'ציון קודם:',
      firstAuditForThisMonth: 'ביקורת ראשונה לחודש זה',
      comparingPeriods: '{previousPeriod}  מול  {currentPeriod}',
      periodLabel: 'תקופה',
      periodVs: 'לעומת',
      automatedAiWork: 'עבודה אוטומטית שהושלמה',
      date: 'תאריך',
      actionType: 'סוג פעולה',
      description: 'תיאור',
      noActionsThisMonth: 'לא בוצעו פעולות אוטומטיות החודש.',
      moreActions: 'פעולות נוספות',
      generatedBy: 'נוצר על ידי',
      page: 'עמוד',
      of: 'מתוך',
      defaultAgencyName: 'סוכנות קידום האתרים שלך',
      seoOptimizationApplied: 'בוצעה אופטימיזציה',
      overview: 'סקירה כללית',
      overviewKeywords: 'מילות מפתח במעקב',
      overviewCompetitors: 'מתחרים במעקב',
      overviewContent: 'פריטי תוכן',
      overviewActions: 'פעולות AI החודש',
      keywordsTitle: 'ביצועי מילות מפתח',
      keywordsTotal: 'סך הכל במעקב',
      keywordsTop: 'מילות מפתח מובילות',
      keywordColumn: 'מילת מפתח',
      positionColumn: 'דירוג',
      volumeColumn: 'נפח חיפוש',
      statusColumn: 'סטטוס',
      noKeywords: 'עדיין לא נוספו מילות מפתח.',
      competitorsTitle: 'מתחרים',
      competitorsTotal: 'סך הכל פעילים',
      competitorDomain: 'מתחרה',
      competitorName: 'שם',
      noCompetitors: 'עדיין לא נוספו מתחרים.',
      seoTitle: 'תובנות SEO',
      seoStrategy: 'אסטרטגיה',
      writingStyle: 'סגנון כתיבה',
      seoBusinessCategory: 'קטגוריה',
      seoBusinessAbout: 'אודות',
      seoCategoryBreakdown: 'פירוט קטגוריות',
      seoNoData: 'אין עדיין נתוני SEO.',
      geoTitle: 'ביצועים גיאוגרפיים',
      geoTargetLocations: 'מיקומים ממוקדים',
      geoContentLanguage: 'שפת תוכן',
      geoNoTargetLocations: 'לא הוגדרו מיקומים ממוקדים — ברירת מחדל לפי דומיין האתר.',
      geoNoData: 'לא הוגדרה התאמה גיאוגרפית.',
      auditSectionTitle: 'היסטוריית בדיקות אתר',
      auditHistoryEmpty: 'אין בדיקות קודמות זמינות.',
      auditDate: 'תאריך',
      auditScore: 'ציון',
      auditStatus: 'סטטוס',
      auditStatuses: {
        PENDING: 'ממתין',
        RUNNING: 'בריצה',
        COMPLETED: 'הושלם',
        FAILED: 'נכשל',
        pending: 'ממתין',
        running: 'בריצה',
        completed: 'הושלם',
        failed: 'נכשל',
      },
      categories: {
        technical: 'טכני',
        performance: 'ביצועים',
        visual: 'ויזואלי',
        accessibility: 'נגישות',
      },
      actionTypes: {
        update_meta: 'אופטימיזציית מטא',
        add_internal_link: 'קישור פנימי',
        fix_broken_link: 'תיקון קישור',
        optimize_image: 'אופטימיזציית תמונה',
        fix_heading_structure: 'מבנה כותרות',
        add_schema_markup: 'סכמה מובנית',
        improve_content: 'שיפור תוכן',
        fix_accessibility: 'תיקון נגישות',
        default: 'שיפור אתר',
      },
    },
  };
  return translations[locale] || translations.en;
}

/**
 * Get readable action type label
 */
function getActionLabel(actionType, t) {
  return t.actionTypes?.[actionType] || t.actionTypes?.default || 'SEO Improvement';
}

/**
 * Format date for display. Hebrew dates render "DD בMMM YYYY" (day first)
 * instead of "MMM DD YYYY", matching how Hebrew readers expect dates.
 */
function formatDate(date, locale = 'en') {
  const d = new Date(date);
  if (locale === 'he') {
    const day = d.getDate();
    const months = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
    return `${day} ב${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Turn an action description that's either (a) a real sentence, (b) a raw
 * i18n key ("agent.insights.xxx.description"), or (c) empty, into something
 * a client can actually read. Keys are converted to the humanized last
 * segment as a fallback so the PDF never shows "agent.foo.bar" to an end user.
 */
function humanizeActionDescription(action, t) {
  const candidate = action?.data?.description || action?.descriptionKey || '';
  if (!candidate) return t.seoOptimizationApplied;
  // Raw i18n key — looks like "a.b.c.description". Pull the second-to-last
  // segment and Title Case it so at worst we get something like
  // "Sitemaps Not Submitted" instead of the raw key.
  if (/^[a-z][a-zA-Z]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(candidate)) {
    const parts = candidate.split('.');
    const tail = parts[parts.length - 1] === 'description' ? parts[parts.length - 2] : parts[parts.length - 1];
    if (!tail) return t.seoOptimizationApplied;
    const spaced = tail.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  return candidate;
}

/**
 * Human-readable language name from a locale code like "he_IL" / "en-US".
 */
function languageNameFromCode(code, locale = 'en') {
  if (!code) return null;
  const normalized = String(code).toLowerCase().replace('_', '-');
  const short = normalized.split('-')[0];
  const names = {
    en: { en: 'English', he: 'אנגלית' },
    he: { en: 'Hebrew', he: 'עברית' },
    ar: { en: 'Arabic', he: 'ערבית' },
    fr: { en: 'French', he: 'צרפתית' },
    es: { en: 'Spanish', he: 'ספרדית' },
    de: { en: 'German', he: 'גרמנית' },
    ru: { en: 'Russian', he: 'רוסית' },
  };
  return names[short]?.[locale] || names[short]?.en || code;
}

/**
 * The main Report Document component
 */
/*
 * Section renderers. Each takes the shared context and returns a <View>
 * block. Keeping them colocated with the Document lets them read styles/t
 * without a bigger API surface. New sections slot in by adding a key here
 * and a case in the render switch below.
 */
function renderOverviewSection({ styles, t, data }) {
  const d = data || {};
  const tiles = [
    { label: t.overviewKeywords, value: d.keywordsCount ?? 0 },
    { label: t.overviewCompetitors, value: d.competitorsCount ?? 0 },
    { label: t.overviewContent, value: d.contentCount ?? 0 },
    { label: t.overviewActions, value: d.executedActionsCount ?? 0 },
  ];
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{t.overview}</Text>
      <View style={styles.overviewGrid}>
        {tiles.map((tile, i) => (
          <View key={i} style={styles.overviewTile}>
            <Text style={styles.overviewTileLabel}>{tile.label}</Text>
            <Text style={styles.overviewTileValue}>{tile.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Format YYYY-MM as a short month label, used as keyword rank column
// header. Mirrors the preview's `shortMonthLabel`.
function shortMonthLabel(key, locale = 'en') {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function renderKeywordsSection({ styles, t, data, locale }) {
  const d = data || {};
  const items = Array.isArray(d.items) ? d.items : [];

  // Period-aware rank columns: when comparing two months, render
  // both side-by-side. Single-month → one column. Falls back to
  // `position` when no period data is attached (live reports).
  const rankCols = [];
  if (d.previousMonthKey) rankCols.push({ key: d.previousMonthKey, label: shortMonthLabel(d.previousMonthKey, locale) });
  if (d.currentMonthKey) rankCols.push({ key: d.currentMonthKey, label: shortMonthLabel(d.currentMonthKey, locale) });
  const useFallback = rankCols.length === 0;
  if (useFallback) {
    rankCols.push({ key: '__current', label: t.positionColumn });
  }

  // Distribute width: keyword 50%, volume 22%, the rest split among
  // rank columns (28% / N).
  const keywordWidth = 50;
  const volumeWidth = 22;
  const rankWidthPct = (100 - keywordWidth - volumeWidth) / rankCols.length;
  const keywordW = `${keywordWidth}%`;
  const volumeW = `${volumeWidth}%`;
  const rankW = `${rankWidthPct}%`;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t.keywordsTitle}</Text>
      <Text style={styles.sectionSub}>{t.keywordsTotal}: {d.total ?? items.length}</Text>
      {items.length === 0 ? (
        <Text style={styles.noData}>{t.noKeywords}</Text>
      ) : (
        <View style={styles.dataTable}>
          <View style={styles.dataTableHeader}>
            <Text style={[styles.dataTableHeaderCell, { width: keywordW }]}>{t.keywordColumn}</Text>
            {rankCols.map((col) => (
              <Text key={col.key} style={[styles.dataTableHeaderCell, { width: rankW }]}>{col.label}</Text>
            ))}
            <Text style={[styles.dataTableHeaderCell, { width: volumeW }]}>{t.volumeColumn}</Text>
          </View>
          {items.slice(0, 20).map((kw, idx) => (
            <View
              key={kw.id || idx}
              wrap={false}
              style={[styles.dataTableRow, idx === Math.min(items.length, 20) - 1 && styles.dataTableRowLast]}
            >
              <Text style={[styles.dataTableCell, { width: keywordW }]}>{kw.keyword}</Text>
              {rankCols.map((col) => {
                const r = useFallback
                  ? kw.position
                  : (kw.ranksByMonth?.[col.key] ?? null);
                return (
                  <Text key={col.key} style={[styles.dataTableCell, { width: rankW }]}>
                    {r != null ? `#${r}` : '-'}
                  </Text>
                );
              })}
              <Text style={[styles.dataTableCell, { width: volumeW }]}>
                {kw.searchVolume != null ? kw.searchVolume.toLocaleString() : '-'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function renderCompetitorsSection({ styles, t, data }) {
  const d = data || {};
  const items = Array.isArray(d.items) ? d.items : [];
  // Only show a separate name column when at least one competitor has a
  // friendly name distinct from its domain. Otherwise the table is just the
  // same value twice, which is noise.
  const showName = items.some((c) => c?.name && c.name !== c.domain);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t.competitorsTitle}</Text>
      <Text style={styles.sectionSub}>{t.competitorsTotal}: {d.total ?? items.length}</Text>
      {items.length === 0 ? (
        <Text style={styles.noData}>{t.noCompetitors}</Text>
      ) : (
        <View style={styles.dataTable}>
          <View style={styles.dataTableHeader}>
            {showName ? (
              <>
                <Text style={[styles.dataTableHeaderCell, { width: '55%' }]}>{t.competitorDomain}</Text>
                <Text style={[styles.dataTableHeaderCell, { width: '45%' }]}>{t.competitorName}</Text>
              </>
            ) : (
              <Text style={[styles.dataTableHeaderCell, { width: '100%' }]}>{t.competitorDomain}</Text>
            )}
          </View>
          {items.slice(0, 15).map((c, idx) => (
            <View
              key={c.id || idx}
              wrap={false}
              style={[styles.dataTableRow, idx === Math.min(items.length, 15) - 1 && styles.dataTableRowLast]}
            >
              {showName ? (
                <>
                  <Text style={[styles.dataTableCell, { width: '55%' }]}>{c.domain || '-'}</Text>
                  <Text style={[styles.dataTableCell, { width: '45%' }]}>{c.name && c.name !== c.domain ? c.name : '-'}</Text>
                </>
              ) : (
                <Text style={[styles.dataTableCell, { width: '100%' }]}>{c.domain || '-'}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// SEO + GEO sections are short enough that pushing them to the next
// page (wrap=false) is preferable to a mid-section split.
function renderSeoSection({ styles, t, data, locale }) {
  const d = data || {};
  // seoStrategy is a free-form object; surface the small set of fields that
  // usually carry summary-level info, otherwise fall back to the key list.
  const strategyPreview = (() => {
    if (!d.seoStrategy || typeof d.seoStrategy !== 'object') return null;
    const s = d.seoStrategy;
    const candidates = ['summary', 'overview', 'focus', 'positioning', 'tone', 'niche'];
    for (const key of candidates) {
      if (typeof s[key] === 'string' && s[key].trim()) return s[key].trim();
    }
    return Object.keys(s).slice(0, 5).join(', ');
  })();
  const hasAny = !!(d.writingStyle || strategyPreview || d.businessCategory || d.businessAbout);

  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{t.seoTitle}</Text>
      {!hasAny ? (
        <Text style={styles.noData}>{t.seoNoData}</Text>
      ) : (
        <View>
          {d.businessCategory && (
            <View style={styles.keyValueRow}>
              <Text style={styles.keyValueLabel}>{t.seoBusinessCategory || 'Category'}</Text>
              <Text style={styles.keyValueValue}>{String(d.businessCategory).slice(0, 80)}</Text>
            </View>
          )}
          {d.writingStyle && (
            <View style={styles.keyValueRow}>
              <Text style={styles.keyValueLabel}>{t.writingStyle}</Text>
              <Text style={styles.keyValueValue}>{String(d.writingStyle).slice(0, 80)}</Text>
            </View>
          )}
          {strategyPreview && (
            <View style={styles.keyValueRow}>
              <Text style={styles.keyValueLabel}>{t.seoStrategy}</Text>
              <Text style={styles.keyValueValue}>{String(strategyPreview).slice(0, 120)}</Text>
            </View>
          )}
          {d.businessAbout && (
            <View style={styles.keyValueRow}>
              <Text style={styles.keyValueLabel}>{t.seoBusinessAbout || 'About'}</Text>
              <Text style={styles.keyValueValue}>{String(d.businessAbout).slice(0, 200)}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function renderGeoSection({ styles, t, data, locale }) {
  const d = data || {};
  const locations = Array.isArray(d.targetLocations) ? d.targetLocations : [];
  // Accept either a single code (legacy) or an array of codes so the
  // section can list multiple content languages for multi-locale sites.
  const rawCodes = d.contentLanguages
    || (d.contentLanguage ? [d.contentLanguage] : null)
    || (d.wpLocale ? [d.wpLocale] : null);
  const langLabel = rawCodes ? languageNamesFromCodes(rawCodes, locale) : null;
  const hasAny = locations.length || rawCodes;
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{t.geoTitle}</Text>
      {!hasAny ? (
        <Text style={styles.noData}>{t.geoNoData}</Text>
      ) : (
        <View>
          {langLabel && (
            <View style={styles.keyValueRow}>
              <Text style={styles.keyValueLabel}>{t.geoContentLanguage}</Text>
              <Text style={styles.keyValueValue}>{langLabel}</Text>
            </View>
          )}
          <View>
            <Text style={[styles.sectionSub, { marginTop: 8 }]}>{t.geoTargetLocations}</Text>
            {locations.length > 0 ? (
              <View style={styles.chipsRow}>
                {locations.slice(0, 20).map((loc, i) => (
                  <Text key={i} style={styles.chip}>{String(loc)}</Text>
                ))}
              </View>
            ) : (
              <Text style={styles.sectionSub}>{t.geoNoTargetLocations}</Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function ReportDocument({
  branding,
  siteName,
  siteUrl,
  siteLogo,
  month,
  aiSummary,
  currentScore,
  previousScore,
  categoryScores,
  previousCategoryScores,
  executedActions,
  translations,
  locale = 'en',
  sectionsOrdered,
  sectionData,
  currentPeriodLabel,
  previousPeriodLabel,
}) {
  const t = translations || getDefaultPdfTranslations(locale);
  const primaryColor = branding?.primaryColor || '#7b2cbf';
  const isRTL = locale === 'he';
  const styles = createStyles(primaryColor, isRTL);
  
  const delta = currentScore != null && previousScore != null 
    ? currentScore - previousScore 
    : null;
  
  const deltaSign = delta > 0 ? '+' : '';
  const deltaClass = delta > 0 ? 'Positive' : delta < 0 ? 'Negative' : 'Neutral';

  const hasComparison = Boolean(currentPeriodLabel && previousPeriodLabel);
  const comparisonLabel = hasComparison
    ? (t.comparingPeriods || '{previousPeriod} → {currentPeriod}')
        .replace('{previousPeriod}', previousPeriodLabel)
        .replace('{currentPeriod}', currentPeriodLabel)
    : null;
  const pointsVsLabel = hasComparison
    ? (t.pointsVsPreviousPeriod || t.pointsVsLastMonth).replace('{previousPeriod}', previousPeriodLabel)
    : t.pointsVsLastMonth;

  // Category deltas
  const categories = ['technical', 'performance', 'visual', 'accessibility'];
  const categoryDeltas = {};
  categories.forEach(cat => {
    const curr = categoryScores?.[cat];
    const prev = previousCategoryScores?.[cat];
    categoryDeltas[cat] = curr != null && prev != null ? curr - prev : null;
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {branding?.logoUrl && (
              <Image src={branding.logoUrl} style={styles.logo} alt={branding?.agencyName || 'Agency Logo'} />
            )}
            <Text style={styles.agencyName}>{branding?.agencyName || t.defaultAgencyName}</Text>
            {/* Contact lines — email / website / phone — under the
                agency name. Each line only renders when the value is
                set, so an agency that hasn't filled in a phone won't
                show an empty line. */}
            {branding?.contactEmail && (
              <Text style={styles.agencyContact}>{branding.contactEmail}</Text>
            )}
            {branding?.contactWebsite && (
              <Text style={styles.agencyContact}>{branding.contactWebsite}</Text>
            )}
            {branding?.contactPhone && (
              <Text style={styles.agencyContact}>{branding.contactPhone}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.reportTitle}>{t.reportTitle}</Text>
            <Text style={styles.reportDate}>{month}</Text>
            {comparisonLabel && (
              <Text style={styles.comparisonPill}>{comparisonLabel}</Text>
            )}
          </View>
        </View>

        {/* Site Info — site logo (when available) sits next to the
            site name + URL so the report carries the client's own
            brand alongside the agency's. */}
        <View style={[styles.siteInfo, { flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }]}>
          {siteLogo && (
            <Image
              src={siteLogo}
              style={{
                width: 40,
                height: 40,
                objectFit: 'contain',
                ...(isRTL ? { marginLeft: 10 } : { marginRight: 10 }),
              }}
            />
          )}
          <View>
            <Text style={styles.siteName}>{siteName}</Text>
            <Text style={styles.siteUrl}>{siteUrl}</Text>
          </View>
        </View>

        {/*
         * Renders in the order the user configured (sectionsOrdered).
         * Each id maps to a renderer that knows how to emit its block.
         * Unknown ids are silently skipped so removing a section in the
         * UI never crashes the PDF pipeline.
         */}
        {(() => {
          const ordered = Array.isArray(sectionsOrdered) && sectionsOrdered.length
            ? sectionsOrdered
            : ['aiSummary', 'healthScore', 'aiActions'];

          return ordered.map((id) => {
            switch (id) {
              case 'overview':
                return <React.Fragment key={id}>{renderOverviewSection({ styles, t, data: sectionData?.overview })}</React.Fragment>;

              case 'aiSummary':
                return aiSummary ? (
                  // wrap=false keeps the executive summary block whole on a
                  // single page — splitting it across pages reads as broken.
                  <View key={id} style={styles.section} wrap={false}>
                    <Text style={styles.sectionTitle}>{t.executiveSummary}</Text>
                    <View style={styles.summaryBox}>
                      <Text style={styles.summaryText}>{aiSummary}</Text>
                    </View>
                  </View>
                ) : null;

              case 'healthScore':
                return (
                  // wrap=false here is what fixes the user-reported page
                  // cut where the section title rendered at the top of a
                  // page but the category grid spilled to the next page.
                  // The block is small enough that pushing the whole
                  // section to the next page is the right tradeoff.
                  <View key={id} style={styles.section} wrap={false}>
                    <Text style={styles.sectionTitle}>{t.siteHealthProgression}</Text>
                    <View style={styles.scoreContainer}>
                      <View style={styles.scoreCircle}>
                        <Text style={styles.scoreValue}>{currentScore ?? '-'}</Text>
                        <Text style={styles.scoreLabel}>{t.healthScore}</Text>
                      </View>
                      <View style={styles.scoreDetails}>
                        {delta != null && (
                          <View style={[styles.deltaBadge, styles[`deltaBadge${deltaClass}`]]}>
                            <Text style={[styles.deltaText, styles[`deltaText${deltaClass}`]]}>
                              {`${deltaSign}${delta}`} {pointsVsLabel}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.previousScoreText}>
                          {previousScore != null
                            ? `${t.previousScore} ${previousScore}`
                            : t.firstAuditForThisMonth}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.categoryGrid}>
                      {categories.map((cat) => {
                        const score = categoryScores?.[cat];
                        const catDelta = categoryDeltas[cat];
                        const catDeltaSign = catDelta > 0 ? '+' : '';
                        const catDeltaColor = catDelta > 0 ? '#16a34a' : catDelta < 0 ? '#dc2626' : '#6b7280';
                        return (
                          <View key={cat} style={styles.categoryCard}>
                            <Text style={styles.categoryName}>
                              {t.categories?.[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)}
                            </Text>
                            <View style={styles.categoryScoreRow}>
                              <Text style={styles.categoryScore}>{score ?? '-'}</Text>
                              {catDelta != null && (
                                <Text style={[styles.categoryDelta, { color: catDeltaColor }]}>
                                  {catDeltaSign}{catDelta}
                                </Text>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );

              case 'siteAudits': {
                // Separate from healthScore: this shows the recent audit run
                // history (dates + scores) so the client can see progression
                // across multiple audits rather than just the latest snapshot.
                const audits = Array.isArray(sectionData?.siteAudits?.items) ? sectionData.siteAudits.items : [];
                return (
                  <View key={id} style={styles.section}>
                    <Text style={styles.sectionTitle}>{t.auditSectionTitle || t.siteHealthProgression}</Text>
                    {audits.length === 0 ? (
                      <Text style={styles.noData}>{t.auditHistoryEmpty}</Text>
                    ) : (
                      <View style={styles.dataTable}>
                        <View style={styles.dataTableHeader}>
                          <Text style={[styles.dataTableHeaderCell, { width: '40%' }]}>{t.auditDate}</Text>
                          <Text style={[styles.dataTableHeaderCell, { width: '30%' }]}>{t.auditScore}</Text>
                          <Text style={[styles.dataTableHeaderCell, { width: '30%' }]}>{t.auditStatus}</Text>
                        </View>
                        {audits.slice(0, 12).map((a, idx) => (
                          <View
                            key={a.id || idx}
                            wrap={false}
                            style={[styles.dataTableRow, idx === Math.min(audits.length, 12) - 1 && styles.dataTableRowLast]}
                          >
                            <Text style={[styles.dataTableCell, { width: '40%' }]}>
                              {a.completedAt || a.createdAt ? formatDate(a.completedAt || a.createdAt, locale) : '-'}
                            </Text>
                            <Text style={[styles.dataTableCell, { width: '30%' }]}>{a.score ?? '-'}</Text>
                            <Text style={[styles.dataTableCell, { width: '30%' }]}>
                              {a.status
                                ? (t.auditStatuses?.[a.status] || t.auditStatuses?.[String(a.status).toLowerCase()] || a.status)
                                : '-'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              }

              case 'aiActions':
                return (
                  <View key={id} style={styles.section}>
                    <Text style={styles.sectionTitle}>{t.automatedAiWork}</Text>
                    {executedActions?.length > 0 ? (
                      <View style={styles.actionsTable}>
                        <View style={styles.actionsHeader}>
                          <Text style={[styles.actionsHeaderCell, styles.actionsCellDate]}>{t.date}</Text>
                          <Text style={[styles.actionsHeaderCell, styles.actionsCellType]}>{t.actionType}</Text>
                          <Text style={[styles.actionsHeaderCell, styles.actionsCellDescription]}>{t.description}</Text>
                        </View>
                        {executedActions.slice(0, 15).map((action, idx) => (
                          <View
                            key={action.id || idx}
                            wrap={false}
                            style={[
                              styles.actionsRow,
                              idx === Math.min(executedActions.length, 15) - 1 && styles.actionsRowLast,
                            ]}
                          >
                            <Text style={[styles.actionsCell, styles.actionsCellDate]}>
                              {formatDate(action.executedAt || action.createdAt, locale)}
                            </Text>
                            <View style={[styles.actionsCell, styles.actionsCellType]}>
                              <View style={styles.statusBadge}>
                                <Text style={styles.statusText}>
                                  {getActionLabel(action.actionType, t)}
                                </Text>
                              </View>
                            </View>
                            <Text style={[styles.actionsCell, styles.actionsCellDescription]}>
                              {humanizeActionDescription(action, t)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.noData}>{t.noActionsThisMonth}</Text>
                    )}
                    {executedActions?.length > 15 && (
                      <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 8, textAlign: isRTL ? 'right' : 'left' }}>
                        {`+ ${executedActions.length - 15}`} {t.moreActions}
                      </Text>
                    )}
                  </View>
                );

              case 'keywords':
                return <React.Fragment key={id}>{renderKeywordsSection({ styles, t, data: sectionData?.keywords, locale })}</React.Fragment>;

              case 'competitors':
                return <React.Fragment key={id}>{renderCompetitorsSection({ styles, t, data: sectionData?.competitors })}</React.Fragment>;

              case 'seo':
                return <React.Fragment key={id}>{renderSeoSection({ styles, t, data: sectionData?.seo, locale })}</React.Fragment>;

              case 'geo':
                return <React.Fragment key={id}>{renderGeoSection({ styles, t, data: sectionData?.geo, locale })}</React.Fragment>;

              default:
                return null;
            }
          });
        })()}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <View style={styles.footerContent}>
            <Text style={styles.footerText}>
              {`${t.generatedBy} GhostSEO | `}
            </Text>
            <Link src="https://GhostSEO.co.il" style={styles.footerLink}>
              GhostSEO.co.il
            </Link>
            <Text style={styles.footerText}>
              {` | office@ghostpost.co.il`}
            </Text>
          </View>
          <Text 
            style={styles.pageNumber} 
            render={({ pageNumber, totalPages }) => 
              `${t.page} ${pageNumber} ${t.of} ${totalPages}`
            } 
          />
        </View>
      </Page>
    </Document>
  );
}

/**
 * Generate PDF buffer from report data
 * 
 * @param {Object} params - Report generation parameters
 * @param {Object} params.branding - Agency branding config { logoUrl, agencyName, primaryColor, replyToEmail }
 * @param {string} params.siteName - Name of the site
 * @param {string} params.siteUrl - URL of the site
 * @param {string} params.month - Report month (e.g., "March 2026")
 * @param {string} params.aiSummary - AI-generated executive summary
 * @param {number} params.currentScore - Current audit score
 * @param {number} params.previousScore - Previous audit score
 * @param {Object} params.categoryScores - Current category scores { technical, performance, visual, accessibility }
 * @param {Object} params.previousCategoryScores - Previous category scores
 * @param {Array} params.executedActions - Array of executed AgentInsight actions
 * @returns {Promise<Buffer>} - PDF buffer
 */
export async function generateReportPdf(params) {
  const buffer = await renderToBuffer(
    <ReportDocument {...params} />
  );
  return buffer;
}

/**
 * Get default branding config
 */
export function getDefaultBranding() {
  return {
    logoUrl: null,
    agencyName: '',
    primaryColor: '#7b2cbf',
    replyToEmail: '',
  };
}

/**
 * Get default report config for Site.toolSettings.reportConfig
 */
export function getDefaultReportConfig() {
  return {
    enabled: false,
    schedule: 'monthly',
    recipients: [],
    includeAiSummary: true,
    includeAuditTrend: true,
    includeAgentActions: true,
    deliveryMode: 'AUTO', // 'AUTO' | 'DRAFT'
  };
}
