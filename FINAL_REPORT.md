# KLU ERP Auto-Fill — Audit and Remediation Report

## 1. Scope and baseline

This report consolidates the initial audit (`682d1b7f53294a81e57b721eafe5d6259ef787e5`), the PR #5 remediation (`76165b4cc018bcf465c3af811e1ac95ab772016a`), the PR #6 KL Sync integration (`6c5c364573023e3b4566ab1166bf11f2033cd9fb`), and the v1.0.4 engineering-pipeline verification and hardening pass.

**Pull requests:** [PR #5](https://github.com/tejaswin-amara/klu-erp-autofill/pull/5) (merged), [PR #6](https://github.com/tejaswin-amara/klu-erp-autofill/pull/6)  
**Base branch:** `main`  
**Observed CI:** [Run #48 — success](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/42003777393), [Run 42952985426 — success](https://github.com/tejaswin-amara/klu-erp-autofill/actions/runs/42952985426)

## 2. Implementation summary

The repository implementation now includes:

- Exact-origin Manifest V3 support (`v1.0.4`) for both KLU ERP (`https://newerp.kluniversity.in/*`) and the KL Sync Student Portal (`https://klhb.vercel.app/*`) with zero Chrome API permissions or `host_permissions`.
- A single-flight, latest-state-wins inference scheduler. Source changes and in-place `load` events invalidate stale work and queue processing of the latest image.
- Explicit selector priority (`img#kl-sync-captcha-image`, `img#loginFormCaptcha-image`, `img#loginform-verifycode-image`, `img[src*="r=site/captcha"]`, `img[src*="r=site%2Fcaptcha" i]`, `img[src*="captcha"]` and `input#captcha-field`, `input#loginFormCaptcha`, `input[name="LoginForm[captcha]"]`, `input#loginform-verifycode`, `input[name*="captcha" i]`, `input[placeholder*="verification" i]`), active image/input tracking, and document-level DOM reconciliation.
- Strict visibility and input-type eligibility checks: elements with `hidden`, `aria-hidden="true"`, CSS `display: none`, `visibility: hidden` (used by KLU ERP's hidden MFA field `input#loginFormQRCodeID`), `opacity: 0`, zero bounding-box dimensions, `disabled`, `readOnly`, or non-text `<input>` types (`checkbox`, `password`, `button`, `submit`) are skipped.
- Exact image load-handler cleanup on rebinding.
- Input ownership tracking and protection against overwriting manual edits, while restoring autofill if the user clears the input back to empty `""`.
- Metadata (`blank_idx <= alphabet.length`), tensor shape, CTC class-count, blank-index, output length (`4..7`), and finite-logit validation.
- Dynamic ONNX input/output names (`input` and `logits`) obtained from the created inference session, backed by binary ONNX ModelProto verification in `tests/repository.test.mjs` and real WASM execution in `tests/content.test.mjs`.
- Path-aware packaging validation, symlink rejection, manifest-reference allowlist verification, unique staging files, archive integrity checks, concurrency locking, checksum validation, and rollback for publication failures.
- GitHub Actions workflow hardened with non-persistent checkout tokens, `timeout-minutes: 10`, and 40-character commit SHA pins (`actions/checkout`, `actions/setup-node`, `actions/setup-python`, `actions/upload-artifact`).

## 3. Test, pipeline, and CI results

All local verification suites and `engineering-pipeline` v3.1.0 gates succeeded:

| Suite / Gate | Result |
|---|---:|
| Node structural, ONNX binary-graph, DOM-behavior, and real WASM tests (`npm test`) | 25 passed, 0 failed |
| Python packaging integrity and manifest-allowlist tests (`npm run test:package`) | 16 passed, 0 failed |
| Headless Chromium `156.0.8078.73` (`HeadlessChrome/156.0.0.0`) WASM + `OffscreenCanvas` smoke test | Passed (`ort.min.js` v1.16.3, `crnn.onnx` → `"kllrnp"`) |
| `engineering-pipeline` `verify_agent_safety.py --selftest` & `--scan` | Passed (15/15 canaries; 0 repo findings) |
| `engineering-pipeline` `check_pins.py` | Passed (0 high/medium findings) |
| Deterministic release ZIP generation (`scripts/package_extension.py`) | Passed (21 files including `CHECKSUMS.sha256`) |

The deterministic release ZIP SHA-256 is:

`093d5e3cde6cd379339ad1ff8b108e4815a4f2e5086ceac9ec88e76372bcc7da`.

## 4. ONNX model, runtime, and Git history verification

### ONNX binary graph & preprocessing contract (`TASK-002`)

Direct protobuf inspection of `model/crnn.onnx` (13,532,033 bytes, SHA-256 `ab44da9b1d244c9406bc645d97025f253edd4522015ed1b7c2a9bc41a15030aa`) confirmed:
- `ir_version`: `7`, `opset_import`: `14`, `producer_name`: `pytorch`, `producer_version`: `2.5.1`, `graph_name`: `main_graph` (71 nodes, 34 initializers).
- Input tensor: `input`, `FLOAT` (`float32`), shape `["batch", 1, 50, 120]` matching `model/crnn.json` (`img_h: 50`, `img_w: 120`).
- Output tensor: `logits`, `FLOAT` (`float32`), shape `["batch", 30, 27]` matching `alphabet.length + 1` (`26 + 1 = 27`).
- Final linear bias `fc.bias` (`[27]`): index `0` has bias `-2.9399` while indices `1..26` (`a..z`) cluster tightly in `[-0.0328, +0.0108]`, confirming `blank_idx: 0`.
- Historical commit `0819c2734485b2e60ef687492155d0f90640145b` and empirical WASM inference with synthetic rendered words confirm the model was trained on normalized `[0, 1]` foreground masks (`0.0` background, `1.0` glyph foreground) extracted from the transparent PNG alpha channel (`rgba[i + 3] / 255`).

### Runtime and asset provenance (`TASK-008`)

- Bundled ONNX Runtime Web version verified as **v1.16.3** (MIT License, [microsoft/onnxruntime v1.16.3](https://github.com/microsoft/onnxruntime/releases/tag/v1.16.3)) from both `lib/ort.min.js` header and `ort.env.versions`.
- Exact SHA-256 digests for `lib/ort.min.js`, `lib/ort-wasm-simd.wasm`, `model/crnn.onnx`, `model/crnn.json`, and `icons/*.png` are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Git history audit (`TASK-010`)

All 38 commits across `main` and `feat/kl-sync-captcha-support` (from initial commit `55f92d25fb39f3066325976f7b1cb88496554a64`) were inspected:
- Zero private keys, student login details, session cookies, or active API secrets were found.
- Historical commit `0819c2734485b2e60ef687492155d0f90640145b` contained a public Chrome Web Store `_metadata/verified_contents.json` (`item_id: "nlehogaopgpmhideimmccgohnjaepnom"`) and local Windows paths (`c:/Users/sahith/Desktop/CAPTCHA SOLVER/...`).
- Historical commit `3dafc752d0e304723e1449bf790eab043a544395` briefly used the public OCR.space documentation test key `'helloworld'`, which was removed in `0819c2734485b2e60ef687492155d0f90640145b`.

## 5. Remaining limitations

- **Live accuracy and opaque-image caveat:** Because `imageToTensor()` reads the RGBA alpha channel (`rgba[i + 3] / 255`), CAPTCHA images served with a transparent background (`alpha = 0` background, `alpha = 255` glyph strokes) produce valid foreground tensors, whereas a completely opaque image (`alpha = 255` everywhere) yields a uniform `1.0` tensor (`"llll"` / empty after length bounds). Do not alter preprocessing without verifying the target portal's image format and model training pipeline.
- **Interactive Chrome unpacked extension check:** Headless Chromium 156 verified WASM SIMD, `OffscreenCanvas`, and `content.js` execution against a synthetic page, but loading the unpacked extension via `chrome://extensions` in an interactive desktop Chrome session remains a manual release step.
- **Model weight redistribution rights:** While `lib/ort.min.js` and `lib/ort-wasm-simd.wasm` are covered by Microsoft's MIT License (`v1.16.3`), external training dataset provenance and formal licensing for `model/crnn.onnx` must be confirmed by the project owner before third-party binary redistribution.
