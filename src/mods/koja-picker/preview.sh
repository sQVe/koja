#!/usr/bin/env bash
# The picker's preview: one terminal shown at a time, watch-only. `hc attach --observe`
# never types into or resizes the terminal it shows, so agents don't redraw.
#
#   preview.sh serve <fifo>                               runs in the preview terminal
#   preview.sh show <fifo> <session> <sequence> <address>  shows <address>; "-" shows nothing
set -u

# How many closed session ids serve remembers; older ids fall off after many sessions.
retiredLimit=32

# Each attach leaves the shown program's modes (alternate screen, hidden cursor,
# mouse tracking) on this terminal; reset them before the next one draws.
reset_screen() {
  printf '\e[?1049l\e[?1000l\e[?1002l\e[?1003l\e[?1006l\e[?2004l\e[0m\e[H\e[2J\e[?25l'
}

serve() {
  local fifo=$1
  local session_id=""
  local session_sequence=0
  local shown_target=""
  local retired=""
  local viewer=""
  local message_session message_sequence target kept id count

  stop_viewer() {
    if [[ -n ${viewer} ]]; then
      kill "${viewer}" 2>/dev/null
      wait "${viewer}" 2>/dev/null
      viewer=""
    fi
  }

  trap 'stop_viewer; exit 0' TERM INT HUP

  if [[ ! -p ${fifo} ]]; then
    mkdir -p "$(dirname "${fifo}")" || exit 1
    mkfifo "${fifo}" || exit 1
  fi

  # Open read-write so the loop never sees end-of-file between writers.
  exec 3<>"${fifo}" || exit 1
  reset_screen

  while read -r message_session message_sequence target <&3; do
    [[ ${message_session} =~ ^[A-Za-z0-9]+$ ]] || continue
    [[ ${message_sequence} =~ ^[0-9]+$ ]] || continue
    [[ -n ${target} ]] || continue

    if [[ ${message_session} == "${session_id}" ]]; then
      # The current session may only move forward.
      [[ ${message_sequence} -le ${session_sequence} ]] && continue
      session_sequence=${message_sequence}
    elif [[ " ${retired} " == *" ${message_session} "* ]]; then
      # A retired session may never bring a preview back.
      continue
    else
      # A new session retires the current one and takes over.
      if [[ -n ${session_id} ]]; then
        retired="${session_id} ${retired}"
        kept=""
        count=0
        # The ids are space separated on purpose.
        # shellcheck disable=SC2086
        for id in ${retired}; do
          count=$((count + 1))
          [[ ${count} -le ${retiredLimit} ]] || break
          kept="${kept}${kept:+ }${id}"
        done
        retired="${kept}"
      fi
      session_id=${message_session}
      session_sequence=${message_sequence}
    fi

    # A test can set KOJA_PREVIEW_LOG to record the accepted targets.
    if [[ -n ${KOJA_PREVIEW_LOG:-} ]]; then
      printf '%s\n' "${target}" >> "${KOJA_PREVIEW_LOG}"
    fi

    [[ ${target} == "${shown_target}" ]] && continue

    stop_viewer
    reset_screen
    shown_target=${target}
    [[ ${target} == "-" ]] && continue

    # attach asks this terminal for its colors and waits for the answer on stdin;
    # a background job would get /dev/null and stall for half a second.
    hc attach --observe "${target}" </dev/tty &
    viewer=$!
  done
}

show() {
  local fifo=$1
  local session=$2
  local sequence=$3
  local target=$4
  local writer
  local watchdog
  local status=0

  # Writing to a FIFO nobody reads would block, and to a missing path would
  # create a plain file.
  [[ -p ${fifo} ]] || exit 1

  # A background writer blocks until a reader opens the FIFO; a timed kill bounds it.
  # Job control gives the watchdog its own process group, so killing the group also stops
  # its sleep child. Otherwise the sleep holds this command's output open for a second.
  set -m
  printf '%s %s %s\n' "${session}" "${sequence}" "${target}" > "${fifo}" &
  writer=$!
  ( sleep 1; kill "${writer}" 2>/dev/null ) &
  watchdog=$!

  wait "${writer}" || status=1

  kill -- -"${watchdog}" 2>/dev/null
  wait "${watchdog}" 2>/dev/null

  return "${status}"
}

case ${1-} in
  serve) serve "$2" ;;
  show) show "${2-}" "${3-}" "${4-}" "${5-}" ;;
  *)
    echo "usage: preview.sh serve <fifo> | show <fifo> <session> <sequence> <address>" >&2
    exit 2
    ;;
esac
