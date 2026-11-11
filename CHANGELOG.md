# Changelog

Notable project changes are documented here. Entries describe repository changes and are not a guarantee of runtime behavior or compatibility.

## [Unreleased]

No unreleased changes are documented yet.

## [1.0.4]

- Add exact-origin support for the KL Sync Student Portal login page.
- Reuse the refresh-aware local CRNN inference pipeline with KL Sync's CAPTCHA image and React-controlled input IDs.
- Preserve manual edits, stale-inference rejection, and manual login submission; the extension never submits forms.
- Add regression coverage for KL Sync selectors and exact host scope.

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
