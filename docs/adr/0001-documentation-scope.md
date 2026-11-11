# ADR 0001: Documentation scope

**Date**: 2026-11-02\
**Status**: Accepted

## Context

Feature pages duplicate behavior defined in code and tests. Maintaining both lets prose drift from
behavior.

Code shows what a feature does, but not always why it was designed that way. Koja records those
lasting reasons in ADRs.

## Decision

Koja documents decisions, not features. Koja writes no feature pages, because ADRs record decisions,
and code states behavior.

### Where content lives

- ADRs record lasting decisions and their reasons. Include only the details needed to understand or
  follow the decision.
- Code and tests state behavior.
- `docs/` holds only what no feature owns: the documentation index, the development guide, and the
  ADRs.
- The root README introduces the project and links to the rest. Topic details go in `docs/` and are
  linked from the [documentation index](../README.md).
- A tool's tuning record, such as `scripts/mutation-tuning.md`, lives next to the tool's setup. It
  states why each setting has its value and the measured runs behind it, so a later change can be
  measured the same way. It describes no feature.
- The QA guide, `.pi/qa.md`, tells a manager which sections a change needs and tells a QA agent how
  to reach the sandbox and use it safely. A feature's QA recipe lives in `.pi/qa/` and is linked
  from the guide. It tells a QA agent how to drive the feature and what proves it works: the entry
  points, the driving steps, the observable results, and the gotchas. Both are test procedures for
  an agent, not guides for readers. A change that alters an entry point or a result they name
  updates them in the same change.

### Adding and changing documents

Do not add a page that explains how a feature works. Write an ADR only for a choice with a lasting
reason and a credible alternative.

An ADR states the current decision. When its details change, edit the ADR in place. Supersede it
only when the core choice reverses. The new ADR then states the whole current rule, so a reader
never has to combine two ADRs.

The only status is Accepted. A retired ADR leaves the tree. The metadata is Date, Status, and at
most one Supersedes line and one Related line.

In ADRs and `docs/`, do not write ticket IDs, benchmark tables, version numbers, or file lists that
go stale. Name a file only when the decision is about that file. A tuning record may hold the
benchmark tables of the runs it was tuned on.

The [index](./README.md) groups current ADRs by area and ends with a Retired table. Numbers are
never reused. Git keeps the history, and `git show <commit>:docs/adr/<file>` restores a retired ADR.

## Consequences

### Positive

- Fewer descriptions of behavior to keep in sync with code.

### Negative

- Readers who want current behavior must read the code.
- A reader who wants a guided tour of a feature does not get one.
- Every change to a decision must update its ADR in the same change, or the ADR drifts from the
  code.
- The QA guide and its recipes state some behavior in prose, so it can drift from the code like a
  feature page.
- The reasoning behind an earlier version of a decision lives only in Git history.

## Alternatives considered

### A page per feature

Keep a page per feature under `docs/`. Rejected because it gives readers a guide, but duplicates
behavior defined in code and can drift as the code changes.

### A new ADR for every change

Keep each ADR as written and record every change in a new ADR that supersedes it. Rejected because
it builds chains of superseded ADRs, and a reader must combine several files to find the current
rule.
