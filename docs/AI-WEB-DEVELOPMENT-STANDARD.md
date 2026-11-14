# GPT + Codex + Modern Web Guidance — operational standard

Status as of 2026-11-14: **AI instructions added in a proposed branch; installation of Modern Web Guidance in Codex is NOT verified**.

## Responsibilities
- GPT: problem definition, business logic, testable acceptance criteria, risk review. No claim of deployment without evidence.
- Codex: implementation in a branch, review, automated checks, documented results.
- Modern Web Guidance: optional source of contemporary browser guidance for code; not a substitute for requirements, product testing, performance measurement or Safari compatibility checks.
- Repository AGENTS.md: the persistent agent-facing project rules that remain after deleting ChatGPT conversations.

## One-time integration
1. Open the project in an environment where Codex can read the repository.
2. Inspect the official installation steps and release notes at https://github.com/GoogleChrome/modern-web-guidance.
3. Install Modern Web Guidance only after checking the exact published installation instructions and package source. Do not copy unverified commands from chat.
4. Verify by listing the installed skill/plugin or running its documented check command in that environment.
5. Ask Codex to report which version and which instructions it actually loaded. A repository reference alone does not prove installation.
6. Apply this AGENTS.md in every Codex task on this project.
7. Repeat installation / verify applicability separately for other environments or projects as needed.

## Pilot: Nikolay-Card
1. Baseline: freeze commit SHA; screenshot critical mobile widths, record console errors, clickable link behavior, Lighthouse and accessibility checks if available.
2. Ask Codex for an audit **without changing any files**. Separate factual defects from optional modernization.
3. Fix only verified issues in a new branch. Preserve design and user-facing behavior.
4. Run the same measurements after the change. Note environment, browser versions, methods and test limits.
5. Publish only after review. Roll back if link behavior or mobile layout regresses.

## Success criteria
- Zero broken contact links and no regression in static no-JS links.
- No new horizontal overflow or critical accessibility regressions.
- No meaningful drop in page performance versus baseline.
- Concrete reduction in confirmed defects or developer rework; if none, do not claim efficiency gains.

## Repeatable task template
**Goal:** exact user outcome.
**Current behavior and evidence:** link/screenshot/file/commit.
**Must not change:** interface, links, content, existing workflow.
**Acceptance criteria:** measurable checks and browser/device targets.
**Deliverables:** branch/PR, test report, known gaps, rollback.
