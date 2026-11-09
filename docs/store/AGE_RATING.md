# Age rating answers

Answers for Apple's age rating questionnaire (App Store Connect → App Information → Age Rating) and
Google Play's IARC questionnaire (Play Console → App content → Content rating), from what Ojoro does
today. The stores compute the rating; the expected result is given for a sanity check, not as a promise.

## Apple

| Question | Answer | Why |
|---|---|---|
| Parental controls | No | |
| Age assurance | No | No birth date is collected yet (`docs/TRUST_CONTRACT.md`). |
| Unrestricted web access | No | The app opens Stripe's hosted pages and map links only. |
| User-generated content | **Yes** | Plans, chat, comments, photos, Challenges. Report and block are on every profile, chat, plan and Challenge; staff moderate in the admin tool (`apps/web`). |
| Messaging and chat | **Yes** | Crew and activity chat, Challenge comments. |
| Advertising | No | |
| Cartoon or fantasy violence | None | |
| Realistic violence | None | Boxing appears as a sport name only. |
| Prolonged graphic or sadistic violence | None | |
| Profanity or crude humor | None | Users can write anything; that is covered by user-generated content. |
| Mature or suggestive themes | None | |
| Horror or fear themes | None | |
| Medical or treatment information | None | |
| Alcohol, tobacco or drug use or references | None | |
| Sexual content or nudity | None | |
| Graphic sexual content and nudity | None | |
| Simulated gambling | None | Predictions and backing never involve money, odds, stakes, payouts or redeemable points. |
| Gambling (real money) | No | |
| Contests | None | Challenges have no prizes. |
| Loot boxes | No | |
| Health or wellness topics | Infrequent | Fitness results (personal bests) only; no medical advice. |

Expected: the user-generated content and chat answers set the floor (13+ in Apple's 2025 tiers). If the
owner sets a higher minimum age in the Terms (see `docs/store/PRIVACY.md`, question 1), choose the
matching "Age Rating Override" in App Store Connect.

Also in App Store Connect: "Made for Kids": **No**.

## Google Play (IARC)

| Question | Answer |
|---|---|
| Category | Social networking, forums, blogs and user-generated content (not "Game") |
| Violence, fear, sexuality, language, controlled substances, crude humour | No to every question |
| Gambling: real or simulated | No |
| Does the app allow users to interact or exchange content? | **Yes** |
| Does the app share the user's current physical location with other users? | **Yes** (only while a person chooses to share for one game) |
| Does the app allow users to purchase digital goods? | No (passes are for in-person sessions, paid on Stripe's page) |
| Does the app contain ads? | No |
| Is the app a web browser or search engine? | No |
| News app? | No |

Expected IARC result: Teen / PEGI 12 / USK 12, with the interactive elements "Users Interact" and
"Shares Location".

Target audience (Play Console → App content → Target audience): **16 and over** if the owner sets 16
as the minimum age, otherwise 13+. Never select under-13 groups: that brings the Families policy, which
Ojoro's live location sharing and open chat don't meet.
