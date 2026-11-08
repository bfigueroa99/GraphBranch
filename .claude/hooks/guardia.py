#!/usr/bin/env python3
"""Guardia del loop: hook PreToolUse que frena lo que ningún loop debe hacer a mano.

Copia vendorizada: la misma en cada proyecto del dueño. Lo propio de cada repo va en
`guardia.json`, al lado de este archivo; el código no se edita por proyecto.

Por qué existe: en todos los loops, «nunca push --force», «nunca master» y «nunca
--no-verify» vivían solo en prosa. La idea es de ECC (`block-no-verify`,
`config-protection`, los guardarraíles de `/harness-audit`): una regla que el agente
puede olvidar se pone donde no puede olvidarla. Los scripts del loop siguen libres: el
hook ve el comando que el agente escribe en la herramienta Bash, no lo que corre un
script por dentro, así que un `loop_publish.sh` que empuja a `dev` no cambia.

Qué frena (sale 2 y el motivo llega al agente por stderr):
  1. `git push` forzado: `--force`, `-f` (también en grupo, `-uf`), `+refspec` y
     `--mirror`. `--force-with-lease` pasa, salvo hacia una rama protegida.
  2. `git push` hacia una rama protegida (`master` y `main` siempre, más las de
     `guardia.json`), también borrarla, `--all`/`--branches`, o un `git push` sin
     refspec parado en una rama protegida.
  3. Saltarse los hooks de git: `--no-verify`, `git commit -n`, `-c core.hooksPath=…`
     y `git config core.hooksPath …`.
  4. `rm -r` sobre `/`, `~`, `$HOME` o un `.git`.
  5. Escribir en una rama protegida con el MCP de GitHub (`push_files`,
     `create_or_update_file`, `delete_file`).

`guardia.json` admite:
  - `ramas_protegidas`: ramas que se suman a `master` y `main`;
  - `solo_en_la_nube`: con `true`, la guardia solo actúa en sesiones en la nube
    (`CLAUDE_CODE_REMOTE=true`), donde corre el loop. Sirve en un repo donde la persona
    trabaja a mano sobre `main` (minipc-setup) y solo el loop tiene prohibido tocarla.

Cada bloqueo se anota en `.git/guardia.log` (JSONL, fuera del árbol versionado) para
que el loop pueda contar cuántas veces lo frenó la guardia.

Uso:
  python3 guardia.py            # como hook: lee el JSON de la herramienta por stdin
  python3 guardia.py --probar   # corre los casos embebidos; sale 0 si todos pasan
"""
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys

VERSION = "2"
SIEMPRE_PROTEGIDAS = ("master", "main")
ENVOLTORIOS = {"sudo", "env", "command", "exec", "nice", "nohup", "time", "stdbuf", "ionice"}
CONCHAS = {"bash", "sh", "zsh", "dash"}
OPERADORES = {"&&", "||", ";", "|", "&", "(", ")", ";;", "|&"}
MCP_ESCRITURA = (
    "mcp__github__push_files",
    "mcp__github__create_or_update_file",
    "mcp__github__delete_file",
)


def cargar_config(directorio: str) -> dict:
    """Lee `guardia.json` junto al script. Un JSON roto no apaga la guardia: se avisa."""
    ruta = os.path.join(directorio, "guardia.json")
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as e:
        print(f"guardia: no pude leer {ruta} ({e}); sigo con lo mínimo", file=sys.stderr)
        return {}
    return datos if isinstance(datos, dict) else {}


def protegidas(config: dict) -> set[str]:
    extra = config.get("ramas_protegidas") or []
    return set(SIEMPRE_PROTEGIDAS) | {str(r) for r in extra if isinstance(r, str)}


def rama_actual(cwd: str) -> str | None:
    forzada = os.environ.get("GUARDIA_RAMA_ACTUAL")
    if forzada is not None:
        return forzada or None
    try:
        r = subprocess.run(
            ["git", "-C", cwd or ".", "symbolic-ref", "--short", "-q", "HEAD"],
            capture_output=True, text=True, timeout=3,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout.strip() or None


def tokens(comando: str) -> list[str] | None:
    """Parte el comando en tokens con los operadores aparte. None si no se puede."""
    lex = shlex.shlex(comando.replace("\r", "").replace("\n", " ; "), posix=True,
                      punctuation_chars=True)
    lex.whitespace_split = True
    lex.commenters = ""
    try:
        return list(lex)
    except ValueError:
        return None


def segmentos(toks: list[str]) -> list[list[str]]:
    out, actual = [], []
    for t in toks:
        if t in OPERADORES or (t and set(t) <= set("&|;()")):
            if actual:
                out.append(actual)
            actual = []
        else:
            actual.append(t)
    if actual:
        out.append(actual)
    return out


def quitar_envoltorios(seg: list[str]) -> list[str]:
    i = 0
    while i < len(seg):
        t = seg[i]
        base = os.path.basename(t)
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", t):
            i += 1
        elif base in ENVOLTORIOS:
            i += 1
            while i < len(seg) and seg[i].startswith("-"):
                i += 1
        elif base == "timeout":
            i += 1
            while i < len(seg) and seg[i].startswith("-"):
                i += 1
            i += 1  # la duración
        else:
            break
    return seg[i:]


def destino(refspec: str, actual: str | None) -> tuple[str | None, bool]:
    """Devuelve (rama destino, borra) de un refspec de push."""
    ref = refspec.lstrip("+")
    if ":" in ref:
        src, dst = ref.split(":", 1)
        borra = src == ""
    else:
        dst, borra = ref, False
    dst = dst.removeprefix("refs/heads/")
    if dst in ("HEAD", "@"):
        dst = actual or ""
    return (dst or None), borra


def revisar_push(args: list[str], cwd: str, prot: set[str]) -> str | None:
    con_valor = {"--repo", "-o", "--push-option", "--receive-pack", "--exec"}
    pos, borrar, lease = [], False, False
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--":
            pos.extend(args[i + 1:])
            break
        if a in con_valor:
            i += 2
            continue
        if a.startswith("--"):
            nombre = a.split("=", 1)[0]
            if nombre in ("--force", "--mirror"):
                return f"`git push {nombre}` reescribe historia ajena; usa --force-with-lease sobre tu rama"
            if nombre in ("--all", "--branches"):
                return f"`git push {nombre}` empuja también las ramas protegidas ({', '.join(sorted(prot))})"
            if nombre == "--no-verify":
                return "`--no-verify` se salta los hooks de git; arregla lo que el hook frena"
            if nombre == "--delete":
                borrar = True
            if nombre == "--force-with-lease":
                lease = True
        elif a.startswith("-") and len(a) > 1:
            letras = a[1:]
            if "f" in letras:
                return "`git push -f` reescribe historia ajena; usa --force-with-lease sobre tu rama"
            if "d" in letras:
                borrar = True
        else:
            pos.append(a)
        i += 1
    refspecs = pos[1:]
    actual = rama_actual(cwd)
    if any(r.startswith("+") for r in refspecs):
        return "un refspec con `+` es un push forzado; usa --force-with-lease sobre tu rama"
    if not refspecs:
        if actual in prot:
            return (f"`git push` sin refspec parado en `{actual}`, que es protegida: "
                    "trabaja en tu rama y publica como dice el protocolo")
        return None
    for r in refspecs:
        dst, borra = destino(r, actual)
        if dst in prot:
            if borrar or borra:
                return f"borrar la rama protegida `{dst}` no lo hace el loop"
            if lease:
                return f"push forzado (lease) hacia la rama protegida `{dst}`"
            return (f"push directo a `{dst}`, que es protegida en este repo: "
                    "publica por el camino del protocolo (PR o script de publicación)")
    return None


def commit_sin_hooks(args: list[str]) -> bool:
    con_valor = set("mFCctS")
    for a in args:
        if a == "--":
            return False
        if a == "--no-verify":
            return True
        if a.startswith("-") and not a.startswith("--") and len(a) > 1:
            for c in a[1:]:
                if c == "n":
                    return True
                if c in con_valor:
                    break
    return False


def revisar_git(seg: list[str], cwd: str, prot: set[str]) -> str | None:
    i = 1
    while i < len(seg):
        a = seg[i]
        if a == "-C" and i + 1 < len(seg):
            cwd = os.path.join(cwd, os.path.expanduser(seg[i + 1]))
            i += 2
        elif a == "-c" and i + 1 < len(seg):
            if seg[i + 1].lower().startswith("core.hookspath"):
                return "`-c core.hooksPath` apaga los hooks de git"
            i += 2
        elif a.startswith("--git-dir") or a.startswith("--work-tree") or a.startswith("--namespace"):
            i += 1 if "=" in a else 2
        elif a.startswith("-"):
            i += 1
        else:
            break
    if i >= len(seg):
        return None
    sub, args = seg[i], seg[i + 1:]
    if sub == "push":
        return revisar_push(args, cwd, prot)
    if sub == "commit" and commit_sin_hooks(args):
        return "`git commit --no-verify`/`-n` se salta los hooks; arregla lo que frenan"
    if sub in ("merge", "rebase", "am", "cherry-pick", "revert") and "--no-verify" in args:
        return f"`git {sub} --no-verify` se salta los hooks de git"
    if sub == "config" and any(a.lower() == "core.hookspath" for a in args):
        return "cambiar `core.hooksPath` apaga los hooks de git"
    return None


def revisar_rm(seg: list[str]) -> str | None:
    banderas = "".join(a[1:] for a in seg[1:] if a.startswith("-") and not a.startswith("--"))
    recursivo = "r" in banderas.lower() or "--recursive" in seg
    if not recursivo:
        return None
    home = os.path.expanduser("~")
    for a in seg[1:]:
        if a.startswith("-"):
            continue
        limpio = a.rstrip("/") or "/"
        if limpio in ("/", "/*", "~", "$HOME", "${HOME}", home, "*") or limpio.endswith("/.git") \
                or limpio == ".git":
            return f"`rm -r {a}` borra algo que no se recupera"
    return None


def revisar_comando(comando: str, cwd: str, prot: set[str], profundidad: int = 0) -> str | None:
    if profundidad > 3:
        return None
    toks = tokens(comando)
    if toks is None:
        # Comillas desbalanceadas: bash tampoco lo correría. Un repaso grueso igual.
        if re.search(r"--no-verify|\bpush\b[^\n]*\s(-f|--force)(\s|$)", comando):
            return "comando con comillas rotas que parece saltarse una regla de la guardia"
        return None
    for seg in segmentos(toks):
        seg = quitar_envoltorios(seg)
        if not seg:
            continue
        cmd = os.path.basename(seg[0])
        if cmd == "cd" and len(seg) > 1:
            cwd = os.path.join(cwd, os.path.expanduser(seg[1]))
            continue
        if cmd in CONCHAS and "-c" in seg[1:]:
            j = seg.index("-c")
            if j + 1 < len(seg):
                motivo = revisar_comando(seg[j + 1], cwd, prot, profundidad + 1)
                if motivo:
                    return motivo
            continue
        if cmd == "eval":
            motivo = revisar_comando(" ".join(seg[1:]), cwd, prot, profundidad + 1)
            if motivo:
                return motivo
            continue
        if cmd == "git":
            motivo = revisar_git(seg, cwd, prot)
        elif cmd == "rm":
            motivo = revisar_rm(seg)
        else:
            motivo = None
        if motivo:
            return motivo
    return None


def en_la_nube() -> bool:
    return os.environ.get("CLAUDE_CODE_REMOTE", "").lower() == "true"


def revisar(evento: dict, config: dict) -> str | None:
    if config.get("solo_en_la_nube") and not en_la_nube():
        return None
    prot = protegidas(config)
    herramienta = evento.get("tool_name") or ""
    entrada = evento.get("tool_input") or {}
    if not isinstance(entrada, dict):
        return None
    if herramienta == "Bash":
        return revisar_comando(str(entrada.get("command") or ""), evento.get("cwd") or os.getcwd(), prot)
    if herramienta in MCP_ESCRITURA:
        rama = str(entrada.get("branch") or "")
        if rama.removeprefix("refs/heads/") in prot:
            return f"escribir con el MCP de GitHub directo en `{rama}`, que es protegida"
    return None


def anotar(evento: dict, motivo: str) -> None:
    raiz = os.environ.get("CLAUDE_PROJECT_DIR") or evento.get("cwd") or ""
    ruta = os.path.join(raiz, ".git", "guardia.log")
    if not raiz or not os.path.isdir(os.path.dirname(ruta)):
        return
    linea = {"herramienta": evento.get("tool_name"), "motivo": motivo,
             "sesion": evento.get("session_id")}
    try:
        with open(ruta, "a", encoding="utf-8") as f:
            f.write(json.dumps(linea, ensure_ascii=False) + "\n")
    except OSError:
        pass


CASOS = [
    # (comando, rama actual, ramas extra protegidas, ¿bloquea?)
    ("git status", "loop/12", [], False),
    ("git push -u origin loop/12", "loop/12", [], False),
    ("git push origin HEAD:refs/heads/loop/12", "loop/12", [], False),
    ("git push --force-with-lease origin loop/12", "loop/12", [], False),
    ("git push --force origin loop/12", "loop/12", [], True),
    ("git push -f origin loop/12", "loop/12", [], True),
    ("git push -uf origin loop/12", "loop/12", [], True),
    ("git push origin +loop/12", "loop/12", [], True),
    ("git push origin master", "loop/12", [], True),
    ("git push origin HEAD:main", "loop/12", [], True),
    ("git push origin dev:refs/heads/master", "dev", [], True),
    ("git push origin dev", "loop/12", [], False),
    ("git push origin dev", "loop/12", ["dev"], True),
    ("git push origin HEAD", "dev", ["dev"], True),
    ("git push", "master", [], True),
    ("git push", "loop/12", [], False),
    ("git push --all origin", "loop/12", [], True),
    ("git push origin --delete master", "loop/12", [], True),
    ("git push origin :main", "loop/12", [], True),
    ("git push origin --delete loop/3", "loop/12", [], False),
    ("git push --force-with-lease origin dev", "loop/12", ["dev"], True),
    ("git push --no-verify origin loop/12", "loop/12", [], True),
    ("git commit -m 'arreglo'", "loop/12", [], False),
    ("git commit -am 'no -n aquí'", "loop/12", [], False),
    ("git commit -nm 'salta'", "loop/12", [], True),
    ("git commit --no-verify -m x", "loop/12", [], True),
    ("git -c core.hooksPath=/dev/null commit -m x", "loop/12", [], True),
    ("git config core.hooksPath .nada", "loop/12", [], True),
    ("git -C ../otro push origin master", "loop/12", [], True),
    ("cd repo && git push -f", "loop/12", [], True),
    ("FOO=1 timeout 60 git push origin main", "loop/12", [], True),
    ("bash -c 'git push --force origin x'", "loop/12", [], True),
    ("echo 'git push --force' > nota.txt", "loop/12", [], False),
    ("git log --oneline | head -5; git push origin loop/12", "loop/12", [], False),
    ("git status\ngit push origin master", "loop/12", [], True),
    ("rm -rf /", "loop/12", [], True),
    ("rm -rf ~", "loop/12", [], True),
    ("rm -rf .git", "loop/12", [], True),
    ("rm -rf node_modules build", "loop/12", [], False),
    ("rm -f .git/index.lock", "loop/12", [], False),
    ("sudo rm -rf /", "loop/12", [], True),
]

CASOS_MCP = [
    ({"tool_name": "mcp__github__push_files", "tool_input": {"branch": "master"}}, [], True),
    ({"tool_name": "mcp__github__create_or_update_file", "tool_input": {"branch": "loop/9"}}, [], False),
    ({"tool_name": "mcp__github__delete_file", "tool_input": {"branch": "dev"}}, ["dev"], True),
    ({"tool_name": "Read", "tool_input": {"file_path": "/etc/passwd"}}, [], False),
]


def probar() -> int:
    fallas = 0
    for comando, rama, extra, bloquea in CASOS:
        os.environ["GUARDIA_RAMA_ACTUAL"] = rama
        evento = {"tool_name": "Bash", "tool_input": {"command": comando}, "cwd": "."}
        motivo = revisar(evento, {"ramas_protegidas": extra})
        if bool(motivo) != bloquea:
            fallas += 1
            print(f"FALLA: {comando!r} (rama {rama}, extra {extra}) → "
                  f"{'bloquea' if motivo else 'deja pasar'}; se esperaba "
                  f"{'bloquear' if bloquea else 'dejar pasar'}")
    for evento, extra, bloquea in CASOS_MCP:
        motivo = revisar(evento, {"ramas_protegidas": extra})
        if bool(motivo) != bloquea:
            fallas += 1
            print(f"FALLA MCP: {evento} → {'bloquea' if motivo else 'deja pasar'}")
    remoto = os.environ.get("CLAUDE_CODE_REMOTE")
    evento = {"tool_name": "Bash", "tool_input": {"command": "git push origin main"}, "cwd": "."}
    for valor, bloquea in (("true", True), ("", False)):
        os.environ["CLAUDE_CODE_REMOTE"] = valor
        if bool(revisar(evento, {"solo_en_la_nube": True})) != bloquea:
            fallas += 1
            print(f"FALLA solo_en_la_nube con CLAUDE_CODE_REMOTE={valor!r}")
    if remoto is None:
        os.environ.pop("CLAUDE_CODE_REMOTE", None)
    else:
        os.environ["CLAUDE_CODE_REMOTE"] = remoto
    os.environ.pop("GUARDIA_RAMA_ACTUAL", None)
    total = len(CASOS) + len(CASOS_MCP) + 2
    print(f"guardia v{VERSION}: {total - fallas}/{total} casos bien")
    return 1 if fallas else 0


def main(argv: list[str]) -> int:
    if "--probar" in argv:
        return probar()
    try:
        evento = json.load(sys.stdin)
    except ValueError:
        return 0  # sin JSON no hay nada que revisar; la guardia no rompe la sesión
    if not isinstance(evento, dict):
        return 0
    config = cargar_config(os.path.dirname(os.path.abspath(__file__)))
    motivo = revisar(evento, config)
    if not motivo:
        return 0
    anotar(evento, motivo)
    print(f"guardia del loop: bloqueado — {motivo}. Si de verdad hace falta, lo hace una "
          "persona; el loop sigue por el camino de su protocolo.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
