// One money format for the whole CRM: "$1,234 MXN" (thousands separators, no compact notation, no decimals).
export const formatMoney = (
  amount: number | null | undefined,
  currency = "MXN",
): string => {
  const n = Number(amount ?? 0);
  const body = Math.abs(n).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
  return `${n < 0 ? "-" : ""}$${body} ${currency}`;
};
