Read SPEC.md before every task. Track B also reads ELASTIC.md before any Elastic task. Build only the phase you are asked for. Ask before changing the data model or the stack.

## Tracks

Every session starts with "I am Track A" or "I am Track B". Only edit files your track owns.

| Track | Owns |
| --- | --- |
| A: Voice + AI pipeline | `convex/cartesia.ts`, `convex/calls.ts`, `convex/crons.ts`, `convex/pipeline.ts`, `convex/http.ts`, `convex/visits.ts`, `convex/claude.ts`, `apps/mobile/src/voice/*`, Cartesia agent configs |
| B: Data + apps | `convex/elastic.ts`, `convex/briefs.ts`, `/elastic/*`, `convex/patients.ts`, `convex/questions.ts`, `convex/alerts.ts`, `convex/appointments.ts`, `apps/doctor/*`, `apps/mobile/*` (except `src/voice`), both `theme.ts` files |
| Shared (Dev A approves) | `convex/schema.ts`, `convex/seed.ts`, `scripts/seed.ts`, root `package.json`, `SPEC.md`, `ELASTIC.md`, `CLAUDE.md` |

## Cross-track functions (the contract)

Do not change the args or return validators of these without both devs agreeing.

| Function | Owner | Called by |
| --- | --- | --- |
| `internal.elastic.indexCheckin` | B | A's pipeline (awaited, before marking the conversation `processed`) |
| `internal.elastic.reindexAll` | B | the seed |
| `internal.elastic.indexVisitChunks` | B | A's visit processing |
| `internal.elastic.searchVisit` | B | A's `/cartesia/search-visit` |
| `internal.claude.translateQuestion` | A | B's `questions.add` (non-English typed questions) |
| `api.calls.triggerNow`, `api.calls.getConversation` | A | B's "Call me now" button |
| `api.calls.getAccessToken` | A | A's voice client |
| `api.visits.generateUploadUrl`, `api.visits.create`, `api.visits.getByAppointment`, `api.visits.release` | A | B's visit upload, summary and review screens |
| `useVoiceSession` in `apps/mobile/src/voice` | A | B's in-app voice screen |

Track A writes `alerts` and voice `questions` rows directly from `convex/pipeline.ts`; Track B owns every read and every typed edit of those tables.

## Rules

- Stub handlers annotate their return type from the `returns` validator (`Promise<Infer<typeof x>>`), because Convex infers client types from the handler. Keep that annotation, or a real implementation, so the generated API stays accurate.
- Need a schema change or a new cross-track function? Stop and tell your human. They agree with the other dev in chat, then Dev A makes the change on `main` in its own small commit.
- Never hand-merge `convex/_generated/`. On a conflict there, take either side and run `npx convex dev --once` to regenerate it.
- Lockfile conflict: take `main`'s version, then run `npm install`.
- Add mobile packages with `npx expo install <pkg>` from `apps/mobile`, never plain `npm install`.
- Branches: `a/<feature>` and `b/<feature>`. Merge to `main` at least every 2 hours. Pull `main` before each new task.
- Apps never call Elastic, Claude or Cartesia directly, and no API key goes in an app.
- Run `npm run typecheck` from the repo root before declaring a task done.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
