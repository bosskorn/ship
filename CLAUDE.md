# Agent operating rules (OneScan)

Read before any work in this repository. Full status: `onescan/ONESCAN-AGENT-SKILLS-BASELINE.md` §1
and `onescan/ONESCAN-INTERNAL-SKILLS.md`.

## Mandatory workflow (every task)
READ CURRENT BASELINE → LOCATE CURRENT IMPLEMENTATION → CHECK FROZEN/COMPLETED STATUS →
DEFINE MINIMAL CHANGE → IMPLEMENT → TEST → REPORT → STOP

Never start by writing a new implementation without reading the existing one.

## Anti-loop rule
Work marked COMPLETE, PASS, FROZEN, PARKED or NOT APPROVED is **not reopened** unless:
1. the Owner orders it directly, or
2. a new test shows a regression, or
3. a dependency / change makes the baseline unusable, or
4. there is new security evidence.

Without 1–4: **DO NOT REOPEN**. When 2–4 apply, report the evidence and ask before reworking.

## Skills: load only what the task needs
OneScan internal skills (`.claude/skills/`):
- `onescan-android-native`
- `onescan-camera-vision`
- `onescan-secure-documents`
- `onescan-temp-file-safety`
- `onescan-android-performance`
- `onescan-android-testing`
- `onescan-release-safety`

Official Expo skills (plugin `expo`): see the task → skill map in `onescan/ONESCAN-INTERNAL-SKILLS.md`.

Never load every skill. Never change architecture because a skill describes something different
from what exists.

## Precedence when instructions conflict
1. Owner decisions / OneScan frozen architecture
2. OneScan project rules (this file, `onescan/AGENTS.md`, project docs)
3. Security requirements: local-first, no upload of user documents, encryption, no secrets in the repo
4. OneScan internal skills
5. Official Expo skills
6. Approved third-party skills (none at present)
7. General agent behaviour

A skill can never change an Owner decision.

## Standing prohibitions (unless the Owner approves explicitly)
- No Expo SDK / React Native / dependency upgrades.
- No navigation, encryption or storage refactors.
- No EAS cloud action of any kind, and no production build, signing, upload, submit or publish.
- No external MCP server, no Expo telemetry, no feedback submissions.
- No sending source code, data or documents outside the machine.
- No uploading document images to any server or cloud OCR.
- No secrets, keystores, passwords, tokens or real receipts in the repository or in skills.
- No new workstream opened by the agent.

## Hand-over (context preservation)
Every report or hand-over keeps the following, so the next agent continues from the baseline
instead of re-exploring:
- branch, commit, version
- architecture decisions and environment / config
- completed work and pending work
- tests and their evidence, and **where** they ran (HOST / EMULATOR / REAL DEVICE)
- bugs, risks, unresolved issues
- Owner decisions, verbatim where it matters
