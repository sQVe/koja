#!/usr/bin/env bash
# The picker's preview: one terminal shown at a time, watch-only. `hc attach --observe`
# never types into or resizes the terminal it shows, so agents don't redraw.
#
#   preview.sh serve <fifo>           runs in the preview terminal
#   preview.sh show <fifo> <address>  shows <address>; "-" shows nothing
set -u

# Each attach leaves the shown program's modes (alternate screen, hidden cursor,
# mouse tracking) on this terminal; reset them before the next one draws.
reset_screen() {
  printf '\e[?1049l\e[?1000l\e[?1002l\e[?1003l\e[?1006l\e[?2004l\e[0m\e[H\e[2J\e[?25l'
}

serve() {
  local fifo=$1
  local current=""
  local viewer=""

  stop_viewer() {
    if [[ -n ${viewer} ]]; then
      kill "${viewer}" 2>/dev/null
      wait "${viewer}" 2>/dev/null
      viewer=""
    fi
  }

  trap 'stop_viewer; exit 0' TERM INT HUP
  [[ -p ${fifo} ]] || mkfifo "${fifo}"

  # Open read-write so the loop never sees end-of-file between writers.
  exec 3<>"${fifo}"
  reset_screen

  while IFS= read -r target <&3; do
    [[ ${target} == "${current}" ]] && continue

    stop_viewer
    reset_screen
    current=${target}
    [[ ${target} == "-" ]] && continue

    # attach asks this terminal for its colors and waits for the answer on stdin;
    # a background job would get /dev/null and stall for half a second.
    hc attach --observe "${target}" </dev/tty &
    viewer=$!
  done
}

show() {
  local fifo=$1
  local target=$2

  # Writing to a FIFO nobody reads would block, and to a missing path would
  # create a plain file.
  [[ -p ${fifo} ]] || exit 1
  # The inner bash expands $1 and $2, so the values never become part of its command.
  # shellcheck disable=SC2016
  timeout 1 bash -c 'printf "%s\n" "$1" > "$2"' _ "${target}" "${fifo}"
}

case ${1-} in
  serve) serve "$2" ;;
  show) show "$2" "$3" ;;
  *)
    echo "usage: preview.sh serve <fifo> | show <fifo> <address>" >&2
    exit 2
    ;;
esac
