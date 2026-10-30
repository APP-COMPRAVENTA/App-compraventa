export const COLOMBIA_TIME_ZONE = 'America/Bogota';
export const COLOMBIA_UTC_OFFSET = '-05:00';

function getPart(parts, type) {
  return parts.find((part) => part.type === type)?.value || '';
}

export function getColombiaNow(date = new Date()) {
  const absoluteDate = date instanceof Date ? date : new Date(date);
  const formatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: COLOMBIA_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(absoluteDate);
  const day = getPart(parts, 'day');
  const month = getPart(parts, 'month');
  const year = getPart(parts, 'year');
  const hour = getPart(parts, 'hour');
  const minute = getPart(parts, 'minute');
  const second = getPart(parts, 'second');
  const weekday = getPart(parts, 'weekday');
  const dateKey = `${year}-${month}-${day}`;
  const timeKey = `${hour}:${minute}:${second}`;

  return {
    timeZone: COLOMBIA_TIME_ZONE,
    timestampMs: absoluteDate.getTime(),
    dateKey,
    timeKey,
    date: dateKey,
    time: timeKey,
    weekday,
    isoColombia: `${dateKey}T${timeKey}${COLOMBIA_UTC_OFFSET}`,
    iso: `${dateKey}T${timeKey}${COLOMBIA_UTC_OFFSET}`,
    readable: `${weekday}, ${day}/${month}/${year}, ${timeKey} hora Colombia`
  };
}

export function getTodayColombiaDateKey(date = new Date()) {
  return getColombiaNow(date).dateKey;
}

export function colombiaDateInputToTimestamp(dateKey, timeKey = '12:00:00') {
  const safeDateKey = String(dateKey || getTodayColombiaDateKey()).trim();
  const safeTimeKey = String(timeKey || '12:00:00').trim();
  return new Date(`${safeDateKey}T${safeTimeKey}${COLOMBIA_UTC_OFFSET}`).getTime();
}

export function getColombiaDayBounds(dateKey) {
  const safeDateKey = String(dateKey || getTodayColombiaDateKey()).trim();
  return {
    start: new Date(`${safeDateKey}T00:00:00${COLOMBIA_UTC_OFFSET}`).getTime(),
    end: new Date(`${safeDateKey}T23:59:59.999${COLOMBIA_UTC_OFFSET}`).getTime()
  };
}

export function formatDateColombia(value, options = {}) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('es-CO', {
    timeZone: COLOMBIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...options
  }).format(date);
}

export function getColombiaSearchDateText(value) {
  if (!value) return '';
  const meta = getColombiaNow(new Date(value));
  return [
    meta.dateKey,
    formatDateColombia(value),
    meta.readable
  ].filter(Boolean).join(' ').toLowerCase();
}

export function buildColombiaBusinessFields(prefix = 'createdAt', date = new Date()) {
  const meta = getColombiaNow(date);

  return {
    [prefix]: meta.timestampMs,
    [`${prefix}Colombia`]: meta,
    dateKey: meta.dateKey,
    timeKey: meta.timeKey,
    weekday: meta.weekday
  };
}
