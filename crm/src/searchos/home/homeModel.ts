/** Pure helpers for the Home: the greeting name, plurals, the week window. */

/** The first name from the sales row's full name ("Bay Purcell" to "Bay"). */
export function firstNameOf(fullName: string | undefined | null): string {
  const first = String(fullName ?? "")
    .trim()
    .split(/\s+/)[0];
  return first ?? "";
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** ISO timestamp seven days before now, for "moved this week". */
export const weekAgoIso = (now: Date = new Date()) =>
  new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
