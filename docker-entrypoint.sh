#!/bin/sh
set -eu

# Docker Compose creates a missing bind source as root on Linux. Take ownership
# while the container is still root, then run the server as its dedicated user.
data_dir="${S3DIR_DATA_DIR:-/data}"
s3dir_user="${S3DIR_USER:-s3dir}"
s3dir_group="${S3DIR_GROUP:-$s3dir_user}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$data_dir"
  chown "$s3dir_user:$s3dir_group" "$data_dir"
  exec su-exec "$s3dir_user" "$@"
fi

exec "$@"
