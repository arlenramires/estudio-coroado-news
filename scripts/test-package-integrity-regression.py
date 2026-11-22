#!/usr/bin/env python3
"""Regressões do verificador do pacote privado, sem alterar arquivos reais."""
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
VERIFIER = (ROOT / "scripts/verify-package-integrity.py").read_bytes()
REQUIRED = [
    "index.html", "manifest.webmanifest", "sw.js",
    "icons/studio.svg", "icons/studio-192.png", "icons/studio-512.png",
    "Estudio_Coroado_Offline.html", "Iniciar-PC-Windows.cmd",
    "Iniciar-Android-Termux.sh", "LEIA-ME-PRIMEIRO.txt",
    "Verificar-integridade.py", "Converter-MP4-Windows.cmd",
    "scripts/converter-mp4.mjs",
    *(f"molduras/original_{i:02d}.webp" for i in range(1, 23)),
]

def run(root):
    return subprocess.run(
        [sys.executable, str(root / "Verificar-integridade.py")],
        cwd=root, text=True, capture_output=True, timeout=15,
    )

with tempfile.TemporaryDirectory(prefix="coroado-integridade-") as tmp:
    root = Path(tmp)
    for name in REQUIRED:
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(VERIFIER if name == "Verificar-integridade.py" else b"teste local\n")
    def manifest():
        lines = []
        for name in REQUIRED:
            digest = hashlib.sha256((root / name).read_bytes()).hexdigest()
            lines.append(f"{digest}  {name}")
        (root / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    manifest()
    assert run(root).returncode == 0, "Pacote válido rejeitado"
    target = root / "index.html"
    target.write_bytes(b"conteudo adulterado")
    assert run(root).returncode != 0, "Arquivo adulterado foi aceito"
    target.write_bytes(b"teste local\n")
    manifest()
    extra = root / "arquivo-sem-hash.txt"
    extra.write_text("extra", encoding="utf-8")
    assert run(root).returncode != 0, "Arquivo extra sem hash foi aceito"
    extra.unlink()
    manifest()
    (root / "SHA256SUMS.txt").write_text(
        (root / "SHA256SUMS.txt").read_text(encoding="utf-8")
        + "0" * 64 + "  ../escape\n", encoding="utf-8"
    )
    assert run(root).returncode != 0, "Travessia de diretórios foi aceita"
print("OK: pacote válido, adulteração, arquivo extra e path traversal testados.")
