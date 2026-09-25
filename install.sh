#!/bin/sh
set -eu

REPOSITORY="https://github.com/dxn111/sonderr.git"
BRANCH="${SONDERR_BRANCH:-main}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
BIN_DIR="${SONDERR_BIN_DIR:-$HOME/.local/bin}"
INSTALL_DIR="${SONDERR_INSTALL_DIR:-$DATA_HOME/sonderr-v1.5}"
COMMAND_PATH="$BIN_DIR/sonderr"

for command_name in git node npm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
done

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$node_major" -lt 20 ]; then
  printf 'Sonderr requires Node.js 20 or newer (found %s).\n' "$(node --version)" >&2
  exit 1
fi

if [ -e "$INSTALL_DIR" ]; then
  printf 'Install directory already exists; refusing to overwrite it: %s\n' "$INSTALL_DIR" >&2
  printf 'To keep this installation, choose a different SONDERR_INSTALL_DIR or update it manually.\n' >&2
  exit 1
fi

if [ -e "$COMMAND_PATH" ] || [ -L "$COMMAND_PATH" ]; then
  printf 'Command path already exists; refusing to replace it: %s\n' "$COMMAND_PATH" >&2
  exit 1
fi

mkdir -p "$DATA_HOME" "$BIN_DIR"
temporary_dir="$(mktemp -d "$DATA_HOME/.sonderr-install.XXXXXX")"
cleanup() {
  rm -rf -- "$temporary_dir"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

printf 'Downloading Sonderr from %s (%s)…\n' "$REPOSITORY" "$BRANCH"
git clone --depth 1 --branch "$BRANCH" "$REPOSITORY" "$temporary_dir/source"
printf 'Installing Node dependencies…\n'
npm --prefix "$temporary_dir/source" ci --omit=dev

mv "$temporary_dir/source" "$INSTALL_DIR"
ln -s "$INSTALL_DIR/bin/sonderr-1.5.js" "$COMMAND_PATH"

printf '\nSonderr installed. Start it with: sonderr\n'
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) printf 'Add %s to your PATH to use the command from any terminal.\n' "$BIN_DIR" ;;
esac
