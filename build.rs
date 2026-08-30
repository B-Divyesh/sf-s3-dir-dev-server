use std::{env, process::Command};

fn main() {
    println!("cargo:rerun-if-env-changed=S3DIR_BUILD_ID");
    println!("cargo:rerun-if-changed=.git/HEAD");
    let build_id = env::var("S3DIR_BUILD_ID")
        .ok()
        .or_else(|| {
            Command::new("git")
                .args(["rev-parse", "--short=12", "HEAD"])
                .output()
                .ok()
                .filter(|output| output.status.success())
                .and_then(|output| String::from_utf8(output.stdout).ok())
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| env::var("CARGO_PKG_VERSION").unwrap());
    println!("cargo:rustc-env=S3DIR_BUILD_ID={build_id}");
}
