from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PACKAGER = ROOT / "scripts" / "package_extension.py"


class PackageExtensionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.output = Path(self.temp_dir.name) / "extension.zip"

    def build_archive(self) -> zipfile.ZipFile:
        result = subprocess.run(
            [sys.executable, str(PACKAGER), "--output", str(self.output)],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertTrue(self.output.is_file())
        self.assertTrue(self.output.with_name(self.output.name + ".sha256").is_file())
        archive = zipfile.ZipFile(self.output)
        self.addCleanup(archive.close)
        self.assertIsNone(archive.testzip(), "ZIP integrity check failed")
        return archive

    def test_archive_contains_runtime_and_redistribution_documents(self) -> None:
        with self.build_archive() as archive:
            names = set(archive.namelist())
            required = {
                "manifest.json", "content.js", "README.md", "LICENSE", "NOTICE",
                "THIRD_PARTY_NOTICES.md", "docs/PRIVACY.md", "model/crnn.json",
                "model/crnn.onnx", "lib/ort.min.js", "lib/ort-wasm-simd.wasm",
                "icons/icon16.png", "icons/icon48.png", "icons/icon128.png",
                "CHECKSUMS.sha256",
            }
            expected_release_files = {
                "manifest.json", "content.js", "README.md", "LICENSE", "NOTICE",
                "THIRD_PARTY_NOTICES.md", "SECURITY.md", "SUPPORT.md", "CHANGELOG.md",
                "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "assets/readme-banner.svg",
                "docs/PRIVACY.md", "icons/icon16.png", "icons/icon48.png",
                "icons/icon128.png", "lib/ort.min.js", "lib/ort-wasm-simd.wasm",
                "model/crnn.json", "model/crnn.onnx", "CHECKSUMS.sha256",
            }
            self.assertEqual(names, expected_release_files, "Unexpected release archive contents")
            self.assertNotIn(".gitignore", names)
            self.assertFalse(any(name.startswith(".github/") for name in names))
            self.assertFalse(any(name.startswith("tests/") for name in names))
            self.assertFalse(any(name.startswith("scripts/") for name in names))
            self.assertTrue(all(not name.startswith("klu-erp-autofill/") for name in names))

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

    def test_embedded_checksums_match_packaged_files(self) -> None:
        with self.build_archive() as archive:
            names = set(archive.namelist())
            checksum_text = archive.read("CHECKSUMS.sha256").decode("utf-8")
            checked = set()
            for line in checksum_text.splitlines():
                digest, relative = line.split("  ", 1)
                self.assertIn(relative, names)
                self.assertNotEqual(relative, "CHECKSUMS.sha256")
                self.assertEqual(
                    hashlib.sha256(archive.read(relative)).hexdigest(), digest,
                    "Checksum mismatch: " + relative,
                )
                checked.add(relative)
            self.assertEqual(checked, names - {"CHECKSUMS.sha256"})

    def test_zip_sidecar_matches_archive(self) -> None:
        with self.build_archive():
            sidecar = self.output.with_name(self.output.name + ".sha256")
            digest, name = sidecar.read_text(encoding="utf-8").split()
            self.assertEqual(name, self.output.name)
            self.assertEqual(hashlib.sha256(self.output.read_bytes()).hexdigest(), digest)


    def test_missing_allowlisted_file_raises_error(self) -> None:
        temp_root = Path(self.temp_dir.name) / "mock_root"
        temp_root.mkdir(parents=True, exist_ok=True)
        test_packager = temp_root / "test_packager.py"

        packager_content = PACKAGER.read_text()
        packager_content = packager_content.replace(
            'ROOT = Path(__file__).resolve().parents[1]',
            f'ROOT = Path("{temp_root.as_posix()}")'
        ).replace(
            'RELEASE_FILES = (',
            'RELEASE_FILES = ("non_existent_file.txt", '
        )
        test_packager.write_text(packager_content)

        result = subprocess.run(
            [sys.executable, str(test_packager), "--output", str(self.output)],
            cwd=temp_root,
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Required release file is missing", result.stderr)
        self.assertFalse(self.output.exists())
        self.assertFalse(self.output.with_suffix('.tmp').exists())

    def test_symlinked_allowlisted_file_raises_error(self) -> None:
        temp_root = Path(self.temp_dir.name) / "mock_root"
        temp_root.mkdir(parents=True, exist_ok=True)
        test_packager = temp_root / "test_packager.py"

        symlink_path = temp_root / "test_symlink.txt"
        target_path = temp_root / "test_target.txt"
        target_path.write_text("dummy")
        symlink_path.symlink_to(target_path)

        packager_content = PACKAGER.read_text()
        packager_content = packager_content.replace(
            'ROOT = Path(__file__).resolve().parents[1]',
            f'ROOT = Path("{temp_root.as_posix()}")'
        ).replace(
            'RELEASE_FILES = (',
            'RELEASE_FILES = ("test_symlink.txt", '
        )
        test_packager.write_text(packager_content)

        result = subprocess.run(
            [sys.executable, str(test_packager), "--output", str(self.output)],
            cwd=temp_root,
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing to package symlink", result.stderr)
        self.assertFalse(self.output.exists())

    def test_output_collision_with_source_file_fails_safely(self) -> None:
        source_file = ROOT / "content.js"

        result = subprocess.run(
            [sys.executable, str(PACKAGER), "--output", str(source_file)],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing to write output inside source directory outside of dist/", result.stderr)

    def test_archive_is_byte_for_byte_deterministic(self) -> None:
        first_result = subprocess.run(
            [sys.executable, str(PACKAGER), "--output", str(self.output)],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(first_result.returncode, 0, first_result.stderr + first_result.stdout)

        second_output = Path(self.temp_dir.name) / "second.zip"
        second_result = subprocess.run(
            [sys.executable, str(PACKAGER), "--output", str(second_output)],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(second_result.returncode, 0, second_result.stderr + second_result.stdout)
        self.assertEqual(
            self.output.read_bytes(),
            second_output.read_bytes(),
            "Rebuilding the same source tree should produce identical ZIP bytes",
        )


if __name__ == "__main__":
    unittest.main()
