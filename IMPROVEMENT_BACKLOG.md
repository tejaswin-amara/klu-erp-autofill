# Improvement Backlog — KLU ERP Auto-Fill

**Repository:** https://github.com/tejaswin-amara/klu-erp-autofill  
**PRs:** [#5](https://github.com/tejaswin-amara/klu-erp-autofill/pull/5) (merged), [#6](https://github.com/tejaswin-amara/klu-erp-autofill/pull/6) (merged)  
**Target:** `main`  
**Latest verified commits:** `76165b4cc018bcf465c3af811e1ac95ab772016a` (`main`), `6c5c364573023e3b4566ab1166bf11f2033cd9fb` (`feat/kl-sync-captcha-support`)  
**Observed CI:** [Run #48 — success](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/42003777393), [Run 42952985426 — success](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/42952985426)

The original audit baseline (`682d1b7f53294a81e57b721eafe5d6259ef787e5`) remains historical. This backlog records current remediation status after PR #5, PR #6, and the v1.0.4 pipeline verification pass.

## Status definitions

- **complete:** Implemented and verified by the stated local and/or CI test evidence.
- **partial:** Core verification and implementation exist, with residual external/manual items noted.
- **blocked:** Required external evidence or environment capability is unavailable.
- **open:** Work remains and is feasible to investigate.
- **optional:** No change is warranted absent a demonstrated need.
- **environment-limited:** Direct local verification could not be performed; CI evidence is recorded separately.

## Current tasks

| ID | Finding | Work | Priority | Status | Evidence / remaining action |
|---|---|---|---|---|---|
| TASK-001 | ENV-001 | Record repository baseline and CI provenance | P1 | complete | Historical baseline preserved; PR #5 CI runs #47/#48 and PR #6 CI run 42952985426 recorded alongside local execution |
| TASK-002 | AUDIT-003, AUDIT-007 | Verify ONNX graph, class mapping, blank-index semantics, and training preprocessing | P1 | complete | Parsed `model/crnn.onnx` binary (`pytorch` `2.5.1`, opset 14, `input: float32[batch,1,50,120]` → `logits: float32[batch,30,27]`, `fc.bias[0] = -2.9399` confirming `blank_idx: 0`) and verified commit `0819c273` transparent-PNG alpha-channel preprocessing; covered by Node protobuf and WASM tests |
| TASK-003 | AUDIT-001, AUDIT-002, AUDIT-010 | Async lifecycle, selector priority, DOM replacement, listener cleanup | P1 | complete | Single-flight latest-state-wins scheduler, CSS/hidden/non-text input filtering, in-place load re-solve, empty-input edit recovery, KL Sync + ERP selector priority tests |
| TASK-004 | AUDIT-005 | Harden release packaging | P2 | complete | Component-aware paths, symlink rejection, manifest-reference allowlist validation, unique staging, archive verification, checksum rollback, lock, 16 Python tests |
| TASK-005 | AUDIT-004 | Add behavior-level content-script tests | P1 | complete | 25 Node tests execute production `content.js` in isolated VM plus real `lib/ort.min.js` v1.16.3 + `lib/ort-wasm-simd.wasm` + `model/crnn.onnx` inference |
| TASK-006 | AUDIT-006 | Validate maintained Markdown links and local fragments | P2 | complete | Relative links and local heading/anchor fragments validated across all maintained Markdown documents |
| TASK-007 | AUDIT-008 | Verify Chromium/ONNX Runtime/WASM compatibility | P2 | partial | Headless Chromium `156.0.8078.73` (`HeadlessChrome/156.0.0.0`) smoke test verified `OffscreenCanvas`, `ort.min.js` v1.16.3, `ort-wasm-simd.wasm`, `crnn.onnx`, and `content.js` on a synthetic fixture; interactive `chrome://extensions` unpacked load remains manual |
| TASK-008 | AUDIT-009 | Verify runtime, model, and asset provenance/licensing | P2 | partial | Verified ONNX Runtime Web `v1.16.3` (MIT), SHA-256 digests, PyTorch 2.5.1 export metadata, and historical `icons/make_icons.py` provenance in `THIRD_PARTY_NOTICES.md`; external training dataset license remains unresolved |
| TASK-009 | AUDIT-005 | CI artifact traceability and package verification | P2 | complete | GitHub Actions workflow runs structural + packaging checks and uploads ZIP + SHA-256 sidecar |
| TASK-010 | HIST-001 | Review Git history for actual sensitive-data exposure | P3 | complete | Audited all 38 historical commits (`55f92d25`..`6c5c3645`); confirmed zero private keys, student credentials, or live tokens |
| TASK-011 | ENV-001 | Repeat direct local full-repository verification | P2 | complete | Full local verification executed: 25 Node tests, 16 Python packaging tests, deterministic ZIP build (`093d5e3cde6cd379339ad1ff8b108e4815a4f2e5086ceac9ec88e76372bcc7da`), and headless Chromium 156 smoke test |
| TASK-012 | AUDIT-011 | Evaluate dynamic web-accessible resource URLs | P3 | optional | Leave disabled unless controlled browser evidence establishes a benefit |

## Fixed implementation details

- New image/source updates and in-place `load` events are coalesced, and stale inference results are discarded.
- Image and input elements are rediscovered when the document changes, skipping `hidden`, `aria-hidden="true"`, CSS-invisible (`display: none`, `visibility: hidden`, `opacity: 0`), `disabled`, `readOnly`, and non-text `<input>` elements.
- The same exact load-handler reference is removed when the image is replaced.
- User-entered non-empty input is preserved, while clearing the input back to empty restores automatic filling on subsequent CAPTCHA refreshes.
- ONNX input/output names are obtained from session metadata (`input` and `logits`), and `model/crnn.onnx` binary graph dimensions are verified in `tests/repository.test.mjs`.
- Package paths use path-aware containment checks, reject symlink components, and verify that every file referenced in `manifest.json` is present in `RELEASE_FILES`.

## Release limitations

1. Do not alter alpha/RGB/grayscale preprocessing without new training evidence matching the target portal's image format.
2. Do not claim live recognition accuracy without an authorized, labeled evaluation dataset.
3. Perform the manual interactive `chrome://extensions` unpacked-extension check before publishing a release.
4. Do not treat model weights redistribution as legally cleared unless the external training dataset and weight licensing terms are confirmed by the owner.

Detailed implementation and verification records: [PR_VERIFICATION_REPORT.md](PR_VERIFICATION_REPORT.md), [FINAL_REPORT.md](FINAL_REPORT.md), [AUDIT_REPORT.md](AUDIT_REPORT.md), and [TEST_AND_VERIFICATION_PLAN.md](TEST_AND_VERIFICATION_PLAN.md).
