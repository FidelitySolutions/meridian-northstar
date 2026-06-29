# MyNorthstar Patient Portal

**Agency:** Meridian Software
**Client:** Northstar Health Group
**Status:** Pilot Launch (January 2026)

---

## What This Is

MyNorthstar is a HIPAA-compliant patient portal built for Northstar Health Group. It allows patients to manage their healthcare interactions online: book and manage appointments, send secure messages to their care team, and view lab results.

---

## Features

- **Patient Authentication** — Account creation, login, password reset, HIPAA-compliant session management
- **Appointment Scheduling** — View available slots, book, reschedule, cancel. Integrates with AdvancedMD EHR.
- **Secure Messaging** — Encrypted patient-to-provider messaging with inbox and thread view
- **Lab Results** — View released lab results with email notification on availability

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Tailwind CSS, hosted on AWS Amplify
- **Backend:** Node.js + Express + TypeScript, hosted on AWS ECS (Fargate)
- **Database:** PostgreSQL 15 on AWS RDS
- **External Integration:** AdvancedMD EHR REST API
- **Encryption:** AES-256-GCM via AWS KMS (secure messaging)
- **Infrastructure:** AWS (us-east-1 primary)

See /canon/tech-stack.md for full stack documentation.

---

## Repository Structure

```
mynorthstar-portal/
  src/
    api/          # Express route handlers
    services/     # Business logic (auth, scheduling, messaging, lab results)
    models/       # Prisma schema and generated types
    utils/        # Shared utilities (timezone, encryption helpers)
  prisma/         # Database schema and migrations
  tests/          # Unit and integration tests
  .github/        # CI/CD workflows
  docs/           # Architecture and deployment documentation
```

---

## Running Locally

See /docs/onboarding.md for local setup instructions.

---

## Architecture Decisions

Key architectural decisions are documented in /adr:

- ADR-003: Secure messaging encryption approach (AES-256-GCM + KMS)
- ADR-004: Appointment timezone handling (UTC storage, display-layer conversion)
- ADR-005: AdvancedMD token refresh strategy (cron-based proactive refresh)

---

## Team

See /canon/team-roster.md for the full engagement team.

**Current contacts:**
- Project Manager: Diane Howell (Meridian Software)
- Backend Lead: Rafael Mendes
- Frontend Lead: Jordan Tate

---

## Notes

This repository contains the full engagement history from January 2025 through February 2026. Development artifacts, sprint notes, and incident reports are organized in the /sprint-notes, /incidents, and /client-notes directories and are intended for ingestion by the Project Brain knowledge platform.
