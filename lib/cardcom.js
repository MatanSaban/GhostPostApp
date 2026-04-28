/**
 * CardCom Open Fields Integration
 *
 * Server-side helpers for the v11 LowProfile + Transactions API. Two-step
 * subscription charge flow:
 *   1. createLowProfile({ operation: 'CreateTokenOnly', jValidateType: 2 })
 *      validates the card via J2 (catches bad CVV / expired card without
 *      charging) AND issues a token we can keep on file.
 *   2. After we accept the card type (block debit/gift), chargeWithToken()
 *      runs Transactions/Transaction with the token + ExternalUniqTranId so
 *      the actual charge is idempotent against accidental retries.
 *
 * Docs: https://support.cardcom.solutions/hc/he/articles/27878136278290
 */

const CARDCOM_CONFIG = {
  apiName: process.env.CARDCOM_API_NAME || 'kzFKfohEvL6AOF8aMEJz',
  apiPassword: process.env.CARDCOM_API_PASSWORD || 'FIDHIh4pAadw3Slbdsjg',
  terminalNumber: process.env.CARDCOM_TERMINAL_NUMBER || '1000',
  baseUrl: process.env.CARDCOM_BASE_URL || 'https://secure.cardcom.solutions',
};

const CURRENCY_MAP = {
  ILS: 1,
  USD: 2,
  EUR: 3,
  GBP: 4,
};

/**
 * Create a LowProfile deal at CardCom. Returns a LowProfileId for the Open
 * Fields iframes to bind to.
 *
 * @param {Object}  options
 * @param {number}  options.amount
 * @param {string}  [options.currency='ILS']
 * @param {string}  [options.productName]
 * @param {string}  [options.language='he']
 * @param {string}  [options.webhookUrl]
 * @param {string}  [options.successRedirectUrl]
 * @param {string}  [options.failedRedirectUrl]
 * @param {Object}  [options.document]
 * @param {string}  [options.operation='ChargeOnly']  - CardCom Operation enum.
 *   Valid: 'ChargeOnly' | 'ChargeAndCreateToken' | 'CreateTokenOnly' |
 *          'SuspendedDeal' | 'Do3DSAndSubmit'
 * @param {number}  [options.jValidateType]            - 2 (J2: card check
 *   only, no charge) or 5 (J5: capture/auth hold). Only honored for
 *   'CreateTokenOnly' / 'SuspendedDeal'.
 * @param {string}  [options.returnValue]              - Echoed back unchanged
 *   (typically our internal payment id).
 * @returns {Promise<{LowProfileId: string, ...}>}
 */
export async function createLowProfile({
  amount,
  currency = 'ILS',
  productName,
  language = 'he',
  webhookUrl = '',
  successRedirectUrl = '',
  failedRedirectUrl = '',
  document = null,
  operation = 'ChargeOnly',
  jValidateType,
  returnValue,
}) {
  const isoCoinId = CURRENCY_MAP[currency] || CURRENCY_MAP.ILS;

  const requestBody = {
    TerminalNumber: CARDCOM_CONFIG.terminalNumber,
    ApiName: CARDCOM_CONFIG.apiName,
    Operation: operation,
    Amount: amount,
    ProductName: productName,
    Language: language,
    ISOCoinId: isoCoinId,
    WebHookUrl: webhookUrl,
    FailedRedirectUrl: failedRedirectUrl || 'https://secure.cardcom.solutions/DealWasUnSuccessful',
    SuccessRedirectUrl: successRedirectUrl || 'https://secure.cardcom.solutions/DealWasSuccessful',
  };

  if (returnValue) {
    requestBody.ReturnValue = String(returnValue).slice(0, 250);
  }

  // JValidateType only applies to CreateTokenOnly + SuspendedDeal per docs.
  if (jValidateType && (operation === 'CreateTokenOnly' || operation === 'SuspendedDeal')) {
    requestBody.AdvancedDefinition = {
      ...(requestBody.AdvancedDefinition || {}),
      JValidateType: jValidateType,
    };
  }

  if (document) {
    requestBody.Document = document;
  }

  try {
    const response = await fetch(
      `${CARDCOM_CONFIG.baseUrl}/api/v11/LowProfile/Create`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();

    if (!data.LowProfileId) {
      console.error('CardCom LowProfile creation failed:', data);
      throw new Error(data.Description || data.Message || 'Failed to create payment session');
    }

    return data;
  } catch (error) {
    console.error('CardCom API error:', error);
    throw error;
  }
}

/**
 * Get the result of a LowProfile deal. Used after the iframe HandleSubmit
 * fires, to verify the deal server-side instead of trusting the postMessage.
 *
 * @param {string} lowProfileId
 * @returns {Promise<Object>}
 */
export async function getLowProfileResult(lowProfileId) {
  try {
    const response = await fetch(
      `${CARDCOM_CONFIG.baseUrl}/api/v11/LowProfile/GetLpResult`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          TerminalNumber: CARDCOM_CONFIG.terminalNumber,
          ApiName: CARDCOM_CONFIG.apiName,
          ApiPassword: CARDCOM_CONFIG.apiPassword,
          LowProfileId: lowProfileId,
        }),
      }
    );

    return await response.json();
  } catch (error) {
    console.error('CardCom GetLpResult error:', error);
    throw error;
  }
}

/**
 * Charge a previously-created token via Transactions/Transaction (DoTransaction).
 * Used both for the real charge after CreateTokenOnly+J2 validation and for
 * future addon / recurring charges where we already have the token on file.
 *
 * @param {Object}  options
 * @param {string}  options.token              - CardCom token (UUID).
 * @param {string}  options.cardExpirationMMYY - "MMYY" (e.g. "1228" for 12/28).
 * @param {number}  options.amount
 * @param {string}  [options.currency='ILS']
 * @param {string}  options.externalUniqTranId - up to 25 chars, deterministic
 *   per logical attempt (CardCom returns code 608 on duplicate).
 * @param {Object}  [options.cardOwnerInformation] - { Phone, FullName,
 *   IdentityNumber, CardOwnerEmail }
 * @param {Object}  [options.document]
 * @param {number}  [options.numOfPayments=1]
 * @returns {Promise<Object>}
 */
export async function chargeWithToken({
  token,
  cardExpirationMMYY,
  amount,
  currency = 'ILS',
  externalUniqTranId,
  cardOwnerInformation = null,
  document = null,
  numOfPayments = 1,
}) {
  if (!token) throw new Error('chargeWithToken: token is required');
  if (!cardExpirationMMYY) throw new Error('chargeWithToken: cardExpirationMMYY is required');
  if (!externalUniqTranId) throw new Error('chargeWithToken: externalUniqTranId is required');

  const isoCoinId = CURRENCY_MAP[currency] || CURRENCY_MAP.ILS;

  const requestBody = {
    TerminalNumber: CARDCOM_CONFIG.terminalNumber,
    ApiName: CARDCOM_CONFIG.apiName,
    Amount: amount,
    Token: token,
    CardExpirationMMYY: cardExpirationMMYY,
    ISOCoinId: isoCoinId,
    NumOfPayments: numOfPayments,
    ExternalUniqTranId: String(externalUniqTranId).slice(0, 25),
    // Per docs: when a duplicate ExternalUniqTranId is sent, return the
    // original transaction's response instead of an error. This makes our
    // confirm path safely idempotent against client retries.
    ExternalUniqUniqTranIdResponse: true,
    Advanced: {
      ApiPassword: CARDCOM_CONFIG.apiPassword,
    },
  };

  if (cardOwnerInformation) {
    requestBody.CardOwnerInformation = cardOwnerInformation;
  }

  if (document) {
    requestBody.Document = document;
  }

  try {
    const response = await fetch(
      `${CARDCOM_CONFIG.baseUrl}/api/v11/Transactions/Transaction`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    return await response.json();
  } catch (error) {
    console.error('CardCom DoTransaction error:', error);
    throw error;
  }
}

/**
 * Build a CardCom Document object for invoice generation.
 */
export function buildDocument({
  customerName,
  customerEmail,
  customerPhone = '',
  products = [],
  language = 'he',
}) {
  return {
    Name: customerName,
    Email: customerEmail,
    Phone: customerPhone,
    IsSendByEmail: true,
    Language: language,
    DocumentTypeToCreate: 'TaxInvoiceAndReceipt',
    IsAllowEditDocument: false,
    IsShowOnlyDocument: false,
    Products: products.map((p) => ({
      ProductID: p.productId || '',
      Description: p.description,
      Quantity: p.quantity || 1,
      UnitCost: p.unitCost,
      TotalLineCost: (p.unitCost || 0) * (p.quantity || 1),
    })),
  };
}

// Card type codes we recognize from CardCom responses.
const GIFT_CARD_INFO = 'GiftCard';
const DEBIT_CARD_INFO = 'ImmediateChargeCard';
const DEBIT_PAYMENT_TYPE = 'ImmediateCharge';

/**
 * Inspect a CardCom TranzactionInfo and return why (if at all) we should
 * refuse this card. Returns null if the card is acceptable.
 *
 * Gift cards are NEVER accepted, anywhere — they don't have the guarantees
 * we need for any kind of charge.
 *
 * Debit cards (Israeli "כרטיס חיוב מיידי") are blocked for subscription /
 * recurring use because they don't support card-on-file token charges
 * reliably; on one-shot addon purchases entered via a fresh card the user
 * can opt in by passing { allowDebit: true }.
 *
 * @param {Object} tranzactionInfo - From GetLpResult or DoTransaction.
 * @param {Object} [options]
 * @param {boolean} [options.allowDebit=false] - true on the addon
 *   "use a different card" path; false (default) on subscriptions and
 *   anywhere we'll later try to charge a saved token.
 * @returns {{reason: string, code: string} | null}
 */
export function getBlockedCardReason(tranzactionInfo, { allowDebit = false } = {}) {
  if (!tranzactionInfo) return null;
  const cardInfo = tranzactionInfo.CardInfo;
  const paymentType = tranzactionInfo.PaymentType;

  if (cardInfo === GIFT_CARD_INFO) {
    return { code: 'GIFT_CARD_BLOCKED', reason: 'Gift cards are not accepted' };
  }

  if (!allowDebit) {
    if (cardInfo === DEBIT_CARD_INFO) {
      return { code: 'DEBIT_CARD_BLOCKED', reason: 'Debit cards are not supported for subscriptions' };
    }
    if (paymentType === DEBIT_PAYMENT_TYPE) {
      return { code: 'DEBIT_CARD_BLOCKED', reason: 'Debit cards are not supported for subscriptions' };
    }
  }

  return null;
}

/**
 * Same logic as getBlockedCardReason but applied to a stored PaymentMethod
 * row (which carries the same CardInfo / PaymentType metadata captured at
 * the time the token was created). Use this to filter the "saved cards"
 * picker in the dashboard.
 *
 * @param {Object} paymentMethod - PaymentMethod row from Prisma.
 * @param {Object} [options]
 * @param {boolean} [options.allowDebit=false]
 * @returns {boolean} True if the card is OK to charge under these rules.
 */
export function isPaymentMethodEligible(paymentMethod, { allowDebit = false } = {}) {
  if (!paymentMethod) return false;
  if (paymentMethod.cardInfo === GIFT_CARD_INFO) return false;
  if (!allowDebit) {
    if (paymentMethod.cardInfo === DEBIT_CARD_INFO) return false;
    if (paymentMethod.paymentType === DEBIT_PAYMENT_TYPE) return false;
  }
  return true;
}

/**
 * Build a deterministic ExternalUniqTranId (up to 25 chars) from a
 * lowProfileId so retries of the same charge attempt are recognized as
 * duplicates by CardCom (returning code 608 with the original response).
 */
export function externalUniqTranIdFromLpId(lowProfileId) {
  if (!lowProfileId) throw new Error('externalUniqTranIdFromLpId: lowProfileId required');
  return String(lowProfileId).replace(/-/g, '').slice(0, 24);
}

// CardCom document type literals we use.
export const DOCUMENT_TYPES = {
  TAX_INVOICE_AND_RECEIPT: 'TaxInvoiceAndReceipt',
  TAX_INVOICE: 'TaxInvoice',
  RECEIPT: 'Receipt',
};

export { CARDCOM_CONFIG };
