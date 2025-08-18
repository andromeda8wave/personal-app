const intFormatters = new Map();
export const fmtInt = (n, currency) => {
  const key = currency || 'none';
  let fmt = intFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      ...(currency ? { style: 'currency', currency } : {}),
      maximumFractionDigits: 0
    });
    intFormatters.set(key, fmt);
  }
  return fmt.format(Math.round(n));
};

const currency2Formatters = new Map();
export const fmtCurrency2 = (n, currency) => {
  const key = currency || 'RUB';
  let fmt = currency2Formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: key,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    currency2Formatters.set(key, fmt);
  }
  return fmt.format(n);
};

export const fmtMonthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
    .format(new Date(y, m - 1, 1));
};
