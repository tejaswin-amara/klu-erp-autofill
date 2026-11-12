from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PACKAGER = ROOT / "scripts" / "package_extension.py"
SPEC = importlib.util.spec_from_file_location("package_extension", PACKAGER)
assert SPEC and SPEC.loader
packager = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(packager)


class PackageExtensionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.temp_root = Path(self.temp_dir.name)
        self.output = self.temp_root / "extension.zip"

    def build_archive(self) -> zipfile.ZipFile:
        root = self.fixture_root()
        packager.create_archive(self.output, root)
        self.assertTrue(self.output.is_file())
        self.assertTrue(self.output.with_name(self.output.name + ".sha256").is_file())
        archive = zipfile.ZipFile(self.output)
        self.addCleanup(archive.close)
        self.assertIsNone(archive.testzip(), "ZIP integrity check failed")
        return archive

    def fixture_root(self) -> Path:
        root = self.temp_root / f"fixture-repository-{len(list(self.temp_root.glob('fixture-repository-*')))}"
        root.mkdir()
        for relative in packager.RELEASE_FILES:
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            if relative == "manifest.json":
                path.write_text(json.dumps({
                    "content_scripts": [{"js": ["content.js"]}],
                    "icons": {"16": "icons/icon16.png"},
                    "web_accessible_resources": [{"resources": ["model/crnn.onnx"]}],
                }), encoding="utf-8")
            elif relative == "assets/readme-banner.svg":
                path.write_text("<svg xmlns=\"http://www.w3.org/2000/svg\"/>", encoding="utf-8")
            else:
                path.write_bytes(("fixture:" + relative).encode("utf-8"))
        (root / "assets" / "file.bin").write_bytes(b"fixture-payload")
        return root

    def test_archive_contains_exact_runtime_allowlist(self) -> None:
        with self.build_archive() as archive:
            names = set(archive.namelist())
            expected = set(packager.RELEASE_FILES) | {"CHECKSUMS.sha256"}
            self.assertEqual(names, expected, "Unexpected release archive contents")
            self.assertNotIn(".gitignore", names)
            self.assertFalse(any(name.startswith(".github/") for name in names))
            self.assertFalse(any(name.startswith("tests/") for name in names))
            self.assertFalse(any(name.startswith("scripts/") for name in names))

    def test_manifest_references_are_present_in_archive(self) -> None:
        with self.build_archive() as archive:
            names = set(archive.namelist())
            manifest = json.loads(archive.read("manifest.json"))
            for group in manifest.get("content_scripts", []):
                for path in group.get("js", []):
                    self.assertIn(path, names)
            for path in manifest.get("icons", {}).values():
                self.assertIn(path, names)
            for group in manifest.get("web_accessible_resources", []):
                for path in group.get("resources", []):
                    self.assertIn(path, names)

    def test_embedded_checksums_match_every_packaged_file(self) -> None:
        with self.build_archive() as archive:
            names = set(archive.namelist())
            checksum_text = archive.read("CHECKSUMS.sha256").decode("utf-8")
            checked = set()
            for line in checksum_text.splitlines():
                digest, relative = line.split("  ", 1)
                self.assertIn(relative, names)
                self.assertNotEqual(relative, "CHECKSUMS.sha256")
                self.assertEqual(hashlib.sha256(archive.read(relative)).hexdigest(), digest)
                checked.add(relative)
            self.assertEqual(checked, names - {"CHECKSUMS.sha256"})

    def test_zip_sidecar_matches_exact_archive_bytes(self) -> None:
        with self.build_archive():
            sidecar = self.output.with_name(self.output.name + ".sha256")
            digest, name = sidecar.read_text(encoding="utf-8").split()
            self.assertEqual(name, self.output.name)
            self.assertEqual(hashlib.sha256(self.output.read_bytes()).hexdigest(), digest)

    def test_missing_allowlisted_file_fails_in_temporary_fixture(self) -> None:
        root = self.fixture_root()
        before = sorted((path.relative_to(root).as_posix(), path.is_symlink()) for path in root.rglob("*"))
        with self.assertRaisesRegex(FileNotFoundError, "Required release file is missing"):
            packager.load_release_files(root, ("missing.bin",))
        after = sorted((path.relative_to(root).as_posix(), path.is_symlink()) for path in root.rglob("*"))
        self.assertEqual(after, before)

    def test_unallowlisted_manifest_reference_is_rejected(self) -> None:
        root = self.fixture_root()
        (root / "manifest.json").write_text(json.dumps({
            "content_scripts": [{"js": ["content.js", "unlisted.js"]}],
        }), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "not in release allowlist: unlisted.js"):
            packager.load_release_files(root)

    def test_invalid_manifest_json_is_rejected(self) -> None:
        root = self.fixture_root()
        (root / "manifest.json").write_text("{not valid json", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Invalid manifest.json"):
            packager.load_release_files(root)

    def test_symlinked_allowlisted_file_is_rejected_without_repository_mutation(self) -> None:
        root = self.fixture_root()
        target = root / "assets" / "file.bin"
        link = root / "assets" / "linked.bin"
        link.symlink_to(target)
        with self.assertRaisesRegex(ValueError, "symlink path component"):
            packager.load_release_files(root, ("assets/linked.bin",))
        self.assertTrue(target.is_file())
        self.assertTrue(link.is_symlink())

    def test_symlinked_parent_and_dangling_symlink_are_rejected(self) -> None:
        root = self.fixture_root()
        external = self.temp_root / "external"
        external.mkdir()
        (external / "secret.bin").write_bytes(b"not for packaging")
        (root / "alias").symlink_to(external, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink path component"):
            packager.load_release_files(root, ("alias/secret.bin",))

        (root / "assets" / "dangling.bin").symlink_to(root / "missing-target.bin")
        with self.assertRaisesRegex(ValueError, "symlink path component"):
            packager.load_release_files(root, ("assets/dangling.bin",))

    def test_path_traversal_in_allowlist_is_rejected(self) -> None:
        root = self.fixture_root()
        with self.assertRaisesRegex(ValueError, "Unsafe release path"):
            packager.load_release_files(root, ("../outside.bin",))

    def test_output_collision_with_source_file_is_rejected(self) -> None:
        root = self.fixture_root()
        source = root / "assets" / "file.bin"
        original = source.read_bytes()
        with self.assertRaisesRegex(ValueError, "outside dist"):
            packager.create_archive(source, root, ("assets/file.bin",))
        self.assertEqual(source.read_bytes(), original)

    def test_output_inside_dist_is_allowed_but_dist_backup_is_not(self) -> None:
        root = self.fixture_root()
        digest = packager.create_archive(root / "dist" / "extension.zip", root, ("assets/file.bin",))
        self.assertEqual(len(digest), 64)
        rejected_path = root / "dist-backup" / "extension.zip"
        with self.assertRaisesRegex(ValueError, "outside dist"):
            packager.create_archive(rejected_path, root, ("assets/file.bin",))
        self.assertFalse(rejected_path.parent.exists(), "rejected output must not create a directory")

    def test_symlinked_output_directory_is_rejected(self) -> None:
        root = self.fixture_root()
        external = self.temp_root / "external-output"
        external.mkdir()
        (root / "dist").symlink_to(external, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink path component"):
            packager.create_archive(root / "dist" / "extension.zip", root, ("assets/file.bin",))

    def test_existing_lock_prevents_concurrent_publication(self) -> None:
        root = self.fixture_root()
        output = self.temp_root / "locked.zip"
        lock = output.with_name(f".{output.name}.lock")
        lock.write_text("another process", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "holds the lock"):
            packager.create_archive(output, root, ("assets/file.bin",))
        self.assertEqual(lock.read_text(encoding="utf-8"), "another process")

    def test_sidecar_publication_failure_restores_previous_pair(self) -> None:
        root = self.fixture_root()
        output = self.temp_root / "transaction.zip"
        sidecar = output.with_name(output.name + ".sha256")
        output.write_bytes(b"previous-archive")
        sidecar.write_bytes(b"previous-sidecar")
        original_replace = packager.os.replace
        failed_once = False

        def replace_with_failure(source, destination):
            nonlocal failed_once
            if Path(destination) == sidecar and not failed_once:
                failed_once = True
                raise OSError("injected sidecar publication failure")
            return original_replace(source, destination)

        with mock.patch.object(packager.os, "replace", side_effect=replace_with_failure):
            with self.assertRaisesRegex(OSError, "injected sidecar"):
                packager.create_archive(output, root, ("assets/file.bin",))

        self.assertEqual(output.read_bytes(), b"previous-archive")
        self.assertEqual(sidecar.read_bytes(), b"previous-sidecar")
        self.assertFalse(output.with_name(f".{output.name}.lock").exists())
        self.assertFalse(list(self.temp_root.glob(".*.tmp")))

    def test_archive_is_byte_for_byte_deterministic(self) -> None:
        root = self.fixture_root()
        first = self.temp_root / "first.zip"
        second = self.temp_root / "second.zip"
        packager.create_archive(first, root, ("assets/file.bin",))
        packager.create_archive(second, root, ("assets/file.bin",))
        self.assertEqual(first.read_bytes(), second.read_bytes())


if __name__ == "__main__":
    unittest.main()
