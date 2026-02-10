/**
 * Crawl Website Handler
 *
 * Bot action handler that uses the comprehensive crawl function
 * to validate URLs, crawl websites, parse sitemaps, and analyze SEO.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { crawlWebsite as crawlWebsiteFunction } from "@/lib/interview/functions/crawl-website.js";
import { detectPlatformFromHtml } from "./detect-platform.js";
import { trackAIUsage } from "@/lib/ai/credits-service";

/**
 * Perform Mini Technical Audit
 *
 * Analyzes a website's technical health using axios and cheerio.
 * Extracts SEO metrics, performance data, and calculates a health score.
 */
async function performSiteAudit(url) {
  const startTime = Date.now();

  try {
    // Fetch the webpage with timeout
    const response = await axios.get(url, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Accept 4xx errors
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GPBot/1.0; +https://ghostpost.co.il/)",
      },
    });

    const ttfb = Date.now() - startTime;

    // Check for non-200 status
    if (response.status !== 200) {
      return {
        success: false,
        error: `HTTP ${response.status} - ${response.statusText}`,
        audit: null,
        healthScore: 0,
      };
    }

    // Parse HTML with cheerio
    const $ = cheerio.load(response.data);
    const parsedUrl = new URL(url);

    // 1. Basic Info
    const title = $("title").first().text().trim() || "";
    const description =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "";
    const keywords = $('meta[name="keywords"]').attr("content") || "";
    const canonical = $('link[rel="canonical"]').attr("href") || "";
    const favicon =
      $('link[rel="icon"]').attr("href") ||
      $('link[rel="shortcut icon"]').attr("href") ||
      "";

    // 2. Performance
    const performance = {
      ttfb: ttfb,
      responseTime: ttfb,
      rating: ttfb < 500 ? "Good" : ttfb < 1500 ? "Fair" : "Poor",
    };

    // 3. Security
    const isHttps = parsedUrl.protocol === "https:";

    // 4. Content Structure
    const h1Tags = $("h1");
    const h1Count = h1Tags.length;
    const h1Issue =
      h1Count === 0
        ? "No H1 tag found"
        : h1Count > 1
          ? `Multiple H1 tags (${h1Count})`
          : null;

    const headings = {
      h1: h1Count,
      h2: $("h2").length,
      h3: $("h3").length,
      h4: $("h4").length,
      h5: $("h5").length,
      h6: $("h6").length,
      h1Issue,
    };

    // Word count estimation (body text only, strip scripts/styles)
    $("script, style, nav, footer, header").remove();
    const bodyText = $("body").text().trim();
    const wordCount = bodyText
      .split(/\s+/)
      .filter((word) => word.length > 0).length;

    // 5. Media
    const images = $("img");
    const totalImages = images.length;
    let missingAltCount = 0;

    images.slice(0, 20).each((i, img) => {
      const alt = $(img).attr("alt");
      if (!alt || alt.trim() === "") {
        missingAltCount++;
      }
    });

    const media = {
      totalImages,
      missingAlt: missingAltCount,
      missingAltPercentage:
        totalImages > 0
          ? Math.round((missingAltCount / Math.min(totalImages, 20)) * 100)
          : 0,
    };

    // 6. Technology Detection
    const generator = $('meta[name="generator"]').attr("content") || "";
    const htmlContent = response.data.toLowerCase();

    const technologies = [];
    if (
      generator.toLowerCase().includes("wordpress") ||
      htmlContent.includes("wp-content") ||
      htmlContent.includes("wp-includes")
    ) {
      technologies.push("WordPress");
    }
    if (
      generator.toLowerCase().includes("shopify") ||
      htmlContent.includes("cdn.shopify.com")
    ) {
      technologies.push("Shopify");
    }
    if (
      generator.toLowerCase().includes("wix") ||
      htmlContent.includes("wix.com") ||
      htmlContent.includes("parastorage")
    ) {
      technologies.push("Wix");
    }
    if (htmlContent.includes("next.js") || htmlContent.includes("__next")) {
      technologies.push("Next.js");
    }
    if (htmlContent.includes("react")) {
      technologies.push("React");
    }

    // 7. Links Analysis
    const links = $("a[href]");
    let internalLinks = 0;
    let externalLinks = 0;

    links.each((i, link) => {
      const href = $(link).attr("href");
      if (!href) return;

      // Skip anchor links and javascript
      if (
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }

      try {
        // Relative URLs or same domain = internal
        if (
          href.startsWith("/") ||
          href.startsWith("./") ||
          href.startsWith("../")
        ) {
          internalLinks++;
        } else {
          const linkUrl = new URL(href, url);
          if (linkUrl.hostname === parsedUrl.hostname) {
            internalLinks++;
          } else {
            externalLinks++;
          }
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    // Calculate Health Score (0-100)
    let score = 0;
    const checks = [];

    // Title check (15 points)
    if (title.length > 0) {
      const titleScore = title.length >= 30 && title.length <= 60 ? 15 : 10;
      score += titleScore;
      checks.push({ name: "Title", passed: true, score: titleScore, max: 15 });
    } else {
      checks.push({ name: "Title", passed: false, score: 0, max: 15 });
    }

    // Description check (15 points)
    if (description.length > 0) {
      const descScore =
        description.length >= 120 && description.length <= 160 ? 15 : 10;
      score += descScore;
      checks.push({
        name: "Meta Description",
        passed: true,
        score: descScore,
        max: 15,
      });
    } else {
      checks.push({
        name: "Meta Description",
        passed: false,
        score: 0,
        max: 15,
      });
    }

    // H1 check (10 points)
    if (h1Count === 1) {
      score += 10;
      checks.push({ name: "H1 Tag", passed: true, score: 10, max: 10 });
    } else {
      checks.push({
        name: "H1 Tag",
        passed: false,
        score: 0,
        max: 10,
        issue: h1Issue,
      });
    }

    // HTTPS check (15 points)
    if (isHttps) {
      score += 15;
      checks.push({ name: "HTTPS", passed: true, score: 15, max: 15 });
    } else {
      checks.push({ name: "HTTPS", passed: false, score: 0, max: 15 });
    }

    // Performance check (15 points)
    if (ttfb < 500) {
      score += 15;
      checks.push({ name: "Performance", passed: true, score: 15, max: 15 });
    } else if (ttfb < 1500) {
      score += 8;
      checks.push({ name: "Performance", passed: true, score: 8, max: 15 });
    } else {
      checks.push({ name: "Performance", passed: false, score: 0, max: 15 });
    }

    // Image alt tags (10 points)
    if (totalImages === 0 || media.missingAltPercentage < 20) {
      score += 10;
      checks.push({ name: "Image Alt Tags", passed: true, score: 10, max: 10 });
    } else if (media.missingAltPercentage < 50) {
      score += 5;
      checks.push({ name: "Image Alt Tags", passed: true, score: 5, max: 10 });
    } else {
      checks.push({ name: "Image Alt Tags", passed: false, score: 0, max: 10 });
    }

    // Content length (10 points)
    if (wordCount >= 300) {
      score += 10;
      checks.push({ name: "Content Length", passed: true, score: 10, max: 10 });
    } else if (wordCount >= 150) {
      score += 5;
      checks.push({ name: "Content Length", passed: true, score: 5, max: 10 });
    } else {
      checks.push({ name: "Content Length", passed: false, score: 0, max: 10 });
    }

    // Canonical URL (5 points)
    if (canonical) {
      score += 5;
      checks.push({ name: "Canonical URL", passed: true, score: 5, max: 5 });
    } else {
      checks.push({ name: "Canonical URL", passed: false, score: 0, max: 5 });
    }

    // Favicon (5 points)
    if (favicon) {
      score += 5;
      checks.push({ name: "Favicon", passed: true, score: 5, max: 5 });
    } else {
      checks.push({ name: "Favicon", passed: false, score: 0, max: 5 });
    }

    // Build audit object
    const audit = {
      basicInfo: {
        title,
        titleLength: title.length,
        description,
        descriptionLength: description.length,
        keywords,
        canonical,
        favicon,
      },
      performance,
      security: {
        isHttps,
        protocol: parsedUrl.protocol,
      },
      contentStructure: {
        headings,
        wordCount,
      },
      media,
      technology: {
        detected: technologies,
        generator,
      },
      links: {
        internal: internalLinks,
        external: externalLinks,
        total: internalLinks + externalLinks,
      },
      healthChecks: checks,
    };

    return {
      success: true,
      audit,
      healthScore: Math.round(score),
      rating:
        score >= 80
          ? "Excellent"
          : score >= 60
            ? "Good"
            : score >= 40
              ? "Fair"
              : "Poor",
    };
  } catch (error) {
    // Handle specific error types
    let errorMessage = "Failed to perform site audit";

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      errorMessage = "Request timeout - site took too long to respond";
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      errorMessage = "Could not connect to the website";
    } else if (error.response) {
      errorMessage = `HTTP ${error.response.status} - ${error.response.statusText}`;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
      audit: null,
      healthScore: 0,
    };
  }
}

/**
 * Map detected technologies to platform value for the interview
 * @param {string[]} technologies - Array of detected technologies from audit
 * @returns {string|null} Platform value matching interview options
 */
function detectPlatformFromTechnologies(technologies) {
  if (!technologies || technologies.length === 0) return null;
  
  // Map technology names to platform values (must match seed-interview-questions.js options)
  const platformMap = {
    'WordPress': 'wordpress',
    'Shopify': 'shopify',
    'Wix': 'wix',
    'Squarespace': 'squarespace',
    'Webflow': 'webflow',
    'Magento': 'magento',
    'Drupal': 'drupal',
    'Joomla': 'joomla',
    'Next.js': 'custom', // Next.js is considered custom code
    'Gatsby': 'custom',
    'React': 'custom',
  };
  
  // Find the first matching platform (priority order from the array)
  for (const tech of technologies) {
    if (platformMap[tech]) {
      console.log(`[CrawlWebsite] Detected platform: ${platformMap[tech]} from ${tech}`);
      return platformMap[tech];
    }
  }
  
  return null;
}

/**
 * Main crawl handler for bot actions
 *
 * This handler is called when the CRAWL_WEBSITE action is triggered.
 * It uses the comprehensive crawl function and saves results to the interview.
 */
export async function crawlWebsite(params, context) {
  // Get URL from params or from the interview responses
  const url = params.url || context.responses?.websiteUrl;

  if (!url) {
    return {
      success: false,
      error: "No URL provided",
    };
  }

  console.log("[CrawlWebsite Handler] Starting crawl for:", url);
  console.log("[CrawlWebsite Handler] Context available:", {
    hasInterview: !!context.interview,
    hasPrisma: !!context.prisma,
    interviewId: context.interview?.id,
  });

  try {
    // Perform mini technical audit first
    console.log("[CrawlWebsite Handler] Performing technical audit...");
    const auditResult = await performSiteAudit(url);
    console.log("[CrawlWebsite Handler] Technical audit complete:", {
      success: auditResult.success,
      healthScore: auditResult.healthScore,
      rating: auditResult.rating,
    });

    // Use the comprehensive crawl function
    const crawlResult = await crawlWebsiteFunction(url);

    // If crawl failed, return the error
    if (!crawlResult.success) {
      const errorMessage =
        crawlResult.errors?.length > 0
          ? crawlResult.errors.map((e) => e.message).join(", ")
          : "Failed to crawl website";

      return {
        success: false,
        error: errorMessage,
        validation: crawlResult.validation,
      };
    }

    // Save crawl data to interview if context available
    if (context.interview && context.prisma) {
      const existingData = context.interview.externalData || {};

      // Prepare the data to save - use AI-extracted data when available
      const aiData = crawlResult.pageData?.aiExtracted || {};
      const contactData = crawlResult.pageData?.contact || {};

      const crawledData = {
        // Basic page data - prefer AI-extracted businessName
        url: crawlResult.url,
        businessName:
          aiData.businessName ||
          crawlResult.pageData?.businessName ||
          crawlResult.pageData?.title ||
          crawlResult.pageData?.siteName,
        description: aiData.description || crawlResult.pageData?.description,
        image: crawlResult.pageData?.image,
        // Language - prefer AI-detected, fallback to HTML lang attribute
        language:
          aiData.detectedLanguage || crawlResult.pageData?.language || "en",
        
        // Platform detection from technical audit
        platform: detectPlatformFromTechnologies(auditResult?.audit?.technology?.detected),

        // AI-extracted additional fields
        category: aiData.category || null,
        address: aiData.address || null,
        servicesOrProducts: aiData.servicesOrProducts || [],
        targetAudience: aiData.targetAudience || null,

        // Contact info - prefer AI-extracted (already normalized)
        // AI returns single values, crawler returns arrays
        phone: aiData.phone || contactData.phones?.[0] || null,
        email: aiData.email || contactData.emails?.[0] || null,
        phones: contactData.phones || [],
        emails: contactData.emails || [],
        socialLinks: contactData.socialLinks || {},

        // Sitemap data
        hasSitemap: crawlResult.sitemap?.found || false,
        sitemapUrls: crawlResult.sitemap?.urls?.slice(0, 20) || [], // Limit stored URLs
        sitemapCategories: crawlResult.sitemap?.categories,

        // Technical audit data
        technicalAudit: auditResult.success
          ? {
              healthScore: auditResult.healthScore,
              rating: auditResult.rating,
              basicInfo: auditResult.audit.basicInfo,
              performance: auditResult.audit.performance,
              security: auditResult.audit.security,
              contentStructure: auditResult.audit.contentStructure,
              media: auditResult.audit.media,
              technology: auditResult.audit.technology,
              links: auditResult.audit.links,
              checks: auditResult.audit.healthChecks,
              auditedAt: new Date().toISOString(),
            }
          : null,

        // Metadata
        crawledAt: crawlResult.crawledAt,
        keywords: crawlResult.pageData?.keywords || [],
      };

      console.log("[CrawlWebsite Handler] Saving crawledData to interview:", {
        businessName: crawledData.businessName,
        description: crawledData.description?.substring(0, 50),
        phone: crawledData.phone,
        email: crawledData.email,
        category: crawledData.category,
        address: crawledData.address,
        platform: crawledData.platform,
        language: crawledData.language,
      });

      // Update the interview with crawl data
      const updatedInterview = await context.prisma.userInterview.update({
        where: { id: context.interview.id },
        data: {
          externalData: {
            ...existingData,
            crawledData,
            // Also store raw crawl result for debugging
            _rawCrawlResult: crawlResult,
          },
        },
      });

      console.log(
        "[CrawlWebsite Handler] Saved crawl data to interview. ExternalData keys:",
        Object.keys(updatedInterview.externalData || {}),
      );
    } else {
      console.log(
        "[CrawlWebsite Handler] WARNING: Could not save - missing context.interview or context.prisma",
      );
    }

    // Return success with data (including AI-extracted fields)
    const aiData = crawlResult.pageData?.aiExtracted || {};

    // Track AI credits usage
    if (context.accountId) {
      await trackAIUsage({
        accountId: context.accountId,
        userId: context.userId,
        siteId: context.siteId,
        operation: 'CRAWL_WEBSITE',
        description: `Crawled website: ${crawlResult.url}`,
        metadata: {
          websiteUrl: crawlResult.url,
          businessName: crawlResult.pageData?.businessName,
          hasSitemap: crawlResult.sitemap?.found || false,
          healthScore: auditResult.healthScore,
          descriptionKey: 'crawledWebsite',
          descriptionParams: { url: crawlResult.url },
        },
      });
    }

    return {
      success: true,
      data: {
        url: crawlResult.url,
        businessName:
          crawlResult.pageData?.businessName || crawlResult.pageData?.title,
        description: crawlResult.pageData?.description,
        category: aiData.category,
        address: aiData.address,
        image: crawlResult.pageData?.image,
        language: crawlResult.pageData?.language,
        emails: crawlResult.pageData?.contact?.emails,
        phones: crawlResult.pageData?.contact?.phones,
        socialLinks: crawlResult.pageData?.contact?.socialLinks,
        seoScore: crawlResult.seoAnalysis?.score,
        seoIssueCount: crawlResult.seoAnalysis?.issues?.length || 0,
        hasSitemap: crawlResult.sitemap?.found || false,
        sitemapUrlCount: crawlResult.sitemap?.urls?.length || 0,
        validation: crawlResult.validation,
        // Include technical audit results
        technicalAudit: auditResult.success
          ? {
              healthScore: auditResult.healthScore,
              rating: auditResult.rating,
              performance: auditResult.audit.performance,
              security: auditResult.audit.security,
              contentWordCount: auditResult.audit.contentStructure.wordCount,
              h1Count: auditResult.audit.contentStructure.headings.h1,
              h1Issue: auditResult.audit.contentStructure.headings.h1Issue,
              imagesTotal: auditResult.audit.media.totalImages,
              imagesMissingAlt: auditResult.audit.media.missingAlt,
              technologies: auditResult.audit.technology.detected,
              internalLinks: auditResult.audit.links.internal,
              externalLinks: auditResult.audit.links.external,
            }
          : null,
      },
    };
  } catch (error) {
    console.error("[CrawlWebsite Handler] Error:", error);
    return {
      success: false,
      error: error.message || "Failed to crawl website",
    };
  }
}
