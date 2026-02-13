import { formatDistanceToNowStrict } from 'date-fns';

const UNIT_SHORT: Record<string, string> = {
  second: 's',
  seconds: 's',
  minute: 'm',
  minutes: 'm',
  hour: 'h',
  hours: 'h',
  day: 'd',
  days: 'd',
  week: 'w',
  weeks: 'w',
  month: 'mo',
  months: 'mo',
  year: 'y',
  years: 'y',
};

export function formatRelativeShort(isoDate: string): string {
  const raw = formatDistanceToNowStrict(new Date(isoDate), { roundingMethod: 'floor' });
  const [value, unit] = raw.split(' ');
  const shortUnit = UNIT_SHORT[unit] || unit;
  return `${value}${shortUnit} ago`;
}
