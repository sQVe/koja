# ADR 0019: One action catalog drives keys, help, search, and the CLI

**Date**: 2026-10-26\
**Status**: Accepted\
**Related**: [ADR 0008 (Capability modules with an enforced import table)](./0008-capability-modules.md),
[ADR 0010 (Every UI feature has a CLI equal)](./0010-cli-parity.md)

## Context

The normal-mode keys lived in several maps inside the input router. A new view, such as shortcut
help or action search, needs the same list of actions with their keys and titles. The CLI needs the
same actions by name. Separate copies would drift, and a key could change without its help or search
entry changing. ADR 0010 requires each UI feature to have a CLI command that sends the same intent,
so both readers need one definition.

## Decision

`src/actions.ts` holds one catalog of actions. Each entry has a stable id such as `pane.zoom`, a
title, its normal-mode keys, its intent, whether the CLI can run it, and an availability check. The
input router finds a key in the catalog and runs the entry's intent. Changing a key in the catalog
changes routing.

### Availability

- An availability check reads the store snapshot and the target the action acts on: a workspace and
  a pane. The UI targets what the user sees. The CLI targets the default view, or the id its flags
  name.
- An action whose availability check fails does not run. Its key sends no request and no bytes.
- Pane actions need a viewed pane. Focus moves need a neighbor pane in the same tab. Tab next and
  previous need more than one tab, and workspace next and previous need more than one workspace.

### Intents

- An intent names an existing effect: a pane action, a workspace key, a tab route, entering scroll
  mode, or detaching. The catalog does not hold a second execution path.
- The catalog holds only actions that exist in the UI now. A view that needs its own state, such as
  search or help, adds its entry when it is built.

## Consequences

### Positive

- Keys, help, search, and the CLI read one definition, so they cannot disagree.
- The router no longer names each action. Tests can route through a changed catalog.

### Negative

- Every action is a catalog entry. A small key change still touches one shared module.
- An action with no availability rule must still state one, which adds a line to each entry.

## Alternatives considered

### Keep one map per module

Each module keeps its own key table, as the router did before. Rejected because help, search, and
the CLI would each copy the bindings, and they would drift.

### Derive the catalog from the router

The router keeps the bindings and exports a list for help and search. Rejected because the CLI would
then import the UI to read the actions, and the UI would still own the definitions.
