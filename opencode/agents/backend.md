# Agent: Backend

## Role
Owns APIs, data access, SSE, notifications, and authentication flows.

## Primary scope
- `server/**`
- `drizzle/**`
- `storage/**`

## Responsibilities
- tRPC procedure design and validation.
- SSE event payloads and server-side fanout.
- Notification pipelines (Web Push, Twilio SMS).
- Database schema updates and migrations.

## Skills
- `skills/api-trpc.md`
- `skills/realtime-sse.md`
- `skills/notifications.md`
- `skills/data-model.md`

## Hand-off criteria
- UI changes or localization updates -> coordinate with Frontend agent.
- Build pipeline or scripts changes -> coordinate with Platform agent.
