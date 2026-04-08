# Shenanigans Management System

A role-based enterprise management platform running on Vercel + Firebase.

The project currently ships as a web application with serverless APIs under `vercel-web/`.

## Current Scope

- Web application with role-specific workspaces:
  - Managing Director: `/app`
  - Project Manager: `/pm-workspace`
  - Employee: `/workspace`
- Firebase-backed authentication and data storage
- Serverless API layer with security middleware, rate limiting, and request sanitization
- Project approval and automatic lifecycle status management

## Highlights

### Authentication and Access Control

- Email/password sign-in and registration via Firebase Auth REST API
- Firestore user profiles with role metadata
- Two-stage approvals for access:
  - Managing Director approval (`mdApproved`) for non-MD users
  - Project Manager approval (`pmApproved`) for employees
- HttpOnly, SameSite=Strict session cookie (`SHENANIGANS_SESSION`) with Firestore-backed session records

### Role Workspaces

- Managing Director workspace:
  - User approvals
  - Employee management
  - Project governance (including approve/reject project requests)
  - Finance and reporting views
- Project Manager workspace:
  - Team operations (tasks, requests, timesheets, team chat)
  - Project requests and updates (department-scoped)
- Employee workspace:
  - Personal tasks, projects, timesheet, requests, documents, profile

### Project Lifecycle (Current Behavior)

Projects use approval state plus timeline/progress signals to derive status automatically.

- Approval states: `PENDING`, `APPROVED`, `REJECTED`
- Derived statuses: `PENDING_APPROVAL`, `PLANNING`, `IN_PROGRESS`, `ON_HOLD`, `COMPLETED`, `ARCHIVED`
- `ARCHIVED` is explicitly controlled (MD only)
- PM project creation is restricted to the PM's own department
- MD approval action is binary: `YES` (approve) or `NO` (reject)

## Repository Layout

```text
shenanigans/
  .github/
  .mvn/
  logs/
  src/                          # Reserved/legacy folder (currently no active app source)
  vercel-web/
    api/
      auth/
        login.js
        register.js
        logout.js
        session.js
        forgot-password.js
      dashboard/
        summary.js
      employees/
        [...path].js
      projects/
        [...path].js
      finance/
        invoices/
          [...path].js
      workspace/
        [...path].js
      health.js
    lib/
      access.js
      firebase.js
      firebase-rest-auth.js
      project-lifecycle.js
      rate-limit.js
      sanitize.js
      security.js
      session.js
    public/
      app/                       # Managing Director pages
      pm-workspace/              # Project Manager pages
      workspace/                 # Employee pages
      assets/                    # shared JS/CSS
      app.html
      index.html
    package.json
    vercel.json
  README.md
  LICENSE
```

## API Surface

### Auth

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/forgot-password`

### Core

- `GET /api/health`
- `GET /api/dashboard/summary`

### Business APIs

- `GET|POST|PUT|DELETE /api/employees...`
- `GET|POST|PUT|DELETE /api/projects...`
- `GET|POST|PUT|DELETE /api/finance/invoices...` (MD only)
- `GET|POST|PUT|DELETE /api/workspace/...`

Workspace API resources currently include:

- `timesheets`
- `leave-requests`
- `documents`
- `tasks`
- `comments`
- `activity-logs`
- `notifications`
- `milestones`
- `team-chat`

## Security Model

Implemented in request middleware and route handlers:

- Security headers (`X-Frame-Options`, `X-Content-Type-Options`, CSP in `vercel.json`, etc.)
- Same-origin checks for non-GET/HEAD mutations
- Content-type enforcement for JSON requests
- Rate limiting per client key
- Input sanitization for body/query
- Role and department authorization in API handlers

## Prerequisites

- Node.js 18+
- npm
- Vercel CLI (recommended for local and production workflows)
- Firebase project with:
  - Authentication enabled (Email/Password)
  - Firestore database
  - Service account credentials

## Environment Variables

Set these for local `vercel dev` and production Vercel project settings:

- `FIREBASE_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

`FIREBASE_SERVICE_ACCOUNT_JSON` must be the full service-account JSON string. Newline sequences in `private_key` can be escaped (`\\n`), and are normalized by the app.

## Local Development

1. Install dependencies:

```bash
cd vercel-web
npm install
```

2. Configure environment variables (Vercel env or local setup).

3. Run locally:

```bash
vercel dev
```

4. Open app:

- Login page: `http://localhost:3000/`
- Health check: `http://localhost:3000/api/health`

## Deployment

Deploy from `vercel-web/`:

```bash
vercel --prod
```

Routing, static pages, API mapping, and security headers are defined in `vercel-web/vercel.json`.

## Data Model Snapshot

### `users`

- `uid`, `email`, `displayName`
- `role`: `MANAGING_DIRECTOR | PROJECT_MANAGER | EMPLOYEE`
- `department`
- `mdApproved`, `pmApproved`
- `createdAt`

### `employees`

- Profile and HR fields (name, department, position, status, salary, hire date)
- Timestamps and approval-related synchronization fields

### `projects`

- Ownership, department, staffing, budget, schedule, and progress fields
- Lifecycle fields:
  - `approvalStatus`
  - `status` (derived)
  - `scheduleProgressPercentage`
  - `overdue`
- Approval metadata:
  - `submissionSnapshot`, `submittedForApprovalAt`
  - reviewer identity/timestamps/notes
  - approval and rejection metadata

### `invoices`

- `client`, `amount`, `paid`, `projectId`, `department`, timestamps

### Additional operational collections

Used by workspace capabilities and sessioning, including:

- `web_sessions`
- task/comment/activity/milestone/notification/team chat related collections

## API Examples

The examples below are representative payloads for common workflows.

### 1) Login

Request:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "pm@company.com",
  "password": "StrongPass123!"
}
```

Success response (`200`):

```json
{
  "ok": true,
  "data": {
    "user": {
      "uid": "abc123",
      "email": "pm@company.com",
      "displayName": "Pat Manager",
      "role": "PROJECT_MANAGER",
      "department": "Engineering",
      "mdApproved": true,
      "pmApproved": true
    },
    "redirect": "/pm-workspace"
  }
}
```

Pending-approval response (`403`):

```json
{
  "ok": false,
  "error": "Your account is pending Managing Director approval."
}
```

### 2) Project Approval (MD yes/no decision)

Request:

```http
PUT /api/projects/{projectId}
Content-Type: application/json

{
  "approvalDecision": "YES",
  "approvalNote": "Approved for Q2 rollout."
}
```

Success response (`200`):

```json
{
  "ok": true,
  "data": {
    "id": "projectDocId"
  }
}
```

Reject example:

```json
{
  "approvalDecision": "NO",
  "approvalNote": "Budget details need clarification."
}
```

### 3) Task Status Update (Workspace)

Request:

```http
PUT /api/workspace/tasks/{taskId}
Content-Type: application/json

{
  "status": "UNDER_REVIEW",
  "submissionNotes": "Implementation complete, ready for review."
}
```

Success response (`200`):

```json
{
  "ok": true,
  "data": {
    "id": "taskDocId",
    "projectId": "projectDocId",
    "status": "UNDER_REVIEW",
    "submissionNotes": "Implementation complete, ready for review.",
    "updatedAt": 1760000000000
  }
}
```

### 4) Health Check

Request:

```http
GET /api/health
```

Response (`200`):

```json
{
  "ok": true,
  "data": {
    "status": "UP",
    "platform": "vercel"
  }
}
```

## Notes

- The repository contains legacy scaffolding under `src/`, but active runtime code is currently in `vercel-web/`.
- For contributor updates, prioritize keeping this README aligned with API behavior and role workflows whenever lifecycle or approval logic changes.

## Contributing

1. Create a feature branch.
2. Make focused changes with tests/checks where applicable.
3. Validate impacted APIs and UI flows.
4. Open a pull request.

## License

MIT License. See `LICENSE`.
