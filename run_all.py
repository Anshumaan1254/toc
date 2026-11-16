"""One command to run everything.

    python run_all.py              # start the API (:8000) and the website dev server (:5173), open the browser
    python run_all.py --prod       # build the website once and serve API + website from FastAPI on :8000
    python run_all.py --pipeline   # regenerate data, models and automata: execute notebooks 01 and 02
    python run_all.py --check      # pytest + frontend type-check + production build + end-to-end browser test

Use the project's Python environment (here: the conda env ``ai``), e.g.
``D:\\CondaEnvs\\ai\\python.exe run_all.py``.  Every tool is launched as ``python -m ...`` and
``npm`` is resolved explicitly, so nothing depends on ``Scripts\\*.exe`` launcher shims
(Windows Application Control blocks those on the development machine).
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
API = "http://127.0.0.1:8000"
WEB = "http://127.0.0.1:5173"
REQUIRED = ["numpy", "pandas", "sklearn", "scipy", "joblib", "fastapi", "uvicorn", "nbformat", "nbclient", "matplotlib", "pytest"]


def say(msg: str) -> None:
    print(f"[run_all] {msg}", flush=True)


def check_python() -> None:
    missing = [m for m in REQUIRED if importlib.util.find_spec(m) is None]
    if missing:
        sys.exit(f"Missing Python packages: {', '.join(missing)}\nInstall them with: {sys.executable} -m pip install -r requirements.txt")
    say(f"Python {sys.version.split()[0]} at {sys.executable}")


def npm() -> str:
    exe = shutil.which("npm.cmd") or shutil.which("npm")
    if not exe:
        sys.exit("Node.js/npm not found. Install Node 18+ to run the website.")
    return exe


def run(cmd: list[str], cwd: Path = ROOT, check: bool = True) -> int:
    say("$ " + " ".join(cmd))
    code = subprocess.call(cmd, cwd=cwd)
    if check and code != 0:
        sys.exit(f"command failed with exit code {code}: {' '.join(cmd)}")
    return code


def ensure_frontend_deps() -> None:
    if not (FRONTEND / "node_modules").exists():
        say("installing frontend dependencies (npm ci)…")
        run([npm(), "ci", "--no-audit", "--no-fund"], cwd=FRONTEND)


def build_frontend() -> None:
    ensure_frontend_deps()
    run([npm(), "run", "build"], cwd=FRONTEND)


def ensure_artifacts() -> None:
    needed = [ROOT / "data" / "dataset.csv", ROOT / "artifacts" / "metrics.json"]
    if all(p.exists() for p in needed) and any((ROOT / "artifacts" / "models").glob("*.joblib")):
        return
    say("artifacts missing: running the data + modelling pipeline first (about 5 minutes)…")
    pipeline()


def pipeline() -> None:
    run([sys.executable, "scripts/build_notebook_01.py"])
    run([sys.executable, "scripts/run_notebook.py", "notebooks/01_generate_dataset.ipynb"])
    run([sys.executable, "scripts/build_notebook_02.py"])
    run([sys.executable, "scripts/run_notebook.py", "notebooks/02_eda_models_automata.ipynb"])


def wait_for(url: str, seconds: float = 60) -> bool:
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:  # noqa: S310 - local URL
                if r.status < 500:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def start(cmd: list[str], cwd: Path) -> subprocess.Popen:
    say("$ " + " ".join(cmd))
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    return subprocess.Popen(cmd, cwd=cwd, creationflags=flags)


def stop(procs: list[subprocess.Popen]) -> None:
    for p in procs:
        if p.poll() is None:
            try:
                if os.name == "nt":
                    subprocess.call(["taskkill", "/PID", str(p.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    p.send_signal(signal.SIGINT)
            except Exception:
                p.kill()


def serve(prod: bool, open_browser: bool) -> None:
    check_python()
    ensure_artifacts()
    procs: list[subprocess.Popen] = []
    try:
        if prod:
            build_frontend()
        procs.append(start([sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8000"], ROOT))
        if not wait_for(f"{API}/api/health"):
            raise SystemExit("the API did not start; see the output above")
        say(f"API ready: {API}  (docs: {API}/docs)")
        url = API
        if not prod:
            ensure_frontend_deps()
            procs.append(start([npm(), "run", "dev"], FRONTEND))
            if not wait_for(WEB):
                raise SystemExit("the website dev server did not start; see the output above")
            url = WEB
        say(f"Website ready: {url}   (Ctrl+C stops everything)")
        if open_browser:
            webbrowser.open(url)
        while all(p.poll() is None for p in procs):
            time.sleep(0.5)
        say("a server exited; shutting down")
    except KeyboardInterrupt:
        say("stopping…")
    finally:
        stop(procs)


def check() -> None:
    """Every gate in one go: tests, type-check, production build, end-to-end run in a real browser."""
    check_python()
    ensure_artifacts()
    run([sys.executable, "-m", "pytest", "-q"])
    ensure_frontend_deps()
    run([npm(), "run", "typecheck"], cwd=FRONTEND)
    run([npm(), "run", "build"], cwd=FRONTEND)
    procs = [start([sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8000"], ROOT)]
    try:
        if not wait_for(f"{API}/api/health"):
            raise SystemExit("the API did not start")
        node = shutil.which("node")
        if not node:
            raise SystemExit("node not found")
        run([node, "e2e/run-e2e.mjs", API], cwd=FRONTEND)
    finally:
        stop(procs)
    say("all checks passed")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--prod", action="store_true", help="build the website and serve everything from FastAPI on :8000")
    group.add_argument("--pipeline", action="store_true", help="re-run notebooks 01 and 02")
    group.add_argument("--check", action="store_true", help="tests + typecheck + build + end-to-end test")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser window")
    args = parser.parse_args()
    os.chdir(ROOT)
    if args.pipeline:
        check_python()
        pipeline()
    elif args.check:
        check()
    else:
        serve(prod=args.prod, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
