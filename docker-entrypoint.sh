#!/bin/sh
set -eu

# Docker Compose creates a missing bind source as root on Linux. Take ownership
# while the container is still root, then run the server as its dedicated user.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown s3dir:s3dir /data
  exec su-exec s3dir "$@"
fi

exec "$@"
