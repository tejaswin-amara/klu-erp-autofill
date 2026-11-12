# Contributing

Thank you for considering a contribution to KLU ERP Auto-Fill. Contributions should improve correctness, maintainability, accessibility of documentation, or safe and responsible use.

## Before you start

1. Read the [README](README.md), especially **Privacy and security** and **Responsible use**.
2. Check open issues and pull requests for related work.
3. For a substantial change, open an issue or discussion first so the proposed approach can be agreed before implementation.
4. Review [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before reusing or redistributing code and bundled assets. Apache-2.0 applies only to material the project maintainer is authorized to license; third-party materials may have separate terms.

## Scope and responsible use

This project targets the KLU ERP login page and assists with CAPTCHA text recognition. Contributions must not:

- Add credential collection, credential exfiltration, hidden tracking, or unrelated network calls.
- Expand the extension's host permissions or execution scope without a clear technical need and documented justification.
- Automatically submit login forms, bypass authentication, or add functionality intended to defeat access controls.
- Publish credentials, session cookies, personal data, live CAPTCHA values, or other secrets in source, test fixtures, screenshots, issues, or logs.
- Claim that recognition is guaranteed or that the extension is officially endorsed by the university.

Keep the tool limited to use that is explicitly authorized by the relevant service and institutional policies.

## Development workflow

1. Fork the repository and create a focused branch from `main`.
2. Make the smallest coherent change that addresses the issue.
3. Preserve the existing JavaScript and Chrome Manifest V3 architecture unless a change is discussed and justified first.
4. Avoid adding dependencies where browser APIs or existing bundled resources are sufficient.
5. Update the README or other documentation when behavior, setup, permissions, model metadata, or troubleshooting changes.
6. Review the complete diff for unrelated changes, secrets, generated files, and sensitive diagnostic output.
7. Test the change using the steps below and record what you did in the pull request.

Suggested branch names: `fix/short-description`, `docs/short-description`, or `feat/short-description`.

## Testing checklist

The extension runtime has no bundling step. Repository validation is available through the npm scripts in `package.json`; CI currently uses Node.js 22 and Python 3.12. At minimum, for relevant changes:

- Run `npm run check` to execute the dependency-free repository and packaging tests.
- Build a release ZIP with `python scripts/package_extension.py --output dist/klu-erp-autofill.zip` and verify its contents and checksum.
- Load the extension as an unpacked extension in a current Chrome/Chromium browser.
- Confirm that the extension loads without manifest errors.
- Verify model and WebAssembly resources load from their expected local paths.
- Test the intended ERP page and confirm that missing elements or failed inference do not break the page.
- Test CAPTCHA image refresh handling if the change touches observation or recognition.
- Confirm that the extension does not submit the login form.
- Inspect the browser console and remove or redact sensitive values from diagnostics.
- Check the manifest for unnecessary permissions and host access.
- Validate any changed JSON files with a JSON parser.

If you cannot run browser tests, state that explicitly in the pull request and describe the checks you did complete. Do not report tests as passing unless you ran them.

## Pull requests

A good pull request should:

- Explain the problem and the reason for the change.
- Describe the implementation and any user-visible effects.
- Link related issues where applicable.
- Include test steps and actual results.
- Identify changes to permissions, runtime assets, model files, dependencies, or supported browser behavior.
- Include screenshots only when useful, with personal information and verification codes redacted.

Keep one logical change per pull request. Do not bundle unrelated formatting or generated-file changes.

## Commit messages

Use concise, descriptive commit messages. A conventional format is encouraged:

- `docs: clarify installation instructions`
- `fix: handle missing CAPTCHA image`
- `test: cover model metadata validation`

## Review and conduct

Be factual, respectful, and open to technical feedback. Maintainers may request revisions, decline changes outside the project's scope, or close contributions that introduce security, privacy, or policy risks.

By submitting a contribution, you confirm that you have the right to submit it and that you have not knowingly included third-party material without appropriate rights or attribution. Unless a separate written agreement says otherwise, contributions intentionally submitted for inclusion are handled under Apache-2.0 as described in that license.
