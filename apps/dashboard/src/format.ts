const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatMoney = (cents: number) => brl.format(cents / 100);

export function formatClock(minute: number): string {
  const total = 9 * 60 + minute;
  const day = Math.floor(total / 1440);
  const inDay = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(inDay / 60)).padStart(2, '0');
  const mm = String(inDay % 60).padStart(2, '0');
  return day > 0 ? `Day ${day + 1}, ${hh}:${mm}` : `${hh}:${mm}`;
}

export function formatDuration(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${hours / 24} days`;
}

export const typeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
