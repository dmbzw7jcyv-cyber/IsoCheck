export function parseChecksums(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    let m = line.match(/^([a-f0-9]{64})\s+[* ]?(.+?)\s*$/i);
    if (m) rows.push({ hash: m[1].toLowerCase(), filename: m[2].replace(/^\.\//, '') });
    else {
      m = line.match(/^SHA256\s*\((.+)\)\s*=\s*([a-f0-9]{64})\s*$/i);
      if (m) rows.push({ hash: m[2].toLowerCase(), filename: m[1].replace(/^\.\//, '') });
    }
  }
  return rows;
}
export function selectHash(text, filename) {
  if (/^[a-f0-9]{64}$/i.test(text.trim())) return text.trim().toLowerCase();
  const rows = parseChecksums(text).filter(row => row.filename === filename);
  if (!rows.length) throw new Error('No SHA-256 entry matches this exact filename. Use the original ISO filename, or paste its 64-character hash.');
  const hashes = new Set(rows.map(row => row.hash));
  if (hashes.size !== 1) throw new Error('This checksum file has conflicting entries for your ISO. Get a fresh copy from the distribution.');
  return rows[0].hash;
}
