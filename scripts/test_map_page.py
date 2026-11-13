"""Tests for map-page.py. Run from the repo root: python3 -m unittest discover scripts"""
import importlib.util
import os
import unittest

spec = importlib.util.spec_from_file_location("map_page", os.path.join(os.path.dirname(__file__), "map-page.py"))
mp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mp)

REPO, BRANCH, PAGE = "owner/repo", "main", "https://claude.ai/artifact/abc"
MD = """# `demo`: project map

The [map page](https://claude.ai/artifact/abc) is built from this file.

```mermaid
flowchart LR
  s1[Brain dump]:::done --> s2[PRD, gate 1]:::now --> s3[Build]:::next
  classDef done fill:#E3EFE9
```

| Piece | What it is |
|---|---|
| [PRD](PRD.md) | The product doc |
| [Site](https://example.com) | The live site |
"""
# The shape of what GitHub's renderer returns for MD.
HTML = """<h1>demo: project map</h1>
<p>The <a href="https://claude.ai/artifact/abc">map page</a> is built from this file.</p>
<section class="js-render-needs-enrichment" data-type="mermaid"><pre lang="mermaid">flowchart LR</pre></section>
<table><thead><tr><th>Piece</th><th>What it is</th></tr></thead><tbody>
<tr><td><a href="PRD.md">PRD</a></td><td>The product doc</td></tr>
<tr><td><a href="https://example.com">Site</a></td><td>The live site</td></tr>
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
        self.assertIn("The map page is built", page)

    def test_missing_row_is_caught(self):
        dropped = HTML.replace('<tr><td><a href="https://example.com">Site</a></td><td>The live site</td></tr>', "")
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


class Stages(unittest.TestCase):
    def test_diagram_becomes_colored_boxes_in_order(self):
        page = build()
        self.assertNotIn('data-type="mermaid"', page)
        done, now, nxt = (page.index(f'<li class="{s}">') for s in ("done", "now", "next"))
        self.assertLess(done, now)
        self.assertLess(now, nxt)
        self.assertIn('<li class="now"><span class="t">PRD, gate 1</span><span class="s">Now</span>', page)

    def test_stages_read_from_file(self):
        self.assertEqual(mp.stages(MD), [("Brain dump", "done"), ("PRD, gate 1", "now"), ("Build", "next")])

    def test_no_current_stage_is_caught(self):
        with self.assertRaises(SystemExit):
            build(md=MD.replace(":::now", ":::next"))

    def test_two_current_stages_are_caught(self):
        with self.assertRaises(SystemExit):
            build(md=MD.replace("[Build]:::next", "[Build]:::now"))

    def test_diagram_not_replaced_is_caught(self):
        with self.assertRaises(SystemExit):
            build(body=HTML.replace('data-type="mermaid"', 'data-type="other"'))


if __name__ == "__main__":
    unittest.main()
