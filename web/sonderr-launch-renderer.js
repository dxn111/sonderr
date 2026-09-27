(()=>{
const surfaces=["sonderrLaunchCanvas","announcementsLaunchCanvas"].map(id=>document.getElementById(id)).filter(Boolean);if(!surfaces.length)return;const keyArt=document.getElementById("sonderrV1KeyArt"),brandMark=document.getElementById("sonderrV1BrandMark");

const particles=Array.from({length:115},(_,i)=>({x:(i*7919%1280),y:(i*1049%720),r:.5+(i%5)*.3,p:i*.72,s:.18+(i%7)*.06}));
const scenes=[
 {a:0,b:7,title:'THE NEXT GENERATION IS SMALLER',sub:'A DIFFERENT IDEA OF WHAT A MODEL CAN BE',mode:'signal'},
 {a:7,b:16,title:'THE START OF THE SLM GENERATION',sub:'OUR FIRST MODEL. THE BEGINNING OF A NEW DIRECTION.',mode:'manifesto'},
 {a:16,b:25,title:'MEET SONDERR-V1',sub:'OUR FIRST SMALL LANGUAGE MODEL',mode:'hero'},
 {a:25,b:34,title:'0.6 BILLION PARAMETERS',sub:'COMPACT BY DESIGN  ·  SPECIALIZED FOR SONDERR',mode:'speed'},
 {a:34,b:43,title:'BUILT FOR ONE ENVIRONMENT',sub:'SONDERR-V1 IS SPECIALIZED FOR THE WAY SONDERR WORKS',mode:'specialized'},
 {a:43,b:54,title:'A MODEL IS ONLY THE BEGINNING',sub:'CAPABILITY GROWS THROUGH THE ENVIRONMENT AROUND IT',mode:'tools'},
 {a:54,b:65,title:'CONTEXT FROM THE LIVE WEB',sub:'SEARCH WHEN THE ANSWER NEEDS TO BE CURRENT',mode:'web'},
 {a:65,b:75,title:'CONTEXT FROM YOUR WORK',sub:'FILES, WORKSPACE, TOOLS — ALL IN REACH',mode:'environment'},
 {a:75,b:83,title:'SMALL MODEL. CONNECTED ENVIRONMENT.',sub:'SPECIALIZATION OVER SCALE  ·  TOOLS OVER GUESSWORK',mode:'thesis'},
 {a:83,b:90,title:'AND THIS IS ONLY VERSION ONE',sub:'OUR FIRST SLM  ·  MADE FOR SONDERR  ·  BUILT TO GET BETTER',mode:'future'},
 {a:90,b:98,title:'THE START OF THE SLM GENERATION',sub:'SONDERR-V1  ·  OUR FIRST MODEL  ·  0.6B PARAMETERS',mode:'final'}
];
let x,W,H,S;function setup(surface){x=surface.getContext("2d");W=surface.width;H=surface.height;S=W/1280;x.setTransform(S,0,0,S,0,0)}function rr(px,py,w,h,r,fill,stroke){x.beginPath();x.roundRect(px,py,w,h,r);if(fill)x.fill();if(stroke)x.stroke()}
function glow(cx,cy,r,col,a=1){const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,col.replace('ALPHA',String(.24*a)));g.addColorStop(.42,col.replace('ALPHA',String(.09*a)));g.addColorStop(1,col.replace('ALPHA','0'));x.fillStyle=g;x.fillRect(cx-r,cy-r,r*2,r*2)}
function drawBrandMark(cx,cy,size){if(!brandMark?.complete||!brandMark.naturalWidth)return;x.save();x.shadowColor='rgba(82,177,255,.8)';x.shadowBlur=28;x.drawImage(brandMark,cx-size/2,cy-size/2,size,size);x.restore()}
function word(text,cx,cy,size,color,weight=700){x.save();x.textAlign='center';x.textBaseline='middle';x.font=`${weight} ${size}px Inter,Arial,sans-serif`;x.fillStyle=color;x.shadowColor='#4e8bff';x.shadowBlur=20;x.fillText(text,cx,cy);x.restore()}
function small(text,xx,yy,size=11,color='#94b8ec',weight=650){x.textAlign='left';x.textBaseline='middle';x.font=`${weight} ${size}px Inter,Arial,sans-serif`;x.fillStyle=color;x.fillText(text,xx,yy)}
function sceneDraw(t){
 for(const surface of surfaces){if(!surface.getClientRects().length)continue;setup(surface);drawSceneOnSurface(t)}
}
function drawSceneOnSurface(t){
 const s=scenes.find(v=>t>=v.a&&t<v.b)||scenes.at(-1),q=(t-s.a)/(s.b-s.a),fade=Math.min(1,q*3.2,(1-q)*3.2);
 const bg=x.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#071329');bg.addColorStop(.54,'#0d1e3c');bg.addColorStop(1,'#071326');x.fillStyle=bg;x.fillRect(0,0,W,H);if(keyArt?.complete&&keyArt.naturalWidth){const drift=Math.sin(t*.08)*7;x.globalAlpha=.82;x.drawImage(keyArt,drift,0,1280,720);x.globalAlpha=1;x.fillStyle='rgba(3,10,25,.30)';x.fillRect(0,0,1280,720);const edge=x.createLinearGradient(0,0,1280,0);edge.addColorStop(0,'rgba(3,10,25,.48)');edge.addColorStop(.46,'rgba(3,10,25,.06)');edge.addColorStop(1,'rgba(3,10,25,.28)');x.fillStyle=edge;x.fillRect(0,0,1280,720)}
 glow(300+Math.sin(t*.43)*70,310,420,'rgba(43,111,255,ALPHA)',.95);glow(1010+Math.cos(t*.36)*50,460,350,'rgba(34,205,226,ALPHA)',.72);
 x.save();x.globalAlpha=.16;x.strokeStyle='#72a6ff';x.lineWidth=1;
 for(let i=0;i<9;i++){const r=85+i*56+(t*6%54);x.beginPath();x.ellipse(640,355,r,r*.63,-.22,0,Math.PI*2);x.stroke()}
 x.restore();
 for(const p of particles){const px=(p.x+Math.sin(t*p.s+p.p)*12+1280)%1280,py=(p.y+t*p.s*8+720)%720;x.globalAlpha=.24+.5*(Math.sin(t*1.1+p.p)+1)/2;x.fillStyle='#d9e8ff';x.beginPath();x.arc(px,py,p.r,0,Math.PI*2);x.fill()}x.globalAlpha=1;
 const enter=Math.sin(Math.min(1,q*2.2)*Math.PI/2),lift=(1-enter)*24;
 if(s.mode==='signal'){
   const a=(Math.sin(t*4)+1)/2;x.beginPath();x.arc(640,286,48+a*13,0,7);x.strokeStyle=`rgba(140,195,255,${.42+a*.48})`;x.lineWidth=2;x.stroke();drawBrandMark(640,286,112);word('SONDERR',640,386,23,'#f3f7ff',760);word(s.title,640,427,24,'#f3f7ff',720);word(s.sub,640,466,12,'#8fb7ef',650);
 }else if(s.mode==='manifesto'){
   const pulse=1+Math.sin(t*1.7)*.012; x.save();x.translate(640,310);x.scale(pulse,pulse);for(let i=0;i<6;i++){x.beginPath();x.ellipse(0,0,78+i*49,32+i*24,-.34+i*.13,t*.12,t*.12+Math.PI*1.75);x.strokeStyle=`rgba(${i%2?'90,185,245':'99,133,255'},${.25+i*.035})`;x.lineWidth=1.2;x.stroke()}x.restore();
   word('THE START OF',640,266-lift,45,'#b9d5ff',650);word('THE SLM GENERATION',640,326-lift,51,'#ffffff',780);word(s.sub,640,407,12,'#98b9e8',650);
 }else if(s.mode==='specialized'){
   word(s.title,640,158-lift,30,'#f7faff',730);word(s.sub,640,201,11,'#93b5e6',650);
   const cards=[['01','UNDERSTAND','the task'],['02','CONNECT','to context'],['03','ACT','with tools'],['04','RETURN','clear work']];cards.forEach((r,i)=>{const xx=168+i*238,yy=343+Math.sin(t*.8+i*.9)*7; x.fillStyle='rgba(255,255,255,.045)';x.strokeStyle='rgba(166,200,255,.22)';rr(xx,yy,210,123,16);x.fill();x.stroke();word(r[0],xx+26,yy+29,10,'#70acff',700);word(r[1],xx+105,yy+58,16,'#f5f8ff',730);word(r[2],xx+105,yy+89,12,'#94aecf',600);if(i<3){x.strokeStyle='rgba(104,184,255,.45)';x.lineWidth=1.5;x.beginPath();x.moveTo(xx+210,yy+61);x.lineTo(xx+237,yy+61);x.stroke()}});
 }else if(s.mode==='hero'){
   const z=1+q*.035;x.save();x.translate(640,300-lift);x.scale(z,z);for(let i=0;i<3;i++){x.beginPath();x.ellipse(0,0,192+i*32,74+i*27,-.25+i*.19,0,7);x.strokeStyle=`rgba(${i===1?'93,173,255':'51,142,255'},${.25+i*.1})`;x.lineWidth=1.4;x.stroke()}word('sonderr',0,0,64,'#f8fbff',760);x.restore();
   word('Sonderr-v1',640,450,31,'#ffffff',730);word('0.6B PARAMETERS  ·  TRAINED FOR SONDERR',640,491,12,'#94b8ec',650);
 }else if(s.mode==='speed'){
   word(s.title,640,171-lift,30,'#f7faff',730);word(s.sub,640,214,11,'#93b5e6',650);
   const bars=[['0.6B','parameters'],['LOCAL','inference'],['FAST','to start']];bars.forEach((v,i)=>{const bx=239+i*271,by=329;const a=Math.max(0,Math.min(1,(q*3-i*.34)));x.globalAlpha=a;x.fillStyle='rgba(255,255,255,.045)';x.strokeStyle='rgba(166,200,255,.22)';rr(bx,by,238,145,18);x.fill();x.stroke();word(v[0],bx+119,by+54,32,i===1?'#6fe2dd':'#f4f8ff',760);word(v[1],bx+119,by+96,13,'#9ab3d6',600);x.globalAlpha=1});
   x.save();x.strokeStyle='rgba(104,182,255,.42)';x.lineWidth=2;x.beginPath();for(let i=0;i<88;i++){const xx=245+i*9,amp=Math.sin(i*.27+t*8)*Math.exp(-i/100)*22,yy=534+amp;if(i===0)x.moveTo(xx,yy);else x.lineTo(xx,yy)}x.stroke();x.restore();
 }else if(s.mode==='tools'){
   word(s.title,640,160-lift,29,'#f7faff',730);word(s.sub,640,203,11,'#93b5e6',650);
   const nodes=[{x:640,y:394,r:65,l:'SONDERR',s:'small model'},{x:370,y:328,r:52,l:'WEB',s:'live search'},{x:910,y:328,r:52,l:'FILES',s:'local context'},{x:470,y:493,r:52,l:'TOOLS',s:'take action'},{x:810,y:493,r:52,l:'YOU',s:'your intent'}];
   nodes.slice(1).forEach((n,i)=>{const m=nodes[0];x.beginPath();x.moveTo(m.x,m.y);x.quadraticCurveTo((m.x+n.x)/2+(i%2?26:-26),(m.y+n.y)/2-14,n.x,n.y);x.strokeStyle='rgba(106,182,255,.34)';x.lineWidth=1.5;x.stroke();const px=m.x+(n.x-m.x)*((t*.38+i*.21)%1),py=m.y+(n.y-m.y)*((t*.38+i*.21)%1)-10;x.fillStyle='#7ee9df';x.beginPath();x.arc(px,py,3,0,7);x.fill()});
   nodes.forEach((n,i)=>{x.fillStyle=i===0?'rgba(60,131,255,.2)':'rgba(255,255,255,.045)';x.strokeStyle=i===0?'rgba(124,186,255,.68)':'rgba(148,190,248,.3)';x.lineWidth=i===0?2:1;x.beginPath();x.arc(n.x,n.y,n.r,0,7);x.fill();x.stroke();word(n.l,n.x,n.y-5,i===0?14:12,'#f4f8ff',720);word(n.s,n.x,n.y+15,9,'#9bb5d7',600)});
 }else if(s.mode==='web'){
   word(s.title,640,157-lift,30,'#f7faff',730);word(s.sub,640,200,11,'#93b5e6',650);
   x.fillStyle='rgba(13,29,57,.93)';x.strokeStyle='rgba(150,194,255,.25)';rr(300,264,680,286,17);x.fill();x.stroke();x.fillStyle='#132a4d';rr(300,264,680,42,16);x.fill();small('LIVE WEB SEARCH',323,285,10,'#d5e5ff',700);
   x.fillStyle='rgba(255,255,255,.07)';rr(331,330,618,42,10);x.fill();small('What changed today?',350,351,12,'#eff6ff',600);small('SEARCH',897,351,9,'#77e5de',700);
   [['Query the web','Find current sources'],['Bring back context','Ground the response'],['Show what matters','A clear answer, with links']].forEach((r,i)=>{const yy=397+i*49; x.fillStyle='rgba(255,255,255,.035)';rr(331,yy,618,39,8);x.fillStyle='#71b9ff';x.beginPath();x.arc(352,yy+19,5,0,7);x.fill();small(r[0],371,yy+19,11,'#ecf3ff',650);small(r[1],932,yy+19,10,'#8fa8c8',550);x.textAlign='right'});
 }else if(s.mode==='thesis'){
   word('A SMALL SPECIALIZED MODEL',640,224,15,'#b8d3fb',650);word('×',640,290,31,'#75aaff',500);word('A PURPOSE-BUILT ENVIRONMENT',640,349,15,'#b8d3fb',650);
   x.strokeStyle='rgba(108,183,255,.45)';x.lineWidth=1.5;x.beginPath();x.moveTo(640,385);x.lineTo(640,438);x.stroke();x.fillStyle='rgba(55,123,241,.16)';x.strokeStyle='rgba(132,194,255,.52)';rr(434,438,412,68,14);x.fill();x.stroke();word('SONDERR CAPABILITY',640,472,17,'#fff',740);word(s.title,640,564,12,'#eff6ff',650);word(s.sub,640,592,10,'#98b7e0',600);
 }else if(s.mode==='future'){
   const count=12;for(let i=0;i<count;i++){const a=(i/count)*Math.PI*2+t*.12,r=118+20*Math.sin(t*.7+i),xx=640+Math.cos(a)*r,yy=353+Math.sin(a)*r*.48;x.beginPath();x.arc(xx,yy,4+i%3,0,7);x.fillStyle=`rgba(${i%2?'110,228,218':'114,172,255'},${.42+i%3*.13})`;x.fill()}
   x.beginPath();x.arc(640,353,71,0,7);x.fillStyle='rgba(57,132,250,.15)';x.fill();x.strokeStyle='rgba(150,202,255,.5)';x.stroke();word('S',640,351,55,'#fff',760);word(s.title,640,197-lift,31,'#f7faff',730);word(s.sub,640,248,11,'#93b5e6',650);word('VERSION 01     →     WHAT COMES NEXT',640,506,10,'#8ba9d1',650);
 }else if(s.mode==='environment'){
   word(s.title,640,158-lift,30,'#f7faff',730);word(s.sub,640,201,11,'#93b5e6',650);
   x.fillStyle='rgba(13,29,57,.92)';x.strokeStyle='rgba(150,194,255,.25)';x.lineWidth=1;rr(300,267,680,304,17);x.fill();x.stroke();x.fillStyle='#132a4d';rr(300,267,680,42,16);x.fill();small('SONDERR   /   WORKSPACE',322,288,10,'#d5e5ff',700);
   const rows=[['01','Understand the goal','context'],['02','Search the live web','web_search'],['03','Use the right tool','environment'],['04','Return a clear result','Sonderr-v1']];rows.forEach((r,i)=>{let yy=337+i*54;x.fillStyle='rgba(255,255,255,.04)';rr(328,yy,624,42,9);x.fill();small(r[0],347,yy+21,10,'#70acff',700);small(r[1],386,yy+21,13,'#e8f1ff',620);x.textAlign='right';x.fillStyle=i===1?'#70e0d7':'#90a8c8';x.font='600 10px Inter,Arial';x.fillText(r[2],927,yy+21)});
 }else if(s.mode==='local'){
   const pulse=1+Math.sin(t*3)*.03;word(s.title,640,178-lift,31,'#f7faff',730);word(s.sub,640,220,11,'#93b5e6',650);x.save();x.translate(640,444);x.scale(pulse,pulse);x.fillStyle='rgba(55,116,223,.11)';x.strokeStyle='rgba(111,179,255,.52)';x.lineWidth=2;rr(-110,-99,220,196,25);x.fill();x.stroke();x.strokeStyle='#b5d5ff';x.lineWidth=7;x.beginPath();x.arc(0,-6,42,Math.PI,0);x.stroke();x.fillStyle='#b5d5ff';rr(-54,-7,108,69,15);x.fill();x.fillStyle='#2359a9';x.beginPath();x.arc(0,22,8,0,7);x.fill();x.fillRect(-3,25,6,15);x.restore();word('YOUR MACHINE',640,602,10,'#92aed2',650);
 }else if(s.mode==='craft'){
   word(s.title,640,176-lift,30,'#f7faff',730);word(s.sub,640,217,11,'#93b5e6',650);
   const cards=[['INTENT','Understand the ask','Keep the real goal in view'],['CRAFT','Make focused progress','Work in small, clear steps'],['CARE','Review before it lands','Be honest about what changed']];
   cards.forEach((r,i)=>{const xx=216+i*292,yy=302+Math.sin(t*1.5+i)*8,fadeIn=Math.max(0,Math.min(1,(q*4-i*.5)));x.globalAlpha=fadeIn;x.fillStyle='rgba(255,255,255,.055)';x.strokeStyle='rgba(166,200,255,.18)';x.lineWidth=1;rr(xx,yy,260,148,17);x.fill();x.stroke();x.textAlign='left';x.fillStyle='#75aaff';x.font='750 10px Inter,Arial';x.fillText(r[0],xx+22,yy+32);x.fillStyle='#f4f8ff';x.font='650 17px Inter,Arial';x.fillText(r[1],xx+22,yy+71);x.fillStyle='#90a8c8';x.font='12px Inter,Arial';x.fillText(r[2],xx+22,yy+101);x.globalAlpha=1});
 }else if(s.mode==='workspace'){
   word(s.title,640,175-lift,29,'#f7faff',730);word(s.sub,640,216,11,'#93b5e6',650);
   x.fillStyle='rgba(13,29,57,.92)';x.strokeStyle='rgba(150,194,255,.24)';x.lineWidth=1;rr(340,278,600,278,16);x.fill();x.stroke();x.fillStyle='#132a4d';rr(340,278,600,38,16);x.fill();x.fillStyle='#74a8ff';x.beginPath();x.arc(365,297,4,0,7);x.fill();x.fillStyle='#f1f6ff';x.font='600 11px Inter,Arial';x.fillText('workspace  /  next-thing',384,301);['A clear plan','A focused change','A careful review'].forEach((v,i)=>{const yy=354+i*59;x.fillStyle='rgba(255,255,255,.045)';rr(374,yy,532,43,9);x.fill();x.fillStyle=i===1?'#74a8ff':'#6c829f';x.beginPath();x.arc(396,yy+21,5,0,7);x.fill();x.fillStyle='#e6eefc';x.font='13px Inter,Arial';x.fillText(v,414,yy+25);x.fillStyle='#8298b9';x.font='11px Inter,Arial';x.fillText(['ready','in progress','next'][i],846,yy+25)});
 }else if(s.mode==='identity'){
   for(let i=0;i<7;i++){const y=281+i*39,x1=330+Math.sin(t*.8+i)*65,x2=950+Math.cos(t*.7+i)*55;x.beginPath();x.moveTo(x1,y);x.bezierCurveTo(480,y-45,800,y+45,x2,y);x.strokeStyle=`rgba(${i%2?'99,178,255':'71,223,221'},${.2+i*.035})`;x.lineWidth=1.5;x.stroke()}x.fillStyle='rgba(57,132,250,.16)';x.strokeStyle='rgba(150,202,255,.46)';x.beginPath();x.arc(640,420,48+Math.sin(t*2)*4,0,7);x.fill();x.stroke();word('S',640,418,48,'#fff',760);word(s.title,640,214-lift,29,'#f7faff',730);word(s.sub,640,253,11,'#93b5e6',650);
 }else{
   for(let i=0;i<5;i++){x.beginPath();x.arc(640,283,104+i*43+t*8%25,0,7);x.strokeStyle=`rgba(98,170,255,${.22-i*.025})`;x.lineWidth=1.5;x.stroke()}
   x.fillStyle='rgba(57,132,250,.15)';x.strokeStyle='rgba(150,202,255,.42)';x.lineWidth=1.5;x.beginPath();x.arc(640,286,74,0,7);x.fill();x.stroke();drawBrandMark(640,283,142);word('THE START OF',640,410,23,'#bdd7ff',650);word('THE SLM GENERATION',640,455,39,'#ffffff',780);word(s.sub,640,510,11,'#93b8ec',650);
 }
 x.fillStyle='rgba(255,255,255,.22)';rr(50,661,1180,2,1);x.fill();x.fillStyle='#69a7ff';rr(50,661,1180*Math.max(0,Math.min(1,t/98)),2,1);x.fill();
 x.fillStyle='rgba(226,238,255,.54)';x.textAlign='left';x.font='600 10px Inter,Arial';x.fillText('SONDERR  /  A NEW GENERATION',50,690);x.textAlign='right';x.fillText('SONDERR-V1   ·   0.6B',1230,690);
}

let playing=false,started=0,elapsed=0,frameId=0;function report(){window.dispatchEvent(new CustomEvent("sonderr-film-frame",{detail:{time:elapsed,playing}}))}function tick(now){if(!playing)return;if(!started)started=now-elapsed*1000;elapsed=Math.min(98,(now-started)/1000);sceneDraw(elapsed);report();if(elapsed>=98){playing=false;report();return}frameId=requestAnimationFrame(tick)}
window.drawSonderrLaunch=sceneDraw;window.sonderrLaunchDuration=98;window.playSonderrLaunch=()=>{if(elapsed>=98)elapsed=0;playing=true;started=0;cancelAnimationFrame(frameId);frameId=requestAnimationFrame(tick);report()};window.pauseSonderrLaunch=()=>{playing=false;cancelAnimationFrame(frameId);report()};window.seekSonderrLaunch=t=>{elapsed=Math.max(0,Math.min(98,Number(t)||0));started=0;sceneDraw(elapsed);report()};window.drawSonderrLaunch(0);window.pauseSonderrLaunch();})();
