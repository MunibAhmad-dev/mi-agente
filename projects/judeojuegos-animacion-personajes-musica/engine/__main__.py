"""`python -m engine <command>` → CLI dispatch."""

from engine.cli import main

if __name__ == "__main__":
    raise SystemExit(main())