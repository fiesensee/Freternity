/**
 * Internally strings are indexed in tuning order: 1 = high E … 6 = low E.
 * The UI numbers them the other way round (1 = low E … 6 = high E), so every
 * string number shown to the user goes through these helpers.
 */

export function toDisplayStringNumber(stringIndex: number, stringCount = 6): number {
  return stringCount + 1 - stringIndex;
}

/** e.g. internal [1, 2, 3] (the high strings) → "4-5-6" */
export function formatStringSet(stringSet: readonly number[], stringCount = 6): string {
  return stringSet
    .map((s) => toDisplayStringNumber(s, stringCount))
    .sort((a, b) => a - b)
    .join('-');
}
