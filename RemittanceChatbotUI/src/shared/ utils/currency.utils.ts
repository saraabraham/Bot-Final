// currency.utils.ts
export interface CurrencyInfo {
    code: string;
    symbol: string;
    name: string;
    decimals: number;
}

export const CURRENCY_MAP: { [code: string]: CurrencyInfo } = {
    'USD': { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
    'EUR': { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
    'GBP': { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
    'INR': { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
    'CAD': { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
    'AUD': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
    'JPY': { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 }
};

/**
 * Get currency symbol from currency code
 */
export function getCurrencySymbol(currencyCode: string): string {
    return CURRENCY_MAP[currencyCode]?.symbol || currencyCode;
}

/**
 * Format currency amount with proper symbol and formatting
 */
export function formatCurrency(amount: number, currencyCode: string): string {
    const currencyInfo = CURRENCY_MAP[currencyCode] || { decimals: 2, symbol: currencyCode };

    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: currencyInfo.decimals,
        maximumFractionDigits: currencyInfo.decimals
    });

    return formatter.format(amount);
}

/**
 * Calculate fees based on amount and method
 */
export function calculateFees(amount: number, method: string): number {
    if (amount <= 0) return 0;

    // Simple fee calculation
    const feePercentage = method === 'bank' ? 0.02 :
        method === 'card' ? 0.03 :
            method === 'wallet' ? 0.01 : 0.025;

    const fee = amount * feePercentage;

    // Minimum fee
    return Math.max(fee, 2);
}