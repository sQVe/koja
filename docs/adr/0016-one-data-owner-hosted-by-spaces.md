# ADR 0016: One data owner hosted by koja-spaces

**Date**: 2026-11-13\
**Status**: Accepted\
**Related**: [ADR 0004 (Separate mods that share one UI kit)](./0004-separate-mods-one-kit.md),
[ADR 0005 (TypeScript mods bundled into one file each)](./0005-typescript-bundled-per-mod.md)

## Context

Several surfaces need the same external facts. Bundling shared reader code into each mod gives
neither a shared runtime cache nor a shared scheduler. Only one running owner can deduplicate
scheduled reads across consumers and mod copies.

A Herdr layout block hidden from first launch never runs its initialization. Showing the same block
starts it at once, so a hidden headless mod cannot own startup reads. The sidebar normally shows at
launch, but hiding it persists across restarts and prevents `koja-spaces` from starting.

Shared writes are visible to other copies at once, and the last writer wins. Herdr has no
compare-and-set operation. It has no second OS window, but an in-app overlay window starts its own
mod copy in the same shared store. A host therefore cannot assume that it is the only copy.

## Decision

Keep shared non-UI data code in `src/data/`, with one running owner hosted by `koja-spaces` as the
only scheduler of external background reads.

### Ownership and boundaries

`src/data/` is a second shared folder beside `src/kit/`, extending ADR 0004 without making the kit
own external data. The host code lives outside the mod, so moving it to another host changes one
import and its startup call rather than moving scheduling logic into a surface.

Later background readers must follow this ownership rule. Establishing the host adds no external
reader and does not move the existing readers. Action-time reads and confirmed writes stay in their
own mods, so a user action does not wait for the background scheduler. `koja-changes` keeps its own
git reads until its panel is replaced; it is the named exception to background ownership.

### Shared ownership and freshness

The snapshot, lease, and heartbeat use separate versioned shared keys. The lease uses a unique owner
ID per copy and a generation to fence out an owner that has lost ownership. Ownership must be
checked against the shared store, because a local claim alone cannot establish ownership without
compare-and-set. Heartbeat expiry allows another copy to take over with a new generation. The
ownership scope is one Herdr app instance and its shared store, not separate app homes.

Consumers use a heartbeat deadline to distinguish live data from stale data without waiting for
another shared write. Missing or invalid shared data is unavailable. Keeping the heartbeat apart
from the snapshot separates publisher liveness from changes in facts. Publish snapshots only when
facts change, because each shared write redraws every mod; heartbeat renewal must not create a new
snapshot revision.

## Consequences

### Positive

- One running owner avoids duplicate scheduled reads as more consumers and mod copies appear.
- External data code stays outside UI surfaces and the kit, so the host remains replaceable.
- Consumers can distinguish a stopped publisher from unchanged facts.
- Action-time reads and confirmed writes remain independent of background scheduling.

### Negative

- A sidebar hidden from launch starts no host. Consumers show unavailable or stale data until the
  sidebar shows and `koja-spaces` starts.
- Hot reload stops the old copy without calling `close()`. The next copy must wait for heartbeat
  expiry before takeover, and consumers show stale data during the expiry-to-takeover gap.
- Last-writer-wins storage requires ownership checks and generation fencing rather than relying on a
  mod copy being a singleton.
- Heartbeats still cause shared writes and redraws even when facts do not change.

## Alternatives considered

### A hidden headless mod

Put a dedicated data host in a hidden layout block. Rejected because a block hidden from first
launch never initializes, so it cannot start background reads.

### Each consumer reads for itself

Share reader code but let each consumer schedule its own reads. Rejected because bundling gives each
mod its own runtime state, multiplying external reads and allowing surfaces to show different facts.

### The tab strip as host

Start the same host code from the tab strip. Rejected because `koja-spaces` is the chosen startup
surface, and another UI host does not remove the dependency on a shown block. Keeping the host
outside the mod preserves this option if the startup surface changes.
