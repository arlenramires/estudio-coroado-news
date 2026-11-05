#!/usr/bin/env python3
"""Confere arquivos extraidos do pacote privado sem enviar dados pela rede."""
from pathlib import Path
import hashlib
import sys

root = Path(__file__).resolve().parent
manifest = root / "SHA256SUMS.txt"
if not manifest.is_file():
    sys.exit("ERRO: SHA256SUMS.txt ausente. Extraia o ZIP completo.")
required = {
    "index.html", "manifest.webmanifest", "sw.js",
    "icons/studio.svg", "icons/studio-192.png", "icons/studio-512.png",
    "Estudio_Coroado_Offline.html", "Iniciar-PC-Windows.cmd",
    "Iniciar-Android-Termux.sh", "LEIA-ME-PRIMEIRO.txt",
    "Verificar-integridade.py",
}
required.update("molduras/original_{:02d}.webp".format(i) for i in range(1, 23))
seen = set()
count = 0
for line in manifest.read_text(encoding="utf-8").splitlines():
    if len(line) < 67 or line[64:66] != "  ":
        sys.exit("ERRO: linha invalida no manifesto de integridade.")
    expected, name = line[:64], line[66:]
    if len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected):
        sys.exit("ERRO: hash invalido no manifesto.")
    rel = Path(name)
    if not name or rel.is_absolute() or ".." in rel.parts or name in seen:
        sys.exit("ERRO: caminho inseguro ou duplicado no manifesto.")
    seen.add(name)
    raw_target = root / rel
    # Recusa links simbolicos mesmo quando apontam para dentro do pacote.
    # Evita que arquivos trocados por links passem na verificacao.
    if any(part.is_symlink() for part in [raw_target, *raw_target.parents] if part != root.parent):
        sys.exit("ERRO: link simbolico nao permitido: " + name)
    target = raw_target.resolve()
    try:
        target.relative_to(root)
    except ValueError:
        sys.exit("ERRO: caminho fora do pacote: " + name)
    if not target.is_file():
        sys.exit("ERRO: arquivo ausente: " + name)
    digest = hashlib.sha256()
    with target.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != expected:
        sys.exit("ERRO: arquivo alterado ou corrompido: " + name)
    count += 1
missing = required - seen
if missing:
    sys.exit("ERRO: arquivos obrigatorios ausentes do manifesto: " + ", ".join(sorted(missing)))
# Rejeita arquivos adicionais sem checksum (inclusive em subpastas).
actual_files = set()
for p in root.rglob("*"):
    if p.is_symlink():
        sys.exit("ERRO: link simbolico nao permitido: " + str(p.relative_to(root)))
    if p.is_file() and p.name != "SHA256SUMS.txt":
        actual_files.add(p.relative_to(root).as_posix())
unlisted = actual_files - seen
if unlisted:
    sys.exit("ERRO: arquivos sem checksum: " + ", ".join(sorted(unlisted)))
if count < len(required):
    sys.exit("ERRO: manifesto incompleto (" + str(count) + " arquivos).")
print("OK: integridade verificada em", count, "arquivos do pacote.")
