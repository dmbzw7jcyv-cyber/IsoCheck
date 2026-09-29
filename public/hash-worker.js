importScripts('/vendor/sha256.umd.min.js');
self.onmessage = async ({ data: { file } }) => {
  try {
    const hasher = await hashwasm.createSHA256(); hasher.init();
    const chunkSize = 4 * 1024 * 1024;
    const started = performance.now();
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const chunk = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
      hasher.update(chunk);
      self.postMessage({ type: 'progress', bytes: Math.min(offset + chunkSize, file.size), elapsed: (performance.now() - started) / 1000 });
    }
    const header = new Uint8Array(await file.slice(32768, 32768 + 2048 * 16).arrayBuffer());
    let isoHeader = false;
    for (let i = 0; i + 7 <= header.length; i += 2048) {
      if (header[i] === 1 && String.fromCharCode(...header.slice(i + 1, i + 6)) === 'CD001' && header[i + 6] === 1) isoHeader = true;
    }
    self.postMessage({ type: 'done', hash: hasher.digest('hex'), isoHeader });
  } catch { self.postMessage({ type: 'error', error: 'Could not read or hash this file. Keep it available on your device and try again.' }); }
};
