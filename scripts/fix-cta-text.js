const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const locales = ['en', 'he', 'fr'];
  
  for (const locale of locales) {
    const record = await p.websiteLocale.findUnique({
      where: { websiteId_locale: { websiteId: 'gp-ws', locale } },
      select: { content: true }
    });
    
    if (!record?.content) {
      console.log(`No content found for locale ${locale}`);
      continue;
    }
    
    // Deep clone content
    const content = JSON.parse(JSON.stringify(record.content));
    let changed = false;
    
    // Replace all occurrences of "Start Free Trial" and Hebrew equivalent
    const replacements = [
      ['Start Free Trial', 'Get Started'],
      ['התחל ניסיון חינם', 'Get Started'],
      ["Commencer l'essai gratuit", 'Get Started'],
      ['Essai gratuit', 'Get Started'],
    ];
    
    function replaceInObject(obj, path = '') {
      if (!obj || typeof obj !== 'object') return;
      
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'string') {
          for (const [from, to] of replacements) {
            if (val === from) {
              console.log(`  [${locale}] ${path}.${key}: "${from}" → "${to}"`);
              obj[key] = to;
              changed = true;
            }
          }
        } else if (typeof val === 'object' && val !== null) {
          replaceInObject(val, `${path}.${key}`);
        }
      }
    }
    
    replaceInObject(content);
    
    if (changed) {
      await p.websiteLocale.update({
        where: { websiteId_locale: { websiteId: 'gp-ws', locale } },
        data: { content }
      });
      console.log(`✅ Updated locale ${locale}`);
    } else {
      console.log(`No changes needed for locale ${locale}`);
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
