/* KLU ERP Captcha Auto-Fill — Surgical On-Device CRNN Solver */
(() => {
  if (window.__kluCaptchaSolverLoaded) return;
  window.__kluCaptchaSolverLoaded = true;

  ort.env.wasm.wasmPaths = chrome.runtime.getURL("lib/");
  ort.env.wasm.numThreads = 1;

  const IMG_SELECTORS = [
    'img#loginFormCaptcha-image',
    'img#loginform-verifycode-image',
    'img[src*="r=site/captcha"]',
    'img[src*="captcha"]'
  ];

  const INPUT_SELECTORS = [
    'input#loginFormCaptcha',
    'input[name="LoginForm[captcha]"]',
    'input#loginform-verifycode',
    'input[name*="captcha" i]',
    'input[placeholder*="verification" i]'
  ];

  function findElementByPriority(selectors, isInput = false) {
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (!el.isConnected) continue;
        if (isInput) {
          if (el.type === 'hidden' || el.disabled || el.readOnly) continue;
        } else {
          // Extra checks for img if needed
        }
        // Basic visibility check
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return el;
        }
      }
    }
    return null;
  }

  let session = null;
  let meta = null;
  let loadingPromise = null;
  let tensorBuffer = null;
  let drawCtx = null;
  let isSolving = false;
  let currentSolveGeneration = 0;
  let lastSolvedSrc = "";
  let observedImg = null;

  async function ensureModel() {
    if (session) return;
    if (!loadingPromise) {
      loadingPromise = (async () => {
        const metaRes = await fetch(chrome.runtime.getURL("model/crnn.json"));
        if (!metaRes.ok) throw new Error("Metadata fetch failed: " + metaRes.status);
        meta = await metaRes.json();
        if (typeof meta.blank_idx !== "number" || typeof meta.alphabet !== "string") {
            throw new Error("Invalid model metadata");
        }
        const W = meta.img_w;
        const H = meta.img_h;
        tensorBuffer = new Float32Array(W * H);

        const canvas = typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(W, H)
          : Object.assign(document.createElement("canvas"), { width: W, height: H });
        drawCtx = canvas.getContext("2d", { willReadFrequently: true });

        session = await ort.InferenceSession.create(
          chrome.runtime.getURL("model/crnn.onnx"),
          { executionProviders: ["wasm"] }
        );
      })().catch((err) => {
        loadingPromise = null;
        throw err;
      });
    }
    await loadingPromise;
  }

  function imageToTensor(img) {
    const W = meta.img_w;
    const H = meta.img_h;
    drawCtx.clearRect(0, 0, W, H);
    drawCtx.drawImage(img, 0, 0, W, H);
    const rgba = drawCtx.getImageData(0, 0, W, H).data;
    for (let i = 3, j = 0; i < rgba.length; i += 4, j++) {
      tensorBuffer[j] = rgba[i] * 0.00392156862745098; // 1 / 255
    }
    return new ort.Tensor("float32", tensorBuffer, [1, 1, H, W]);
  }

  function ctcGreedyDecode(logits, T, C, alphabet, blankIdx) {
    let result = "";
    let prev = -1;
    for (let t = 0; t < T; t++) {
      const offset = t * C;
      let bestIdx = 0;
      let bestVal = logits[offset];
      for (let c = 1; c < C; c++) {
        const val = logits[offset + c];
        if (val > bestVal) {
          bestVal = val;
          bestIdx = c;
        }
      }
      if (bestIdx !== blankIdx && bestIdx !== prev) {
        // Find the actual character mapping skipping the blank_idx.
        // Assuming alphabet maps sequentially skipping blankIdx.
        // E.g., if bestIdx = 0 and blankIdx = 0, we skip.
        // if bestIdx = 1 and blankIdx = 0 -> alphabet[0]
        let charIdx = bestIdx > blankIdx ? bestIdx - 1 : bestIdx;
        if (charIdx >= 0 && charIdx < alphabet.length) {
          result += alphabet[charIdx];
        }
      }
      prev = bestIdx;
    }
    return result;
  }

  function fillInput(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function solveCaptcha() {
    if (isSolving) return;
    const img = findElementByPriority(IMG_SELECTORS, false);
    const input = findElementByPriority(INPUT_SELECTORS, true);
    if (!img || !input) return;

    watchImage(img);

    if (!img.complete || img.naturalWidth === 0) return; // watchImage handles 'load'

    if (img.src && img.src === lastSolvedSrc && input.value.length >= 4) return;

    isSolving = true;
    let generation = ++currentSolveGeneration;
    try {
      await ensureModel();
      if (generation !== currentSolveGeneration) return; // Stale

      const currentSrc = img.src;
      const tensor = imageToTensor(img);
      const output = await session.run({ input: tensor });
      const [, T, C] = output.logits.dims;
      const code = ctcGreedyDecode(output.logits.data, T, C, meta.alphabet, meta.blank_idx);

      // Ensure target element is still the same and generation matches
      const currentImg = findElementByPriority(IMG_SELECTORS, false);
      const currentInput = findElementByPriority(INPUT_SELECTORS, true);

      if (generation === currentSolveGeneration && currentImg === img && currentInput === input) {
        if (code.length >= 4) {
          lastSolvedSrc = currentSrc;
          fillInput(input, code);
        }
      }
    } catch (err) {
      console.error("[KLU-Captcha]", err);
    } finally {
      isSolving = false;
      // If generation got bumped while solving, schedule another execution.
      if (generation !== currentSolveGeneration) {
        setTimeout(solveCaptcha, 0);
      }
    }
  }

  const imgAttrObserver = new MutationObserver(() => {
    lastSolvedSrc = "";
    currentSolveGeneration++; // invalidate in-flight inference on src change
    if (!isSolving) {
      solveCaptcha();
    }
  });

  function watchImage(img) {
    if (observedImg === img) return;
    if (observedImg) {
      observedImg.removeEventListener("load", solveCaptcha);
    }
    observedImg = img;
    imgAttrObserver.disconnect();
    imgAttrObserver.observe(img, { attributes: true, attributeFilter: ["src"] });
    img.addEventListener("load", () => {
       currentSolveGeneration++;
       if (!isSolving) solveCaptcha();
    });
  }

  if (findElementByPriority(IMG_SELECTORS, false) && findElementByPriority(INPUT_SELECTORS, true)) {
    solveCaptcha();
  } else {
    let timeoutId;
    const bodyObserver = new MutationObserver(() => {
      if (findElementByPriority(IMG_SELECTORS, false) && findElementByPriority(INPUT_SELECTORS, true)) {
        bodyObserver.disconnect();
        clearTimeout(timeoutId);
        solveCaptcha();
      }
    });
    bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
    timeoutId = setTimeout(() => bodyObserver.disconnect(), 15000);
  }
})();
