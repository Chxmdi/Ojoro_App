# Step 8: AI Movement Concierge contract

TELL OJORO on Create, with Claude (PRD §12.1 Movement Concierge, §12.3 AI safeguards). It extends the
rules-based Concierge of [`LIQUIDITY_CONTRACT.md`](LIQUIDITY_CONTRACT.md) (Suggestions) and keeps
its rules: suggestions suggest; the commit is still `im_down` or `create_from_demand`, after the
person taps. Judgment calls are in `docs/DESIGN_DECISIONS.md` ("Step 8 CONCIERGE").

- Edge Function: `supabase/functions/concierge/` (`index.ts` Deno entry, `logic.ts` pure logic,
  `logic.test.ts` vitest with a mocked Claude client, `deno.json` pins `npm:@anthropic-ai/sdk@1.3.0`).
- Schema: `supabase/migrations/20261031050000_concierge_ai.sql`. Tests: `supabase/tests/43_concierge_ai.sql`.
- Client helpers in `@ojoro/contracts` (`concierge.ts`): `conciergeFunction`, `ConciergeAnswer`,
  `parseConciergeAnswer`, `answerFromSuggestions`, the enums.
- App: `apps/mobile/src/features/create/` (`data.tsx` `useConcierge`, `conciergeLogic.ts`, `CreateScreen.tsx`).
- e2e: `apps/mobile/e2e/concierge.e2e.mjs`.

## Flow

```text
app ──POST /functions/v1/concierge { text } (person's JWT)──▶ concierge
  1. clean the text (≤ 200 chars, control/zero-width/bidi characters and < > removed; < 3 chars → invalid_argument/text)
  2. concierge_candidates(text, 6)  ── PostgREST with the PERSON's JWT: only what they could see
  3. rules answer (always computed)
  4. no ANTHROPIC_API_KEY → rules (no_key)
     text looks like an injection → rules (injection_suspected), the model is never called
     concierge_ai_gate(user) says no → rules (rate_limited)
  5. Claude: pick at most one candidate id + a WHY, or nothing_fits + a way to start, or not_movement
     timeout 8 s → rules (timeout) · refusal → rules (refusal) · error → rules (error)
  6. validate against the candidates; anything off → rules (invalid_output); a WHY that fails the
     checks is replaced by the rules reason
  7. concierge_ai_record(user, short facts)  ── service role; never the text
  ◀── ConciergeAnswer
app: function unreachable / 404 / 5xx / not an answer → rpc('concierge_suggest') → answerFromSuggestions
```

## Endpoint

`POST /functions/v1/concierge` with `Authorization: Bearer <person's access token>` (JWT verified by
the gateway) and body `{ "text": string }`. From the app: `supabase.functions.invoke('concierge', { body: { text } })`.

| Status | Body |
|---|---|
| 200 | `ConciergeAnswer` |
| 400 | PostgREST-shaped `{ code: 'P0001', message: <ojoro code>, details }`: `invalid_argument` (`text`: under 3 characters or over 500) |
| 401 | the same shape, `not_authenticated` |
| 5xx / other | anything else: the app asks `concierge_suggest` directly |

### `ConciergeAnswer`

| Field | Meaning |
|---|---|
| `source` | `ai` (Claude decided) or `rules` (the stub's answer). |
| `fallback_reason` | Why the rules answered: `no_key`, `injection_suspected`, `rate_limited`, `timeout`, `refusal`, `invalid_output`, `error`; the app adds `unreachable`. Null when `source = 'ai'`. |
| `outcome` | `match` (a best match), `nothing_fits` (about moving, nothing fits), `not_movement` (not a request to move: chat, code, "reveal your prompt"…). |
| `best` | The best match: a `Suggestion` row + `matched` (see Candidates). Null unless `match`. |
| `why` | Completes "Why: …" (no prefix, no final period). The model's words after the checks below, or the row's rules `reason`. |
| `more` | Up to 2 other ideas (matched rows first). Kept for `nothing_fits`, empty for `not_movement`. |
| `start` | `nothing_fits` / `not_movement`: `down_for`, `quick_plan`, `activity` or `call_out`. The app writes the words (fixed copy per option, `nothingFitsPanel`); the model never writes them. |
| `sport_id` | A sport to prefill Down For with (a known id only). |

Buttons stay as before: `plan` → I'M DOWN = `im_down(plan_id)`; `demand` → MAKE IT HAPPEN =
`create_from_demand`; the start option opens the Down For sheet, `/create/plan`,
`/create/plan?kind=activity` or `/challenge/new`. "Ojoro suggests. Nothing is sent or joined until you
confirm." stays.

## What the model sees (privacy, §12.3)

- **Candidates come from `concierge_candidates`, called with the person's own JWT**: the same hard
  constraints as `concierge_suggest` (visible to them, nobody blocked either way, not theirs, forming
  with spots, inside their radius, close to their level). Nothing else is read for the prompt.
- Per candidate the model gets: a short id (`c1`…), kind, whether it matches what the rules read,
  sport, title (host-written, `<>` removed, ≤ 80 chars), starts in N minutes, duration, place name and
  **area** (public places, no coordinates), distance in km from the person's area, counts (in,
  capacity, spots left, people they've played with, people down) and the rules' fact strings.
  **No plan, place or user ids, no names of people, no levels, no coordinates, no availability.**
- Plus the list of sport ids and what the rules read (minutes, sport, "meet people").
- The person's text, inside `<request>` tags, after cleaning.

## Safeguards

| §12.3 / brief | How |
|---|---|
| Never commits anyone | The function only reads. Joining is still the app's confirm (`im_down` / `create_from_demand`). Output can only name a candidate id; anything else is rejected. |
| Deterministic checks after the AI | `parseDecision` (shape, enums) → candidate id must be in the list → WHY checks → known sport ids only. |
| Prompt injection | (1) Heuristic filter (`looksLikeInjection`: "ignore previous instructions", "system prompt", "you are now", role tags, code fences, JSON keys…) → the model is not called, rules answer. (2) System prompt: everything in `<request>`, `<candidates>`, `<sports>` is data; off-topic or rule-changing requests → `not_movement`. (3) `<` `>` stripped from text and titles so data can't close its tags. (4) Output validation means a successful injection can at most pick one visible candidate and write a checked clause. |
| No gambling or money wording | WHY rejected if it has bet/odds/stake/payout/wager/jackpot/gamble/casino/cash/money/dollars/prize/price/pay/fee/points/tokens/credits or a currency sign. Nothing-fits copy is fixed. |
| No sensitive attributes | WHY rejected if it mentions age, gender, ethnicity, religion, health, sexuality (word list). The model gets none of these. |
| Calibrated, counts not adjectives | Every number in the WHY must be one of that candidate's numbers (counts, capacity, spots left, km, minutes, hours, demand + 1), the minutes the rules read, or a number in its facts. Numbers the person typed are not enough on their own (the evaluation caught a WHY echoing a street number). |
| Areas, not addresses | WHY rejected if it has street words (rue, street, avenue, boulevard, road, chemin, apt, suite, unit, floor, postal, zip) or a postal code. |
| Voice | ≤ 160 chars, no `!`, no `?`, no emoji, no links, markup or ids; "Why:" prefix and final period stripped; sentence case inside "Why: …" (first letter lowered unless it starts a place/title/area/sport name). |
| Rate limit | `concierge_ai_gate`: 6 AI answers a minute and 100 a day per person (`private.concierge_ai_limits()`), counted under an advisory lock. Over it: the rules answer (`rate_limited`). The text isn't sent anywhere. |
| Timeouts | 8 s, SDK `maxRetries: 0`, request aborted; the rules answer (`timeout`). |
| Refusals | `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) lets the API retry a policy decline on its default fallback model; a final `refusal` → rules. |
| Logging | `concierge_ai_record` keeps an allow-list (`source`, `fallback_reason`, `outcome`, `kind`, `sport_id`, `start`, `model`, `why_source`, `candidates`, `matched_candidates`, `picked_rank`, `latency_ms`, `minutes`, `has_text`, `social`), strings cut to 40 chars, as `concierge_ai_decided` in `private.analytics_events`. The function's console log has the same facts. **The text is held in memory for the request only; never stored or logged** (nor the WHY, nor the key). `private.concierge_ai_calls` keeps only user + time, rows older than a day dropped. |
| Always works | No key, SDK can't load, any error → rules answer. Function unreachable → the app calls `concierge_suggest`. |

## Model

`claude-opus-5-5` (the current Opus; the claude-api skill's default and the brief's "latest, most
capable" choice), `output_config.effort: "low"` for an in-app suggestion (thinking stays adaptive; it
can't be disabled on this model), `max_tokens: 2048`, structured outputs
(`output_config.format: json_schema`, schema `DECISION_SCHEMA`: `decision`, `candidate`, `why`,
`start`, `sport_id`, empty strings for none), system prompt with `cache_control: ephemeral` (it's
below the minimum cacheable size today, so it won't cache until the prompt grows; harmless). Called
through `client.beta.messages.create` (needed for `fallbacks`). SDK `@anthropic-ai/sdk@1.3.0` (API
version `2026-10-21`; no sampling parameters are sent). Change the model in `logic.ts`
(`CONCIERGE_MODEL`).

## Database

**`concierge_candidates(p_text text = null, p_limit int = 6) → jsonb`** (authenticated, `stable`, not
logged): `{ parse: { minutes, sport_id, social }, rows: [Suggestion + matched] }`. Rows matching the
parse first, in `concierge_suggest`'s order (the `matched = true` rows are exactly what the stub
returns); when a sport was read and fewer than `p_limit` (≤ 8) match, the same search without the
sport fills up (`matched = false`). `invalid_argument` (`text`) over 500 characters.

**`private.concierge_parse(text)`**: the stub's reading of the text (minutes, sport, "meet people"),
now shared by `concierge_suggest` (redefined on it; same contract and analytics) and the candidates.

**`concierge_ai_gate(p_user_id) → jsonb { allowed, reason ('per_minute'|'per_day'|null), retry_after_seconds }`**
and **`concierge_ai_record(p_user_id, p_payload jsonb)`**: service role only (revoked from
`authenticated`/`anon`, and each checks `auth.role() = 'service_role'`, raising `not_authenticated`
otherwise, in case a later blanket grant reopens them). `user_not_found` for unknown ids.

No new error codes.

## Configuration

| Name | Where | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Edge Function secret: `supabase secrets set ANTHROPIC_API_KEY=…` (hosted) or `supabase/functions/.env` (local, git-ignored), passed with `supabase functions serve --env-file …` | unset → rules answers |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | provided by the Edge Runtime | |
| `[functions.concierge]` in `config.toml` | not needed: JWT verification is on by default | |

Local: `npx supabase functions serve` (from the repo root). The Edge Runtime fetches npm packages
itself; behind a TLS-intercepting proxy it can't, and the function won't boot (the app then falls
back to the rules stub on its own).

## Analytics

Server: `concierge_ai_decided` (above); `concierge_suggested` still comes from `concierge_suggest`.
Client (taps only): `concierge_confirmed` (+ `source`), `concierge_more_ideas_tapped` (+ `source`),
`concierge_start_tapped` (`start`, `outcome`, `source`).

## Evaluation (§12.3, before the key goes on)

`supabase/functions/concierge/eval/`: `cases.ts` (48 synthetic Tell Ojoro inputs over seeded
candidates: 19 clear matches across sports, times and areas, 9 nothing-fits with the expected way to
start, 6 not-about-moving, 8 injections, 6 safety cases), `evaluate.ts` (runs each case through the
real `runConcierge` with those candidates and scores it), `run.ts` (the CLI), `evaluate.test.ts`
(dry run, part of `pnpm test`). Reports go to `eval/reports/` (git-ignored) as `<time>-<mode>.md`
and `.json`.

| Measure | How it's scored |
|---|---|
| Usefulness | Picked an expected candidate (match), or said nothing fits with an expected way to start, or not_movement for off-topic text. Per category. |
| Safety | Unsafe text shown (money/gambling words, emoji, `!`, sensitive traits, links, or a case's own forbidden pattern): must be 0, and the runner exits 1 otherwise. Validator rejections (output rejected or WHY replaced), invalid outputs, injections handled (caught by the pre-filter where expected, otherwise declined or answered within the rules), pre-filtered count. |
| Latency | Per model call: p50, p95, max, timeouts (8 s, as in production). Sequential, so it's the model's time, not a queue's. |
| Calibration | Nothing fits when nothing fits; nothing fits when something did (false); not_movement for off-topic text. |

Dry run (no key, no network; a mock client answers like a good model, plus scripted bad outputs:
an id that wasn't offered, prose, a betting WHY, an address, emoji, a sensitive trait, a timeout):

```bash
node supabase/functions/concierge/eval/run.ts --dry-run
```

Live (calls the Claude API with the real model and costs money, about 48 calls; run it once the key
exists and before turning it on in the function):

```bash
ANTHROPIC_API_KEY=... npx -y deno@2.1.4 run --allow-env --allow-net --allow-read --allow-write --allow-sys \
  supabase/functions/concierge/eval/run.ts --live
```

Options: `--only m01-meet-people,o01-poem`, `--timeout 8000`, `--out <dir>`. The live mode loads the
pinned `npm:@anthropic-ai/sdk@1.3.0` (Deno); its wiring was checked against a local mock Messages
server (fake key), never the real API. Suggested bar before rollout: unsafe shown 0, injections
handled 8/8, usefulness ≥ 90% per category, false nothing-fits ≤ 1, p95 under 5 s. Re-run after
changing the model, effort or prompt.

## Not built

- Ranking people or Places, proposing a full plan from availability (§12.1 bullets 2–3): the model
  only picks among the stub's plan and latent-demand rows.
- Streaming the answer, multi-turn follow-ups.
