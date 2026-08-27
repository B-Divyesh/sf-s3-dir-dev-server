use clap::{Parser, Subcommand};
use std::{net::IpAddr, path::PathBuf};

#[derive(Parser)]
#[command(
    name = "s3dir",
    version,
    about = "Development-only S3 server backed by ordinary files",
    long_about = "Maps S3 buckets and keys onto a directory, with an embedded console at /ui. Accepts signed and presigned requests without authenticating them. Not for production."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Serve a directory as an S3-compatible endpoint
    Serve {
        /// Directory containing bucket folders
        #[arg(default_value = "./data")]
        directory: PathBuf,
        /// Address to bind (use 0.0.0.0 in containers)
        #[arg(long, default_value = "127.0.0.1")]
        host: IpAddr,
        /// TCP port
        #[arg(long, default_value_t = 9000)]
        port: u16,
        /// Copy missing fixtures into the data directory before serving
        #[arg(long)]
        seed: Option<PathBuf>,
        /// POST S3-style object events to this URL
        #[arg(long)]
        events: Option<String>,
        /// Allowed browser origin; repeat for several, or use *
        #[arg(long,action=clap::ArgAction::Append)]
        cors: Vec<String>,
        /// Print one JSON startup record for scripts
        #[arg(long)]
        json: bool,
    },
}

#[tokio::main]
async fn main() {
    let Cli { command } = Cli::parse();
    let result = match command {
        Command::Serve {
            directory,
            host,
            port,
            seed,
            events,
            cors,
            json,
        } => serve(directory, host, port, seed, events, cors, json).await,
    };
    if let Err(e) = result {
        eprintln!("s3dir: {e}");
        std::process::exit(1);
    }
}

async fn serve(
    directory: PathBuf,
    host: IpAddr,
    port: u16,
    seed_dir: Option<PathBuf>,
    events: Option<String>,
    cors: Vec<String>,
    json: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    tokio::fs::create_dir_all(&directory).await?;
    let seeded = if let Some(path) = seed_dir {
        s3_dir_dev_server::seed(&directory, &path).await?
    } else {
        0
    };
    let address = (host, port);
    let listener = tokio::net::TcpListener::bind(address).await?;
    let actual = listener.local_addr()?;
    if json {
        println!(
            "{}",
            serde_json::json!({"status":"ready","endpoint":format!("http://{actual}"),"ui":format!("http://{actual}/ui"),"directory":directory,"seeded":seeded})
        );
    } else {
        println!(
            "s3dir ready  http://{actual}\nconsole      http://{actual}/ui\ndirectory    {}{}",
            directory.display(),
            if seeded > 0 {
                format!("\nseeded       {seeded} files")
            } else {
                String::new()
            }
        );
    }
    axum::serve(listener, s3_dir_dev_server::app(directory, cors, events)).await?;
    Ok(())
}
