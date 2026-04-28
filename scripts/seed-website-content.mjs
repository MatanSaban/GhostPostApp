/**
 * Seed script to import gp-ws JSON content into the database
 * 
 * Run: node scripts/seed-website-content.mjs
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Path to gp-ws dictionaries
const GP_WS_PATH = path.join(__dirname, '..', '..', 'gp-ws', 'i18n', 'dictionaries');

// Locales to import
const LOCALES = ['en', 'he', 'fr'];

// Pages that exist in gp-ws
const PAGES = [
  'home',
  'about', 
  'contact',
  'faq',
  'features',
  'how-it-works',
  'pricing',
  'privacy',
  'terms',
  'blog'
];

// Generate default SEO for each page based on content
function generatePageSeo(content, locale, page) {
  const seo = {
    title: '',
    description: '',
    canonical: page === 'home' ? '/' : `/${page}`,
    ogTitle: '',
    ogDescription: '',
    ogImage: '/og/default.png',
    ogType: 'website',
    twitterCard: 'summary_large_image',
    robots: 'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1',
    jsonLd: null
  };

  // Extract SEO from content based on page structure
  switch (page) {
    case 'home':
      seo.title = content.metadata?.title || 'GhostSEO - AI-Powered SEO Automation';
      seo.description = content.metadata?.description || content.hero?.subtitle || '';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      seo.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'GhostSEO',
        url: 'https://ghostseo.ai',
        description: seo.description,
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://ghostseo.ai/search?q={search_term_string}',
          'query-input': 'required name=search_term_string'
        }
      };
      break;
      
    case 'about':
      seo.title = content.about?.metaTitle || 'About - GhostSEO';
      seo.description = content.about?.metaDescription || content.about?.subtitle || '';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      seo.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: seo.title,
        description: seo.description,
        mainEntity: {
          '@type': 'Organization',
          name: 'GhostSEO',
          url: 'https://ghostseo.ai'
        }
      };
      break;
      
    case 'contact':
      seo.title = content.contact?.metaTitle || 'Contact - GhostSEO';
      seo.description = content.contact?.metaDescription || content.contact?.subtitle || '';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      seo.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        name: seo.title,
        description: seo.description
      };
      break;
      
    case 'faq':
      seo.title = `FAQ - GhostSEO`;
      seo.description = content.faq?.subtitle || 'Frequently asked questions about GhostSEO';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      // FAQPage schema would be generated from actual FAQ items
      seo.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        name: seo.title,
        description: seo.description,
        mainEntity: [] // Would be populated with actual FAQ items
      };
      break;
      
    case 'features':
      seo.title = content.features?.metaTitle || 'Features - GhostSEO';
      seo.description = content.features?.metaDescription || content.features?.subtitle || '';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      break;
      
    case 'how-it-works':
      seo.title = content.howItWorks?.metaTitle || 'How It Works - GhostSEO';
      seo.description = content.howItWorks?.metaDescription || content.howItWorks?.subtitle || '';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      break;
      
    case 'pricing':
      seo.title = `Pricing - GhostSEO`;
      seo.description = content.pricing?.subtitle || 'Simple, transparent pricing for GhostSEO';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      seo.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'GhostSEO',
        description: seo.description,
        brand: {
          '@type': 'Brand',
          name: 'GhostSEO'
        }
      };
      break;
      
    case 'privacy':
      seo.title = content.privacy?.metaTitle || 'Privacy Policy - GhostSEO';
      seo.description = content.privacy?.metaDescription || 'GhostSEO Privacy Policy';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      break;
      
    case 'terms':
      seo.title = content.terms?.metaTitle || 'Terms of Service - GhostSEO';
      seo.description = content.terms?.metaDescription || 'GhostSEO Terms of Service';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      break;
      
    case 'blog':
      seo.title = `Blog - GhostSEO`;
      seo.description = content.blog?.subtitle || 'Latest updates from GhostSEO';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      seo.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: seo.title,
        description: seo.description,
        url: 'https://ghostseo.ai/blog'
      };
      break;
  }

  return seo;
}

async function seedWebsiteContent() {
  console.log('Starting website content seed...\n');

  // 1. Seed WebsiteSeo (site-wide config)
  console.log('1. Seeding WebsiteSeo...');
  await prisma.websiteSeo.upsert({
    where: { websiteId: 'gp-ws' },
    create: {
      websiteId: 'gp-ws',
      siteName: {
        en: 'GhostSEO',
        he: 'GhostSEO',
        fr: 'GhostSEO'
      },
      siteUrl: 'https://ghostseo.ai',
      defaultOgImage: '/og/default.png',
      twitterHandle: '@ghostpost',
      defaultRobots: 'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1'
    },
    update: {
      siteName: {
        en: 'GhostSEO',
        he: 'GhostSEO',
        fr: 'GhostSEO'
      },
      siteUrl: 'https://ghostseo.ai'
    }
  });
  console.log('   ✓ WebsiteSeo created/updated\n');

  // 2. Seed WebsiteLocale for each locale
  console.log('2. Seeding WebsiteLocale for each language...');
  
  for (const locale of LOCALES) {
    const jsonPath = path.join(GP_WS_PATH, `${locale}.json`);
    
    if (!fs.existsSync(jsonPath)) {
      console.log(`   ⚠ Skipping ${locale}: File not found at ${jsonPath}`);
      continue;
    }
    
    const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    
    // Generate SEO for all pages
    const seo = {};
    for (const page of PAGES) {
      seo[page] = generatePageSeo(content, locale, page);
    }
    
    await prisma.websiteLocale.upsert({
      where: {
        websiteId_locale: {
          websiteId: 'gp-ws',
          locale
        }
      },
      create: {
        websiteId: 'gp-ws',
        locale,
        content,
        seo,
        version: 1
      },
      update: {
        content,
        seo,
        version: { increment: 1 }
      }
    });
    
    console.log(`   ✓ ${locale.toUpperCase()} locale seeded (${Object.keys(content).length} sections)`);
  }

  console.log('\n3. Summary:');
  const locales = await prisma.websiteLocale.findMany({
    where: { websiteId: 'gp-ws' },
    select: { locale: true, version: true }
  });
  
  for (const loc of locales) {
    console.log(`   - ${loc.locale}: version ${loc.version}`);
  }

  console.log('\n✅ Website content seed completed!');
}

seedWebsiteContent()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
