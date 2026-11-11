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

function createImage(source = "image-a.png") {
  const listeners = new Map();
  return {
    tagName: "IMG",
    src: source,
    currentSrc: source,
    complete: true,
    naturalWidth: 120,
    isConnected: true,
    listeners,
    getBoundingClientRect: () => ({ width: 120, height: 50 }),
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatch(type) { for (const callback of [...(listeners.get(type) || [])]) callback.call(this, { type, target: this }); }
  };
}

function createInput() {
  const listeners = new Map();
  const input = {
    tagName: "INPUT",
    type: "text",
    disabled: false,
    readOnly: false,
    isConnected: true,
    _value: "",
    listeners,
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
    dispatch(type) { this.dispatchEvent({ type, target: this, bubbles: true }); }
  };
  return input;
}

function logitsFor(character, blankIndex = 0) {
  const alphabet = "abc";
  const characterIndex = alphabet.indexOf(character);
  assert.notEqual(characterIndex, -1);
  const classIndex = characterIndex >= blankIndex ? characterIndex + 1 : characterIndex;
  const classCount = alphabet.length + 1;
  const values = new Float32Array(7 * classCount);
  for (let time = 0; time < 7; time++) {
    const selected = time % 2 === 0 ? classIndex : blankIndex;
    values[time * classCount + selected] = 10;
  }
  return { sequence: { dims: [1, 7, classCount], data: values } };
}

function createHarness({ blankIndex = 0, runImpl, initialImage = createImage(), selectorNodes = new Map() } = {}) {
  const image = initialImage;
  const input = createInput();
  const nodes = selectorNodes;
  const observers = [];
  const runs = [];
  let currentImage = image;
  let currentInput = input;

  const documentElement = { nodeName: "HTML" };
  const document = {
    documentElement,
    querySelectorAll(selector) {
      if (selector.startsWith("img#kl-sync-captcha-image")) return currentImage ? [currentImage] : [];
      if (selector.startsWith("input#captcha-field")) return currentInput ? [currentInput] : [];
      if (selector.startsWith("img#loginFormCaptcha-image")) return currentImage ? [currentImage] : [];
      if (selector.startsWith("input#loginFormCaptcha")) return currentInput ? [currentInput] : [];
      return nodes.get(selector) || [];
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
    window: { __kluCaptchaSolverLoaded: false },
    document,
    chrome: { runtime: { getURL: (relative) => `chrome-extension://test/${relative}` } },
    MutationObserver: MockMutationObserver,
    Event: MockInputEvent,
    HTMLInputElement: function HTMLInputElement() {},
    OffscreenCanvas: undefined,
    fetch: async () => ({ ok: true, json: async () => ({ alphabet: "abc", img_w: 120, img_h: 50, model_kind: "crnn_ctc", blank_idx: blankIndex }) }),
    console: { error() {} },
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
      create: async () => ({
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
      })
    }
  };

  vm.runInNewContext(CONTENT_SCRIPT, env, { filename: "content.js" });

  return {
    env, image, input, runs, observers, nodes, documentElement,
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

test("KL Sync login page selectors auto-fill the React-controlled code field without submitting the form", async () => {
  const harness = createHarness({ runImpl: undefined });
  await harness.waitForValue("aaaa");

  assert.equal(harness.image.listeners.get("load")?.size, 1);
  assert.equal(harness.input.value, "aaaa");
  assert.ok(harness.input.listeners.get("input")?.size > 0);
  assert.ok(harness.input.listeners.get("change")?.size > 0);
  assert.equal(
    /\\b(?:form|HTMLFormElement)\\s*\\.\\s*(?:submit|requestSubmit)\\s*\\(/i.test(CONTENT_SCRIPT),
    false
  );
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

test("manual input entered while inference is pending is never overwritten", async () => {
  const harness = createHarness({ runImpl: () => {} });
  const firstRun = await harness.waitForRun(0);
  harness.input.value = "manual";
  harness.input.dispatch("input");
  firstRun.operation.resolve(logitsFor("a"));
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(harness.input.value, "manual");
  assert.equal(harness.runs.length, 1);
});

test("CTC decoding respects a nonzero blank index", async () => {
  const harness = createHarness({ blankIndex: 2, runImpl: () => {} });
  const run = await harness.waitForRun(0);
  run.operation.resolve(logitsFor("b", 2));
  await harness.waitForValue("bbbb");
});
