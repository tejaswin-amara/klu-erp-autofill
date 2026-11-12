# Security Policy

## Supported versions

Security fixes are considered for the latest version on the default branch. Older versions may not receive fixes; update to the latest reviewed source before reporting whether an issue persists.

## Reporting a vulnerability

**Please do not publish exploitable security details in a public issue.**

Use GitHub's private vulnerability reporting feature for this repository if it is enabled. Otherwise, contact the maintainer through the contact options on the [maintainer's GitHub profile](https://github.com/tejaswin-amara) and request a private channel before sending technical details.

Include, where possible:

- A concise description of the issue and its potential impact.
- Affected version, commit, browser, and operating system.
- Minimal reproduction steps or a proof of concept that does not expose real user data.
- Any proposed mitigation.

Do not include passwords, authentication cookies, session tokens, real student records, or CAPTCHA images from real accounts. Redact sensitive data from logs and screenshots.

## What is in scope

Examples include unintended network transmission, unsafe extension permissions, injection or script-execution flaws, exposure of credentials or personal information, and vulnerabilities in bundled dependencies as used by this project.

The extension's CAPTCHA recognition can produce incorrect results. Recognition errors alone are not necessarily security vulnerabilities; explain any security impact beyond an incorrect prediction.

## Response expectations

The maintainer will make a reasonable effort to acknowledge reports, investigate reproducible findings, and coordinate a fix or disclosure. Response and remediation timelines depend on severity, reproducibility, and maintainer availability. Please allow time for investigation before public disclosure.

## Safe testing

Only test against systems and accounts you are authorized to use. Do not probe the university ERP, its infrastructure, or other users' accounts without explicit authorization.
