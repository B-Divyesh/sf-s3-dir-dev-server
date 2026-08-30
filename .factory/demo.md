# Demo sandbox

## Entry points

- Website: `/?demo=1` from the deployed documentation site. It redirects into `/demo/?demo=1`, the recorded CLI sample with **Reset demo** and **Start for real**.
- CLI: `s3dir demo --port 9000`.

## Sample data

The binary compiles three project-original fixtures into the executable:

- `assets/welcome.txt`
- `assets/receipts/may-2026.txt`
- `fixtures/local-stack.json`

`s3dir demo` creates a unique `s3dir-demo-<uuid>` directory beneath the operating system temporary directory, starts the normal server against it, prints the directory and local console URL, and never reads or writes a project directory. Press Ctrl-C to leave demo mode and delete the isolated directory; an abrupt kill can leave the temporary directory for operating-system cleanup.

The website route is a self-hosted terminal recording of this same bundled command. Its only browser state is the `sessionStorage` namespace `demo:s3dir:`; it never reads or writes project data or ordinary product storage. **Reset demo** clears and recreates that namespace, restores the recording, and **Start for real** discards it before linking to the ordinary installation command.
