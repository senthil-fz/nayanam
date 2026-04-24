/**
 * Phase 2 currency allowlist — top 40 ISO 4217 codes by global usage + app
 * relevance. Any code outside this set returns CURRENCY_UNSUPPORTED.
 *
 * Mirrored in `packages/core/src/currency.ts` so both clients surface the
 * same dropdown.
 */
export const SUPPORTED_CURRENCIES = new Set<string>([
  'USD', 'EUR', 'GBP', 'INR', 'JPY',
  'CNY', 'AUD', 'CAD', 'CHF', 'SGD',
  'HKD', 'NZD', 'SEK', 'NOK', 'DKK',
  'MXN', 'BRL', 'ZAR', 'KRW', 'AED',
  'SAR', 'TRY', 'THB', 'MYR', 'IDR',
  'PHP', 'VND', 'PLN', 'CZK', 'HUF',
  'RON', 'ILS', 'CLP', 'COP', 'ARS',
  'EGP', 'PKR', 'BDT', 'LKR', 'NPR',
]);

export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CURRENCIES.has(code);
}
