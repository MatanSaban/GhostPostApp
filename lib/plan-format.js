import { convertUsdToIlsWithVat } from './currency';

const PERIOD_MAP = { he: '/לחודש', fr: '/mois', en: '/month' };

/**
 * Shape a raw Prisma Plan (optionally with translations) into the same object
 * the client expects from /api/public/plans. Used by /api/public/plans and by
 * /api/auth/registration/status so a refresh on the payment step hydrates the
 * PaymentStep with the fields it needs (monthlyPrice, usdToIlsRate, period).
 *
 * @param {object} plan - Raw Prisma Plan with optional `translations` relation loaded
 * @param {object} opts
 * @param {string} opts.lang - Language code (he/en/fr). Falls back to 'he'.
 * @param {number} opts.usdToIlsRate - Live USD→ILS rate (fetched once by caller)
 * @param {boolean} opts.isPopular - Optional popular-flag override
 */
export function formatPlanForClient(plan, { lang = 'he', usdToIlsRate, isPopular = false } = {}) {
  const translation = Array.isArray(plan.translations)
    ? (plan.translations.find(t => t.language === lang.toUpperCase())
        || plan.translations.find(t => t.language === 'HE')
        || null)
    : null;

  const features = translation?.features || plan.features || [];
  const limitations = translation?.limitations || plan.limitations || [];
  const period = PERIOD_MAP[lang] || PERIOD_MAP.en;

  const yearlyPrice = plan.yearlyPrice ?? plan.price * 10;
  const ilsMonthlyPrice = usdToIlsRate ? convertUsdToIlsWithVat(plan.price, usdToIlsRate) : null;
  const ilsYearlyPrice = usdToIlsRate ? convertUsdToIlsWithVat(yearlyPrice, usdToIlsRate) : null;

  return {
    id: plan.id,
    slug: plan.slug,
    name: translation?.name || plan.name,
    description: translation?.description || plan.description || '',
    monthlyPrice: plan.price,
    yearlyPrice,
    currency: plan.currency,
    period,
    features,
    limitations,
    popular: isPopular,
    ilsMonthlyPrice,
    ilsYearlyPrice,
    usdToIlsRate,
  };
}
