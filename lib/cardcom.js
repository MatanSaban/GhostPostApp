/**
 * CardCom Open Fields Integration
 * 
 * Server-side helper for creating LowProfile deals and verifying payments.
 * Uses CardCom's Open Fields API for PCI-compliant payment processing.
 * 
 * Docs: https://support.cardcom.solutions/hc/he/articles/27878136278290
 * Backend example: https://github.com/CardCom/OpenFields-Backend-Node
 */

const CARDCOM_CONFIG = {
  apiName: process.env.CARDCOM_API_NAME || 'kzFKfohEvL6AOF8aMEJz',
  apiPassword: process.env.CARDCOM_API_PASSWORD || 'FIDHIh4pAadw3Slbdsjg',
  terminalNumber: process.env.CARDCOM_TERMINAL_NUMBER || '1000',
  baseUrl: process.env.CARDCOM_BASE_URL || 'https://secure.cardcom.solutions',
};

// ISO Coin IDs for CardCom
const CURRENCY_MAP = {
  ILS: 1,
  USD: 2,
  EUR: 3,
  GBP: 4,
};

/**
 * Create a LowProfile deal at CardCom.
 * Returns a LowProfileId to use with Open Fields iframes.
 * 
 * @param {Object} options
 * @param {number} options.amount - Total amount to charge
 * @param {string} [options.currency='ILS'] - Currency code  
 * @param {string} options.productName - Product/service description
 * @param {string} [options.language='he'] - UI language (he/en)
 * @param {string} [options.webhookUrl] - URL for CardCom to POST results
 * @param {Object} [options.document] - Invoice/receipt document details
 * @param {Array}  [options.products] - Line items for document
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
  products = null,
}) {
  const isoCoinId = CURRENCY_MAP[currency] || CURRENCY_MAP.ILS;

  const requestBody = {
    TerminalNumber: CARDCOM_CONFIG.terminalNumber,
    ApiName: CARDCOM_CONFIG.apiName,
    Operation: 'ChargeOnly', // 1 = Charge only
    Amount: amount,
    ProductName: productName,
    Language: language,
    ISOCoinId: isoCoinId,
    WebHookUrl: webhookUrl,
    FailedRedirectUrl: failedRedirectUrl || 'https://secure.cardcom.solutions/DealWasUnSuccessful',
    SuccessRedirectUrl: successRedirectUrl || 'https://secure.cardcom.solutions/DealWasSuccessful',
  };

  // Add document (invoice) if provided
  if (document) {
    requestBody.Document = document;
  }

  try {
    const response = await fetch(
      `${CARDCOM_CONFIG.baseUrl}/api/v11/LowProfile/create`,
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
 * Get the result of a LowProfile deal (verify payment).
 * Per CardCom v11 swagger, this is POST /api/v11/LowProfile/GetLpResult with
 * TerminalNumber + ApiName + ApiPassword + LowProfileId in the JSON body.
 *
 * @param {string} lowProfileId - The LowProfile ID to check
 * @returns {Promise<Object>} - Payment result details (IsSuccess, ResponseCode,
 *   Description, LowProfileId, TransactionInfo, DealNumber, DealStatusCode)
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

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('CardCom GetLpResult error:', error);
    throw error;
  }
}

/**
 * Build a CardCom Document object for invoice generation.
 * 
 * @param {Object} options
 * @param {string} options.customerName
 * @param {string} options.customerEmail
 * @param {string} [options.customerPhone]
 * @param {Array} options.products - [{productId, description, quantity, unitCost}]
 * @param {string} [options.language='he']
 * @returns {Object} CardCom Document object
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
    DocumentTypeToCreate: 'Receipt',
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

export { CARDCOM_CONFIG };
