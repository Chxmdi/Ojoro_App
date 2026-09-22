# Engineering System

## Recommended stack

- Mobile: React Native + Expo + TypeScript
- Web / host / admin: Next.js + TypeScript
- API: modular TypeScript backend
- Database: PostgreSQL + PostGIS
- Cache / ephemeral coordination: Redis
- Realtime: WebSocket/realtime gateway
- Async processing: durable queue
- Media: object storage + CDN
- Analytics: stable event stream + warehouse/product analytics
- Observability: OpenTelemetry + logs + metrics + crash reporting

## Architecture principles

- Start as a modular monolith with explicit domain boundaries.
- Extract services only under measured scale/ownership pressure.
- Enforce authorization in the backend, never only in the client.
- Treat location precision and audience as first-class data.
- Use idempotency for joins, payments, result writes and external webhooks.
- Use append-only audit events for verification and moderation changes.
- Version external/event contracts.
- High-risk behavior ships behind flags.

## Critical domain invariants

- Confirmed participants cannot exceed capacity.
- A user cannot be confirmed and waitlisted simultaneously.
- Precise location cannot be returned without a passing visibility decision.
- Plan Forming must not leak participant identities beyond audience rules.
- Challenge scoring must be deterministic for verified inputs.
- Verification changes require actor, timestamp and evidence metadata.
