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
      maxWidth: 150,
      maxHeight: 50,
      objectFit: 'contain',
      marginBottom: 6,
    },
    agencyName: {
      fontSize: 14,
      fontWeight: 700,
      color: primaryColor,
      textAlign: isRTL ? 'right' : 'left',
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
      previousScore: 'Previous score:',
      firstAuditForThisMonth: 'First audit for this month',
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
      previousScore: 'ציון קודם:',
      firstAuditForThisMonth: 'ביקורת ראשונה לחודש זה',
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
 * Format date for display
 */
function formatDate(date, locale = 'en') {
  const d = new Date(date);
  const dateLocale = locale === 'he' ? 'he-IL' : 'en-US';
  return d.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The main Report Document component
 */
function ReportDocument({
  branding,
  siteName,
  siteUrl,
  month,
  aiSummary,
  currentScore,
  previousScore,
  categoryScores,
  previousCategoryScores,
  executedActions,
  translations,
  locale = 'en',
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
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.reportTitle}>{t.reportTitle}</Text>
            <Text style={styles.reportDate}>{month}</Text>
          </View>
        </View>

        {/* Site Info */}
        <View style={styles.siteInfo}>
          <Text style={styles.siteName}>{siteName}</Text>
          <Text style={styles.siteUrl}>{siteUrl}</Text>
        </View>

        {/* AI Executive Summary */}
        {aiSummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.executiveSummary}</Text>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>{aiSummary}</Text>
            </View>
          </View>
        )}

        {/* Site Health Score */}
        <View style={styles.section}>
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
                    {`${deltaSign}${delta}`} {t.pointsVsLastMonth}
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

          {/* Category Grid */}
          <View style={styles.categoryGrid}>
            {categories.map(cat => {
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

        {/* Automated AI Work */}
        <View style={styles.section}>
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
                  style={[
                    styles.actionsRow, 
                    idx === Math.min(executedActions.length, 15) - 1 && styles.actionsRowLast
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
                    {action.data?.description || action.descriptionKey || t.seoOptimizationApplied}
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

        {/* Footer */}
        <View style={styles.footer} fixed>
          <View style={styles.footerContent}>
            <Text style={styles.footerText}>
              {`${t.generatedBy} Ghost Post | `}
            </Text>
            <Link src="https://GhostPost.co.il" style={styles.footerLink}>
              GhostPost.co.il
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
