# Fake pointer input for the sandbox's private X display (XTest). Coordinates
# are in the Herdr window, px. Run through `scripts/sandbox`, not directly.
# --display <d> names the private display; it is required.
#   move x0 y0 x1 y1        glide the pointer, no buttons
#   click x y [button]      button: 1 left (default), 3 right
#   drag x0 y0 x1 y1        press, glide, release
#   scroll x y [notches]    wheel at x y: notches > 0 down (default 1), < 0 up. Dragging a
#                           scrollbar thumb does not scroll Herdr views; use this.
#   hold|release <keysym>...   keep keys down across commands, e.g. `hold Control_L`
#   type <text>             type it (keys of the X keymap; shift as needed)
#   key <keysym> [mods...]  one key, e.g. `key Return`, `key l Control_L`
import json
import os
from pathlib import Path
import sys
import time

from Xlib import X, XK, display
from Xlib.ext import xtest

if "--display" not in sys.argv[1:]:
    sys.exit("sandbox-input.py needs --display <display>; run it through scripts/sandbox")

display_argument = sys.argv.index("--display")
if display_argument + 1 >= len(sys.argv):
    sys.exit("sandbox-input.py needs a display after --display")

display_name = sys.argv[display_argument + 1]
if not display_name.startswith(":"):
    sys.exit(f"sandbox-input.py needs an X display, not {display_name!r}")

del sys.argv[display_argument : display_argument + 2]

d = display.Display(display_name)
root = d.screen().root


def find(w):
    if w.get_wm_name() == "Herdr":
        return w
    for c in w.query_tree().children:
        r = find(c)
        if r:
            return r
    return None


win = find(root)
if win is None:
    sys.exit("no Herdr window on this display")
pos = win.translate_coords(root, 0, 0)
ox, oy = -pos.x, -pos.y


cursor = "arrow"
pointer_file = os.environ.get("HERDR_NOTES_POINTER_FILE")
pointer = (0, 0)


def publish_pointer():
    if pointer_file:
        file = Path(pointer_file)
        temp = file.with_suffix(".new")
        temp.write_text(json.dumps({"x": pointer[0], "y": pointer[1], "cursor": cursor}))
        temp.replace(file)


def to(x, y):
    global pointer
    xtest.fake_input(d, X.MotionNotify, x=int(ox + x), y=int(oy + y))
    d.sync()
    pointer = (int(x), int(y))
    publish_pointer()


def glide(x0, y0, x1, y1, steps=24):
    for i in range(steps + 1):
        to(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)
        time.sleep(0.016)


def button(n, down):
    xtest.fake_input(d, X.ButtonPress if down else X.ButtonRelease, n)
    d.sync()


def notch_count(args):
    if len(args) < 3:
        return 1
    if args[2] != int(args[2]):
        sys.exit(f"scroll needs a whole number of notches, not {args[2]}")
    return int(args[2])


def wheel(notches):
    # X11 reports the wheel as buttons 4 (up) and 5 (down), one press per notch.
    wheel_button = 5 if notches > 0 else 4
    for _ in range(abs(notches)):
        button(wheel_button, True)
        button(wheel_button, False)
        time.sleep(0.05)


def key(sym, mods=()):
    code = d.keysym_to_keycode(XK.string_to_keysym(sym))
    held = [d.keysym_to_keycode(XK.string_to_keysym(m)) for m in mods]
    for m in held:
        xtest.fake_input(d, X.KeyPress, m)
    xtest.fake_input(d, X.KeyPress, code)
    xtest.fake_input(d, X.KeyRelease, code)
    for m in reversed(held):
        xtest.fake_input(d, X.KeyRelease, m)
    d.sync()
    time.sleep(0.03)


if sys.argv[1] == "sequence":
    # Xwayland resets the virtual device on disconnect; one connection keeps
    # pointer hover and held modifiers alive across a whole scripted scene.
    to(650, 400)
    time.sleep(0.15)
    to(650, 400)
    for action in json.loads(sys.argv[2]):
        cmd, *args = action
        if cmd == "sleep":
            time.sleep(args[0])
        elif cmd == "move":
            glide(*args)
        elif cmd == "click":
            to(*args)
            time.sleep(0.2)
            button(1, True)
            time.sleep(0.1)
            button(1, False)
        elif cmd in ("hold", "release"):
            cursor = "pointer" if cmd == "hold" and "Control_L" in args else "arrow"
            publish_pointer()
            for sym in args:
                code = d.keysym_to_keycode(XK.string_to_keysym(sym))
                xtest.fake_input(d, X.KeyPress if cmd == "hold" else X.KeyRelease, code)
            d.sync()
        elif cmd == "scroll":
            notches = notch_count(args)
            to(args[0], args[1])
            time.sleep(0.1)
            wheel(notches)
        elif cmd in ("press", "lift"):
            cursor = "grab" if cmd == "press" else "arrow"
            publish_pointer()
            button(1, cmd == "press")
        else:
            sys.exit(f"unknown sequence command {cmd}")
    time.sleep(0.1)
    sys.exit(0)

# Let Xwayland activate its virtual device before positioning it.
to(0, 0)
time.sleep(0.15)

if sys.argv[1] in ("type", "key"):
    if sys.argv[1] == "key":
        key(sys.argv[2], sys.argv[3:])
    for ch in sys.argv[2] if sys.argv[1] == "type" else "":
        name = {" ": "space", ".": "period", "/": "slash", ":": "colon", "-": "minus"}.get(ch, ch)
        keysym = XK.string_to_keysym(name)
        shifted = d.keysym_to_keycodes(keysym) and any(i % 2 for _, i in d.keysym_to_keycodes(keysym))
        key(name, ["Shift_L"] if shifted or ch.isupper() else [])
    time.sleep(0.1)
    sys.exit(0)

if sys.argv[1] in ("hold", "release"):
    for sym in sys.argv[2:]:
        code = d.keysym_to_keycode(XK.string_to_keysym(sym))
        xtest.fake_input(d, X.KeyPress if sys.argv[1] == "hold" else X.KeyRelease, code)
    d.sync()
    time.sleep(0.1)
    sys.exit(0)

cmd, args = sys.argv[1], [float(a) for a in sys.argv[2:]]
if cmd == "move":
    glide(*args[:4])
elif cmd == "click":
    to(args[0], args[1])
    time.sleep(0.2)
    b = int(args[2]) if len(args) > 2 else 1
    button(b, True)
    time.sleep(0.05)
    button(b, False)
elif cmd == "scroll":
    notches = notch_count(args)
    to(args[0], args[1])
    time.sleep(0.2)
    wheel(notches)
elif cmd == "drag":
    to(args[0], args[1])
    time.sleep(0.2)
    button(1, True)
    time.sleep(0.2)
    glide(*args[:4])
    time.sleep(0.1)
    button(1, False)
else:
    sys.exit(f"unknown input command {cmd}")
time.sleep(0.1)
