# TechBridge AI — Architecture

## 1. Architecture Overview

TechBridge AI follows a modular full-stack architecture.

Main layers:

Frontend
↓
Backend API
↓
Application Services
↓
Analyzer / AI / Validation
↓
MySQL + File Storage


---

# 2. High-Level Architecture

```text
┌──────────────────────────────┐
│          React Frontend      │
│                              │
│ Dashboard                    │
│ Project View                 │
│ Architecture Graph           │
│ Code Viewer                  │
│ AI Chat                      │
│ Issue Panel                  │
│ Fix / Diff Viewer             │
└──────────────┬───────────────┘
               │ REST API
               ▼
┌──────────────────────────────┐
│       Node.js + Express      │
│                              │
│ Routes                       │
│ Controllers                  │
│ Services                     │
│ Middleware                   │
│ Repositories                 │
└───────┬──────────┬───────────┘
        │          │
        │          │
        ▼          ▼
┌────────────┐   ┌─────────────────┐
│ Analyzer   │   │ AI System       │
│            │   │                 │
│ Discovery  │   │ Context Builder │
│ Parsers    │   │ Diagnosis       │
│ Dependency │   │ Chat            │
│ Relations  │   │ Fixing          │
│ Security   │   │ Architecture    │
└──────┬─────┘   └────────┬────────┘
       │                  │
       │                  ▼
       │        ┌────────────────────┐
       │        │ AI Provider Manager│
       │        └─────────┬──────────┘
       │                  │
       │        ┌─────────┼─────────┐
       │        ▼         ▼         ▼
       │      Groq     Gemini     OpenAI
       │
       ▼
┌──────────────────────────────┐
│      MySQL + File Storage    │
│                              │
│ techbridge_ai                │
│ uploads / extracted /        │
│ working / exports / temp     │
└──────────────────────────────┘
3. Frontend Architecture

Frontend technology:

React
Vite
JavaScript/TypeScript according to existing project setup
React Flow or equivalent graph visualization
Monaco or equivalent code editor
Charting library where required

Frontend folders:

frontend/
└── src/
    ├── components/
    ├── pages/
    ├── layouts/
    ├── hooks/
    ├── services/
    ├── api/
    ├── context/
    ├── utils/
    ├── types/
    └── styles/

Responsibilities:

components/

Reusable UI components.

pages/

Application pages.

layouts/

Dashboard/application layouts.

hooks/

Reusable React hooks.

services/

Frontend business/service helpers.

api/

REST API communication.

context/

Global application state.

utils/

Frontend utilities.

types/

Shared frontend types/interfaces.

styles/

Global styling.

4. Backend Architecture

Backend technology:

Node.js
Express
MySQL

Structure:

backend/
├── controllers/
├── routes/
├── services/
├── middleware/
├── models/
├── repositories/
├── validators/
│
├── ai/
│   ├── provider/
│   ├── prompts/
│   ├── context/
│   ├── diagnosis/
│   ├── fixing/
│   ├── architecture/
│   └── chat/
│
├── analysis/
├── security/
├── validation/
├── storage/
├── utils/
├── config/
└── app/
5. Routes

Routes define HTTP endpoints.

Routes should:

Receive HTTP requests.
Apply middleware.
Validate access.
Forward work to controllers.

Routes should not contain large business logic.

6. Controllers

Controllers handle HTTP-level concerns.

Responsibilities:

Read request data.
Validate controller-level requirements.
Call services.
Return HTTP responses.

Controllers should not contain provider-specific AI logic.

7. Services

Services contain application/business logic.

Examples:

Project service
Upload service
Analysis service
AI service
Change service
Export service
Validation service

Services coordinate different components.

8. Repositories

Repositories handle database access.

They should contain:

SELECT operations
INSERT operations
UPDATE operations
DELETE operations

Repositories must use the existing schema.

Do not create alternative database structures.

9. Models

Models represent database entities.

They must match the existing database schema.

Do not add fields that do not exist in the database unless explicitly approved.

10. Analyzer Architecture

Analyzer structure:

analyzer/
├── ingestion/
├── extraction/
├── discovery/
├── parsers/
├── dependencies/
├── relationships/
├── api_detection/
├── database_detection/
├── security/
└── health/

Responsibilities:

ingestion/

Receives project information.

extraction/

Safely extracts ZIP projects.

discovery/

Discovers files and directories.

parsers/

Parses supported source files.

dependencies/

Detects dependencies.

relationships/

Detects relationships between project files/components.

api_detection/

Detects APIs and routes.

database_detection/

Detects database usage.

security/

Detects security findings.

health/

Calculates file/project health.

11. Analyzer Rule

The analyzer is responsible for discovering project facts.

The analyzer should NOT rely on an LLM to invent project structure.

AI can explain detected information but deterministic project relationships should come from analyzer data.

12. AI Architecture

The AI layer is provider-independent.

AI Controller
     ↓
AI Service
     ↓
AI Context Builder
     ↓
AI Provider Manager
     ↓
┌────┼────┐
▼    ▼    ▼
Groq Gemini OpenAI

The provider manager is the only component responsible for choosing an AI provider.

13. AI Provider Abstraction

Each provider implements the same interface.

Conceptually:

generateResponse(messages, options)

Providers:

backend/ai/provider/
├── aiProvider.js
├── groqProvider.js
├── geminiProvider.js
├── openaiProvider.js
└── aiProviderManager.js

Exact filenames may follow the existing project convention, but provider responsibilities must remain separated.

14. AI Fallback

Fallback order:

Groq
  ↓ failure
Gemini
  ↓ failure
OpenAI

Example:

User Request
     ↓
AI Service
     ↓
Provider Manager
     ↓
Try Groq
     │
     ├── success → return response
     │
     └── failure
             ↓
         Try Gemini
             │
             ├── success → return response
             │
             └── failure
                     ↓
                 Try OpenAI
                     │
                     ├── success → return response
                     │
                     └── failure
                             ↓
                       Controlled Error

Fallback should be triggered for appropriate provider failures such as:

Rate limits
Quota errors
Timeout
Network errors
Temporary provider errors
Service unavailable

API keys are stored only in environment variables.

15. AI Context Architecture

The system should not send an entire ZIP to an AI model.

Instead:

Project
   ↓
Analyzer
   ↓
Stored Project Knowledge
   ↓
Context Builder
   ↓
Relevant Context
   ↓
AI Provider

For a selected file:

Selected File
+
Related Files
+
Dependencies
+
Issues
+
Security Findings
+
Relationships
↓
Focused AI Context
16. Project Chat
Frontend
   ↓
POST /api/projects/:projectId/ai/chat
   ↓
Controller
   ↓
AI Chat Service
   ↓
Context Builder
   ↓
Provider Manager
   ↓
AI Provider
   ↓
Response

Messages are stored in:

conversations
chat_messages
17. File Chat
Frontend
   ↓
POST /api/projects/:projectId/files/:fileId/ai/chat
   ↓
File Chat Service
   ↓
File Context Builder
   ↓
Provider Manager
   ↓
AI

The context should focus on the selected file and its relevant project information.

18. Fix It Architecture
Issue
 ↓
Issue Service
 ↓
Diagnosis
 ↓
Context Builder
 ↓
AI Provider Manager
 ↓
AI Proposed Fix
 ↓
Diff Generator
 ↓
code_changes
 ↓
User Review
 ↓
Apply OR Reject

AI does not directly overwrite project files.

19. Change Architecture
Proposed Change
       ↓
code_changes
       ↓
User chooses
   ┌───┴────┐
   ▼        ▼
Apply     Reject
   │        │
   ▼        ▼
Working   Status =
Project   rejected
   │
   ▼
Version History

The original ZIP is immutable.

20. Validation Architecture
Modified Project
       ↓
Validation Service
       ↓
Sandbox
       ↓
Build/Test/Lint
       ↓
validation_results

Uploaded code is untrusted.

Validation must use isolation and timeouts.

21. Storage Architecture
storage/
├── uploads/
├── extracted/
├── working/
├── exports/
└── temp/

Original ZIP:

uploads/

Extracted project:

extracted/

Editable copy:

working/

Generated ZIP:

exports/

Temporary processing:

temp/

22. Database Architecture

Database:

techbridge_ai

Database technology:

MySQL 8+

The existing:

database/schema.sql

is the source of truth.

The schema is already created manually.

Application code must adapt to it.

No ORM migration or schema regeneration should be performed unless explicitly requested.

23. Security Architecture

Security responsibilities include:

JWT/session authentication according to implementation.
Authorization.
Project ownership.
Input validation.
ZIP path traversal prevention.
API secret protection.
Safe logging.
Sandboxed project execution.
Sensitive data masking.

Every private project operation must verify ownership.

24. Data Flow

Complete project workflow:

Upload ZIP
    ↓
Project Record
    ↓
Safe Extraction
    ↓
File Discovery
    ↓
Project Analysis
    ↓
Database Storage
    ↓
Architecture Visualization
    ↓
User Interaction
    ↓
AI Context
    ↓
AI Provider
    ↓
Diagnosis / Fix
    ↓
User Approval
    ↓
Working Project
    ↓
Validation
    ↓
Export ZIP
25. Architecture Principles
Keep modules separated.
Reuse existing services.
Avoid duplicate implementations.
Keep provider-specific AI code isolated.
Keep analyzer logic separate from AI logic.
Keep database access inside repositories.
Keep controllers thin.
Never expose secrets.
Never modify the original ZIP.
Never invent analyzer relationships.
Never automatically apply AI code changes.
Keep database/schema.sql as the source of truth.

---

# 3. `docs/API_CONTRACT.md`

```md
# TechBridge AI — API Contract

## 1. General Rules

Base URL:

`/api`

All protected endpoints require authentication.

JSON is the default request/response format unless otherwise specified.

The frontend must communicate with the backend only.

The frontend must never call Groq, Gemini, or OpenAI directly.


---

# 2. Standard Response Format

Successful response:

```json
{
  "success": true,
  "data": {}
}

Error response:

{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}

Do not expose:

API keys
Password hashes
Internal secrets
Sensitive credentials
Full secret values found inside uploaded projects