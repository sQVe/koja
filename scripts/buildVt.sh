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

temporary_paths=()
trap 'rm -rf "${temporary_paths[@]}"' EXIT

publish() {
  local temporary="$1" target="$2"
  # mv -T fails when another build published the target first; that build's copy is used instead.
  if ! mv -T "$temporary" "$target" 2>/dev/null; then
    if [[ ! -d "$target" ]]; then
      echo "Could not move $temporary to $target." >&2
      exit 1
    fi
    rm -rf "$temporary"
  fi
}

if [[ ! -x "$zig_dir/zig" ]]; then
  zig_archive="$(mktemp --suffix=.tar.xz "$zig_dir.XXXXXX")"
  zig_scratch="$(mktemp -d "$zig_dir.XXXXXX")"
  temporary_paths+=("$zig_archive" "$zig_scratch")
  curl -fsSL "https://ziglang.org/download/$zig_version/zig-x86_64-linux-$zig_version.tar.xz" -o "$zig_archive"
  echo "$zig_sha256  $zig_archive" | sha256sum -c --quiet
  tar -xJf "$zig_archive" -C "$zig_scratch" --strip-components=1
  publish "$zig_scratch" "$zig_dir"
fi

source_dir="$cache_dir/ghostty-$ghostty_commit-source"

if [[ ! -d "$source_dir" ]]; then
  source_scratch="$(mktemp -d "$source_dir.XXXXXX")"
  temporary_paths+=("$source_scratch")
  git init -q "$source_scratch"
  git -C "$source_scratch" fetch -q --depth 1 https://github.com/ghostty-org/ghostty.git "$ghostty_commit"
  git -C "$source_scratch" checkout -q FETCH_HEAD
  publish "$source_scratch" "$source_dir"
fi

shopt -s nullglob
patches=(patches/*.patch)
shopt -u nullglob
patch_digest="$(for patch in "${patches[@]}"; do sha256sum "$patch"; done | sha256sum | cut -c1-16)"
ghostty_dir="$cache_dir/ghostty-$ghostty_commit-$patch_digest"

if [[ ! -d "$ghostty_dir" ]]; then
  ghostty_scratch="$(mktemp -d "$ghostty_dir.XXXXXX")"
  temporary_paths+=("$ghostty_scratch")
  cp -a "$source_dir/." "$ghostty_scratch"
  for patch in "${patches[@]}"; do
    if ! git -C "$ghostty_scratch" apply "$PWD/$patch"; then
      echo "$(basename "$patch") does not apply to Ghostty $ghostty_commit." >&2
      exit 1
    fi
    echo "applied $(basename "$patch")"
  done
  publish "$ghostty_scratch" "$ghostty_dir"
fi

mkdir -p build
ln -sfn "$ghostty_dir" "$PWD/build/ghostty"

(cd "$ghostty_dir" && "$zig_dir/zig" build -Demit-lib-vt=true -Doptimize=ReleaseFast)
"$zig_dir/zig" cc -O2 -shared -fPIC -I"$ghostty_dir/include" \
  -DKOJA_GHOSTTY_COMMIT="\"$ghostty_commit\"" src/vt/shim.c \
  "$ghostty_dir/zig-out/lib/libghostty-vt.a" -o build/libkoja-vt.so
echo "built build/libkoja-vt.so"
