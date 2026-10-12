# น้องช่าง — Customer App

> เรื่องบ้าน เรียกน้องช่าง

This is the native iOS and Android app for **น้องช่าง**, an on-demand home-services platform. It's built with **React Native + Expo (SDK 57)** and **Expo Router**. It is a real native app: no WebView, no PWA, no wrapped website.

Product promise: **รู้ราคา · รู้ช่าง · รู้เวลา · ติดตามได้ · มีประกัน**

## Run it

```bash
cd nong-chang
npm install
npx expo start            # press i / a, or scan with Expo Go
npm run typecheck && npm run lint && npm test
```

* **Login (mock):** use any Thai mobile number (`08x/09x/06x`) and any 6-digit OTP except `000000`.
* **Android maps:** set `GOOGLE_MAPS_ANDROID_API_KEY` before you make a dev or production build (see `app.config.js`). iOS uses Apple Maps.
* **Native modules:** maps, location, image picker and secure store are all native. Expo Go covers development. For release, use `npx eas-cli build`.

Until the backend exists, the app runs on a **local simulator** (`src/store/AppStore.tsx → useJobSimulator`). It plays the technician and dispatch side of every job: matching → en route (live ETA countdown) → arrived (PIN) → quote → approval → work → complete. Every screen can be exercised end to end. To connect the realtime API, replace that hook. Reducers and screens stay the same.

## Structure

```
nong-chang/
├─ app.json / app.config.js   native config: splash, icons, permission copy, maps key
├─ brand/                     logo kit (SVG) + tokens.json for design handoff
├─ scripts/                   brand-svgs.mjs → brand/*.svg, export-brand-png.mjs → assets/*.png
├─ src/
│  ├─ app/                    Expo Router screens (every file is a route)
│  ├─ brand/                  Logo + launch BrandAnimation
│  ├─ components/             N* native component layer (TDesign behaviour)
│  ├─ domain/                 pure business logic: pricing, dispatch, job state machine, search
│  ├─ data/                   catalog, technicians, user/property fixtures
│  ├─ store/                  app state, offline cache, mock realtime
│  ├─ lib/                    auth, analytics, haptics, permissions, network, format
│  └─ theme/tokens.ts         design tokens — the only place colours/spacing/radii live
└─ tests/                     node:test unit tests for src/domain
```

## Spec coverage

### MVP screens (§68)

| # | Screen | Route |
|---|---|---|
| 1 | Launch (native splash → brand animation) | `app/_layout.tsx`, `brand/BrandAnimation.tsx` |
| 2–3 | Login / OTP | `app/login.tsx`, `app/otp.tsx` |
| 4 | Home | `app/(tabs)/index.tsx` |
| 5 | Search (natural language) | `app/search.tsx` |
| 6 | All Services | `app/services/index.tsx` |
| 7 | Service Detail | `app/services/[id].tsx` |
| 8 | Photo Diagnosis | `app/diagnosis.tsx` |
| 9 | Address (native map + centre pin) | `app/booking/address.tsx` |
| 10 | Schedule (เร็วที่สุด / นัดหมาย) | `app/booking/schedule.tsx` |
| 11 | Order Summary | `app/booking/summary.tsx` |
| 12–13 | Matching + Technician Found | `app/job/[id]/matching.tsx` |
| 14–15 | Live Tracking + Arrived/PIN | `app/job/[id]/tracking.tsx` |
| 16–17 | Inspection → Quote Approval | `app/job/[id]/quote.tsx` |
| 18 | Work Progress | `app/job/[id]/progress.tsx` |
| 19 | Job Complete (before/after) | `app/job/[id]/complete.tsx` |
| 20–21 | Payment / Payment Success | `app/job/[id]/payment.tsx`, `success.tsx` |
| 22 | Review | `app/job/[id]/review.tsx` |
| 23–24 | My Jobs / Job Detail | `app/(tabs)/jobs.tsx`, `app/job/[id]/index.tsx` |
| 25 | Warranty + claim flow | `app/warranty.tsx` |
| 26 | Messages (+ order-bound chat) | `app/(tabs)/messages.tsx`, `app/chat/[id].tsx` |
| 27 | Notifications | `app/notifications.tsx` |
| 28 | My Home | `app/my-home.tsx` |
| 29 | Account | `app/(tabs)/account.tsx` |
| 30 | Support | `app/support.tsx` |

### Design system (§2–11, §57–62)

* **Tokens** (`src/theme/tokens.ts`). Colours use the spec's token names. Spacing follows the 4–32 scale with a 16 px screen padding and 24 px section gaps. Radii: button/input 6, card 8, dialog 12, sheet top 12, and pill only for tags, status and filters. Shadows appear only on sheets, floating controls and dialogs.
* **Typography.** iOS uses the system font. On Android, the system Thai face is Noto Sans Thai. Weights are Regular, Medium and Semibold only. Prices are drawn with `NPrice`, where the number is larger than the unit.
* **Components.** The 28 components in §62 are all present:
  * Every component in §62 has a matching N* component. `NList`/`NCell` share a file, `NDatePicker`/`NTimePicker` sit in `NPicker.tsx`, and NToast is `NToastProvider` + `useToast()`.
  * `NSkeleton` handles skeleton states. Only `NLoading` shows a spinner, and only inline.
  * `NAddressPicker`, `NServiceItem`, `NTechnicianItem` and `NJobStatus` cover the domain pieces.
* **Icons.** `NIcon` is a functional-only line icon set. It has no decorative icons.
* **Motion and haptics.** Button press feedback is synchronous. The bottom sheet animates in about 300 ms and the success animation runs about 650 ms. `lib/haptics.ts` exposes the intents `select`, `success` and `warning`.
* **Launch.** The native splash shows the brand background and the house mark. The JS animation then assembles the wrench "door" into the house, shows the wordmark and crossfades into Home, about 800 ms in total. Home underneath is already mounted with skeletons. There is no spinner and no "Loading" text.
* **Errors and offline.** `NErrorState` uses human wording only. Jobs are cached to AsyncStorage. While offline, `NOfflineBanner` shows "ข้อมูลล่าสุดเมื่อ HH:MM" over the cached data.
* **Permissions.** Location, camera and photos are each requested only at the moment of use. The prompt copy is in Thai (see `app.json`).

### Business logic (`src/domain`, unit tested)

* **Pricing engine (§55).** Covers base × qty, complexity, parts, urgency, distance, promotion (amount, percent and cap), credit, and the inspection-fee credit. The spec example `450 + 220 + 80 − 199 = 551` is a test. Technician net is `590 → 501.50`, and the withdrawal preview shows amount, fee and net.
* **Dispatch engine (§54).** Weighted score from distance 35, skill 25, success 15, rating 10, acceptance 10 and cancellation 5. Weights are configurable and normalised. Offline, busy, unskilled and out-of-radius technicians are filtered out.
* **Job state machine (§40, §50).** Illegal transitions are ignored. Work cannot start before the customer approves the quote.
* **Natural-language search (§17, §24).** Thai substring and keyword ranking, e.g. "แอร์ไม่เย็น", "น้ำรั่ว", "ปลั๊กเสีย". Photo diagnosis is presented as a recommendation, never as a guaranteed diagnosis.
* **Analytics (§65).** All 16 events are a typed union (`lib/analytics.ts`) and are fired from the matching screens and actions.

### Security (§63) — client side

OTP login stores tokens in the iOS Keychain or Android Keystore (`expo-secure-store`). API keys come from the environment and are never committed. Card data never touches the app; the provider SDK handles it. Refresh rotation, rate limiting, webhook validation, KYC, RBAC and audit logs are server responsibilities.

## Brand assets

`brand/` holds the reference-direction vector kit:

* `app-icon.svg`
* `symbol.svg`
* `logo-primary.svg`
* `logo-horizontal.svg`
* `logo-mono-white.svg` and `logo-mono-dark.svg`
* `splash-logo.svg`
* the Android adaptive-icon layers

The symbol is an abstract **home + wrench**: the door of the house is an upright open-end wrench.

To regenerate the kit:

```bash
node scripts/brand-svgs.mjs
CHROME=/path/to/chrome-headless-shell node scripts/export-brand-png.mjs
```

The wordmark uses live Thai text (Noto Sans Thai). Design should outline it into production SVG.

## Not in this app yet (next phases)

* **น้องช่าง Pro (Technician app, §47–51).** A separate Expo app. The shared `src/domain` (job flow, `technicianNet`, `withdrawalPreview`) is ready to be extracted into a package.
* **Admin / Operations (§52–53).** Built with TDesign Desktop on the web. It configures the dispatch weights and pricing.
* **Backend.** Realtime job events, push notifications via `expo-notifications` and server-side AI diagnosis.
* **Later products.** น้องช่าง Care (subscription), Business and Partner.
