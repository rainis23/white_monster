#!/bin/sh
# Downloads the MakeHuman assets (CC0) that build.py needs into tools/avatar/.cache:
# the base mesh, skeleton, skin weights and eyes from the MakeHuman repository,
# and the compiled shape targets from the MakeHuman 1.3.2 wheel on PyPI.
set -eu
cd "$(dirname "$0")"
mkdir -p .cache

if [ ! -f .cache/makehuman/makehuman/data/3dobjs/base.obj ]; then
  rm -rf .cache/makehuman
  git clone --filter=blob:none --no-checkout https://github.com/makehumancommunity/makehuman .cache/makehuman
  git -C .cache/makehuman sparse-checkout set makehuman/data/3dobjs makehuman/data/rigs makehuman/data/eyes
  git -C .cache/makehuman checkout -q a8bc2d54ff0ac92e78ff71431b1023eda42bf482
fi

if [ ! -f .cache/targets.npz ]; then
  python3 -m pip download --quiet --no-deps --only-binary=:all: -d .cache makehuman==1.3.2
  python3 -c "import zipfile; open('.cache/targets.npz', 'wb').write(zipfile.ZipFile('.cache/makehuman-1.3.2-py3-none-any.whl').read('makehuman/data/targets.npz'))"
  rm .cache/makehuman-1.3.2-py3-none-any.whl
fi
echo "MakeHuman assets ready in $(pwd)/.cache"
