import i18n from 'i18next';

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

function tr(key: string, params?: Record<string, unknown>): string {
  return i18n.isInitialized ? String(i18n.t(key, params as never)) : key;
}

function dayDiff(ts: number, now = new Date()): number {
  const a = new Date(ts);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOf(now) - startOf(a)) / 86400000);
}

function clock(d: Date): string {
  const h = d.getHours();
  const period = h < 6 ? 'lateNight' : h < 12 ? 'morning' : h < 13 ? 'noon' : h < 18 ? 'afternoon' : 'evening';
  return tr('time.clock', {
    period: tr(`time.period.${period}`),
    hour: h % 12 === 0 ? 12 : h % 12,
    minute: pad(d.getMinutes()),
  });
}

function dateLabel(d: Date): string {
  return tr('time.date', { month: tr(`time.month.${MONTHS[d.getMonth()]}`), day: d.getDate() });
}

/** Chat separator, e.g. "Today, 2:02 PM". */
export function separatorTime(ts: number): string {
  const d = new Date(ts);
  const diff = dayDiff(ts);
  const face = clock(d);
  if (diff === 0) return tr('time.separatorToday', { clock: face });
  if (diff === 1) return tr('time.separatorYesterday', { clock: face });
  if (diff < 7) return tr('time.separatorWeekday', { weekday: tr(`time.weekday.${WEEKDAYS[d.getDay()]}`), clock: face });
  return tr('time.separatorDate', { date: dateLabel(d), clock: face });
}

/** Group list subtitle, e.g. "14:05", "Yesterday", "Wed", "3/12". */
export function shortTime(ts: number): string {
  const d = new Date(ts);
  const diff = dayDiff(ts);
  if (diff === 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 1) return tr('time.yesterday');
  if (diff < 7) return tr(`time.weekday.${WEEKDAYS[d.getDay()]}`);
  return tr('time.shortDate', { month: d.getMonth() + 1, day: d.getDate() });
}

/** "Oct 25, 14:03", for logs the user may screenshot. Keeps a 24-hour clock. */
export function fullTime(ts: number): string {
  const d = new Date(ts);
  return tr('time.full', { date: dateLabel(d), hour: pad(d.getHours()), minute: pad(d.getMinutes()) });
}
