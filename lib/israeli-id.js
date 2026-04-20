// Israeli national ID (Teudat Zehut) checksum validator. The ID is 9 digits;
// shorter numeric inputs are left-padded with zeros per the official spec.
// The last digit is a Luhn-style check digit: multiply each digit alternately
// by 1 and 2, reduce values >= 10 by summing their digits (equivalent to
// subtracting 9), and the total must be divisible by 10.
export function isValidIsraeliId(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return false;
  const digits = String(input).replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 9) return false;
  const padded = digits.padStart(9, '0');

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(padded[i]) * ((i % 2) + 1);
    if (d >= 10) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}
