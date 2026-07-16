# Migration from int_students

The canonical project is `globeready`.

Migrated concepts:

- Student profile fields
- Document organization
- Student guides
- Dashboard and checklist concepts
- Firebase authentication direction
- AI student-support direction

Rejected implementation details:

- Tracked `.env.local`
- Caller-supplied `x-user-id`
- Shared `default-user-123`
- Unverified MongoDB ownership
- Unbounded AI requests
- Empty README and undocumented security assumptions

The `int_students` repository should be deleted only after this rebuild is pushed and independently verified.
