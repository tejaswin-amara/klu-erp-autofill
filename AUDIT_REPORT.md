# Comprehensive Repository Audit Report — KLU ERP AutoFill

**Repository:** [tejaswin-amara/klu-erp-autofill](https://github.com/tejaswin-amara/klu-erp-autofill)  
**Audited branch:** `main`  
**Audited HEAD:** `682d1b7f53294a81e57b721eafe5d6259ef787e5`  
**Audit date:** 2026-10-23  
**Latest observed CI run:** [39808685305 — success](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/39808685305)

## 1. Executive summary

The repository has baseline engineering controls in place: a Manifest V3 manifest, a narrowly scoped content script, bundled ONNX Runtime Web assets, Node.js structural tests, Python packaging tests, an explicit release-file allowlist, embedded checksums, a ZIP sidecar checksum, and GitHub Actions quality gates.

The workflow for the audited HEAD completed successfully. Its logs show 10 Node.js tests passed, 5 Python packaging tests passed, release ZIP generation succeeded, and the artifact upload succeeded. This establishes repository and packaging checks, **not** runtime correctness, model compatibility, browser compatibility, recognition accuracy, or licensing provenance.

The material remaining issues are:
- Asynchronous lifecycle state can drop a trigger while work is in flight and may allow an obsolete inference result to be applied after the image changes.
- Comma-separated selectors used with `querySelector()` do not implement explicit selector priority.
- Metadata, tensor shape, and decoder class mapping are not fully validated; the configured blank index is not consumed by the existing decoder.
- Old image listeners and the initial observer timeout do not have comprehensive cleanup paths.
- Current tests are largely structural and packaging-focused; they do not execute the full content-script lifecycle against a browser-like synthetic DOM or inspect the actual ONNX graph.
- Exact ONNX Runtime version, model training provenance, and full icon/font attribution remain unresolved.

This is an evidence-based audit and remediation specification. It does not claim that the production recognition algorithm has been fixed. Contract-dependent and browser-dependent changes remain blocked until the required evidence is available. Preserve human verification and manual form submission.

## 2. Scope and evidence

Inspected current GitHub file contents for `content.js`, `manifest.json`, `model/crnn.json`, `package.json`, the Node/Python test suites, `scripts/package_extension.py`, the CI workflow, README/changelog/contributor/privacy/third-party notice documentation, and the latest relevant workflow results.

The local shell could not clone GitHub during this session because external DNS/network access was unavailable. No test command was directly executed in that shell. Test outcomes below come from the GitHub Actions run associated with the audited commit.

The binary `model/crnn.onnx` and bundled runtime binary payloads were not independently inspected with an ONNX parser or local Chromium. Their graph signatures, precise embedded runtime version, and training-time preprocessing contract remain unverified.

## 3. Current baseline

| Property | Observed state |
|---|---|
| Repository | [GitHub](https://github.com/tejaswin-amara/klu-erp-autofill) |
| Branch / HEAD | `main` / `682d1b7f53294a81e57b721eafe5d6259ef787e5` |
| Extension version | `1.0.3` |
| Manifest | Manifest V3; no declared Chrome API permissions or host permissions |
| Match pattern | `https://newerp.kluniversity.in/*` |
| Metadata | `model/crnn.json` describes alphabet, 120×50 dimensions, `model_kind: crnn_ctc`, and `blank_idx: 0` |
| CI | [Run 39808685305](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/39808685305), success |
| Packaging | Fixed allowlist, normalized ZIP timestamps/attributes, embedded per-file checksums, ZIP sidecar |

The CI log shows **10 Node.js tests passed / 0 failed**, **5 Python packaging tests passed**, archive generation succeeded, and artifact upload succeeded. The inner release ZIP SHA-256 reported by the build log was:

```text
6650149c8ea336f5c4838c95130e27a182f8e286e90d559f2eb328be88fd6f11
```

The uploaded artifact was named `klu-erp-autofill-extension`, artifact ID `12439905014`. The GitHub artifact bundle digest differs from the inner ZIP hash. [View/download via the workflow run](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/39808685305). GitHub Actions artifacts expire and are not a permanent release host.

## 4. Architecture summary

1. `manifest.json` configures a Manifest V3 content script for the ERP HTTPS host and declares local runtime, model, WASM, and icon resources.
2. `content.js` locates image/input elements, loads JSON metadata and an ONNX session, creates an image tensor, invokes local inference, decodes output classes, and dispatches `input` and `change` events when populating the field.
3. `lib/ort.min.js` and `lib/ort-wasm-simd.wasm` provide the bundled inference runtime.
4. `model/crnn.json` and `model/crnn.onnx` contain model metadata and model data.
5. The repository has structural tests, packaging tests, an allowlisted deterministic packager, checksum verification, and CI artifact publishing.

## 5. Finding matrix

| ID | Finding | Severity | Priority | Disposition |
|---|---|---:|---:|---|
| ENV-001 | Audit-session local shell/network limitation | Low | P2 | Environment limitation; current-HEAD CI evidence is available |
| AUDIT-001 | In-flight requests can be dropped and obsolete work may write after a refresh | High | P1 | Source issue confirmed; behavior regression tests missing |
| AUDIT-002 | Comma-separated selectors do not provide explicit fallback priority | Medium | P1 | Source issue confirmed |
| AUDIT-003 | Metadata/output contract gaps; declared blank index ignored | High | P1 | Partially Fixed (Runtime gaps covered) |
| AUDIT-004 | Behavioral tests do not cover the actual async/DOM lifecycle | Medium | P1 | Fixed |
| AUDIT-005 | Packaging integrity and legal-file inclusion | Medium | P2 | Fixed |
| AUDIT-006 | Link path checks do not validate every heading fragment or factual claim | Low | P2 | Partially addressed |
| AUDIT-007 | Alpha-channel behavior may not match model's training contract | High if mismatch | P1 | Blocked; no speculative preprocessing change |
| AUDIT-008 | SIMD browser compatibility is not independently verified | Medium | P2 | Chromium verification required |
| AUDIT-009 | Runtime version, model source/training data, and asset provenance incomplete | Medium | P2 | Unresolved provenance work |
| AUDIT-010 | Listener/timer cleanup is incomplete for replacement and early disconnect paths | Medium | P2 | Fixed |
| AUDIT-011 | Dynamic web-accessible resource URLs | Low | P3 | Optional and unverified; not a defect solely because it is disabled |
| HIST-001 | Historical local paths or extension identifier | Informational | P3 | Review history, but an extension ID is not itself a credential |

## 6. Detailed findings

### AUDIT-001 — Async lifecycle and stale-result handling
**Files:** `content.js`, especially `solveCaptcha()`.

When `isSolving` is already true, a new call returns immediately. A refresh trigger can therefore be dropped. After `session.run()`, the current path does not fully verify that the image source and target element are still the ones associated with the operation before it updates the field.

**Fix direction:** use an explicit operation identity/generation, capture source and target identity before async work, reject completions after state changes, verify connected target elements, release in-flight state on every path, and coalesce pending changes without unbounded retries.

**Tests:** reverse-order promise completion, image/source replacement during pending work, detached input/image, initialization failure then retry, multiple refresh notifications, and exceptions on all async paths.

### AUDIT-002 — Selector priority
**Files:** `content.js`, the selector constants and their `querySelector()` call sites.

Comma-separated selectors used in one `querySelector()` expression return the first match in document order, not priority according to textual selector order. The generic input selectors also do not consistently exclude hidden elements.

**Fix direction:** use an ordered selector collection and explicitly filter candidates according to connection, type, visibility, and eligibility rules. Preserve the narrow host scope and do not add speculative live-site selectors.

**Tests:** local fixture with hidden/generic candidates earlier in DOM order than the expected specific/visible candidate, plus disconnected and duplicate candidates.

### AUDIT-003 — Model metadata and decoder contract
**Files:** `content.js`, `model/crnn.json`, `model/crnn.onnx`.

The metadata fetch does not check `response.ok` before parsing. The decoder hardcodes class zero as the blank class rather than consuming `blank_idx`. The runtime assumes particular input/output names and a rank-three output. There is no complete shape/class-count validation; an invalid class index may append `undefined` as text.

**Fix direction:** validate metadata, outputs, dimensions, alphabet/class relationship, blank-index semantics, and index bounds. Confirm actual ONNX names/ranks/dimensions with an offline parser before encoding any graph-specific assumptions.

**Tests:** malformed metadata, non-OK metadata response, missing output, rank mismatch, class-count mismatch, out-of-range class index, and synthetic decoder cases under the verified mapping.

### AUDIT-004 — Behavioral test coverage gap
**Files:** `tests/repository.test.mjs`, `tests/test_package_extension.py`.

The current tests are useful structural and packaging checks, but do not execute the full content-script lifecycle against a synthetic DOM or prove model graph compatibility. The successful CI run must not be interpreted as proof of recognition quality.

**Fix direction:** add offline, injectable behavioral tests and keep structural tests for manifest/package invariants. Use controllable promises, a local synthetic DOM, and fake observers/timers.

### AUDIT-005 — Packaging
**Files:** `scripts/package_extension.py`, `tests/test_package_extension.py`, CI workflow.

The existing packager uses a fixed allowlist; rejects missing and symlinked listed assets; normalizes entry timestamps/attributes; writes an embedded checksum manifest and ZIP sidecar. Tests verify archive contents, references, hashes, and deterministic output.

**Remaining improvement:** add negative-path tests for missing/symlinked allowlisted files and explicitly verify archive integrity after generation. Continue verifying the packaged manifest and exact archive allowlist.

### AUDIT-006 — Documentation
The Node test validates selected relative Markdown file paths, but does not prove that every fragment points to a real heading or that all technical claims remain accurate.

**Fix direction:** include the audit/fix/verification documents in link checks, add fragment checks where slug handling is reliable, and review privacy/model/browser/license claims manually.

### AUDIT-007 — Alpha-channel contract
**Files:** `content.js`, `model/crnn.json`, `model/crnn.onnx`.

The code reads the alpha component of canvas RGBA data. The repository does not provide an authoritative training/preprocessing contract. This could be correct for a transparency-based training pipeline or wrong for an opaque grayscale/color input.

**Do not switch channels, add opaque-canvas fills, or introduce uniform-image rejection heuristics without model-contract evidence.** Inspect the model offline and obtain reliable training/preprocessing documentation. If that evidence cannot be found, keep this finding blocked.

### AUDIT-008 — Browser compatibility
Only a SIMD WASM binary is bundled, but the actual minimum browser version and runtime compatibility have not been independently verified in Chromium.

**Fix direction:** test unpacked-extension resource resolution and runtime initialization against a local synthetic page. Document a minimum browser only after the tested runtime evidence supports it. Avoid speculative flags or `use_dynamic_url`.

### AUDIT-009 — Provenance
Third-party notices contain ONNX Runtime MIT text, while the exact bundled version and model provenance are not yet established. Complete icon/font source attribution also requires evidence.

**Fix direction:** compare the runtime bundle to an official release, preserve the applicable notices, compute hashes, locate asset generation records, and obtain model training/source/license evidence. A hash proves file identity, not ownership or redistribution rights.

### AUDIT-010 — Listener/timer cleanup
**File:** `content.js`.

A persistent `load` listener is added to the observed image and is not removed from the old image when observation moves to a new element. The startup observer timeout is not cleared on early disconnect. The not-ready path may also register an additional one-shot load listener.

**Fix direction:** make registration and cleanup idempotent, remove listeners from replaced nodes, clear the timer on early success, and test teardown behavior with synthetic fixtures.

### AUDIT-011 — Dynamic resource URLs
Optional hardening only. Do not enable `use_dynamic_url` unless controlled Chromium testing establishes a benefit and confirms that the bundled runtime still resolves all resources.

### HIST-001 — Historical identifiers
Review history for actual credentials or sensitive data. An extension ID or local build path alone does not establish an active credential leak; do not rotate credentials or rewrite history without evidence.

## 7. Privacy and security summary

- The manifest is configured for the specific ERP HTTPS origin and has no declared Chrome API permissions or separate host permissions.
- The current source populates a field and dispatches input/change events; tests check for direct form-submission patterns. Manual submission must remain.
- Privacy documentation distinguishes local inference from network activity by the ERP site.
- Error objects can contain technical information; redact diagnostics before sharing.
- No active credential exposure was established by this review.
- Redistribution/provenance rights for the bundled model and all assets are not fully established.

## 8. Remediation order

1. Add offline behavioral tests for lifecycle, selector priority, and cleanup.
2. Verify model graph and preprocessing contract before changing model-dependent runtime behavior.
3. Add missing/symlink package negative-path tests and archive-integrity validation.
4. Extend Markdown fragment validation and cover all audit documents.
5. Run a Chromium smoke test with a local synthetic fixture and document tested compatibility.
6. Resolve ONNX Runtime, model, icon, and font provenance.

## 9. Limitations

No live ERP accounts, production CAPTCHA images, or production network endpoints were used. The ONNX graph and bundled runtime binaries were not inspected with a local parser in this session; no Chromium test was run locally. Current tests and CI do not establish recognition accuracy or model correctness.

See [IMPROVEMENT_BACKLOG.md](IMPROVEMENT_BACKLOG.md), [FIX_IMPLEMENTATION_GUIDE.md](FIX_IMPLEMENTATION_GUIDE.md), [TEST_AND_VERIFICATION_PLAN.md](TEST_AND_VERIFICATION_PLAN.md), and [audit/improvement-backlog.json](audit/improvement-backlog.json).
