# Tier-A Screen Contracts

This document is the implementation contract between D0 design and the first production vertical slices.

## Global conventions

Every production route must define:
- read model;
- write commands;
- authorization;
- realtime subscriptions;
- optimistic-update strategy;
- analytics;
- privacy/safety;
- offline/error behavior;
- deep-link behavior.

## Home

**Reads**
- ranked Action Feed
- Ojoro Daily
- active intents
- friend/Crew plans
- Plan Forming objects
- active challenge updates

**Primary actions**
- I’M DOWN
- JOIN
- PULL ME IN
- VIEW LIVE
- CHALLENGE
- RUN IT BACK

**Realtime**
- plan threshold changed
- participant joined/left
- activity state changed
- challenge state changed

**Analytics**
- home_viewed
- action_card_impression
- action_card_opened
- primary_action_taken
- caught_up_reached

**Safety**
- block filters before ranking
- privacy/visibility filter before hydration
- no precise background presence exposed

## Down For

**Writes**
- create intent signal
- update audience
- update time window
- update radius/place preference
- expire intent

**Idempotency**
Intent creation accepts a client idempotency key. A retry must not create duplicate active intent.

**Analytics**
- down_for_started
- down_for_committed
- down_for_expired

## Plan Forming

**Reads**
- plan aggregate
- threshold
- participant-visible identities allowed by audience rules
- proposed time/place

**Commands**
- join
- leave
- pull in friend
- confirm proposed time/place
- promote to activity

**Realtime**
- plan.updated
- plan.member_count_changed
- plan.proposal_changed
- plan.game_on

**Concurrency**
Capacity/threshold promotion is transactional. Exactly one activity may be created from one Plan Forming object.

## Activity

**Reads**
- activity
- roster
- host
- Place
- visibility-safe participant data
- join/waitlist state

**Commands**
- join
- leave/cancel
- waitlist
- check in
- start/live
- complete
- submit result
- verify result

**Concurrency**
Join and waitlist promotion require atomic capacity enforcement.

## Live

**Realtime**
- check-ins
- score/progress where enabled
- activity status
- organizer updates

**Product rule**
No autoplay media feed. Live exists to coordinate, follow and transition into the next action.

## Recap

**Reads**
- attendance
- result
- verification
- participant media
- relationship changes
- Passport entry

**Commands**
- add media
- correct result
- confirm
- Run It Back
- create recurring ritual

## Crew

**Reads**
- members
- shared intent
- privacy-safe availability overlap
- recurring rituals
- Momentum
- shared memories

**Commands**
- Make This a Game
- time poll
- place poll
- invite/pull in
- create ritual

**Analytics**
- crew_chat_plan_detected
- crew_make_this_a_game
- crew_poll_vote
- crew_plan_confirmed

## Challenge

**Commands**
- send Call-Out
- accept
- counter
- pass
- record progress
- verify result
- rematch

**Safety**
- safe template allowlist
- age-aware restrictions
- no wagering
- no dangerous volume/body-weight/humiliation formats

## Map / Ojoro Pulse

**Reads**
- Places
- public/community activities
- aggregate intent density
- audience-approved friend presence

**Privacy**
Aggregate first. Precise individual location requires explicit temporary consent and audience selection.

## Onboarding / Permissions

**Writes**
- sports/skills/goals/preferences
- availability defaults
- discovery radius
- consent records
- permission state

**Rule**
Permission denial must leave a useful fallback. No feature should silently fail.

## Profile / Passport

**Reads**
- public/friend/self view according to visibility rules
- sports
- goals
- activity history
- reputation
- achievements
- Passport entries

**Product rule**
Follower count is not the primary status hierarchy.

## Notifications

**Data**
Every notification resolves to a valid product object and action destination.

**Ranking objective**
Probability of meaningful action, not reopen probability.

**Examples**
- Need One More
- GAME ON
- challenge response
- Crew poll
- friend pulled you in
- activity changed

## Offline / error contract

Mutating actions must distinguish:
- safe retry;
- already committed/idempotent success;
- stale conflict requiring refresh;
- permission/visibility failure;
- network failure.

The UI must never encourage repeated tapping when the server may already have committed the action.
