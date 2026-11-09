export function ghanaPhone(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, "");
  if (/^0[235]\d{8}$/.test(digits)) return `+233${digits.slice(1)}`;
  if (/^[235]\d{8}$/.test(digits)) return `+233${digits}`;
  if (/^\+?233[235]\d{8}$/.test(digits)) return `+${digits.replace(/^\+/, "")}`;
  return null;
}