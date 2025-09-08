/**
 * Timezone conversion utilities for the scheduling module.
 * All appointment datetimes are stored in UTC (ADR-004).
 * This file handles conversion from UTC to clinic-local display time.
 *
 * Clinic timezone mapping:
 *   All DFW clinics  → America/Chicago  (CST/CDT)
 *   El Paso clinic   → America/Denver   (MST/MDT)
 *
 * The El Paso mapping is non-obvious — America/Denver is the correct IANA string
 * for MST/MDT, not America/El_Paso. See ADR-004.
 *
 * History: El Paso appointment confirmation emails showed wrong time (CST instead of
 * MST) from May–Oct 2025. Root cause was notification.service.ts using a hardcoded
 * America/Chicago instead of reading clinic.timezone from the appointment record.
 * Fixed in PR #97. See MNS-2025-056, MNS-2025-168, MNS-2025-078.
 */

/**
 * Format a UTC Date into a human-readable string in the given IANA clinic timezone.
 * Uses Intl.DateTimeFormat — handles DST transitions automatically.
 * Always pass hour12: true to avoid 24h format on some locales (PR #114 fix).
 */
export function formatAppointmentTime(utcDate: Date, clinicTimezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: clinicTimezone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(utcDate);
}

/**
 * Return the timezone abbreviation for a given clinic timezone and date.
 * e.g. America/Denver in winter → "MST", in summer → "MDT"
 * Used in email templates to show the timezone label alongside the time.
 */
export function getTimezoneAbbreviation(utcDate: Date, clinicTimezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: clinicTimezone,
    timeZoneName: 'short',
  }).formatToParts(utcDate);

  return parts.find((p) => p.type === 'timeZoneName')?.value ?? clinicTimezone;
}

/**
 * Convert a clinic-local datetime string (as returned by AdvancedMD) to a UTC Date.
 * AMD returns slot times in clinic local time with no explicit timezone header.
 * Timezone is inferred from the clinic record (ADR-004).
 */
export function clinicLocalToUtc(localDateString: string, clinicTimezone: string): Date {
  // Intl is not available for parsing in all Node environments — use the offset approach
  const localDate = new Date(localDateString);
  const utcString = new Intl.DateTimeFormat('en-US', {
    timeZone: clinicTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(localDate);

  return new Date(utcString + ' UTC');
}

// feat: complete advancedmd slot retrieval with timezone norma

// fix: partial el paso timezone fix applied standard-time slot

// fix: second attempt at el paso dst fix using intl datetime f
