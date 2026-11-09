export const DEPOSIT_MIN_GHS = 1;
export const DEPOSIT_MAX_GHS = 5000;

export function verifiedDepositCreditGhs(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < DEPOSIT_MIN_GHS * 100 || amountMinor > DEPOSIT_MAX_GHS * 100) {
    throw new Error("Invalid deposit amount");
  }
  return amountMinor / 100;
}