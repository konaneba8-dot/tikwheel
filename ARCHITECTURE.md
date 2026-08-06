# TikWheel Architecture Plan

## 1. Product Direction

TikWheel is a separate live round platform with:

- Player registration and login
- Configurable game types
- Live rounds with selectable positions
- Payment verification
- Backend-selected winners
- Dynamic wheel animation where wheel sections exactly match eligible verified players
- Public winner history
- Admin dashboard with role-based permissions
- Audit logging for round and winner actions

The implementation in this workspace starts in demo/test mode so the legal/compliance layer remains configurable instead of assumed.

## 2. Chosen Stack For This Workspace

Because the repository was empty, the safest path is a self-contained Node.js app:

- Native `http` server
- JSON file persistence for demo/test mode
- Server-rendered HTML with a small client script
- Domain modules for rounds, payments, audit logs, wheel generation, and winner selection

This keeps the platform runnable without external dependencies while still mapping cleanly to a future production stack.

## 3. Core Architecture

### Layering

1. `server.js`
   - HTTP routing
   - JSON API
   - Static asset delivery
   - Session cookie handling

2. `src/lib`
   - Storage helpers
   - Password hashing and session signing
   - Cookie parsing

3. `src/domain`
   - Game type rules
   - Round state transitions
   - Position locking and release
   - Payment state transitions
   - Dynamic wheel section generation
   - Secure winner selection
   - Audit log writing

4. `src/views`
   - Shared HTML shells
   - Page templates for player, admin, live, and history views

5. `public`
   - Styles
   - Browser interactivity
   - Wheel animation

## 4. Data Model

### User

- `id`
- `role` (`PLAYER`, `ADMIN`, `SUPER_ADMIN`)
- `fullName`
- `phone`
- `email`
- `passwordHash`
- `salt`
- `location`
- `createdAt`
- `updatedAt`

### GameType

- `id`
- `code`
- `name`
- `description`
- `winnerCount`
- `defaultEntryPrice`
- `defaultPrize`
- `defaultMaxPlayers`
- `isActive`
- `config`

### Round

- `id`
- `number`
- `gameTypeId`
- `status`
- `maxPlayers`
- `entryPrice`
- `prize`
- `startAt`
- `endAt`
- `liveLink`
- `positions`
- `entries`
- `winnerSelection`
- `winners`
- `createdAt`
- `updatedAt`

### RoundEntry

- `id`
- `roundId`
- `userId`
- `position`
- `paymentStatus` (`PENDING`, `VERIFIED`, `REJECTED`, `EXPIRED`)
- `receiptUrl`
- `reference`
- `lockedAt`
- `expiresAt`
- `verifiedAt`
- `rejectedAt`
- `reason`

### WinnerSelection

- `id`
- `roundId`
- `winnerCount`
- `selectedEntryIds`
- `selectedPositions`
- `randomSeedSource`
- `createdAt`

### AuditLog

- `id`
- `actorUserId`
- `actorRole`
- `action`
- `entityType`
- `entityId`
- `before`
- `after`
- `createdAt`
- `metadata`

## 5. Round Flow

1. Admin creates a game type or uses an existing one.
2. Admin creates a round with capacity, prize, pricing, and schedule.
3. Players register or log in.
4. Player selects an open round and an available position.
5. Player submits payment details and optional receipt.
6. Position is locked while verification is pending.
7. Admin verifies or rejects payment.
8. Verified entry becomes eligible.
9. When the round reaches ready conditions, the backend selects winners securely.
10. The result is stored before any animation begins.
11. The UI reads the stored result and animates the wheel to that exact backend-selected winner.
12. Round is completed and written to history.

## 6. Dynamic Wheel Logic

The wheel must satisfy the rule:

`eligible verified players = wheel sections`

Implementation rule:

- Read verified entries for the round
- Sort by position or round order
- Generate exactly one wheel segment per eligible entry
- Never pad to 100 by default
- If 4 players are eligible, generate 4 segments
- If 100 players are eligible, generate 100 segments

Display strategy:

- For small counts, show labels clearly inside each segment
- For large counts, shrink typography and rely on color coding plus hover/tooltip labels
- Use a fixed top pointer
- Animate the wheel with a fast start and gradual slowdown

## 7. Winner Selection Logic

Winner selection happens only on the backend.

Rules:

- Only verified entries may be selected
- No duplicate winner can be selected within the same round unless the round is explicitly configured for multiple winners
- The selection must be saved before the animation starts
- The frontend only reveals the backend result
- Winner selection must be auditable
- Re-draws should be blocked unless the round is cancelled and reset by an authorized admin action

Implementation rule:

- Use a cryptographically secure random source
- Sample from verified entries
- Persist the selection and audit log in one atomic service operation

## 8. Player Flow

1. Register
2. Log in
3. Browse active rounds
4. Pick a round
5. Pick an available position
6. Submit payment
7. Wait for verification
8. See joined rounds and payment status
9. View live round details
10. Check winner history

## 9. Admin Flow

1. Log in with admin role
2. Create or edit game types
3. Create or schedule rounds
4. Review payments
5. Verify or reject entries
6. Monitor capacity and round state
7. Trigger draw when the round is ready
8. Review winner history and audit logs
9. Configure roles and permissions

## 10. Exact Files To Create Or Modify

### Root

- `package.json`
- `server.js`
- `README.md`
- `ARCHITECTURE.md`

### Data

- `data/state.json`
- `data/.gitkeep`

### Source

- `src/config.js`
- `src/lib/store.js`
- `src/lib/security.js`
- `src/domain/statuses.js`
- `src/domain/game-types.js`
- `src/domain/rounds.js`
- `src/domain/payments.js`
- `src/domain/wheel.js`
- `src/domain/winners.js`
- `src/domain/audit.js`
- `src/services/app-service.js`
- `src/views/layout.js`
- `src/views/pages.js`

### Public

- `public/styles.css`
- `public/app.js`

## 11. Build Order

1. Create the domain model and persistence layer.
2. Add the HTTP server and JSON APIs.
3. Build player, admin, live, and history pages.
4. Add dynamic wheel animation tied to backend-selected results.
5. Harden auth, role checks, and audit logging.
6. Extend to a real database and production auth provider later.
