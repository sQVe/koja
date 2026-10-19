# ADR 0014: Stop ends pane processes through a systemd scope per pane

**Date**: 2026-10-12\
**Status**: Accepted\
**Related**: [ADR 0002 (Bun as runtime, package manager, test runner, and PTY)](./0002-bun-runtime-and-pty.md),
[systemd cgroup delegation](https://systemd.io/CGROUP_DELEGATION/)

## Context

Stopping the server must end every process that a pane started. The server can only end the
processes it can find.

A process can leave its pane's session and process group with `setsid`. A process also leaves the
process tree when its parent exits. So the session, the process group, and the parent links do not
mark every pane process.

A cgroup marks every process started inside it, and a process cannot leave without write access to
another cgroup. But on a systemd machine, systemd owns the cgroup tree. The server inherits a cgroup
from the program that started it, such as the terminal's scope, which systemd does not delegate.
systemd's rules forbid creating cgroups below a cgroup that is not delegated, and do not promise to
leave such cgroups alone.

Koja runs on Linux, and macOS may follow. macOS has no cgroups and no public way to keep a process
inside a group after `setsid`.

## Decision

The server starts each pane's shell in its own systemd user scope with `systemd-run --user --scope`,
and stop ends the scope. A scope is a cgroup that systemd creates and owns for us, so the server
gets the cgroup boundary while following systemd's rules.

### Scopes

- The scope starts with the shell, before the shell runs any command, so every child starts inside.
- The shell keeps the process id that the server spawned, so it stays the leader of the PTY session.
- Stop sends SIGHUP to every process in the scope, waits the bounded grace time, then sends SIGKILL
  to what is left.

### Without systemd

- When the server cannot start a user scope, the pane runs without one, and stop falls back to the
  session stop: SIGHUP to every process group in the shell's session, then SIGKILL after the grace
  time.
- The server logs which boundary it uses, so a user can see why a `setsid` process survived.
- macOS will need its own way to find the shell's session when Koja supports it, and it keeps the
  session stop's limits.

## Consequences

### Positive

- A pane process that calls `setsid`, or whose parent exits, ends when the server stops.
- systemd tracks and kills every process in the scope, so a process cannot fork past the kill.

### Negative

- Starting a pane takes longer, since it waits for systemd to create the scope.
- A process the user detaches with `nohup` or `setsid` also ends. To keep a process, the user starts
  it outside the pane's scope, such as with `systemd-run --user`.
- A server started from a pane of another server lives in that pane's scope, so stopping the first
  server ends the second.
- Without a systemd user manager, such as in some containers, CI runners, and on macOS, a `setsid`
  process still survives stop.

## Alternatives considered

### Cgroups created below the server's cgroup

The server creates a cgroup per pane below its inherited cgroup and kills it with `cgroup.kill`.
This works without a systemd call. Rejected because the inherited cgroup is usually a systemd scope
that is not delegated, and systemd's rules forbid creating cgroups there.

### Server as child subreaper

The server calls `prctl(PR_SET_CHILD_SUBREAPER)`, so orphaned pane processes move to the server, and
stop walks the server's process tree. Rejected because Bun does not reap children it did not spawn,
so every orphan stays a zombie until the server exits. The walk also races with forks, which a
cgroup kill does not.

### Keep the session stop

Signal only the process groups in the shell's session, as tmux, zellij, screen, WezTerm, and kitty
reach only the shell's pid, process group, or terminal. Rejected as the main boundary because a
`setsid` process survives. It stays as the fallback, since it needs only `/proc`.
