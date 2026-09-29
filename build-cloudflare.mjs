import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('./', import.meta.url);
const server = await readFile(new URL('server.mjs', root), 'utf8');
const shared = server.slice(server.indexOf('export function checksumURL'), server.indexOf('const cache =')).replace("Buffer.concat(chunks).toString('utf8')", "new TextDecoder().decode(concatChunks(chunks, length))");
const parser = await readFile(new URL('public/checksums.mjs', root), 'utf8');
const routes = {'/':'index.html','/style.css':'style.css','/app.mjs':'app.mjs','/checksums.mjs':'checksums.mjs','/hash-worker.js':'hash-worker.js','/favicon.svg':'favicon.svg','/vendor/sha256.umd.min.js':'vendor/sha256.umd.min.js'};
const assets = {};
for (const [route,path] of Object.entries(routes)) {
  assets[route] = { body:await readFile(new URL('public/'+path,root),'utf8'), type:path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':/\.m?js$/.test(path)?'text/javascript':'text/html' };
}
const handler = await readFile(new URL('worker-handler.mjs',root),'utf8');
await mkdir(new URL('dist/server/',root),{recursive:true});
await writeFile(new URL('dist/server/index.js',root), parser+'\n'+shared+'\nconst assets = '+JSON.stringify(assets)+';\n'+handler);
console.log('Built Cloudflare Worker with embedded static assets.');
