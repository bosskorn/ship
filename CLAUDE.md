# Agent operating rules (OneScan)

Read before any work in this repository. Details and the full status are in
`onescan/ONESCAN-AGENT-SKILLS-BASELINE.md`.

## Before starting a task
1. Read the latest status / baseline (`onescan/ONESCAN-AGENT-SKILLS-BASELINE.md` §1).
2. Identify the next step that is not done and is approved by the Owner.
3. Load only the skills that task needs (see the baseline's task → skill map). Do not load every skill.
4. Never redo, rerun, rebuild or re-audit work marked COMPLETE / FROZEN without evidence that it is needed.
5. Never open a new workstream on your own.
6. Never change architecture because a skill recommends something different from what exists.
7. Work only inside the scope the Owner approved; stop and report at the stated stop condition.

## Precedence when instructions conflict
1. Owner decisions / OneScan frozen architecture
2. OneScan project rules (`onescan/AGENTS.md`, project docs)
3. Security requirements (local-first, no uploads of user documents, encryption, no secrets in the repo)
4. Official Expo skills (plugin `expo@anthropic-plugin-directory`)
5. Approved third-party skills (none at present)
6. General agent behaviour

A skill can never change an Owner decision.

## Standing prohibitions (unless the Owner approves explicitly)
- No Expo SDK / React Native / dependency upgrades; no navigation, encryption or storage refactors.
- No EAS cloud build, submit, update, simulator, hosting or observe; no Play Store publish (denied in `.claude/settings.json`).
- No Expo MCP server and no Expo feedback / telemetry submissions (denied; telemetry env forced off).
- No uploading document images to any server or cloud OCR.
- No secrets, keystores or real receipts committed to the repository.
