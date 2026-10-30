-- Step 7 (Places and Ojoro Pulse, PRD §9.16, §11.2): enum values used by the next Places migrations.
-- Enum values must be committed before a function or policy can use them, so they live here alone.
-- Contract for the app: docs/PLACES_CONTRACT.md.

-- What Ojoro knows about a place's listing. Only the system sets it (never the client).
--   listed               added from public data (a park, a club's public address)
--   community_confirmed  people have checked in to games there (the place and its facilities are real)
--   venue_verified       the venue itself confirmed its details (partnerships, later)
create type public.place_verification as enum ('listed', 'community_confirmed', 'venue_verified');

-- What a place is, in one word ("Park", "Gym"). Shown in the place facts.
create type public.place_kind as enum ('park', 'pitch', 'court', 'track', 'gym', 'club', 'pool', 'trail', 'studio', 'other');

-- Report and block are reachable from every object (CLAUDE.md): a place listing can be reported (wrong
-- details, unsafe, closed).
alter type public.report_subject add value if not exists 'place';
