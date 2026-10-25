const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const pad = (n: number) => String(n).padStart(2, '0');

function dayDiff(ts: number, now = new Date()): number {
  const a = new Date(ts);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOf(now) - startOf(a)) / 86400000);
}

function clock(d: Date): string {
  const h = d.getHours();
  const period = h < 6 ? '凌晨' : h < 12 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : '晚上';
  return `${period} ${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())}`;
}

/** Chat separator, e.g. "今天 下午 2:02". */
export function separatorTime(ts: number): string {
  const d = new Date(ts);
  const diff = dayDiff(ts);
  if (diff === 0) return `今天 ${clock(d)}`;
  if (diff === 1) return `昨天 ${clock(d)}`;
  if (diff < 7) return `${WEEKDAYS[d.getDay()]} ${clock(d)}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${clock(d)}`;
}

/** Group list subtitle, e.g. "14:05", "昨天", "周三", "3/12". */
export function shortTime(ts: number): string {
  const d = new Date(ts);
  const diff = dayDiff(ts);
  if (diff === 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 1) return '昨天';
  if (diff < 7) return WEEKDAYS[d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
