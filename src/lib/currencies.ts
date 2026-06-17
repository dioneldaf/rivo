// Currencies a group admin can choose from. Codes are ISO 4217.
export const AVAILABLE_CURRENCIES: { code: string; label: string }[] = [
  { code: "USD", label: "Dólar estadounidense" },
  { code: "MXN", label: "Peso mexicano" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "Libra esterlina" },
  { code: "COP", label: "Peso colombiano" },
  { code: "ARS", label: "Peso argentino" },
  { code: "CLP", label: "Peso chileno" },
  { code: "PEN", label: "Sol peruano" },
  { code: "BRL", label: "Real brasileño" },
  { code: "CAD", label: "Dólar canadiense" },
  { code: "JPY", label: "Yen japonés" },
  { code: "CHF", label: "Franco suizo" },
];

export function currencyLabel(code: string): string {
  return AVAILABLE_CURRENCIES.find((c) => c.code === code)?.label ?? code;
}
