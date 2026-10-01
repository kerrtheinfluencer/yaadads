# tools/ — what runs what

Every harness here, and — more importantly — **who runs it**. A test nothing
executes is not a test, and that is how a stored-XSS fix sat uncommitted while
its release note announced it as shipped. `tools/verify-v2.js` now fails the
build if a `tools/test-*.js` file appears in none of: the `npm test` chain, a
`.github/workflows` step, or the "manual" list below.

## Automated — runs in CI on every push
| Tool | What it proves | Needs |
|---|---|---|
| `verify-v2.js` | wiring, SW precache, CSS, promise checks (§FOR-YOU, §MSG-V2) | — |
| `test-cleanup.js` | single sources (no duplicate `catById`/`escHtml`/CFG) | — |
| `test-data-safety.js` | this release only ADDS storage keys, never wipes | git history |
| `test-chat-v2.js` | AI chat core: intents, scoring, chips | — |
| `test-chat-wiring.js` | that core is still wired into the page | — |
| `test-onboarding.js` | first-visit/returning/blocked onboarding flows | Chrome |
| `test-p1-parity.js` | `_hay` cache ranks identically to the legacy path | — |
| `test-p1-no-cdn.js` | the app still boots with the CDN unreachable | — |
| `test-admin.js` | admin writes are confirm-gated and bounded | — |
| `test-reports.js` | moderation queue behaviour | — |
| `test-for-you.js` | the ranked feed: nothing hidden, newest cannot lead, mix, relevance | — |
| `test-account-referrals.js` | referral credit + link rules in `core.js` (`node:test`) | — |
| `test-msg-v2.js` | the real app in a browser: stored XSS, read receipts, sends | Chrome |
| `test-photo-gestures.js` | the lightbox gesture engine on touch (swipe / dismiss / pinch) + generated-page script parses | Chrome |
| `test-changelog-privacy.js` | release notes carry no secrets | — |

Run them all: `npm test` (browser suites are separate, see below).

## Automated — runnable, deliberately not in `npm test`
| Tool | Why it is not in the chain |
|---|---|
| `test-hero-layout.js` | Needs Chrome and ~90s. **Known failure:** it reports a *sustained* horizontal overflow at **390px** (iPhone 12/13/14 width) on the homepage. That is a real, pre-existing bug — it still reproduces with the For You bar hidden — and the culprit is not yet isolated. It is kept out of CI on purpose: a permanently red step is a step people learn to ignore. Run it with `npm run test:hero`. |
| `test-hero-layout.js` screenshots | Land in the OS temp dir, not in the repo. |

## Manual — open the file in a browser
| File | Use it to |
|---|---|
| `test-ad-feedback.html` | see the buyer-feedback widget states |
| `test-existing-user-flow.html` | replay a returning visitor with seeded storage |
| `test-existing-user.html`, `test-check-storage.html` | inspect what a first-time visitor has stored |
| `test-clickability.html` | spot-check tap targets by hand |
| `ad-feedback-markup.js`, `ad-report-markup.js` | shared markup builders used by the generated pages |

## One-off / operations (do not re-run casually)
| Tool | What it does |
|---|---|
| `dev-server.js` | zero-dependency local server (`node tools/dev-server.js 8888`) |
| `generate-pages` is **not** here | ad/parish/category pages + sitemap are built by `../generate-pages.js` |
| `build-changelog.js` | regenerates `CHANGELOG.md` from `js/site-updates.js` |
| `changelog-privacy.js` | blocks secrets in member-facing release notes |
| `install-hooks.js` | wires `.githooks/pre-commit` (runs from `npm install`) |
| `reset-referral-week.js` | referral counters, run weekly by its workflow |
| `run-doctor.js` | environment health check, needs no browser |
| `export-leads.js` | exports the leads table |
| `add-feedback-to-pages.js` | back-fills the feedback widget into generated pages |

> Note: `patch-matchmedia.js` used to live here as a one-off migration for
> `dash-kxrr1.html`. It was deleted — `generate-pages.js` now emits the guarded
> `matchMedia` call itself, so there was nothing left for it to patch.
