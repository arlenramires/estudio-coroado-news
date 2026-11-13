#!/usr/bin/env python3
"""Regression tests for the private package integrity verifier (no network)."""
from pathlib import Path
import hashlib
import os
import subprocess
import sys
import tempfile

SOURCE = Path(__file__).with_name("verify-package-integrity.py")
REQUIRED = {
    "index.html", "manifest.webmanifest", "sw.js",
    "icons/studio.svg", "icons/studio-192.png", "icons/studio-512.png",
    "Estudio_Coroado_Offline.html", "Iniciar-PC-Windows.cmd",
    "Iniciar-Android-Termux.sh", "LEIA-ME-PRIMEIRO.txt",
    "Verificar-integridade.py",
}
REQUIRED.update(f"molduras/original_{i:02d}.webp" for i in range(1, 23))


def manifest_for(root):
    lines = []
    for name in sorted(REQUIRED):
        data = (root / name).read_bytes()
        lines.append(f"{hashlib.sha256(data).hexdigest()}  {name}")
    (root / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def check(root, expected_ok, case):
    result = subprocess.run(
        [sys.executable, str(root / "Verificar-integridade.py")],
        cwd=root, capture_output=True, text=True, timeout=20,
    )
    if (result.returncode == 0) != expected_ok:
        raise AssertionError(f"{case}: unexpected status {result.returncode}: "
                             f"{result.stdout} {result.stderr}")
    print(f"OK: {case}")


with tempfile.TemporaryDirectory(prefix="estudio-integrity-") as temporary:
    root = Path(temporary)
    for name in REQUIRED:
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"private studio fixture: " + name.encode())
    (root / "Verificar-integridade.py").write_bytes(SOURCE.read_bytes())
    manifest_for(root)
    check(root, True, "complete package")
    target = root / "molduras/original_01.webp"
    original = target.read_bytes()
    target.write_bytes(original + b"tampered")
    check(root, False, "tampered frame")
    target.write_bytes(original)
    check(root, True, "restored frame")
    extra = root / "unexpected.txt"
    extra.write_text("unlisted", encoding="utf-8")
    check(root, False, "unlisted file")
    extra.unlink()
    # A nested unlisted payload must be rejected too, not just root files.
    nested = root / "molduras" / "payload.txt"
    nested.write_text("unexpected nested file", encoding="utf-8")
    check(root, False, "unlisted nested file")
    nested.unlink()
    check(root, True, "restored after unlisted files")
    # Even a correctly hashed extra file must not expand the approved package.
    authorized_extra = root / "unexpected-approved.txt"
    authorized_extra.write_bytes(b"unexpected but checksummed")
    original_manifest_extra = (root / "SHA256SUMS.txt").read_text(encoding="utf-8")
    extra_hash = hashlib.sha256(authorized_extra.read_bytes()).hexdigest()
    (root / "SHA256SUMS.txt").write_text(
        original_manifest_extra + f"{extra_hash}  unexpected-approved.txt\n", encoding="utf-8")
    check(root, False, "unapproved file even when checksummed")
    authorized_extra.unlink()
    (root / "SHA256SUMS.txt").write_text(original_manifest_extra, encoding="utf-8")
    check(root, True, "restored after unauthorized manifest entry")
    # A FIFO must be rejected without opening it (opening could block forever).
    if hasattr(os, "mkfifo"):
        fifo = root / "molduras" / "unexpected-pipe"
        try:
            os.mkfifo(fifo)
        except OSError:
            print("SKIP: FIFO creation unavailable")
        else:
            try:
                check(root, False, "special FIFO entry")
            finally:
                fifo.unlink()
            check(root, True, "restored after FIFO removal")
    # Diretorios extras vazios tambem nao pertencem ao pacote assinado.
    empty_dir = root / "molduras" / "extra-empty"
    empty_dir.mkdir()
    check(root, False, "unexpected empty directory")
    empty_dir.rmdir()
    check(root, True, "restored after empty directory removal")
    # A required file missing on disk must fail even with a valid manifest.
    missing_file = root / "icons/studio-192.png"
    missing_bytes = missing_file.read_bytes()
    missing_file.unlink()
    check(root, False, "required file missing on disk")
    missing_file.write_bytes(missing_bytes)
    check(root, True, "restored required file")
    manifest = root / "SHA256SUMS.txt"
    original_manifest = manifest.read_text(encoding="utf-8")
    manifest.write_text(original_manifest.replace("molduras/original_01.webp",
                                                  "../original_01.webp"), encoding="utf-8")
    check(root, False, "path traversal")
    manifest.write_text(original_manifest, encoding="utf-8")
    check(root, True, "restored manifest")
    # A checksum list must not silently omit any of the 22 required frames.
    missing_line = next(line for line in original_manifest.splitlines()
                        if line.endswith("  molduras/original_22.webp"))
    manifest.write_text(original_manifest.replace(missing_line + "\n", ""),
                        encoding="utf-8")
    check(root, False, "missing required frame in manifest")
    manifest.write_text(original_manifest, encoding="utf-8")
    # A duplicate entry must fail even when both hashes are valid.
    manifest.write_text(original_manifest + missing_line + "\n", encoding="utf-8")
    check(root, False, "duplicate checksum entry")
    manifest.write_text(original_manifest, encoding="utf-8")
    # Corrupted checksum text must fail before accepting the package.
    manifest.write_text("z" + original_manifest[1:], encoding="utf-8")
    check(root, False, "invalid checksum syntax")
    manifest.write_text(original_manifest, encoding="utf-8")
    check(root, True, "restored manifest after negative cases")
    # The manifest itself must not be replaced with a symlink, even when
    # the target contains otherwise valid checksums.
    outside_manifest = root.parent / (root.name + "-external-manifest.txt")
    try:
        outside_manifest.write_text(original_manifest, encoding="utf-8")
        manifest.unlink()
        manifest.symlink_to(outside_manifest)
    except (OSError, NotImplementedError):
        print("SKIP: manifest symlinks unavailable on this platform")
    else:
        check(root, False, "symlinked checksum manifest")
    finally:
        if manifest.is_symlink():
            manifest.unlink()
        manifest.write_text(original_manifest, encoding="utf-8")
        outside_manifest.unlink(missing_ok=True)
    check(root, True, "restored after manifest symlink")
    try:
        target.unlink()
        target.symlink_to(root / "molduras/original_02.webp")
    except (OSError, NotImplementedError):
        print("SKIP: symlinks unavailable on this platform")
    else:
        check(root, False, "symlinked frame")
    finally:
        # Restore the fixture even if the negative assertion fails.
        if target.is_symlink():
            target.unlink()
        target.write_bytes(original)
    check(root, True, "restored after symlinked frame")
    # Um link simbolico em diretorio obrigatorio nao pode contornar a verificacao.
    icons_dir = root / "icons"
    icons_backup = root / "icons-original"
    try:
        icons_dir.rename(icons_backup)
        icons_dir.symlink_to(icons_backup, target_is_directory=True)
    except (OSError, NotImplementedError):
        print("SKIP: directory symlinks unavailable on this platform")
    else:
        check(root, False, "symlinked required directory")
    finally:
        if icons_dir.is_symlink():
            icons_dir.unlink()
        if icons_backup.exists():
            icons_backup.rename(icons_dir)
    check(root, True, "restored after directory symlink")

    # Links adicionais tambem devem ser recusados, mesmo apontando para arquivo valido.
    unexpected_link = root / "molduras" / "unexpected-link.webp"
    try:
        unexpected_link.symlink_to(target)
    except (OSError, NotImplementedError):
        print("SKIP: extra symlinks unavailable on this platform")
    else:
        try:
            check(root, False, "unexpected symlink")
        finally:
            unexpected_link.unlink()
    check(root, True, "restored after unexpected symlink")
print("Private package integrity regression tests passed.")
