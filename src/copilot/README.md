# EA Copilot (Concept)

EA Copilot is an IDE-side assistant concept for Enterprise Architects.

## Audience

This document is written for:

- Senior enterprise architects
- Architecture review boards
- Security, risk, and procurement stakeholders evaluating trust boundaries

## Executive summary

EA Copilot is designed to provide assistance *without* introducing automation risk.

- It is an IDE-side assistant (not a chatbot product)
- It is repository-aware but **read-only**
- It proposes actions and explanations, but **never executes changes**
- It is designed to be extensible without AI vendor lock-in

## What it is

- An assistant **inside the IDE** (not a chatbot product)
- Designed for senior enterprise architects working in a repository-centric, governance-first environment
- Built to be deterministic, conservative, and enterprise-safe

## Current implementation status (this phase)

This repository currently implements **UI shell + contracts only**:

- Copilot docked panel UI (right side)
- Snapshot-based context provider (read-only boundary)
- Structured interaction contracts (no free-text prompts)
- Command palette stub (visible intents; disabled)
- Telemetry hooks (disabled; no data sent)

No AI execution engine is present.

## Role

EA Copilot:

- Helps interpret architecture information and propose next steps
- **Never modifies data automatically**
- **Always proposes, never executes**

This establishes a clear trust boundary before any AI exists.

## Future responsibilities (not implemented)

In later phases, EA Copilot may:

- Explain architecture based on repository data and the active view (read-only)
- Assist with impact analysis workflows (propose what to check and why)
- Suggest relationships, views, and governance checks (proposals only)
- Answer structured “what-if” questions using scenario models (no execution)

## Explicit non-responsibilities

EA Copilot will not:

- Auto-create repository elements
- Make silent edits
- Execute background actions
- Perform actions without explicit user intent

## Trust boundary

Even when an AI executor is introduced later:

- Copilot remains read-only with respect to the repository
- All actions require explicit user confirmation (future)
- No hidden automation or background execution

See the code contract in `src/copilot/concept.ts`.

## How it fits into an EA workflow

EA Copilot is intended to support (not replace) standard EA governance and review practices.

Typical workflow integration:

1. **Navigate the repository and views** using the IDE shell (Explorer, Diagrams, Analysis, Metamodel).
2. **Select the current focus** (an element, a view, an analysis tab).
3. **Open Copilot** (right-side panel) to review the read-only context snapshot.
4. **Choose a structured intent** (future) via Command Palette or panel actions.
5. **Review the proposed output** (explanations, suggestions, warnings, scenarios) and apply changes manually (future).

This flow keeps ownership and accountability with the architect and the architecture review process.

## Why it is safe for enterprises

EA Copilot is built around conservative enterprise controls:

- **Read-only context boundary:** Copilot receives a snapshot; it does not get mutation access.
- **No implicit execution:** No background jobs, no silent edits, no automated commits.
- **Deterministic integration surface:** Interaction uses structured JSON and explicit intents (not free-text prompts).
- **Reviewable behavior:** Outputs are proposals intended for human review.
- **Governance-first posture:** Governance and compliance remain explicit activities in the IDE.

## Privacy & telemetry posture

- Telemetry is implemented as **disabled hooks only**.
- No data is sent; no tracking is enabled.
- When enabled in a future phase (subject to enterprise policy), telemetry should capture only minimal operational metrics (e.g., event counts), not repository content.

## Extension architecture (plugin-ready)

Copilot is designed as an extension point to avoid AI vendor lock-in.

- Panel UI: `src/copilot/ui/CopilotPanel.tsx` (swappable via `src/copilot/extension.ts`)
- Context boundary: `src/copilot/CopilotContextProvider.tsx` (snapshot-based, read-only)
- Interaction contract: `src/copilot/contracts.ts` (structured JSON, explicit intents)
- Executor (stub): `src/copilot/executor.ts` (swappable; no implementation provided)

This repository intentionally does **not** bind to OpenAI or any vendor.
