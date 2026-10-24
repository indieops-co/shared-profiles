# Test fixtures

`source/` mirrors three files from https://github.com/VoltAgent/awesome-design-md (MIT — see
`source/LICENSE`), copied at commit 3b605329240ce735b510037cca322f1831fdd7f8: the Stripe and Claude
DESIGN.md files (front-matter format) and Tesla (the older prose-only format). `source/README.md` is a
hand-made three-entry slice in the same shape as the real README.

They are third-party content and test data only. `make-release.sh` keeps `test/` out of the buyer zip.

`logo.svg` is a made-up mark for the logo tests.
