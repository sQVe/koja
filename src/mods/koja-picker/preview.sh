#!/usr/bin/env bash
# The picker's preview: one terminal shown at a time, watch-only. `hc attach --observe`
# never types into or resizes the terminal it shows, so agents don't redraw.
#
#   preview.sh serve <state>   runs in the preview terminal; watches <state> for the
#                              address to observe, "-" or empty to show nothing.
set -u

# How often serve checks the state file: short enough to feel live, cheap enough to ignore.
pollSeconds=0.05

# The picker rewrites the heartbeat about every second, and this limit is 60 times that:
# 1200 polls at 0.05 s is about 60 s. Staleness is counted in serve's own poll ticks, not wall
# time, so a suspended serve does not age and a stall or laptop sleep under a minute keeps a
# live viewer; an orphan still ends within about a minute. Tests may shorten it through the
# environment; anything but a positive whole number keeps the default.
heartbeatLimitPolls=1200
if [[ ${KOJA_PREVIEW_HEARTBEAT_LIMIT_POLLS-} =~ ^[1-9][0-9]*$ ]]; then
  heartbeatLimitPolls=${KOJA_PREVIEW_HEARTBEAT_LIMIT_POLLS}
fi

# Where attach reads the terminal's replies (colors, cursor). Tests pass /dev/null.
inputDevice=${KOJA_PREVIEW_INPUT:-/dev/tty}

# Each attach leaves the shown program's modes (alternate screen, hidden cursor,
# mouse tracking) on this terminal; reset them before the next one draws.
reset_screen() {
  printf '\e[?1049l\e[?1000l\e[?1002l\e[?1003l\e[?1006l\e[?2004l\e[0m\e[H\e[2J\e[?25l'
}

serve() {
  local state=$1
  local folder=${state%/*}
  local heartbeat=${folder}/heartbeat
  local viewer=""
  local shown=""
  local started=0
  local target
  local beat=""
  local beatPolls=0
  local current

  stop_viewer() {
    if [[ -n ${viewer} ]]; then
      kill "${viewer}" 2>/dev/null
      wait "${viewer}" 2>/dev/null
      viewer=""
    fi
  }

  trap 'stop_viewer; exit 0' TERM INT HUP

  reset_screen

  while [[ -f ${state} && -d ${folder} ]]; do
    current=$(cat "${heartbeat}" 2>/dev/null) || current=""

    # A changed heartbeat resets the count; unchanged content is one more silent poll. Counting
    # poll ticks keeps a suspended serve from aging a live owner.
    if [[ ${current} != "${beat}" ]]; then
      beat=${current}
      beatPolls=0
    else
      beatPolls=$((beatPolls + 1))
    fi

    if (( beatPolls > heartbeatLimitPolls )); then
      break
    fi

    target=$(cat "${state}" 2>/dev/null) || target=""

    if [[ ${started} -eq 0 || ${target} != "${shown}" ]]; then
      stop_viewer
      reset_screen
      shown=${target}
      started=1

      if [[ -n ${target} && ${target} != "-" ]]; then
        hc attach --observe "${target}" <"${inputDevice}" &
        viewer=$!
      fi
    fi

    sleep "${pollSeconds}"
  done

  stop_viewer
}

case ${1-} in
  serve) serve "${2-}" ;;
  *)
    echo "usage: preview.sh serve <state>" >&2
    exit 2
    ;;
esac
