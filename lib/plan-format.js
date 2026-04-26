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
  // Translation lookup chain: requested language → English → Hebrew → raw
  // plan fields. Previously the chain collapsed to Hebrew whenever the
  // requested language wasn't present, which meant English users saw
  // Hebrew plan names for any plan missing an EN translation.
  const translations = Array.isArray(plan.translations) ? plan.translations : [];
  const requestedLang = (lang || 'en').toUpperCase();
  const translation =
    translations.find((t) => t.language === requestedLang) ||
    translations.find((t) => t.language === 'EN') ||
    translations.find((t) => t.language === 'HE') ||
    null;

  // For features/limitations, prefer the exact requested language even
  // when falling back for the plan name, so label lists don't end up
  // mixed with a different locale when possible.
  const langMatch = translations.find((t) => t.language === requestedLang);

  const features =
    langMatch?.features || translation?.features || plan.features || [];

  // Merge translated limitation LABELS with the raw plan's numeric VALUES.
  // PlanTranslation.limitations is stored as [{key, label}] (no value),
  // while plan.limitations is [{key, label, value, type}]. If we just took
  // translation.limitations, we'd lose the numbers the UI now renders
  // inline ("100 Keywords"). Iterate over the raw plan's limitations —
  // which is the source of truth for keys + values — and overlay a
  // translated label whenever the active translation provides one for
  // the matching key.
  const rawLimitations = Array.isArray(plan.limitations) ? plan.limitations : [];
  const translatedLimitations =
    langMatch?.limitations || translation?.limitations || [];
  const labelOverrides = new Map();
  if (Array.isArray(translatedLimitations)) {
    for (const tl of translatedLimitations) {
      if (tl && tl.key && tl.label) labelOverrides.set(tl.key, tl.label);
    }
  }
  const limitations = rawLimitations.length
    ? rawLimitations.map((lim) => {
        if (!lim || typeof lim !== 'object') return lim;
        const override = labelOverrides.get(lim.key);
        return override ? { ...lim, label: override } : lim;
      })
    : translatedLimitations; // fallback when the plan itself has no raw limitations
  const period = PERIOD_MAP[lang] || PERIOD_MAP.en;

  const yearlyPrice = plan.yearlyPrice ?? plan.price * 10;
  const ilsMonthlyPrice = usdToIlsRate ? convertUsdToIlsWithVat(plan.price, usdToIlsRate) : null;
  const ilsYearlyPrice = usdToIlsRate ? convertUsdToIlsWithVat(yearlyPrice, usdToIlsRate) : null;

  return {
    id: plan.id,
    slug: plan.slug,
    name: langMatch?.name || translation?.name || plan.name,
    description:
      langMatch?.description || translation?.description || plan.description || '',
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
