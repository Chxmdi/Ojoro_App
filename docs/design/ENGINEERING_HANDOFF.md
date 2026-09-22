# D0 Engineering Handoff Contract

Each production screen is not complete until it has the following annotations.

## UI
- components
- variants
- state transitions
- motion/haptics
- accessibility behavior

## Data
- query/read requirements
- write/mutation requirements
- ownership
- retention/privacy classification

## API
- endpoint or command
- authorization rules
- idempotency/concurrency behavior
- failure semantics

## Realtime
- events subscribed to
- optimistic update rules
- reconciliation behavior

## Analytics
- screen viewed
- primary action shown
- primary action taken
- success/failure
- downstream real-world completion signal

## Safety
- block/report access
- visibility checks
- location precision
- youth restrictions
- challenge safety rules

## D0 → Engineering gate

Engineering may build infrastructure in parallel. A user-facing domain is implementation-ready when:
1. its Tier-A route exists;
2. states are documented;
3. components are defined;
4. data/API needs are annotated;
5. safety/privacy behavior is explicit;
6. prototype flow is coherent.
