# Goal 5 — Follow-ups Module Implementation

## Delivered

- Role-aware follow-up list: Super Admin company-wide, Sales Manager team-wide, Sales Agent assigned-only.
- Summary cards for today, overdue, upcoming, completed, missed, and total follow-ups.
- Date filters for all dates, today, tomorrow, this week, this month, overdue, and custom start/end range.
- Calendar filter controls expose date inputs and follow-up date selection without introducing a complex task board.
- Status filters for pending, completed, overdue, missed, rescheduled, and cancelled.
- Follow-up type and priority filters.
- Detail drawer with customer contact, lead status, notes, activity history, and action controls.
- Schedule form with customer, optional lead, assigned agent, type, priority, due date/time, and notes.
- Completion form with completion note, customer response, and optional next follow-up fields.
- Reschedule form with new date/time and reason.
- Missed, cancelled, and note activity actions.
- Automatic overdue detection for pending items whose due time has passed.
- Linked customer and lead timeline updates for schedule, completion, reschedule, missed, cancelled, and note events.

## API routes

```text
GET   /api/follow-ups
GET   /api/follow-ups/my
GET   /api/follow-ups/:id
POST  /api/follow-ups
PATCH /api/follow-ups/:id
PATCH /api/follow-ups/:id/reschedule
PATCH /api/follow-ups/:id/complete
PATCH /api/follow-ups/:id/missed
PATCH /api/follow-ups/:id/cancel
POST  /api/follow-ups/:id/notes
GET   /api/follow-ups/:id/activity
```

## Local preview

```powershell
npm start
```

Open `http://127.0.0.1:4173/follow-ups` after signing in with one of the demo accounts documented in `GOAL_1_AUTH_IMPLEMENTATION.md`.

## Production notes

The current server intentionally uses in-memory demo records. Production should persist follow-ups, activity history, completion metadata, and linked customer timeline events in the database, run overdue detection as a scheduled job, and keep authorization checks at the API boundary.
