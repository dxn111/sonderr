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
<img id="story" src="file://${root}/web/assets/sonderr-v1-storyboard.png" hidden>
<img id="logo" src="file://${root}/web/assets/sonderr-v1-mark.png" hidden>
<script>
window.startFilm=()=>{
const c=document.querySelector('#f'),x=c.getContext('2d',{alpha:false,desynchronized:true}),story=document.querySelector('#story'),logo=document.querySelector('#logo'),W=1280,H=720,VIDEO_SECONDS=${duration};
const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)},lerp=(a,b,t)=>a+(b-a)*t;
const beats=[
 {t:0,d:7,line:'THE WORLD GOT BIGGER.',sub:'THE MODELS GOT BIGGER.',panel:0},
 {t:7,d:7,line:'WHAT IF THEY DIDN’T HAVE TO?',sub:'A DIFFERENT IDEA IS TAKING SHAPE.',panel:1},
 {t:14,d:8,line:'SMALLER BY DESIGN.',sub:'FOCUSED ON THE WORK THAT MATTERS.',panel:1},
 {t:22,d:8,line:'BUILT FOR ITS ENVIRONMENT.',sub:'CONTEXT. TOOLS. THE LIVE WEB.',panel:2},
 {t:30,d:8,line:'CAPABILITY ISN’T JUST A NUMBER.',sub:'IT’S THE MODEL, AND EVERYTHING AROUND IT.',panel:3},
 {t:38,d:8,line:'WELCOME TO THE SLM GENERATION.',sub:'A NEW DIRECTION FOR SONDERR.',panel:4},
 {t:46,d:8,line:'MEET SONDERR-V1.',sub:'OUR FIRST MODEL.',panel:4},
 {t:54,d:8,line:'0.6 BILLION PARAMETERS.',sub:'A COMPACT MODEL. A PURPOSE-BUILT WORKSPACE.',panel:2},
 {t:62,d:8,line:'SPECIALIZED FOR SONDERR.',sub:'MADE TO GET BETTER WITH ITS ENVIRONMENT.',panel:3},
 {t:70,d:8,line:'THIS IS VERSION ONE.',sub:'SMALL LANGUAGE MODELS. BIGGER POSSIBILITIES.',panel:1},
 {t:78,d:10,line:'THE START OF THE SLM GENERATION.',sub:'SONDERR-V1  ·  OUR FIRST MODEL  ·  0.6B',panel:4}
];
const panelW=story.naturalWidth/5,srcY=Math.round(story.naturalHeight*.135),srcH=Math.round(story.naturalHeight*.72),srcW=panelW*.92;
const particles=Array.from({length:64},(_,i)=>({u:((i*7919)%10007)/10007,v:((i*1049+97)%10009)/10009,r:.5+(i%5)*.36,s:.035+(i%11)*.012,p:i*2.399,layer:i%4}));
const ribbons=Array.from({length:5},(_,i)=>({p:i*.43,phase:i*1.71,amp:24+(i%6)*18,width:i%5===0?2:0.8,speed:.18+(i%5)*.035}));
 const backdrops=Array.from({length:5},(_,i)=>{const bg=document.createElement('canvas');bg.width=480;bg.height=270;const q=bg.getContext('2d'),sx=i*panelW+panelW*.04,scale=Math.max(480/srcW,270/srcH)*1.08,bw=srcW*scale,bh=srcH*scale;q.filter='blur(8px) brightness(.63) saturate(1.3)';q.drawImage(story,sx,srcY,srcW,srcH,(480-bw)/2,(270-bh)/2,bw,bh);return bg});
function text(s,y,size=38,alpha=1,weight=680){x.save();x.globalAlpha=alpha;x.textAlign='center';x.textBaseline='middle';x.font=weight+' '+size+'px Inter,Arial,sans-serif';x.letterSpacing='3px';x.fillStyle='#f7faff';x.shadowColor='rgba(65,150,255,.54)';x.shadowBlur=23;x.fillText(s,W/2,y);x.restore()}
function drawPanel(index,t,alpha,seed){
 const sx=index*panelW+panelW*.04,sw=srcW,sh=srcH;
 x.save();x.globalAlpha=alpha*.9;
 const driftX=Math.sin(t*.11+seed)*26,driftY=Math.cos(t*.09+seed)*20;
 x.drawImage(backdrops[index],-driftX,-driftY,W+driftX*2,H+driftY*2);x.restore();
 const z=2.32+.10*Math.sin(t*.13+seed)+.075*Math.sin(t*.051+seed*2),dw=sw*z,dh=sh*z;
 const travelX=Math.sin(t*.19+seed)*88+Math.sin(t*.067+seed)*56;
 const travelY=Math.cos(t*.14+seed)*74+Math.sin(t*.071+seed)*36;
 x.save();x.globalAlpha=alpha;x.drawImage(story,sx,srcY,sw,sh,(W-dw)/2+travelX,(H-dh)/2+travelY,dw,dh);x.restore();
}
function activeBeat(t){let i=beats.findIndex((b,j)=>t>=b.t&&(j===beats.length-1||t<beats[j+1].t));if(i<0)i=0;const b=beats[i],local=t-b.t,fadeIn=smooth(local/.52),fadeOut=1-smooth((local-(b.d-.54))/.54);return {b,i,local,alpha:fadeIn*fadeOut}}
function render(t){
 const {b,i,local,alpha}=activeBeat(t),next=beats[(i+1)%beats.length],mix=smooth((local-(b.d-1.35))/1.35),entry=smooth(local/.72),exit=1-smooth((local-(b.d-.72))/.72);
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
 const hero=smooth((t-39)/1.4)*(1-smooth((t-54)/1.2));
 const cx=lerp(113,W*.5,hero),cy=lerp(70,H*.43,hero),size=lerp(42,113,hero)*(1+.025*Math.sin(t*2.1));
 if(logo.complete&&logo.naturalWidth){x.save();x.globalAlpha=.93;x.shadowColor='rgba(70,171,255,.82)';x.shadowBlur=34;x.drawImage(logo,cx-size/2,cy-size/2,size,size);x.restore()}
 if(hero<.9){x.save();x.globalAlpha=.89*(1-hero*.6);x.textAlign='left';x.textBaseline='middle';x.font='760 13px Inter,Arial,sans-serif';x.letterSpacing='2.6px';x.fillStyle='#f5f8ff';x.fillText('SONDERR',144,65);x.font='620 7px Inter,Arial,sans-serif';x.letterSpacing='1.4px';x.fillStyle='#a8d5ff';x.fillText('A NEW MODEL GENERATION',145,82);x.restore()}

 // Kinetic type eases into the composition and leaves on a moving light cue.
 const typeAlpha=alpha*exit; x.save();x.globalAlpha=typeAlpha;x.translate(0,(1-entry)*34-(1-exit)*18);
 text(b.line,H*.705,31.5,entry,760);text(b.sub,H*.765,12,entry*.88,590);x.restore();
 if(b.line.includes('WELCOME')){const rev=smooth((local-1.3)/.8);x.save();x.globalAlpha=rev*(1-smooth((local-6.8)/.7));const sweep=(local*450)%(W+500)-250;const g=x.createLinearGradient(sweep-180,0,sweep+180,0);g.addColorStop(0,'rgba(114,187,255,0)');g.addColorStop(.5,'rgba(186,236,255,.8)');g.addColorStop(1,'rgba(114,187,255,0)');x.fillStyle=g;x.fillRect(sweep-180,H*.655,360,4);x.restore()}

 // Animated progress line and small editorial signature.
 const fg=x.createLinearGradient(100,0,1820,0);fg.addColorStop(0,'#4ea4ff');fg.addColorStop(.53,'#b4efff');fg.addColorStop(1,'#697fff');
 x.fillStyle='rgba(222,239,255,.22)';x.fillRect(100,H-43,1080,1.5);x.fillStyle=fg;x.fillRect(100,H-43,1080*clamp(t/88),1.5);
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
};Promise.all([document.querySelector('#story').decode(),document.querySelector('#logo').decode()]).then(window.startFilm);
</script>`;

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    page.on('pageerror', error => console.error('Render page error:', error.message));
    await page.goto('file://' + path.join(root, 'web/assets/sonderr-v1-storyboard.png').replace('sonderr-v1-storyboard.png',''));
    await page.setContent(html);
    await page.evaluate(async () => Promise.all([document.querySelector('#story').decode(), document.querySelector('#logo').decode()]));
    console.log('renderer loaded:', await page.evaluate(() => typeof window.render));
    const segmentDir=path.join('/tmp',`sonderr-film-segments-${process.pid}-${Date.now()}`);fs.mkdirSync(segmentDir,{recursive:true});
    await page.exposeFunction('saveSegment', async (i,buffer) => fs.writeFileSync(path.join(segmentDir,`segment-${String(i).padStart(3,'0')}.webm`),Buffer.from(buffer)));
    await page.exposeFunction('renderProgress', status => process.stdout.write(`Rendered ${status.seconds.toFixed(0)}s · ${status.fps.toFixed(1)} canvas fps\n`));
    await page.evaluate(() => render(84));
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
