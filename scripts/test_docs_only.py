"""Tests for docs-only.py and for how ci.yml uses it. Run from the repo root: python3 scripts/test_docs_only.py"""
import importlib.util
import os
import re
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("docs_only", os.path.join(HERE, "docs-only.py"))
do = importlib.util.module_from_spec(spec)
spec.loader.exec_module(do)

CI = os.path.join(HERE, "..", ".github", "workflows", "ci.yml")


class Classify(unittest.TestCase):
    def test_markdown_anywhere_is_docs(self):
        self.assertTrue(do.docs_only(["CLAUDE.md", "README.md", "LOG.md"]))
        self.assertTrue(do.docs_only(["docs/MAP.md", "docs/launch/launch-checks.md"]))

    def test_anything_under_docs_is_docs(self):
        self.assertTrue(do.docs_only(["docs/mockups/1-desktop-grid.png", "docs/launch/iphone-1-home.webp"]))

    def test_one_code_file_means_run_everything(self):
        for code in ["build/build.mjs", "tests/browser/popup.pw.mjs", ".github/workflows/ci.yml",
                     "package.json", "drawings/2025/2025-10-07.jpg", "site.json", "scripts/map-artifact.py"]:
            self.assertFalse(do.docs_only(["CLAUDE.md", code]), code)

    def test_lookalikes_are_not_docs(self):
        for path in ["docs.json", "mydocs/x.png", "build/docs", "notes.md.bak", "README.MD.js", "tests/docs/x.mjs"]:
            self.assertFalse(do.docs_only([path]), path)

    def test_no_files_means_run_everything(self):
        self.assertFalse(do.docs_only([]))

    def test_order_does_not_matter(self):
        files = ["docs/MAP.md", "build/pages.mjs", "README.md"]
        self.assertEqual(do.docs_only(files), do.docs_only(list(reversed(files))))


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], check=True, capture_output=True, text=True, timeout=30).stdout.strip()


class FromGit(unittest.TestCase):
    """The real git diff between two commits, in a throwaway repo."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = self.tmp.name
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.email", "test@example.com")
        git(self.repo, "config", "user.name", "Test")
        self.write("README.md", "hello\n")
        self.write("build/build.mjs", "export const a = 1;\n" * 20)
        self.base = self.commit("start")

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, path, text):
        full = os.path.join(self.repo, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w") as f:
            f.write(text)

    def commit(self, message):
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", message)
        return git(self.repo, "rev-parse", "HEAD")

    def test_markdown_change_is_docs_only(self):
        self.write("README.md", "changed\n")
        self.write("docs/MAP.md", "new\n")
        self.assertEqual(do.check(self.base, self.commit("docs"), self.repo), "true")

    def test_code_change_is_not(self):
        self.write("README.md", "changed\n")
        self.write("build/build.mjs", "export const a = 2;\n")
        self.assertEqual(do.check(self.base, self.commit("code"), self.repo), "false")

    def test_deleting_code_is_not(self):
        os.remove(os.path.join(self.repo, "build/build.mjs"))
        self.assertEqual(do.check(self.base, self.commit("delete"), self.repo), "false")

    def test_moving_code_into_docs_is_not(self):
        os.makedirs(os.path.join(self.repo, "docs"))
        git(self.repo, "mv", "build/build.mjs", "docs/build.mjs")
        self.assertEqual(do.check(self.base, self.commit("move"), self.repo), "false")

    def test_only_the_branch_counts_not_main_moving_on(self):
        # The PR branch changes only docs; main meanwhile changes code. The three-dot diff ignores main's change.
        git(self.repo, "checkout", "-q", "-b", "pr")
        self.write("docs/MAP.md", "new\n")
        head = self.commit("docs on the branch")
        git(self.repo, "checkout", "-q", "main")
        self.write("build/build.mjs", "export const a = 3;\n")
        main_tip = self.commit("code on main")
        self.assertEqual(do.check(main_tip, head, self.repo), "true")

    def test_unknown_or_missing_base_runs_everything(self):
        self.write("README.md", "changed\n")
        head = self.commit("docs")
        for base in ["", "0000000000000000000000000000000000000000", "deadbeef"]:
            self.assertEqual(do.check(base, head, self.repo), "false", base)

    def test_no_change_runs_everything(self):
        self.assertEqual(do.check(self.base, self.base, self.repo), "false")


def job(name):
    """The text of one top-level job in ci.yml."""
    with open(CI) as f:
        text = f.read()
    match = re.search(r"^  " + name + r":\n(.*?)(?=^  \S|\Z)", text, re.S | re.M)
    if not match:
        raise AssertionError("no job " + name + " in ci.yml")
    return match.group(1)


SKIP = "if: needs.changes.outputs.docs_only != 'true'"


class Workflow(unittest.TestCase):
    def test_browser_tests_and_lighthouse_skip_docs_only_changes(self):
        for name in ["browsers", "lighthouse"]:
            text = job(name)
            self.assertIn("needs: changes", text, name)
            self.assertIn(SKIP, text, name)

    def test_quick_tests_always_run(self):
        text = job("test")
        self.assertNotIn("if:", text)
        self.assertIn("python3 scripts/test_docs_only.py", text)

    def test_changes_job_uses_the_script_on_the_whole_branch(self):
        text = job("changes")
        self.assertIn("docs_only: ${{ steps.check.outputs.docs_only }}", text)
        self.assertIn("fetch-depth: 0", text)
        self.assertIn("scripts/docs-only.py", text)
        self.assertIn("github.event.pull_request.base.sha || github.event.before", text)
        self.assertIn("github.event.pull_request.head.sha || github.sha", text)


if __name__ == "__main__":
    unittest.main()
