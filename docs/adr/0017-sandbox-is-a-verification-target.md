# ADR 0017: The sandbox is a verification target

**Date**: 2026-11-17\
**Status**: Accepted\
**Related**: [ADR 0006 (Install real files with an allowlisted installer)](./0006-install-real-files.md)

## Context

QA drives Koja's window in a ruta sandbox. Today the manager starts and stops that sandbox from
prose steps, and the evidence is a worker's report. Two managers cannot run QA at the same time,
because every sandbox has the fixed name `koja` and `ruta up` replaces an existing window.

Tau's app verification contract lets a repository declare named targets with launch, doctor, and
stop argv. Tau runs them, names each run, and keeps a run record that `pr` and finish-slice read.

The sandbox doctor must also catch a window that runs a build other than the checkout's. It compared
file times: every shipped input's time at the install was recorded and compared with the current
time. A time moves when content does not, such as a re-checkout of the same bytes, and a copy can
keep old content with old times.

## Decision

Declare one `sandbox` target in `.pi/tau.json`, and let Tau launch, check, and stop it.

The doctor is `bun run sandbox identity`. It compares the installed mods and config with the
checkout by content hash, not by time: the install record holds the SHA-256 of every shipped input.
It also requires the record to mark its install complete. An ordinary version 1 record names no
origin, so the doctor reports `recordWithoutOrigin`. A version 2 record can show that its checks
passed, but not that config and cleanup finished, so the doctor reports `installIncomplete` until
the next install writes a version 3 record.

The sandbox name comes from the run. When Tau sets `TAU_VERIFICATION_RUN`, the name is `koja-<run>`,
lowercased to fit ruta's name pattern. Otherwise the name is `RUTA_NAME`, then `koja`. The run name
wins over `RUTA_NAME`, because Tau passes the manager's environment to launch and doctor.

A name belongs to the checkout that installed it. `scripts/sandbox` refuses to start, change, or
remove a sandbox whose install record names another checkout, before it runs ruta, and it names that
checkout. The record's checkout decides, even when an older installer wrote it without input hashes.
A checkout that no longer exists holds nothing, so its name is free to take over or remove.
`identity` still runs instead of refusing, so a session can still ask who serves a name:
`ruta status` names the folder that started the sandbox.

## Consequences

### Positive

- The manager launches and stops QA with the `verification` tool, and the run record holds the tree
  identity, the platform, and each command's result.
- Parallel runs keep separate windows, separate homes, and separate fixture folders.
- A sandbox that runs a build other than the checkout's fails the doctor, whatever the file times
  say.
- A second checkout cannot take over, and then remove, the sandbox another checkout is using.
- The QA recipes become feature files with a target, so the guide declares what to launch.

### Negative

- `.pi/tau.json` gains a key that only a trusted project may hold, like `fullCheck.argv`.
- The install record is version 3. A sandbox installed by an older Koja fails the doctor until the
  next `bun run sandbox up`, which rewrites the record. Version 1 and version 2 records still parse,
  but their success flag never counts as a completed install.
- A by-hand session must pass `RUTA_NAME` when no verification run names the sandbox.

## Alternatives considered

### Keep the prose start and stop steps

Leave the sandbox outside Tau's contract. Rejected because the evidence stays prose, `pr` cannot see
it, and two runs still share one name.

### Keep time-based identity

Record each shipped input's time again. Rejected because a time changes without a content change,
and a copied checkout can change content without a new time. The doctor must answer whether the
window runs this content.
