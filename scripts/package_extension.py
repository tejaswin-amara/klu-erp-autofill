#!/usr/bin/env python3
"""Build a reproducible, allowlisted extension ZIP and checksum manifests."""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path, PurePosixPath
import sys
import tempfile
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


def _is_within(path: Path, directory: Path) -> bool:
    try:
        path.relative_to(directory)
        return True
    except ValueError:
        return False


def _reject_symlink_components(path: Path) -> None:
    """Reject symlinks in an absolute path, including dangling symlinks."""
    absolute = Path(os.path.abspath(path))
    current = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        current = current / part
        if current.is_symlink():
            raise ValueError(f"Refusing symlink path component: {current}")


def load_release_files(
    root: Path = ROOT, release_files: tuple[str, ...] = RELEASE_FILES
) -> dict[str, bytes]:
    root = Path(root).resolve(strict=True)
    files: dict[str, bytes] = {}
    for relative in release_files:
        rel = PurePosixPath(relative)
        if "\\" in relative or rel.is_absolute() or not rel.parts or any(part in ("", ".", "..") for part in rel.parts):
            raise ValueError(f"Unsafe release path: {relative}")

        path = root.joinpath(*rel.parts)
        _reject_symlink_components(path)
        try:
            resolved = path.resolve(strict=True)
        except FileNotFoundError as exc:
            raise FileNotFoundError(f"Required release file is missing: {relative}") from exc
        if not _is_within(resolved, root):
            raise ValueError(f"Release path escapes repository root: {relative}")
        if not resolved.is_file():
            raise FileNotFoundError(f"Required release file is missing: {relative}")
        files[relative] = resolved.read_bytes()
    return files


def _new_temp_file(parent: Path, prefix: str) -> tuple[int, Path]:
    descriptor, name = tempfile.mkstemp(prefix=prefix, suffix=".tmp", dir=parent)
    return descriptor, Path(name)


def _verify_archive(archive_path: Path, expected_entries: dict[str, bytes]) -> None:
    with zipfile.ZipFile(archive_path, "r") as archive:
        bad_member = archive.testzip()
        if bad_member is not None:
            raise zipfile.BadZipFile(f"Corrupt archive member: {bad_member}")
        if set(archive.namelist()) != set(expected_entries):
            raise zipfile.BadZipFile("Archive entries do not match the release allowlist")
        for name, expected in expected_entries.items():
            if archive.read(name) != expected:
                raise zipfile.BadZipFile(f"Archive content mismatch: {name}")


def _restore_file(path: Path, previous: bytes | None, parent: Path) -> None:
    if previous is None:
        path.unlink(missing_ok=True)
        return
    descriptor, backup = _new_temp_file(parent, f".{path.name}.rollback-")
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(previous)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(backup, path)
    finally:
        backup.unlink(missing_ok=True)


def create_archive(
    output: Path,
    root: Path = ROOT,
    release_files: tuple[str, ...] = RELEASE_FILES,
) -> str:
    root = Path(root).resolve(strict=True)
    output = Path(output).expanduser()
    if not output.is_absolute():
        output = Path.cwd() / output
    output = Path(os.path.abspath(output))
    sidecar = output.with_name(output.name + ".sha256")

    # Validate lexical containment before creating any directories. This avoids
    # leaving rejected paths such as repo/dist-backup behind as a side effect.
    if _is_within(output, root) and not _is_within(output, root / "dist"):
        raise ValueError("Refusing to write output inside repository outside dist/")
    if _is_within(sidecar, root) and not _is_within(sidecar, root / "dist"):
        raise ValueError("Refusing to write checksum inside repository outside dist/")

    _reject_symlink_components(output.parent)
    output.parent.mkdir(parents=True, exist_ok=True)
    _reject_symlink_components(output.parent)
    if output.is_symlink():
        raise ValueError("Refusing symlink output file")
    if output.exists() and not output.is_file():
        raise ValueError("Output path exists but is not a regular file")
    if sidecar.is_symlink():
        raise ValueError("Refusing symlink checksum sidecar")
    if sidecar.exists() and not sidecar.is_file():
        raise ValueError("Checksum sidecar path exists but is not a regular file")

    lock_path = output.with_name(f".{output.name}.lock")
    try:
        lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise RuntimeError(f"Another packaging operation holds the lock: {lock_path}") from exc

    staged_archive: Path | None = None
    staged_sidecar: Path | None = None
    published_archive = False
    try:
        with os.fdopen(lock_fd, "w", encoding="utf-8") as lock_stream:
            lock_stream.write(f"pid={os.getpid()}\n")
            lock_stream.flush()

        files = load_release_files(root, release_files)
        checksums = "".join(
            f"{sha256(files[name])}  {name}\n" for name in sorted(files)
        ).encode("utf-8")
        entries = {**files, CHECKSUM_FILE: checksums}

        archive_fd, staged_archive = _new_temp_file(output.parent, f".{output.name}.archive-")
        os.close(archive_fd)
        with zipfile.ZipFile(staged_archive, "w") as archive:
            for name in sorted(entries):
                info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, entries[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

        _verify_archive(staged_archive, entries)
        digest = sha256(staged_archive.read_bytes())
        sidecar_bytes = f"{digest}  {output.name}\n".encode("utf-8")
        sidecar_fd, staged_sidecar = _new_temp_file(output.parent, f".{sidecar.name}.")
        with os.fdopen(sidecar_fd, "wb") as stream:
            stream.write(sidecar_bytes)
            stream.flush()
            os.fsync(stream.fileno())

        previous_archive = output.read_bytes() if output.exists() else None
        previous_sidecar = sidecar.read_bytes() if sidecar.exists() else None
        try:
            os.replace(staged_archive, output)
            staged_archive = None
            published_archive = True
            os.replace(staged_sidecar, sidecar)
            staged_sidecar = None
        except Exception as publish_error:
            rollback_errors = []
            if published_archive:
                try:
                    _restore_file(output, previous_archive, output.parent)
                except Exception as error:  # pragma: no cover - catastrophic filesystem failure
                    rollback_errors.append(f"archive rollback failed: {error}")
            try:
                _restore_file(sidecar, previous_sidecar, output.parent)
            except Exception as error:  # pragma: no cover - catastrophic filesystem failure
                rollback_errors.append(f"sidecar rollback failed: {error}")
            if rollback_errors:
                raise RuntimeError(
                    f"Artifact publication failed ({publish_error}); " + "; ".join(rollback_errors)
                ) from publish_error
            raise

        return digest
    finally:
        if staged_archive is not None:
            staged_archive.unlink(missing_ok=True)
        if staged_sidecar is not None:
            staged_sidecar.unlink(missing_ok=True)
        lock_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "dist" / "klu-erp-autofill.zip",
        help="Output ZIP path (default: dist/klu-erp-autofill.zip)",
    )
    args = parser.parse_args()
    try:
        digest = create_archive(args.output)
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile) as exc:
        print(f"Packaging failed: {exc}", file=sys.stderr)
        return 1

    output = args.output.expanduser()
    if not output.is_absolute():
        output = Path.cwd() / output
    output = Path(os.path.abspath(output))
    print(f"Created: {output}")
    print(f"SHA-256: {digest}")
    print(f"Files packaged: {len(RELEASE_FILES) + 1} (including {CHECKSUM_FILE})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
