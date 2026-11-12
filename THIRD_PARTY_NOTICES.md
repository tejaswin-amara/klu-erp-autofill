# Third-Party Notices

This repository's original code and documentation are licensed under Apache License 2.0. Third-party runtime components, model assets, and icons can have separate terms. The repository license does not grant rights to materials the project maintainer does not own or have permission to redistribute.

## ONNX Runtime Web (v1.16.3)

The repository bundles ONNX Runtime Web v1.16.3 JavaScript and WebAssembly files under the `lib/` directory:

- `lib/ort.min.js` — 570,149 bytes, SHA-256 `e258124c31c5e9fe29b6ce0873646785e520b8feb879b79f5c58ce98a5c96340`, embedded header `ONNX Runtime Web v1.16.3` (`ort.env.versions = { common: "1.16.3", web: "1.16.3" }`)
- `lib/ort-wasm-simd.wasm` — 10,912,730 bytes, SHA-256 `8a9ceb098c19f181c72c3beb9e00e718d3a1de139d11eb3e3589c5b557cdd78f`

The upstream ONNX Runtime project publishes release [v1.16.3](https://github.com/microsoft/onnxruntime/releases/tag/v1.16.3) under the MIT License: https://github.com/microsoft/onnxruntime.

Copyright (c) Microsoft Corporation. All rights reserved.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## CRNN model and metadata

The repository includes model assets and metadata under the `model/` directory:

- `model/crnn.onnx` — 13,532,033 bytes, SHA-256 `ab44da9b1d244c9406bc645d97025f253edd4522015ed1b7c2a9bc41a15030aa` (ONNX IR v7, opset 14, exported by `pytorch` `2.5.1`, graph `main_graph` with input `input: float32[batch, 1, 50, 120]` and output `logits: float32[batch, 30, 27]`)
- `model/crnn.json` — 114 bytes, SHA-256 `fc91b6b8d83f7aa4ec31117f5e15fb95fd8ce07e4a65de2b8908e0722fd56f6c`

While the binary graph contract and PyTorch 2.5.1 export metadata are verified, the external training dataset provenance and formal model redistribution license have not been independently established by this notice. Verify those details from the original training source before third-party redistribution; do not assume the repository's Apache-2.0 license grants rights to model weights.

## Extension icons and visual assets

- `icons/icon16.png` — 64×64 RGBA PNG, SHA-256 `46417e23f695689a6602d6c38060b40af0663a8843f4987810b19206f33517a6`
- `icons/icon48.png` — 192×192 RGBA PNG, SHA-256 `8aecb4cfd44084f9dab1a124c6184bb234c7c0417bda1211de6b98ba7fa1ba03`
- `icons/icon128.png` — 512×512 RGBA PNG, SHA-256 `c0afe002b292482679de25b98ec80d0d1eb0b487a127b12ce605ef1013b3a9da`
- `assets/readme-banner.svg` — Project SVG banner authored for this repository

Historical commit `0819c2734485b2e60ef687492155d0f90640145b` contained a local icon generator (`icons/make_icons.py`) referencing `SpicyRice.ttf` (a typeface published under the SIL Open Font License 1.1), and commit `44dab96a7e10a6c2b4e11f7feb997cab60d74ccf` uploaded the current PNG icon files. Confirm full icon artwork ownership before commercial or third-party redistribution.

## Important

This document is an attribution and verification record, not legal advice or a determination that every bundled binary's external training provenance has been legally cleared.
