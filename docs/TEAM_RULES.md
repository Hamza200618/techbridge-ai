Database Rules

The MySQL database has already been created manually.

Database:

techbridge_ai

The existing file:

database/schema.sql

is the database source of truth.

DO NOT:
Recreate the database
Regenerate schema.sql
Delete schema.sql
Rename schema.sql
Create duplicate tables
Invent alternative table names
Change existing columns without agreement
Change relationships without agreement
Create unnecessary migrations

Do not ask Qoder to regenerate the database schema.

If a database change is genuinely required:

Discuss it with the team.
Confirm the reason.
Update the documentation.
Agree on the schema change.
Only then implement it.
5. Git Branch Rules

The main branch is:

main

Each team member should work on a feature branch.

Example:

feature/backend-ai
feature/analyzer
feature/frontend

Additional branches may use:

feature/<feature-name>
fix/<bug-name>
refactor/<feature-name>

Do not directly make large feature changes on main.

6. Commit Rules

Commits should be small and meaningful.

Good examples:

feat: add project upload endpoint
feat: add Groq provider
feat: add analyzer integration
fix: prevent zip path traversal
fix: handle AI provider timeout
feat: add project chat

Avoid commits such as:

update
changes
stuff
final
final2
test
new

A commit should describe what was changed.

7. Pull Request Rules

Before merging a feature:

Feature must be tested.
Existing functionality must continue working.
API contract must remain consistent.
Database schema must remain consistent.
Secrets must not be committed.
No duplicate implementation should be introduced.
Unrelated files should not be modified.

Pull requests should explain:

What changed?
Why was it changed?
How was it tested?
8. File Ownership

Each team member should primarily work inside their assigned area.

Backend / AI
backend/
Analyzer
analyzer/
Frontend
frontend/

Shared files should be changed carefully:

docs/
database/
package.json
README.md
.env.example

Do not overwrite another team member's work without discussion.

9. API Contract Rule

All frontend/backend communication must follow:

docs/API_CONTRACT.md

Before creating an endpoint:

Search existing routes.
Check the API contract.
Reuse existing functionality.
Only create a new endpoint when necessary.

Do not create duplicate endpoints.

If the API contract changes, update:

docs/API_CONTRACT.md

and inform the team.

10. Naming Rules

Use consistent naming.

Backend:

camelCase

Examples:

projectId
fileId
analysisRunId
conversationId

Database names follow the existing schema.

API routes follow the existing contract.

React components should use clear PascalCase names.

Examples:

ProjectDashboard
FileTree
CodeViewer
IssuePanel
ChatWindow
DiffViewer
11. No Duplicate Implementations

Before creating a new function, service, component, utility, route, or provider:

Search the repository first.

If equivalent functionality already exists:

Reuse it.

Do not create:

aiService.js
aiService2.js
aiServiceNew.js
aiHelper.js

when one existing service already performs the required job.

12. AI Provider Rule

The project supports:

Groq
Gemini
OpenAI

Provider-specific code must stay inside the AI provider layer.

The rest of the backend must use the provider manager.

Correct architecture:

Controller
    ↓
AI Service
    ↓
AI Context Builder
    ↓
AI Provider Manager
    ↓
Groq / Gemini / OpenAI

Do not call Groq, Gemini, or OpenAI directly from controllers.

13. AI Fallback Rule

The required fallback order is:

Groq
 ↓
Gemini
 ↓
OpenAI

Fallback should happen for appropriate temporary failures such as:

Timeout
Rate limit
Quota failure
Temporary server failure
Network failure

The provider manager should handle fallback centrally.

Do not duplicate fallback logic across multiple controllers.

14. API Key Rules

Never commit secrets to Git.

Never hardcode:

GROQ_API_KEY
GEMINI_API_KEY
OPENAI_API_KEY
JWT_SECRET
DB_PASSWORD

Secrets must exist only in environment configuration.

Example:

GROQ_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
JWT_SECRET=
DB_PASSWORD=

The .env file must not be committed.

Only .env.example should be committed.

15. Frontend Secret Rule

The frontend must never contain private API keys.

Do not place:

GROQ_API_KEY
GEMINI_API_KEY
OPENAI_API_KEY
DB_PASSWORD
JWT_SECRET

inside frontend code.

The frontend communicates with the backend.

Correct:

React
 ↓
Backend API
 ↓
AI Provider

Incorrect:

React
 ↓
Groq API directly
16. Analyzer Rules

The analyzer is responsible for discovering factual project information.

The analyzer should determine:

Files
Directories
Languages
Dependencies
Relationships
APIs
Database usage
Security findings
Detectable issues

The analyzer must not depend on an LLM for basic structural facts when those facts can be detected directly.

Example:

If the analyzer detects:

app.js → imports → database.js

that relationship should come from actual code analysis.

Do not ask an LLM to invent it.

17. AI Context Rules

Never send the entire uploaded ZIP to the AI by default.

The system should build focused context.

Examples:

For file chat:

Selected file
Relevant imports
Relevant dependencies
Related issues
Relevant project information

For issue diagnosis:

Issue
Evidence
Affected file
Related files
Relevant dependencies
Relevant code

For project chat:

Project summary
Architecture
Dependencies
APIs
Database usage
Issues
Security findings
Relevant files

AI context must use actual project data.

Do not invent:

Files
Dependencies
Relationships
APIs
Database tables
Errors
18. Fix It Safety Rule

The AI must never directly modify project code without user approval.

Required workflow:

Issue
 ↓
Diagnosis
 ↓
Suggested Fix
 ↓
Proposed Code
 ↓
Diff
 ↓
User Review
 ↓
Apply OR Reject

When the AI generates a fix:

code_changes.status = proposed

The working project must not be changed yet.

Only after the user selects:

Apply

should the proposed change be written to the working project.

If the user selects:

Reject

the project must remain unchanged.

19. Original ZIP Rule

The original uploaded ZIP is immutable.

Never modify the original upload.

Use:

uploads/

for the original project.

Use:

working/

for modifications.

Architecture:

Original ZIP
     ↓
Safe Extraction
     ↓
Working Copy
     ↓
AI Changes
     ↓
Validation
     ↓
Export

This allows the user to preserve the original project.

20. Storage Rules

Use the defined storage directories:

storage/
├── uploads/
├── extracted/
├── working/
├── exports/
└── temp/

Do not store uploaded project files randomly throughout the repository.

Do not commit user-uploaded projects to Git.

21. Security Rules

Uploaded code is untrusted.

Protect against:

ZIP path traversal
Unsafe extraction
Malicious filenames
Dangerous filesystem access
Secrets appearing in uploaded projects
Command execution risks

Validation of uploaded projects must happen in an isolated environment where possible.

Never execute untrusted project code directly on the main application host without appropriate isolation.

22. Database Access Rule

Application code should access the database through the backend's repository/data-access layer where applicable.

Controllers should not contain large SQL operations.

Preferred structure:

Controller
 ↓
Service
 ↓
Repository
 ↓
Database

Services contain business logic.

Repositories contain database access.

23. Controller Rules

Controllers should remain thin.

Controllers should primarily handle:

Request
Authentication
Validation
Calling services
Response

Avoid putting large business logic inside controllers.

Bad:

Controller
 ├── database queries
 ├── AI provider calls
 ├── ZIP extraction
 ├── analysis logic
 └── response

Preferred:

Controller
 ↓
Service
 ↓
Repository / Analyzer / AI / Validation
24. Service Rules

Services contain business logic.

Examples:

projectService
analysisService
aiService
diagnosisService
changeService
validationService
exportService

Services should reuse existing utilities instead of duplicating logic.

25. Validation Rules

Before declaring a validation successful:

Actually run the validation.

Possible validation types:

Syntax
Build
Tests
Lint

Never return:

passed

just because a command was not executed.

If a validation was skipped, return:

skipped
26. Testing Rules

Every major feature must be tested.

Minimum testing should include:

Happy path
Invalid input
Authentication failure
Ownership failure
Missing resource
Error handling
Security edge cases

Important features requiring testing:

Authentication
ZIP upload
ZIP extraction
Project analysis
AI provider fallback
AI chat
Diagnosis
Fix generation
Apply/Reject
Validation
Export
27. AI Fallback Testing

The AI provider system must be tested for:

Test 1 — Groq Success
Groq succeeds

Expected:

Groq response returned
Test 2 — Groq Timeout
Groq fails
Gemini succeeds

Expected:

Gemini response returned
Test 3 — Groq + Gemini Failure
Groq fails
Gemini fails
OpenAI succeeds

Expected:

OpenAI response returned
Test 4 — All Providers Fail

Expected:

AI_ALL_PROVIDERS_FAILED
Test 5 — Invalid Provider Configuration

The system should return a controlled error.

It must not crash the entire backend.

28. Logging Rules

Logs should help debugging without exposing secrets.

Never log:

API keys
Passwords
Password hashes
JWT secrets
Database passwords
Full secret values

Avoid logging entire uploaded project contents.

Use useful messages such as:

Project upload started
Project extraction completed
Analysis started
Analysis completed
AI provider failed
Falling back to Gemini
Validation completed
Export completed
29. Documentation Rule

When adding a major feature, update documentation when necessary.

Relevant files include:

PROJECT_SPEC.md
ARCHITECTURE.md
API_CONTRACT.md
TEAM_RULES.md
README.md

Do not create unnecessary documentation files.

30. Qoder Rules

When using Qoder to implement features:

Rule 1

Read the source-of-truth files first:

docs/PROJECT_SPEC.md
docs/ARCHITECTURE.md
docs/API_CONTRACT.md
docs/TEAM_RULES.md
database/schema.sql
Rule 2

Search the repository before creating anything.

Rule 3

Reuse existing code.

Rule 4

Implement only the requested phase.

Rule 5

Do not modify unrelated features.

Rule 6

Do not regenerate or modify:

database/schema.sql

unless the team explicitly requests a schema change.

Rule 7

Do not create duplicate services or utilities.

Rule 8

Follow existing naming conventions.

Rule 9

Check existing API endpoints before creating new ones.

Rule 10

Never hardcode secrets.

Rule 11

Test the implementation after completing the requested phase.

31. Scope Control Rule

During development, implement the smallest reliable version first.

Do not add unnecessary features simply because they seem useful.

Priority:

1. Upload Project
2. Analyze Project
3. Visualize Architecture
4. Show Health
5. AI Chat
6. Diagnose Issues
7. Generate Fix
8. Apply / Reject
9. Validate
10. Export

Advanced improvements should come after the core workflow works.

32. Communication Rule

If a change affects another team member's work:

Inform them before merging.

Examples:

API response changes
Database changes
Shared component changes
Analyzer output changes
Storage changes
Authentication changes

Do not silently introduce breaking changes.

33. Conflict Resolution

If two implementations solve the same problem:

Compare both implementations.
Prefer the simpler reliable solution.
Remove unnecessary duplication.
Keep one source of truth.
Update documentation if required.

Do not keep two systems just because both already exist.

34. Integration Rule

Before merging into main:

Pull latest main
↓
Resolve conflicts
↓
Run application
↓
Run tests
↓
Check API
↓
Check database
↓
Check frontend
↓
Merge

Integration should happen frequently rather than waiting until the end.

35. Final Architecture Principle

TechBridge AI should remain:

Modular
Maintainable
Secure
Testable
Easy to understand
Easy to extend
Free from unnecessary duplication

The team should prefer:

Simple reliable implementation

over:

Complex implementation with unnecessary features
36. Final Team Principle

The goal is not to generate the largest amount of code.

The goal is to build a working, reliable TechBridge AI system.

Every team member should prioritize:

Correctness
Security
Consistency
Integration
Maintainability

over unnecessary complexity.


### Your `docs` folder should now be exactly:

```text
docs/
├── PROJECT_SPEC.md
├── ARCHITECTURE.md
├── API_CONTRACT.md
└── TEAM_RULES.md

And these five files together are the source of truth for Qoder:

docs/PROJECT_SPEC.md
docs/ARCHITECTURE.md
docs/API_CONTRACT.md
docs/TEAM_RULES.md
database/schema.sql