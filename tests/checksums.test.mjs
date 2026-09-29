import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createSHA256 } from 'hash-wasm';
import { parseChecksums, selectHash } from '../public/checksums.mjs';
import { checksumURL, fetchManifest } from '../server.mjs';

const hash = createHash('sha256').update('abc').digest('hex');
test('GNU, BSD and signed checksum text match only the exact filename', () => {
  for (const text of [`${hash}  test.iso\r\n`, `${hash} *test.iso`, `SHA256 (test.iso) = ${hash.toUpperCase()}`, `-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\n${hash}  ./test.iso\n-----BEGIN PGP SIGNATURE-----`]) {
    assert.equal(selectHash(text,'test.iso'),hash);
    assert.throws(()=>selectHash(text,'other.iso'));
  }
  assert.equal(selectHash(hash.toUpperCase(),'renamed.iso'),hash);
  assert.throws(()=>selectHash('','test.iso'));
  assert.throws(()=>selectHash(`${hash}  test.iso\n${'0'.repeat(64)}  test.iso`,'test.iso'));
  assert.equal(parseChecksums('invalid').length,0);
});
test('streaming SHA256 agrees with Node crypto across chunk boundaries', async () => {
  for (const size of [0,3,55,56,63,64,65,4194305,9437217]) {
    const bytes=randomBytes(size); const hasher=await createSHA256();hasher.init();
    for(let i=0;i<size;i+=4194304) hasher.update(bytes.subarray(i,i+4194304));
    assert.equal(hasher.digest('hex'),createHash('sha256').update(bytes).digest('hex'));
  }
});
test('lookup rejects unsupported names and cannot accept arbitrary source URLs',()=>{
  assert.equal(checksumURL('mint','linuxmint-22.3-cinnamon-64bit.iso'),'https://mirrors.edge.kernel.org/linuxmint/stable/22.3/sha256sum.txt');
  assert.equal(checksumURL('ubuntu','ubuntu-24.04.4-desktop-amd64.iso'),'https://releases.ubuntu.com/24.04.4/SHA256SUMS');
  assert.equal(checksumURL('arch','archlinux-2026.09.01-x86_64.iso'),'https://archlinux.org/iso/2026.09.01/sha256sums.txt');
  for(const name of ['../../etc/passwd','https://localhost/test.iso','linuxmint-22.3-beta.iso']) assert.throws(()=>checksumURL('mint',name));
  assert.throws(()=>checksumURL('arch','linuxmint-22.3-cinnamon-64bit.iso'));
});
test('fetch bounds response size and blocks redirects outside known hosts',async()=>{
  await assert.rejects(()=>fetchManifest('https://127.0.0.1/'),/not allowed/);
  await assert.rejects(()=>fetchManifest('https://archlinux.org/iso/checksums',async()=>new Response(null,{status:302,headers:{location:'http://169.254.169.254/'}})),/not allowed/);
  await assert.rejects(()=>fetchManifest('https://archlinux.org/iso/checksums',async()=>new Response('x'.repeat(1048577))),/size limit/);
  const data=await fetchManifest('https://archlinux.org/iso/checksums',async()=>new Response(`${hash}  test.iso`));
  assert.equal(selectHash(data.text,'test.iso'),hash);
});
