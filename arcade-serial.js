// Private K3NG Morse Arcade v1 extension. See MORSE_ARCADE_SERIAL.md.
var serialPort=null, inputFn=null, serialReader=null, serialConnecting=false;
var arcadeActive=false, arcadeAck=false, arcadePending=false, serialReady=false;
var serialWrites=Promise.resolve(), serialToneTimer=null, arcadeHandshakeTimer=null;
function serialStatus(text,kind){
  var el=document.getElementById('serial-st');
  if(el){el.textContent='\u2B24 '+text;el.className=kind||'';}
}
function stopSerialTone(){clearTimeout(serialToneTimer);sidetoneOff();}
function handleSerial(data){
  if(!data)return;
  Array.from(data).forEach(function(b){
    if(arcadePending && arcadeAck && b===0x1f){
      arcadeActive=true;arcadePending=false;arcadeAck=false;
      clearTimeout(arcadeHandshakeTimer);
      serialStatus('KEYER: SIDETONE REALTIME','ok');return;
    }
    arcadeAck=arcadePending && b===0x1e;
    if(b===0x1c || b===0x1d){
      if(arcadeActive){
        if(b===0x1d)stopSerialTone();
        else if(!document.hidden){
          sidetoneOn();clearTimeout(serialToneTimer);
          // Fail silent if a cable/read failure loses KEY UP; long holds capped.
          serialToneTimer=setTimeout(stopSerialTone,2000);
        }
      }
      return;
    }
    // Version/control bytes and WinKey status/speed never enter the game.
    if(serialReady && b>=0x20 && b<=0x7e){
      var ch=String.fromCharCode(b).toUpperCase();
      if(attractActive)ATTRACT.onKey(ch);
      else if(inputFn)inputFn(ch,'serial');
    }
  });
}
function serialWrite(bytes){
  var port=serialPort;
  var job=serialWrites.catch(function(){}).then(async function(){
    if(!port || port!==serialPort || !port.writable)throw Error('Serial disconnected');
    var writer=port.writable.getWriter();
    try{await writer.write(new Uint8Array(bytes));}finally{writer.releaseLock();}
  });
  serialWrites=job;return job;
}
async function readSerial(port){
  try{
    serialReader=port.readable.getReader();
    while(true){var res=await serialReader.read();if(res.done)break;handleSerial(res.value);}
  }catch(e){/* cleanup below also handles unplug/read errors */}
  finally{
    if(serialReader){serialReader.releaseLock();serialReader=null;}
    await disconnectSerial();
  }
}
async function disconnectSerial(){
  arcadeActive=false;arcadePending=false;arcadeAck=false;serialReady=false;
  clearTimeout(arcadeHandshakeTimer);stopSerialTone();
  if(serialReader){await serialReader.cancel().catch(function(){});return;}
  var port=serialPort;
  if(port){
    try{await serialWrite([0x00,0xe0,0x00,0x03]);}catch(e){}
    serialPort=null;
    try{await port.close();}catch(e){}
  }
  serialStatus('KEYER: NON CONNESSO');
}
async function connectSerial(){
  if(!('serial' in navigator)){serialStatus('WEB SERIAL: USA CHROME O EDGE','err');return false;}
  if(serialConnecting)return false;
  if(serialPort && serialPort.readable)return true;
  serialConnecting=true;
  try{
    // Resume in the user gesture, before the port chooser consumes activation.
    await AC.resume();
    serialPort=await navigator.serial.requestPort();
    await serialPort.open({baudRate:1200,dataBits:8,stopBits:2,parity:'none',flowControl:'none'});
    readSerial(serialPort);
    // Allow Nano auto-reset/bootloader to finish before sending host open.
    await new Promise(function(r){setTimeout(r,2000);});
    await serialWrite([0x00,0x02]);
    await new Promise(function(r){setTimeout(r,250);});
    serialReady=true;arcadePending=true;
    serialStatus('KEYER: VERIFICA SIDETONE','ok');
    arcadeHandshakeTimer=setTimeout(function(){
      if(!arcadeActive){arcadePending=false;arcadeAck=false;
        serialStatus('KEYER: SOLO LETTERE (FIRMWARE SENZA SIDETONE)','ok');}
    },1000);
    await serialWrite([0x0e,0x40,0x00,0xe1]);
    return true;
  }catch(e){await disconnectSerial();serialStatus('ERRORE SERIALE','err');return false;}
  finally{serialConnecting=false;}
}
async function connectAttractSerial(){return connectSerial();}
async function sendWpm(w){
  if(!serialReady)return;
  try{await serialWrite([0x02,Math.min(99,Math.max(5,w))]);}catch(e){}
}
window.addEventListener('pagehide',function(){disconnectSerial();});
window.addEventListener('blur',stopSerialTone);
document.addEventListener('visibilitychange',function(){if(document.hidden)stopSerialTone();});
