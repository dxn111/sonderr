#!/usr/bin/env node
const { execFile } = require("node:child_process");
const { createServer } = require("../server/app");

const DEFAULT_PORT=Number(process.env.SONDERR_PORT||4173);
// The app has no remote-user authentication by design. Never bind it to a
// network interface, even if a shell environment accidentally supplies one.
const HOST="127.0.0.1";
const noOpen=process.argv.includes("--no-open");

function parsePort(){
  const i=process.argv.indexOf("--port");
  if(i!==-1 && process.argv[i+1]){
    const n=Number(process.argv[i+1]);
    if(Number.isInteger(n)&&n>0&&n<65536)return n;
  }
  return DEFAULT_PORT;
}
function openBrowser(url){
  if(noOpen)return;
  const command=process.platform==="win32"?"cmd.exe":process.platform==="darwin"?"open":"xdg-open";
  const args=process.platform==="win32"?["/c","start","",url]:[url];
  execFile(command,args,e=>{if(e){console.log("  Browser did not open automatically.");console.log("  → "+url);}});
}
function start(port){
  if(port>65535){console.error("No available localhost port was found.");process.exitCode=1;return;}
  const server=createServer();
  server.once("error",e=>{
    if(e.code==="EADDRINUSE")return start(port+1);
    console.error(e);process.exitCode=1;
  });
  server.listen(port,HOST,()=>{
    const actual=server.address().port,url=`http://${HOST}:${actual}`;
    console.log("");
    console.log("  SONDERR 1.5");
    console.log("  Privacy-first local AI workspace");
    console.log("");
    console.log("  ✓ Backend + web runtime started");
    console.log("  ✓ Workspace: "+process.cwd());
    const skillsCount=require("../server/skills").all().length;
    console.log("  ✓ "+skillsCount+" skill playbook"+(skillsCount===1?"":"s")+" loaded (auto-attached per task)");
    console.log("  → "+url);
    console.log("");
    console.log("  Ctrl+C to stop.");
    console.log("");
    openBrowser(url);
  });
}
if (process.env.SONDERR_HOST && process.env.SONDERR_HOST !== HOST) console.warn("  Sonderr always binds to 127.0.0.1 for safety; SONDERR_HOST was ignored.");
process.on("SIGINT",()=>process.exit(0));process.on("SIGTERM",()=>process.exit(0));
start(parsePort());
