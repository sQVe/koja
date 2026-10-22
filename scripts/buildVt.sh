#!/usr/bin/env bash
# Build build/libkoja-vt.so: src/vt/shim.c linked with libghostty-vt built from a pinned Ghostty
# commit with patches/*.patch applied. Zig and the Ghostty source are cached under
# ${XDG_CACHE_HOME:-$HOME/.cache}/koja; nothing is installed system-wide.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo "build:vt supports Linux x86_64 only, not $(uname -s) $(uname -m)." >&2
  exit 1
fi

zig_version=0.16.0
zig_sha256=70e49664a74374b48b51e6f3fdfbf437f6395d42509050588bd49abe52ba3d00
ghostty_commit=83edd491e3024ae5e50393d62877b8897da1cccd
cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/koja"
zig_dir="$cache_dir/zig-$zig_version"
# Zig fetches Ghostty's build dependencies into its global cache. Keeping it here lets one cache
# directory hold every download.
export ZIG_GLOBAL_CACHE_DIR="$cache_dir/zig-cache"

mkdir -p "$cache_dir"

# Each download goes to a temporary path first, so an interrupted run leaves no partial directory.
if [[ ! -x "$zig_dir/zig" ]]; then
  rm -rf "$zig_dir.tmp" "$zig_dir.tar.xz"
  curl -fsSL "https://ziglang.org/download/$zig_version/zig-x86_64-linux-$zig_version.tar.xz" -o "$zig_dir.tar.xz"
  echo "$zig_sha256  $zig_dir.tar.xz" | sha256sum -c --quiet
  mkdir -p "$zig_dir.tmp"
  tar -xJf "$zig_dir.tar.xz" -C "$zig_dir.tmp" --strip-components=1
  rm "$zig_dir.tar.xz"
  mv "$zig_dir.tmp" "$zig_dir"
fi

source_dir="$cache_dir/ghostty-$ghostty_commit-source"

if [[ ! -d "$source_dir" ]]; then
  rm -rf "$source_dir.tmp"
  git init -q "$source_dir.tmp"
  git -C "$source_dir.tmp" fetch -q --depth 1 https://github.com/ghostty-org/ghostty.git "$ghostty_commit"
  git -C "$source_dir.tmp" checkout -q FETCH_HEAD
  mv "$source_dir.tmp" "$source_dir"
fi

# The tree name holds the ordered patch names and contents, so a changed or removed patch selects a
# different tree instead of leaving an old patch applied.
patch_digest="$(sha256sum patches/*.patch | sha256sum | cut -c1-16)"
ghostty_dir="$cache_dir/ghostty-$ghostty_commit-$patch_digest"

if [[ ! -d "$ghostty_dir" ]]; then
  scratch_dir="$(mktemp -d "$ghostty_dir.XXXXXX")"
  cp -a "$source_dir/." "$scratch_dir"
  for patch in "$PWD"/patches/*.patch; do
    if ! git -C "$scratch_dir" apply "$patch"; then
      rm -rf "$scratch_dir"
      echo "$(basename "$patch") does not apply to Ghostty $ghostty_commit." >&2
      exit 1
    fi
    echo "applied $(basename "$patch")"
  done
  # mv -T fails when another build created the target first; that build's tree is used instead.
  if ! mv -T "$scratch_dir" "$ghostty_dir" 2>/dev/null; then
    rm -rf "$scratch_dir"
  fi
fi

mkdir -p build
ln -sfn "$ghostty_dir" "$PWD/build/ghostty"

(cd "$ghostty_dir" && "$zig_dir/zig" build -Demit-lib-vt=true -Doptimize=ReleaseFast)
"$zig_dir/zig" cc -O2 -shared -fPIC -I"$ghostty_dir/include" \
  -DKOJA_GHOSTTY_COMMIT="\"$ghostty_commit\"" src/vt/shim.c \
  "$ghostty_dir/zig-out/lib/libghostty-vt.a" -o build/libkoja-vt.so
echo "built build/libkoja-vt.so"
