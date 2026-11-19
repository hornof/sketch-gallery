"""Print "true" if the change from BASE to HEAD touches only docs, else "false".

Docs are Markdown files anywhere and everything under docs/. CI skips the browser tests
and Lighthouse when this prints "true". Anything unclear (no base, an unknown commit,
no changed files) prints "false", so every test runs.

Usage: python3 scripts/docs-only.py BASE HEAD
"""
import subprocess
import sys


def is_doc(path):
    return path.startswith("docs/") or path.endswith(".md")


def docs_only(files):
    return bool(files) and all(is_doc(f) for f in files)


def changed_files(base, head, repo="."):
    # Three dots: only what the branch changed since it left BASE. --no-renames lists both
    # sides of a move, so moving code into docs/ still counts as a code change.
    out = subprocess.run(
        ["git", "-C", repo, "diff", "--name-only", "--no-renames", base + "..." + head],
        check=True, capture_output=True, text=True, timeout=60,
    ).stdout
    return [line for line in out.splitlines() if line]


def check(base, head, repo="."):
    if not base or set(base) == {"0"}:
        print("No base commit; running every test.", file=sys.stderr)
        return "false"
    try:
        files = changed_files(base, head, repo)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        print("Could not compare " + base + " and " + head + " (" + str(e) + "); running every test.", file=sys.stderr)
        return "false"
    print("Changed files:", *files, sep="\n  ", file=sys.stderr)
    return "true" if docs_only(files) else "false"


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    print(check(sys.argv[1], sys.argv[2]))
