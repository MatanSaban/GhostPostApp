const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const translations = {
  en: 'Get Started',
  he: 'התחל עכשיו',
  fr: 'Commencer',
};

async function main() {
  for (const [locale, text] of Object.entries(translations)) {
    const record = await p.websiteLocale.findUnique({
      where: { websiteId_locale: { websiteId: 'gp-ws', locale } },
      select: { content: true }
    });

    if (!record?.content) {
      console.log(`No content found for locale ${locale}`);
      continue;
    }

    const content = JSON.parse(JSON.stringify(record.content));

    // All CTA-related keys that should use the translated text
    if (content.hero) content.hero.cta = text;
    if (content.features) content.features.ctaButton = text;
    if (content.howItWorks) content.howItWorks.ctaButton = text;
    if (content.pricing) {
      content.pricing.startFreeTrial = text;
      content.pricing.starterCta = text;
      content.pricing.proCta = text;
      if (content.pricing.plans) {
        content.pricing.plans.forEach(plan => {
          if (plan.cta && plan.cta !== 'Contact Sales' && plan.cta !== 'צור קשר עם מכירות' && plan.cta !== 'Contacter les ventes') {
            plan.cta = text;
          }
        });
      }
    }
    if (content.cta) content.cta.button = text;
    if (content.common) content.common.startFreeTrial = text;

    await p.websiteLocale.update({
      where: { websiteId_locale: { websiteId: 'gp-ws', locale } },
      data: { content }
    });
    console.log(`✅ ${locale}: "${text}"`);
  }
}

main().catch(console.error).finally(() => p.$disconnect());
