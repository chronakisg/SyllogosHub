const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no ambiguous I, O
const LOWER = "abcdefghjkmnpqrstuvwxyz"; // no ambiguous i, l, o
const DIGITS = "23456789"; // no 0, 1
const SPECIAL = "!@#$%&*";
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

export function generatePassword(length = 12): string {
  const arr = new Uint8Array(length + 4);
  crypto.getRandomValues(arr);

  // Guarantee at least one character from each category
  const chars = [
    UPPER[arr[0] % UPPER.length],
    LOWER[arr[1] % LOWER.length],
    DIGITS[arr[2] % DIGITS.length],
    SPECIAL[arr[3] % SPECIAL.length],
  ];
  for (let i = 4; i < length + 4; i++) {
    chars.push(ALL[arr[i] % ALL.length]);
  }

  // Fisher-Yates shuffle
  const shuffleArr = new Uint8Array(chars.length);
  crypto.getRandomValues(shuffleArr);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffleArr[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.slice(0, length).join("");
}
