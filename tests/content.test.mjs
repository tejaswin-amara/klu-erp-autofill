import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

function createMockDOM() {
  const listeners = {};
  return {
    window: { __kluCaptchaSolverLoaded: false },
    document: {
      documentElement: { childList: true, subtree: true },
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect: () => {}, drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }) }),
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    chrome: {
      runtime: {
        getURL: (p) => p
      }
    },
    ort: {
      env: { wasm: {} },
      Tensor: class { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } },
      InferenceSession: {
        create: async () => ({ run: async () => ({ logits: { dims: [1, 1, 1], data: [0] } }) })
      }
    },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; }
      observe() {}
      disconnect() {}
    },
    fetch: async () => ({ ok: true, json: async () => ({ img_w: 120, img_h: 50, blank_idx: 0, alphabet: "abc" }) }),
    setTimeout: (cb, t) => { cb(); return 1; },
    clearTimeout: () => {},
    Event: class { constructor(type) { this.type = type; } },
    HTMLInputElement: { prototype: { value: { set: function(v) { this.value = v; } } } }
  };
}

test("content.js sets up environment and selectors successfully without crashing", async () => {
  const contentJs = read("content.js");
  const env = createMockDOM();
  const func = new Function("window", "document", "chrome", "ort", "MutationObserver", "fetch", "setTimeout", "clearTimeout", "Event", "HTMLInputElement", "OffscreenCanvas", contentJs);

  assert.doesNotThrow(() => {
    func(env.window, env.document, env.chrome, env.ort, env.MutationObserver, env.fetch, env.setTimeout, env.clearTimeout, env.Event, env.HTMLInputElement, undefined);
  });
  assert.equal(env.window.__kluCaptchaSolverLoaded, true);
});

test("findElementByPriority selects correct element according to priorities", async () => {
  const contentJs = read("content.js");

  // Expose findElementByPriority to global scope for testing
  const exposedScript = contentJs.replace("function findElementByPriority", "globalThis.findElementByPriority = function");

  const env = createMockDOM();
  const els = [
    { id: 'wrong', isConnected: true, getBoundingClientRect: () => ({width: 10, height: 10}) },
    { id: 'correct', isConnected: true, getBoundingClientRect: () => ({width: 10, height: 10}) },
    { id: 'hidden', isConnected: true, getBoundingClientRect: () => ({width: 0, height: 0}) }
  ];

  env.document.querySelectorAll = (selector) => {
    if (selector === "img#loginform-verifycode-image") return [els[1]];
    if (selector === 'img[src*="captcha"]') return [els[0]]; // Lower priority
    return [];
  };

  const func = new Function("window", "document", "chrome", "ort", "MutationObserver", "fetch", "setTimeout", "clearTimeout", "Event", "HTMLInputElement", "OffscreenCanvas", exposedScript);
  func(env.window, env.document, env.chrome, env.ort, env.MutationObserver, env.fetch, env.setTimeout, env.clearTimeout, env.Event, env.HTMLInputElement, undefined);

  const imgSelectors = [
    'img#loginFormCaptcha-image',
    'img#loginform-verifycode-image',
    'img[src*="r=site/captcha"]',
    'img[src*="captcha"]'
  ];

  const selected = globalThis.findElementByPriority(imgSelectors, false);
  assert.equal(selected.id, 'correct', "Should pick higher priority selector even if multiple match in query");
  delete globalThis.findElementByPriority;
});

test("ctcGreedyDecode handles blank index mapping appropriately", async () => {
  const contentJs = read("content.js");
  const exposedScript = contentJs.replace("function ctcGreedyDecode", "globalThis.ctcGreedyDecode = function");
  const env = createMockDOM();
  const func = new Function("window", "document", "chrome", "ort", "MutationObserver", "fetch", "setTimeout", "clearTimeout", "Event", "HTMLInputElement", "OffscreenCanvas", exposedScript);
  func(env.window, env.document, env.chrome, env.ort, env.MutationObserver, env.fetch, env.setTimeout, env.clearTimeout, env.Event, env.HTMLInputElement, undefined);

  // Alphabet size 3: "abc", Classes: 4 (0 is blank)
  const alphabet = "abc";
  const blankIdx = 0;
  // sequence: 'a', blank, 'a', 'b', blank, 'c', 'c'
  // best idx:  1,    0,    1,   2,    0,    3,   3 (collapses 'c')
  // logits format [T*C]: we only set the max value for simplicity
  const T = 7;
  const C = 4;
  const logits = new Array(T*C).fill(0);

  const setMax = (t, c) => logits[t*C + c] = 1;
  setMax(0, 1); // 'a'
  setMax(1, 0); // blank
  setMax(2, 1); // 'a'
  setMax(3, 2); // 'b'
  setMax(4, 0); // blank
  setMax(5, 3); // 'c'
  setMax(6, 3); // 'c' (should collapse)

  const result = globalThis.ctcGreedyDecode(logits, T, C, alphabet, blankIdx);
  assert.equal(result, "aabc");

  delete globalThis.ctcGreedyDecode;
});







test("solveCaptcha prevents applying result if image changes during in-flight inference", async () => {
  const contentJs = read("content.js");

  let exposedScript = contentJs.replace("async function solveCaptcha", "globalThis.solveCaptcha = async function");

  // Actually expose isSolving so we can manually reset it in our simulated mock DOM event flow.
  exposedScript = exposedScript.replace("let isSolving = false;", "globalThis.isSolving = false;");
  exposedScript = exposedScript.replace(/isSolving/g, "globalThis.isSolving");

  exposedScript = exposedScript.replace("const imgAttrObserver = new MutationObserver(() => {", "globalThis.triggerObserver = () => {\n lastSolvedSrc = \"\";\n currentSolveGeneration++;\n };\n const imgAttrObserver = new MutationObserver(() => {");

  let currentLogits = [];
  const env = createMockDOM();
  env.ort.InferenceSession.create = async () => ({
    run: async () => {
      await new Promise(r => setTimeout(r, 10));
      return { logits: { dims: [1, 7, 4], data: currentLogits } };
    }
  });

  const imgA = { id: 'imgA', src: 'imgA.png', isConnected: true, getBoundingClientRect: () => ({width: 120, height: 50}), complete: true, naturalWidth: 120, addEventListener: ()=>{}, removeEventListener: ()=>{} };
  const imgB = { id: 'imgB', src: 'imgB.png', isConnected: true, getBoundingClientRect: () => ({width: 120, height: 50}), complete: true, naturalWidth: 120, addEventListener: ()=>{}, removeEventListener: ()=>{} };

  let inputValue = "";
  const inputEl = {
      id: 'input',
      isConnected: true,
      type: 'text',
      getBoundingClientRect: () => ({width: 120, height: 20}),
      dispatchEvent: ()=>{},
  };

  env.HTMLInputElement = {
      prototype: {
          value: {
              set: function(v) {
                  inputValue = v;
              }
          }
      }
  };
  Object.defineProperty(inputEl, 'value', {
      get: () => inputValue,
      set: (v) => { inputValue = v; }
  });

  let currentImg = imgA;
  env.document.querySelectorAll = (selector) => {
    if (selector === "img#loginFormCaptcha-image") return [currentImg];
    if (selector === "input#loginFormCaptcha") return [inputEl];
    return [];
  };

  const func = new Function("window", "document", "chrome", "ort", "MutationObserver", "fetch", "setTimeout", "clearTimeout", "Event", "HTMLInputElement", "OffscreenCanvas", exposedScript);
  func(env.window, env.document, env.chrome, env.ort, env.MutationObserver, env.fetch, env.setTimeout, env.clearTimeout, env.Event, env.HTMLInputElement, undefined);

  let logitsA = [
    0, 1, 0, 0, // 'a'
    1, 0, 0, 0, // blank
    0, 1, 0, 0, // 'a'
    1, 0, 0, 0, // blank
    0, 1, 0, 0, // 'a'
    1, 0, 0, 0, // blank
    0, 1, 0, 0  // 'a'
  ]; // Length 7 (T=7)

  let logitsB = [
    0, 0, 1, 0, // 'b'
    1, 0, 0, 0, // blank
    0, 0, 1, 0, // 'b'
    1, 0, 0, 0, // blank
    0, 0, 1, 0, // 'b'
    1, 0, 0, 0, // blank
    0, 0, 1, 0  // 'b'
  ];

  currentLogits = logitsA;
  const promiseA = globalThis.solveCaptcha();

  currentImg = imgB;
  currentLogits = logitsB;

  globalThis.triggerObserver();

  await promiseA;
  assert.equal(inputValue, "");

  // Clear mock solving state manually to kick off second resolve (usually managed by triggerObserver in actual browser event loop)
  globalThis.isSolving = false;

  const promiseB = globalThis.solveCaptcha();
  await promiseB;

  assert.equal(inputValue, "bbbb");

  delete globalThis.solveCaptcha;
  delete globalThis.triggerObserver;
});
