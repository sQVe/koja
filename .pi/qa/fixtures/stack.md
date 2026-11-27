# Stack fixture

The journeys [Check how far a stack has come](../journeys/check-how-far-a-stack-has-come.md) and
[Find the space that holds a pull request](../journeys/find-the-space-that-holds-a-pull-request.md)
use this fixture. It builds a repository with three stack branches, writes its `gh-stack` record,
and installs a fake `gh` that answers the pull read by branch name. Start a fresh sandbox first.
Replace `<name>` with its name, then run these commands from the worktree:

```sh
export RUTA_NAME=<name>
set -eu
root=/var/tmp/ruta-${RUTA_NAME:?Set the fresh sandbox name}
fixtureHome=${root}/home
repo=${fixtureHome}/stack-repo
stack=${fixtureHome}/stack-space
other=${fixtureHome}/unrelated
command -v git >/dev/null
test -x "${root}/bin/herdr-app"
touch "${fixtureHome}/.zshrc"
mkdir "${repo}" "${other}"

g() {
  env -i PATH="${PATH}" HOME="${fixtureHome}" GIT_CONFIG_NOSYSTEM=1 \
    GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0 \
    git -c core.hooksPath=/dev/null "$@"
}
commit() {
  g -C "${repo}" commit -q --allow-empty --no-gpg-sign -m "$1"
}
g -C "${repo}" init -q -b main --template=
g -C "${repo}" config user.name 'QA Fixture'
g -C "${repo}" config user.email qa@example.invalid
g -C "${repo}" remote add origin https://example.invalid/qa/stack-repo.git
commit 'Stack trunk'
trunk=$(g -C "${repo}" rev-parse HEAD)
g -C "${repo}" switch -q -c qa-stack-bottom
commit 'Stack bottom'
bottom=$(g -C "${repo}" rev-parse HEAD)
g -C "${repo}" switch -q -c qa-stack-middle
commit 'Stack middle'
middle=$(g -C "${repo}" rev-parse HEAD)
g -C "${repo}" switch -q -c qa-stack-top
commit 'Stack top'
g -C "${repo}" switch -q main
g -C "${repo}" worktree add -q "${stack}" qa-stack-top
common=$(g -C "${stack}" rev-parse --path-format=absolute --git-common-dir)
cat > "${common}/gh-stack" <<JSON
{
  "schemaVersion": 1,
  "repository": "",
  "stacks": [{
    "trunk": {"branch":"main","head":"${trunk}"},
    "branches": [
      {"branch":"qa-stack-bottom","base":"${trunk}","pullRequest":{"number":503}},
      {"branch":"qa-stack-middle","base":"${bottom}","pullRequest":{"number":504,"merged":true}},
      {"branch":"qa-stack-top","base":"${middle}","pullRequest":{"number":505}}
    ]
  }]
}
JSON

cat > "${fixtureHome}/fake-gh" <<'SH'
#!/bin/sh
set -eu
if [ "${1:-}" != api ] || [ "${2:-}" != graphql ]; then
  printf '%s\n' 'fixture gh only serves api graphql' >&2
  exit 2
fi
shift 2
printf '%s' '{"data":{"rateLimit":{"cost":1,"remaining":4999,"resetAt":"2030-01-01T00:00:00Z"},"repository":{'
separator=
while [ "$#" -ge 2 ]; do
  flag=$1
  field=$2
  shift 2
  case "${flag}:${field}" in
    -f:branch[0-9]*=*) ;;
    *) continue ;;
  esac
  index=${field%%=*}
  index=${index#branch}
  case "${index}" in ''|*[!0-9]*) continue ;; esac
  branch=${field#*=}
  if [ -n "${HOME:-}" ]; then
    printf '%s\n' "${field}" >> "${HOME}/gh-calls"
  fi
  case "${branch}" in
    qa-stack-bottom) number=503; state=OPEN; checks=FAILURE ;;
    qa-stack-middle) number=504; state=MERGED ;;
    qa-stack-top) number=505; state=OPEN; checks=SUCCESS ;;
    *) number= ;;
  esac
  open=
  latest=
  if [ -n "${number}" ]; then
    latest=$(printf '{"number":%s,"state":"%s","isDraft":false,"title":"Fixture PR %s","headRefName":"%s"}' \
      "${number}" "${state}" "${number}" "${branch}")
    if [ "${state}" = OPEN ]; then
      open=$(printf '%s,"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","reviewDecision":"APPROVED","commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"%s"}}}]},"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[]}}' \
        "${latest%?}" "${checks}")
    fi
  fi
  printf '%s"open%s":{"nodes":[%s]},"latest%s":{"nodes":[%s]}' \
    "${separator}" "${index}" "${open}" "${index}" "${latest}"
  separator=,
done
printf '%s\n' '}}}'
SH
chmod +x "${fixtureHome}/fake-gh"
ln -s "${fixtureHome}/fake-gh" "${root}/bin/gh"
g -C "${stack}" symbolic-ref --short HEAD
bun run sandbox 'do' space.new --folder "${stack}"
bun run sandbox 'do' space.new --folder "${other}"
bun run sandbox identity
```

- Start: the commands build `stack-repo` with `qa-stack-bottom`, `qa-stack-middle`, and
  `qa-stack-top` on one stack, write the record with PR numbers 503, 504, and 505, and open one
  space on a linked worktree of the top branch plus one space on an empty folder. The sandbox puts
  its `bin` first on `PATH`, so the fake `gh` answers every read and no read reaches GitHub. Do not
  open a space on `stack-repo` itself: the worktree on the top branch is the space under test.
- Check that it is up: identity exits 0, the sidebar shows one row under the `stack-repo` header
  reading its pull request's title, `Fixture PR 505`, with `unrelated` selected, and that row ends
  with the red CI failing icon. `$fixtureHome/gh-calls` records a read of all three branches. Only
  the middle branch's latest PR is merged, so the reason line of the journey shows `merged`. The
  sandbox window is mapped but never active, and PR reads start there because they follow `visible`,
  not `active`.
- Shot: `bun run sandbox shot <slice directory>/stack-fixture.png`.
- Stop: the `verification` tool, which runs `bun run sandbox down`.
