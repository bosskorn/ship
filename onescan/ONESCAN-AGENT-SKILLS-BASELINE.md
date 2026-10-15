# OneScan Agent Skills Baseline — READY FOR OWNER REVIEW

**Scope:** tooling setup only.
- No application code, dependency, SDK, navigation, storage or encryption change.
- No build and no publish.

**Date:** 2026-10-15. **Claude Code:** 2.1.300.

## 1. Project status at the time of this baseline (do not redo)

| Item | Status |
|---|---|
| Receipt Restore R1 | FROZEN |
| Receipt Restore R2 | FROZEN (`219d858`) |
| Receipt Flatten | PARKED |
| R3 / Custom Dewarp Model | NOT APPROVED |
| Receipt Enhance validation tooling | `373962d`, FROZEN BEFORE REAL DATA; Pilot = 30 real receipts; no tuning during Pilot |
| Receipt Enhance | WAITING FOR OWNER REAL RECEIPTS |
| DocSeg Receipt Crop | BACKLOG |
| OCR temp security fix | `d1cbb22` on `claude/ocr-temp-cleanup`; code review + automated regression passed; waiting for real Android QA; not merged |
| Feature development | PAUSED until the Owner approves the next step |

**App stack** (read from `package.json` / `app.json`, unchanged):
- Expo SDK 57 (`expo ~57.0.27`), React Native 0.86.3, Expo Router.
- `expo-sqlite` with `useSQLCipher: true`.
- Local Expo module `onescan-vision` (Kotlin + Swift): camera/CV, Tesseract OCR, AES-256-GCM files, Android Keystore.

## 2. Installed

| Name | Source | Version / commit | Why | Used for |
|---|---|---|---|---|
| **expo** (official Expo plugin, 24 skills) | Anthropic plugin directory, partner tier "expo"; upstream `github.com/expo/skills` → `plugins/expo` | **1.12.5** (directory build `1.12.5-170589a7ee89`). GitHub head at audit time: `d4f4840` (1.13.9). The directory ships the reviewed 1.12.5 | Official source required by the Owner; covers every required Expo skill | Expo / RN development, routing, native UI, modules, dev client, upgrades, EAS workflows, Play Store |

**Install details:**
- Scope: **project**, in `/home/user/ship/.claude/settings.json`.
- Also enabled in `onescan/.claude/settings.json`. That file already listed `expo@claude-plugins-official`, which does not resolve here because no such marketplace is configured. I left that entry and added the working id.

**Required skills, all present in the plugin:**
- expo-overview
- expo-project-structure
- expo-router
- expo-native-ui
- expo-animation
- expo-module
- expo-dev-client
- expo-upgrade
- eas-workflows
- eas-app-stores
- eas-update

**Also in the plugin:**
- expo-ui, expo-design-system, expo-data-fetching, expo-examples, expo-brownfield
- expo-dom, expo-web-to-native, expo-app-clip
- eas-hosting, eas-observe, eas-simulator, eas-update-insights
- expo-skill-feedback

**Cost:** about 4.4k tokens always-on (skill descriptions). Each skill body loads only when it is invoked.

### Guardrails added with the install (`.claude/settings.json` and `onescan/.claude/settings.json`)

| Guardrail | Why |
|---|---|
| `env`: `DO_NOT_TRACK=1`, `EXPO_SKILLS_TELEMETRY=0`, `EXPO_NO_TELEMETRY=1` | The plugin has 2 hooks that run a local Node script after every Skill call and every slash command. The script sends skill names to PostHog only if the user opts in. It is off by default (`DEFAULT_ON=false`), and these variables force it off. |
| deny `mcp__plugin_expo_expo` | The plugin bundles a remote MCP server, `https://mcp.expo.dev/mcp`. OneScan is local-first: no project data goes to a third-party service without Owner approval. |
| deny `npx … submit-expo-feedback` | The skills tell the agent to send free-text feedback to Expo. That is outbound data. |
| deny `eas …`, `npx eas-cli …` | EAS cloud build, submit, update, simulator and hosting upload source or binaries. Production builds and Play publishing need Owner approval. A person can still run EAS by hand when approved. |

## 3. Rejected / not installed

| Candidate | Source / maintainer | Reviewed | Decision and reason |
|---|---|---|---|
| react-native-best-practices | Anthropic directory, **community**; Petro Nazarenko, `github.com/petro-nazarenko/mobile-skills`, v1.0.0 | Installed in an isolated audit config and read: SKILL.md (46 lines) + 5 references. No hooks, MCP, network or shell danger; only grep / cat audit commands | **Rejected.** Overlaps the official skills (Expo vs bare, navigation, Metro, lists). Its description fires on "ANY React Native / Expo" task and centres on React Navigation, while OneScan uses Expo Router. It would compete with expo-overview, which goes against precedence. |
| Skills For Real React/React Native Engineers | community, Jan Blazej, v1.7.1 | Catalog component list (39 skills, 8 commands, 8 agents including `code-refactorer`, `/refactor`, GSAP / Tailwind / Next.js) | **Rejected.** Very large, mostly web / animation, and pushes refactoring. Conflicts with "do not refactor because of a skill". |
| Android Emulator QA Plugin | community, Cea Barr, v1.0.0 | Catalog listing only; isolated install failed (name not resolvable from the CLI) | **Not installed.** This container has no emulator / KVM, and device QA is done by the Owner on real phones. Revisit when an emulator host exists. |
| Oh My Android | community, Amir Teymoori | Catalog listing | **Rejected.** Needs a macOS app + MCP server; not applicable here. |
| Ansight | community, v0.1.1 | Catalog listing (27 skills, SessionStart hook, external CLI) | **Rejected.** Early version, installs its own CLI, broad scope. |
| Kobiton Testing | partner, Kobiton | Catalog listing (cloud device farm MCP) | **Rejected.** Uploads app builds to a third-party cloud; needs an Owner decision and an account. |
| Dynatrace | partner | Catalog listing | **Rejected.** Production observability SaaS; uploads telemetry. |
| Sola / Pi / Above / clover-security | community | Catalog listing | **Rejected.** Remote security SaaS or always-on hooks; not needed. |
| claude-security | Anthropic, v0.11.0 | Catalog listing | **Not installed now.** It may be useful for a later security review, but the built-in `/security-review` and `/code-review` already cover it. Install only for an approved security task. |
| expo-experiments | official Expo repo (marketplace entry only) | Read the `expo-migrate-module` skill | **Not installed.** Experimental; Swift-only module migration; not needed. |

No third-party skill is approved at this time.

## 4. Conflict check (skill instructions vs OneScan)

| Skill instruction | Conflict | Resolution |
|---|---|---|
| expo-overview: "load first for every Expo task" and "trust the leaf skill" | Could override OneScan's own rules or frozen decisions | Precedence in `CLAUDE.md`: Owner decision > project rules > security > Expo skills |
| expo-ui / expo-native-ui: "consult `@expo/ui` first" and prefer native components | OneScan has its own design system (T* components) | Keep the existing design system. `@expo/ui` only by Owner decision, never as a refactor |
| expo-design-system: audits for drift and tokens | May suggest restructuring | Advisory only |
| expo-project-structure | Meant for new projects (the skill itself says never restructure an existing app) | No conflict, but not used for OneScan |
| expo-upgrade | SDK upgrades | Forbidden without Owner approval |
| expo-data-fetching: React Query / SWR and network patterns | OneScan is local-first, offline | Use only for the Phase 1.3 account API; never for document data |
| eas-*: cloud build, submit, update, simulator, hosting, observe | Uploads source or binaries; publishing needs approval | Bash `eas` / `eas-cli` denied for the agent |
| expo-skill-feedback and the "send feedback" footer in every skill | Outbound data | Denied; telemetry env forced off |
| Bundled Expo MCP server (`mcp.expo.dev`) | Third-party remote access | Denied |
| `onescan/AGENTS.md`: "fetch Expo docs before any Expo API" | No conflict | Keep; it complements the skills |

## 5. Capability coverage

| Area | Status | Covered by | Gap |
|---|---|---|---|
| React Native | **Partial** | expo-overview, expo-native-ui, expo-animation | No dedicated RN-core performance skill (profiling, Hermes, re-renders) |
| Expo | **Covered** | 24 official skills | – |
| Navigation (Expo Router) | **Covered** | expo-router | – |
| Mobile UI / UX | **Covered** (advisory) | expo-native-ui, expo-ui, expo-design-system | OneScan design system takes priority |
| Native modules (Expo Modules API) | **Covered** | expo-module | – |
| Android native development (Kotlin, Gradle, R8) | **Gap** | – | No official Android skill. The agent relies on general knowledge plus the existing `onescan-vision` code |
| Camera / image pipeline | **Gap** | – | Nothing for CameraX / expo-camera internals or bitmap memory |
| OCR / CV native integration | **Gap** | – | Nothing for Tesseract / ML Kit / OpenCV on Android; project code and reports are the reference |
| Android filesystem / temp-file lifecycle | **Gap** | – | Project rule: `SecureFiles.withPlainTemp` pattern (`d1cbb22`) |
| Android Keystore / AES-256-GCM | **Gap** | – | Project code is the reference (`SecureFiles.kt`) |
| SQLCipher | **Gap** | – | expo-sqlite docs only; no skill |
| Secure local document storage | **Gap** | – | Project architecture (encrypted files + SQLCipher) is frozen |
| Offline-first architecture | **Partial** | expo-data-fetching (offline section) | Network-centric; OneScan's local-first model is not covered |
| Memory / OOM / ANR profiling | **Gap** | – | No skill; needs `adb`, Android Studio profiler and a device |
| Android instrumentation testing | **Gap** | – | No skill; JVM unit tests exist in the project. No emulator in this container |
| JS unit testing (jest) | **Partial** | – | Project tests and patterns exist; no skill |
| Build / CI/CD | **Covered** (with limits) | eas-workflows, expo-dev-client | EAS is denied for the agent; local Gradle builds follow the project's own release docs |
| Google Play release workflow | **Covered** (with limits) | eas-app-stores (`play-store.md`) | Publishing needs Owner approval; EAS submit is denied for the agent |
| Mobile security review | **Partial** | built-in `/security-review`, `/code-review` | No mobile-specific (OWASP MASVS) skill |

**How to close the gaps, if the Owner wants:**
- Do not install community skills for these areas now.
- The safest option is a small **OneScan-internal** skill set written from the frozen architecture and existing code, so it cannot conflict with OneScan. For example:
  - `onescan-secure-storage`: Keystore + AES-GCM + SQLCipher + temp-file rules
  - `onescan-android-native`: Gradle / R8 / Kotlin module conventions
  - `onescan-device-qa`: adb, memory, ANR, Airplane-mode protocol
- That is new work and needs Owner approval. It was not started.

## 6. Agent operating rule

Saved in `/home/user/ship/CLAUDE.md`, which loads automatically in every session:
1. Read the baseline / latest status.
2. Identify the unfinished, approved next step.
3. Load only the relevant skills.
4. Never redo COMPLETE / FROZEN work.
5. No new workstreams.
6. No architecture change because a skill differs.
7. Work only inside Owner-approved scope.

**Task → skill map** (load only these):

| Task | Skills |
|---|---|
| Screen / UI change | expo-native-ui (+ expo-router if routes change) |
| Native module (onescan-vision) | expo-module |
| Dev build for testing | expo-dev-client |
| CI workflow | eas-workflows |
| Play Store release (when approved) | eas-app-stores |
| SDK upgrade (only when approved) | expo-upgrade |
| Everything else | none, or expo-overview only to route |

## 7. Files changed

| File | Change |
|---|---|
| `.claude/settings.json` (new, repo root) | enables `expo@anthropic-plugin-directory`; telemetry env off; deny rules |
| `onescan/.claude/settings.json` | adds the same plugin id, env and deny rules (existing entry kept) |
| `CLAUDE.md` (new, repo root) | agent operating rules and precedence |
| `onescan/ONESCAN-AGENT-SKILLS-BASELINE.md` (new) | this report |

The plugin files themselves live in the Claude Code plugin cache (`~/.claude/plugins/cache/…`), not in the repository. A new cloud session re-installs from the project setting.

No application source, `package.json`, lockfile, `app.json` or native code was touched.
