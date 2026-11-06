# Improvement Backlog — KLU ERP Auto-Fill

**Repository:** https://github.com/tejaswin-amara/klu-erp-autofill  
**PR:** https://github.com/tejaswin-amara/klu-erp-autofill/pull/5  
**Target:** `main`  
**Implementation commit verified:** `aaee21773ab83eb701d744cfb2873f1417ceadfd`  
**Observed CI:** [Run #48 — success](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/42003777393)

The original audit baseline remains historical. This backlog records remediation status against PR #5's implementation commit, not against the original main-branch baseline.

## Status definitions

- **complete:** Implemented and verified by the stated test/CI evidence.
- **partial:** Core implementation exists, but defined acceptance criteria remain.
- **blocked:** Required external evidence or environment capability is unavailable.
- **open:** Work remains and is feasible to investigate.
- **optional:** No change is warranted absent a demonstrated need.
- **environment-limited:** Direct local verification could not be performed; CI evidence is recorded separately.

## Current tasks

| ID | Finding | Work | Priority | Status | Evidence / remaining action |
|---|---|---|---|---|---|
| TASK-001 | ENV-001 | Record repository baseline and CI provenance | P1 | complete | Historical baseline preserved; PR implementation CI runs #47/#48 passed |
| TASK-002 | AUDIT-003, AUDIT-007 | Verify ONNX graph, class mapping, blank-index semantics, and training preprocessing | P1 | blocked | Session names are now dynamic; authoritative graph/training preprocessing and recognition contract remain unverified |
| TASK-003 | AUDIT-001, AUDIT-002, AUDIT-010 | Async lifecycle, selector priority, DOM replacement, listener cleanup | P1 | complete | Single-flight latest-state-wins scheduler, stale-result checks, document observer, exact listener removal, synthetic behavior tests |
| TASK-004 | AUDIT-005 | Harden release packaging | P2 | complete | Component-aware paths, symlink rejection, unique staging, archive verification, checksum rollback, lock, 14 Python tests |
| TASK-005 | AUDIT-004 | Add behavior-level content-script tests | P1 | complete | Production script executed in isolated VM with synthetic DOM, observers, deferred inference, and manual-input tests |
| TASK-006 | AUDIT-006 | Validate maintained Markdown links and local fragments | P2 | complete | Fragment validation added to Node repository tests; final CI must pass before retaining complete status |
| TASK-007 | AUDIT-008 | Verify Chromium/ONNX Runtime/WASM compatibility | P2 | blocked | Chromium 144 exists, but admin policy disables unpacked extension loading and headless execution timed out |
| TASK-008 | AUDIT-009 | Verify runtime, model, and asset provenance/licensing | P2 | blocked | Exact ORT version, model source/training data/license, and complete icon attribution require authoritative records |
| TASK-009 | AUDIT-005 | CI artifact traceability and package verification | P2 | complete | CI verifies tests, ZIP build, and artifact upload; inner ZIP hash recorded in PR report |
| TASK-010 | HIST-001 | Review Git history for actual sensitive-data exposure | P3 | open | Full history scan not performed; do not infer a clean history from current-file inspection |
| TASK-011 | ENV-001 | Repeat direct local full-repository verification | P2 | environment-limited | Targeted scratch tests ran; authoritative full-suite evidence comes from GitHub Actions |
| TASK-012 | AUDIT-011 | Evaluate dynamic web-accessible resource URLs | P3 | optional | Leave disabled unless controlled browser evidence establishes a benefit |

## Fixed implementation details

- New image/source updates are coalesced, and stale inference results are discarded.
- Image and input elements are rediscovered when the document changes.
- The same exact load-handler reference is removed when the image is replaced.
- User-entered input is preserved.
- ONNX input/output names are obtained from session metadata rather than assumed constants.
- Package paths use path-aware containment checks and reject symlink components.
- Packaging tests use isolated temporary roots.

## Release limitations

1. Do not alter alpha/RGB/grayscale preprocessing without authoritative training evidence.
2. Do not claim recognition accuracy without an authorized, labeled evaluation dataset.
3. Do not claim native Chromium compatibility from mocked DOM tests.
4. Do not treat model/runtime redistribution as legally cleared while provenance is unresolved.
5. Do not treat a successful CI run as proof of model correctness or live ERP compatibility.

Detailed implementation and verification records: [PR_VERIFICATION_REPORT.md](PR_VERIFICATION_REPORT.md), [AUDIT_REPORT.md](AUDIT_REPORT.md), and [TEST_AND_VERIFICATION_PLAN.md](TEST_AND_VERIFICATION_PLAN.md).
