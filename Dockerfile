FROM rust:1.98-alpine AS build
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --release

FROM alpine:3.22
RUN apk add --no-cache su-exec \
  && addgroup -S s3dir \
  && adduser -S -G s3dir s3dir \
  && mkdir /data \
  && chown s3dir:s3dir /data
COPY --from=build /src/target/release/s3dir /usr/local/bin/s3dir
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
VOLUME ["/data"]
EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh", "s3dir"]
CMD ["serve", "/data", "--host", "0.0.0.0", "--port", "9000", "--cors", "*"]
