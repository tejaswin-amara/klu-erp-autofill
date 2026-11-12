> **Status update — 2026-11-05:** This guide was written against historical baseline `682d1b7f53294a81e57b721eafe5d6259ef787e5`. The principal lifecycle, selector, listener, decoder validation, and packager implementation tasks have since been implemented in PR #5. See [PR_VERIFICATION_REPORT.md](PR_VERIFICATION_REPORT.md) and [IMPROVEMENT_BACKLOG.md](IMPROVEMENT_BACKLOG.md) for current status. Do not apply the old proposed fixes blindly to the current implementation.

# Fix Implementation Guide — KLU ERP AutoFill

**Baseline:** `682d1b7f53294a81e57b721eafe5d6259ef787e5`  
**Current CI evidence:** [run 39808685305](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/39808685305)

This guide is a remediation plan, not a statement that the changes have been implemented. Apply changes only in a focused branch, pair each implementation with a regression test, and do not modify production recognition behavior based on an unverified model contract.

## 1. Reproduce the baseline

On a network-enabled local checkout:

```bash
git fetch origin
git checkout main
git pull --ff-only
git rev-parse HEAD
git status --short
npm test
npm run test:package
npm run check
python scripts/package_extension.py --output dist/klu-erp-autofill.zip
sha256sum dist/klu-erp-autofill.zip
```

Record exact outputs. The current GitHub Actions run is evidence that CI passed on its commit; it is not evidence that local commands ran in this audit session.

## 2. Verify the model contract before editing runtime semantics

Inspect `model/crnn.json` and inspect `model/crnn.onnx` with a suitable offline ONNX parser/runtime once the binary is available locally.

Record input/output names, tensor types, ranks/dimensions, class count, alphabet mapping, blank-index convention, and any authoritative preprocessing specification. Metadata JSON parsing alone does not prove that the graph matches the metadata.

At runtime, validate metadata response status, required field types and bounds, output presence, tensor rank, class count, and class-index bounds. Fail safely on malformed or inconsistent contracts. Do not invent model names or dimensions from common CRNN examples.

**Blocked change:** Do not switch alpha-channel extraction to RGB/luminance, change normalization, or add image rejection heuristics until the actual training/inference contract is supported by evidence. Graph dimensions alone do not establish training-time preprocessing.

## 3. Add offline behavioral coverage for lifecycle state

The current `content.js` returns immediately when a solve is already in progress and does not fully associate a result with the source image across inference completion.

When reviewed for remediation, use an explicit operation identity/generation and validate state before any page update:
- capture source/target identities before asynchronous work;
- reject completion when the current generation changed;
- verify the target elements are still connected and the source remains the same;
- release in-flight state on every success/failure path;
- coalesce pending events rather than starting an unbounded retry loop.

Add tests with controllable promises: earlier work resolves after newer work, an element is detached, image source changes during an operation, model initialization fails then succeeds, and multiple events occur during one pending task. Use only a synthetic local fixture, never production portal challenges.

## 4. Selector priority and eligibility

The combined comma-separated selector used with `querySelector()` does not define priority by selector-string order. Review a targeted change that evaluates selectors in a deliberate order, and explicitly rejects missing, disconnected, hidden, or otherwise ineligible candidates. Avoid relying solely on layout APIs in DOM shims; inject the visibility predicate or reserve true visibility checks for browser tests.

Tests should use a synthetic DOM with hidden and visible candidates in misleading document order. Do not widen host permissions or add selectors based on guesses about the live page.

## 5. Listener, observer, and timer cleanup

Review `watchImage()` and the initial observer lifecycle. The current implementation does not comprehensively remove listeners from a replaced image, and the initial timeout is not cleared when the observer disconnects early.

Make registration and cleanup idempotent:
- remove handlers from elements that are no longer observed;
- avoid duplicate one-shot/persistent load registrations;
- clear timers on early completion;
- disconnect observers safely more than once;
- ensure teardown invalidates obsolete work without disrupting current valid work.

Add synthetic tests for replacement, repeated mutation, a single image-load event, early observer completion, and timeout cleanup.

## 6. Decoder and tensor validation

Once the actual model class mapping and blank-index contract have been confirmed, add pure-function tests for blank/repeat handling, malformed output dimensions, class-count mismatch, empty data, and out-of-range class IDs. Invalid indices must never become the literal text `undefined`.

Do not assume the blank index is zero or alter alphabet mapping without authoritative evidence. These checks test safe contract handling; they do not establish recognition accuracy.

## 7. Packaging hardening

The current packager already has a fixed allowlist, checks listed inputs for missing files and symlinks, normalizes ZIP timestamps/attributes, creates an embedded checksum manifest, and writes a ZIP checksum sidecar. Extend that implementation rather than creating a second packager.

Add negative-path tests for a missing required file and a symlinked allowlisted asset. Verify the produced archive with `ZipFile.testzip()`; verify that manifest scripts, icons, and web-accessible resources are present in the ZIP and that the embedded manifest and sidecar hashes match. Keep deterministic ordering and timestamps.

Acceptance: invalid packaging inputs fail clearly; the ZIP contains the exact allowlist plus its checksum manifest; repeated builds from identical inputs produce identical bytes.

## 8. Documentation validation

Expand the current relative-link test to include:
- `AUDIT_REPORT.md`
- `IMPROVEMENT_BACKLOG.md`
- `FIX_IMPLEMENTATION_GUIDE.md`
- `TEST_AND_VERIFICATION_PLAN.md`

Add heading-fragment checks for local Markdown links if the validator can implement the needed slug rules reliably. Review privacy, model, browser, accuracy, and licensing claims separately; passing a link test does not prove those claims are true.

## 9. Browser compatibility

In a controlled Chromium environment, load the unpacked extension and use a local synthetic page. Record the exact browser version, manifest diagnostics, relevant WASM/model resource resolution, console errors, and runtime initialization results.

Do not add `use_dynamic_url`, `minimum_chrome_version`, or ONNX Runtime flags without evidence from the bundled version and browser test. Keep this test off live ERP endpoints.

## 10. Provenance and legal notices

Verify the ONNX Runtime Web version against trustworthy upstream metadata or an official release artifact, preserve applicable upstream notices, and record binary SHA-256 digests.

Find source/generation records for icons and fonts. For `model/crnn.onnx`, obtain source, training-data, and redistribution evidence. If unavailable, state that explicitly instead of inventing provenance or assuming that the repository's Apache-2.0 license grants rights to every asset.

A hash proves file identity, not ownership, licensing permission, or training-data provenance.

## 11. Completion and rollback

For each finding, record the exact files changed, regression test, command/result, CI link, residual uncertainty, and rollback procedure. Keep changes focused and review the complete diff. Do not rewrite Git history or force-push.

See [IMPROVEMENT_BACKLOG.md](IMPROVEMENT_BACKLOG.md) for task ordering and [TEST_AND_VERIFICATION_PLAN.md](TEST_AND_VERIFICATION_PLAN.md) for the test matrix.
