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
      seo.title = content.metadata?.title || 'Ghost Post - AI-Powered SEO Automation';
      seo.description = content.metadata?.description || content.hero?.subtitle || '';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      seo.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Ghost Post',
        url: 'https://ghostpost.co.il',
        description: seo.description,
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://ghostpost.co.il/search?q={search_term_string}',
          'query-input': 'required name=search_term_string'
        }
      };
      break;
      
    case 'about':
      seo.title = content.about?.metaTitle || 'About - Ghost Post';
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
          name: 'Ghost Post',
          url: 'https://ghostpost.co.il'
        }
      };
      break;
      
    case 'contact':
      seo.title = content.contact?.metaTitle || 'Contact - Ghost Post';
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
      seo.title = `FAQ - Ghost Post`;
      seo.description = content.faq?.subtitle || 'Frequently asked questions about Ghost Post';
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
      seo.title = content.features?.metaTitle || 'Features - Ghost Post';
      seo.description = content.features?.metaDescription || content.features?.subtitle || '';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      break;
      
    case 'how-it-works':
      seo.title = content.howItWorks?.metaTitle || 'How It Works - Ghost Post';
      seo.description = content.howItWorks?.metaDescription || content.howItWorks?.subtitle || '';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      break;
      
    case 'pricing':
      seo.title = `Pricing - Ghost Post`;
      seo.description = content.pricing?.subtitle || 'Simple, transparent pricing for Ghost Post';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      seo.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Ghost Post',
        description: seo.description,
        brand: {
          '@type': 'Brand',
          name: 'Ghost Post'
        }
      };
      break;
      
    case 'privacy':
      seo.title = content.privacy?.metaTitle || 'Privacy Policy - Ghost Post';
      seo.description = content.privacy?.metaDescription || 'Ghost Post Privacy Policy';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      break;
      
    case 'terms':
      seo.title = content.terms?.metaTitle || 'Terms of Service - Ghost Post';
      seo.description = content.terms?.metaDescription || 'Ghost Post Terms of Service';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      break;
      
    case 'blog':
      seo.title = `Blog - Ghost Post`;
      seo.description = content.blog?.subtitle || 'Latest updates from Ghost Post';
      seo.ogTitle = seo.title;
      seo.ogDescription = seo.description;
      seo.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: seo.title,
        description: seo.description,
        url: 'https://ghostpost.co.il/blog'
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
        en: 'Ghost Post',
        he: 'גוסט פוסט',
        fr: 'Ghost Post'
      },
      siteUrl: 'https://ghostpost.co.il',
      defaultOgImage: '/og/default.png',
      twitterHandle: '@ghostpost',
      defaultRobots: 'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1'
    },
    update: {
      siteName: {
        en: 'Ghost Post',
        he: 'גוסט פוסט',
        fr: 'Ghost Post'
      },
      siteUrl: 'https://ghostpost.co.il'
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
