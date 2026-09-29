import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';
import * as hashwasm from 'hash-wasm';
import {selectHash} from '../public/checksums.mjs';
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const app=(await readFile(new URL('../public/app.mjs',import.meta.url),'utf8')).replace("import { selectHash } from './checksums.mjs';",'');
const workerSource=await readFile(new URL('../public/hash-worker.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://iso.test/'});const w=dom.window;
 w.selectHash=selectHash;w.AbortController=AbortController;
 w.Worker=class{
  stopped=false;
  postMessage(data){const self={postMessage:value=>{if(!this.stopped)this.onmessage?.({data:value});}};
   runInNewContext(workerSource,{self,importScripts(){},hashwasm,performance,Uint8Array});self.onmessage({data});}
  terminate(){this.stopped=true;}
 };
 w.fetch=async()=>{throw new Error('Unavailable checksum source');};
 w.eval(app);const $=id=>w.document.getElementById(id);
 const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change'));};
 const choose=file=>{Object.defineProperty($('iso'),'files',{value:[file],configurable:true});$('iso').dispatchEvent(new w.Event('change'));};
 const submit=()=> $('checker-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
 const state=()=>w.document.querySelector('.result').dataset.state;
 return{w,$,change,choose,submit,state,dom};
}
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Timed out waiting for UI');}
const bytes=Buffer.alloc(5*1024*1024,42);bytes[32768]=1;bytes.write('CD001',32769);bytes[32774]=1;
const hash=createHash('sha256').update(bytes).digest('hex');
test('real worker + UI: pass, changed byte fail, stale result cleared, manual source and unknown header',async()=>{
 const u=setup();u.change('mode','manual');u.choose(new File([bytes],'test.iso'));u.$('expected').value=hash;u.submit();await until(()=>u.state()==='match');
 assert.equal(u.$('status-title').textContent,'PASS — checksum matches');assert.equal(u.$('status-symbol').textContent,'✓');assert.equal(u.$('progress-area').hidden,true);assert.match(u.$('status-copy').textContent,/supplied/);assert.match(u.$('details').textContent,/PASS · Both/);
 const changed=Buffer.from(bytes);changed[100]^=1;u.choose(new File([changed],'test.iso'));assert.equal(u.state(),'ready');assert.equal(u.$('details').hidden,true);u.submit();await until(()=>u.state()==='mismatch');
 assert.equal(u.$('status-title').textContent,'FAIL — checksum mismatch');assert.equal(u.$('status-symbol').textContent,'✕');assert.match(u.$('verdict-next').textContent,/Do not use/);assert.equal(u.$('progress-area').hidden,true);
 const tiny=Buffer.from('abc');u.choose(new File([tiny],'tiny.iso'));u.$('expected').value=createHash('sha256').update(tiny).digest('hex');u.submit();await until(()=>u.state()==='match');assert.match(u.$('verdict-next').textContent,/format is unconfirmed/);u.dom.window.close();
});
test('lookup failure and invalid checksum are unverified, never mismatch; official match source',async()=>{
 const u=setup();u.choose(new File([bytes],'test.iso'));u.submit();await until(()=>u.state()==='error');assert.equal(u.$('status-title').textContent,'NOT VERIFIED — check incomplete');assert.match(u.$('verdict-next').textContent,/No pass or fail/);
 u.w.fetch=async()=>new Response(JSON.stringify({hash,source:'https://archlinux.org/iso/test/sha256sums.txt'}),{headers:{'Content-Type':'application/json'}});
 u.submit();await until(()=>u.state()==='match');assert.match(u.$('status-copy').textContent,/official published/);
 u.change('mode','manual');u.$('expected').value='bad';u.submit();assert.equal(u.state(),'error');assert.equal(u.$('verify').disabled,false);u.dom.window.close();
});
test('cancel ignores late worker messages, multi-file drops cannot alter an active check',async()=>{
 const u=setup();u.change('mode','manual');u.choose(new File([bytes],'test.iso'));u.$('expected').value=hash;u.submit();
 const event=new u.w.Event('drop',{cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{files:[{},{}]}});u.$('dropzone').dispatchEvent(event);assert.equal(u.state(),'working');
 u.$('cancel').click();assert.equal(u.state(),'cancelled');await new Promise(r=>setTimeout(r,150));assert.equal(u.state(),'cancelled');assert.equal(u.$('verify').disabled,false);u.dom.window.close();
});
test('cancelled checksum-file read cannot overwrite a newer result or re-enable active controls',async()=>{
 const u=setup();u.change('mode','manual');let resolve;const text=new Promise(r=>resolve=r);
 Object.defineProperty(u.$('manifest'),'files',{value:[{size:64,text:()=>text}],configurable:true});u.$('manifest').dispatchEvent(new u.w.Event('change'));assert.equal(u.$('inputs').disabled,true);
 u.$('cancel').click();u.$('expected').value='new value';resolve(hash);await new Promise(r=>setTimeout(r,20));assert.equal(u.$('expected').value,'new value');assert.equal(u.state(),'cancelled');u.dom.window.close();
});
