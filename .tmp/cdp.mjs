import fs from 'node:fs';
const tabs = await (await fetch('http://127.0.0.1:9223/json')).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open',r,{once:true}));
let id=0; const pending=new Map();
ws.addEventListener('message', e => { const m=JSON.parse(e.data); if(m.id){ const p=pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); } });
const send = (method,params={}) => new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
const evaluate = async expression => {const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw r.exceptionDetails; return r.result.value;};
if(process.argv[2]==='close'){await send('Browser.close');}
else if(process.argv[2]==='navigate'){await send('Page.navigate',{url:'http://127.0.0.1:3000'});}
else if(process.argv[2]==='shot'){const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.argv[3],Buffer.from(r.data,'base64'));}
else console.log(JSON.stringify(await evaluate(process.argv[2]==='file'?fs.readFileSync(process.argv[3],'utf8'):process.argv[2]),null,2));
ws.close();
