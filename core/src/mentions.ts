/**
 * Finds which of `names` are @-mentioned in `text`, in order of first
 * appearance. Longer names win, so "@小橙子" never also counts as "@小橙".
 * Both "@" and the full-width "＠" are accepted.
 */
export function parseMentions(text: string, names: string[]): string[] {
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' && text[i] !== '＠') continue;
    const hit = sorted.find((n) => lower.startsWith(n.toLowerCase(), i + 1));
    if (hit && !found.includes(hit)) found.push(hit);
  }
  return found;
}
