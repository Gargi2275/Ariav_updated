#!/usr/bin/env python
import os
import subprocess
import sys
from pathlib import Path


def _venv_python() -> Path:
    return Path(__file__).resolve().parent / ".venv" / "Scripts" / "python.exe"


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    venv_py = _venv_python()
    current = Path(sys.executable).resolve()
    if venv_py.exists() and current != venv_py.resolve():
        raise SystemExit(subprocess.call([str(venv_py), *sys.argv]))

    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
