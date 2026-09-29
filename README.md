# ISO Check

A dark, Mint-green Linux ISO verifier with Railway and Cloudflare Worker deployment support. No accounts, file uploads, database, tracking scripts, or retained file history.

## Run

Requires Node.js 24. Run `npm ci`, then `npm start`, and open http://localhost:3000. Run `npm test` for checksum, streaming hash, source validation, and bounded-fetch tests.

## Deploy to Railway

1. Put the contents of this folder at the root of a GitHub repository connected to Railway.
2. Create a Railway project and choose **Deploy from GitHub repo**; select that repository.
3. Railway builds the included Dockerfile. The app listens on `0.0.0.0` using Railway's `PORT` environment variable.
4. Add a generated public domain in the service's Networking settings.

`railway.json` sets the startup command and `/health` health check. No secrets, database, persistent volumes, or additional configuration are required. Hosting remains subject to your Railway plan and usage charges.

## Features and limits

- Choose Linux Mint, Ubuntu, Arch, Debian, Fedora, Bazzite, or another Linux distribution.
- Automatic SHA-256 lookup for standard stable Mint (Cinnamon/MATE/Xfce), Ubuntu Desktop/Live Server, and dated Arch x86_64 filenames. There is no fixed release catalog; release numbers are parsed from the original filename and requested from allowlisted sources. Source availability determines support for older and newer releases.
- Other images, including LMDE, HWE, betas, renamed files, and unavailable archives, use a manually supplied SHA-256 hash or checksum text file. No unsupported image is silently approved.
- GNU SHA256SUMS, BSD/Fedora `SHA256 (filename) = hash`, and checksum lines in clearsigned text are supported. **Parsing a signed file does not verify its signature.** Duplicate conflicting entries are rejected. Manifest matching uses the exact filename, including case.
- Hashing uses vendored hash-wasm 4.12.0 (MIT), WebAssembly, and a Web Worker, reading 4 MiB at a time. Memory use does not grow with ISO size. An active browser tab and continued file access are required; mobile browsers may suspend background work.
- Progress, cancel/retry, missing file, mismatch, lookup timeout, read failure, and unknown format states.
- A basic ISO 9660 primary-volume header probe is reported separately. This is not a complete ISO filesystem, partition, hardware compatibility, or bootability test. UDF-only formats may not have this header.
- A match proves equivalence to the selected expected checksum, not that the file is free of malware. This app does not perform PGP signature verification. Manual hashes have no authenticated provenance. Official lookups use HTTPS sources linked by the projects, without independently verifying signing keys.
- ISO contents and computed hashes never go to the server. Official lookup sends the selected distribution and filename; hosting infrastructure may log HTTP requests. The app itself keeps only an in-memory one-hour cache of public checksum manifests.
- Fetches use HTTPS host restrictions, checked redirects, 15-second timeout, 1 MiB limit, bounded cache, and a concurrent lookup limit. The API is not an arbitrary-URL proxy.

## Official references

- Mint verification: https://linuxmint-installation-guide.readthedocs.io/en/latest/verify.html
- Mint checksum source: https://mirrors.edge.kernel.org/linuxmint/stable/22.3/sha256sum.txt
- Ubuntu verification: https://ubuntu.com/tutorials/how-to-verify-ubuntu
- Ubuntu release checksums: https://releases.ubuntu.com/
- Arch checksums and signing instructions: https://archlinux.org/download/

No checksum values are hard-coded. Inaccessible sources always result in an unverified state with a manual fallback.

## Project layout

`server.mjs` serves the UI and allowlisted checksum lookup. `public/app.mjs` handles UI state. `public/hash-worker.js` streams local files into SHA-256. `public/checksums.mjs` parses manifests. `public/vendor/` includes the browser hashing library and its license.

## Cloudflare build

Run `npm run build` to emit the standalone Worker at `dist/server/index.js`. It embeds the static assets and preserves the same restricted checksum lookup API. Sites manages the Cloudflare deployment. The original Node server and Railway deployment files remain available.
