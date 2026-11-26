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

Scheduled Git identity reads follow this ownership rule. Only the copy that holds the lease starts
them, so one `koja-spaces` copy reads identity for every consumer. Losing the lease stops new
scheduling and closes the watches that copy opened. A Git command already running may finish, and
the lease fence drops its result instead of publishing it. Scheduled PR reads and Retry requests
follow the same rule: only the lease holder reads PR lists and writes their outcomes, and a consumer
writes only its own request. Action-time reads and confirmed writes stay in their own mods, so a
user action does not wait for the background scheduler. `koja-changes` keeps its own git reads until
its panel is replaced.

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
snapshot revision. Compare facts by content, so a reordered map is not a change. PR read times live
in their own versioned key, so an unchanged PR read writes no snapshot revision. PR Retry is a
correlated request: each consumer writes its own request into a shared requests key and re-asserts
it until answered, so a list entry another writer dropped returns. Only the owner writes outcomes,
keyed by the request's consumer and ID, and a consumer drops its request once its outcome appears.
The owner derives the outcome list from the live requests each time, so an outcome disappears with
its request and comes back if a client re-asserts it. The owner treats a stored outcome as an
answer, so a request answered by a previous owner is never taken again.

### Pull reads

Open pull requests are read by the live branch names of the repository's worktrees, not from a paged
list, so a pull request past any page limit is still read. Each repository is read under a
per-repository budget in three cases. The periodic read runs at most once per minute while the
window is active. A push read is coalesced into the next due read instead of adding a read beside
it. The manual Retry joins the read in flight or starts one when the user asks.

### Stack reads

Each space's stack comes from the repository's `gh-stack` record, the file `gh stack` writes at
`<git-common-dir>/gh-stack`. The lease holder reads it, so one copy serves every consumer, and it
watches the record's common directory so a change re-reads it. A repository is read when it first
appears in the Git facts and after such a change; a repository with no checkout is not read. One
read takes the record and the repository's branch heads from one `git for-each-ref`, so a branch's
restack need is Koja's own rule: a recorded base that is not the current head of the branch below
it. A record that does not parse keeps the last good stacks and marks the repository, and a missing
record clears them without a failure. A branch of a stack that holds a checked-out branch joins that
repository's PR reads, and its ticket joins the tracker's reads, with one level of parent.

### Sandbox remote fixture ownership

The sandbox remote fixture starts its server in a private, per-run cgroup owned by a transient
systemd user service. The client and the rest of the sandbox stay outside that service. The fixture
checks the user's cgroup support before launch.

The cgroup, not a process tree, identifies the server side. systemd places the service's processes
in the cgroup and every descendant inherits it, so an SSH session helper, a remote core, or a
terminal that detaches or is reparented still belongs to it. A numeric PID is reused, and a
reparented process leaves its parent's PID path, so neither a PID nor ancestry identifies the
fixture later.

Each run uses a random, never-reused private unit name that only Koja manages. Under that exclusive
lifecycle, Koja holds the fixture lock and verifies the exact transient invocation and cgroup
immediately before the stop. If a visible replacement or missing proof fails that check, teardown
sends no stop, reports that it could not establish cleanup, and keeps the ownership record. After a
stop is sent, a populated cgroup is incomplete cleanup: teardown reports it and keeps the record.
`StopUnit` takes a unit name, not an invocation ID, so this is not an unconditional exact-invocation
guarantee: another actor that manages the same private name between the check and the stop can
receive the signal. A post-stop check detects some races but cannot undo a signal. Process paths,
environment text, PID files, process trees, and numeric PIDs never authorize a signal.

The fixture writes two proof records. `ownership.json` uses version 2 and `launch-receipt.json` uses
version 1, each with its own `version` field. A reader validates the raw JSON against the exact
current schema before extracting any field. It rejects unknown fields, multiple JSON values,
malformed encodings, and a cgroup other than the one derived from the validated service name. No
fixture proof format shipped before these two, so ownership version 1 and the earlier unversioned
receipt are retired without compatibility support. Neither record alone relaxes the launch or stop
checks.

Unusable proof fails closed and leaves the records and fixture artifacts unchanged. It makes no
launch, adoption, rewrite, unregistration, or stop call. The notice names the record kind and reason
without printing record contents. For a retired record it says: "Use the exact checkout that created
this fixture only if it can still prove ownership and stop it safely. Otherwise leave the artifacts
and processes alone." For a newer record it directs the user to a checkout that supports that
version. For malformed current proof it reports the invalid record and that cleanup did not run,
without suggesting an edit.

### Snapshot versions

The snapshot is a saved record, so a field change bumps its `version`. The current reader accepts
version 7, which holds Git facts, per-repository PR facts, per-repository tracker facts, and
per-repository stacks, and rejects unknown fields. Each PR carries its mergeability, merge state,
review decision, checks, and threads, and each of the last two is a part that is read, failed with
its last good value, or unread. Each tracker carries the workspace the repository names, or null, a
map of ticket facts keyed by ticket id, and whether the last read of that repository failed; a
failed read keeps the last good tickets and marks the whole repository, not one ticket. Each ticket
fact carries its id, title, state, URL, and parent. Each repository's stacks carry the parsed stacks
and whether the last read failed; a failed read keeps the last good stacks. A stack carries its
trunk branch and its branches bottom to top, and each branch its name, its pull request number or
null, and whether it needs a restack. Version 6 is the previous supported format: it held the same
facts without the stack map, so the reader returns a version 7 snapshot with no stacks. Version 5
held the same facts as version 6, and each ticket also carried a failure flag that stayed false, so
the reader drops that retired field and returns a version 7 snapshot. Version 4 held Git facts and
per-repository PR facts, so the reader parses them and returns a version 7 snapshot with no tracker
or stack facts. Version 3 held only the PR list fields, so the reader parses them and gives each PR
the unread parts, from which no need is derived. Version 2 held only Git facts, so the reader parses
them and returns a version 7 snapshot with no PR, tracker, or stack facts. Version 1 carried no
facts: its `facts` was `Record<string, never>`, and the next owner publish rewrites it. A version 1
snapshot is therefore retired silently, because no user action applies. This is the one exception to
the notices that [shared ADR 0008](../stomme/shared/adr/0008-backwards-compatibility.md) requires
for saved formats.

A malformed version 7, 6, 5, 4, 3, or 2 record, or a present record without a valid version, is
logged once per mod copy with a message that the host rebuilds the snapshot on its next publish. A
positive whole version above 7 is logged once per mod copy with a message that names the update.
Each reason logs once per loaded mod copy, and later reads stay silent.

PR read times carry their own version. Version 2 keeps, per repository, one list time and a time per
checks part and per threads part, so a failed part shows its own age while the parts that were read
move to the new time. Version 1 held one time per repository, which the reader treats as the list
time with no part times; the next changed publish writes version 2. A part key is a PR number
written as a positive whole number in canonical form, and any other key makes the record malformed.

## Consequences

### Positive

- One running owner avoids duplicate scheduled reads as more consumers and mod copies appear.
- External data code stays outside UI surfaces and the kit, so the host remains replaceable.
- Consumers can distinguish a stopped publisher from unchanged facts.
- Action-time reads and confirmed writes remain independent of background scheduling.
- A detached server process stays owned after its parent exits, because the cgroup, not ancestry,
  records its membership.

### Negative

- A sidebar hidden from launch starts no host. Consumers show unavailable or stale data until the
  sidebar shows and `koja-spaces` starts.
- Hot reload stops the old copy without calling `close()`. The next copy must wait for heartbeat
  expiry before takeover, and consumers show stale data during the expiry-to-takeover gap.
- Last-writer-wins storage requires ownership checks and generation fencing rather than relying on a
  mod copy being a singleton.
- Heartbeats still cause shared writes and redraws even when facts do not change.
- The fixture stop guarantee rests on Koja being the only manager of each private unit name. Another
  actor that manages the same name is outside it.

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
