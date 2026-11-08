#!/usr/bin/env python3
"""Frontera del loop: el juez determinista de lo que una iteración NO puede hacer para pasar.

Copia vendorizada: la misma en cada proyecto del dueño; lo propio de cada repo va en
`frontera.json`, al lado de este archivo.

Por qué existe: todos los loops decían en prosa «no se borran ni se debilitan pruebas,
no se bajan umbrales, no se toca la configuración de las puertas para pasar», y ninguno
lo comprobaba sobre el diff. Es el modo de falla n.º 3 de `loop-design-check` (ECC):
una meta de «todas las pruebas en verde» sin frontera invita a borrar la prueba que
falla. La puerta del repo dice si el código está bien; la frontera dice si la puerta
sigue siendo la misma que ayer.

Mira el rango `merge-base(base, HEAD)..HEAD` (lo que se va a publicar) y marca:
  - prueba borrada: un archivo de pruebas que desaparece                     (declarable)
  - menos definiciones de prueba en los archivos tocados                     (declarable)
  - saltos añadidos en pruebas: skip, only, xfail no estricto, todo…         (declarable)
  - debilitadores añadidos en cualquier archivo: `--no-verify`,
    `pragma: no cover`, `eslint-disable`, `noqa`, `@ts-ignore`…             (declarable)
  - archivos protegidos tocados: la propia puerta, su configuración y
    la del lint                                                              (declarable)
  - umbral que se mueve en la dirección floja (cobertura, tope…)             (NO declarable)
  y avisa, sin fallar, si las aserciones netas bajan en las pruebas tocadas.

«Declarable» quiere decir que pasa si algún commit del rango trae la línea
`Frontera: <motivo>`: el cambio queda a la vista en el PR y en el log en vez de colarse.
Un umbral flojo no se declara: lo baja una persona (ECC: el loop que reescribe sus
propias reglas necesita más revisión humana, no menos).

Uso:
  python3 frontera.py [--base origin/dev] [--json]   sale 0 (ok), 1 (rota), 2 (uso)
  python3 frontera.py --validar-config              cada entrada nombra algo que existe
  python3 frontera.py --probar                      casos embebidos sobre repos temporales
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
import tempfile

VERSION = "1"
# La guardia y la frontera citan los patrones que vigilan: no se vigilan a sí mismas.
PROPIOS = {"frontera.py", "frontera.json", "guardia.py", "guardia.json"}
DECLARACION = re.compile(r"^\s*Frontera:\s*(\S.*)$", re.IGNORECASE | re.MULTILINE)
CONFIG_POR_DEFECTO = {
    "base": "origin/dev",
    "pruebas": ["tests/**", "**/tests/**", "**/test_*.py", "**/*_test.py", "**/*.test.*",
                "**/*.spec.*", "e2e/**", "**/e2e/**"],
    "definiciones": [r"^\s*(async\s+)?def\s+test_?\w*\s*\(",
                     r"^\s*(it|test|describe)(\.each\([^)]*\))?\s*\(\s*['\"`]"],
    "saltos": [r"@pytest\.mark\.skip\b", r"\bpytest\.skip\(", r"@unittest\.skip",
               r"@pytest\.mark\.xfail\b(?![^)\n]*strict\s*=\s*True)",
               r"\b(it|test|describe)\.(skip|only|todo)\s*\(", r"\b(xit|xtest|xdescribe|fit|fdescribe)\s*\("],
    # Solo las supresiones en blanco: `# noqa: E402` o `eslint-disable-line regla` nombran lo
    # que callan y se revisan como cualquier línea; `# noqa` o `/* eslint-disable */` callan todo.
    "debilitadores": [r"--no-verify", r"#\s*pragma:\s*no\s*cover",
                      r"eslint-disable(-next-line|-line)?(?!-)(?!\s+[\w@/-])",
                      r"#\s*noqa\b(?!\s*:)", r"@ts-(ignore|nocheck)", r"#\s*type:\s*ignore(?!\[)"],
    "debilitadores_excluir": ["**/*.md", "docs/**"],
    "aserciones": [r"\bassert\b", r"\bexpect\s*\(", r"self\.assert\w+\("],
    "protegidos": [],
    "umbrales": [],
    "excluir": [],
}


class ErrorDeUso(Exception):
    pass


def git(*args: str, cwd: str | None = None, ok: bool = False) -> str:
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0 and not ok:
        raise ErrorDeUso(f"git {' '.join(args)}: {r.stderr.strip() or r.returncode}")
    return r.stdout if r.returncode == 0 else ""


def cargar_config(ruta: str | None) -> dict:
    ruta = ruta or os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontera.json")
    datos = {}
    if os.path.exists(ruta):
        try:
            with open(ruta, encoding="utf-8") as f:
                datos = json.load(f)
        except ValueError as e:
            raise ErrorDeUso(f"{ruta}: JSON inválido ({e})")
    config = dict(CONFIG_POR_DEFECTO)
    for clave, valor in datos.items():
        if clave.startswith("_"):
            continue
        if clave.endswith("_extra") and clave[:-6] in config:
            config[clave[:-6]] = list(config[clave[:-6]]) + list(valor)
        else:
            config[clave] = valor
    return config


def coincide(ruta: str, patrones: list[str]) -> bool:
    for p in patrones:
        if fnmatch.fnmatchcase(ruta, p):
            return True
        if p.startswith("**/") and fnmatch.fnmatchcase(ruta, p[3:]):
            return True
    return False


def contenido(ref: str, ruta: str, cwd: str) -> str | None:
    r = subprocess.run(["git", "show", f"{ref}:{ruta}"], cwd=cwd, capture_output=True)
    if r.returncode != 0:
        return None
    return r.stdout.decode("utf-8", "replace")


def contar(texto: str | None, patrones: list[re.Pattern]) -> int:
    if not texto:
        return 0
    return sum(1 for linea in texto.splitlines() if any(p.search(linea) for p in patrones))


def lineas_del_diff(mb: str, cwd: str) -> dict[str, dict[str, list[str]]]:
    """{ruta: {"+": [añadidas], "-": [quitadas]}} del rango, sin contexto."""
    out: dict[str, dict[str, list[str]]] = {}
    actual = None
    texto = git("diff", "-U0", "--no-color", "-M", f"{mb}..HEAD", cwd=cwd)
    for linea in texto.splitlines():
        if linea.startswith("+++ "):
            ruta = linea[4:]
            actual = None if ruta == "/dev/null" else ruta.removeprefix("b/")
            if actual:
                out.setdefault(actual, {"+": [], "-": []})
        elif linea.startswith("--- "):
            ruta = linea[4:]
            if ruta != "/dev/null":
                previa = ruta.removeprefix("a/")
                out.setdefault(previa, {"+": [], "-": []})
                actual = previa
        elif actual and linea.startswith("+") and not linea.startswith("+++"):
            out[actual]["+"].append(linea[1:])
        elif actual and linea.startswith("-") and not linea.startswith("---"):
            out[actual]["-"].append(linea[1:])
    return out


def numero(texto: str | None, patron: str) -> float | None:
    if texto is None:
        return None
    m = re.search(patron, texto, re.MULTILINE)
    if not m:
        return None
    try:
        return float(m.group(1))
    except (IndexError, ValueError):
        return None


def evaluar(cwd: str, base: str, config: dict) -> dict:
    git("rev-parse", "--verify", "-q", base + "^{commit}", cwd=cwd)
    mb = git("merge-base", base, "HEAD", cwd=cwd).strip()
    if not mb:
        raise ErrorDeUso(f"sin merge-base entre {base} y HEAD")
    commits = git("log", "--format=%H", f"{mb}..HEAD", cwd=cwd).split()
    mensajes = git("log", "--format=%H%n%B%x00", f"{mb}..HEAD", cwd=cwd)
    declaraciones = []
    for bloque in mensajes.split("\x00"):
        bloque = bloque.strip()
        if not bloque:
            continue
        sha, _, cuerpo = bloque.partition("\n")
        for m in DECLARACION.finditer(cuerpo):
            declaraciones.append({"commit": sha[:10], "motivo": m.group(1).strip()})

    pruebas, excluir = config["pruebas"], config["excluir"]
    defs = [re.compile(p) for p in config["definiciones"]]
    saltos = [re.compile(p) for p in config["saltos"]]
    debil = [re.compile(p) for p in config["debilitadores"]]
    aserc = [re.compile(p) for p in config["aserciones"]]

    violaciones, avisos = [], []

    def violar(tipo: str, detalle: str, declarable: bool = True) -> None:
        violaciones.append({"tipo": tipo, "detalle": detalle, "declarable": declarable})

    estado = git("diff", "--name-status", "-M", f"{mb}..HEAD", cwd=cwd)
    tocados = []
    for linea in estado.splitlines():
        partes = linea.split("\t")
        if len(partes) < 2:
            continue
        st = partes[0][0]
        vieja, nueva = (partes[1], partes[2]) if st in "RC" and len(partes) > 2 else (partes[1], partes[1])
        if coincide(nueva, excluir) and coincide(vieja, excluir):
            continue
        tocados.append((st, vieja, nueva))

    antes = despues = 0
    for st, vieja, nueva in tocados:
        es_prueba_vieja = coincide(vieja, pruebas)
        es_prueba_nueva = coincide(nueva, pruebas) and st != "D"
        if st == "D" and es_prueba_vieja:
            violar("prueba borrada", vieja)
        if st in "RC" and es_prueba_vieja and not coincide(nueva, pruebas):
            violar("prueba sacada del conjunto de pruebas", f"{vieja} → {nueva}")
        a = contar(contenido(mb, vieja, cwd), defs) if es_prueba_vieja and st != "A" else 0
        d = contar(contenido("HEAD", nueva, cwd), defs) if es_prueba_nueva else 0
        antes, despues = antes + a, despues + d
        if d < a:
            avisos.append(f"{nueva}: definiciones de prueba {a} → {d}")
    if despues < antes:
        violar("menos definiciones de prueba", f"{antes} → {despues} en los archivos tocados")

    diff = lineas_del_diff(mb, cwd)
    aserciones_netas = 0
    for ruta, cambios in diff.items():
        if coincide(ruta, excluir):
            continue
        es_prueba = coincide(ruta, pruebas)
        mira_debiles = not coincide(ruta, config["debilitadores_excluir"]) \
            and os.path.basename(ruta) not in PROPIOS
        for linea in cambios["+"]:
            if es_prueba and any(p.search(linea) for p in saltos):
                violar("salto añadido", f"{ruta}: {linea.strip()[:120]}")
            if mira_debiles and any(p.search(linea) for p in debil):
                violar("debilitador añadido", f"{ruta}: {linea.strip()[:120]}")
        if es_prueba:
            aserciones_netas += contar("\n".join(cambios["+"]), aserc) - contar("\n".join(cambios["-"]), aserc)
    if aserciones_netas < 0:
        avisos.append(f"aserciones netas en las pruebas tocadas: {aserciones_netas}")

    protegidos = config["protegidos"]
    for st, vieja, nueva in tocados:
        if coincide(vieja, protegidos) or coincide(nueva, protegidos):
            violar("archivo protegido tocado", nueva if vieja == nueva else f"{vieja} → {nueva}")

    for u in config["umbrales"]:
        ruta, patron = u.get("archivo", ""), u.get("patron", "")
        flojo = u.get("flojo", "baja")
        a = numero(contenido(mb, ruta, cwd), patron)
        d = numero(contenido("HEAD", ruta, cwd), patron)
        nombre = u.get("nombre") or patron
        if a is None:
            continue
        if d is None:
            violar("umbral desaparecido", f"{ruta}: {nombre} (era {a:g})", declarable=False)
        elif (flojo == "baja" and d < a) or (flojo == "sube" and d > a):
            violar("umbral más flojo", f"{ruta}: {nombre} {a:g} → {d:g}", declarable=False)

    duras = [v for v in violaciones if not v["declarable"]]
    blandas = [v for v in violaciones if v["declarable"]]
    ok = not duras and (not blandas or bool(declaraciones))
    return {"version": VERSION, "base": base, "merge_base": mb[:10], "commits": len(commits),
            "archivos": len(tocados), "violaciones": violaciones, "avisos": avisos,
            "declaraciones": declaraciones, "ok": ok}


def imprimir(r: dict) -> None:
    print(f"frontera v{r['version']}: base {r['base']} (merge-base {r['merge_base']}), "
          f"{r['commits']} commits, {r['archivos']} archivos")
    for v in r["violaciones"]:
        marca = "" if v["declarable"] else "  [no declarable: lo cambia una persona]"
        print(f"  ✗ {v['tipo']}: {v['detalle']}{marca}")
    for a in r["avisos"]:
        print(f"  ! {a}")
    for d in r["declaraciones"]:
        print(f"  ⚑ declarado en {d['commit']}: Frontera: {d['motivo']}")
    if r["ok"] and r["violaciones"]:
        print("FRONTERA OK (con cambios declarados: quedan a la vista del revisor)")
    elif r["ok"]:
        print("FRONTERA OK")
    else:
        print("FRONTERA ROTA: arregla el código en vez de la puerta, o declara el cambio con una "
              "línea `Frontera: <motivo>` en el commit si es legítimo (los umbrales, nunca)")


def validar_config(cwd: str, config: dict) -> int:
    errores = []
    archivos = git("ls-files", cwd=cwd).splitlines()
    for clave in ("definiciones", "saltos", "debilitadores", "aserciones"):
        for p in config[clave]:
            try:
                re.compile(p)
            except re.error as e:
                errores.append(f"{clave}: regex inválida {p!r} ({e})")
    for p in config["protegidos"]:
        if not any(coincide(a, [p]) for a in archivos):
            errores.append(f"protegidos: {p!r} no nombra ningún archivo del repo")
    if not any(coincide(a, config["pruebas"]) for a in archivos):
        errores.append("pruebas: ningún archivo del repo es una prueba según los patrones")
    for u in config["umbrales"]:
        ruta = u.get("archivo", "")
        texto = contenido("HEAD", ruta, cwd)
        if texto is None:
            errores.append(f"umbrales: {ruta} no existe en HEAD")
        elif numero(texto, u.get("patron", "")) is None:
            errores.append(f"umbrales: {u.get('patron')!r} no encuentra un número en {ruta}")
    for e in errores:
        print(f"  ✗ {e}")
    print("CONFIG OK" if not errores else f"CONFIG ROTA ({len(errores)})")
    return 1 if errores else 0


# --- autoprueba -----------------------------------------------------------------------------

def _escribir(raiz: str, ruta: str, texto: str) -> None:
    completa = os.path.join(raiz, ruta)
    os.makedirs(os.path.dirname(completa), exist_ok=True)
    with open(completa, "w", encoding="utf-8") as f:
        f.write(texto)


def _commit(raiz: str, mensaje: str) -> None:
    subprocess.run(["git", "add", "-A"], cwd=raiz, check=True)
    subprocess.run(["git", "-c", "user.name=prueba", "-c", "user.email=prueba@local",
                    "commit", "-q", "--allow-empty", "-m", mensaje], cwd=raiz, check=True)


PY_BASE = "def test_uno():\n    assert 1\n\n\ndef test_dos():\n    assert 2\n"
JS_BASE = "it('suma', () => { expect(1).toBe(1) })\nit('resta', () => { expect(0).toBe(0) })\n"
ESCENARIOS = [
    # (nombre, {ruta: texto | None para borrar}, mensaje, ¿ok?)
    ("prueba nueva", {"tests/test_c.py": "def test_tres():\n    assert 3\n"}, "nueva", True),
    ("código sin riesgo", {"src/app.py": "x = 2\n"}, "código", True),
    ("borra una definición", {"tests/test_a.py": "def test_uno():\n    assert 1\n"}, "poda", False),
    ("borra el archivo de pruebas", {"tests/test_a.py": None}, "fuera", False),
    ("agrega skip", {"tests/test_a.py": "import pytest\n@pytest.mark.skip\n" + PY_BASE}, "salta", False),
    ("xfail estricto pasa", {"tests/test_a.py": "import pytest\n@pytest.mark.xfail(strict=True)\n"
                             + PY_BASE}, "repro", True),
    ("it.only en JS", {"web/suma.test.js": JS_BASE.replace("it('suma'", "it.only('suma'")}, "foco", False),
    ("quita un it en JS", {"web/suma.test.js": "it('suma', () => { expect(1).toBe(1) })\n"}, "poda js", False),
    ("pragma no cover", {"src/app.py": "x = 1  # pragma: no cover\n"}, "cobertura", False),
    ("noqa en blanco", {"src/app.py": "import os  # noqa\n"}, "calla todo", False),
    ("noqa con código pasa", {"src/app.py": "import os  # noqa: F401\n"}, "calla uno", True),
    ("eslint-disable en blanco", {"web/app.js": "/* eslint-disable */\nlet x = 1\n"}, "calla js", False),
    ("eslint-disable-line con regla pasa", {"web/app.js": "let x = 1 // eslint-disable-line no-var\n"},
     "calla una", True),
    ("la prosa puede nombrar --no-verify", {"docs/LOOP.md": "Nunca uses --no-verify.\n"}, "doc", True),
    ("toca la puerta", {"puerta.sh": "#!/bin/sh\nCOV_MIN=100\necho ok\n"}, "puerta", False),
    ("toca la puerta declarado", {"puerta.sh": "#!/bin/sh\nCOV_MIN=100\necho ok\n"},
     "puerta\n\nFrontera: META, la puerta suma un paso", True),
    ("baja el umbral aun declarado", {"puerta.sh": "#!/bin/sh\nCOV_MIN=95\n"},
     "umbral\n\nFrontera: no alcanza", False),
    ("sube el umbral declarado", {"puerta.sh": "#!/bin/sh\nCOV_MIN=100\nexit 0\n"},
     "más\n\nFrontera: endurece", True),
]


def probar() -> int:
    fallas = 0
    config = {k: list(v) if isinstance(v, list) else v for k, v in CONFIG_POR_DEFECTO.items()}
    config["protegidos"] = ["puerta.sh"]
    config["umbrales"] = [{"archivo": "puerta.sh", "patron": r"COV_MIN=(\d+)", "nombre": "COV_MIN"}]
    with tempfile.TemporaryDirectory() as raiz:
        subprocess.run(["git", "init", "-q", "-b", "base", raiz], check=True)
        _escribir(raiz, "tests/test_a.py", PY_BASE)
        _escribir(raiz, "web/suma.test.js", JS_BASE)
        _escribir(raiz, "src/app.py", "x = 1\n")
        _escribir(raiz, "puerta.sh", "#!/bin/sh\nCOV_MIN=100\n")
        _commit(raiz, "base")
        if validar_config(raiz, config) != 0:
            fallas += 1
        for nombre, cambios, mensaje, esperado in ESCENARIOS:
            subprocess.run(["git", "checkout", "-q", "-B", "caso", "base"], cwd=raiz, check=True)
            for ruta, texto in cambios.items():
                if texto is None:
                    os.remove(os.path.join(raiz, ruta))
                else:
                    _escribir(raiz, ruta, texto)
            _commit(raiz, mensaje)
            r = evaluar(raiz, "base", config)
            if r["ok"] != esperado:
                fallas += 1
                print(f"FALLA: «{nombre}» dio {'ok' if r['ok'] else 'rota'}, se esperaba "
                      f"{'ok' if esperado else 'rota'}: {r['violaciones']}")
    print(f"frontera v{VERSION}: {len(ESCENARIOS) + 1 - fallas}/{len(ESCENARIOS) + 1} casos bien")
    return 1 if fallas else 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Frontera anti-Goodhart del loop")
    ap.add_argument("--base")
    ap.add_argument("--config")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--probar", action="store_true")
    ap.add_argument("--validar-config", action="store_true")
    ap.add_argument("-C", dest="cwd", default=".")
    a = ap.parse_args(argv)
    if a.probar:
        return probar()
    try:
        config = cargar_config(a.config)
        raiz = git("rev-parse", "--show-toplevel", cwd=a.cwd).strip()
        if a.validar_config:
            return validar_config(raiz, config)
        r = evaluar(raiz, a.base or config["base"], config)
    except ErrorDeUso as e:
        print(f"frontera: {e}", file=sys.stderr)
        return 2
    if a.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        imprimir(r)
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
