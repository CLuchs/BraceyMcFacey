// Developer tool: checks automatic band detection on a folder of braces photos.
// Usage: put photos in test-photos/ (git-ignored; do not commit photos of people),
// run `npm start` in one terminal, then `node scripts/eval-bands.js test-photos eval-out`.
// Each photo produces eval-out/<name>.png: original | detected bands (magenta) | recolored to gold.
// Needs Playwright (`npm install --no-save playwright`).
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const [,,dir,out,target='#eabf00']=process.argv;
const files=fs.readdirSync(dir).filter(f=>/\.(jpe?g|png)$/i.test(f)).sort();
(async()=>{const b=await chromium.launch();const p=await b.newPage();
fs.mkdirSync(out,{recursive:true});await p.goto('http://localhost:'+(process.env.PORT||8080)+'/');await p.waitForTimeout(300);
const results=[];
for(const f of files){
 const data='data:image/jpeg;base64,'+fs.readFileSync(path.join(dir,f)).toString('base64');
 const r=await p.evaluate(async([data,target])=>{
  const B=await import('/js/braces.js'),G=await import('/js/geometry.js'),F=await import('/js/face.js');
  const img=new Image();img.src=data;await img.decode();
  const k=Math.min(1,1280/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);
  const lm=await F.findLandmarks(c);
  if(!lm)return{face:false};
  const g=G.geometryFromLandmarks(lm,c.width,c.height);
  const d=ctx.getImageData(0,0,c.width,c.height);const reg=B.buildRegion(d.data,c.width,c.height,g);const st=B.regionStats(reg);
  const cands=B.autoDetectRefs(reg,st);const found=B.detectBands(reg,st,1);
  // panels: crop around mouth
  const pad=g.width*0.35;const x0=Math.max(0,g.center[0]-g.width/2-pad),y0=Math.max(0,g.center[1]-g.width*0.45),w=Math.min(c.width-x0,g.width+2*pad),h=Math.min(c.height-y0,g.width*0.9);
  const PW=360,PH=Math.round(PW*h/w);const sheet=document.createElement('canvas');sheet.width=PW*3;sheet.height=PH;const sx=sheet.getContext('2d');
  sx.drawImage(c,x0,y0,w,h,0,0,PW,PH);
  // mask panel: dim + outline polygon + detected in magenta
  const m=new ImageData(new Uint8ClampedArray(d.data),c.width,c.height);
  for(let j=0;j<reg.h;j++)for(let i=0;i<reg.w;i++){const idx=j*reg.w+i,q=((reg.y0+j)*c.width+reg.x0+i)*4;
   if(found&&found.mask[idx]){m.data[q]=255;m.data[q+1]=0;m.data[q+2]=255}else if(!reg.inside[idx]){m.data[q]*=.5;m.data[q+1]*=.5;m.data[q+2]*=.5}}
  const mc=document.createElement('canvas');mc.width=c.width;mc.height=c.height;mc.getContext('2d').putImageData(m,0,0);
  sx.drawImage(mc,x0,y0,w,h,PW,0,PW,PH);
  const o=new ImageData(new Uint8ClampedArray(d.data),c.width,c.height);
  if(found){const a=B.composeAlpha(reg,found.mask,[]);B.recolor(o.data,c.width,reg,a,B.hexToLab(target))}
  const oc=document.createElement('canvas');oc.width=c.width;oc.height=c.height;oc.getContext('2d').putImageData(o,0,0);
  sx.drawImage(oc,x0,y0,w,h,PW*2,0,PW,PH);
  const r1=v=>Math.round(v);
  return{face:true,W:c.width,mouthW:r1(g.width),open:+g.openness.toFixed(2),lip:st.lip&&[st.lip.L,st.lip.a,st.lip.b].map(r1),teeth:[st.teeth.L,st.teeth.a,st.teeth.b].map(r1),
   cands:cands.map(q=>[q.L,q.a,q.b].map(r1)),refs:found?found.refs.map(q=>[q.L,q.a,q.b].map(r1)):null,count:found?found.count:0,png:sheet.toDataURL('image/png')}
 },[data,target]);
 if(r.png){fs.writeFileSync(path.join(out,f.replace(/\.\w+$/,'.png')),Buffer.from(r.png.split(',')[1],'base64'));delete r.png}
 results.push({f,...r});console.log(f,JSON.stringify(r));
}
await b.close()})();
