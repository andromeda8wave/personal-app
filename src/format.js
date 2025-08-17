export const fmtInt = (n, currency) =>
  new Intl.NumberFormat(undefined, {
    ...(currency ? { style: 'currency', currency } : {}),
    maximumFractionDigits: 0
  }).format(Math.round(n));

export const fmtCurrency2 = (n, currency) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);

export const fmtMonthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
    .format(new Date(y, m - 1, 1));
};
