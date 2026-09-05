## 1. Purpose

This document defines the REST API contract for TechBridge AI.

All frontend and backend development must follow this contract.

The API contract is shared between:

- Frontend
- Backend
- Analyzer
- AI services
- Validation services

Do not create duplicate endpoints with different names for the same feature.

---

# 2. Base URL

All application APIs use:

```text
/api

Example:

GET /api/health

Protected endpoints require authentication.

3. Authentication

TechBridge AI uses authenticated users.

Authentication endpoints:

POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

Protected endpoints must verify the authenticated user before accessing project data.

The frontend must never send:

password hashes
database credentials
AI API keys
JWT secrets
internal server secrets
4. Standard Response Format
Success

Successful responses should follow:

{
  "success": true,
  "data": {}
}

Example:

{
  "success": true,
  "data": {
    "projectId": 12,
    "name": "My Project"
  }
}
Error

Errors should follow:

{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}

Example:

{
  "success": false,
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project was not found."
  }
}

Do not expose raw stack traces to the frontend.

5. Common HTTP Status Codes

Use standard HTTP status codes.

200 OK
201 Created
202 Accepted
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
503 Service Unavailable
6. Authentication Endpoints
6.1 Register
POST /api/auth/register

Request:

{
  "name": "Hamza",
  "email": "hamza@example.com",
  "password": "password"
}

Response:

{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "name": "Hamza",
      "email": "hamza@example.com"
    }
  }
}

Rules:

Password must be hashed before storage.
Never return password_hash.
Email must be unique.
Validate input.
6.2 Login
POST /api/auth/login

Request:

{
  "email": "hamza@example.com",
  "password": "password"
}

Response:

{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "name": "Hamza",
      "email": "hamza@example.com"
    },
    "token": "authentication-token"
  }
}

Rules:

Validate credentials.
Never return the password or password hash.
Use the project's configured authentication mechanism.
6.3 Logout
POST /api/auth/logout

Response:

{
  "success": true,
  "data": {
    "message": "Logged out successfully."
  }
}
6.4 Current User
GET /api/auth/me

Response:

{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "name": "Hamza",
      "email": "hamza@example.com"
    }
  }
}
7. Health Check
GET /api/health

Response:

{
  "success": true,
  "data": {
    "status": "ok"
  }
}

This endpoint should verify that the backend application is running.

If appropriate, it may also report database connectivity.

8. Project Endpoints
8.1 Upload Project
POST /api/projects/upload

Content type:

multipart/form-data

Field:

file

The uploaded file must be a ZIP project.

Response:

{
  "success": true,
  "data": {
    "project": {
      "id": 1,
      "name": "My Project",
      "originalFilename": "my-project.zip",
      "status": "uploaded"
    }
  }
}

Rules:

Only ZIP uploads are accepted.
Validate the uploaded file.
Protect against ZIP path traversal.
Protect against unsafe extraction.
Original ZIP must remain immutable.
Create a working copy for modifications.
Store project metadata in the projects table.
Uploaded code must be treated as untrusted input.
9. Project Management
9.1 List Projects
GET /api/projects

Response:

{
  "success": true,
  "data": {
    "projects": []
  }
}

Only projects belonging to the authenticated user may be returned.

9.2 Get Project
GET /api/projects/:projectId

Response:

{
  "success": true,
  "data": {
    "project": {}
  }
}

The endpoint must verify:

User is authenticated.
Project exists.
Project belongs to the authenticated user.
9.3 Delete Project
DELETE /api/projects/:projectId

Response:

{
  "success": true,
  "data": {
    "message": "Project deleted successfully."
  }
}

Deleting a project must clean up its associated application data according to the database relationships and storage rules.

10. File Endpoints
10.1 List Project Files
GET /api/projects/:projectId/files

Response:

{
  "success": true,
  "data": {
    "files": []
  }
}
10.2 Get Project Tree
GET /api/projects/:projectId/tree

Response:

{
  "success": true,
  "data": {
    "tree": []
  }
}

The tree should represent the discovered project structure.

10.3 Get File Metadata
GET /api/projects/:projectId/files/:fileId

Response:

{
  "success": true,
  "data": {
    "file": {}
  }
}
10.4 Get File Content
GET /api/projects/:projectId/files/:fileId/content

Response:

{
  "success": true,
  "data": {
    "fileId": 10,
    "path": "src/app.js",
    "content": "..."
  }
}

Rules:

Verify the file belongs to the project.
Verify the project belongs to the user.
Do not expose files outside the project working directory.
11. Analysis Endpoints
11.1 Start Analysis
POST /api/projects/:projectId/analyze

Response:

{
  "success": true,
  "data": {
    "analysisRun": {
      "id": 1,
      "status": "queued"
    }
  }
}

The analyzer should discover:

Files
Directories
Languages
Dependencies
File relationships
APIs
Database usage
Security findings
Detectable issues
11.2 Get Analysis Status
GET /api/projects/:projectId/analysis

Response:

{
  "success": true,
  "data": {
    "status": "completed",
    "progress": 100,
    "currentStage": "completed"
  }
}
12. Issue Endpoints
12.1 Get Issues
GET /api/projects/:projectId/issues

Response:

{
  "success": true,
  "data": {
    "issues": []
  }
}

Issues may contain:

Severity
Category
Title
Description
Evidence
Root cause
Confidence
Status
13. Security Endpoints
13.1 Get Security Findings
GET /api/projects/:projectId/security

Response:

{
  "success": true,
  "data": {
    "findings": []
  }
}

Security analysis should use actual evidence found in the uploaded project.

Do not claim a security issue without evidence.

14. Project AI Chat
14.1 Project Chat
POST /api/projects/:projectId/ai/chat

Request:

{
  "conversationId": 1,
  "message": "Explain the architecture of this project."
}

Response:

{
  "success": true,
  "data": {
    "conversationId": 1,
    "message": {
      "role": "assistant",
      "content": "..."
    }
  }
}

Rules:

Project ownership must be verified.
Use the AI context builder.
Do not send the entire ZIP blindly to the AI.
Use analyzer/database data to build relevant context.
Store conversation messages in the database.
AI provider selection is handled by the backend provider manager.
15. File AI Chat
15.1 File Chat
POST /api/projects/:projectId/files/:fileId/ai/chat

Request:

{
  "conversationId": 2,
  "message": "Explain this file."
}

Response:

{
  "success": true,
  "data": {
    "conversationId": 2,
    "message": {
      "role": "assistant",
      "content": "..."
    }
  }
}

The context should focus on:

Selected file
Relevant imports
Relevant dependencies
Related project information
Relevant issues

File chat must not modify project code.

16. AI Diagnosis
16.1 Diagnose Issue
POST /api/projects/:projectId/issues/:issueId/diagnose

Response:

{
  "success": true,
  "data": {
    "diagnosis": {
      "problem": "...",
      "evidence": [],
      "rootCause": "...",
      "suggestedSolution": "...",
      "confidence": 0.91
    }
  }
}

AI diagnosis must distinguish:

Actual evidence
AI inference
Suggested solution

The AI must not invent project relationships or evidence.

17. Fix It
17.1 Generate Proposed Fix
POST /api/projects/:projectId/issues/:issueId/fix

Response:

{
  "success": true,
  "data": {
    "change": {
      "id": 15,
      "status": "proposed",
      "description": "...",
      "diff": "..."
    }
  }
}

Fix workflow:

Issue
↓
Diagnosis
↓
Relevant Context
↓
AI Provider
↓
Proposed Fix
↓
Diff
↓
User Review
↓
Apply OR Reject

The project must NOT be modified when a fix is only proposed.

18. Apply Change
18.1 Apply Proposed Change
POST /api/projects/:projectId/changes/:changeId/apply

Response:

{
  "success": true,
  "data": {
    "change": {
      "id": 15,
      "status": "applied"
    }
  }
}

Rules:

Verify change belongs to project.
Verify change is still in proposed state.
Preserve previous version.
Apply only the approved change.
Update the working project.
Original uploaded ZIP remains unchanged.
Mark analysis as potentially stale when appropriate.
19. Reject Change
19.1 Reject Proposed Change
POST /api/projects/:projectId/changes/:changeId/reject

Response:

{
  "success": true,
  "data": {
    "change": {
      "id": 15,
      "status": "rejected"
    }
  }
}

A rejected change must not modify project files.

20. Change History
20.1 Get Changes
GET /api/projects/:projectId/changes

Response:

{
  "success": true,
  "data": {
    "changes": []
  }
}
21. Version History
21.1 Get Project Versions
GET /api/projects/:projectId/versions

Response:

{
  "success": true,
  "data": {
    "versions": []
  }
}
21.2 Get File Versions
GET /api/projects/:projectId/files/:fileId/versions

Response:

{
  "success": true,
  "data": {
    "versions": []
  }
}

Version history must preserve previous file states when changes are applied.

22. Impact Analysis
22.1 Get File Impact
GET /api/projects/:projectId/files/:fileId/impact

Response:

{
  "success": true,
  "data": {
    "fileId": 10,
    "dependsOn": [],
    "usedBy": [],
    "relatedFiles": []
  }
}

Impact analysis must use actual analyzer relationships and dependencies.

Do not invent relationships.

23. Root Cause Analysis
23.1 Get Issue Root Cause
GET /api/projects/:projectId/issues/:issueId/root-cause

Response:

{
  "success": true,
  "data": {
    "rootCause": {},
    "relatedFiles": []
  }
}

The relationship graph should come from stored analyzer data.

AI may help explain the root cause, but it must not invent graph relationships.

24. Validation
24.1 Validate Project
POST /api/projects/:projectId/validate

Response:

{
  "success": true,
  "data": {
    "validationRun": {
      "id": 5,
      "status": "queued"
    }
  }
}

Validation may include:

Syntax checking
Build checking
Tests
Linting

Validation must run in an isolated environment where possible.

Uploaded project code is untrusted.

Never report a validation as passed unless it actually ran successfully.

24.2 Get Validation Results
GET /api/projects/:projectId/validation

Response:

{
  "success": true,
  "data": {
    "runs": []
  }
}
25. Export Project
25.1 Export Modified Project
POST /api/projects/:projectId/export

Response:

{
  "success": true,
  "data": {
    "export": {
      "id": 10,
      "filename": "my-project-fixed.zip",
      "status": "completed"
    }
  }
}

Rules:

Export the working project.
Do not modify the original uploaded ZIP.
Do not include internal TechBridge AI metadata.
Create a safe ZIP archive.
Store export information in the exports table.
26. Authentication and Ownership Rules

Every protected project endpoint must verify:

Authenticated User
        ↓
Project Exists
        ↓
Project Belongs To User
        ↓
Requested Resource Belongs To Project

For example:

GET /api/projects/10/files/25/content

must verify:

User is authenticated.
Project 10 exists.
Project 10 belongs to the user.
File 25 belongs to project 10.
27. Standard IDs

Use consistent naming.

userId
projectId
fileId
issueId
changeId
conversationId
analysisRunId
validationRunId
projectVersionId

Do not create alternative names such as:

project_id
pid
project
projectID

inside API request/response contracts unless explicitly required by an existing implementation.

28. AI Provider Rules

The frontend must NEVER directly call:

Groq
Gemini
OpenAI

All AI requests must go through:

Frontend
↓
Backend API
↓
AI Service
↓
AI Context Builder
↓
AI Provider Manager
↓
Groq / Gemini / OpenAI

Provider fallback order:

Groq
↓
Gemini
↓
OpenAI

The provider manager is responsible for:

Provider selection
Timeout handling
Rate-limit handling
Quota failures
Temporary provider failures
Fallback
Final failure response
29. AI API Keys

AI keys must be stored only in environment variables.

Examples:

GROQ_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=

Never:

hardcode API keys
store keys in MySQL
send keys to frontend
commit keys to Git
expose keys in API responses
log full keys
30. Error Codes

Use consistent error codes.

Examples:

AUTH_REQUIRED
INVALID_CREDENTIALS
VALIDATION_ERROR
FORBIDDEN
PROJECT_NOT_FOUND
FILE_NOT_FOUND
ISSUE_NOT_FOUND
CHANGE_NOT_FOUND
INVALID_ZIP
ZIP_SECURITY_ERROR
UPLOAD_FAILED
EXTRACTION_FAILED
ANALYSIS_FAILED
AI_PROVIDER_FAILED
AI_ALL_PROVIDERS_FAILED
CHANGE_ALREADY_PROCESSED
VALIDATION_FAILED
EXPORT_FAILED
INTERNAL_ERROR

Error messages should be understandable to the frontend.

Do not return raw stack traces.

31. Database Contract

The API must follow the existing database schema.

Database:

techbridge_ai

The existing:

database/schema.sql

is the source of truth.

Do not:

create duplicate tables
rename existing tables
invent columns
invent relationships
regenerate the schema
create migrations unless explicitly requested

Use the existing tables and relationships.

32. No Duplicate Endpoints

Before creating an endpoint:

Search the repository.
Check existing routes.
Check API_CONTRACT.md.
Reuse an existing endpoint if it already serves the required purpose.

Do not create:

/api/project/:id/chat

if the official contract already defines:

/api/projects/:projectId/ai/chat
33. Security Rules

Never expose:

Password hashes
API keys
JWT secrets
Database passwords
Internal filesystem paths when unnecessary
Full environment configuration
Sensitive project secrets

Uploaded projects must be treated as untrusted.

All project file access must remain inside the project's allowed storage directory.

34. API Contract Change Rule

If an endpoint must be changed:

Discuss the change with the team.
Update API_CONTRACT.md.
Update backend implementation.
Update frontend usage.
Test the endpoint.
Commit the change clearly.

Do not silently change API behavior.

35. Final API Principle

The API should remain:

Consistent
Simple
Secure
Predictable
Versionable
Easy for frontend developers to consume
Easy for backend developers to maintain

The API contract is the shared agreement between the frontend and backend teams.


---

# 2. `docs/TEAM_RULES.md`

Copy **everything below** into:

```text
docs/TEAM_RULES.md
# TechBridge AI — Team Rules

## 1. Purpose

This document defines the development rules for the TechBridge AI team.

These rules exist to prevent:

- Duplicate code
- Conflicting implementations
- Database conflicts
- API conflicts
- Git conflicts
- Secret leaks
- Uncontrolled AI-generated changes
- Unnecessary rewrites

Every team member must follow these rules.

---

# 2. Team Structure

TechBridge AI has three team members.

## Member 1 — Core Backend / AI Integration Lead

Responsibilities:

- Backend architecture
- REST APIs
- Authentication
- Database integration
- AI provider integration
- AI provider fallback
- AI context builder
- AI chat
- AI diagnosis
- Fix It workflow
- Version/change system
- Backend integration

---

## Member 2 — Analyzer / Project Analysis Engine

Responsibilities:

- ZIP/project discovery
- File discovery
- Language detection
- Dependency detection
- Relationship detection
- API detection
- Database detection
- Static analysis
- Security analysis
- Health calculation
- Analyzer output

The analyzer must produce factual project data.

---

## Member 3 — Frontend / UI

Responsibilities:

- React frontend
- Dashboard
- Project upload UI
- Project tree
- Architecture visualization
- File/code viewer
- Health indicators
- Issue panel
- Security panel
- AI chat UI
- Diagnosis UI
- Diff viewer
- Apply/Reject UI
- Version history UI
- Validation UI
- Export UI

---

# 3. Source-of-Truth Files

The following files are official project documentation:

```text
docs/PROJECT_SPEC.md
docs/ARCHITECTURE.md
docs/API_CONTRACT.md
docs/TEAM_RULES.md
database/schema.sql