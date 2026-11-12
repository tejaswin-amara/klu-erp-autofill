# Privacy Notes

## Purpose

KLU ERP Auto-Fill is a browser extension intended to recognize CAPTCHA text on the KL University ERP login page at `https://newerp.kluniversity.in/` and the KL Sync Student Portal login page at `https://klhb.vercel.app/`.

## Processing and data handling

The repository bundles a CRNN ONNX model (`model/crnn.onnx`) and ONNX Runtime Web v1.16.3 assets (`lib/ort.min.js`, `lib/ort-wasm-simd.wasm`) for browser-side inference. The extension's recognition path processes the CAPTCHA image locally in the browser rather than uploading it to a remote OCR server.

The current content script writes caught runtime errors to the browser console with a fixed diagnostic prefix (`[KLU-Captcha]`). It does not explicitly log the recognized string. Runtime error objects may contain technical details; redact console output before sharing it. Browser console output is local to the browser unless the user or another installed tool exports or transmits it.

This document describes the repository implementation, not the university portal's or KL Sync's own data practices or the behavior of other extensions, browser software, or third-party components.

## Credentials and form submission

- Do not enter credentials anywhere other than the official ERP or authorized portal site.
- The extension is not intended to collect or transmit usernames, passwords, session cookies, or student records.
- The extension fills only the visible text CAPTCHA field and never submits the login form or completes separate human-verification widgets.
- Recognition may be wrong; verify the result before signing in.
- The extension does not guarantee successful authentication or portal access.
- Review the current source and permissions before installing an updated build.

## Network and permissions

The extension is configured for the explicit HTTPS origins `https://newerp.kluniversity.in/*` and `https://klhb.vercel.app/*` and loads its model/runtime assets from the packaged extension. The browser necessarily communicates with the target portal as part of normal website use. Do not interpret this as a claim that the portal itself makes no network requests or collects no data.

Any future change that introduces telemetry, remote processing, new host permissions, or transmission of CAPTCHA content or recognized text should include a privacy review and clear documentation before release.

## How to inspect

Review `manifest.json` for host matches and exposed resources, and `content.js` for the recognition flow and logging behavior. The automated tests check repository structure, ONNX graph contract, WASM execution, and packaging invariants; they do not establish live recognition accuracy or prove the absence of all portal network activity. Browser developer tools can help inspect extension errors and network behavior.

## Scope and limitations

This is a project privacy note, not a formal privacy guarantee or legal advice. It does not replace the privacy policies of KL University, KL Sync, Chrome, or third-party dependencies.
