# Ojoro State Matrix

| Surface | Required states |
|---|---|
| Home | loading, actionable, caught-up, offline, privacy-limited |
| Down For | draft, active, expired, audience-limited |
| Plan Forming | 4/8, joined, 7/8, need-one-more, game-on, expired |
| Activity | available, joined, full, waitlist, live, completed, cancelled |
| Live | pre-start, live, paused, complete |
| Recap | generating, editable-after-window, complete |
| Crew | active, no-plan, plan-forming, ritual-active |
| Challenge | draft, pending, countered, active, verified, complete |
| Map | permission-needed, approximate, populated, no-results |
| Profile | self, friend, non-friend, blocked |
| Passport | empty, active, milestone |
| Notifications | unread, read, bundled, empty |

## Cross-cutting states

Every applicable Tier-A surface must specify:
- skeleton/loading
- empty
- validation error
- server error
- offline/reconnecting
- stale data
- permission denied
- blocked/restricted
- expired/deleted object
- reduced motion
- large text
- screen-reader focus order
- deep-link entry
- notification entry
