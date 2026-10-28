# Screen inventory

44 artboards from the **Ojoro App UI** design canvas, in canvas order. Each entry links its full-page screenshot (`screens/`, 2x) and its prototype file (`prototype/`, open via a local server, see `prototype/README.md`).

Columns that come straight from the artboard source (situations, components, links) were extracted automatically, so they match the design exactly. Purpose and notes are written by hand.

**Phone frame:** every phone screen is 390 pt wide. Artboard heights are the full scroll length, not the viewport. A real device scrolls; the bottom tab bar on the five tab screens is fixed to the bottom of the viewport.

**Sample content:** names (Chimdi, Ade, Marcus…), places in Montréal, counts and dollar amounts are illustrative seed data. Never hard-code them.

## Contents

- **The five tabs**: [Home](#main), [Discover](#discover), [Create](#create), [Compete](#compete), [You](#you)
- **Movement journey · football tonight → Run It Back**: [1 · Plan forming](#plan), [2 · Need one more](#needonemore), [3 · GAME ON](#gameon), [4 · Activity](#activity), [5 · Check-in](#checkin), [6 · Live](#liveactivity), [7 · After](#after), [8 · Recap](#recap), [9 · Run It Back](#runitback)
- **Challenge journey · Call-Out → rematch**: [1 · Call-Out](#callout), [2 · Event build-up](#eventbuildup), [3 · Share poster](#poster), [4 · Event day](#eventtoday), [5 · Live challenge](#eventlive), [6 · Verifying](#verifying), [7 · Result](#result), [8 · Rivalry & rematch](#rivalry)
- **Community · Crews, Clans, Places, Updates**: [Crew home](#crewhome), [Crew chat → Make This a Game](#crewchat), [Clan](#clan), [Ojoro Clash](#clash), [Pulse map](#pulse), [Place](#place), [Updates](#notifications)
- **First run & system states**: [Welcome](#welcome), [Onboarding 1 · Sports](#onboardsports), [Onboarding 2 · Time and distance](#onboardwhen), [Onboarding 3 · Privacy](#onboardprivacy), [First home · low density](#firsthome), [System states](#states)
- **Host OS · Ade runs Plateau Pickup**: [Host home](#hosthome), [Series & template](#hostseries), [Tonight's roster & waitlist](#hostroster), [Join requests](#hostrequests), [People · participant CRM](#hostpeople), [Memberships & payments](#hostmembership), [Announcements](#hostannounce), [League operations](#hostseason), [Insights & revenue](#hostinsights)


---

## The five tabs

<a id="main"></a>
### Home  ·  `Main`

Screenshot: [`screens/Main.png`](screens/Main.png) · Prototype: [`prototype/Main.dc.html`](prototype/Main.dc.html) · Artboard 390×2220

| | |
|---|---|
| **Purpose** | Action-first home. Ojoro Daily editorial headline (TONIGHT.), the best move for you, Down For row, plans forming near you, your upcoming Challenge Events, and a recap object from your last game. |
| **Suggested route** | `/(tabs)/index` |
| **PRD** | §8.1 Home · §9.18 Action Feed & Ojoro Daily · §9.2 Down For |
| **Milestone** | M2 / M5 |
| **Situations** | `calm`, `after` |
| **DS components** | `Badge`, `CrewMomentum`, `Divider`, `DownFor`, `Graphic`, `Icon`, `IconButton`, `PlanForming` |
| **Goes to** | Compete, Create, Discover, EventBuildup, Notifications, Plan, Recap, You |
| **Reached from** | Compete, Create, Discover, GameOn, Notifications, Plan, RunItBack, You |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Finite feed: it ends. No infinite scroll. <br>• The Recap block is set in the `after` situation inside a calm page: situation goes on the object root, not the page. <br>• Bottom tab bar is shared by all five tab screens. |

<a id="discover"></a>
### Discover  ·  `Discover`

Screenshot: [`screens/Discover.png`](screens/Discover.png) · Prototype: [`prototype/Discover.dc.html`](prototype/Discover.dc.html) · Artboard 390×2200

| | |
|---|---|
| **Purpose** | Find something to do: search, filter chips (scroll horizontally), Ojoro Now (what starts within the hour), latent demand ("Nothing on for volleyball, 5 people want to play: MAKE IT HAPPEN"), people to move with, Crews & Clans, link to the Pulse map. |
| **Suggested route** | `/(tabs)/discover` |
| **PRD** | §9.6 Ojoro Now · §9.16 Places · §9.9 Movement Graph |
| **Milestone** | M4 |
| **Situations** | `calm`, `forming` |
| **DS components** | `ActivityStrip`, `Badge`, `Button`, `Chip`, `Divider`, `Icon`, `Input`, `PlaceMiniCard`, `UserMiniCard` |
| **Goes to** | Compete, Create, Main, Plan, Pulse, You |
| **Reached from** | Compete, Create, FirstHome, Main, Pulse, You |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • The filter chip row overflows on purpose and scrolls horizontally. <br>• Latent demand is shown as a count only. No names or locations until people join (privacy rule). |

<a id="create"></a>
### Create  ·  `Create`

Screenshot: [`screens/Create.png`](screens/Create.png) · Prototype: [`prototype/Create.dc.html`](prototype/Create.dc.html) · Artboard 390×1460

| | |
|---|---|
| **Purpose** | Movement Concierge text box ("Tell Ojoro"), one best match with a plain-language WHY, then the ways to start something: Down For, Quick Plan, Activity, Call-Out, Crew/Clan. |
| **Suggested route** | `/(tabs)/create` |
| **PRD** | §8.1 Create · §12.1 Movement Concierge |
| **Milestone** | M3 (Concierge M9) |
| **Situations** | `calm` |
| **DS components** | `Button`, `Divider`, `Icon`, `Input`, `Progress` |
| **Goes to** | Activity, CallOut, Compete, Discover, Main, Plan, You |
| **Reached from** | Clan, Compete, Discover, FirstHome, Main, Place, Pulse, You |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Concierge suggests only. Nothing is sent or joined until the user confirms (copy says so). <br>• Concierge can ship as a rules-based stub first; the AI part is M9. |

<a id="compete"></a>
### Compete  ·  `Compete`

Screenshot: [`screens/Compete.png`](screens/Compete.png) · Prototype: [`prototype/Compete.dc.html`](prototype/Compete.dc.html) · Artboard 390×1660

| | |
|---|---|
| **Purpose** | Incoming Call-Out at the top (live situation poster with REPLY), your events with countdowns, rivalries, ladders & seasons. |
| **Suggested route** | `/(tabs)/compete` |
| **PRD** | §9.14 Challenges & Call-Outs · §9.15 Rivalries, Ladders, Clash |
| **Milestone** | M6 |
| **Situations** | `calm`, `live` |
| **DS components** | `Badge`, `Divider`, `Icon`, `LiveIndicator`, `Rivalry` |
| **Goes to** | CallOut, Create, Discover, EventBuildup, Main, Rivalry, You |
| **Reached from** | CallOut, Create, CrewHome, Discover, FirstHome, Main, You |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Incoming Call-Out block uses the `live` situation inside a calm page. |

<a id="you"></a>
### You  ·  `You`

Screenshot: [`screens/You.png`](screens/You.png) · Prototype: [`prototype/You.dc.html`](prototype/You.dc.html) · Artboard 390×2030

| | |
|---|---|
| **Purpose** | Physical identity profile: stats (Ojoro hours, sessions, people moved with), what I do with levels, goal, reputation signals, Passport block (after situation), Crews, Clans & hosting (link into Host OS). |
| **Suggested route** | `/(tabs)/you` |
| **PRD** | §9.1 Physical Identity · §9.17 Passport, Goals, Reputation |
| **Milestone** | M1 / M8 |
| **Situations** | `calm`, `after` |
| **DS components** | `Avatar`, `Badge`, `Divider`, `Icon`, `IconButton`, `PassportStamp`, `VerificationBadge` |
| **Goes to** | Clan, Compete, Create, CrewHome, Discover, HostHome, Main, Plan, Recap |
| **Reached from** | Clan, Compete, Create, CrewHome, Discover, FirstHome, HostHome, Main, Result |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Visibility line under the stats states who can see what, with an Edit visibility link. <br>• Reputation signals only appear after 5 confirmations. |


---

## Movement journey · football tonight → Run It Back

<a id="plan"></a>
### 1 · Plan forming  ·  `Plan`

Screenshot: [`screens/Plan.png`](screens/Plan.png) · Prototype: [`prototype/Plan.dc.html`](prototype/Plan.dc.html) · Artboard 390×1360

| | |
|---|---|
| **Purpose** | A plan gathering people (forming situation): count toward the lock threshold (6 / 8), time poll, place, who's in, PULL SOMEONE IN, I CAN'T MAKE IT. |
| **Suggested route** | `/plan/[id]` |
| **PRD** | §9.3 I'M DOWN · §9.4 Plan Forming + Social Gravity |
| **Milestone** | M2 · Slice 01 |
| **Situations** | `forming` |
| **DS components** | `Button`, `Divider`, `Icon`, `IconButton`, `ParticipantRow`, `PlaceMiniCard`, `PlanForming`, `Poll` |
| **Goes to** | Main, NeedOneMore |
| **Reached from** | Clash, Create, CrewChat, CrewHome, Discover, FirstHome, Main, NeedOneMore, Notifications, Place, You |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • The plan locks at capacity and everyone gets GAME ON at the same moment (realtime). <br>• Exact pitch is shared only with people in the plan. <br>• Gather motion when someone joins; count ticks. |

<a id="needonemore"></a>
### 2 · Need one more  ·  `NeedOneMore`

Screenshot: [`screens/NeedOneMore.png`](screens/NeedOneMore.png) · Prototype: [`prototype/NeedOneMore.dc.html`](prototype/NeedOneMore.dc.html) · Artboard 390×844

| | |
|---|---|
| **Purpose** | Pick who to invite when the plan needs one more. Ranked by likelihood to say yes, with a reason per person. Invite quota shown (3 left). |
| **Suggested route** | `/plan/[id]/pull-in` |
| **PRD** | §9.5 Need One More / Pull Someone In / Pull Me In |
| **Milestone** | M4 |
| **Situations** | `forming` |
| **DS components** | `Avatar`, `Chip`, `Icon`, `IconButton`, `PlanForming`, `Sheet` |
| **Goes to** | GameOn, Plan |
| **Reached from** | Plan |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • The invitee sees who's in, the time and the place. Nothing else (copy states this). |

<a id="gameon"></a>
### 3 · GAME ON  ·  `GameOn`

Screenshot: [`screens/GameOn.png`](screens/GameOn.png) · Prototype: [`prototype/GameOn.dc.html`](prototype/GameOn.dc.html) · Artboard 390×844

| | |
|---|---|
| **Purpose** | Breakthrough takeover in the confirmed situation when the plan fills: GAME ON at display-hero, what/when/where, everyone in, OPEN THE GAME / ADD TO CALENDAR / DIRECTIONS. |
| **Suggested route** | `/plan/[id]/game-on (modal takeover)` |
| **PRD** | §9.4 · §9.7 Activity Lifecycle |
| **Milestone** | M2 · Slice 01 |
| **Situations** | `confirmed` |
| **DS components** | `Button`, `GameOnPoster`, `Icon` |
| **Goes to** | Activity, Main |
| **Reached from** | Activity, NeedOneMore, Notifications |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Breakthrough motion (600ms) + notificationAsync(Success) haptic. <br>• Reduced motion: instant cross-fade, headline still changes. |

<a id="activity"></a>
### 4 · Activity  ·  `Activity`

Screenshot: [`screens/Activity.png`](screens/Activity.png) · Prototype: [`prototype/Activity.dc.html`](prototype/Activity.dc.html) · Artboard 390×1310

| | |
|---|---|
| **Purpose** | The confirmed activity: ActivityObject header, details grid (teams, kit, cost, attendance rule), who's playing with roles, activity chat preview, CHECK IN (opens at 7:00 within 150 m), I CAN'T MAKE IT ANYMORE. |
| **Suggested route** | `/activity/[id]` |
| **PRD** | §9.7 Activity Lifecycle |
| **Milestone** | M3 · Slice 01 |
| **Situations** | `calm` |
| **DS components** | `ActivityObject`, `Button`, `Comment`, `Divider`, `Icon`, `IconButton`, `ParticipantRow` |
| **Goes to** | CheckIn, GameOn |
| **Reached from** | CheckIn, Create, GameOn |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Cancelling after confirmation must free the spot and promote the waitlist idempotently. |

<a id="checkin"></a>
### 5 · Check-in  ·  `CheckIn`

Screenshot: [`screens/CheckIn.png`](screens/CheckIn.png) · Prototype: [`prototype/CheckIn.dc.html`](prototype/CheckIn.dc.html) · Artboard 390×990

| | |
|---|---|
| **Purpose** | Confirmed situation: YOU'RE HERE., arrivals with check-in times, temporary location sharing for this game only (STOP SHARING), GO TO THE GAME. |
| **Suggested route** | `/activity/[id]/check-in` |
| **PRD** | §9.7 attendance · §11.2 Location & presence |
| **Milestone** | M3 · Slice 01 |
| **Situations** | `confirmed` |
| **DS components** | `Button`, `Divider`, `Icon`, `ParticipantRow`, `Progress`, `VerificationBadge` |
| **Goes to** | Activity, LiveActivity |
| **Reached from** | Activity, LiveActivity |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Location sharing is per game, ends by itself at a set time. Never persistent. <br>• Both-checked-in haptic: impactAsync(Medium). |

<a id="liveactivity"></a>
### 6 · Live  ·  `LiveActivity`

Screenshot: [`screens/LiveActivity.png`](screens/LiveActivity.png) · Prototype: [`prototype/LiveActivity.dc.html`](prototype/LiveActivity.dc.html) · Artboard 390×920

| | |
|---|---|
| **Purpose** | Live situation: running clock, score (logged by host), freshness line ("Updated 20 s ago"), updates feed, followers, FULL TIME (host). |
| **Suggested route** | `/activity/[id]/live` |
| **PRD** | §9.8 Live |
| **Milestone** | M3 |
| **Situations** | `live` |
| **DS components** | `Comment`, `Divider`, `HypePost`, `Icon`, `IconButton`, `LiveIndicator`, `ReactionBar` |
| **Goes to** | After, CheckIn |
| **Reached from** | After, CheckIn |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Stale data must say how stale it is. <br>• Live motion: only the LIVE dot and counters pulse, never the layout. |

<a id="after"></a>
### 7 · After  ·  `After`

Screenshot: [`screens/After.png`](screens/After.png) · Prototype: [`prototype/After.dc.html`](prototype/After.dc.html) · Artboard 390×1130

| | |
|---|---|
| **Purpose** | After situation: GOOD GAME., confirm or suggest a fix to the logged score (participant confirmation threshold), moments (photos from players only), SEE THE RECAP. |
| **Suggested route** | `/activity/[id]/after` |
| **PRD** | §9.8 After |
| **Milestone** | M3 · Slice 01 |
| **Situations** | `after` |
| **DS components** | `Button`, `Divider`, `Icon`, `Image`, `Progress` |
| **Goes to** | LiveActivity, Recap |
| **Reached from** | LiveActivity, Recap |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • After window is time-boxed (open until a set time). <br>• Only participants can add photos; anyone can untag themselves. |

<a id="recap"></a>
### 8 · Recap  ·  `Recap`

Screenshot: [`screens/Recap.png`](screens/Recap.png) · Prototype: [`prototype/Recap.dc.html`](prototype/Recap.dc.html) · Artboard 390×1190

| | |
|---|---|
| **Purpose** | Recap poster (LIGHTS WIN 5–4.), numbers, who you played with (firsts and milestones), Passport stamp added, RUN IT BACK / SHARE RECAP. |
| **Suggested route** | `/activity/[id]/recap` |
| **PRD** | §9.8 Recap · §9.17 Passport |
| **Milestone** | M3 · Slice 01 |
| **Situations** | `after` |
| **DS components** | `AvatarCluster`, `Button`, `Divider`, `Icon`, `IconButton`, `Image`, `PassportStamp`, `VerificationBadge` |
| **Goes to** | After, RunItBack |
| **Reached from** | After, Main, Notifications, RunItBack, You |
| **Prototype interactivity** | Static (links only). |

<a id="runitback"></a>
### 9 · Run It Back  ·  `RunItBack`

Screenshot: [`screens/RunItBack.png`](screens/RunItBack.png) · Prototype: [`prototype/RunItBack.dc.html`](prototype/RunItBack.dc.html) · Artboard 390×860

| | |
|---|---|
| **Purpose** | Re-run the same game: pick a time, explains that a new plan opens and the same people get an invite; nobody is in until they tap I'M DOWN. Three weeks in a row offers a Ritual. |
| **Suggested route** | `/activity/[id]/run-it-back` |
| **PRD** | §9.8 Run It Back · §9.12 Rituals |
| **Milestone** | M3 · Slice 01 |
| **Situations** | `after` |
| **DS components** | `Chip`, `Divider`, `Icon`, `RunItBack` |
| **Goes to** | Main, Recap |
| **Reached from** | Recap |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Run It Back creates a NEW plan; it never copies attendance. |


---

## Challenge journey · Call-Out → rematch

<a id="callout"></a>
### 1 · Call-Out  ·  `CallOut`

Screenshot: [`screens/CallOut.png`](screens/CallOut.png) · Prototype: [`prototype/CallOut.dc.html`](prototype/CallOut.dc.html) · Artboard 390×1160

| | |
|---|---|
| **Purpose** | Received Call-Out in the live situation: CallOutPoster, the challenger's line, the rules (format, course, start, verification, audience, STAKES: None), ACCEPT / COUNTER / PASS. |
| **Suggested route** | `/challenge/[id]` |
| **PRD** | §9.14 Call-Outs · §10.2 Lifecycle |
| **Milestone** | M6 |
| **Situations** | `live` |
| **DS components** | `Button`, `CallOutPoster`, `Divider`, `Icon`, `IconButton` |
| **Goes to** | Compete, EventBuildup |
| **Reached from** | Compete, Create, EventBuildup, Notifications, Rivalry |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • ACCEPT creates the Challenge Event transactionally and idempotently (PRD §14.1). <br>• Challenge accepted haptic: impactAsync(Heavy). <br>• Report/block in the header menu. |

<a id="eventbuildup"></a>
### 2 · Event build-up  ·  `EventBuildup`

Screenshot: [`screens/EventBuildup.png`](screens/EventBuildup.png) · Prototype: [`prototype/EventBuildup.dc.html`](prototype/EventBuildup.dc.html) · Artboard 390×2270

| | |
|---|---|
| **Purpose** | Challenge Event build-up (forming situation): ChallengeEventHero with countdown, follow, poster link, WHO TAKES IT? prediction, backing, poll, the crowd (comments), hype feed. |
| **Suggested route** | `/event/[id]` |
| **PRD** | §10.3–10.9 Challenge Event page |
| **Milestone** | M6 |
| **Situations** | `forming` |
| **DS components** | `Badge`, `Button`, `ChallengeEventHero`, `Chip`, `Comment`, `CrowdSupport`, `Divider`, `HypePost`, `Icon`, `IconButton`, `Input`, `Poll`, `PredictionBar` |
| **Goes to** | CallOut, EventToday, Poster |
| **Reached from** | CallOut, Compete, EventToday, Main, Notifications |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Predictions and backing are social only: no money, points, odds or payouts. Copy states it. <br>• Mute, report, block available. |

<a id="poster"></a>
### 3 · Share poster  ·  `Poster`

Screenshot: [`screens/Poster.png`](screens/Poster.png) · Prototype: [`prototype/Poster.dc.html`](prototype/Poster.dc.html) · Artboard 540×675

| | |
|---|---|
| **Purpose** | 540×675 share poster for an accepted Call-Out. Rendered to an image for external sharing. |
| **Suggested route** | `(share image, not a route)` |
| **PRD** | §10.10 Shareable posters |
| **Milestone** | M6 |
| **Situations** | `live` |
| **DS components** | none (custom poster markup) |
| **Goes to** | none |
| **Reached from** | EventBuildup |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Respect event privacy when sharing externally (§20.2). <br>• Not an interactive screen. |

<a id="eventtoday"></a>
### 4 · Event day  ·  `EventToday`

Screenshot: [`screens/EventToday.png`](screens/EventToday.png) · Prototype: [`prototype/EventToday.dc.html`](prototype/EventToday.dc.html) · Artboard 390×1280

| | |
|---|---|
| **Purpose** | Event day in the confirmed situation: both checked in, predictions count (lock when live), how the race goes live, I'M READY. |
| **Suggested route** | `/event/[id] (stage: today/soon)` |
| **PRD** | §10.9 Countdown & milestones |
| **Milestone** | M6 |
| **Situations** | `confirmed` |
| **DS components** | `ChallengeEventHero`, `Divider`, `HypePost`, `Icon`, `IconButton`, `ParticipantRow`, `PredictionBar` |
| **Goes to** | EventBuildup, EventLive |
| **Reached from** | EventBuildup, EventLive |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Stage → situation mapping lives in ChallengeEventHero (see design-system README). |

<a id="eventlive"></a>
### 5 · Live challenge  ·  `EventLive`

Screenshot: [`screens/EventLive.png`](screens/EventLive.png) · Prototype: [`prototype/EventLive.dc.html`](prototype/EventLive.dc.html) · Artboard 390×960

| | |
|---|---|
| **Purpose** | Live situation: LiveChallenge lanes (distance per competitor), freshness + verification source, locked predictions, cheer, the crowd. |
| **Suggested route** | `/event/[id] (stage: live)` |
| **PRD** | §10.12 Live Challenge |
| **Milestone** | M6 |
| **Situations** | `live` |
| **DS components** | `Badge`, `Comment`, `Divider`, `Icon`, `IconButton`, `LiveChallenge`, `ReactionBar` |
| **Goes to** | EventToday, Verifying |
| **Reached from** | EventToday, Verifying |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • LIVE locks predictions (§20.2). <br>• Show verified vs stale state accurately. |

<a id="verifying"></a>
### 6 · Verifying  ·  `Verifying`

Screenshot: [`screens/Verifying.png`](screens/Verifying.png) · Prototype: [`prototype/Verifying.dc.html`](prototype/Verifying.dc.html) · Artboard 390×790

| | |
|---|---|
| **Purpose** | After situation: VERIFYING. Submitted times marked NOT FINAL, checklist of checks (GPS data, each confirmation), CONFIRM BOTH TIMES / REQUEST A CORRECTION. |
| **Suggested route** | `/event/[id] (stage: verifying)` |
| **PRD** | §10.13 Result · §11.3 Verification hierarchy |
| **Milestone** | M6 |
| **Situations** | `after` |
| **DS components** | `Button`, `Icon` |
| **Goes to** | EventLive, Result |
| **Reached from** | EventLive, Result |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Nobody is called the winner until verification completes. |

<a id="result"></a>
### 7 · Result  ·  `Result`

Screenshot: [`screens/Result.png`](screens/Result.png) · Prototype: [`prototype/Result.dc.html`](prototype/Result.dc.html) · Artboard 390×1050

| | |
|---|---|
| **Purpose** | RecapPoster with the winner, prediction outcome ("The crowd got it wrong"), rivalry update, PB and Passport entry. |
| **Suggested route** | `/event/[id] (stage: complete)` |
| **PRD** | §10.13 Result, prediction outcome, rivalry |
| **Milestone** | M6 |
| **Situations** | `after` |
| **DS components** | `Badge`, `Icon`, `IconButton`, `RecapPoster` |
| **Goes to** | Rivalry, Verifying, You |
| **Reached from** | Rivalry, Verifying |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Result verified haptic: notificationAsync(Success). |

<a id="rivalry"></a>
### 8 · Rivalry & rematch  ·  `Rivalry`

Screenshot: [`screens/Rivalry.png`](screens/Rivalry.png) · Prototype: [`prototype/Rivalry.dc.html`](prototype/Rivalry.dc.html) · Artboard 390×1070

| | |
|---|---|
| **Purpose** | Head-to-head record, recent meetings with verification level, Rematch request. |
| **Suggested route** | `/rivalry/[id]` |
| **PRD** | §10.13 · §9.15 Rivalries |
| **Milestone** | M6 |
| **Situations** | `live`, `after` |
| **DS components** | `Badge`, `Divider`, `Icon`, `IconButton`, `Rematch`, `Rivalry` |
| **Goes to** | CallOut, Result |
| **Reached from** | Compete, Result |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • A rematch creates a new Challenge + Event linked through Rivalry. Never mutates the old result. |


---

## Community · Crews, Clans, Places, Updates

<a id="crewhome"></a>
### Crew home  ·  `CrewHome`

Screenshot: [`screens/CrewHome.png`](screens/CrewHome.png) · Prototype: [`prototype/CrewHome.dc.html`](prototype/CrewHome.dc.html) · Artboard 390×1560

| | |
|---|---|
| **Purpose** | Private Crew: who's free tonight (overlap only), Down For board, Ritual (Thursday football), crew-vs-crew, momentum. |
| **Suggested route** | `/crew/[id]` |
| **PRD** | §9.10 Crews · §9.12 Momentum & Rituals |
| **Milestone** | M2 |
| **Situations** | `calm` |
| **DS components** | `Avatar`, `AvatarCluster`, `Badge`, `Button`, `CrewMomentum`, `Divider`, `Icon`, `Image` |
| **Goes to** | Compete, CrewChat, Plan, You |
| **Reached from** | CrewChat, FirstHome, Place, You |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Availability is shown as overlap, never as anyone's calendar. |

<a id="crewchat"></a>
### Crew chat → Make This a Game  ·  `CrewChat`

Screenshot: [`screens/CrewChat.png`](screens/CrewChat.png) · Prototype: [`prototype/CrewChat.dc.html`](prototype/CrewChat.dc.html) · Artboard 390×1450

| | |
|---|---|
| **Purpose** | Crew chat where Ojoro notices a plan forming in conversation and offers to set it up, with a time poll and place pick. |
| **Suggested route** | `/crew/[id]/chat` |
| **PRD** | §9.11 Chat-to-Action / Make This a Game |
| **Milestone** | M2 / M5 |
| **Situations** | `calm`, `forming` |
| **DS components** | `Avatar`, `Button`, `Icon`, `IconButton`, `Input`, `Poll` |
| **Goes to** | CrewHome, Plan |
| **Reached from** | CrewHome, HostAnnounce, HostPeople, Notifications |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • The suggestion is opt-in. Nothing is created until someone taps. |

<a id="clan"></a>
### Clan  ·  `Clan`

Screenshot: [`screens/Clan.png`](screens/Clan.png) · Prototype: [`prototype/Clan.dc.html`](prototype/Clan.dc.html) · Artboard 390×1740

| | |
|---|---|
| **Purpose** | Persistent larger community: identity, stats, this week's runs, monthly mission (after situation), Clash link, roles (captain, coach, connector), clan-only leaderboard. |
| **Suggested route** | `/clan/[id]` |
| **PRD** | §9.13 Clans |
| **Milestone** | M7 |
| **Situations** | `calm`, `after` |
| **DS components** | `ActivityStrip`, `Avatar`, `Badge`, `Button`, `Divider`, `Icon`, `IconButton`, `Progress` |
| **Goes to** | Clash, Create, You |
| **Reached from** | Clash, You |
| **Prototype interactivity** | Static (links only). |

<a id="clash"></a>
### Ojoro Clash  ·  `Clash`

Screenshot: [`screens/Clash.png`](screens/Clash.png) · Prototype: [`prototype/Clash.dc.html`](prototype/Clash.dc.html) · Artboard 390×1500

| | |
|---|---|
| **Purpose** | Clan vs clan season (live situation): score poster, your part, the six events with results, crowd support. |
| **Suggested route** | `/clash/[id]` |
| **PRD** | §9.15 Ojoro Clash |
| **Milestone** | M7 |
| **Situations** | `live` |
| **DS components** | `Badge`, `Button`, `CrowdSupport`, `Divider`, `Icon`, `IconButton` |
| **Goes to** | Clan, Plan |
| **Reached from** | Clan, HostSeason |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Backing never changes a score; no stakes, no prizes (copy). |

<a id="pulse"></a>
### Pulse map  ·  `Pulse`

Screenshot: [`screens/Pulse.png`](screens/Pulse.png) · Prototype: [`prototype/Pulse.dc.html`](prototype/Pulse.dc.html) · Artboard 390×844

| | |
|---|---|
| **Purpose** | Map of areas with activity aggregates (12 active, forming 6/8, 5 want volleyball), filters, selected place sheet. |
| **Suggested route** | `/pulse` |
| **PRD** | §9.16 Places & Ojoro Pulse · §11.2 |
| **Milestone** | M8 |
| **Situations** | `live` |
| **DS components** | `Chip`, `Icon`, `LiveIndicator`, `Sheet` |
| **Goes to** | Create, Discover, Place |
| **Reached from** | Discover, Place |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Aggregate-first: areas, not people. Exact spots only inside plans you've joined. <br>• Map needs a full text alternative (the artboard has one in its aria-label). |

<a id="place"></a>
### Place  ·  `Place`

Screenshot: [`screens/Place.png`](screens/Place.png) · Prototype: [`prototype/Place.dc.html`](prototype/Place.dc.html) · Artboard 390×1400

| | |
|---|---|
| **Purpose** | A venue: what it is, tonight here, regular groups, top host, busiest times, CREATE ACTIVITY HERE. |
| **Suggested route** | `/place/[id]` |
| **PRD** | §9.16 Places |
| **Milestone** | M8 |
| **Situations** | `calm` |
| **DS components** | `ActivityStrip`, `Avatar`, `Badge`, `Button`, `Divider`, `Icon`, `IconButton`, `Image`, `VerificationBadge` |
| **Goes to** | Create, CrewHome, Plan, Pulse |
| **Reached from** | Pulse |
| **Prototype interactivity** | Static (links only). |

<a id="notifications"></a>
### Updates  ·  `Notifications`

Screenshot: [`screens/Notifications.png`](screens/Notifications.png) · Prototype: [`prototype/Notifications.dc.html`](prototype/Notifications.dc.html) · Artboard 390×1300

| | |
|---|---|
| **Purpose** | Updates grouped Needs you / Today / Earlier; each row deep-links to its canonical object with one inline action. |
| **Suggested route** | `/updates` |
| **PRD** | §9.19 Notifications & Deep Links |
| **Milestone** | M5 |
| **Situations** | `calm` |
| **DS components** | `Avatar`, `Divider`, `Graphic`, `Icon`, `IconButton` |
| **Goes to** | CallOut, CrewChat, EventBuildup, GameOn, Main, Plan, Recap |
| **Reached from** | Main |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Every notification routes to a canonical object with valid back navigation (§8.2). |


---

## First run & system states

<a id="welcome"></a>
### Welcome  ·  `Welcome`

Screenshot: [`screens/Welcome.png`](screens/Welcome.png) · Prototype: [`prototype/Welcome.dc.html`](prototype/Welcome.dc.html) · Artboard 390×844

| | |
|---|---|
| **Purpose** | Confirmed-situation welcome: I WANT TO DO SOMETHING. → WE'RE DOING IT AT 7. Sign in with Apple, Google or phone. |
| **Suggested route** | `/(auth)/welcome` |
| **PRD** | Auth (M1) · §11 privacy promise |
| **Milestone** | M1 · Slice 01 |
| **Situations** | `confirmed` |
| **DS components** | `Button` |
| **Goes to** | OnboardSports |
| **Reached from** | OnboardSports |
| **Prototype interactivity** | Static (links only). |

<a id="onboardsports"></a>
### Onboarding 1 · Sports  ·  `OnboardSports`

Screenshot: [`screens/OnboardSports.png`](screens/OnboardSports.png) · Prototype: [`prototype/OnboardSports.dc.html`](prototype/OnboardSports.dc.html) · Artboard 390×1110

| | |
|---|---|
| **Purpose** | Step 1 of 3: pick sports (chips wrap), then a rough level per sport. |
| **Suggested route** | `/(onboarding)/sports` |
| **PRD** | §9.1 Physical Identity |
| **Milestone** | M1 · Slice 01 |
| **Situations** | `calm` |
| **DS components** | `Button`, `Chip`, `Divider`, `Icon`, `Progress` |
| **Goes to** | OnboardWhen, Welcome |
| **Reached from** | OnboardWhen, Welcome |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Levels are for matching only and never show as a score (copy). |

<a id="onboardwhen"></a>
### Onboarding 2 · Time and distance  ·  `OnboardWhen`

Screenshot: [`screens/OnboardWhen.png`](screens/OnboardWhen.png) · Prototype: [`prototype/OnboardWhen.dc.html`](prototype/OnboardWhen.dc.html) · Artboard 390×1180

| | |
|---|---|
| **Purpose** | Step 2 of 3: usual free times grid (tap to toggle), how far you'll go, Pull Me In per sport. |
| **Suggested route** | `/(onboarding)/when` |
| **PRD** | §9.1 · §9.5 Pull Me In · §11.2 |
| **Milestone** | M1 · Slice 01 |
| **Situations** | `calm` |
| **DS components** | `Chip`, `Divider`, `Icon`, `Progress` |
| **Goes to** | OnboardPrivacy, OnboardSports |
| **Reached from** | OnboardPrivacy, OnboardSports |
| **Prototype interactivity** | Yes: buttons/switches change state in the prototype. Try it. |
| **Notes** | • Interactive in the prototype (grid toggles). <br>• Only ever shown as overlap, never as a calendar. |

<a id="onboardprivacy"></a>
### Onboarding 3 · Privacy  ·  `OnboardPrivacy`

Screenshot: [`screens/OnboardPrivacy.png`](screens/OnboardPrivacy.png) · Prototype: [`prototype/OnboardPrivacy.dc.html`](prototype/OnboardPrivacy.dc.html) · Artboard 390×1030

| | |
|---|---|
| **Purpose** | Step 3 of 3: who sees what, per profile part, with defaults; location is area-only; block/report everywhere. LET'S MOVE. |
| **Suggested route** | `/(onboarding)/privacy` |
| **PRD** | §11 Trust, Safety & Privacy |
| **Milestone** | M1 · Slice 01 |
| **Situations** | `calm` |
| **DS components** | `Chip`, `Icon`, `Progress` |
| **Goes to** | FirstHome, OnboardWhen |
| **Reached from** | OnboardWhen |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Defaults shown here are the product defaults. |

<a id="firsthome"></a>
### First home · low density  ·  `FirstHome`

Screenshot: [`screens/FirstHome.png`](screens/FirstHome.png) · Prototype: [`prototype/FirstHome.dc.html`](prototype/FirstHome.dc.html) · Artboard 390×1640

| | |
|---|---|
| **Purpose** | Home on day one in a quiet area: honest headline, latent demand you can complete, quick Down For chips, bring your people, a bit further out, end of feed. |
| **Suggested route** | `/(tabs)/index (low-density state)` |
| **PRD** | §21.4 Ojoro Now no-supply journey · §19 low density risk |
| **Milestone** | M4 |
| **Situations** | `calm`, `forming` |
| **DS components** | `ActivityStrip`, `Button`, `Chip`, `Divider`, `Graphic`, `Icon`, `IconButton`, `Progress` |
| **Goes to** | Compete, Create, CrewHome, Discover, Plan, You |
| **Reached from** | OnboardPrivacy, States |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Never a dead end: always offers the next action. |

<a id="states"></a>
### System states  ·  `States`

Screenshot: [`screens/States.png`](screens/States.png) · Prototype: [`prototype/States.dc.html`](prototype/States.dc.html) · Artboard 1720×960

| | |
|---|---|
| **Purpose** | System states reference: loading skeletons (after 300 ms), offline (last confirmed state + age, queued taps), expired plan (never dead-ends), couldn't join (error in words + waitlist). |
| **Suggested route** | `(reference sheet)` |
| **PRD** | §17 Non-functional · §20.1 Definition of Done |
| **Milestone** | All |
| **Situations** | `calm`, `forming` |
| **DS components** | `ActivityStrip`, `Button`, `Divider`, `Icon`, `Input`, `PlanForming`, `Skeleton`, `Toast` |
| **Goes to** | FirstHome |
| **Reached from** | entry point / not linked |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Every feature must implement these states (PRD §20.1). |


---

## Host OS · Ade runs Plateau Pickup

<a id="hosthome"></a>
### Host home  ·  `HostHome`

Screenshot: [`screens/HostHome.png`](screens/HostHome.png) · Prototype: [`prototype/HostHome.dc.html`](prototype/HostHome.dc.html) · Artboard 390×1520

| | |
|---|---|
| **Purpose** | Host dashboard: YOUR WEEK., Needs you (join requests, refund decision, league result to confirm), this week's sessions, last-30-days stats, tools list. |
| **Suggested route** | `/host/[programId]` |
| **PRD** | §13 Host & Organizer OS |
| **Milestone** | M7 |
| **Situations** | `calm` |
| **DS components** | `Badge`, `Divider`, `Icon` |
| **Goes to** | HostAnnounce, HostInsights, HostMembership, HostPeople, HostRequests, HostRoster, HostSeason, HostSeries, You |
| **Reached from** | HostInsights, HostMembership, HostPeople, HostRequests, HostRoster, HostSeason, HostSeries, You |
| **Prototype interactivity** | Static (links only). |
| **Notes** | • Entry point: You → Crews, clans & hosting → Plateau Pickup. |

<a id="hostseries"></a>
### Series & template  ·  `HostSeries`

Screenshot: [`screens/HostSeries.png`](screens/HostSeries.png) · Prototype: [`prototype/HostSeries.dc.html`](prototype/HostSeries.dc.html) · Artboard 390×2580

| | |
|---|---|
| **Purpose** | Edit a recurring series: name, place, start, length, players stepper, level, repeat days, end date, joining window, approval/waitlist/members-first switches, price, refund window, next 4 sessions (skip/restore), save or save as template. |
| **Suggested route** | `/host/[programId]/series/[id]` |
| **PRD** | §13 recurring activities & templates |
| **Milestone** | M7 |
| **Situations** | `calm` |
| **DS components** | `Badge`, `Button`, `Chip`, `Divider`, `Icon`, `IconButton`, `Input` |
| **Goes to** | HostHome |
| **Reached from** | HostHome, HostRoster |
| **Prototype interactivity** | Yes: buttons/switches change state in the prototype. Try it. |
| **Notes** | • Interactive in the prototype: stepper, switches, skip/restore. <br>• Changes apply from the next session; people already in get one message. |

<a id="hostroster"></a>
### Tonight's roster & waitlist  ·  `HostRoster`

Screenshot: [`screens/HostRoster.png`](screens/HostRoster.png) · Prototype: [`prototype/HostRoster.dc.html`](prototype/HostRoster.dc.html) · Artboard 390×1920

| | |
|---|---|
| **Purpose** | Tonight's roster: 14/14 in, payment status per person, waitlist in order with auto-fill cutoff, dropped list with automatic refund, MESSAGE ALL, CHECK-IN. |
| **Suggested route** | `/host/[programId]/session/[id]` |
| **PRD** | §13 participant management, waitlists |
| **Milestone** | M7 |
| **Situations** | `calm` |
| **DS components** | `Avatar`, `Badge`, `Button`, `Divider`, `Icon`, `IconButton`, `Progress` |
| **Goes to** | HostAnnounce, HostHome, HostSeries |
| **Reached from** | HostAnnounce, HostHome |
| **Prototype interactivity** | Yes: buttons/switches change state in the prototype. Try it. |
| **Notes** | • Waitlist auto-promotes until a cutoff (2 h before), then the host chooses. <br>• A dropped spot filled from the waitlist refunds automatically. |

<a id="hostrequests"></a>
### Join requests  ·  `HostRequests`

Screenshot: [`screens/HostRequests.png`](screens/HostRequests.png) · Prototype: [`prototype/HostRequests.dc.html`](prototype/HostRequests.dc.html) · Artboard 390×1600

| | |
|---|---|
| **Purpose** | Approve or decline join requests with Ojoro history (games, show-up record), their note, shared connections; auto-approve rules. |
| **Suggested route** | `/host/[programId]/session/[id]/requests` |
| **PRD** | §13 approval workflows |
| **Milestone** | M7 |
| **Situations** | `calm` |
| **DS components** | `Avatar`, `Badge`, `Button`, `Divider`, `Icon`, `IconButton`, `Progress` |
| **Goes to** | HostHome |
| **Reached from** | HostHome |
| **Prototype interactivity** | Yes: buttons/switches change state in the prototype. Try it. |
| **Notes** | • Interactive: approve/decline/undo updates the count; switches toggle. <br>• Shows area only, never an address. Declining is quiet. |

<a id="hostpeople"></a>
### People · participant CRM  ·  `HostPeople`

Screenshot: [`screens/HostPeople.png`](screens/HostPeople.png) · Prototype: [`prototype/HostPeople.dc.html`](prototype/HostPeople.dc.html) · Artboard 390×1880

| | |
|---|---|
| **Purpose** | Participant CRM: search, filters (All/Regulars/Members/New/Drifting), expandable person with last-12 attendance, stats, pass, tags, private notes; Drifting invite-back panel. |
| **Suggested route** | `/host/[programId]/people` |
| **PRD** | §13 participant CRM & attendance history |
| **Milestone** | M7 |
| **Situations** | `calm` |
| **DS components** | `Avatar`, `AvatarCluster`, `Badge`, `Button`, `Chip`, `Divider`, `Icon`, `IconButton`, `Input` |
| **Goes to** | CrewChat, HostAnnounce, HostHome |
| **Reached from** | HostHome, HostMembership |
| **Prototype interactivity** | Yes: buttons/switches change state in the prototype. Try it. |
| **Notes** | • Hosts see attendance at their own sessions only. <br>• Private notes are host-only. |

<a id="hostmembership"></a>
### Memberships & payments  ·  `HostMembership`

Screenshot: [`screens/HostMembership.png`](screens/HostMembership.png) · Prototype: [`prototype/HostMembership.dc.html`](prototype/HostMembership.dc.html) · Artboard 390×2130

| | |
|---|---|
| **Purpose** | Next payout with line items, a refund decision (full / partial / keep), passes (drop-in, 10-pack, monthly, free), members, past payouts. |
| **Suggested route** | `/host/[programId]/payments` |
| **PRD** | §13 · §16.2 memberships & paid activities |
| **Milestone** | M7 / M9 |
| **Situations** | `calm` |
| **DS components** | `Avatar`, `AvatarCluster`, `Badge`, `Button`, `Divider`, `Icon`, `IconButton` |
| **Goes to** | HostHome, HostInsights, HostPeople |
| **Reached from** | HostHome, HostInsights |
| **Prototype interactivity** | Yes: buttons/switches change state in the prototype. Try it. |
| **Notes** | • The Ojoro service fee amount is a PLACEHOLDER. Fee not decided. <br>• Payments need server-side authorization (§17). |

<a id="hostannounce"></a>
### Announcements  ·  `HostAnnounce`

Screenshot: [`screens/HostAnnounce.png`](screens/HostAnnounce.png) · Prototype: [`prototype/HostAnnounce.dc.html`](prototype/HostAnnounce.dc.html) · Artboard 390×1670

| | |
|---|---|
| **Purpose** | Compose one announcement: recipients (multi-select with live count), templates, message, live preview of the pinned chat message, pin/notify switches, past announcements with read counts. |
| **Suggested route** | `/host/[programId]/announce` |
| **PRD** | §13 announcements & event chat |
| **Milestone** | M7 |
| **Situations** | `calm` |
| **DS components** | `Chip`, `Divider`, `Icon`, `IconButton`, `Input` |
| **Goes to** | CrewChat, HostRoster |
| **Reached from** | HostHome, HostPeople, HostRoster |
| **Prototype interactivity** | Yes: buttons/switches change state in the prototype. Try it. |
| **Notes** | • Hosts get 2 push notifications per session (logistics only). |

<a id="hostseason"></a>
### League operations  ·  `HostSeason`

Screenshot: [`screens/HostSeason.png`](screens/HostSeason.png) · Prototype: [`prototype/HostSeason.dc.html`](prototype/HostSeason.dc.html) · Artboard 390×1880

| | |
|---|---|
| **Purpose** | League ops: confirm a result (standings recompute), standings table, next round fixtures with ref assignment and readiness, season tools. |
| **Suggested route** | `/host/[programId]/league/[id]` |
| **PRD** | §13 tournament & season operations · §9.15 |
| **Milestone** | M7 |
| **Situations** | `calm` |
| **DS components** | `Badge`, `Button`, `Divider`, `Icon`, `IconButton`, `VerificationBadge` |
| **Goes to** | Clash, HostHome |
| **Reached from** | HostHome |
| **Prototype interactivity** | Yes: buttons/switches change state in the prototype. Try it. |
| **Notes** | • Tie-breaks: points, goal difference, goals scored. |

<a id="hostinsights"></a>
### Insights & revenue  ·  `HostInsights`

Screenshot: [`screens/HostInsights.png`](screens/HostInsights.png) · Prototype: [`prototype/HostInsights.dc.html`](prototype/HostInsights.dc.html) · Artboard 390×1760

| | |
|---|---|
| **Purpose** | Ojoro hours (hero), show-up / return / fill-time / payout tiles, people-per-week column chart with hover readout and table view, fill rate per session, revenue ledger, CSV export. |
| **Suggested route** | `/host/[programId]/insights` |
| **PRD** | §13 analytics & revenue · §15 |
| **Milestone** | M7 |
| **Situations** | `calm` |
| **DS components** | `Button`, `Divider`, `Icon`, `IconButton` |
| **Goes to** | HostHome, HostMembership |
| **Reached from** | HostHome, HostMembership |
| **Prototype interactivity** | Yes: buttons/switches change state in the prototype. Try it. |
| **Notes** | • Chart: single series, highlighted last week labelled in words, table view toggle (accessibility). <br>• Service fee is a placeholder. |

