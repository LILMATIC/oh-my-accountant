export const formatCurrency = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

export const formatPercent = (value: number | null) =>
  value === null ? 'new spend' : `${Math.round(value)}%`;
