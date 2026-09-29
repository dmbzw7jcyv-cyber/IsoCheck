import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { selectHash } from './public/checksums.mjs';

const root = new URL('./public/', import.meta.url);
export function checksumURL(distro, filename) {
  let m;
  if (distro === 'mint' && (m = filename.match(/^linuxmint-(\d{1,2}(?:\.\d{1,2})?)-(?:cinnamon|mate|xfce)-64bit(?:-edge)?\.iso$/)))
    return `https://mirrors.edge.kernel.org/linuxmint/stable/${m[1]}/sha256sum.txt`;
  if (distro === 'ubuntu' && (m = filename.match(/^ubuntu-(\d{2}\.\d{2}(?:\.\d{1,2})?)-(?:desktop|live-server)-(?:amd64|arm64)\.iso$/)))
    return `https://releases.ubuntu.com/${m[1]}/SHA256SUMS`;
  if (distro === 'arch' && (m = filename.match(/^archlinux-(\d{4}\.\d{2}\.\d{2})-x86_64\.iso$/)))
    return `https://archlinux.org/iso/${m[1]}/sha256sums.txt`;
  throw new Error('Automatic lookup needs a supported, original release filename. For renamed, older, beta, or other images, use a published checksum.');
}
const allowedHosts = new Set(['mirrors.edge.kernel.org', 'mirrors.kernel.org', 'releases.ubuntu.com', 'old-releases.ubuntu.com', 'archlinux.org']);
export async function fetchManifest(url, fetcher = fetch) {
  const signal = AbortSignal.timeout(15000);
  for (let i = 0; i < 4; i++) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname) || target.port || target.username || target.password) throw new Error('Checksum source is not allowed.');
    const response = await fetcher(target, { redirect: 'manual', signal, headers: { 'User-Agent': 'ISOCheck/1.0', Accept: 'text/plain' } });
    if ([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('Invalid checksum redirect.');
      url = new URL(location, target).href; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error('The checksum source is unavailable for this release. Use a published checksum instead.'); }
    let length = 0; const chunks = [];
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > 1024 * 1024) throw new Error('Checksum file exceeds the size limit.');
      chunks.push(chunk);
    }
    return { text: Buffer.concat(chunks).toString('utf8'), source: target.href };
  }
  throw new Error('Too many checksum redirects.');
}
const cache = new Map(); let inflight = 0;
export const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'Only GET and HEAD are supported. ISO files stay on your device.' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') return json(200, { status: 'ok' });
    if (url.pathname === '/api/checksum') {
      const filename = url.searchParams.get('filename') || '';
      if (filename.length > 200) return json(400, { error: 'Filename too long.' });
      let source;
      try { source = checksumURL(url.searchParams.get('distro'), filename); }
      catch (err) { return json(400, { error: err.message }); }
      let manifest = cache.get(source);
      if (!manifest || Date.now() - manifest.time > 3600000) {
        if (inflight >= 12) return json(429, { error: 'Lookup is busy. Please try again shortly.' });
        inflight++;
        try { manifest = { ...await fetchManifest(source), time: Date.now() }; }
        catch { return json(502, { error: 'Could not retrieve the official checksum. Try again, or use a published checksum. No verification has been performed.' }); }
        finally { inflight--; }
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(source, manifest);
      }
      try { return json(200, { hash: selectHash(manifest.text, filename), source: manifest.source, filename, fetchedAt: new Date(manifest.time).toISOString() }); }
      catch (err) { return json(404, { error: err.message }); }
    }
    const assets = { '/': 'index.html', '/style.css':'style.css', '/app.mjs':'app.mjs', '/checksums.mjs':'checksums.mjs', '/hash-worker.js':'hash-worker.js', '/favicon.svg':'favicon.svg', '/vendor/sha256.umd.min.js':'vendor/sha256.umd.min.js' };
    if (!Object.hasOwn(assets, url.pathname)) return json(404, { error: 'Not found' });
    const file = assets[url.pathname];
    const mime = file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : /\.m?js$/.test(file) ? 'text/javascript' : 'text/html';
    const data = await readFile(new URL(file, root));
    res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { if (!res.headersSent) json(500, { error: 'Unable to complete request.' }); else res.end(); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('ISO Check is ready'));
