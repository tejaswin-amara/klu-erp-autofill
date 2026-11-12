import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_SCRIPT = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createImage(source = "image-a.png", overrides = {}) {
  const listeners = new Map();
  return {
    tagName: "IMG",
    src: source,
    currentSrc: source,
    complete: true,
    naturalWidth: 120,
    hidden: false,
    style: {},
    isConnected: true,
    listeners,
    getAttribute(name) { return this.attributes?.[name] ?? null; },
    getBoundingClientRect: () => ({ width: 120, height: 50 }),
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatch(type) { for (const callback of [...(listeners.get(type) || [])]) callback.call(this, { type, target: this }); },
    ...overrides
  };
}

function createInput(overrides = {}) {
  const listeners = new Map();
  const input = {
    tagName: "INPUT",
    type: "text",
    disabled: false,
    readOnly: false,
    hidden: false,
    style: {},
    isConnected: true,
    _value: "",
    listeners,
    getAttribute(name) { return this.attributes?.[name] ?? null; },
    get value() { return this._value; },
    set value(value) { this._value = String(value); },
    getBoundingClientRect: () => ({ width: 180, height: 24 }),
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatchEvent(event) {
      for (const callback of [...(listeners.get(event.type) || [])]) callback.call(this, event);
      return true;
    },
    dispatch(type) { this.dispatchEvent({ type, target: this, bubbles: true }); },
    ...overrides
  };
  return input;
}

function logitsFor(character, blankIndex = 0, repeatCount = 4) {
  const alphabet = "abc";
  const characterIndex = alphabet.indexOf(character);
  assert.notEqual(characterIndex, -1);
  const classIndex = characterIndex >= blankIndex ? characterIndex + 1 : characterIndex;
  const classCount = alphabet.length + 1;
  const timeSteps = repeatCount * 2;
  const values = new Float32Array(timeSteps * classCount);
  for (let time = 0; time < timeSteps; time++) {
    const selected = time % 2 === 0 ? classIndex : blankIndex;
    values[time * classCount + selected] = 10;
  }
  return { sequence: { dims: [1, timeSteps, classCount], data: values } };
}

function createHarness({
  blankIndex = 0,
  runImpl,
  fetchImpl,
  createSessionImpl,
  initialImage = createImage(),
  initialInput = createInput(),
  selectorNodes = new Map()
} = {}) {
  const image = initialImage;
  const input = initialInput;
  const nodes = selectorNodes;
  const observers = [];
  const runs = [];
  const errors = [];
  let currentImage = image;
  let currentInput = input;

  const documentElement = { nodeName: "HTML" };
  const document = {
    documentElement,
    querySelectorAll(selector) {
      if (nodes.has(selector)) return nodes.get(selector);
      if (selector.startsWith("img#loginFormCaptcha-image")) return currentImage ? [currentImage] : [];
      if (selector.startsWith("input#loginFormCaptcha")) return currentInput ? [currentInput] : [];
      return [];
    },
    createElement(name) {
      assert.equal(name, "canvas");
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            clearRect() {},
            drawImage() {},
            getImageData(_x, _y, width, height) {
              const data = new Uint8ClampedArray(width * height * 4);
              for (let index = 3; index < data.length; index += 4) data[index] = 255;
              return { data };
            }
          };
        }
      };
    }
  };

  class MockMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.target = null;
      this.options = null;
      this.connected = false;
      observers.push(this);
    }
    observe(target, options) { this.target = target; this.options = options; this.connected = true; }
    disconnect() { this.connected = false; }
    trigger(records = []) { if (this.connected) this.callback(records, this); }
  }

  class MockInputEvent {
    constructor(type, options = {}) { this.type = type; this.bubbles = Boolean(options.bubbles); }
  }

  const env = {
    window: {
      __kluCaptchaSolverLoaded: false,
      getComputedStyle(el) { return el?.style || {}; }
    },
    document,
    chrome: { runtime: { getURL: (relative) => `chrome-extension://test/${relative}` } },
    MutationObserver: MockMutationObserver,
    Event: MockInputEvent,
    HTMLInputElement: function HTMLInputElement() {},
    OffscreenCanvas: undefined,
    fetch: fetchImpl || (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ alphabet: "abc", img_w: 120, img_h: 50, model_kind: "crnn_ctc", blank_idx: blankIndex })
    })),
    console: { error(...args) { errors.push(args); } },
    queueMicrotask,
    setTimeout,
    clearTimeout
  };
  Object.defineProperty(env.HTMLInputElement.prototype, "value", {
    set(value) { this._value = String(value); },
    get() { return this._value; }
  });

  env.ort = {
    env: { wasm: {} },
    Tensor: class Tensor { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } },
    InferenceSession: {
      create: createSessionImpl || (async () => ({
        inputNames: ["pixels"],
        outputNames: ["sequence"],
        run(feeds) {
          const operation = deferred();
          const record = { feeds, inputTensor: feeds.pixels, operation };
          runs.push(record);
          const index = runs.length - 1;
          if (runImpl) runImpl(record, index);
          else operation.resolve(logitsFor("a", blankIndex));
          return operation.promise;
        }
      }))
    }
  };

  vm.runInNewContext(CONTENT_SCRIPT, env, { filename: "content.js" });

  return {
    env, image, input, runs, errors, observers, nodes, documentElement,
    get currentImage() { return currentImage; },
    get currentInput() { return currentInput; },
    setImage(next) { if (currentImage) currentImage.isConnected = false; currentImage = next; },
    setInput(next) { if (currentInput) currentInput.isConnected = false; currentInput = next; },
    imageObserver(target = currentImage) { return observers.find((observer) => observer.target === target && observer.options?.attributes); },
    documentObserver() { return observers.find((observer) => observer.target === documentElement && observer.options?.childList); },
    async waitForRun(index) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (runs[index]) return runs[index];
        await new Promise((resolve) => queueMicrotask(resolve));
      }
      assert.fail(`Inference run ${index + 1} did not start`);
    },
    async waitForValue(expected, target = input) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (target.value === expected) return;
        await new Promise((resolve) => queueMicrotask(resolve));
      }
      assert.equal(target.value, expected);
    }
  };
}

test("content script initializes and scopes its model resources locally", () => {
  const harness = createHarness();
  assert.equal(harness.env.window.__kluCaptchaSolverLoaded, true);
  assert.equal(harness.env.ort.env.wasm.wasmPaths, "chrome-extension://test/lib/");
  assert.equal(harness.env.ort.env.wasm.numThreads, 1);
});

test("selector fallback priority is independent of document order", async () => {
  const preferred = createImage("specific.png");
  const lowerPriority = createImage("generic.png");
  const selectorNodes = new Map([
    ["img#loginform-verifycode-image", [preferred]],
    ['img[src*="captcha"]', [lowerPriority]]
  ]);
  const harness = createHarness({ initialImage: null, selectorNodes, runImpl: () => {} });

  assert.equal(preferred.listeners.get("load")?.size, 1);
  assert.equal(lowerPriority.listeners.get("load")?.size || 0, 0);
  await harness.waitForRun(0);
});

test("KL Sync login page selectors take priority over fallback selectors without submitting the form", async () => {
  const klSyncImage = createImage("kl-sync-captcha.png");
  const klSyncInput = createInput();
  const erpFallbackImage = createImage("erp-captcha.png");
  const erpFallbackInput = createInput();
  const selectorNodes = new Map([
    ["img#kl-sync-captcha-image", [klSyncImage]],
    ["input#captcha-field", [klSyncInput]]
  ]);
  const harness = createHarness({
    initialImage: erpFallbackImage,
    initialInput: erpFallbackInput,
    selectorNodes
  });
  await harness.waitForValue("aaaa", klSyncInput);

  assert.equal(klSyncImage.listeners.get("load")?.size, 1);
  assert.equal(erpFallbackImage.listeners.get("load")?.size || 0, 0);
  assert.equal(klSyncInput.value, "aaaa");
  assert.equal(erpFallbackInput.value, "");
  assert.ok(klSyncInput.listeners.get("input")?.size > 0);
  assert.ok(klSyncInput.listeners.get("change")?.size > 0);
  assert.equal(CONTENT_SCRIPT.includes("requestSubmit("), false);
  assert.equal(CONTENT_SCRIPT.includes(".submit("), false);
});

test("hidden, CSS-invisible, disabled, readOnly, and non-text inputs are skipped during selector resolution", async () => {
  const hiddenCssInput = createInput({ style: { visibility: "hidden" } });
  const zeroOpacityInput = createInput({ style: { opacity: "0" } });
  const ariaHiddenInput = createInput({ attributes: { "aria-hidden": "true" } });
  const checkboxInput = createInput({ type: "checkbox" });
  const passwordInput = createInput({ type: "password" });
  const validInput = createInput();
  const selectorNodes = new Map([
    ["input#captcha-field", [hiddenCssInput, zeroOpacityInput, ariaHiddenInput]],
    ['input[name*="captcha" i]', [checkboxInput, passwordInput, validInput]]
  ]);
  const harness = createHarness({ initialInput: null, selectorNodes });
  await harness.waitForValue("aaaa", validInput);

  assert.equal(hiddenCssInput.value, "");
  assert.equal(zeroOpacityInput.value, "");
  assert.equal(ariaHiddenInput.value, "");
  assert.equal(checkboxInput.value, "");
  assert.equal(passwordInput.value, "");
  assert.equal(validInput.value, "aaaa");
});

test("latest image is processed after an actual in-flight inference becomes obsolete", async () => {
  const harness = createHarness({ runImpl: () => {} });
  const firstRun = await harness.waitForRun(0);

  harness.image.src = "image-b.png";
  harness.image.currentSrc = "image-b.png";
  harness.imageObserver(harness.image).trigger([{ type: "attributes", attributeName: "src" }]);
  assert.equal(harness.runs.length, 1, "second inference must wait for the in-flight operation");
  assert.deepEqual(Object.keys(firstRun.feeds), ["pixels"], "actual session input name must be used");

  firstRun.operation.resolve(logitsFor("a"));
  const secondRun = await harness.waitForRun(1);
  assert.equal(harness.input.value, "", "obsolete image A output must not be applied");

  secondRun.operation.resolve(logitsFor("b"));
  await harness.waitForValue("bbbb");
  assert.equal(harness.runs.length, 2, "latest image must be processed exactly once");
});

test("rapid image updates coalesce to the latest source", async () => {
  const harness = createHarness({ runImpl: () => {} });
  const firstRun = await harness.waitForRun(0);

  harness.image.src = "image-b.png";
  harness.image.currentSrc = "image-b.png";
  harness.imageObserver().trigger([{ type: "attributes", attributeName: "src" }]);
  harness.image.src = "image-c.png";
  harness.image.currentSrc = "image-c.png";
  harness.imageObserver().trigger([{ type: "attributes", attributeName: "src" }]);

  firstRun.operation.resolve(logitsFor("a"));
  const latestRun = await harness.waitForRun(1);
  assert.equal(harness.runs.length, 2, "intermediate image B should be coalesced");
  latestRun.operation.resolve(logitsFor("c"));
  await harness.waitForValue("cccc");
});

test("in-place image load event re-solves even when src string is unchanged", async () => {
  let runCount = 0;
  const harness = createHarness({
    runImpl(record) {
      runCount += 1;
      record.operation.resolve(logitsFor(runCount === 1 ? "a" : "b"));
    }
  });
  await harness.waitForValue("aaaa");
  assert.equal(harness.runs.length, 1);

  harness.image.dispatch("load");
  await harness.waitForValue("bbbb");
  assert.equal(harness.runs.length, 2);
});

test("replaced CAPTCHA image is rebound and old load listener is removed", async () => {
  const harness = createHarness({ runImpl: () => {} });
  const firstRun = await harness.waitForRun(0);
  assert.equal(harness.image.listeners.get("load")?.size, 1);

  const replacement = createImage("replacement.png");
  harness.setImage(replacement);
  harness.documentObserver().trigger([{ type: "childList" }]);

  assert.equal(harness.image.listeners.get("load")?.size || 0, 0);
  assert.equal(replacement.listeners.get("load")?.size, 1);
  firstRun.operation.resolve(logitsFor("a"));
  const replacementRun = await harness.waitForRun(1);
  replacementRun.operation.resolve(logitsFor("c"));
  await harness.waitForValue("cccc");
});

test("replaced input is rebound and obsolete inference cannot write to it", async () => {
  const harness = createHarness({ runImpl: () => {} });
  const firstRun = await harness.waitForRun(0);
  const replacement = createInput();
  harness.setInput(replacement);
  harness.documentObserver().trigger([{ type: "childList" }]);

  firstRun.operation.resolve(logitsFor("a"));
  const replacementRun = await harness.waitForRun(1);
  assert.equal(harness.input.value, "");
  replacementRun.operation.resolve(logitsFor("c"));
  await harness.waitForValue("cccc", replacement);
  assert.equal(harness.input.value, "");
});

test("manual input entered while inference is pending is never overwritten, but clearing input restores auto-fill", async () => {
  const harness = createHarness({ runImpl: () => {} });
  const firstRun = await harness.waitForRun(0);
  harness.input.value = "manual";
  harness.input.dispatch("input");
  firstRun.operation.resolve(logitsFor("a"));
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(harness.input.value, "manual");
  assert.equal(harness.runs.length, 1);

  // User clears the input back to empty and refreshes CAPTCHA
  harness.input.value = "";
  harness.input.dispatch("input");
  harness.image.src = "image-after-clear.png";
  harness.image.currentSrc = "image-after-clear.png";
  harness.imageObserver().trigger([{ type: "attributes", attributeName: "src" }]);
  const secondRun = await harness.waitForRun(1);
  secondRun.operation.resolve(logitsFor("c"));
  await harness.waitForValue("cccc");
});

test("CTC decoding respects a nonzero blank index and rejects out-of-range length or non-finite logits", async () => {
  const harness = createHarness({ blankIndex: 2, runImpl: () => {} });
  const firstRun = await harness.waitForRun(0);
  // 8 characters (>7) must not be written
  firstRun.operation.resolve(logitsFor("b", 2, 8));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(harness.input.value, "");

  // Non-finite logits must be rejected safely
  harness.image.src = "image-nan.png";
  harness.image.currentSrc = "image-nan.png";
  harness.imageObserver().trigger([{ type: "attributes", attributeName: "src" }]);
  const nanRun = await harness.waitForRun(1);
  const nanLogits = logitsFor("b", 2, 4);
  nanLogits.sequence.data[0] = Number.NaN;
  nanRun.operation.resolve(nanLogits);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(harness.input.value, "");
  assert.ok(harness.errors.length >= 1);

  // Valid 4-character output with blankIndex=2 succeeds
  harness.image.src = "image-valid.png";
  harness.image.currentSrc = "image-valid.png";
  harness.imageObserver().trigger([{ type: "attributes", attributeName: "src" }]);
  const validRun = await harness.waitForRun(2);
  validRun.operation.resolve(logitsFor("b", 2, 4));
  await harness.waitForValue("bbbb");
});

test("model initialization recovers after transient metadata or session failure and rejects invalid metadata", async () => {
  let fetchAttempt = 0;
  const harness = createHarness({
    fetchImpl: async () => {
      fetchAttempt += 1;
      if (fetchAttempt === 1) {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      if (fetchAttempt === 2) {
        // Invalid blank_idx > alphabet.length
        return {
          ok: true,
          status: 200,
          json: async () => ({ alphabet: "abc", img_w: 120, img_h: 50, model_kind: "crnn_ctc", blank_idx: 9 })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ alphabet: "abc", img_w: 120, img_h: 50, model_kind: "crnn_ctc", blank_idx: 0 })
      };
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(harness.input.value, "");
  assert.equal(fetchAttempt, 1);

  // Second attempt hits invalid blank_idx and rejects before session creation
  harness.image.dispatch("load");
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(harness.input.value, "");
  assert.equal(fetchAttempt, 2);

  // Third attempt succeeds and populates input
  harness.image.dispatch("load");
  await harness.waitForValue("aaaa");
  assert.equal(fetchAttempt, 3);
});

test("bundled ONNX Runtime Web v1.16.3 WASM executes the bundled CRNN model end-to-end", async () => {
  const ortSource = fs.readFileSync(path.join(ROOT, "lib/ort.min.js"), "utf8");
  const sandbox = {
    ArrayBuffer, Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
    Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView,
    WebAssembly, Promise, Map, Set, WeakMap, WeakSet, Symbol, Error, TypeError, RangeError,
    Object, Array, Number, String, Boolean, Math, Date, RegExp, JSON,
    TextEncoder, TextDecoder, URL, Response, console, setTimeout, clearTimeout, queueMicrotask,
    navigator: { hardwareConcurrency: 1, userAgent: "Mozilla/5.0" },
    location: { href: "chrome-extension://test/", origin: "chrome-extension://test" },
    performance: { now: () => Date.now() },
    fetch: async (url) => {
      const rel = String(url).replace("chrome-extension://test/", "");
      const buf = fs.readFileSync(path.join(ROOT, rel));
      return new Response(buf, {
        status: 200,
        headers: { "content-type": rel.endsWith(".wasm") ? "application/wasm" : "application/octet-stream" }
      });
    }
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(ortSource, sandbox, { filename: "ort.min.js" });

  const ort = sandbox.ort;
  assert.equal(ort.env.versions.web, "1.16.3");
  ort.env.wasm.wasmPaths = "chrome-extension://test/lib/";
  ort.env.wasm.numThreads = 1;

  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "model/crnn.json"), "utf8"));
  const session = await ort.InferenceSession.create("chrome-extension://test/model/crnn.onnx", {
    executionProviders: ["wasm"]
  });
  assert.deepEqual(Array.from(session.inputNames), ["input"]);
  assert.deepEqual(Array.from(session.outputNames), ["logits"]);

  const inputTensor = new ort.Tensor("float32", new Float32Array(meta.img_w * meta.img_h), [1, 1, meta.img_h, meta.img_w]);
  const output = await session.run({ [session.inputNames[0]]: inputTensor });
  const logits = output[session.outputNames[0]];
  assert.equal(logits.type, "float32");
  assert.deepEqual(Array.from(logits.dims), [1, 30, meta.alphabet.length + 1]);
  assert.equal(logits.data.length, 30 * (meta.alphabet.length + 1));
  assert.ok(logits.data.every((value) => Number.isFinite(value)));
});
