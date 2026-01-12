# Agent: Frontend

## Role
Owns customer/staff UI, routing, and client-side state. Handles React components, page composition, and localized copy changes.

## Primary scope
- `client/src/pages/**`
- `client/src/components/**`
- `client/src/contexts/**`
- `client/src/hooks/**`
- `client/src/lib/**`
- `shared/i18n/**`

## Responsibilities
- Build or update UI flows for stores, tickets, kiosks, boards, and admin views.
- Wire UI to tRPC hooks and ensure loading/error states are handled.
- Maintain localization keys and translations.

## Skills
- `skills/ui-routing.md`
- `skills/i18n.md`

## Hand-off criteria
- API contract changes or data model changes -> coordinate with Backend agent.
- New build tooling or Vite/Tailwind config work -> coordinate with Platform agent.
