/* KLU ERP CAPTCHA Auto-Fill — local CRNN inference */
(() => {
  if (window.__kluCaptchaSolverLoaded) return;

  ort.env.wasm.wasmPaths = chrome.runtime.getURL("lib/");
  ort.env.wasm.numThreads = 1;

  const IMG_SELECTORS = [
    // KL Sync renders the upstream ERP image into its own login form.
    'img#kl-sync-captcha-image',
    'img#loginFormCaptcha-image',
    'img#loginform-verifycode-image',
    'img[src*="r=site/captcha"]',
    'img[src*="r=site%2Fcaptcha" i]',
    'img[src*="captcha"]'
  ];
  const INPUT_SELECTORS = [
    // React-controlled KL Sync login field; input/change events are dispatched below.
    'input#captcha-field',
    'input#loginFormCaptcha',
    'input[name="LoginForm[captcha]"]',
    'input#loginform-verifycode',
    'input[name*="captcha" i]',
    'input[placeholder*="verification" i]'
  ];

  let session = null;
  let sessionInputName = null;
  let sessionOutputName = null;
  let meta = null;
  let loadingPromise = null;
  let tensorBuffer = null;
  let drawCtx = null;

  let activeImage = null;
  let activeInput = null;
  let activeImageLoadHandler = null;
  let activeInputHandler = null;
  let imageObserver = null;
  let documentObserver = null;

  let isSolving = false;
  let solveRequested = false;
  let currentSolveGeneration = 0;
  let lastSolvedSrc = "";
  let lastWrittenValue = null;
  let inputWasEdited = false;
  let writingInput = false;

  function imageSource(img) {
    return img ? (img.currentSrc || img.src || "") : "";
  }

  function isVisible(el) {
    if (!el || !el.isConnected || el.hidden) return false;
    if (typeof el.getAttribute === "function" && el.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const style = typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(el)
      : el.style;
    if (style) {
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
        return false;
      }
      if (style.opacity !== undefined && style.opacity !== "" && Number(style.opacity) === 0) {
        return false;
      }
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findElementByPriority(selectors, isInput = false) {
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (!isVisible(el)) continue;
        if (isInput) {
          const inputType = typeof el.type === "string" && el.type ? el.type.toLowerCase() : "text";
          if (inputType !== "text" || el.disabled || el.readOnly) continue;
        }
        return el;
      }
    }
    return null;
  }

  function requestSolve() {
    currentSolveGeneration += 1;
    solveRequested = true;
    if (!isSolving) void drainSolves();
  }

  function onImageLoad() {
    if (activeImage && this === activeImage) {
      lastSolvedSrc = "";
      requestSolve();
    }
  }

  function onImageSourceChange() {
    lastSolvedSrc = "";
    requestSolve();
  }

  function onInputChange() {
    if (!writingInput) {
      inputWasEdited = Boolean(activeInput && activeInput.value !== "");
    }
  }

  function bindImage(nextImage) {
    if (activeImage === nextImage) return false;

    if (activeImage) {
      if (activeImageLoadHandler) {
        activeImage.removeEventListener("load", activeImageLoadHandler);
      }
      if (imageObserver) imageObserver.disconnect();
    }

    activeImage = nextImage;
    activeImageLoadHandler = null;

    if (activeImage) {
      activeImageLoadHandler = onImageLoad;
      activeImage.addEventListener("load", activeImageLoadHandler);
      if (imageObserver) {
        imageObserver.observe(activeImage, { attributes: true, attributeFilter: ["src", "srcset"] });
      }
    }

    lastSolvedSrc = "";
    return true;
  }

  function bindInput(nextInput) {
    if (activeInput === nextInput) return false;

    if (activeInput && activeInputHandler) {
      activeInput.removeEventListener("input", activeInputHandler);
      activeInput.removeEventListener("change", activeInputHandler);
    }

    activeInput = nextInput;
    activeInputHandler = null;
    lastWrittenValue = null;
    inputWasEdited = false;

    if (activeInput) {
      activeInputHandler = onInputChange;
      activeInput.addEventListener("input", activeInputHandler);
      activeInput.addEventListener("change", activeInputHandler);
    }
    return true;
  }

  function reconcileDom() {
    const nextImage = findElementByPriority(IMG_SELECTORS, false);
    const nextInput = findElementByPriority(INPUT_SELECTORS, true);
    const imageChanged = bindImage(nextImage);
    const inputChanged = bindInput(nextInput);
    if (imageChanged || inputChanged) requestSolve();
  }

  async function ensureModel() {
    if (session) return;
    if (!loadingPromise) {
      loadingPromise = (async () => {
        const response = await fetch(chrome.runtime.getURL("model/crnn.json"));
        if (!response.ok) throw new Error(`Metadata fetch failed: ${response.status}`);
        const loadedMeta = await response.json();
        if (!loadedMeta || typeof loadedMeta !== "object" || Array.isArray(loadedMeta)) {
          throw new Error("Invalid model metadata object");
        }
        const { img_w: width, img_h: height, alphabet, blank_idx: blankIndex, model_kind: modelKind } = loadedMeta;
        if (!Number.isSafeInteger(width) || width <= 0 || width > 2048 ||
            !Number.isSafeInteger(height) || height <= 0 || height > 2048) {
          throw new Error("Invalid model image dimensions");
        }
        if (typeof alphabet !== "string" || alphabet.length === 0 || new Set(alphabet).size !== alphabet.length) {
          throw new Error("Invalid model alphabet");
        }
        if (!Number.isSafeInteger(blankIndex) || blankIndex < 0 || blankIndex > alphabet.length) {
          throw new Error("Invalid model blank index");
        }
        if (modelKind !== "crnn_ctc") throw new Error("Unsupported model kind");

        const canvas = typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(width, height)
          : Object.assign(document.createElement("canvas"), { width, height });
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas 2D context is unavailable");

        const createdSession = await ort.InferenceSession.create(
          chrome.runtime.getURL("model/crnn.onnx"),
          { executionProviders: ["wasm"] }
        );
        if (!Array.isArray(createdSession.inputNames) || createdSession.inputNames.length !== 1 ||
            !Array.isArray(createdSession.outputNames) || createdSession.outputNames.length !== 1) {
          await createdSession.release?.();
          throw new Error("The model must expose exactly one input and one output");
        }

        sessionInputName = createdSession.inputNames[0];
        sessionOutputName = createdSession.outputNames[0];
        meta = loadedMeta;
        tensorBuffer = new Float32Array(width * height);
        drawCtx = context;
        session = createdSession;
      })().catch((error) => {
        loadingPromise = null;
        meta = null;
        tensorBuffer = null;
        drawCtx = null;
        session = null;
        sessionInputName = null;
        sessionOutputName = null;
        throw error;
      });
    }
    await loadingPromise;
  }

  function imageToTensor(img) {
    const width = meta.img_w;
    const height = meta.img_h;
    drawCtx.clearRect(0, 0, width, height);
    drawCtx.drawImage(img, 0, 0, width, height);
    const rgba = drawCtx.getImageData(0, 0, width, height).data;
    if (!rgba || rgba.length !== width * height * 4) {
      throw new Error("Unexpected canvas pixel buffer length");
    }
    // Preserve the existing alpha-channel preprocessing until the model's
    // training-time preprocessing contract can be independently established.
    for (let sourceIndex = 3, targetIndex = 0; sourceIndex < rgba.length; sourceIndex += 4, targetIndex++) {
      tensorBuffer[targetIndex] = rgba[sourceIndex] / 255;
    }
    return new ort.Tensor("float32", tensorBuffer, [1, 1, height, width]);
  }

  function ctcGreedyDecode(logits, timeSteps, classCount, alphabet, blankIndex) {
    if (!Number.isSafeInteger(timeSteps) || timeSteps <= 0 ||
        !Number.isSafeInteger(classCount) || classCount !== alphabet.length + 1 ||
        !Number.isSafeInteger(blankIndex) || blankIndex < 0 || blankIndex >= classCount ||
        !logits || logits.length !== timeSteps * classCount) {
      throw new Error("Invalid CTC output contract");
    }

    let result = "";
    let previousIndex = -1;
    for (let time = 0; time < timeSteps; time++) {
      const offset = time * classCount;
      let bestIndex = 0;
      let bestValue = Number(logits[offset]);
      if (!Number.isFinite(bestValue)) throw new Error("Non-finite CTC logit");
      for (let classIndex = 1; classIndex < classCount; classIndex++) {
        const value = Number(logits[offset + classIndex]);
        if (!Number.isFinite(value)) throw new Error("Non-finite CTC logit");
        if (value > bestValue) {
          bestValue = value;
          bestIndex = classIndex;
        }
      }
      if (bestIndex !== blankIndex && bestIndex !== previousIndex) {
        const characterIndex = bestIndex > blankIndex ? bestIndex - 1 : bestIndex;
        result += alphabet[characterIndex];
      }
      previousIndex = bestIndex;
    }
    return result;
  }

  function fillInput(element, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    writingInput = true;
    try {
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
      writingInput = false;
    }
  }

  function operationIsCurrent(generation, image, input, source, inputValue) {
    reconcileDom();
    return generation === currentSolveGeneration &&
      image === activeImage && input === activeInput &&
      image.isConnected && input.isConnected &&
      imageSource(image) === source &&
      input.value === inputValue && !inputWasEdited;
  }

  async function drainSolves() {
    if (isSolving) return;
    isSolving = true;

    try {
      while (solveRequested) {
        solveRequested = false;
        const generation = currentSolveGeneration;
        reconcileDom();
        const image = activeImage;
        const input = activeInput;
        if (!image || !input || !image.isConnected || !input.isConnected ||
            !image.complete || image.naturalWidth === 0) continue;

        const source = imageSource(image);
        if (!source) continue;
        const inputValueAtStart = input.value;
        const inputMayBeWritten = !inputWasEdited &&
          (inputValueAtStart === "" || inputValueAtStart === lastWrittenValue);
        if (!inputMayBeWritten) continue;
        if (source === lastSolvedSrc && inputValueAtStart === lastWrittenValue) continue;

        try {
          await ensureModel();
          if (!operationIsCurrent(generation, image, input, source, inputValueAtStart)) continue;

          const tensor = imageToTensor(image);
          if (!operationIsCurrent(generation, image, input, source, inputValueAtStart)) continue;

          const output = await session.run({ [sessionInputName]: tensor });
          if (!operationIsCurrent(generation, image, input, source, inputValueAtStart)) continue;
          const logits = output?.[sessionOutputName];
          if (!logits || !Array.isArray(logits.dims) || logits.dims.length !== 3) {
            throw new Error("Invalid ONNX output tensor");
          }
          const [batchSize, timeSteps, classCount] = logits.dims;
          if (batchSize !== 1 || classCount !== meta.alphabet.length + 1 ||
              !logits.data || logits.data.length !== timeSteps * classCount) {
            throw new Error("Unexpected ONNX output dimensions");
          }
          const code = ctcGreedyDecode(logits.data, timeSteps, classCount, meta.alphabet, meta.blank_idx);

          if (code.length >= 4 && code.length <= 7 && code.length <= timeSteps &&
              operationIsCurrent(generation, image, input, source, inputValueAtStart) &&
              !inputWasEdited && (input.value === "" || input.value === lastWrittenValue)) {
            fillInput(input, code);
            lastWrittenValue = code;
            lastSolvedSrc = source;
          }
        } catch (error) {
          console.error("[KLU-Captcha]", error);
        }
      }
    } finally {
      isSolving = false;
      if (solveRequested) queueMicrotask(() => { void drainSolves(); });
    }
  }

  imageObserver = new MutationObserver(onImageSourceChange);
  documentObserver = new MutationObserver(reconcileDom);
  if (document.documentElement) {
    documentObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id", "name", "type", "placeholder", "disabled", "readonly", "hidden", "class", "style"]
    });
  }

  reconcileDom();
  window.__kluCaptchaSolverLoaded = true;
})();
