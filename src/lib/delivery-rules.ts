import { createHash } from 'node:crypto';

export type DeliveryPoint = {
  lat?: number;
  lng?: number;
  postalCode?: string;
  address?: string;
};

type DeliveryGuard = {
  allowDelivery: boolean;
  reason?: 'schedule';
  message?: string;
};

type EligibilityReason =
  | 'schedule'
  | 'postal_code'
  | 'distance'
  | 'location';

type EligibilityResult = {
  eligible: boolean;
  reason?: EligibilityReason;
  message?: string;
  fallback?: 'pickup';
};

const dayMap: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

type Window = {
  day: number;
  start: number;
  end: number;
};

const deliveryHoursRaw = process.env.DELIVERY_ALLOWED_HOURS || process.env.BUSINESS_OPENING_HOURS || '';
const deliveryTimezone = process.env.BUSINESS_TIMEZONE || 'Europe/Paris';
const allowedPostalCodes = (process.env.DELIVERY_ALLOWED_POSTAL_CODES || '')
  .split(',')
  .map(code => code.trim().toLowerCase())
  .filter(Boolean);
const originLat = process.env.DELIVERY_ORIGIN_LAT ? Number(process.env.DELIVERY_ORIGIN_LAT) : undefined;
const originLng = process.env.DELIVERY_ORIGIN_LNG ? Number(process.env.DELIVERY_ORIGIN_LNG) : undefined;
const maxDistanceKm = process.env.DELIVERY_MAX_DISTANCE_KM ? Number(process.env.DELIVERY_MAX_DISTANCE_KM) : undefined;

const scheduleWindows: Window[] = parseSchedule(deliveryHoursRaw);

function parseSchedule(input: string): Window[] {
  if (!input) return [];
  const windows: Window[] = [];
  const entries = input.split(';').map(entry => entry.trim()).filter(Boolean);

  for (const entry of entries) {
    const [dayPart, timePart] = entry.split(/\s+/);
    if (!dayPart || !timePart) continue;
    const days = expandDays(dayPart);
    const [startRaw, endRaw] = timePart.split('-');
    const start = parseTime(startRaw);
    const end = parseTime(endRaw);
    if (start == null || end == null) continue;

    for (const day of days) {
      if (end <= start) {
        windows.push({ day, start, end: 24 * 60 });
        windows.push({ day: (day + 1) % 7, start: 0, end });
      } else {
        windows.push({ day, start, end });
      }
    }
  }

  return windows;
}

function expandDays(token: string): number[] {
  const segments = token.split(',').map(s => s.trim()).filter(Boolean);
  const days: number[] = [];
  for (const segment of segments) {
    const range = segment.split('-').map(s => s.trim().toLowerCase());
    if (range.length === 1) {
      const day = dayMap[range[0]];
      if (day != null) days.push(day);
      continue;
    }
    if (range.length === 2) {
      const start = dayMap[range[0]];
      const end = dayMap[range[1]];
      if (start == null || end == null) continue;
      if (start <= end) {
        for (let d = start; d <= end; d++) days.push(d);
      } else {
        for (let d = start; d < 7; d++) days.push(d);
        for (let d = 0; d <= end; d++) days.push(d);
      }
    }
  }
  return days;
}

function parseTime(raw?: string): number | null {
  if (!raw) return null;
  const [h, m] = raw.split(':');
  const hour = Number(h);
  const minute = m != null ? Number(m) : 0;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function getLocalDayAndMinute(date: Date): { day: number; minutes: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: deliveryTimezone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find(part => part.type === 'weekday')?.value?.toLowerCase() ?? 'mon';
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? '0');

  const day = dayMap[weekday] ?? 1;
  const minutes = hour * 60 + minute;
  return { day, minutes };
}

function isWithinSchedule(now = new Date()): boolean {
  if (!scheduleWindows.length) return true;
  const { day, minutes } = getLocalDayAndMinute(now);
  return scheduleWindows.some(win => win.day === day && minutes >= win.start && minutes < win.end);
}

export function getDeliveryGuard(now = new Date()): DeliveryGuard {
  if (isWithinSchedule(now)) {
    return { allowDelivery: true };
  }

  const message = deliveryHoursRaw
    ? `Livraison disponible uniquement pendant les créneaux: ${deliveryHoursRaw}.`
    : 'Livraison indisponible pour le moment.';

  return { allowDelivery: false, reason: 'schedule', message };
}

function haversineDistanceKm(a: DeliveryPoint, b: DeliveryPoint): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
    return Infinity;
  }
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const aTerm = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(aTerm), Math.sqrt(1 - aTerm));
  return R * c;
}

const originPoint: DeliveryPoint | null =
  originLat != null && originLng != null ? { lat: originLat, lng: originLng } : null;

export function evaluateDeliveryEligibility(point: DeliveryPoint, now = new Date()): EligibilityResult {
  const scheduleGuard = getDeliveryGuard(now);
  if (!scheduleGuard.allowDelivery) {
    return {
      eligible: false,
      reason: 'schedule',
      message: scheduleGuard.message,
      fallback: 'pickup',
    };
  }

  if (allowedPostalCodes.length) {
    const normalized = point.postalCode?.toLowerCase().replace(/\s+/g, '') ?? '';
    if (!allowedPostalCodes.includes(normalized)) {
      return {
        eligible: false,
        reason: 'postal_code',
        message: `Livraison limitée aux codes postaux: ${allowedPostalCodes.join(', ')}.`,
        fallback: 'pickup',
      };
    }
  }

  if (originPoint && maxDistanceKm && maxDistanceKm > 0) {
    const distance = haversineDistanceKm(point, originPoint);
    if (!Number.isFinite(distance)) {
      return {
        eligible: false,
        reason: 'location',
        message: 'Coordonnées de livraison manquantes pour valider la zone.',
        fallback: 'pickup',
      };
    }
    if (distance > maxDistanceKm) {
      return {
        eligible: false,
        reason: 'distance',
        message: `Adresse hors zone de livraison (max ${maxDistanceKm.toFixed(1)} km).`,
        fallback: 'pickup',
      };
    }
  }

  return { eligible: true };
}

export function computeUberIdempotencyKey(prefix: string, payload: unknown): string {
  const json = JSON.stringify(payload);
  return createHash('sha256').update(`${prefix}:${json}`).digest('hex');
}
