"""Tests for map-artifact.py. Run from the repo root: python3 -m unittest discover scripts"""
import importlib.util
import os
import unittest

spec = importlib.util.spec_from_file_location("map_artifact", os.path.join(os.path.dirname(__file__), "map-artifact.py"))
mp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mp)

REPO, BRANCH, PAGE = "owner/repo", "main", "https://claude.ai/artifact/abc"
MD = """# `demo`: project map

The [map artifact](https://claude.ai/artifact/abc) is built from this file.

```mermaid
flowchart LR
  s1[PRD input]:::done --> s2[PRD, gate 1]:::now --> s3[Build]:::next
  classDef done fill:#E3EFE9
```

| Piece | What it is |
|---|---|
| [PRD](PRD.md) | The product doc |
| [Site](https://example.com) | The live site |
"""
# The shape of what GitHub's renderer returns for MD.
HTML = """<h1>demo: project map</h1>
<p>The <a href="https://claude.ai/artifact/abc">map artifact</a> is built from this file.</p>
<section class="js-render-needs-enrichment" data-type="mermaid"><pre lang="mermaid">flowchart LR</pre></section>
<table><thead><tr><th>Piece</th><th>What it is</th></tr></thead><tbody>
<tr><td><a href="PRD.md">PRD</a></td><td>The product doc</td></tr>
<tr><td><a href="https://example.com" rel="nofollow">Site</a></td><td>The live site</td></tr>
</tbody></table>"""


def build(md=MD, body=HTML):
    return mp.build(md, body, REPO, BRANCH, "abc123", PAGE)


class Links(unittest.TestCase):
    def test_repo_file_becomes_github_link(self):
        self.assertEqual(mp.absolute("PRD.md", REPO, BRANCH), "https://github.com/owner/repo/blob/main/docs/PRD.md")

    def test_path_above_docs(self):
        self.assertEqual(mp.absolute("../README.md", REPO, BRANCH), "https://github.com/owner/repo/blob/main/README.md")

    def test_web_links_and_anchors_unchanged(self):
        for href in ["https://example.com", "http://x.org/a", "#now", "mailto:a@b.c"]:
            self.assertEqual(mp.absolute(href, REPO, BRANCH), href)


class Build(unittest.TestCase):
    def test_good_input_builds_a_page(self):
        page = build()
        self.assertIn("<title>demo: project map</title>", page)
        self.assertIn('href="https://github.com/owner/repo/blob/main/docs/PRD.md"', page)
        self.assertIn('href="https://example.com"', page)
        self.assertIn("commit abc123", page)

    def test_link_to_the_page_itself_becomes_text(self):
        page = build()
        self.assertNotIn(f'href="{PAGE}"', page)
        self.assertIn("The map artifact is built", page)

    def test_missing_row_is_caught(self):
        dropped = HTML.replace('<tr><td><a href="https://example.com" rel="nofollow">Site</a></td><td>The live site</td></tr>', "")
        with self.assertRaises(SystemExit):
            build(body=dropped)

    def test_extra_row_is_caught(self):
        with self.assertRaises(SystemExit):
            build(body=HTML.replace("</tbody>", "<tr><td>x</td><td>y</td></tr></tbody>"))

    def test_missing_link_is_caught(self):
        with self.assertRaises(SystemExit):
            build(body=HTML.replace('<a href="PRD.md">PRD</a>', "PRD"))

    def test_divider_rows_not_counted(self):
        self.assertEqual(len(mp.md_rows(MD)), 3)
        self.assertEqual(len(mp.md_rows("| a |\n|:--|\n| b |\n")), 2)


class RepoFiles(unittest.TestCase):
    def test_finds_only_this_repos_files_on_this_branch(self):
        page = ('<a href="https://github.com/owner/repo/blob/main/docs/PRD.md">'
                '<a href="https://github.com/owner/repo/blob/other/docs/X.md">'
                '<a href="https://github.com/owner/repo">'
                '<a href="https://github.com/someone/else/blob/main/a.md">')
        self.assertEqual(mp.repo_files(page, REPO, BRANCH), ["docs/PRD.md"])

    def test_branch_names_with_slashes(self):
        page = '<a href="https://github.com/owner/repo/blob/docs/fix-x/scripts/a.py">'
        self.assertEqual(mp.repo_files(page, REPO, "docs/fix-x"), ["scripts/a.py"])


class Stages(unittest.TestCase):
    def test_diagram_becomes_colored_boxes_in_order(self):
        page = build()
        self.assertNotIn('data-type="mermaid"', page)
        done, now, nxt = (page.index(f'<li class="{s}">') for s in ("done", "now", "next"))
        self.assertLess(done, now)
        self.assertLess(now, nxt)
        self.assertIn('<li class="now"><span class="t">PRD, gate 1</span><span class="s">Now</span>', page)

    def test_stages_read_from_file(self):
        self.assertEqual(mp.stages(MD), [("PRD input", "done"), ("PRD, gate 1", "now"), ("Build", "next")])

    def test_no_current_stage_is_caught(self):
        with self.assertRaises(SystemExit):
            build(md=MD.replace(":::now", ":::next"))

    def test_two_current_stages_are_caught(self):
        with self.assertRaises(SystemExit):
            build(md=MD.replace("[Build]:::next", "[Build]:::now"))

    def test_diagram_not_replaced_is_caught(self):
        with self.assertRaises(SystemExit):
            build(body=HTML.replace('data-type="mermaid"', 'data-type="other"'))

    def test_stage_without_state_is_caught(self):
        with self.assertRaises(SystemExit):
            mp.stages(MD.replace("[Build]:::next", "[Build]"))

    def test_unknown_state_is_caught(self):
        with self.assertRaises(SystemExit):
            mp.stages(MD.replace("[Build]:::next", "[Build]:::nxt"))

    def test_quoted_label_loses_its_quotes(self):
        md = MD.replace("[PRD, gate 1]", '["PRD (gate 1)"]')
        self.assertIn(("PRD (gate 1)", "now"), mp.stages(md))
        self.assertIn('<span class="t">PRD (gate 1)</span>', build(md=md))


class OneRel(unittest.TestCase):
    def test_each_link_has_one_rel(self):
        page = build()
        self.assertNotIn('rel="nofollow"', page)
        self.assertEqual(page.count('href="https://example.com" target="_blank" rel="noopener"'), 1)


class RepoFilesWithHeadings(unittest.TestCase):
    def test_heading_part_is_dropped(self):
        page = '<a href="https://github.com/owner/repo/blob/main/docs/PRD.md#goals">'
        self.assertEqual(mp.repo_files(page, REPO, BRANCH), ["docs/PRD.md"])


class FilesOnGitHub(unittest.TestCase):
    PAGE = ('<a href="https://github.com/owner/repo/blob/main/docs/PRD.md">'
            '<a href="https://github.com/owner/repo/blob/main/scripts/a.py#top">')

    def test_all_files_present_passes(self):
        asked = []
        mp.check_files(self.PAGE, REPO, BRANCH, lambda r, b, p: asked.append((r, b, p)) or True)
        self.assertEqual(asked, [(REPO, BRANCH, "docs/PRD.md"), (REPO, BRANCH, "scripts/a.py")])

    def test_missing_file_is_caught(self):
        with self.assertRaises(SystemExit):
            mp.check_files(self.PAGE, REPO, BRANCH, lambda r, b, p: p != "scripts/a.py")


class Source(unittest.TestCase):
    def test_clean_file_on_a_branch_passes(self):
        mp.check_source("", "main")

    def test_uncommitted_map_is_caught(self):
        with self.assertRaises(SystemExit):
            mp.check_source(" M docs/MAP.md\n", "main")

    def test_detached_head_is_caught(self):
        with self.assertRaises(SystemExit):
            mp.check_source("", "HEAD")


if __name__ == "__main__":
    unittest.main()
