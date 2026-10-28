**OJORO**

**PRODUCT REQUIREMENTS DOCUMENT**

**Version 3.0 --- Real-World Movement Network**

+-----------------------------------------------------------------------+
| **PRODUCT PROMISE**                                                   |
|                                                                       |
| **Ojoro turns "I want to do something" into "we're doing it at 7."**  |
+=======================================================================+
+-----------------------------------------------------------------------+

Prepared: September 30, 2026

Status: Product blueprint / investor-ready product specification

**1. Document Control**

  -----------------------------------------------------------------------
  **Field**                           **Value**
  ----------------------------------- -----------------------------------
  Product                             Ojoro

  Document                            Product Requirements Document

  Version                             3.0

  Category                            Real-World Movement Network

  Primary client                      React Native + Expo mobile
                                      application

  North-star outcome                  More meaningful real-world movement
                                      created by Ojoro

  Core unit                           Shared real-world action

  Primary social primitive            I'M DOWN

  Challenge rule                      Accepted Call-Out automatically
                                      becomes a Challenge Event
  -----------------------------------------------------------------------

**1.1 Purpose**

This PRD defines the complete product vision, user experience,
functional requirements, operating rules, success metrics, trust model,
data model, monetization paths and delivery priorities for Ojoro. It is
intended to align product, design, engineering, operations, investors
and future partners around one canonical definition of the product.

**1.2 Product maturity assumptions**

The document describes the intended production system. Any projected
user or business impact is a product hypothesis until validated with
live usage, retention, density and monetization data. Ojoro should
distinguish measured outcomes from strategic expectations in all
external reporting.

**2. Contents**

-   3\. Executive Summary

-   4\. Problem, Category and Product Thesis

-   5\. Product Principles

-   6\. Goals, Non-Goals and Success Criteria

-   7\. Target Users and Jobs to Be Done

-   8\. Core Product Loop and Information Architecture

-   9\. Core Feature Requirements

-   10\. Challenge Event System

-   11\. Trust, Safety and Privacy

-   12\. AI and Matching

-   13\. Host and Organizer OS

-   14\. Data Model and Domain Architecture

-   15\. Analytics and Metrics

-   16\. Monetization Model

-   17\. Non-Functional Requirements

-   18\. Delivery Roadmap

-   19\. Risks and Mitigations

-   20\. Definition of Done

-   21\. Appendix: Key User Journeys

**3. Executive Summary**

Ojoro is a social network designed around real-world action rather than
digital consumption. It helps people express what they want to do,
discover compatible people and places, transform weak intent into
confirmed plans, participate in activities, build relationships through
repeated movement, and preserve those experiences as identity,
reputation and community history.

+-----------------------------------------------------------------------+
| **CATEGORY DEFINITION**                                               |
|                                                                       |
| **Ojoro is the social network for real-world movement: a system that  |
| understands what people want to do, who they can do it with, and when |
| and where it can happen --- then helps make it happen.**              |
+=======================================================================+
+-----------------------------------------------------------------------+

Ojoro is not primarily a fitness tracker, event listing, group chat,
league manager or content feed. Those capabilities may exist inside the
product, but the product is organized around one higher-order objective:
reducing the friction between intention and real-world participation.

**3.1 Core product pillars**

  -----------------------------------------------------------------------
  **Pillar**              **What it answers**     **Representative
                                                  features**
  ----------------------- ----------------------- -----------------------
  MOVE                    What can I do, and how  Down For, I'M DOWN,
                          do I make it happen?    Plan Forming, Ojoro
                                                  Now, Activities

  PEOPLE                  Who should I do it      Friends, Movement
                          with?                   Graph, Pull Me In, Need
                                                  One More

  TRIBES                  Who are my people?      Crews, Clans, Rituals,
                                                  community roles

  PROGRESS                Who am I becoming       Physical Identity,
                          through what I do?      Goals, Passport,
                                                  Momentum, Reputation

  COMPETE                 What can we compete     Call-Outs, Challenge
                          over and follow         Events, Clashes,
                          together?               rivalries, seasons
  -----------------------------------------------------------------------

**3.2 Core lifecycle**

+-----------------------------------------------------------------------+
| **CORE LOOP**                                                         |
|                                                                       |
| **INTENT → ASSEMBLE → COMMIT → MOVE → VERIFY → BELONG → PROGRESS →    |
| DISCOVER → REPEAT**                                                   |
+=======================================================================+
+-----------------------------------------------------------------------+

Each feature must strengthen at least one step of this loop. Features
that primarily increase passive screen time without strengthening
real-world participation should be deprioritized.

**4. Problem, Category and Product Thesis**

**4.1 User problem**

People frequently want to be active, meet friends, try sports, train
with others or simply leave the house, but coordination friction
prevents intent from becoming action. The user must typically determine
who is available, choose an activity, find enough people, select a
place, agree on time, manage skill differences, communicate changes,
handle cancellations and remember to repeat the experience later.

**4.2 Market/product gap**

Existing products tend to solve isolated parts of this journey:
messaging enables conversation, event platforms list supply, fitness
apps record completed activity, league tools manage formal competition,
and social platforms distribute content. Ojoro's product thesis is that
the highest-value layer is the coordination engine that connects intent,
people, time, place, trust and repeat behavior into one network.

**4.3 Strategic differentiation**

  -----------------------------------------------------------------------
  **Traditional model**               **Ojoro model**
  ----------------------------------- -----------------------------------
  Discover events that already exist  Detect latent demand and create
                                      events that should exist

  Follow people                       Build relationships through
                                      repeated real-world activity

  Publish what happened               Signal what you want to happen next

  Infinite feed                       Finite action feed with
                                      participation pathways

  Track individual exercise           Coordinate social movement and
                                      shared action

  Likes as core interaction           I'M DOWN as core interaction

  Followers as status                 Contribution, reliability, progress
                                      and community as status
  -----------------------------------------------------------------------

**5. Product Principles**

**Action over attention**

Optimize the product for meaningful real-world action, not session
length.

**Intent is valuable data**

A user saying what they are willing to do can be more useful than a
retrospective post.

**The network should create supply**

If no suitable activity exists, Ojoro should be able to convert
compatible demand into one.

**Social utility before social vanity**

Followers, likes and public status must not overpower participation,
contribution and trust.

**Finite by design**

Feeds and daily surfaces should offer stopping cues such as "You're
caught up. Go do something."

**Privacy by default**

Presence, location and availability are sensitive and must be shared
only at the minimum useful precision.

**Competition should be safe and social**

Rivalry can be exciting without wagering, humiliation, dangerous
challenges or harassment.

**AI should disappear into the workflow**

AI should reduce coordination work instead of becoming the destination.

**Every completed activity should create the next opportunity**

Recap, Run It Back, Rituals, Crews and recommendations should turn
successful action into repeat behavior.

**Local density matters**

Ojoro should win dense communities before expanding geographically.

**6. Goals, Non-Goals and Success Criteria**

**6.1 Product goals**

-   Reduce the time and number of coordination steps required to create
    > a real-world activity.

-   Increase the probability that expressed intent becomes a confirmed
    > activity.

-   Create repeated relationships through participation rather than only
    > through following.

-   Give friend groups and communities a better action layer than
    > general-purpose chat.

-   Create a compelling spectator/social layer around real competition
    > without becoming a passive entertainment network.

-   Build a long-term Movement Graph that improves matching, trust and
    > local discovery.

-   Provide Hosts and organizers with monetizable infrastructure once
    > consumer density exists.

**6.2 Non-goals**

-   Becoming a general social media platform for arbitrary content.

-   Maximizing time-in-app as the primary objective.

-   Providing medical advice or replacing professional
    > coaching/healthcare.

-   Creating a gambling or wagering product.

-   Publishing precise user location by default.

-   Attempting to support every sport and every organizer workflow in
    > the first launch.

**6.3 Top-level success criteria**

  -----------------------------------------------------------------------
  **Outcome**                         **Example measure**
  ----------------------------------- -----------------------------------
  Intent conversion                   \% of eligible Down For / I'M DOWN
                                      intent that becomes confirmed
                                      activity

  Action time                         Median time from expressed intent
                                      to GAME ON

  Participation                       Completed participant-hours
                                      attributable to Ojoro

  Repeat behavior                     \% of completed activities followed
                                      by Run It Back / ritual / another
                                      activity within 30 days

  Social graph growth                 Meaningful repeated co-participant
                                      relationships per active user

  Local liquidity                     Probability a qualified user finds
                                      or creates a suitable opportunity
                                      in target time window

  Trust                               No-show rate, report rate, verified
                                      attendance and host reliability

  Spectator-to-action                 \% of Challenge Event followers who
                                      later join/create an activity or
                                      challenge
  -----------------------------------------------------------------------

**7. Target Users and Jobs to Be Done**

  -----------------------------------------------------------------------
  **User**                **Primary job**         **Ojoro value**
  ----------------------- ----------------------- -----------------------
  Social mover            "Help me do something   Fast intent-to-plan
                          with people without     coordination
                          planning for an hour."  

  Friend group            "Turn our group-chat    Crew, polls, shared
                          ideas into actual       availability, Make This
                          plans."                 a Game

  New-to-city user        "Help me meet people    Discovery,
                          through activities I    beginner-friendly
                          actually enjoy."        matching, Crews/Clans

  Athlete / competitor    "Give me people to      Challenges, Call-Outs,
                          train or compete with   events, rivalries,
                          and make it social."    verification

  Beginner                "Help me try something  Skill/comfort matching,
                          without feeling out of  beginner-friendly
                          place."                 discovery

  Host / organizer        "Help me fill, operate  Host OS, waitlists,
                          and monetize recurring  payments, CRM,
                          activities."            analytics

  Community leader        "Help my community stay Clan roles, missions,
                          active and organized."  seasons, Clash

  Spectator/friend        "Let me follow people I Challenge Events,
                          care about without      predictions, backing,
                          needing to compete."    comments, Live
  -----------------------------------------------------------------------

**8. Core Product Loop and Information Architecture**

**8.1 Primary navigation**

  -----------------------------------------------------------------------
  **Tab**                             **Role**
  ----------------------------------- -----------------------------------
  Home                                Action-first overview: Ojoro Daily,
                                      Down For, plans forming,
                                      friend/Crew opportunities,
                                      live/recap objects

  Discover                            Activities, people, Clans, Hosts,
                                      Places, challenges and new
                                      experiences

  Create                              Quick Plan, Activity, Challenge,
                                      route, Crew/Clan or organizer
                                      objects

  Compete                             Call-Outs, Challenge Events,
                                      rivalries, ladders, matches,
                                      seasons and tournaments

  You                                 Physical Identity, Passport, goals,
                                      reputation, achievements and
                                      settings
  -----------------------------------------------------------------------

**8.2 Global objects**

Persistent objects may be reached from any relevant entry point and
should support deep links, notification entry, share links and valid
back navigation: User, Crew, Clan, Intent Signal, Plan, Activity,
Challenge, Challenge Event, Place, Match, Tournament, Passport, Recap
and Host.

**9. Core Feature Requirements**

**9.1 Physical Identity Profile**

Ojoro profiles describe the user's active life and real-world
participation rather than centering follower count.

**How it works**

-   Capture sports, skill levels, positions/roles, goals, activities to
    > learn, social-versus-competitive preference, availability and
    > discovery radius.

-   Show relationship context such as Crew Mate, teammate, training
    > partner, rival, host or repeated co-participant.

-   Expose different views for self, friend, public/non-friend and
    > blocked/restricted states.

-   Integrate Passport, reputation, achievements, Crews, Clans and
    > recent participation.

**Product impact**

Creates a richer identity layer for matching and a form of social status
grounded in doing, improving, helping and showing up.

**Core requirements**

-   Follower count must never be the dominant profile metric.

-   Visibility of activity history, goals and availability must be
    > independently configurable.

-   Blocked users must not receive private profile details or presence
    > signals.

**Primary metrics**

-   Profile completion rate

-   Profile → activity conversion

-   Repeat co-participant connections

**Acceptance criteria**

-   A new user can create a usable Physical Identity without completing
    > every optional field.

-   Self/friend/public views render correctly with privacy rules.

**9.2 Down For**

Down For lets a user publish temporary intent: what they are willing to
do, when and with whom.

**How it works**

-   User selects an activity or natural-language intent.

-   User defines a time window, audience, radius/place preference and
    > optional condition such as minimum participants.

-   Intent expires automatically and may be withdrawn at any time.

-   Ojoro can match multiple compatible intent signals into Plan
    > Forming.

**Product impact**

Turns social posting from retrospective broadcasting into prospective
coordination and provides the network with high-value intent data.

**Core requirements**

-   All intent signals require expiration.

-   Precise location must not be inferred from a public intent signal.

-   Intent must be idempotently created to prevent duplicate active
    > signals.

**Primary metrics**

-   Down For created/user/week

-   Intent match rate

-   Intent → confirmed activity conversion

**9.3 I'M DOWN**

I'M DOWN is Ojoro's atomic social commitment action.

**How it works**

-   Available on plans, activities, challenge-adjacent opportunities and
    > selected social objects.

-   Tapping commits the user subject to capacity, visibility and
    > eligibility rules.

-   Conditional variant I'M DOWN IF... supports constraints such as time
    > or participant threshold.

-   Commitment changes must update participating users in realtime.

**Product impact**

Provides a distinctive social primitive that directly signals
willingness to act and strengthens Ojoro's intent and participation
graph.

**Core requirements**

-   Double taps/retries must be idempotent.

-   Capacity must be atomically enforced.

-   Users must understand tentative versus confirmed state at all times.

**Primary metrics**

-   I'M DOWN actions/user/week

-   Commitment → attendance

-   False/no-show commitment rate

**9.4 Plan Forming + Social Gravity**

Plan Forming is the transition state where compatible intent is visibly
assembling into a real activity.

**How it works**

-   Aggregate compatible users while respecting audience/privacy
    > constraints.

-   Display progress toward a viability threshold such as 4/8, 7/8 and
    > Need One More.

-   Allow proposed time, place, role/skill and organizer resolution.

-   When threshold and required constraints are satisfied, atomically
    > promote the Plan to GAME ON and create the Activity.

**Product impact**

Enables Ojoro to create supply from latent demand instead of only
listing events that already exist.

**Core requirements**

-   Exactly one Activity may be created from a Plan.

-   Participant identities are shown only when allowed by audience
    > rules.

-   Expired or failed plans must offer alternatives rather than a dead
    > end.

**Primary metrics**

-   Plans formed

-   Plan viability rate

-   Median time to GAME ON

-   Plan → attendance conversion

**9.5 Need One More, Pull In a Friend and Pull Me In**

These mechanics solve the last-mile problem of incomplete activities and
explicit invitation permission.

**How it works**

-   Need One More activates when a Plan or Activity is near required
    > capacity.

-   Candidate ranking prioritizes friends, Crew, previous participants,
    > friends-of-friends and compatible nearby users according to
    > privacy rules.

-   Pull In a Friend sends a contextual invitation from a participant.

-   Pull Me In lets a user express standing permission to be invited to
    > specified activity types or groups.

**Product impact**

Creates utility-driven invitations, improves liquidity, and provides an
organic acquisition loop where invitations have immediate social
meaning.

**Core requirements**

-   Invitation rate limits and spam prevention are mandatory.

-   Pull Me In permissions must be revocable and scoped.

-   No user should be exposed as "available" beyond their chosen
    > audience.

**Primary metrics**

-   Need One More fill rate

-   Invitation acceptance rate

-   Invitee activation

-   Time-to-fill

**9.6 Ojoro Now**

Ojoro Now answers "What can I do right now?" and recovers gracefully
when no matching activity exists.

**How it works**

-   Show starting-soon activities, friends available, active Places and
    > plans forming.

-   If nothing suitable exists, surface aggregate latent demand.

-   Allow Create From Demand to generate Plan Forming directly from
    > compatible signals.

-   Provide a Surprise Me path constrained by safety, preference, skill
    > and travel radius.

**Product impact**

Creates a high-frequency utility habit: boredom or free time can
immediately map to a real-world opportunity.

**Core requirements**

-   No-results must never be a dead end when viable latent demand
    > exists.

-   Recommendations must explain key matching reasons.

-   Location precision must remain privacy-safe.

**Primary metrics**

-   Ojoro Now opens

-   Opportunity acceptance rate

-   No-result recovery rate

-   Time from open to commitment

**9.7 Activity Lifecycle**

Activities are the canonical objects for confirmed real-world
participation.

**How it works**

-   Support social, training and competitive activities.

-   Define time, place, skill/mode, capacity, teams/roles, privacy,
    > cost, equipment, recurrence and verification.

-   Participant states include available, joined, waitlisted, confirmed,
    > cancelled and checked in.

-   Activity chat, directions, calendar save and change notifications
    > are attached to the canonical object.

**Product impact**

Consolidates fragmented coordination currently spread across chat,
calendars, maps, spreadsheets and payment links.

**Core requirements**

-   Capacity and waitlist promotion must be atomic.

-   Cancellation/reschedule changes must notify affected participants.

-   Activity visibility must be enforced server-side.

**Primary metrics**

-   Join conversion

-   Attendance rate

-   Cancellation rate

-   Repeat activity rate

**9.8 Live, After, Recap and Run It Back**

Ojoro supports the activity while it is happening, captures the shared
memory afterward and makes repetition easy.

**How it works**

-   Live may contain attendance, score/progress, organizer updates,
    > limited media and spectator following depending on activity type.

-   AFTER is a temporary collaborative window for result confirmation,
    > photos, clips and moments.

-   Recap condenses verified outcomes and participant-contributed media
    > into a permanent object.

-   Run It Back creates a new Plan using successful prior configuration
    > while allowing time/place changes.

**Product impact**

Extends the value of the activity across anticipation, participation,
memory and recurrence while avoiding passive livestream-first design.

**Core requirements**

-   Live must prioritize coordination and event state over content
    > consumption.

-   Result verification rules vary by activity type.

-   Run It Back must not silently invite or commit previous
    > participants.

**Primary metrics**

-   Live engagement

-   Recap contribution rate

-   Run It Back rate

-   30-day repeat participation

**9.9 Friends and the Movement Graph**

Ojoro models relationships created through real-world movement rather
than only follows.

**How it works**

-   Relationship types may include friend, teammate, Crew Mate, Clan
    > Mate, training partner, coach, host, rival and repeated
    > co-participant.

-   Recommend people using explainable overlap: sport, skill, schedule,
    > mutual participants, goals, location radius and history.

-   Repeated participation can strengthen relationship confidence
    > without auto-declaring friendship.

**Product impact**

Creates a richer social graph and a compounding data advantage: Ojoro
learns not only who knows whom, but who actually does things with whom.

**Core requirements**

-   Never expose sensitive matching attributes not intended for display.

-   Blocking removes the relationship from discovery and interaction
    > surfaces.

**Primary metrics**

-   New meaningful connections

-   Repeat co-participation

-   People recommendation acceptance

**9.10 Crews**

Crews are lightweight private groups for close friends who repeatedly
coordinate real-world activity.

**How it works**

-   Crew Home summarizes who is around, what people are Down For, what
    > is forming and what is next.

-   Provide Crew chat, shared availability, Down For board, Momentum,
    > rituals, challenges, memories and Crew-vs-Crew interactions.

-   Crews are intentionally smaller and more intimate than Clans.

**Product impact**

Makes Ojoro useful to existing friend groups and establishes recurring
social behavior without requiring users to abandon their existing
relationships.

**Core requirements**

-   Crew privacy is private-by-default.

-   Member roles and removal rules must be explicit.

-   Availability should be shown as useful overlap rather than raw
    > calendar details.

**Primary metrics**

-   Crew weekly active rate

-   Crew plan creation

-   Crew repeat participation

-   Ritual adoption

**9.11 Chat-to-Action / Make This a Game**

Ojoro converts planning intent in conversation into structured action.

**How it works**

-   Detect or manually trigger planning from chat.

-   Carry forward known context such as activity type and participants.

-   Ask only unresolved questions: who is in, time, place and capacity.

-   Use time/place polls and shared availability.

-   Create Plan Forming without forcing users to re-enter known
    > information.

**Product impact**

Captures one of the largest failure points in social planning:
conversations that generate interest but never create commitment.

**Core requirements**

-   AI detection must be suggestion-based, never silently create events.

-   Users must be able to dismiss planning prompts.

-   Private chat content must not be repurposed beyond permitted
    > coordination context.

**Primary metrics**

-   Make This a Game acceptance

-   Chat → Plan conversion

-   Poll completion

-   Plan confirmation

**9.12 Crew Momentum and Rituals**

Momentum encourages sustainable group consistency while Rituals convert
repeated success into recurring social structure.

**How it works**

-   Crews can choose a rhythm such as once per week.

-   Missing a target creates a comeback opportunity rather than punitive
    > streak loss.

-   Repeated similar activity can trigger a Make This a Ritual
    > suggestion.

-   Rituals prefill future plans but require renewed commitment.

**Product impact**

Builds retention through meaningful social habits instead of guilt-based
streak mechanics.

**Core requirements**

-   Momentum should not shame users for absence.

-   Rituals must be easy to pause, skip or edit.

**Primary metrics**

-   Ritual creation

-   Ritual participation

-   Crew momentum recovery

-   Weekly repeat rate

**9.13 Clans**

Clans are persistent communities for larger groups, sports societies,
neighborhoods and organizations.

**How it works**

-   Support members, roles, teams, missions, calendar, media,
    > progression, rankings and rivalries.

-   Allow public, request-to-join and invite-only models.

-   Provide community roles such as captain, coach, organizer,
    > moderator, mentor and connector.

-   Enable Clan-vs-Clan Ojoro Clash events.

**Product impact**

Creates scalable community infrastructure and a bridge from consumer
social networking into community/organizer software.

**Core requirements**

-   Clan moderation and permissions are required before public growth.

-   Youth/community safety controls must be role-aware.

**Primary metrics**

-   Clan activation

-   Member weekly participation

-   Clan-created activities

-   Mission completion

**9.14 Challenges and Call-Outs**

Challenges let people or groups create explicit competition or
cooperative objectives. A Call-Out is the invitation; acceptance begins
the event.

**How it works**

-   Challenge formats include person-vs-person, Crew-vs-Crew,
    > Clan-vs-Clan, cooperative, asymmetric, handicap, relay,
    > exploration and skill challenges.

-   Recipient may ACCEPT, COUNTER or PASS.

-   Counter can alter allowed dimensions such as time, distance, rules
    > or format.

-   On acceptance, Ojoro automatically creates a Challenge Event.

**Product impact**

Creates stories with stakes, rivalry and social participation rather
than isolated fitness records.

**Core requirements**

-   No wagering.

-   No unsafe weight-loss/body-weight contests.

-   Challenge templates must pass safety policy.

-   Harassment prevention applies to competitive banter.

**Primary metrics**

-   Call-Out send rate

-   Acceptance/counter rate

-   Challenge completion

-   Rematch rate

**Acceptance criteria**

-   Accepted Call-Out always creates exactly one Challenge Event.

-   The Challenge rules are immutable after LIVE except through explicit
    > adjudication flow.

**10. Challenge Event System --- Accepted Call-Out → Social Event**

+-----------------------------------------------------------------------+
| **CANONICAL RULE**                                                    |
|                                                                       |
| **A Call-Out is the invitation. Once accepted, Ojoro automatically    |
| creates a living Challenge Event with build-up, audience              |
| participation, Live state, result, recap, rivalry history and         |
| rematch.**                                                            |
+=======================================================================+
+-----------------------------------------------------------------------+

**10.1 Purpose**

The Challenge Event transforms competition from a short transaction into
a social narrative. It creates anticipation before the event,
participation around the event, a climax during Live, and durable
history afterward. It is the primary spectator layer of Ojoro, but all
spectator interaction should remain connected to real-world action
rather than passive content consumption.

**10.2 Lifecycle**

  -----------------------------------------------------------------------
  **State**               **Meaning**             **Key capabilities**
  ----------------------- ----------------------- -----------------------
  PROPOSED                Call-Out sent, not      View rules, Accept,
                          accepted                Counter, Pass

  ACCEPTED                Challenge agreed; event Follow, share, initial
                          object created          prediction, participant
                                                  posts

  BUILDUP                 Pre-event social period Event Feed, comments,
                                                  predictions, backing,
                                                  polls, training
                                                  updates, countdown

  CHECK_IN                Event day arrival       Participant check-in,
                          window                  status, venue/time
                                                  confirmation

  LIVE                    Competition underway    Live progress/score,
                                                  comments, cheers,
                                                  locked predictions

  VERIFYING               Outcome submitted       Verification,
                                                  disputes/corrections,
                                                  organizer/device
                                                  confirmation

  COMPLETE                Outcome finalized       Winner/result,
                                                  prediction outcome,
                                                  comments, shareable
                                                  result

  RECAP                   Permanent story object  Media, key moments,
                                                  rivalry update,
                                                  Passport entries

  REMATCH_AVAILABLE       Continuation state      Call for Rematch,
                                                  best-of series, rivalry
                                                  progression
  -----------------------------------------------------------------------

**10.3 Challenge Event page composition**

-   Hero: participant/team identities, challenge type, rules,
    > date/time/place, verification method and countdown.

-   Event state banner: BUILDUP, TODAY, STARTING SOON, LIVE, VERIFYING,
    > COMPLETE.

-   Prediction module: "Who do you think will win?" with aggregate
    > percentages.

-   Backing module: "Who are you supporting?" separated from prediction.

-   Event Feed: participant updates, system milestones and approved
    > organizer/community updates.

-   Comments / The Crowd: conversation attached to event and feed posts.

-   Polls: winner, margin, performance or safe event-specific questions.

-   Follower control: FOLLOW EVENT for meaningful notifications only.

-   Live module: score/progress/checkpoints/participant state based on
    > challenge type.

-   Result module: verified result, prediction outcome, rivalry record
    > and Rematch action.

-   Share module: dynamic poster before event; result card after
    > completion.

**10.4 Participant updates / Hype Feed**

Competitors and approved organizers can post Challenge Event updates
during BUILDUP. The feed exists to create narrative around the real
event, not to become an unrelated content channel.

  -----------------------------------------------------------------------
  **Update type**         **Example**             **Requirements**
  ----------------------- ----------------------- -----------------------
  Training update         "Last long run done."   User chooses what data
                                                  to share; no automatic
                                                  private workout
                                                  publication

  Photo/video             Short training clip     Standard media
                                                  moderation and privacy

  Statement               "Saturday can't come    Clearly marked as
                          fast enough."           participant post

  Progress                5.2 km / 23:48          Source/verification
                                                  label when applicable

  Logistics               Venue changed to Court  Organizer/participant
                          2                       permissions;
                                                  notification to
                                                  followers

  Friendly banter         Competitive statement   Harassment policy and
                                                  reporting apply

  System milestone        "Predictions are now    Automatically generated
                          50/50."                 from trusted event data
  -----------------------------------------------------------------------

**10.5 Comments --- "The Crowd"**

-   Users allowed by event privacy may comment on the main event or
    > individual feed posts.

-   Participants can reply and pin/feature organizer-approved context
    > where appropriate.

-   Mentions and replies generate rate-limited notifications.

-   Comment ranking should prioritize relevance and relationships, not
    > outrage/engagement maximization.

-   Users can mute comments while still following event state.

-   Report/block must be available from every user-generated comment.

**10.6 Predictions --- Who Takes It?**

Prediction captures who the audience thinks will win. It is a
non-monetary social prediction and must remain clearly separate from
gambling.

-   One active prediction per eligible user per event.

-   User may change prediction until event start.

-   Aggregate percentage and prediction count are visible subject to
    > minimum-participant privacy thresholds.

-   Predictions lock when LIVE begins.

-   Final result can generate narrative: "The crowd called it" or "The
    > crowd got it wrong."

-   No cash, points convertible to value, odds, payout or staking
    > mechanics.

**10.7 Backing --- Who Are You Supporting?**

Backing captures allegiance rather than expected outcome. A user can
believe one competitor will win while personally supporting the other.

-   Backing and prediction are stored separately.

-   Event may show supporter counts and relationship-aware context such
    > as "6 of your Crew back Chimdi."

-   Backing may power cheers, supporter visuals and share cards but
    > never affect scoring.

-   Users may remove or change backing before/during event depending on
    > event configuration.

**10.8 Event polls**

Challenge Event polls provide bounded, event-specific participation.
Poll templates must be safe and cannot create wagering or humiliation
mechanics.

-   Winner: Who wins?

-   Margin: How close will it be?

-   Performance: Will either runner break 24 minutes?

-   Team match: Who scores first?

-   Rivalry: Does the loser ask for a rematch?

-   Organizer-defined polls from an allowlist.

**10.9 Countdown and automatic milestones**

  -----------------------------------------------------------------------
  **Trigger**                         **Example system event**
  ----------------------------------- -----------------------------------
  Acceptance                          THE CHALLENGE IS SET

  7 days                              ONE WEEK TO GO

  24 hours                            TOMORROW

  3 hours                             TODAY

  30 minutes                          ALMOST TIME

  Both checked in                     BOTH ARE HERE

  Prediction shift                    THE CROWD IS CHANGING ITS MIND

  100 followers                       100 PEOPLE ARE FOLLOWING

  LIVE                                PREDICTIONS LOCKED --- THE
                                      CHALLENGE IS LIVE
  -----------------------------------------------------------------------

**10.10 Shareable posters**

-   Generate a pre-event poster immediately after acceptance.

-   Poster includes participant/team names, challenge, date and Ojoro
    > branding; optional venue depending on privacy.

-   Share link deep-links to the Challenge Event web/app destination.

-   Generate result poster after verification.

-   External shares must not reveal private participant data beyond
    > event visibility settings.

**10.11 Follow Event / Spectator Mode**

-   Users may FOLLOW EVENT without predicting or backing anyone.

-   Follower notifications are limited to meaningful milestones:
    > participant update, major prediction change, event-day reminder,
    > check-in, LIVE and result.

-   Users can choose quiet/muted follow.

-   Spectators never influence scoring, verification or competitive
    > outcome.

**10.12 Live Challenge Experience**

-   Live visualization adapts to challenge type: time, score, distance,
    > rounds, sets, checkpoints or aggregate progress.

-   Participants/organizers may post official updates according to
    > verification level.

-   Audience can cheer, comment and follow while predictions remain
    > locked.

-   No autoplay video requirement; Live should be useful even without
    > streaming media.

-   If source data becomes stale, UI must show timestamp/verification
    > state rather than imply false precision.

**10.13 Result, prediction outcome and rivalry**

-   Final result remains VERIFYING until required verification threshold
    > is satisfied.

-   When complete, event shows winner/result, performance data,
    > verification source and crowd prediction outcome.

-   If repeated competitors have history, update Rivalry record
    > automatically.

-   Participants may call for REMATCH; accepted rematch creates a new
    > linked Challenge Event.

-   Best-of series and seasonal rivalries may be created from multiple
    > linked events.

**10.14 Challenge Event metrics**

  -----------------------------------------------------------------------
  **Metric**                          **Why it matters**
  ----------------------------------- -----------------------------------
  Accepted Call-Out → Event creation  Core correctness
  success                             

  Event follow rate                   Audience formation

  Prediction participation            Pre-event social engagement

  Backing participation               Relationship/social investment

  Participant update rate             Narrative creation

  Commenters / followers              Community depth

  Share-to-install / share-to-follow  Acquisition loop

  Live return rate                    Event-day retention

  Result verification time            Operational trust

  Rematch rate                        Narrative continuation

  Spectator → participant conversion  Whether spectatorship drives real
                                      action
  -----------------------------------------------------------------------

**10.15 Challenge Event acceptance criteria**

-   Accepting a Call-Out transactionally creates exactly one Challenge
    > Event linked to the Challenge.

-   Event can be followed, shared, commented on, predicted and backed
    > according to privacy settings.

-   Prediction locks at LIVE and can never alter the competitive result.

-   Backing is stored separately from prediction.

-   Participant updates support text/media/progress and clearly identify
    > author role.

-   Event state transitions are auditable and idempotent.

-   LIVE, VERIFYING and COMPLETE states display source/verification
    > freshness correctly.

-   Rematch creates a new linked event and updates Rivalry history only
    > after completion.

-   Harassment/report/block controls are accessible from Challenge Event
    > content.

-   No wagering, odds, payout or monetized prediction mechanism is
    > permitted.

**9.15 Compete, Rivalries, Ladders and Ojoro Clash**

Compete is the home for active competition and long-running competitive
narratives.

**How it works**

-   Aggregate Call-Outs, Challenge Events, rivalries, matches, ladders,
    > seasons and tournaments.

-   Rivalry history links repeated challenge events between the same
    > opponents.

-   Ojoro Clash packages Crew/Clan/team competition into a multi-event
    > social experience.

-   Leaderboards should be scoped and contextual rather than global
    > vanity rankings by default.

**Product impact**

Creates durable narrative and community identity around competition
while providing a pathway from casual challenges to structured seasons.

**Core requirements**

-   Competition formats require explicit rules and verification.

-   Youth/safety restrictions apply before challenge discovery.

**Primary metrics**

-   Challenge events/user

-   Rivalry continuation

-   Clash participation

-   Season completion

**9.16 Places and Ojoro Pulse**

Places make physical locations first-class objects and Ojoro Pulse
visualizes where activity is happening or forming.

**How it works**

-   Place pages may show upcoming activities, recurring rituals, popular
    > sports, Hosts and Clans.

-   Map displays activity clusters, Plan Forming bubbles, active Places
    > and aggregate demand.

-   Create Activity Here turns Place context into action.

-   Presence modes include approximate, event-only and explicitly
    > trusted temporary live location.

**Product impact**

Makes the physical city legible as a social movement network and opens
future partnerships with venues, campuses and recreation organizations.

**Core requirements**

-   Aggregate first; precise individual presence requires explicit
    > consent.

-   Sensitive locations require additional suppression/precision rules.

**Primary metrics**

-   Place detail views

-   Place → activity conversion

-   Map → join/create conversion

**9.17 Passport, Goals, Achievements and Reputation**

The Progress layer records what the user has done, who they did it with,
where they went and how they contributed.

**How it works**

-   Passport organizes meaningful milestones by sport, place,
    > people/community and time.

-   Goals connect long-term intent to real recommended activities.

-   Achievements recognize meaningful participation, exploration,
    > improvement and contribution.

-   Reputation uses structured evidence such as shows up, great host,
    > respectful, welcomes beginners and community builder.

**Product impact**

Creates emotional retention and identity value that compounds over years
while avoiding reduction of all users to follower counts or calories.

**Core requirements**

-   No public star-rating marketplace for people.

-   Reputation signals require minimum evidence thresholds and
    > appeal/correction paths.

**Primary metrics**

-   Passport entries/user

-   Goal-progress activity joins

-   Reputation coverage

-   Long-term retention

**9.18 Action Feed and Ojoro Daily**

Ojoro provides a finite action-oriented feed and a concise daily
briefing rather than an infinite attention feed.

**How it works**

-   Every promoted card should expose a meaningful participation path
    > such as I'M DOWN, JOIN, CHALLENGE, PULL ME IN, BACK THIS or RUN IT
    > BACK.

-   Rank for expected meaningful action within a short horizon rather
    > than predicted watch time.

-   Ojoro Daily highlights the best action, friend opportunity,
    > challenge update, goal opportunity and nearby surprise.

-   End with a stopping cue when useful content is exhausted.

**Product impact**

Maintains social awareness and daily relevance without making passive
consumption the product objective.

**Core requirements**

-   Feed ranking must include safety and visibility filters before
    > ranking.

-   No autoplay infinite feed requirement.

**Primary metrics**

-   Action-card conversion

-   Caught-up rate

-   Daily → real-world action

-   Feed dwell vs action balance

**9.19 Notifications and Deep Links**

Notifications bring users back only when something actionable or
socially meaningful changes.

**How it works**

-   Core types: Need One More, GAME ON, challenge response, participant
    > update, Crew poll, activity change, check-in, LIVE and result.

-   Every notification deep-links to a valid canonical object and
    > action.

-   Bundle redundant notifications and respect quiet hours.

-   Allow granular notification controls by object/type.

**Product impact**

Improves coordination reliability while avoiding the noisy re-engagement
patterns that cause users to mute social apps.

**Core requirements**

-   Notification delivery must not reveal private event details on
    > locked devices when user preferences disallow it.

-   Rate-limit repeated plan threshold updates.

**Primary metrics**

-   Open/action rate

-   Mute rate

-   Notification-driven attendance

**11. Trust, Safety and Privacy**

**11.1 Safety model**

-   Block and report from profiles, comments, chats, activities,
    > Challenges and Challenge Events.

-   Age-aware restrictions for discovery, messaging, challenge
    > eligibility and location sharing.

-   Challenge template safety allowlist and moderation rules.

-   No wagering, dangerous extreme-volume challenges, unsafe body-weight
    > competitions or humiliation mechanics.

-   Host/Clan moderation roles and audit trail.

-   Appeal and correction paths for moderation and verification where
    > appropriate.

**11.2 Location and presence privacy**

-   No public precise background location by default.

-   Approximate presence can be displayed when useful and consented.

-   Event-only presence is limited to the activity context and time
    > window.

-   Trusted live location requires explicit temporary audience
    > selection.

-   Sensitive places/locations may use suppression or coarser
    > aggregation.

**11.3 Verification hierarchy**

  -----------------------------------------------------------------------
  **Level**                           **Meaning**
  ----------------------------------- -----------------------------------
  Self Recorded                       Participant submitted without
                                      corroboration

  Participant Confirmed               Multiple participants confirm

  Organizer Verified                  Authorized organizer confirms

  Device Verified                     Approved device/integration
                                      corroborates

  Official Competition Verified       Authorized competition source
                                      verifies
  -----------------------------------------------------------------------

**12. AI and Matching**

**12.1 Movement Concierge**

The Movement Concierge interprets intent and coordinates existing Ojoro
capabilities. It should not become a general chatbot. Its success is
measured by how efficiently it helps the user leave the app and do
something.

-   Parse natural-language intent such as "I have 90 minutes and want to
    > meet people."

-   Rank activities, people, Places or latent-demand opportunities.

-   Propose a plan using known availability and location constraints.

-   Explain why a recommendation matches.

-   Ask for confirmation before creating invitations, activities or
    > challenges.

**12.2 Movement Graph inputs**

  -----------------------------------------------------------------------
  **Signal family**                   **Examples**
  ----------------------------------- -----------------------------------
  Identity                            sports, skill, role, goals,
                                      preferences

  Time                                availability, time windows,
                                      recurring patterns

  Social                              friends, Crew, Clan, repeated
                                      co-participation

  Place                               radius, Places, travel tolerance

  Trust                               attendance, host reliability,
                                      moderation constraints

  Behavior                            joins, cancellations, completed
                                      activity, Run It Back

  Competition                         rivals, challenge history,
                                      verification level
  -----------------------------------------------------------------------

**12.3 AI safeguards**

-   Never infer or expose sensitive attributes for social matching.

-   Never silently commit a user to an activity, challenge, payment or
    > invitation.

-   Use deterministic safety/permission checks after any AI suggestion.

-   Evaluate recommendation usefulness, safety, latency and calibration
    > before rollout.

**13. Host and Organizer OS**

**13.1 Host role**

Hosts are Ojoro's creator-equivalent: they create real-world
participation rather than primarily producing content.

-   Recurring activity creation and templates.

-   Participant CRM and attendance history.

-   Waitlists and approval workflows.

-   Memberships and paid activities.

-   Announcements and event chat.

-   Tournament/season operations.

-   Host analytics and revenue reporting.

-   Venue and sponsorship tooling as later extensions.

**13.2 Monetization principles**

Ordinary social participation should remain easy and broadly accessible.
Monetization should initially concentrate on professional or high-value
organizer workflows, transaction services and optional premium community
capabilities.

**14. Data Model and Domain Architecture**

  ------------------------------------------------------------------------------
  **Domain object**                   **Key relationships / purpose**
  ----------------------------------- ------------------------------------------
  User                                Identity, preferences, privacy, trust and
                                      account

  Relationship                        Friend/teammate/Crew/Clan/training/rival
                                      context

  IntentSignal                        Temporary Down For state

  Plan                                Pre-activity aggregate / threshold /
                                      proposals

  Activity                            Confirmed real-world action

  Attendance                          Participant
                                      commitment/check-in/verification

  Crew                                Private small-group social unit

  Clan                                Persistent larger community

  Challenge                           Rules and competitors before/during
                                      competition

  ChallengeEvent                      Social event created upon Challenge
                                      acceptance

  ChallengePost                       Participant/organizer/system event-feed
                                      item

  Comment                             Threaded event/activity/feed conversation

  Prediction                          Non-monetary expected winner selection

  Backing                             Support/allegiance selection

  Poll                                Event-specific bounded question

  EventFollow                         Spectator subscription

  Rivalry                             Historical relationship across linked
                                      Challenge Events

  Place                               Physical venue/location object

  PassportEntry                       Durable user milestone

  Goal                                Long-term user intent

  ReputationSignal                    Structured trust/contribution evidence

  Notification                        Actionable event routed to canonical
                                      object
  ------------------------------------------------------------------------------

**14.1 Challenge Event relationship model**

A Challenge has zero or one active Challenge Event before acceptance and
exactly one Event after accepted creation. Rematches create new
Challenge + Challenge Event pairs linked through Rivalry rather than
mutating historical events.

+-----------------------------------------------------------------------+
| **DATA INTEGRITY REQUIREMENT**                                        |
|                                                                       |
| **Challenge acceptance and Challenge Event creation must be           |
| transactional and idempotent. The system must never create duplicate  |
| events for one accepted challenge.**                                  |
+=======================================================================+
+-----------------------------------------------------------------------+

**15. Analytics and Metrics**

**15.1 North star**

+-----------------------------------------------------------------------+
| **NORTH STAR**                                                        |
|                                                                       |
| **OJORO HOURS: verified or credibly confirmed participant-hours of    |
| real-world movement that Ojoro helped create or coordinate.**         |
+=======================================================================+
+-----------------------------------------------------------------------+

**15.2 Funnel metrics**

  -----------------------------------------------------------------------
  **Stage**                           **Metrics**
  ----------------------------------- -----------------------------------
  Intent                              Down For created, I'M DOWN rate,
                                      intent-match rate

  Assemble                            Plan Forming creation, threshold
                                      progress, Need One More fill

  Commit                              GAME ON rate, confirmation rate,
                                      calendar save

  Move                                Check-in, attendance, Ojoro Hours

  Verify                              Result/attendance verification
                                      coverage

  Belong                              New repeated relationships,
                                      Crew/Clan joins

  Progress                            Goals advanced, Passport entries,
                                      Momentum

  Repeat                              Run It Back, Ritual creation,
                                      7/30/90-day participation retention
  -----------------------------------------------------------------------

**15.3 Challenge Event analytics**

-   challenge_event_created

-   challenge_event_followed

-   prediction_cast

-   prediction_changed

-   backing_selected

-   challenge_post_created

-   challenge_comment_created

-   challenge_shared

-   challenge_live_viewed

-   challenge_result_verified

-   challenge_rematch_requested

-   challenge_rematch_accepted

-   spectator_became_participant

**16. Monetization Model**

**16.1 Consumer**

-   Free core social participation.

-   Optional premium personalization, advanced progress/Passport exports
    > or enhanced planning features only if they do not damage network
    > liquidity.

-   No paywall on basic safety, messaging, joining or I'M DOWN.

**16.2 Hosts and communities**

-   Host subscription for recurring programs, CRM, analytics, automation
    > and advanced communication.

-   Clan Pro for advanced roles, branded community pages, seasons,
    > analytics and organizer controls.

-   Paid activity transaction fee or platform service fee.

-   Tournament/season management paid tier.

**16.3 Venues and partners**

-   Venue promotion or booking integrations where aligned with user
    > utility.

-   Demand insights only in privacy-safe aggregate form.

-   Brand/community sponsorship tooling around legitimate events and
    > Clashes.

**17. Non-Functional Requirements**

  -----------------------------------------------------------------------
  **Area**                            **Requirement**
  ----------------------------------- -----------------------------------
  Performance                         Primary mobile screens should feel
                                      immediate; target \<2.5s meaningful
                                      load on typical supported networks,
                                      with skeleton/offline fallbacks.

  Realtime                            Plan/member state changes should
                                      normally propagate within seconds.

  Reliability                         Core join/leave/capacity/check-in
                                      mutations must be idempotent and
                                      safely retryable.

  Accessibility                       WCAG 2.2 AA target;
                                      VoiceOver/TalkBack; large text;
                                      reduced motion; no color-only
                                      state.

  Security                            Server-side authorization for all
                                      visibility, participant, payment
                                      and moderation changes.

  Privacy                             Data minimization, privacy-safe
                                      location defaults, auditable
                                      consent/visibility.

  Observability                       Structured logs, metrics, traces
                                      and release health checks for
                                      critical paths.

  Scalability                         Architecture must support dense
                                      local communities without assuming
                                      globally uniform demand.

  Offline/degraded                    Users should retain last-known
                                      confirmed activity context and
                                      receive clear stale/offline state.

  Moderation                          Report/block and content
                                      enforcement must work across
                                      comments, chat, media and Challenge
                                      Event content.
  -----------------------------------------------------------------------

**18. Delivery Roadmap**

**18.1 Design foundation**

D0 locks information architecture, design system, Tier-A prototype
flows, accessibility behavior and engineering contracts. Device
validation remains the final gate before design closure.

**18.2 Production sequence**

  -------------------------------------------------------------------------------
  **Phase**                           **Primary production slice**
  ----------------------------------- -------------------------------------------
  M0                                  Platform foundation: Expo, auth, CI/CD,
                                      observability, environments, analytics

  M1                                  Identity: account, Physical Identity,
                                      relationships

  M2                                  Crews + intent: Down For, I'M DOWN, Plan
                                      Forming, chat-to-action

  M3                                  Activity core:
                                      create/join/capacity/attendance/recap/Run
                                      It Back

  M4                                  Ojoro Now + Need One More + discovery
                                      liquidity

  M5                                  Messaging + finite Action Feed +
                                      notifications

  M6                                  Challenges + Call-Outs + Challenge Events +
                                      rivalries

  M7                                  Clans + Hosts + recurring community
                                      operations

  M8                                  Places + Passport + progress/reputation

  M9                                  AI Concierge + trust/safety hardening +
                                      monetization

  M10                                 Connected movement: calendar/wearables/deep
                                      links

  M11                                 City-scale launch, experiments, performance
                                      and GA
  -------------------------------------------------------------------------------

**18.3 First production vertical slice**

+-----------------------------------------------------------------------+
| **VERTICAL SLICE 01**                                                 |
|                                                                       |
| **AUTH → PROFILE → DOWN FOR → I'M DOWN → PLAN FORMING → GAME ON →     |
| ACTIVITY → ATTENDANCE → RECAP → RUN IT BACK**                         |
+=======================================================================+
+-----------------------------------------------------------------------+

This slice must be built with real API, database, realtime, analytics,
permissions, tests and safety rules. Ojoro should avoid implementing the
whole frontend against fake data before completing real end-to-end
slices.

**19. Risks and Mitigations**

  --------------------------------------------------------------------------
  **Risk**                **Why it matters**      **Mitigation**
  ----------------------- ----------------------- --------------------------
  Low local density       A social coordination   Launch dense communities
                          network fails if        first; emphasize Crew/Clan
                          opportunities rarely    use cases; latent-demand
                          form.                   Plan Forming.

  No-shows / unreliable   Breaks trust and event  Reputation, reminders,
  participation           quality.                check-in, cancellation
                                                  norms, host tools.

  Safety / harassment     Physical meetups and    Privacy controls,
                          competition increase    moderation, age-aware
                          risk.                   rules, report/block,
                                                  challenge safety
                                                  allowlist.

  Location privacy        Map/presence can become Aggregate-first Pulse;
                          invasive.               explicit temporary precise
                                                  presence only.

  Passive-content drift   Hype features could     Event-scoped content,
                          recreate traditional    finite feeds, action
                          social-media            pathways,
                          incentives.             spectator-to-participant
                                                  metrics.

  Gambling adjacency      Predictions could be    No money, odds, staking,
                          misinterpreted.         payouts or redeemable
                                                  points; clear
                                                  social-prediction framing.

  Over-complex launch     Too many features could Vertical slices; launch
                          delay product-market    with core action loop;
                          learning.               gate advanced
                                                  Host/Clan/season features.

  AI overreach            Automated coordination  Suggestion-first AI;
                          may surprise users.     explicit confirmation;
                                                  deterministic
                                                  permission/safety checks.

  Fragmented UX           Many domains could feel Five-tab IA, shared
                          like separate apps.     objects, consistent
                                                  components and core loop.

  Competition toxicity    Rivalry may create      Banter policy, moderation,
                          harassment.             reporting, community
                                                  norms, no humiliation
                                                  mechanics.
  --------------------------------------------------------------------------

**20. Definition of Done**

**20.1 Feature Definition of Done**

-   User story and measurable success criteria are defined.

-   Happy path, loading, empty, validation, offline, privacy and error
    > states are implemented.

-   Server-side authorization and safety rules are enforced.

-   Analytics events and operational telemetry exist.

-   Unit/integration/E2E coverage exists at the appropriate layer.

-   Accessibility requirements are verified.

-   Deep links and notification entry are tested where applicable.

-   Observability and rollback path exist for production changes.

-   Product/design acceptance criteria are met on supported devices.

**20.2 Challenge Event Definition of Done**

-   Challenge acceptance atomically creates the Event.

-   Build-up feed, comments, predictions, backing, polls and following
    > work with privacy/moderation.

-   Countdown and system milestones transition correctly.

-   LIVE locks predictions and reflects verified/stale state accurately.

-   Result verification produces durable COMPLETE/RECAP state.

-   Rematch creates new linked history without rewriting prior result.

-   External sharing respects event privacy.

-   No gambling-adjacent functionality is present.

**21. Appendix: Key User Journeys**

**21.1 Movement journey**

> 1\. Open Ojoro
>
> 2\. See "Football tonight?"
>
> 3\. Tap I'M DOWN
>
> 4\. Plan Forming progresses
>
> 5\. Need One More
>
> 6\. Pull in friend
>
> 7\. GAME ON
>
> 8\. Open Activity
>
> 9\. Check in
>
> 10\. LIVE
>
> 11\. Finish
>
> 12\. AFTER / Recap
>
> 13\. Run It Back

**21.2 Crew chat-to-action**

> 1\. Crew chat contains planning intent
>
> 2\. Ojoro offers MAKE THIS A GAME
>
> 3\. Shared availability produces time options
>
> 4\. Crew votes on time
>
> 5\. Crew votes on Place
>
> 6\. Plan Forming created
>
> 7\. Threshold reached
>
> 8\. GAME ON

**21.3 Challenge / Call-Out journey**

> 1\. User sends Call-Out
>
> 2\. Recipient Accepts or Counters
>
> 3\. Challenge rules lock
>
> 4\. Challenge Event auto-created
>
> 5\. Participants post build-up updates
>
> 6\. Audience follows, comments, predicts and backs
>
> 7\. Countdown progresses
>
> 8\. Both check in
>
> 9\. Event becomes LIVE; predictions lock
>
> 10\. Result submitted and verified
>
> 11\. Crowd prediction outcome shown
>
> 12\. Rivalry updated
>
> 13\. Rematch offered

**21.4 Ojoro Now no-supply journey**

> 1\. User opens Ojoro Now
>
> 2\. No exact activity exists
>
> 3\. Ojoro detects compatible latent demand
>
> 4\. User selects MAKE IT HAPPEN
>
> 5\. Plan Forming created
>
> 6\. Compatible users notified/invited within privacy rules
>
> 7\. Threshold reached
>
> 8\. Activity confirmed

**21.5 Investor framing**

The long-term defensibility of Ojoro is expected to come from the
interaction of multiple local graphs: social relationships, real-world
co-participation, intent, availability, skill, place, community and
trust. The product should not claim this moat before data demonstrates
that these graphs improve liquidity, retention and matching quality.

+-----------------------------------------------------------------------+
| **ONE-SENTENCE PITCH**                                                |
|                                                                       |
| **Ojoro is building the social network for real-world movement --- a  |
| platform that understands what people want to do, who they can do it  |
| with, and when and where it can happen, then turns that latent intent |
| into actual activities, relationships and communities.**              |
+=======================================================================+
+-----------------------------------------------------------------------+
