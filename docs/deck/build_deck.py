"""Build the combined three-agent deck: inline every capture as a data URI.

Usage: python build_deck.py <template.html> <output.html>
The template carries {{IMG:key}} tokens; each key maps to a PNG in one of the
three repositories, so the produced file is a single self-contained deck.
"""
import base64
import os
import re
import sys

ROOT = "D:/CodeWorkSpace"
DT = ROOT + "/DoubleTraining/docs/deck/shots"
DR = ROOT + "/DoubleRunner/docs/screens"
WH = ROOT + "/WorkHealthier/docs/deck/shots"

SHOTS = {
    "dt-cal": DT + "/01-dates-today.png",
    "dt-thu": DT + "/02-dates-thu.png",
    "dt-tick": DT + "/04-day-ticked.png",
    "dt-done": DT + "/06-day-done.png",
    "dt-card": DT + "/08-card-probe.png",
    "dr-ready": DR + "/01-ready.png",
    "dr-run": DR + "/03-running.png",
    "dr-paused": DR + "/05-paused.png",
    "dr-done": DR + "/06-finished.png",
    "wh-good": WH + "/02-demo-good.png",
    "wh-alert": WH + "/03-alert.png",
    "wh-focus": WH + "/04-settings-focus.png",
}


def data_uri(path):
    with open(path, "rb") as handle:
        return "data:image/png;base64," + base64.b64encode(handle.read()).decode("ascii")


def main():
    template, output = sys.argv[1], sys.argv[2]
    with open(template, encoding="utf-8") as handle:
        html = handle.read()

    used = set()

    def replace(match):
        key = match.group(1)
        if key not in SHOTS:
            raise SystemExit("unknown image key: " + key)
        used.add(key)
        return data_uri(SHOTS[key])

    html = re.sub(r"\{\{IMG:([a-z0-9-]+)\}\}", replace, html)
    left = re.findall(r"\{\{[^}]+\}\}", html)
    if left:
        raise SystemExit("unresolved tokens: " + ", ".join(sorted(set(left))))

    os.makedirs(os.path.dirname(output), exist_ok=True)
    with open(output, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(html)

    print("wrote %s  %.0f KB  %d captures inlined" % (
        output, os.path.getsize(output) / 1024, len(used)))
    unused = sorted(set(SHOTS) - used)
    if unused:
        print("not used:", ", ".join(unused))


if __name__ == "__main__":
    main()
