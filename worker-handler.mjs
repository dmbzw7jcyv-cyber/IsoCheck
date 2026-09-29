function concatChunks(chunks, length) {
  const output = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
const cache = new Map(); let inflight = 0;
const securityHeaders = {
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
};
export default {
  async fetch(request) {
    const json = (status,data) => new Response(request.method==='HEAD'?null:JSON.stringify(data),{status,headers:{...securityHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});
    try {
      if (!['GET','HEAD'].includes(request.method)) return json(405,{error:'Only GET and HEAD are supported. ISO files stay on your device.'});
      const url = new URL(request.url);
      if(url.pathname==='/health')return json(200,{status:'ok'});
      if(url.pathname==='/api/checksum') {
        const filename=url.searchParams.get('filename')||'';
        if(filename.length>200)return json(400,{error:'Filename too long.'});
        let source;
        try { source=checksumURL(url.searchParams.get('distro'),filename); }
        catch(error){return json(400,{error:error.message});}
        let manifest=cache.get(source);
        if(!manifest || Date.now()-manifest.time>3600000){
          if(inflight>=12)return json(429,{error:'Lookup is busy. Please try again shortly.'});
          inflight++;
          try{manifest={...await fetchManifest(source),time:Date.now()};}
          catch{return json(502,{error:'Could not retrieve the official checksum. Try again, or use a published checksum. No verification has been performed.'});}
          finally{inflight--;}
          if(cache.size>=100)cache.delete(cache.keys().next().value);
          cache.set(source,manifest);
        }
        try{return json(200,{hash:selectHash(manifest.text,filename),source:manifest.source,filename,fetchedAt:new Date(manifest.time).toISOString()});}
        catch(error){return json(404,{error:error.message});}
      }
      if(!Object.hasOwn(assets,url.pathname))return json(404,{error:'Not found'});
      const asset=assets[url.pathname];
      return new Response(request.method==='HEAD'?null:asset.body,{headers:{...securityHeaders,'Content-Type':asset.type+'; charset=utf-8','Cache-Control':'no-cache'}});
    }catch{return json(500,{error:'Unable to complete request.'});}
  }
};
