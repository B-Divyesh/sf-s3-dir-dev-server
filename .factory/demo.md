# Demo sandbox

## Entry points

- Website: `/demo/` from the deployed documentation site. The first landing-page action opens this recorded CLI sample and exposes **Reset demo** and **Start for real**.
- CLI: `s3dir demo --port 9000`.

## Sample data

The binary compiles three project-original fixtures into the executable:

- `assets/welcome.txt`
- `assets/receipts/may-2026.txt`
- `fixtures/local-stack.json`

`s3dir demo` creates a unique `s3dir-demo-<uuid>` directory beneath the operating system temporary directory, starts the normal server against it, prints the directory and local console URL, and never reads or writes a project directory. Press Ctrl-C to leave demo mode and delete the isolated directory; an abrupt kill can leave the temporary directory for operating-system cleanup.

The website route is a self-hosted terminal recording of this same bundled command. It stores no demo data. **Reset demo** restores the recording, and **Start for real** links to the ordinary installation command.
