import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(ROOT, relativePath));

test("manifest is valid Manifest V3 with a matching package version", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const packageMetadata = JSON.parse(read("package.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(packageMetadata.version, manifest.version);
});

test("all manifest-referenced scripts, icons, and web-accessible resources exist", () => {
  const manifest = JSON.parse(read("manifest.json"));
  for (const script of manifest.content_scripts ?? []) {
    for (const file of script.js ?? []) assert.ok(exists(file), "Missing content script asset: " + file);
  }
  for (const file of Object.values(manifest.icons ?? {})) {
    assert.ok(exists(file), "Missing icon asset: " + file);
  }
  for (const group of manifest.web_accessible_resources ?? []) {
    for (const file of group.resources ?? []) {
      assert.ok(exists(file), "Missing web-accessible resource: " + file);
    }
  }
  assert.ok(exists("model/crnn.onnx"), "Bundled model file is missing");
});

test("host match patterns remain limited to the ERP and KL Sync HTTPS login origins", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const expectedPatterns = [
    "https://newerp.kluniversity.in/*",
    "https://klhb.vercel.app/*"
  ];
  assert.deepEqual(manifest.content_scripts?.[0]?.matches, expectedPatterns);
  assert.deepEqual(manifest.web_accessible_resources?.[0]?.matches, expectedPatterns);
  assert.deepEqual(manifest.permissions ?? [], []);
  assert.deepEqual(manifest.host_permissions ?? [], []);
});

test("model metadata has basic, internally valid structural fields", () => {
  const metadata = JSON.parse(read("model/crnn.json"));
  assert.equal(typeof metadata.alphabet, "string");
  assert.ok(metadata.alphabet.length > 0);
  assert.equal(Number.isInteger(metadata.img_w), true);
  assert.equal(Number.isInteger(metadata.img_h), true);
  assert.ok(metadata.img_w > 0 && metadata.img_h > 0);
  assert.equal(Number.isInteger(metadata.blank_idx), true);
  assert.ok(metadata.blank_idx >= 0 && metadata.blank_idx <= metadata.alphabet.length);
  assert.equal(metadata.model_kind, "crnn_ctc");
});

test("release and privacy notices are present and explain model provenance limitations", () => {
  for (const file of [
    "README.md", "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md",
    "SECURITY.md", "SUPPORT.md", "CHANGELOG.md", "docs/PRIVACY.md"
  ]) {
    assert.ok(exists(file), "Required documentation missing: " + file);
    assert.ok(read(file).trim().length > 0, "Required documentation is empty: " + file);
  }
  assert.match(read("THIRD_PARTY_NOTICES.md"), /MIT License/);
  assert.match(read("THIRD_PARTY_NOTICES.md"), /provenance/i);
});

test("the content script does not directly submit the live login form", () => {
  const source = read("content.js");
  assert.doesNotMatch(source, /\b(?:form|HTMLFormElement)\s*\.\s*(?:submit|requestSubmit)\s*\(/i);
  assert.doesNotMatch(source, /\brequestSubmit\s*\(/i);
});

test("field updates retain bubbling input and change events", () => {
  const source = read("content.js");
  assert.match(source, /new Event\(["']input["'],\s*\{\s*bubbles:\s*true\s*\}\)/);
  assert.match(source, /new Event\(["']change["'],\s*\{\s*bubbles:\s*true\s*\}\)/);
});

test("explicit log calls do not pass recognized-code variables", () => {
  const source = read("content.js");
  const calls = source.match(/console\.(?:log|info|debug|warn|error)\s*\([^;]*?\);/gs) ?? [];
  for (const call of calls) {
    assert.doesNotMatch(call, /\b(?:recognizedText|captchaText|solvedCode|captchaCode)\b/i);
  }
});



test("relative Markdown links in maintained docs resolve to repository files", () => {
  const markdownFiles = [
    "README.md",
    "AUDIT_REPORT.md",
    "IMPROVEMENT_BACKLOG.md",
    "FIX_IMPLEMENTATION_GUIDE.md",
    "TEST_AND_VERIFICATION_PLAN.md",
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "SUPPORT.md",
    "THIRD_PARTY_NOTICES.md",
    "docs/PRIVACY.md",
    ".github/ISSUE_TEMPLATE/bug_report.md",
    ".github/ISSUE_TEMPLATE/feature_request.md"
  ].filter(exists);

  const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

  for (const documentPath of markdownFiles) {
    const source = read(documentPath);
    for (const match of source.matchAll(linkPattern)) {
      const target = match[1].replace(/^<|>$/g, "");
      if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;

      const pathname = decodeURIComponent(target.split("#", 1)[0].split("?", 1)[0]);
      if (!pathname) continue;

      const resolved = path.resolve(ROOT, path.dirname(documentPath), pathname);
      const relative = path.relative(ROOT, resolved);
      assert.ok(
        relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative),
        "Relative link escapes repository in " + documentPath + ": " + target
      );
      assert.ok(
        fs.existsSync(resolved),
        "Broken relative Markdown link in " + documentPath + ": " + target
      );
    }
  }
});

test("CI executes quality gates without masking failures", () => {
  const workflow = read(".github/workflows/ci.yml");
  assert.match(workflow, /run:\s*npm test/);
  assert.match(workflow, /run:\s*npm run test:package/);
  assert.match(workflow, /scripts\/package_extension\.py/);
  assert.doesNotMatch(workflow, /\|\|\s*(?:echo|true)\b/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});


test("audit companion documents and machine-readable backlog are valid", () => {
  for (const file of [
    "AUDIT_REPORT.md",
    "IMPROVEMENT_BACKLOG.md",
    "FIX_IMPLEMENTATION_GUIDE.md",
    "TEST_AND_VERIFICATION_PLAN.md",
    "audit/improvement-backlog.json"
  ]) {
    assert.ok(exists(file), "Missing audit artifact: " + file);
    assert.ok(read(file).trim().length > 0, "Empty audit artifact: " + file);
  }

  const backlog = JSON.parse(read("audit/improvement-backlog.json"));
  assert.equal(backlog.repository, "https://github.com/tejaswin-amara/klu-erp-autofill");
  assert.ok(Array.isArray(backlog.tasks) && backlog.tasks.length > 0);

  const ids = backlog.tasks.map((task) => task.taskId);
  assert.equal(new Set(ids).size, ids.length, "Duplicate task IDs found");
  for (const task of backlog.tasks) {
    assert.match(task.priority, /^P[0-3]$/);
    assert.equal(typeof task.title, "string");
    assert.ok(task.title.length > 0);
    assert.ok(Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length > 0);
    assert.ok(Array.isArray(task.dependencies));
  }
});


function markdownHeadingIds(source) {
  const ids = new Set();
  const counts = new Map();

  for (const match of source.matchAll(/<a\s+id=["']([^"']+)["'][^>]*>/gi)) {
    ids.add(match[1]);
  }

  for (const line of source.split(/\r?\n/)) {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!heading) continue;

    const plain = heading[1]
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/<[^>]*>/g, "")
      .replace(/<escape>|<\/escape>/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

    if (!plain) continue;
    const occurrence = counts.get(plain) ?? 0;
    counts.set(plain, occurrence + 1);
    ids.add(occurrence === 0 ? plain : `${plain}-${occurrence}`);
  }

  return ids;
}

test("local Markdown fragments in maintained documents resolve to headings or explicit anchors", () => {
  const markdownFiles = [
    "README.md",
    "AUDIT_REPORT.md",
    "IMPROVEMENT_BACKLOG.md",
    "FIX_IMPLEMENTATION_GUIDE.md",
    "TEST_AND_VERIFICATION_PLAN.md",
    "FINAL_REPORT.md",
    "PR_VERIFICATION_REPORT.md",
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "SUPPORT.md",
    "THIRD_PARTY_NOTICES.md",
    "docs/PRIVACY.md"
  ].filter(exists);

  const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

  for (const documentPath of markdownFiles) {
    const source = read(documentPath);
    for (const match of source.matchAll(linkPattern)) {
      const target = match[1].replace(/^<|>$/g, "");
      if (!target.includes("#") || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;

      const [pathname, rawFragment] = target.split("#", 2);
      const fragment = decodeURIComponent(rawFragment || "");
      if (!fragment) continue;

      const localPath = decodeURIComponent((pathname || "").split("?", 1)[0]);
      const resolved = localPath
        ? path.resolve(ROOT, path.dirname(documentPath), localPath)
        : path.resolve(ROOT, documentPath);
      if (!resolved.toLowerCase().endsWith(".md") || !fs.existsSync(resolved)) continue;

      const targetSource = fs.readFileSync(resolved, "utf8");
      const ids = markdownHeadingIds(targetSource);
      assert.ok(
        ids.has(fragment),
        `Broken local Markdown fragment in ${documentPath}: ${target}`
      );
    }
  }
});
