# Rider shift and attendance contract

Owner: rider shift builder. The rider app (`rider-app/lib/screens/shift_screen.dart`) and the staff rider pages
(`web/src/components/warehouse/rider-attendance-card.tsx`) code against this file. Same conventions as the other contracts:
Socket.IO events on the one authenticated socket, ack `{ ok: true, data }` or `{ ok: false, error }`, stable English error
texts (the rider app maps them to French by exact match).

## 1. The model

A **shift** is one stretch of work of one rider: clock-in, clock-out and the minutes spent on breaks (`rider_shifts`).
The shift is the rider's duty state: **on shift** while one of their shifts has no `endedAt`, **on break** while a break runs
inside it. Main has no other on-duty flag (tasks are assigned by the warehouse desk, GPS follows the delivery in transit),
so nothing competes with this state, and it changes no existing behaviour: tasks can still be assigned to a rider who is
off shift.

Rules (server, `api/src/shifts/shift.service.ts`):

- **One open shift per rider.** Enforced in the service and in the database (C-shift-one-open: `openRiderId` is the rider's id
  while the shift is open, NULL once closed, with a UNIQUE index). Clocking in while on shift is a no-op: the open shift comes back.
- **Idempotent ends.** Clocking out with no open shift, or ending a break that is not running, is a no-op (the current state
  comes back, nothing is written, nothing is pushed). Starting a break while on one is a no-op too. Starting a break with no
  open shift is refused: `Start your shift first.`
- Clocking out ends a running break first.
- **Auto-close.** A shift open for 16 hours or more is closed at `startedAt + 16 h` (`endReason: 'auto'`, a running break ends
  there too), on the next read or action of that rider, and when staff read that rider. There is no scheduler job in this code base.
- A rider only reaches their own shifts: the id always comes from the socket, never from a request body.
- Times are UTC instants. "Last 7 days" = today and the 6 UTC days before it (the same window as the rider work stats); a
  shift counts on the day it started; an open shift counts up to now.
- Break minutes are whole minutes (a break is rounded down to the minute when it ends).

## 2. Shapes

```
Shift   { id, startedAt, endedAt|null, breakMinutes, onBreak, breakStartedAt|null, workedMinutes, endReason: 'rider'|'auto'|null }
        breakMinutes includes a break still running; workedMinutes = start..(end|now) minus breaks, never negative.

Summary { status: 'off'|'on'|'break',
          current: Shift|null,          // the open shift
          lastShift: Shift|null,        // the latest shift that ended (any age)
          minutesLast7Days, shiftsLast7Days,
          shifts: Shift[],              // shifts that started in the last 7 days, newest first (max 100), open one included
          now }
```

## 3. Rider events (role `rider` only, otherwise `Riders only.`)

| Event | Body | Answer |
|---|---|---|
| `shift:mine` | none | `Summary` |
| `shift:clockIn` | none | `Summary` (already on shift: unchanged) |
| `shift:clockOut` | none | `Summary` (not on shift: unchanged) |
| `shift:breakStart` | none | `Summary` (refused with `Start your shift first.` when off shift) |
| `shift:breakEnd` | none | `Summary` (no break running: unchanged) |

Push to the rider's own phones after every real change (including an auto-close found on a read): `shift:updated` with a `Summary`.

Errors: `Riders only.`, `Start your shift first.`, `Rider not found.`, `Your account is switched off. Ask an administrator.`,
`Too many requests — slow down.`

## 4. Staff

`attendance:rider { riderId }` answers `Summary & { riderId, riderName }`.

- Super Admin and Operations admin (`admin`, `admin_operations`): any rider. Other admin roles: `Not allowed.`
- Warehouse supervisor or manager: riders of their own warehouse only (`This rider belongs to another warehouse.`); an operator:
  `Only supervisors and managers can see rider attendance.`
- Anyone else: `Staff only.` / `Sign in to continue.`; unknown id or an account that is not a rider: `Rider not found.`

Staff only read; there is no staff write on shifts, so there is nothing to audit.

Push for the staff pages: `attendance:updated { riderId, status, since }` to the rider's warehouse room and to
`admin` / `admin_operations` (no times other than `since`, no hours).

## 5. Database

Migration `1793300000001-RiderShifts`: table `rider_shifts` (`id, riderId, hubId, openRiderId, startedAt, endedAt, breakMinutes,
breakStartedAt, endReason, createdAt`), indexes on `(riderId, startedAt)`, `hubId`, and the unique `openRiderId`. Reversible; no
data is created or changed.
