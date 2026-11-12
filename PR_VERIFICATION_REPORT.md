# PR #5 & PR #6 — Independent Verification and Remediation Report

## A. Pull request and branch state

- **Repository:** https://github.com/tejaswin-amara/klu-erp-autofill
- **PR #5 (merged to `main`):** https://github.com/tejaswin-amara/klu-erp-autofill/pull/5 (`76165b4cc018bcf465c3af811e1ac95ab772016a`)
- **PR #6 (KL Sync support):** https://github.com/tejaswin-amara/klu-erp-autofill/pull/6 (`6c5c364573023e3b4566ab1166bf11f2033cd9fb`)
- **CI runs verified:**
  - PR #5 push run [#47](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/42003762852) — success
  - PR #5 pull-request run [#48](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/42003777393) — success
  - PR #6 pull-request run [42952985426](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/42952985426) — success

## B. Verified implementation and v1.0.4 pipeline remediation changes

| Area | Change | Evidence |
|---|---|---|
| Async lifecycle | Latest-state-wins, single-flight solve drain; invalidates stale results and processes pending latest image; resets `lastSolvedSrc` on in-place `load` events | `content.js`, `tests/content.test.mjs` |
| Selector priority & eligibility | Ordered selector evaluation for KL Sync (`img#kl-sync-captcha-image`, `input#captcha-field`) and KLU ERP (`img#loginFormCaptcha-image`, `input#loginFormCaptcha`, `img[src*="r=site%2Fcaptcha" i]`); skips `hidden`, `aria-hidden="true"`, CSS `display: none` / `visibility: hidden` / `opacity: 0`, `disabled`, `readOnly`, and non-text `<input>` types | `content.js`, `tests/content.test.mjs`, live HTML inspection of KLU ERP and KL Sync |
| Listener cleanup | Exact load callback is retained and removed from replaced images | `content.js`, `tests/content.test.mjs` |
| Manual input & recovery | Independently entered non-empty values are never overwritten; clearing the input back to `""` restores autofill on subsequent refreshes | `content.js`, `tests/content.test.mjs` |
| ONNX graph & WASM execution | Dynamic session input/output names (`input`, `logits`); binary ONNX ModelProto verification (`[batch, 1, 50, 120]` → `[batch, 30, 27]`, PyTorch 2.5.1, opset 14, `fc.bias[0] = -2.9399`); end-to-end WASM inference test with bundled `lib/ort.min.js` v1.16.3 | `tests/repository.test.mjs`, `tests/content.test.mjs` |
| CTC & metadata validation | Validates `blank_idx <= alphabet.length` before session creation, tensor rank/length, class count, blank index, 4–7 character output bounds, and finite logits | `content.js`, `tests/content.test.mjs` |
| Packaging & manifest allowlist | Component-aware path checks, symlink rejection, manifest-reference allowlist validation, unique staging, lock, staged integrity validation, rollback | `scripts/package_extension.py`, `tests/test_package_extension.py` |
| CI workflow hardening | All GitHub Actions pinned to 40-char commit SHAs with `persist-credentials: false` and `timeout-minutes: 10`; passes `check_pins.py` and `verify_agent_safety.py` | `.github/workflows/ci.yml`, `tests/repository.test.mjs` |

## C. Local and CI test results

| Suite / Check | Result |
|---|---:|
| Node structural, ONNX graph, DOM lifecycle, and WASM tests (`npm test`) | 25 passed, 0 failed |
| Python packaging and manifest-allowlist tests (`npm run test:package`) | 16 passed, 0 failed |
| Headless Chromium `156.0.8078.73` synthetic page + WASM SIMD smoke test | Passed |
| `engineering-pipeline` `verify_agent_safety.py --scan` & `check_pins.py` | Passed (0 findings at/above medium) |
| Deterministic release ZIP generation (`scripts/package_extension.py`) | Passed (`093d5e3cde6cd379339ad1ff8b108e4815a4f2e5086ceac9ec88e76372bcc7da`) |

## D. Browser verification (`TASK-007`)

- Executed headless Chromium `156.0.8078.73` (`HeadlessChrome/156.0.0.0` on Debian GNU/Linux 12) against a synthetic ERP DOM fixture serving the bundled `lib/ort.min.js` (`v1.16.3`), `lib/ort-wasm-simd.wasm`, `model/crnn.json`, `model/crnn.onnx`, and `content.js`.
- Verified `OffscreenCanvas` availability (`true`), `ort.env.versions` (`{ common: "1.16.3", web: "1.16.3" }`), WASM SIMD session initialization, and automatic population of `input#loginFormCaptcha` (`window.__kluCaptchaSolverLoaded === true`).
- Interactive unpacked extension loading via `chrome://extensions` on a desktop Chrome profile remains a manual verification step before publishing a store release.

## E. Model, provenance, and Git history verification (`TASK-002`, `TASK-008`, `TASK-010`)

- **ONNX graph & preprocessing (`TASK-002`):** `model/crnn.onnx` is an ONNX IR v7, opset 14 graph exported by PyTorch `2.5.1` (`input: float32[batch, 1, 50, 120]` → `logits: float32[batch, 30, 27]`, `fc.bias[0] = -2.9399` for `blank_idx: 0`). Historical commit `0819c2734485b2e60ef687492155d0f90640145b` and empirical WASM inference confirm transparent-PNG alpha-channel preprocessing (`rgba[i + 3] / 255`).
- **Third-party notices (`TASK-008`):** `THIRD_PARTY_NOTICES.md` records the verified ONNX Runtime Web `v1.16.3` MIT release and SHA-256 digests for all bundled binaries and icons, while noting that external model training dataset licensing remains for the repository owner to confirm.
- **Git history (`TASK-010`):** Full inspection of all 38 commits confirmed zero leaked private keys, student credentials, or live tokens.

## F. Final assessment

All source-code, lifecycle, selector-eligibility, ONNX graph contract, WASM runtime, packaging, CI SHA-pinning, and documentation checks are implemented and verified by automated tests.
