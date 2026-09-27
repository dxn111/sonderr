const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/home/dxn1/Downloads/Devin-linux-x64-3.10.31/Devin/resources/app/node_modules/playwright-core');

const root = __dirname;
const output = path.join(root, 'web/assets/sonderr-v1-launch.webm');
const poster = path.join(root, 'web/assets/sonderr-v1-poster.png');

const html = `<!doctype html><meta charset="utf-8"><canvas id="f" width="1920" height="1080"></canvas>
<img id="story" src="file://${root}/web/assets/sonderr-v1-storyboard.png" hidden>
<img id="logo" src="file://${root}/web/assets/sonderr-v1-mark.png" hidden>
<script>
const c=document.querySelector('#f'),x=c.getContext('2d'),story=document.querySelector('#story'),logo=document.querySelector('#logo'),W=1920,H=1080;
const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
const beats=[
 {t:0,d:7,line:'THE WORLD GOT BIGGER.',sub:'THE MODELS GOT BIGGER.',panel:0},
 {t:7,d:7,line:'WHAT IF THEY DIDN’T HAVE TO?',sub:'A DIFFERENT IDEA IS TAKING SHAPE.',panel:1},
 {t:14,d:8,line:'SMALLER BY DESIGN.',sub:'FOCUSED ON THE WORK THAT MATTERS.',panel:1},
 {t:22,d:8,line:'BUILT FOR ITS ENVIRONMENT.',sub:'CONTEXT. TOOLS. THE LIVE WEB.',panel:2},
 {t:30,d:8,line:'CAPABILITY ISN’T JUST A NUMBER.',sub:'IT’S THE MODEL, AND EVERYTHING AROUND IT.',panel:3},
 {t:38,d:8,line:'WELCOME TO THE SLM GENERATION.',sub:'A NEW DIRECTION FOR SON DERR.'.replace('SON DERR','SONDERR'),panel:4},
 {t:46,d:8,line:'MEET SONDERR-V1.',sub:'OUR FIRST MODEL.',panel:4},
 {t:54,d:8,line:'0.6 BILLION PARAMETERS.',sub:'A COMPACT MODEL. A PURPOSE-BUILT WORKSPACE.',panel:2},
 {t:62,d:8,line:'SPECIALIZED FOR SONDERR.',sub:'MADE TO GET BETTER WITH ITS ENVIRONMENT.',panel:3},
 {t:70,d:8,line:'THIS IS VERSION ONE.',sub:'SMALL LANGUAGE MODELS. BIGGER POSSIBILITIES.',panel:4},
 {t:78,d:10,line:'THE START OF THE SLM GENERATION.',sub:'SONDERR-V1  ·  OUR FIRST MODEL  ·  0.6B',panel:4}
];
function text(s,y,size=38,alpha=1,weight=680){x.save();x.globalAlpha=alpha;x.textAlign='center';x.textBaseline='middle';x.font=weight+' '+size+'px Inter,Arial,sans-serif';x.letterSpacing='3px';x.fillStyle='#f7faff';x.shadowColor='rgba(65,150,255,.54)';x.shadowBlur=25;x.fillText(s,W/2,y);x.restore()}
function render(t){
 const b=beats.find((v,i)=>t>=v.t&&(i===beats.length-1||t<v.t+v.d))||beats.at(-1),local=t-b.t,p=smooth(local/1.2),out=1-smooth((local-(b.d-1.1))/1.1);
 x.clearRect(0,0,W,H);x.fillStyle='#050c1b';x.fillRect(0,0,W,H);
 if(story.complete&&story.naturalWidth){const sw=story.naturalWidth/5,sh=story.naturalHeight;const zoom=1.05+0.10*smooth((local+.5)/b.d),dw=W*zoom,dh=H*zoom;const pan=Math.sin(t*.21)*55;const sx=b.panel*sw;x.globalAlpha=.92;x.drawImage(story,sx,0,sw,sh,(W-dw)/2+pan,(H-dh)/2,dw,dh);x.globalAlpha=1;}
 const shade=x.createLinearGradient(0,0,0,H);shade.addColorStop(0,'rgba(2,7,18,.45)');shade.addColorStop(.45,'rgba(2,8,21,.17)');shade.addColorStop(1,'rgba(2,7,18,.78)');x.fillStyle=shade;x.fillRect(0,0,W,H);
 const vignette=x.createRadialGradient(W/2,H*.43,90,W/2,H*.43,1050);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,3,12,.52)');x.fillStyle=vignette;x.fillRect(0,0,W,H);
 // Responsive animated logo lockup and orbiting signal particles.
 const centerX=W/2,centerY=H*.42,markSize=190+Math.sin(t*1.2)*8;
 x.save();x.globalAlpha=.62;for(let i=0;i<34;i++){const a=i*2.399+t*.18,r=170+(i%7)*34,px=centerX+Math.cos(a)*r,py=centerY+Math.sin(a)*r*.52;x.fillStyle='rgba(170,220,255,'+(.25+(i%4)*.1)+')';x.beginPath();x.arc(px,py,1.2+(i%3),0,Math.PI*2);x.fill()}x.restore();
 if(logo.complete&&logo.naturalWidth){x.save();x.globalAlpha=.96;x.shadowColor='rgba(65,160,255,.9)';x.shadowBlur=52;x.drawImage(logo,centerX-markSize/2,centerY-markSize/2,markSize,markSize);x.restore()}
 x.save();x.globalAlpha=.88;x.textAlign='left';x.textBaseline='middle';x.font='750 19px Inter,Arial,sans-serif';x.letterSpacing='4px';x.fillStyle='#f5f8ff';x.fillText('SONDERR',94,86);x.font='650 10px Inter,Arial,sans-serif';x.letterSpacing='3px';x.fillStyle='#92caff';x.fillText('A NEW MODEL GENERATION',96,111);x.restore();
 const enter=smooth(local/.65);x.save();x.globalAlpha=out;x.translate(0,(1-enter)*34);text(b.line,760,47,enter,760);text(b.sub,824,18,enter*.83,580);x.restore();
 // Build a bright, traveling signal line that grows into the horizon at the reveal.
 const lineY=H*.63;x.save();const grad=x.createLinearGradient(170,lineY,1750,lineY);grad.addColorStop(0,'rgba(83,162,255,0)');grad.addColorStop(.5,'rgba(166,235,255,.95)');grad.addColorStop(1,'rgba(91,145,255,0)');x.strokeStyle=grad;x.lineWidth=2;x.shadowColor='#72bfff';x.shadowBlur=18;x.beginPath();x.moveTo(150,lineY+Math.sin(t*1.7)*9);x.bezierCurveTo(580,lineY-40,1120,lineY+45,1770,lineY);x.stroke();x.restore();
 const fg=x.createLinearGradient(100,0,1820,0);fg.addColorStop(0,'#4ea4ff');fg.addColorStop(.53,'#b4efff');fg.addColorStop(1,'#697fff');x.fillStyle='rgba(222,239,255,.22)';x.fillRect(150,H-64,1620,2);x.fillStyle=fg;x.fillRect(150,H-64,1620*clamp(t/88),2);
 x.save();x.font='600 11px Inter,Arial,sans-serif';x.letterSpacing='2px';x.fillStyle='rgba(221,235,255,.58)';x.textAlign='left';x.fillText('SONDERR  /  THE FIRST MODEL',151,H-37);x.textAlign='right';x.fillText('SLM GENERATION  ·  0.6B',1769,H-37);x.restore();
}
window.render=render;
window.record=()=>new Promise((resolve,reject)=>{const video=c.captureStream(30),ac=new AudioContext(),out=ac.createMediaStreamDestination(),master=ac.createGain();master.gain.value=.001;master.connect(out);[55,82.41,110,146.83,164.81,220].forEach((hz,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.type=i<2?'sine':'triangle';o.frequency.value=hz;g.gain.value=i<2?.3:.08;o.connect(g);g.connect(master);o.start()});[12,38,72].forEach((time,i)=>{const osc=ac.createOscillator(),gain=ac.createGain();osc.type='sine';osc.frequency.setValueAtTime(220,ac.currentTime+time);osc.frequency.exponentialRampToValueAtTime(880,ac.currentTime+time+1.3);gain.gain.setValueAtTime(0,ac.currentTime+time);gain.gain.linearRampToValueAtTime(.09,ac.currentTime+time+.15);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+time+2.1);osc.connect(gain);gain.connect(master);osc.start(ac.currentTime+time);osc.stop(ac.currentTime+time+2.2)});const stream=new MediaStream([...video.getVideoTracks(),...out.stream.getAudioTracks()]);const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')?'video/webm;codecs=vp9,opus':'video/webm';const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:12000000,audioBitsPerSecond:192000});rec.ondataavailable=async e=>{if(e.data.size){const a=new Uint8Array(await e.data.arrayBuffer());let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));await window.saveChunk(btoa(s))}};rec.onerror=e=>reject(e.error||new Error('recorder failed'));rec.onstop=()=>resolve(true);const start=performance.now();function frame(now){const t=(now-start)/1000;render(Math.min(88,t));if(t>=88){rec.stop();stream.getTracks().forEach(v=>v.stop());return}requestAnimationFrame(frame)}rec.start(1000);requestAnimationFrame(frame)});
</script>`;

(async () => {
  fs.writeFileSync(output, Buffer.alloc(0));
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto('file://' + path.join(root, 'web/assets/sonderr-v1-storyboard.png').replace('sonderr-v1-storyboard.png','')); await page.setContent(html);
    await page.evaluate(async () => Promise.all([document.querySelector('#story').decode(), document.querySelector('#logo').decode()]));
    await page.exposeFunction('saveChunk', async base64 => fs.appendFileSync(output, Buffer.from(base64, 'base64')));
    await page.evaluate(() => render(84));
    await page.locator('#f').screenshot({ path: poster });
    console.log('Recording an 88-second trailer: moving artwork, animated camera, kinetic title cards and original generated score…');
    await page.evaluate(() => window.record());
    console.log(`Saved ${output} (${(fs.statSync(output).size / 1e6).toFixed(1)} MB)`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
