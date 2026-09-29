# Validation — 2026-09-29

- Unit tests passed: GNU/BSD/clearsigned checksum parsing; exact filename and conflicting-entry rejection; streaming hashes compared with Node crypto across SHA-256 padding and 4 MiB chunk boundaries; source URL validation; redirect restrictions and 1 MiB response limits.
- Live HTTPS checksum lookups returned valid, filename-matched SHA-256 values for Linux Mint 22.3 Cinnamon, Ubuntu 24.04.4 Desktop, and Arch Linux 2026.09.01.
- Chromium browser checks passed for a real 9 MiB file, matching and mismatched hashes, invalid checksum, checksum-file import, cancellation of a 256 MiB file, and failed remote lookup.
- Desktop and 390 px mobile screenshots inspected; no horizontal mobile overflow or page runtime errors.
- Optional WebMCP status-read tool validated with a test registry for both valid and invalid inputs. Native WebMCP integration was not available for validation.
- No real multi-gigabyte ISO was downloaded or boot-tested. Browser tests used synthetic ISO-named files, including a synthetic ISO 9660 header. The application explicitly distinguishes basic header detection from a full ISO or boot test.
- This report covers pre-deployment validation; Railway deployment status is available in the Railway dashboard.
