#!/usr/bin/env bash
# Build step for the Customer & Field Intelligence Portal.
# 1. Stamps assets/data.js meta.updated from the system clock (so the header
#    "Updated <date>" is always current — no manual edit, no drift).
# 2. Regenerates standalone.html by inlining styles.css / data.js / app.js
#    into index.html (a single self-contained file for handoff/email).
#
# Run this before every deploy:  ./build.sh
set -euo pipefail
cd "$(dirname "$0")"

TODAY="$(date +%Y-%m-%d)"

python3 - "$TODAY" <<'PY'
import re, sys, pathlib

today = sys.argv[1]
root = pathlib.Path(".")

data = (root / "assets/data.js").read_text()
# Re-stamp only the meta block's "updated" field (the first occurrence,
# which is inside meta at the very start of window.VOC_DATA).
new_data, n = re.subn(r'("updated":\s*")\d{4}-\d{2}-\d{2}(")',
                      rf'\g<1>{today}\g<2>', data, count=1)
if n != 1:
    sys.exit("build: could not find meta.updated to stamp in data.js")
(root / "assets/data.js").write_text(new_data)

html = (root / "index.html").read_text()
css  = (root / "assets/styles.css").read_text()
appjs = (root / "assets/app.js").read_text()

html = html.replace(
    '<link rel="stylesheet" href="assets/styles.css">',
    f"<style>\n{css}\n</style>")
html = html.replace(
    '<script src="assets/data.js"></script>\n<script src="assets/app.js"></script>',
    f"<script>\n{new_data}\n{appjs}\n</script>")

(root / "standalone.html").write_text(html)
print(f"build: stamped {today}, regenerated standalone.html ({len(html):,} bytes)")
PY
