# Changelog

Notable project changes are documented here. Entries describe repository changes and are not a guarantee of runtime behavior or compatibility.

## [Unreleased]

No unreleased changes are documented yet.

## [1.0.4]

- Add exact-origin support for the KL Sync Student Portal login page (`https://klhb.vercel.app/*`) alongside KLU ERP (`https://newerp.kluniversity.in/*`).
- Reuse the refresh-aware local CRNN inference pipeline with KL Sync's CAPTCHA image (`img#kl-sync-captcha-image`) and React-controlled input (`input#captcha-field`) selectors, plus URL-encoded Yii2 route fallback (`img[src*="r=site%2Fcaptcha" i]`).
- Harden element eligibility and lifecycle handling: skip `hidden`, `aria-hidden="true"`, CSS-invisible (`display: none`, `visibility: hidden`, `opacity: 0`), and non-text `<input>` elements; reset `lastSolvedSrc` on in-place image `load` events; re-enable autofill when a manually edited input is cleared back to empty; and validate `blank_idx <= alphabet.length` during metadata loading.
- Preserve manual edits, stale-inference rejection, 4–7 character output bounds, and manual login submission; the extension never submits forms.
- Validate in `scripts/package_extension.py` that every asset referenced in `manifest.json` is present in `RELEASE_FILES`.
- Pin all GitHub Actions in `.github/workflows/ci.yml` to immutable 40-character commit SHAs with `persist-credentials: false` and job timeouts.
- Add automated Node.js tests for the binary `model/crnn.onnx` protobuf graph contract, real `lib/ort.min.js` v1.16.3 + `lib/ort-wasm-simd.wasm` WASM inference execution, metadata failure recovery, and CSS/input-type eligibility.

## [1.0.3]

- Add dependency-free Node.js structural regression checks and Python packaging tests.
- Add GitHub Actions quality gates for tests and reproducible release packaging.
- Add an allowlisted release ZIP with embedded file checksums and a ZIP SHA-256 sidecar.
- Include the applicable project and third-party notice documents in release archives.
- Clarify privacy statements and explicitly disclose unresolved model/runtime provenance.
- Add issue templates and repository maintenance documentation.

## [1.0.2]

- Repository extension version recorded in `manifest.json`.
- For the complete implementation details of this version, review the source and commit history.
