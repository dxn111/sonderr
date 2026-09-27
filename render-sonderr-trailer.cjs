const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/home/dxn1/Downloads/Devin-linux-x64-3.10.31/Devin/resources/app/node_modules/playwright-core');

const root = __dirname;
const output = path.join(root, 'web/assets/sonderr-v1-launch.mp4');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const scoreWav = path.join('/tmp', 'sonderr-launch-score.wav');
const poster = path.join(root, 'web/assets/sonderr-v1-poster.png');
const duration = Math.max(1, Number(process.env.SONDERR_RENDER_SECONDS) || 88);

const html = `<!doctype html><meta charset="utf-8"><canvas id="f" width="1280" height="720"></canvas>
<img id="logo" src="file://${root}/web/assets/sonderr-v1-mark.png" hidden>
<script>
window.startFilm=()=>{
const c=document.querySelector('#f'),x=c.getContext('2d',{alpha:false,desynchronized:true}),logo=document.querySelector('#logo'),W=1280,H=720,VIDEO_SECONDS=${duration};
const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)},lerp=(a,b,t)=>a+(b-a)*t;
const phrases=['MORE.','MORE PARAMETERS.','MORE COMPUTE.','MORE CAPACITY.','THE EXPECTATION: EVERYTHING.','WHAT IS ACTUALLY ENOUGH?','A SMALLER MODEL.','A BIGGER WORLD AROUND IT.','THIS IS SONDERR.','A NEW KIND OF WORKSPACE.','MEET SONDERR-V1.','OUR FIRST MODEL.','0.6 BILLION PARAMETERS.','A SMALL LANGUAGE MODEL.','ON PURPOSE.','SMALL BY PRINCIPLE.','BUILT FOR SONDERR.','THE MODEL IS ONE PART.','THE ENVIRONMENT EXPANDS IT.','THE LIVE WEB.','YOUR WORKSPACE.','TOOLS IN THE FLOW.','CONTEXT WHEN IT MATTERS.','SEARCH. UNDERSTAND. ACT.','ONE CONNECTED WORKSPACE.','ONE SPECIALIZED MODEL.','BUILT TO WORK TOGETHER.','THE MODEL STAYS SMALL.','THE ENVIRONMENT KEEPS GROWING.','MORE TOOLS. MORE REACH.','MORE CONTEXT. MORE RELEVANCE.','THIS IS VERSION ONE.','THE MODEL WILL IMPROVE.','THE ENVIRONMENT WILL TOO.','SMALL MODELS. CAPABLE SYSTEMS.','A DIFFERENT WAY FORWARD.','THE SLM GENERATION STARTS HERE.','SONDERR-V1.','OUR FIRST SLM.','0.6B PARAMETERS.','SPECIALIZED FOR SONDERR.','BUILT TO KEEP GETTING BETTER.','SMALL, BY PRINCIPLE.','A BIGGER WORLD AROUND IT.','THE START OF THE SLM GENERATION.'];
const beats=phrases.map((line,i)=>({t:i*VIDEO_SECONDS/phrases.length,d:VIDEO_SECONDS/phrases.length,line,sub:'',panel:Math.floor(i/4)%5}));
const stars=Array.from({length:190},(_,i)=>({u:((i*7919)%10007)/10007,v:((i*1049+97)%10009)/10009,r:.7+(i%5)*.52,p:i*2.399,s:20+(i%6)*17}));
const ribbons=Array.from({length:8},(_,i)=>({phase:i*1.71,amp:34+(i%6)*19,width:i%4===0?2.2:1,speed:.32+(i%5)*.05}));
const particles=Array.from({length:180},(_,i)=>({u:((i*3571)%10007)/10007,v:((i*7919+17)%10009)/10009,layer:i%5,p:i*2.17,r:.7+(i%4)*.52}));
function text(s,y,size=38,alpha=1,weight=680){if(!s)return;x.save();x.globalAlpha=alpha;x.textAlign='center';x.textBaseline='middle';x.font=weight+' '+size+'px Inter,Arial,sans-serif';x.letterSpacing='2.5px';while(size>24&&x.measureText(s).width>W-120){size-=1;x.font=weight+' '+size+'px Inter,Arial,sans-serif'}x.fillStyle='#f7faff';x.shadowColor='rgba(65,150,255,.72)';x.shadowBlur=20;x.fillText(s,W/2,y);x.restore()}
function card(px,py,w,h,label,kind,t,seed=0){const drift=Math.sin(t*.7+seed)*18;x.save();x.translate(px+drift,py+Math.cos(t*.55+seed)*10);x.fillStyle='rgba(7,20,43,.80)';x.strokeStyle='rgba(151,204,255,.34)';x.lineWidth=1.2;x.beginPath();x.roundRect(-w/2,-h/2,w,h,16);x.fill();x.stroke();x.fillStyle='rgba(89,146,218,.18)';x.beginPath();x.roundRect(-w/2+12,-h/2+12,22,22,7);x.fill();x.fillStyle='#cbe6ff';x.font='700 11px Inter,Arial,sans-serif';x.textAlign='left';x.textBaseline='middle';x.letterSpacing='1.3px';x.fillText(label,-w/2+44,-h/2+23);x.fillStyle='rgba(175,211,250,.68)';x.font='500 10px Inter,Arial,sans-serif';x.letterSpacing='.4px';if(kind==='search'){x.fillText('Searching the live web',-w/2+18,-h/2+59);for(let j=0;j<3;j++){const xx=-w/2+18,yy=-h/2+80+j*24,ww=(w-55)*(.68+.25*(.5+.5*Math.sin(t*1.8+j)));x.fillStyle='rgba(119,174,239,.38)';x.fillRect(xx,yy,ww,3);x.fillStyle='rgba(180,217,255,.76)';x.fillRect(xx,yy+8,ww*.63,2)}}else if(kind==='workspace'){x.fillText('workspace / current task',-w/2+18,-h/2+59);for(let j=0;j<4;j++){x.fillStyle=j===Math.floor((t*1.6)%4)?'rgba(111,202,255,.85)':'rgba(119,174,239,.35)';x.fillRect(-w/2+18,-h/2+82+j*18,(w-45)*(.38+.1*(j%3)),3)}}else{for(let j=0;j<3;j++){x.fillStyle='rgba(119,174,239,.43)';x.fillRect(-w/2+18,-h/2+61+j*25,(w-45)*(.47+.1*(j%2)),4)}}x.restore()}
function drawPanel(index,t,alpha,seed){
 if(alpha<=.002)return;x.save();x.globalAlpha=alpha;
 const palettes=[['#071124','#133970','#69d7ff'],['#060f24','#092e59','#8bdcff'],['#080f20','#164268','#a9e8ff'],['#061428','#203964','#81c7ff'],['#050d1d','#122955','#9bdfff']][index%5];
 const wash=x.createLinearGradient(0,0,W,H);wash.addColorStop(0,palettes[0]);wash.addColorStop(.55,palettes[1]);wash.addColorStop(1,'#050914');x.fillStyle=wash;x.fillRect(0,0,W,H);
 const cx=W*.5+Math.sin(t*.23+seed)*92,cy=H*.43+Math.cos(t*.19+seed)*45,pulse=.72+.28*Math.sin(t*1.65+seed)**2;
 const aura=x.createRadialGradient(cx,cy,12,cx,cy,Math.max(W,H)*.76);aura.addColorStop(0,palettes[2]+'48');aura.addColorStop(.38,palettes[1]+'27');aura.addColorStop(1,'rgba(3,8,20,0)');x.fillStyle=aura;x.fillRect(0,0,W,H);
 x.save();x.globalCompositeOperation='screen';
 // Continuous depth: the point field moves toward and past the camera.
 for(const p of stars){const z=((p.v*1.7+t*.095+p.p*.013)%1),perspective=.15+z*1.7,px=(p.u-.5)*W*perspective+W*.5+Math.sin(t*.24+p.p)*24,py=(p.v-.5)*H*perspective+H*.48+Math.cos(t*.19+p.p)*18;x.globalAlpha=alpha*(.18+z*.58);x.fillStyle=p.r>2.3?'#bceeff':'#9ccaff';x.beginPath();x.arc(px,py,p.r*(.35+z),0,Math.PI*2);x.fill()}
 for(let j=0;j<ribbons.length;j++){const r=ribbons[j],base=H*(.19+j*.092),shift=(t*r.speed*170+j*143)%500-250;x.beginPath();x.moveTo(-80,base+Math.sin(t*.7+r.phase)*r.amp);x.bezierCurveTo(W*.2,base+Math.sin(t*.54+r.phase+1.3)*r.amp+shift*.28,W*.75,base+Math.cos(t*.62+r.phase)*r.amp-shift*.25,W+80,base+Math.sin(t*.63+r.phase+2)*r.amp);x.strokeStyle='rgba(122,197,255,.26)';x.lineWidth=r.width;x.stroke()}
 x.restore();
 // Every chapter becomes a different animated scene, blending while the camera keeps moving.
 const turn=(t*.29+seed*.7),rx=lerp(88,226,.5+.5*Math.sin(t*.3+seed)),ry=rx*.66;
 if(index%5===0){
  // Scale collapses into a compact luminous model core.
  const big=lerp(255,90,.5+.5*Math.sin(t*.42+seed));x.save();x.translate(cx,cy);x.rotate(Math.sin(t*.31)*.18);x.strokeStyle='rgba(114,202,255,.68)';x.lineWidth=1.5;for(let j=0;j<5;j++){const a=big*(1+j*.24);x.beginPath();x.ellipse(0,0,a,a*.73,turn+j*.15,0,Math.PI*2);x.stroke()}x.fillStyle='rgba(93,185,255,.18)';x.beginPath();x.arc(0,0,big*.36,0,Math.PI*2);x.fill();x.strokeStyle=palettes[2];x.lineWidth=2;x.stroke();x.restore();
  const n=String((11.8-11.2*(.5+.5*Math.sin(t*.32))).toFixed(1))+'B';x.save();x.globalAlpha=alpha*.26;x.font='760 148px Inter,Arial,sans-serif';x.textAlign='center';x.fillStyle='#c4e6ff';x.fillText(n,cx,cy+55);x.restore();
 }else if(index%5===1){
  // A live network globe rotates behind a central model mark.
  x.save();x.translate(cx,cy);x.rotate(turn*.16);x.strokeStyle='rgba(126,207,255,.42)';x.lineWidth=1.2;for(let j=0;j<8;j++){x.beginPath();x.ellipse(0,0,rx*Math.abs(Math.cos(turn+j*.42)),ry,turn+j*.42,0,Math.PI*2);x.stroke()}for(let j=0;j<7;j++){x.beginPath();x.ellipse(0,0,rx,ry*Math.abs(Math.cos(turn+j*.48)),0,0,Math.PI*2);x.stroke()}for(let j=0;j<24;j++){const a=j*Math.PI*2/24+turn,xx=Math.cos(a)*rx,yy=Math.sin(a)*ry;x.fillStyle=j%3?'#8bcfff':'#f1fbff';x.beginPath();x.arc(xx,yy,j%3?2.2:3.8,0,Math.PI*2);x.fill()}x.restore();
  card(W*.78,H*.36,290,156,'LIVE WEB','search',t,seed);
 }else if(index%5===2){
  // Search results assemble, update, and leave through a browser-shaped frame.
  const slide=(1-smooth(((t+seed*.3)%8)/1.1))*170;x.save();x.translate(-slide,0);card(W*.43,H*.43,570,292,'SONDERR SEARCH','search',t,seed);x.restore();
  for(let j=0;j<3;j++){const a=t*.35+j*2.1,px=cx+Math.cos(a)*rx*1.4,py=cy+Math.sin(a)*ry*1.2;x.strokeStyle='rgba(136,207,255,.42)';x.lineWidth=1;x.beginPath();x.moveTo(cx,cy);x.lineTo(px,py);x.stroke();x.fillStyle='#a8e5ff';x.beginPath();x.arc(px,py,3.5,0,Math.PI*2);x.fill()}
 }else if(index%5===3){
  // Workspace files, task context, and tools orbit a compact task surface.
  const drift=Math.sin(t*.28+seed)*40;card(W*.34+drift,H*.39,350,232,'YOUR WORKSPACE','workspace',t,seed);card(W*.69-drift,H*.36,350,214,'TASK CONTEXT','context',t,seed+1);
  x.save();x.translate(cx,cy+95+Math.sin(t*.8)*12);x.rotate(Math.sin(t*.35)*.045);x.fillStyle='rgba(30,100,181,.29)';x.strokeStyle='rgba(169,224,255,.72)';x.beginPath();x.roundRect(-142,-34,284,68,20);x.fill();x.stroke();x.fillStyle='#eaf8ff';x.textAlign='center';x.textBaseline='middle';x.font='700 13px Inter,Arial,sans-serif';x.letterSpacing='2px';x.fillText('SEARCH  ·  CONTEXT  ·  TOOLS',0,0);x.restore();
 }else{
  // Logo reveal: the Sonderr mark turns as paths converge into its orbit.
  x.save();x.translate(cx,cy);x.rotate(Math.sin(t*.36)*.12);for(let j=0;j<9;j++){const a=turn+j*Math.PI*2/9,px=Math.cos(a)*rx*1.35,py=Math.sin(a)*ry*1.35;x.strokeStyle='rgba(121,200,255,.42)';x.lineWidth=1;x.beginPath();x.moveTo(px,py);x.quadraticCurveTo(Math.cos(a+1.2)*60,Math.sin(a+1.2)*50,0,0);x.stroke();x.fillStyle='#a6e5ff';x.beginPath();x.arc(px,py,3+((j+Math.floor(t*3))%3),0,Math.PI*2);x.fill()}x.restore();
  const logoSize=186+Math.sin(t*1.1)*8;if(logo.complete&&logo.naturalWidth){x.save();x.globalAlpha=alpha*.96;x.shadowColor='#63bcff';x.shadowBlur=35;x.drawImage(logo,cx-logoSize/2,cy-logoSize/2,logoSize,logoSize);x.restore()}
 }
 // Camera motion and a soft scan light keep the whole composition alive.
 const scan=(t*240)%(W+500)-250;x.save();x.globalAlpha=alpha*.23;const beam=x.createLinearGradient(scan-120,0,scan+120,0);beam.addColorStop(0,'rgba(120,203,255,0)');beam.addColorStop(.5,'rgba(160,226,255,.7)');beam.addColorStop(1,'rgba(120,203,255,0)');x.fillStyle=beam;x.fillRect(scan-120,0,240,H);x.restore();x.restore();
}
function activeBeat(t){let i=beats.findIndex((b,j)=>t>=b.t&&(j===beats.length-1||t<beats[j+1].t));if(i<0)i=0;const b=beats[i],local=t-b.t,fadeIn=smooth(local/.18),fadeOut=1-smooth((local-(b.d-.18))/.18);return {b,i,local,alpha:fadeIn*fadeOut}}
function render(t){
 const {b,i,local,alpha}=activeBeat(t),next=beats[(i+1)%beats.length],mix=smooth((local-(b.d-.82))/.82),entry=smooth(local/.17),exit=1-smooth((local-(b.d-.17))/.17);
 x.globalAlpha=1;x.fillStyle='#050a18';x.fillRect(0,0,W,H);
 // The scene keeps moving through every beat: the upcoming artwork blends in
 // continuously while the virtual camera drifts across the layered image.
 drawPanel(b.panel,t,1-mix,i);drawPanel(next.panel,t,mix,(i+1)%beats.length);
 const grade=x.createLinearGradient(0,0,0,H);grade.addColorStop(0,'rgba(3,8,19,.48)');grade.addColorStop(.39,'rgba(3,9,22,.10)');grade.addColorStop(.67,'rgba(3,9,22,.17)');grade.addColorStop(1,'rgba(3,8,18,.78)');x.fillStyle=grade;x.fillRect(0,0,W,H);
 const vignette=x.createRadialGradient(W*.5,H*.43,150,W*.5,H*.43,1230);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(.7,'rgba(0,2,11,.08)');vignette.addColorStop(1,'rgba(0,2,11,.66)');x.fillStyle=vignette;x.fillRect(0,0,W,H);

 // Flow field: light threads continuously travel across the entire frame.
 x.save();x.globalCompositeOperation='screen';
 for(let j=0;j<ribbons.length;j++){
  const r=ribbons[j],base=H*(.25+(j%9)*.075),shift=(t*r.speed*240+j*137)%420-210;
  x.beginPath();x.moveTo(-100,base+Math.sin(t*.8+r.phase)*r.amp);
  x.bezierCurveTo(W*.22,base+Math.sin(t*.63+r.phase+1.4)*r.amp+shift*.32,W*.70,base+Math.cos(t*.56+r.phase)*r.amp-shift*.24,W+100,base+Math.sin(t*.73+r.phase+2)*r.amp);
  x.strokeStyle='rgba(115,212,255,.30)';x.lineWidth=r.width;x.stroke();
 }
 x.restore();

 // Fine signal particles stream in depth, with brighter motes following the
 // traveling curves. Their positions update every frame at 60 fps.
 x.save();x.globalCompositeOperation='screen';
 for(let j=0;j<particles.length;j++){
  const p=particles[j],speed=30+p.layer*21,px=(p.u*W+t*speed+p.p*17)%(W+80)-40;
  const flow=Math.sin(px*.0042+t*.47+p.p)*75+Math.sin(px*.0016-t*.31+p.p*2)*51;
  const py=(p.v*H+flow+(t*speed*.30)%(H+70))%(H+70)-35;
  const twinkle=.36+.64*(.5+.5*Math.sin(t*2.2+p.p));x.globalAlpha=(.15+p.layer*.08)*twinkle;
  x.fillStyle=j%7===0?'#b5efff':'#b5ceff';x.beginPath();x.arc(px,py,p.r*(1+p.layer*.12),0,Math.PI*2);x.fill();
 }
 x.restore();

 // A traveling signal pulse sweeps through the connected environment.
 const pulse=(t*235)%(W+400)-200,py=H*.53+Math.sin(t*.65)*48;
 x.save();x.globalAlpha=.75;x.strokeStyle='rgba(151,220,255,.58)';x.lineWidth=2;x.beginPath();x.moveTo(pulse-38,py);x.lineTo(pulse+38,py);x.stroke();x.restore();

 // Brand mark joins the flow, then settles into a small corner signature.
 const hero=smooth((t-74)/1.2)*(1-smooth((t-86)/1.2));
 const cx=lerp(113,W*.5,hero),cy=lerp(70,H*.43,hero),size=lerp(42,113,hero)*(1+.025*Math.sin(t*2.1));
 if(logo.complete&&logo.naturalWidth){x.save();x.globalAlpha=.93;x.shadowColor='rgba(70,171,255,.82)';x.shadowBlur=34;x.drawImage(logo,cx-size/2,cy-size/2,size,size);x.restore()}
 if(hero<.9){x.save();x.globalAlpha=.89*(1-hero*.6);x.textAlign='left';x.textBaseline='middle';x.font='760 13px Inter,Arial,sans-serif';x.letterSpacing='2.6px';x.fillStyle='#f5f8ff';x.fillText('SONDERR',144,65);x.font='620 7px Inter,Arial,sans-serif';x.letterSpacing='1.4px';x.fillStyle='#a8d5ff';x.fillText('A NEW MODEL GENERATION',145,82);x.restore()}

 // Kinetic type eases into the composition and leaves on a moving light cue.
 const typeAlpha=alpha*exit; x.save();x.globalAlpha=typeAlpha;x.translate(0,(1-entry)*34-(1-exit)*18);
 text(b.line,H*.78,40,entry,780);x.restore();

 // Animated progress line and small editorial signature.
 const fg=x.createLinearGradient(100,0,1180,0);fg.addColorStop(0,'#4ea4ff');fg.addColorStop(.53,'#b4efff');fg.addColorStop(1,'#697fff');
 x.fillStyle='rgba(222,239,255,.22)';x.fillRect(100,H-43,1080,1.5);x.fillStyle=fg;x.fillRect(100,H-43,1080*clamp(t/VIDEO_SECONDS),1.5);
 x.save();x.font='600 7px Inter,Arial,sans-serif';x.letterSpacing='1.4px';x.fillStyle='rgba(221,235,255,.62)';x.textAlign='left';x.fillText('SONDERR  /  THE FIRST MODEL',101,H-25);x.textAlign='right';x.fillText('SLM GENERATION  ·  0.6B',1179,H-25);x.restore();
}

window.render=render;
window.record=async()=>{
 const encoded=[];const encoder=new VideoEncoder({output:chunk=>encoded.push(chunk),error:e=>{throw e}});
 encoder.configure({codec:'vp09.00.10.08',width:W,height:H,bitrate:8000000,framerate:60,latencyMode:'realtime'});
 let frameCount=0,reportAt=0,segment=0;
 for(let i=0;i<Math.ceil(VIDEO_SECONDS*60);i++){
  const elapsed=i/60;render(Math.min(VIDEO_SECONDS,elapsed));
  const frame=new VideoFrame(c,{timestamp:i*16667,duration:16667});encoder.encode(frame,{keyFrame:i%300===0});frame.close();frameCount++;
  if(elapsed-reportAt>=5){reportAt=elapsed;window.renderProgress({seconds:elapsed,frames:frameCount,fps:60})}
  if(encoder.encodeQueueSize>8)await encoder.flush();
  if((i+1)%300===0||i===Math.ceil(VIDEO_SECONDS*60)-1){await encoder.flush();const segmentWebm=new WebMWriter({width:W,height:H,frameRate:60});for(const chunk of encoded)segmentWebm.addVideoChunk(chunk);await window.saveSegment(segment++,Array.from(await segmentWebm.complete()));encoded.length=0}
 }
 await encoder.flush();encoder.close();
 return {frames:frameCount,duration:VIDEO_SECONDS,encoded:encoded.length,codec:encoder.state};
};

// Minimal WebM muxer for VP9 frames produced by WebCodecs.
class WebMWriter {
 constructor({width,height,frameRate}){this.width=width;this.height=height;this.frameRate=frameRate;this.frames=[]}
 addVideoChunk(chunk){const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);this.frames.push({data,timestamp:chunk.timestamp,key:chunk.type==='key'})}
 async complete(){return muxWebM(this.width,this.height,this.frameRate,this.frames)}
}
function vint(value){if(value<127)return Uint8Array.of(0x80|value);if(value<16383)return Uint8Array.of((value>>8)|0x40,value&255);if(value<2097151)return Uint8Array.of((value>>16)|0x20,(value>>8)&255,value&255);if(value<268435455)return Uint8Array.of((value>>24)|0x10,(value>>16)&255,(value>>8)&255,value&255);throw Error('WebM element too large')}
function el(id,data){const idb=Uint8Array.from(id.match(/../g).map(v=>parseInt(v,16))),size=vint(data.length),out=new Uint8Array(idb.length+size.length+data.length);out.set(idb);out.set(size,idb.length);out.set(data,idb.length+size.length);return out}
function uint(value,n=1){const b=new Uint8Array(n);for(let i=n-1;i>=0;i--){b[i]=value&255;value=Math.floor(value/256)}return b}
function str(s){return new TextEncoder().encode(s)}
function join(parts){const n=parts.reduce((a,b)=>a+b.length,0),out=new Uint8Array(n);let p=0;for(const b of parts){out.set(b,p);p+=b.length}return out}
function muxWebM(width,height,fps,frames){
 const ebml=el('1a45dfa3',join([el('4286',uint(1)),el('42f7',uint(1)),el('42f2',uint(4)),el('42f3',uint(8)),el('4282',str('webm')),el('4287',uint(4)),el('4285',uint(2))]));
 const scale=1000000,duration=frames.length/fps*1000;
 const info=el('1549a966',join([el('2ad7b1',uint(scale,3)),el('4d80',str('Sonderr')),el('5741',str('Sonderr')),el('4489',new Uint8Array(new Float64Array([duration]).buffer).reverse())]));
 const video=el('e0',join([el('b0',uint(width,2)),el('ba',uint(height,2))]));
 const entry=el('ae',join([el('d7',uint(1)),el('73c5',uint(1,2)),el('83',uint(1)),el('86',str('V_VP9')),video]));
 const tracks=el('1654ae6b',entry),clusters=[];let group=[];
 const flush=()=>{if(!group.length)return;const base=group[0].timestamp/1000,blocks=[];for(const f of group){const ms=Math.round(f.timestamp/1000-base);blocks.push(el('a3',join([uint(0x81,1),uint(ms,2),Uint8Array.of(f.key?0x80:0),f.data])))}clusters.push(el('1f43b675',join([el('e7',uint(Math.round(base),4)),...blocks])));group=[]};
 for(const f of frames){const ms=f.timestamp/1000;if(group.length&&ms-group[0].timestamp/1000>30000)flush();group.push(f)}flush();
 return join([ebml,el('18538067',join([info,tracks,...clusters]))]);
}
};document.querySelector('#logo').decode().then(window.startFilm);
</script>`;

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto('file://' + path.join(root, 'web/assets/'));
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    page.on('pageerror', error => console.error('Render page error:', error.message));
    await page.setContent(html);
    await page.evaluate(async () => document.querySelector('#logo').decode());
    console.log('renderer loaded:', await page.evaluate(() => typeof window.render));
    const segmentDir=path.join('/tmp',`sonderr-film-segments-${process.pid}-${Date.now()}`);fs.mkdirSync(segmentDir,{recursive:true});
    await page.exposeFunction('saveSegment', async (i,buffer) => fs.writeFileSync(path.join(segmentDir,`segment-${String(i).padStart(3,'0')}.webm`),Buffer.from(buffer)));
    await page.exposeFunction('renderProgress', status => process.stdout.write(`Rendered ${status.seconds.toFixed(0)}s · ${status.fps.toFixed(1)} canvas fps\n`));
    await page.evaluate(t => render(t), Math.max(0, duration - .1));
    await page.locator('#f').screenshot({ path: poster });
    console.log(`Recording ${duration} seconds at a 60 fps canvas capture rate with a continuously flowing light field, moving camera, particles and scene transitions…`);
    const stats = await page.evaluate(() => window.record());
    console.log(`Rendered ${stats.frames} unique frames. Encoding with ffmpeg…`);
    const { spawnSync } = require('node:child_process');
    const scoreGen=spawnSync('python3',[path.join(root,'render-sonderr-score.py'),scoreWav,String(duration)],{encoding:'utf8',maxBuffer:1024*1024});
    if(scoreGen.status!==0)throw new Error('score generation failed: '+(scoreGen.stderr||scoreGen.error));
    const list=path.join(segmentDir,'concat.txt');fs.writeFileSync(list,fs.readdirSync(segmentDir).filter(n=>/^segment-.*\.webm$/.test(n)).sort().map(n=>`file '${path.join(segmentDir,n)}'`).join('\n'));
    const args=['-y','-f','concat','-safe','0','-i',list,'-i',scoreWav,'-vf','fps=60,scale=1920:1080:flags=lanczos,format=yuv420p','-c:v','libx264','-preset','veryfast','-crf','17','-r','60','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',output];
    const enc=spawnSync(ffmpeg,args,{encoding:'utf8',maxBuffer:5*1024*1024});
    if(enc.status!==0)throw new Error('ffmpeg encode failed: '+(enc.stderr||enc.error));
    console.log(`Saved ${output} (${(fs.statSync(output).size / 1e6).toFixed(1)} MB); 1920×1080 H.264 at 60 fps; ${stats.frames} unique rendered frames`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
