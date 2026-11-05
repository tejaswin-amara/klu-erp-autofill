> **Status update — 2026-11-05:** The first two sections below document the historical baseline and its CI run. PR #5 subsequently added production-script VM lifecycle tests and isolated packaging tests. Current implementation evidence is in [PR_VERIFICATION_REPORT.md](PR_VERIFICATION_REPORT.md). Latest verified implementation commit at the time of this update: `aaee21773ab83eb701d744cfb2873f1417ceadfd`; GitHub Actions runs #47 and #48 passed with 18 Node tests and 14 Python tests. A separate Markdown-fragment regression test is being added in the next verification pass.

# Test and Verification Plan — KLU ERP AutoFill

**Audited baseline:** `682d1b7f53294a81e57b721eafe5d6259ef787e5`  
**Observed CI run:** [39808685305 — success](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/39808685305)

## 1. Environment and baseline commands

The local audit session could not clone GitHub due to unavailable network name resolution. The following commands were not executed directly in that local shell. The results below are from the GitHub Actions logs for the audited commit.

On a network-enabled checkout, run:

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

Record actual command output, runtime versions, repository SHA, and working-tree status. Do not describe remote CI as a local test execution.

## 2. Existing observed CI coverage

For audited commit `682d1b7f53294a81e57b721eafe5d6259ef787e5`, workflow [39808685305](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/39808685305) completed successfully:

| Check | Observed result | What it demonstrates |
|---|---|---|
| Node.js suite | 10 passed, 0 failed | Structural checks for manifest/version, resources, host scope, metadata basics, documentation presence/links, manual-submit patterns, event dispatch patterns, logging patterns, and CI configuration |
| Python package suite | 5 passed | Package file list, manifest resources, embedded checksums, sidecar checksum, reproducible ZIP bytes |
| Release ZIP build | Passed | Packager created the allowlisted ZIP and checksums |
| Artifact upload | Passed | CI artifact was uploaded |

The log reported the inner ZIP SHA-256 as:

```text
6650149c8ea336f5c4838c95130e27a182f8e286e90d559f2eb328be88fd6f11
```

Artifact page: [run 39808685305](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/39808685305). The GitHub artifact wrapper has its own digest and must not be confused with the inner ZIP checksum.

## 3. Regression matrix

| ID | Test | Fixture / method | Expected result | Status |
|---|---|---|---|---|
| TEST-001 | Manifest/resource integrity | Parse manifest and compare referenced files | Version and resources agree; scope stays narrow | Existing CI test |
| TEST-002 | Metadata schema | Valid/invalid synthetic JSON | Invalid types, dimensions, or blank-index bounds are rejected | Add |
| TEST-003 | Initialization failure recovery | Inject a rejecting loader followed by success | Later attempt can recover; rejected promise is not permanently cached | Add |
| TEST-004 | Decoder bounds | Synthetic numeric output under verified class mapping | Invalid dimensions/classes fail safely; no `undefined` output | Add; model contract required |
| TEST-005 | Selector priority | Synthetic DOM with hidden/visible candidates in misleading order | Priority is explicit and ineligible targets are skipped | Add |
| TEST-006 | Stale operation disposal | Controlled promises finish in reverse order | Obsolete completion cannot affect current fixture state | Add |
| TEST-007 | Listener/observer cleanup | Simulated image replacement, mutation, timeout | No stale listener or active timer after cleanup | Add |
| TEST-008 | Package allowlist | Build ZIP and compare archive entries | Exact allowlist plus checksum manifest; no dev files | Existing CI test |
| TEST-009 | Package negative paths | Missing allowlisted file and symlink fixture | Packager fails with clear error | Add |
| TEST-010 | ZIP integrity/checksums | Rebuild twice, validate ZIP and hashes | Valid archive, matching hashes, reproducible bytes | Existing tests; add explicit integrity check |
| TEST-011 | Markdown relative links | Parse maintained Markdown links | Every local relative file target exists | Existing test; expand document list |
| TEST-012 | Markdown fragments | Resolve fragment to target heading | Local fragment is valid under implemented slug rules | Add |
| TEST-013 | ONNX graph cross-check | Inspect actual ONNX graph offline | Names, ranks, dimensions and output classes match metadata | Blocked until binary and parser available |
| TEST-014 | Chromium resource loading | Unpacked extension with local synthetic fixture | Manifest valid and bundled WASM/model paths resolve | Browser test required |
| TEST-015 | Privacy/manual-submit guard | Source checks and synthetic form spy | No new data transmission or automatic form submission | Existing static test plus review |
| TEST-016 | Third-party provenance | Inspect official upstream records and model source | Version, license, training provenance and attribution are evidenced or remain explicitly unknown | Manual research required |

## 4. Synthetic-only test strategy

Use a local mock page/form, an image generated in memory or from a data URL, and injected fake fetch/session/inference functions with controllable promises. A DOM shim or browser fixture may be used if already available or clearly justified.

Never use live university credentials, production portal requests, scraped CAPTCHA images, or real account data. Synthetic fixtures test general code behavior; they do not establish real-world recognition accuracy.

## 5. Model and preprocessing validation

When the ONNX binary is available locally, inspect it with a compatible offline parser/runtime. Record:

- Input/output names and tensor types.
- Tensor ranks and known/dynamic dimensions.
- Output class count and alphabet mapping.
- Blank-index convention.
- Any reliable training/preprocessing specification.
- Tool and runtime versions used for inspection.

Do not infer training-time alpha-channel versus luminance semantics from tensor shape alone. If reliable provenance is unavailable, keep the relevant task blocked instead of guessing.

## 6. Chromium smoke test

Run only against a local synthetic fixture:

1. Record browser version and OS.
2. Load the unpacked extension and check manifest diagnostics.
3. Inspect local runtime/model resource resolution.
4. Verify whether the bundled SIMD WASM initializes.
5. Record console errors and actual outcomes.
6. Repeat tests at claimed browser-version boundaries.

Do not add `use_dynamic_url`, `minimum_chrome_version`, or runtime flags until tested behavior justifies them.

## 7. What the tests do not prove

Even with all current CI steps passing, the tests do not prove that the extension works against the live ERP page, that the model graph matches metadata, that alpha-channel preprocessing matches training, that recognition accuracy has improved, that a specific Chromium version is compatible, or that third-party assets may legally be redistributed.

## 8. Result-recording checklist

For every future change, record the exact SHA/PR, commands actually run, pass/fail/skip counts, CI links, artifact filename and ZIP hash, whether Chromium was tested, provenance evidence, and residual limitations.
