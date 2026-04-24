// Currency allowlist shared by web + mobile + backend.
// Top 40 ISO 4217 codes covering the vast majority of real-world households.
// Unknown codes return CURRENCY_UNSUPPORTED from the backend.

export const SUPPORTED_CURRENCY_CODES = [
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'NZD',
  'SEK', 'KRW', 'SGD', 'NOK', 'MXN', 'INR', 'RUB', 'ZAR', 'TRY', 'BRL',
  'TWD', 'DKK', 'PLN', 'THB', 'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP',
  'AED', 'COP', 'SAR', 'MYR', 'RON', 'ARS', 'VND', 'PKR', 'EGP', 'NGN',
] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export function isSupportedCurrencyCode(code: string): code is SupportedCurrencyCode {
  return (SUPPORTED_CURRENCY_CODES as readonly string[]).includes(code);
}

/**
 * Format a minor-unit amount as localized currency.
 *
 * `amountMinor` is a string over the wire (bigint-safety) OR a `number | bigint`
 * when caller already parsed it. We accept all three shapes so callers don't
 * re-stringify just to call this helper.
 */
export function formatMoney(
  amountMinor: string | number | bigint,
  currencyCode: string,
  locale: string = typeof navigator !== 'undefined' ? navigator.language : 'en-US',
): string {
  const minor =
    typeof amountMinor === 'bigint'
      ? Number(amountMinor)
      : typeof amountMinor === 'number'
        ? amountMinor
        : Number(amountMinor);
  // Most currencies use 2 minor digits; JPY/KRW/etc use 0.
  // `Intl.NumberFormat` already handles the per-currency scale correctly when
  // we hand it a major-unit number. For 2-digit currencies we divide by 100;
  // for 0-digit currencies we divide by 1. Detect via Intl resolvedOptions.
  const fmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
  });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  const divisor = Math.pow(10, digits);
  return fmt.format(minor / divisor);
}
