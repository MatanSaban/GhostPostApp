/**
 * Seed Ai-GCoins Add-on Packs
 *
 * Run with: node scripts/seed-ai-credits-addons.js
 *
 * NOTE: slugs and the AddOn `type` enum (AI_CREDITS) are code identifiers
 * referenced by the API/DB and remain unchanged. Only user-visible
 * `name`/`description` strings carry the new "Ai-GCoins" terminology.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AI_CREDITS_PACKS = [
  {
    name: '10K Ai-GCoins',
    slug: 'ai-credits-10k',
    description: 'Pack of 10,000 Ai-GCoins',
    type: 'AI_CREDITS',
    price: 9.99,
    currency: 'USD',
    billingType: 'ONE_TIME',
    quantity: 10000,
    sortOrder: 1,
  },
  {
    name: '20K Ai-GCoins',
    slug: 'ai-credits-20k',
    description: 'Pack of 20,000 Ai-GCoins',
    type: 'AI_CREDITS',
    price: 17.99,
    currency: 'USD',
    billingType: 'ONE_TIME',
    quantity: 20000,
    sortOrder: 2,
  },
  {
    name: '50K Ai-GCoins',
    slug: 'ai-credits-50k',
    description: 'Pack of 50,000 Ai-GCoins',
    type: 'AI_CREDITS',
    price: 39.99,
    currency: 'USD',
    billingType: 'ONE_TIME',
    quantity: 50000,
    sortOrder: 3,
  },
  {
    name: '100K Ai-GCoins',
    slug: 'ai-credits-100k',
    description: 'Pack of 100,000 Ai-GCoins',
    type: 'AI_CREDITS',
    price: 69.99,
    currency: 'USD',
    billingType: 'ONE_TIME',
    quantity: 100000,
    sortOrder: 4,
  },
];

const SEAT_ADDON = {
  name: 'Additional Seat',
  slug: 'additional-seat',
  description: 'Add one more team member seat to your subscription',
  type: 'SEATS',
  price: 4.99,
  currency: 'USD',
  billingType: 'RECURRING',
  quantity: 1,
  sortOrder: 10,
};

const SITE_ADDON = {
  name: 'Additional Website',
  slug: 'additional-website',
  description: 'Add one more website to your subscription',
  type: 'SITES',
  price: 9.99,
  currency: 'USD',
  billingType: 'RECURRING',
  quantity: 1,
  sortOrder: 11,
};

async function seedAddOns() {
  console.log('🌱 Seeding Add-ons...\n');

  const allAddOns = [...AI_CREDITS_PACKS, SEAT_ADDON, SITE_ADDON];

  for (const addOn of allAddOns) {
    const existing = await prisma.addOn.findUnique({
      where: { slug: addOn.slug },
    });

    if (existing) {
      console.log(`⏭️  Add-on "${addOn.name}" already exists, updating...`);
      await prisma.addOn.update({
        where: { slug: addOn.slug },
        data: addOn,
      });
    } else {
      console.log(`✅ Creating add-on: ${addOn.name}`);
      await prisma.addOn.create({ data: addOn });
    }
  }

  // Add translations
  console.log('\n📝 Adding translations...');
  
  const addOns = await prisma.addOn.findMany();
  
  for (const addOn of addOns) {
    // Hebrew translations
    const heTranslations = {
      'ai-credits-10k': { name: '10K Ai-GCoins', description: 'חבילה של 10,000 Ai-GCoins' },
      'ai-credits-20k': { name: '20K Ai-GCoins', description: 'חבילה של 20,000 Ai-GCoins' },
      'ai-credits-50k': { name: '50K Ai-GCoins', description: 'חבילה של 50,000 Ai-GCoins' },
      'ai-credits-100k': { name: '100K Ai-GCoins', description: 'חבילה של 100,000 Ai-GCoins' },
      'additional-seat': { name: 'מושב נוסף', description: 'הוספת חבר צוות נוסף למנוי שלך' },
      'additional-website': { name: 'אתר נוסף', description: 'הוספת אתר נוסף למנוי שלך' },
    };
    
    const heData = heTranslations[addOn.slug];
    if (heData) {
      await prisma.addOnTranslation.upsert({
        where: {
          addOnId_language: {
            addOnId: addOn.id,
            language: 'HE',
          },
        },
        update: heData,
        create: {
          addOnId: addOn.id,
          language: 'HE',
          ...heData,
        },
      });
    }
  }

  console.log('\n✨ Add-ons seeded successfully!');
}

seedAddOns()
  .catch((e) => {
    console.error('Error seeding add-ons:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
