#!/usr/bin/env python3
"""Build a reproducible, allowlisted extension ZIP with checksum manifests."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RELEASE_FILES = (
    "manifest.json",
    "content.js",
    "README.md",
    "LICENSE",
    "NOTICE",
    "THIRD_PARTY_NOTICES.md",
    "SECURITY.md",
    "SUPPORT.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    "assets/readme-banner.svg",
    "docs/PRIVACY.md",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png",
    "lib/ort.min.js",
    "lib/ort-wasm-simd.wasm",
    "model/crnn.json",
    "model/crnn.onnx",
)
CHECKSUM_FILE = "CHECKSUMS.sha256"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_release_files() -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for relative in RELEASE_FILES:
        path = ROOT / relative
        # Prevent path traversal
        try:
            resolved = path.resolve(strict=True)
            if not str(resolved).startswith(str(ROOT)):
                raise ValueError(f"Path traversal detected: {relative}")
        except FileNotFoundError:
            raise FileNotFoundError(f"Required release file is missing: {relative}")

        if path.is_symlink():
            raise ValueError(f"Refusing to package symlink: {relative}")
        if not path.is_file():
            raise FileNotFoundError(f"Required release file is missing: {relative}")
        files[relative] = path.read_bytes()
    return files


def create_archive(output: Path) -> str:
    # Ensure output doesn't overwrite source files
    if str(output.resolve()).startswith(str(ROOT.resolve())):
        # Allow placing it in ROOT/dist but not anywhere else in source
        if not str(output.resolve()).startswith(str((ROOT / "dist").resolve())):
            raise ValueError("Refusing to write output inside source directory outside of dist/")

    files = load_release_files()
    checksums = "".join(
        f"{sha256(files[name])}  {name}\n" for name in sorted(files)
    ).encode("utf-8")
    entries = {**files, CHECKSUM_FILE: checksums}

    output.parent.mkdir(parents=True, exist_ok=True)
    temp_output = output.with_name(output.name + ".tmp")
    try:
        with zipfile.ZipFile(temp_output, "w") as archive:
            for name in sorted(entries):
                info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(
                    info,
                    entries[name],
                    compress_type=zipfile.ZIP_DEFLATED,
                    compresslevel=9,
                )

        temp_output.replace(output)
    except Exception:
        if temp_output.exists():
            temp_output.unlink()
        raise

    digest = sha256(output.read_bytes())

    sidecar = output.with_name(output.name + ".sha256")
    temp_sidecar = sidecar.with_name(sidecar.name + ".tmp")
    try:
        temp_sidecar.write_text(f"{digest}  {output.name}\n", encoding="utf-8")
        temp_sidecar.replace(sidecar)
    except Exception:
        if temp_sidecar.exists():
            temp_sidecar.unlink()
        raise

    return digest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "dist" / "klu-erp-autofill.zip",
        help="Output ZIP path (default: dist/klu-erp-autofill.zip)",
    )
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    try:
        digest = create_archive(output)
    except (OSError, ValueError) as exc:
        print(f"Packaging failed: {exc}", file=sys.stderr)
        return 1

    print(f"Created: {output}")
    print(f"SHA-256: {digest}")
    print(f"Files packaged: {len(RELEASE_FILES) + 1} (including {CHECKSUM_FILE})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
