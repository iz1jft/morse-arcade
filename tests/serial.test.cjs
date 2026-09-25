const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../arcade-serial.js'),'utf8');
function setup(){
 const calls=[],timers=new Map(),events={};let id=0;
 const ctx={Uint8Array,Promise,console,attractActive:false,ATTRACT:{onKey:c=>calls.push(c)},
  navigator:{},AC:{resume:async()=>{}},
  document:{hidden:false,getElementById:()=>null,addEventListener:(k,f)=>events[k]=f},
  window:{addEventListener:(k,f)=>events[k]=f},
  sidetoneOn:()=>calls.push('down'),sidetoneOff:()=>calls.push('up'),
  setTimeout:(f,ms)=>{timers.set(++id,{f,ms});return id;},clearTimeout:i=>timers.delete(i)};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 ctx.inputFn=c=>calls.push(c);return {ctx,calls,timers,events};
}
test('split handshake, interleaved status/speed, letters, repeated elements',()=>{
 const {ctx,calls}=setup();ctx.serialReady=true;
 ctx.handleSerial([0x1c,0x1d,0xc0,0x80,23]);assert.deepEqual(calls,[]);
 ctx.arcadePending=true;ctx.handleSerial([0x1e]);ctx.handleSerial([0x1f,0x1d]);
 ctx.handleSerial([0x1c,0xc4,0x1d,0x1c,0x1d,65,32,66,0x9f]);
 assert.deepEqual(calls,['up','down','up','down','up','A',' ','B']);
});
test('ordinary firmware, delayed ACK, control bytes cannot key or enter game',()=>{
 const {ctx,calls}=setup();ctx.serialReady=true;
 ctx.handleSerial([0x1e,0x1f,0x1c,0x1d,65,0xf8,0xf9]);assert.deepEqual(calls,['A']);
 assert.equal(ctx.arcadeActive,false);
});
test('attract and game share routing; hidden page stays silent; watchdog releases tone',()=>{
 const {ctx,calls,timers,events}=setup();ctx.serialReady=true;ctx.arcadeActive=true;
 ctx.attractActive=true;ctx.handleSerial([67]);ctx.document.hidden=true;ctx.handleSerial([0x1c]);
 assert.deepEqual(calls,['C']);ctx.document.hidden=false;ctx.handleSerial([0x1c]);
 [...timers.values()].find(t=>t.ms===2000).f();assert.deepEqual(calls,['C','down','up']);
 events.blur();assert.equal(calls.at(-1),'up');
});
test('writes are atomic and serialized; disconnect disables mode and closes host',async()=>{
 const {ctx,calls}=setup();const writes=[];let locked=false,closed=false;
 ctx.serialPort={writable:{getWriter(){assert.equal(locked,false);locked=true;
  return {write:async b=>{await Promise.resolve();writes.push([...b]);},releaseLock(){locked=false;}};}},close:async()=>closed=true};
 await Promise.all([ctx.serialWrite([2,20]),ctx.serialWrite([0,0xe1])]);
 await ctx.disconnectSerial();assert.deepEqual(writes,[[2,20],[0,0xe1],[0,0xe0,0,3]]);
 assert.equal(closed,true);assert.equal(ctx.arcadeActive,false);assert.equal(calls.at(-1),'up');
});
test('both pages load transport before startup and retain F9 audio in same context',()=>{
 for(const file of ['index.html','morse_arcade_kiosk.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  assert.ok(html.indexOf('src="arcade-serial.js"')<html.indexOf('<script>'));
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  assert.match(html,/if\(!e.repeat\)sidetoneOn\(\)/);
  assert.match(html,/sidetoneOsc=AC.createOscillator/);
  assert.doesNotMatch(html,/requestPort\(/);
 }
});
