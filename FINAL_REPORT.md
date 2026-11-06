# KLU ERP Auto-Fill — Audit and Remediation Report

## 1. Scope and baseline

This report consolidates the initial audit and the subsequent PR #5 implementation. The initial audit baseline was main commit `83b85947c4d8bba0fc0771403b326fa24049b2be` / historical audit commit `682d1b7f53294a81e57b721eafe5d6259ef787e5`. That historical baseline and its test counts are not the current implementation state.

**Pull request:** https://github.com/tejaswin-amara/klu-erp-autofill/pull/5  
**Implementation commit verified by CI:** `aaee21773ab83eb701d744cfb2873f1417ceadfd`  
**Base branch:** `main`  
**CI:** [Run #48 — success](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/42003777393)

## 2. Implementation summary

The PR implementation now includes:

- A single-flight, latest-state-wins inference scheduler. Source changes during in-flight work invalidate the old result and queue processing of the latest image.
- Explicit selector priority, active image/input tracking, and document-level DOM reconciliation for element replacement.
- Exact image load-handler cleanup on rebinding.
- Input ownership tracking and protection against overwriting manual edits.
- Generation, source, element-identity, connectivity, and input-value checks before filling.
- Metadata, tensor shape, CTC class-count, blank-index, and finite-logit validation.
- Dynamic ONNX input/output names obtained from the created inference session.
- Path-aware packaging validation, symlink rejection, unique staging files, archive integrity checks, concurrency locking, checksum validation, and rollback for normal publication failures.
- Isolated Python packaging fixtures that do not create/delete files in the repository root.
- More accurate manifest privacy wording.

## 3. Test and CI results

At implementation commit `aaee217`, GitHub Actions runs #47 and #48 succeeded.

| Suite | Result |
|---|---:|
| Node structural and DOM-behavior tests | 18 passed, 0 failed |
| Python packaging integrity tests | 14 passed, 0 failed |
| Release ZIP generation | Passed |
| Artifact upload | Passed |

The inner release ZIP SHA-256 was:

`159c07a4b36326b6ff842a74c6fbfd274fd091945deda03629f0e6f986614b61`.

These are remote GitHub Actions results. They must not be described as a full local checkout test run.

## 4. Security and privacy

The production manifest remains scoped to `https://newerp.kluniversity.in/*` and adds no Chrome permissions or host permissions. Inference continues to use bundled model/runtime assets. The extension fills a field and does not submit the login form. The manifest description no longer makes absolute claims such as "no data collected" or "zero offsite requests".

This does not prove that the ERP website itself makes no network requests, nor does static inspection establish that every browser/dependency component is network silent.

## 5. Remaining limitations

### Model preprocessing and correctness

The current alpha-channel preprocessing is preserved because the model's original training-time preprocessing contract has not been established. ONNX session input/output names are obtained dynamically, but the actual graph contract and recognition accuracy have not been validated against authoritative model source/training material.

### Browser compatibility

Chromium 144 is present in the available environment. However, administrator policy prevents loading unpacked extensions, and a normal headless Chromium smoke test timed out. Therefore a real extension-load/WASM browser test remains blocked.

### Licensing and provenance

The exact bundled ONNX Runtime version, CRNN source/training data, model redistribution license, and complete icon attribution are not fully established. Do not describe public redistribution as legally cleared until those records are obtained.

### Git history

A complete historical secret-exposure review has not been completed. No conclusion about the entire repository history should be inferred from current-file inspection.

## 6. Assessment

The source-code and packaging remediation has substantial passing automated coverage. PR #5 remains open for review. The successful tests support the specific tested behavior, but do not establish model accuracy, real Chromium compatibility, or third-party redistribution rights. Keep those limitations visible when deciding whether to publish a distributable release.
