# GPT + Codex + Modern Web Guidance — operational standard

Status as of 2026-11-14: **repository instructions are active; Modern Web Guidance 1.0.0 was verified in one Codex Cloud task, but the plugin is not yet part of a reusable Cloud environment configuration**.

## Verified Codex Cloud integration
- Repository revision checked: `2dc4e4a85bd334d338aa9d551cfa6ac2565ad679`.
- Environment checked: Codex CLI `0.167.0-alpha.4`, Node.js `24.22.1`.
- Installed plugin: `modern-web-guidance@googlechrome` version `1.0.0`, from the official `GoogleChrome/modern-web-guidance` marketplace pinned to tag `v1.0.0` (commit `4dd968349e54ca45a05dd5c818fb035c9054b022`).
- Verification completed: `codex plugin list --json` reported the plugin as installed and enabled; the official CLI returned search results and retrieved the `responsive-design` guide in offline mode.
- No application dependency, package manifest, lockfile, site code, Worker code or bot code was changed.

The plugin files are installed under the Codex user directory for that cloud machine. This proves that the current Codex Cloud runtime supports the plugin, but it does not prove that a fresh task will inherit it.

## Persistence
- `AGENTS.md` and this document are repository files, so they remain available in future checkouts and sessions after the documentation branch is reviewed and merged.
- A plugin installed in the current machine's Codex user directory is task/environment state. The verified task had no reusable source environment configuration, so the plugin is not guaranteed to exist in a newly provisioned session.
- For automatic availability in future tasks, add the repository and the two official Codex plugin commands below to a reusable Cloud environment setup, then publish/promote that environment configuration and verify it from a new task:

```shell
codex plugin marketplace add GoogleChrome/modern-web-guidance --ref v1.0.0
codex plugin add modern-web-guidance@googlechrome
```

- Until that reusable environment is published, every new task must run `codex plugin list --json` before claiming the plugin is available. If it is absent, follow the official repository instructions to install it or use the documented on-demand CLI after checking the package source and version.

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
