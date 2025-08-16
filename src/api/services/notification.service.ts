/**
 * Email notification dispatch service.
 * Handles appointment confirmations/cancellations, lab result alerts,
 * and messaging reply notifications.
 *
 * HIPAA note: provider reply notification emails must NOT include message body content.
 * Only the thread subject and a portal login link are included. Including PHI in email
 * would transmit unencrypted health information through an external channel.
 *
 * Timezone note: appointment emails must use clinic.timezone from the appointment record.
 * Do NOT hardcode 'America/Chicago'. The El Paso clinic uses 'America/Denver'.
 * Hardcoded offset was the root cause of MNS-2025-056/MNS-2025-168 (May–Oct 2025).
 * Fixed in PR #97 by reading clinic.timezone dynamically and using Intl.DateTimeFormat.
 *
 * Session note: read patient email from the appointment record (patient.email via join),
 * not from req.user. req.user is null if session expired during async dispatch.
 * Fixed in PR #100 (MNS-2025-121).
 */

import nodemailer from 'nodemailer';
import { formatAppointmentTime, getTimezoneAbbreviation } from '../utils/timezone.util';
import { logger } from '../utils/logger.util';
import { prisma } from '../../config/database';

const PORTAL_URL = process.env.PORTAL_URL ?? 'https://mynorthstar.northstarhealth.com';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? 'support@northstarhealth.com';

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({ from: `"MyNorthstar" <noreply@northstarhealth.com>`, to, subject, html });
  logger.info('notification_sent', { to, subject });
}

/**
 * Send appointment booking confirmation email.
 * Reads clinic.timezone from the appointment record — not hardcoded (PR #97).
 * Reads patient.email via DB join — not from session context (PR #100).
 */
export async function sendAppointmentConfirmation(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { clinic: true, patient: true },
  });

  const { clinic, patient } = appointment;
  const apptDate = new Date(appointment.startsAtUtc);
  const localTime = formatAppointmentTime(apptDate, clinic.timezone);
  const tzLabel = getTimezoneAbbreviation(apptDate, clinic.timezone);

  const html = `
    <p>Your appointment has been confirmed.</p>
    <p><strong>Clinic:</strong> ${clinic.name}</p>
    <p><strong>Date &amp; Time:</strong> ${localTime} ${tzLabel}</p>
    <p><strong>Address:</strong> ${clinic.location}</p>
    <p>To view or manage your appointment, log in at <a href="${PORTAL_URL}">${PORTAL_URL}</a>.</p>
    <p>Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
  `;

  await send(patient.email, 'Your appointment is confirmed — MyNorthstar', html);
}

/**
 * Send appointment cancellation confirmation email.
 * Uses the same clinic.timezone pattern as booking confirmation (PR #109).
 */
export async function sendAppointmentCancellation(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { clinic: true, patient: true },
  });

  const { clinic, patient } = appointment;
  const apptDate = new Date(appointment.startsAtUtc);
  const localTime = formatAppointmentTime(apptDate, clinic.timezone);
  const tzLabel = getTimezoneAbbreviation(apptDate, clinic.timezone);
  const cancelledAt = new Date().toLocaleString('en-US', { timeZone: clinic.timezone });

  const html = `
    <p>Your appointment has been cancelled.</p>
    <p><strong>Clinic:</strong> ${clinic.name}</p>
    <p><strong>Original appointment:</strong> ${localTime} ${tzLabel}</p>
    <p><strong>Cancelled at:</strong> ${cancelledAt} ${tzLabel}</p>
    <p>To book a new appointment, log in at <a href="${PORTAL_URL}">${PORTAL_URL}</a>.</p>
    <p>Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
  `;

  await send(patient.email, 'Your appointment has been cancelled — MyNorthstar', html);
}

/**
 * Send lab result available notification email.
 * Email contains result type and portal link only — no PHI values in body.
 */
export async function sendLabResultNotification(patientId: string, resultType: string): Promise<void> {
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });

  const html = `
    <p>Your ${resultType} results are now available in MyNorthstar.</p>
    <p>Log in to view your results: <a href="${PORTAL_URL}/lab-results">${PORTAL_URL}/lab-results</a></p>
    <p>Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
  `;

  await send(patient.email, 'Your lab results are available — MyNorthstar', html);
}

/**
 * Send provider reply notification email.
 * Subject line and login link only — no message content per HIPAA requirement.
 */
export async function sendProviderReplyNotification(patientId: string, threadSubject: string): Promise<void> {
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });

  const html = `
    <p>Your care team has replied to your message: <strong>${threadSubject}</strong></p>
    <p>Log in to read the reply: <a href="${PORTAL_URL}/messages">${PORTAL_URL}/messages</a></p>
    <p>For your security, message content is not included in this email.</p>
  `;

  await send(patient.email, `New message reply: ${threadSubject} — MyNorthstar`, html);
}

// feat: implement patient notification email on provider reply

// feat: begin lab results notification email dispatch wired to

// feat: complete lab results notification email and test full 

// fix: begin el paso appointment notification timezone fix rea
