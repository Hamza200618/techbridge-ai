# TechBridge AI — Project Specification

## 1. Project Overview

TechBridge AI is an AI-powered software engineering assistant that analyzes an uploaded software project and creates a digital representation of its architecture, dependencies, issues, security findings, and relationships.

The system is designed as a "JARVIS for Developers" that helps developers understand, diagnose, improve, validate, and modify existing software projects.

A developer uploads a completed project as a ZIP file.

TechBridge AI then:

1. Extracts the project.
2. Discovers files and folders.
3. Detects languages and technologies.
4. Detects dependencies.
5. Detects relationships between files.
6. Detects APIs and database usage.
7. Performs code and security analysis.
8. Calculates file health and project health.
9. Visualizes project architecture.
10. Allows the developer to ask AI questions about the project.
11. Allows file-level AI conversations.
12. Diagnoses detected issues.
13. Generates proposed fixes.
14. Allows the user to Apply or Reject fixes.
15. Tracks code changes and versions.
16. Performs impact analysis.
17. Performs root-cause tracing.
18. Validates the modified project.
19. Exports the modified project as a ZIP.

The system must never automatically modify the user's project without explicit user approval.


---

## 2. Main Goal

The main goal is to provide developers with a single platform for understanding and improving an existing software project.

TechBridge AI should answer questions such as:

- What is the architecture of my project?
- Which files depend on each other?
- Which files have problems?
- Why is this component failing?
- What is the root cause of this issue?
- What other files will be affected if I change this file?
- Are there security problems?
- How can I fix this issue?
- What exactly will change if I apply this fix?
- Did the project still build or pass tests after the change?
- Can I download the corrected project?


---

## 3. Core Features

### 3.1 User Authentication

The system must support:

- User registration
- User login
- User logout
- Current authenticated user
- Protected routes
- Password hashing
- Project ownership

Authentication uses the existing `users` table.

The backend must never return `password_hash`.


---

## 3.2 Project Upload

Users can upload software projects as ZIP files.

Requirements:

- ZIP files only.
- Validate uploaded files.
- Prevent ZIP path traversal.
- Safely extract projects.
- Store the original ZIP.
- Create an editable working copy.
- Keep the original ZIP immutable.
- Track project processing status.

The system must support projects containing multiple languages and technologies where possible.


---

## 3.3 Project Discovery

After extraction, TechBridge AI should discover:

- Files
- Directories
- File extensions
- Programming languages
- Configuration files
- Package/dependency files
- Framework indicators
- Entry points where detectable
- Environment/configuration references

Results are stored using the existing project/file database structures.


---

## 3.4 Architecture Visualization

The system should display the uploaded project's architecture.

The visualization should represent:

- Folders
- Files
- Dependencies
- Relationships
- APIs
- Important project components

Files should have health indicators:

- Gray = Unknown / not analyzed
- Green = No detected issue
- Yellow = Warning / uncertain condition
- Red = Detected issue

The architecture graph must be based on actual analyzer results.

The system must not invent relationships.


---

## 3.5 Project Health Score

TechBridge AI should calculate an overall project health score.

The score should consider available analysis information such as:

- Detected issues
- Issue severity
- Security findings
- File health
- Validation results
- Project structure

The exact scoring algorithm should remain modular so it can be improved later.

The project health score must be stored in the existing `projects.health_score` field.


---

## 3.6 Issue Detection

The analyzer should identify potential problems in the project.

Each issue should contain information such as:

- Severity
- Category
- Title
- Description
- Evidence
- Root cause where known
- Confidence
- Status

Severity levels:

- info
- low
- medium
- high
- critical

Issue status:

- open
- resolved
- ignored

The system must distinguish between detected evidence and AI-generated inference.


---

## 3.7 Security Analysis

TechBridge AI should identify potential security problems.

Examples include:

- Exposed secrets
- Insecure configuration
- Authentication weaknesses
- Authorization weaknesses
- Unsafe input handling
- Injection risks
- Unsafe dependencies
- Other detectable security problems

Security findings should contain:

- Severity
- Category
- Title
- Description
- Evidence
- Confidence
- Status

Sensitive values such as actual API keys or passwords must not be exposed in normal frontend responses.


---

## 3.8 Dependency Graph

TechBridge AI should detect project dependencies.

Examples:

- JavaScript imports
- Python imports
- Backend/frontend relationships
- Package dependencies
- Other detectable dependencies

Dependencies must be stored in:

`project_dependencies`

File-to-file relationships must be stored in:

`project_relationships`

The graph must use actual analyzer data.


---

## 3.9 API Detection

The analyzer should detect APIs where possible.

Examples:

- REST routes
- HTTP methods
- Endpoint paths
- Framework information
- Handler references

Detected APIs are stored in:

`project_apis`


---

## 3.10 Database Detection

The analyzer should detect database usage where possible.

Examples:

- Database technology
- Connection references
- Table references
- Database operations

Detected database information is stored in:

`project_databases`

Secrets and credentials must not be stored as plain text.


---

# 4. AI System

TechBridge AI uses a provider abstraction.

The application supports three AI providers:

1. Groq
2. Gemini
3. OpenAI

Default fallback order:

`Groq → Gemini → OpenAI`

The frontend never communicates directly with these providers.

The backend is responsible for all AI communication.


---

## 4.1 AI Provider Manager

All AI functionality must use the centralized AI provider manager.

The rest of the application must not directly call Groq, Gemini, or OpenAI.

The provider manager should:

1. Try Groq.
2. If Groq succeeds, return the response.
3. If Groq fails because of a temporary/provider-related error, try Gemini.
4. If Gemini fails, try OpenAI.
5. If OpenAI also fails, return a controlled error.

Fallback-worthy failures may include:

- Rate limits
- Quota errors
- Timeouts
- Network failures
- Temporary service failures
- Provider availability errors
- Relevant provider API errors

The system should not blindly fallback for every possible programming/request error.

API keys must never be exposed to the frontend.

API keys must never be hardcoded.


---

## 4.2 AI Context

TechBridge AI must not send the entire uploaded ZIP to an AI provider.

The system should first analyze the project locally.

AI requests should use focused context.

Depending on the operation, context may include:

- Selected file
- Related files
- Relevant dependencies
- Issues
- Security findings
- Architecture relationships
- APIs
- Databases
- Root-cause information
- Impact information

The context builder must be provider-independent.


---

## 4.3 Project AI Chat

Users can ask questions about their entire project.

Example questions:

- Explain my architecture.
- How does authentication work?
- Where is the database connection?
- Which files handle API requests?
- What technologies does this project use?
- What are the biggest problems?

The AI should use actual project context.


---

## 4.4 File AI Chat

Users can select a file and communicate with AI about that file.

The AI should understand:

- File contents
- Related files
- Dependencies
- Issues
- Security findings
- Architecture relationships

Normal chat must not automatically modify files.


---

## 4.5 AI Diagnosis

AI can analyze an existing detected issue.

The diagnosis should contain:

- Problem
- Evidence
- Root cause
- Suggested solution
- Confidence

The AI should clearly distinguish:

Observed evidence

from

AI inference.


---

## 4.6 Fix It

The user can select an issue and press:

`Fix It`

The system should:

1. Load issue information.
2. Build relevant context.
3. Ask AI for a solution.
4. Generate proposed code.
5. Generate a diff.
6. Store the proposed change.

The change must initially have:

`status = proposed`

The working project must not be modified at this stage.


---

## 4.7 Apply / Reject

The user can:

- Apply the proposed change.
- Reject the proposed change.

Applying a change must:

1. Verify ownership.
2. Verify the change belongs to the project.
3. Preserve the previous version.
4. Apply the proposed content.
5. Mark the change as applied.
6. Mark the project as modified.
7. Make previous analysis potentially stale.

Rejecting a change must not modify the project.


---

# 5. Version History

TechBridge AI must maintain change history.

Use:

- `code_changes`
- `project_versions`
- `file_versions`

The system should preserve enough information to understand:

- What changed.
- Which file changed.
- Why it changed.
- Which issue caused the change.
- What the previous version contained.
- What the new version contains.


---

# 6. Impact Analysis

When a file changes, TechBridge AI should determine which other components may be affected.

Use:

- `project_dependencies`
- `project_relationships`

Possible impact information:

- Directly dependent files
- Related files
- Affected APIs
- Affected components
- Dependency chain

The graph must come from actual analyzer data.


---

# 7. Root-Cause Tracing

TechBridge AI should trace detected issues through project relationships.

The system should identify:

- Affected file
- Related files
- Dependency chain
- Likely root cause
- Affected component

AI can explain the result, but it must not invent relationships.


---

# 8. Validation

TechBridge AI should validate projects after modifications.

Possible validation operations:

- Syntax checking
- Build
- Tests
- Lint
- Runtime checks where practical

Validation results are stored using:

- `validation_runs`
- `validation_results`

Uploaded code is untrusted.

Project code must be executed in an isolated/sandboxed environment.

The system must never claim that a project passed validation unless it actually ran successfully.


---

# 9. Export

Users can export the modified project.

The export process should:

1. Use the editable working copy.
2. Include accepted changes.
3. Exclude TechBridge internal metadata.
4. Create a clean ZIP.
5. Store export information.
6. Provide a secure download reference.

The original ZIP must remain immutable.


---

# 10. Storage Model

Storage is divided into:

storage/uploads/
storage/extracted/
storage/working/
storage/exports/
storage/temp/

Concept:

Original ZIP:
`uploads/`

Extracted project:
`extracted/`

Editable project:
`working/`

Generated ZIP:
`exports/`

Temporary processing:
`temp/`

The database stores metadata and paths.

Large source files should generally remain on filesystem/object storage instead of being stored directly inside MySQL.


---

# 11. Database

Database name:

`techbridge_ai`

Database:

MySQL 8+

The existing database has already been created manually.

The existing:

`database/schema.sql`

is the database source of truth.

IMPORTANT:

Qoder and developers must NOT:

- Recreate the database.
- Regenerate schema.sql.
- Modify schema.sql unless explicitly instructed.
- Create duplicate tables.
- Create alternative table structures.

Application code must match the existing schema exactly.


---

# 12. Existing Database Tables

The application uses these existing tables:

- users
- projects
- project_files
- project_dependencies
- project_relationships
- project_apis
- project_databases
- analysis_runs
- issues
- security_findings
- conversations
- chat_messages
- code_changes
- project_versions
- file_versions
- validation_runs
- validation_results
- exports


---

# 13. Security Requirements

The system must:

- Protect private routes.
- Verify project ownership.
- Never expose API keys.
- Never hardcode secrets.
- Validate uploaded ZIP files.
- Prevent ZIP path traversal.
- Treat uploaded projects as untrusted.
- Sanitize sensitive output.
- Isolate execution of uploaded code.
- Avoid logging secrets.
- Never allow one user to access another user's project.


---

# 14. Non-Goals

The current version does NOT require:

- Voice assistant functionality.
- A graph database.
- Automatic unrestricted code modification.
- Sending entire projects directly to an LLM.
- Automatic deployment of user projects.
- Permanent storage of API secrets in MySQL.

The priority is a reliable, demonstrable developer assistant.


---

# 15. Success Criteria

TechBridge AI is successful when a user can:

1. Register/login.
2. Upload a project ZIP.
3. See the project structure.
4. Start analysis.
5. See project health.
6. See file health.
7. See dependencies and relationships.
8. See detected issues.
9. See security findings.
10. Ask project-wide AI questions.
11. Ask questions about a specific file.
12. Get AI diagnosis.
13. Press Fix It.
14. Review the proposed change.
15. Apply or reject it.
16. View change history.
17. Run validation.
18. Perform impact/root-cause analysis.
19. Export the modified project as a ZIP.

The system should remain stable even if one AI provider becomes unavailable because of the fallback system:

`Groq → Gemini → OpenAI`