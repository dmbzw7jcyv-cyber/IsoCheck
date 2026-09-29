import { selectHash } from './checksums.mjs';
const $ = id => document.getElementById(id);
const guides = {
  mint: ['Linux Mint','https://linuxmint-installation-guide.readthedocs.io/en/latest/verify.html'],
  ubuntu: ['Ubuntu','https://ubuntu.com/tutorials/how-to-verify-ubuntu'],
  arch: ['Arch Linux','https://archlinux.org/download/'],
  debian: ['Debian','https://www.debian.org/CD/verify'],
  fedora: ['Fedora','https://fedoraproject.org/security'],
  bazzite: ['Bazzite','https://docs.bazzite.gg/'],
  other: ['Distribution','https://www.kernel.org/category/signatures.html']
};
let file = null, worker = null, controller = null, generation = 0, busy = false;
const result = document.querySelector('.result');
function state(kind, title, copy, symbol = '⌁') {
  result.dataset.state = kind;
  $('status-tag').textContent = {ready:'READY',working:'CHECKING',match:'MATCH',mismatch:'MISMATCH',error:'NOT VERIFIED',cancelled:'CANCELLED'}[kind];
  $('status-title').textContent = title; $('status-copy').textContent = copy; $('status-symbol').textContent = symbol;
}
function clearResult() {
  $('details').replaceChildren(); $('details').hidden = true; $('progress-area').hidden = true;
  state('ready','Ready when you are.','Choose a distribution and an ISO. We’ll compare every byte against its checksum.');
}
function setBusy(value) {
  busy = value; $('inputs').disabled = value; $('verify').disabled = value; $('cancel').hidden = !value;
  $('verify').textContent = value ? 'Verifying…' : 'Verify ISO ✓';
}
function chooseFile(next) {
  if (busy || !next) return;
  clearResult();
  if (!/\.iso$/i.test(next.name) || next.size === 0) {
    file = null; $('iso').value = ''; $('file-title').textContent = 'Drop your ISO here'; $('file-meta').textContent = 'or click to browse files';
    state('error','Choose a non-empty ISO.','Select a downloaded file ending in .iso.','!'); return;
  }
  file = next; $('file-title').textContent = file.name; $('file-meta').textContent = `${(file.size / 1024**3).toFixed(2)} GiB · click to change`;
}
function refreshMode() {
  const auto = ['mint','ubuntu','arch'].includes($('distro').value);
  $('mode').options[0].disabled = !auto;
  if (!auto) $('mode').value = 'manual';
  $('manual').hidden = $('mode').value !== 'manual';
  $('source-help').textContent = $('mode').value === 'official' ? `Uses the original filename to find the matching ${guides[$('distro').value][0]} release.` : 'Compare with a checksum you provide. Its source is not independently verified.';
  const [name,url] = guides[$('distro').value]; $('guide').href = url; $('guide').textContent = `${name} verification help ↗`;
  clearResult();
}
$('distro').addEventListener('change', refreshMode); $('mode').addEventListener('change', refreshMode);
$('expected').addEventListener('input',clearResult);
$('iso').addEventListener('change',event=>chooseFile(event.target.files[0]));
for(const type of ['dragenter','dragover']) $('dropzone').addEventListener(type,event=>{event.preventDefault();if(!busy)$('dropzone').classList.add('drag');});
for(const type of ['dragleave','drop']) $('dropzone').addEventListener(type,event=>{event.preventDefault();$('dropzone').classList.remove('drag');});
$('dropzone').addEventListener('drop',event=>{if(event.dataTransfer.files.length!==1){state('error','One ISO at a time.','Drop a single ISO file to verify.','!');return;}chooseFile(event.dataTransfer.files[0]);});
$('manifest').addEventListener('change',async event=>{
  const selected = event.target.files[0]; if(!selected) return;
  clearResult();
  if(selected.size > 1024*1024){$('expected').value='';state('error','Checksum file is too large.','Choose a checksum text file smaller than 1 MiB.','!');return;}
  $('verify').disabled=true;
  try { $('expected').value=await selected.text(); }
  catch { $('expected').value='';state('error','Could not read the checksum.','Select the file again or paste its contents.','!'); }
  finally { $('verify').disabled=false; }
});
function detail(label, value, isHash = false, href) {
  const dt=document.createElement('dt');dt.textContent=label;
  const dd=document.createElement('dd');if(isHash)dd.className='hash';
  if(href){const a=document.createElement('a');a.href=href;a.textContent=value;a.target='_blank';a.rel='noopener noreferrer';dd.append(a);}else dd.textContent=value;
  $('details').append(dt,dd);$('details').hidden=false;
}
$('cancel').addEventListener('click',()=>{
  generation++; controller?.abort(); worker?.terminate(); worker=null;setBusy(false);$('progress-area').hidden=true;
  state('cancelled','Verification cancelled.','No result was recorded. You can start again whenever you’re ready.');
});
$('checker-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;clearResult();
  if(!file){state('error','Choose your ISO first.','Select a local ISO file before starting verification.','!');$('iso').focus();return;}
  const run=++generation;const selected=file;let expected,source;
  setBusy(true);state('working','Finding the checksum…','Your ISO stays on this device.');
  try {
    if($('mode').value==='manual') { expected=selectHash($('expected').value,selected.name); }
    else {
      controller=new AbortController();
      const timer=setTimeout(()=>controller?.abort(),20000);
      try {
        const response=await fetch(`/api/checksum?${new URLSearchParams({distro:$('distro').value,filename:selected.name})}`,{signal:controller.signal});
        const data=await response.json();if(!response.ok)throw new Error(data.error || 'Checksum lookup failed.');
        if(!/^[a-f0-9]{64}$/.test(data.hash))throw new Error('The source returned an invalid SHA-256 checksum.');
        expected=data.hash;source=data.source;
      } finally {clearTimeout(timer);}
    }
    if(run!==generation)return;
    state('working','Reading your ISO…','Calculating SHA-256 locally. Keep this tab open.');
    $('progress-area').hidden=false;$('progress').value=0;$('progress-text').textContent='0%';$('speed').textContent='';
    worker=new Worker('/hash-worker.js');
    worker.onmessage=({data})=>{
      if(run!==generation)return;
      if(data.type==='progress'){
        const pct=data.bytes/selected.size*100;$('progress').value=pct;$('progress-text').textContent=`${pct.toFixed(0)}% · ${(data.bytes/1024**3).toFixed(2)} / ${(selected.size/1024**3).toFixed(2)} GiB`;
        $('speed').textContent=`${(data.bytes/1024**2/Math.max(data.elapsed,.001)).toFixed(0)} MiB/s`;
      }else if(data.type==='done'){
        const matched=data.hash===expected;
        state(matched?'match':'mismatch',matched?'Checksum matches.':'Checksums don’t match.',matched?(source?'Your ISO matches the checksum published for this exact filename.':'Your ISO matches the checksum you provided. Its source has not been authenticated.'):'Do not install this copy. Check the release, edition, architecture, and checksum source, then download again if needed.',matched?'✓':'!');
        detail('Your file',selected.name);detail('Calculated SHA-256',data.hash,true);detail('Expected SHA-256',expected,true);
        detail('Checksum source',source||'Provided by you · source not verified',false,source);
        detail('ISO 9660 header',data.isoHeader?'Detected · not a full filesystem or boot test':'Not detected · format is unconfirmed, even if hashes match');
        detail('Signature authenticity','Not checked');worker.terminate();worker=null;setBusy(false);
      }else if(data.type==='error'){fail(data.error);}
    };
    worker.onerror=()=>{if(run===generation)fail('The hashing worker could not start. Try a current browser with WebAssembly enabled.');};
    worker.postMessage({file:selected});
  } catch(err){if(run===generation)fail(err.name==='AbortError'?'Checksum lookup timed out. Try again or use a published checksum.':err.message);}
});
function fail(message){worker?.terminate();worker=null;setBusy(false);$('progress-area').hidden=true;state('error','Couldn’t verify this ISO.',message,'!');}
refreshMode();
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'read_iso_verification_status',
      title: 'Read ISO verification status',
      description: 'Read the visible result for the ISO the user selected. Does not access or select local files and does not initiate verification.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('No parameters are accepted.');
        return { status: result.dataset.state, title: $('status-title').textContent, description: $('status-copy').textContent, filename: file?.name || null, signatureVerified: false };
      }
    }, { signal: lifecycle.signal })).catch(() => {});
  } catch {}
}
