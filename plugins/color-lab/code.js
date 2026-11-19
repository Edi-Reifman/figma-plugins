/* Color Lab — dependency-free sRGB adjustment engine. Shared by preview and Figma. */
var ColorLab = (() => {
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const defaults = () => ({
    brightness:{on:true,brightness:0,contrast:0},
    levels:{on:true,channel:'rgb',rgb:[0,1,255,0,255],r:[0,1,255,0,255],g:[0,1,255,0,255],b:[0,1,255,0,255]},
    curves:{on:true,channel:'rgb',rgb:[[0,0],[255,255]],r:[[0,0],[255,255]],g:[[0,0],[255,255]],b:[[0,0],[255,255]]},
    exposure:{on:true,exposure:0,offset:0,gamma:1},
    vibrance:{on:true,vibrance:0,saturation:0},
    hue:{on:true,range:'master',hue:0,saturation:0,lightness:0,colorize:false},
    balance:{on:true,range:'midtones',shadows:[0,0,0],midtones:[0,0,0],highlights:[0,0,0],preserve:true},
    bw:{on:false,reds:40,yellows:60,greens:40,cyans:60,blues:20,magentas:80,tint:false,color:'#d4a36a'},
    filter:{on:false,preset:'warming',color:'#ec8a32',density:25,preserve:true}
  });
  const lum = c => .2126*c[0]+.7152*c[1]+.0722*c[2];
  function hsl(c) {
    const [r,g,b]=c, hi=Math.max(r,g,b), lo=Math.min(r,g,b), d=hi-lo, l=(hi+lo)/2;
    let h=0,s=0;
    if(d) {s=d/(1-Math.abs(2*l-1));h=hi===r?((g-b)/d)%6:hi===g?(b-r)/d+2:(r-g)/d+4;h=((h*60)%360+360)%360;}
    return [h,s,l];
  }
  function rgb([h,s,l]) {
    h=((h%360)+360)%360; s=clamp(s);l=clamp(l);
    const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
    const v=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
    return v.map(t=>t+m);
  }
  const hex = s => [1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255);
  function restoreLum(c, target) {
    const delta=target-lum(c); return c.map(v=>clamp(v+delta));
  }
  function curveLut(points) {
    const p=points.map(v=>[clamp(v[0],0,255),clamp(v[1],0,255)]).sort((a,b)=>a[0]-b[0]).filter((v,i,a)=>!i||v[0]>a[i-1][0]);
    if(p.length<2) return Array.from({length:256},(_,i)=>i/255);
    const d=p.slice(1).map((v,i)=>(v[1]-p[i][1])/(v[0]-p[i][0]));
    const m=p.map((v,i)=>i===0?d[0]:i===p.length-1?d[d.length-1]:d[i-1]*d[i]<=0?0:2/(1/d[i-1]+1/d[i]));
    return Array.from({length:256},(_,x)=>{
      if(x<=p[0][0])return p[0][1]/255;
      if(x>=p[p.length-1][0])return p[p.length-1][1]/255;
      let i=0;while(p[i+1][0]<x)i++;
      const w=p[i+1][0]-p[i][0],t=(x-p[i][0])/w,t2=t*t,t3=t2*t;
      return clamp(((2*t3-3*t2+1)*p[i][1]+(t3-2*t2+t)*w*m[i]+(-2*t3+3*t2)*p[i+1][1]+(t3-t2)*w*m[i+1])/255);
    });
  }
  const lookup=(lut,v)=>{const x=clamp(v)*255,a=Math.floor(x),b=Math.min(255,a+1);return lut[a]+(lut[b]-lut[a])*(x-a);};
  const level=(v,p)=>{const lo=clamp(p[0],0,254),hi=clamp(p[2],lo+1,255),g=clamp(p[1],.1,10);return (p[3]+Math.pow(clamp((v*255-lo)/(hi-lo)),1/g)*(p[4]-p[3]))/255;};
  function isNeutral(s) {
    const d=defaults();
    const ignored={levels:["channel"],curves:["channel"],hue:["range"],balance:["range","preserve"]};
    return Object.keys(d).every(k=>{
      if(!s[k].on)return true;
      if(k==="filter"&&s[k].density===0)return true;
      const a=JSON.parse(JSON.stringify(s[k])),b=JSON.parse(JSON.stringify(d[k]));
      for(const key of ["on",...(ignored[k]||[])]){delete a[key];delete b[key];}
      if(k==="bw"||k==="filter")return false;
      return JSON.stringify(a)===JSON.stringify(b);
    });
  }
  function compile(s) {
    const cs=['r','g','b'];
    const lut=cs.map(k=>Array.from({length:256},(_,i)=>{
      let v=i/255;
      if(s.brightness.on){v+=s.brightness.brightness/100;const f=Math.pow(2,s.brightness.contrast/50);v=(v-.5)*f+.5;v=clamp(v);}
      if(s.levels.on){v=level(v,s.levels.rgb);v=level(v,s.levels[k]);}
      return clamp(v);
    }));
    const curves=s.curves.on?['rgb','r','g','b'].map(k=>curveLut(s.curves[k])):null;
    const balanceActive=s.balance.on&&['shadows','midtones','highlights'].some(k=>s.balance[k].some(v=>v!==0));
    const filterColor=hex(s.filter.color),tintColor=hex(s.bw.color);
    const centers={reds:0,yellows:60,greens:120,cyans:180,blues:240,magentas:300};
    return function(c) {
      c=c.map((v,i)=>lookup(lut[i],v));
      if(curves)c=c.map((v,i)=>lookup(curves[i+1],lookup(curves[0],v)));
      if(s.exposure.on&&(s.exposure.exposure||s.exposure.offset||s.exposure.gamma!==1)){
        c=c.map(v=>{let l=v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);l=clamp(l*Math.pow(2,s.exposure.exposure)+s.exposure.offset);v=l<=.0031308?12.92*l:1.055*Math.pow(l,1/2.4)-.055;return Math.pow(clamp(v),1/Math.max(.1,s.exposure.gamma));});
      }
      if(s.vibrance.on&&(s.vibrance.vibrance||s.vibrance.saturation)){
        let h=hsl(c);h[1]=clamp(h[1]*(1+s.vibrance.saturation/100+s.vibrance.vibrance/100*(1-h[1])));c=rgb(h);
      }
      if(s.hue.on&&(s.hue.hue||s.hue.saturation||s.hue.lightness||s.hue.colorize)){
        let h=hsl(c),weight=1;
        if(s.hue.range!=='master'){const dist=Math.abs(((h[0]-centers[s.hue.range]+540)%360)-180);weight=clamp((60-dist)/30);}
        if(s.hue.colorize){h[0]=s.hue.hue;h[1]=clamp((s.hue.saturation+100)/200);}
        else{h[0]+=s.hue.hue*weight;h[1]=clamp(h[1]*(1+s.hue.saturation/100*weight));}
        h[2]=clamp(h[2]+s.hue.lightness/100*weight);c=rgb(h);
      }
      if(balanceActive){
        const l=lum(c),sh=Math.pow(1-l,2),hi=l*l,mid=2*l*(1-l),before=l;
        c=c.map((v,i)=>clamp(v+(s.balance.shadows[i]*sh+s.balance.midtones[i]*mid+s.balance.highlights[i]*hi)/100));
        if(s.balance.preserve)c=restoreLum(c,before);
      }
      if(s.bw.on){
        const h=hsl(c),a=Math.floor(h[0]/60)%6,t=h[0]/60-a,keys=Object.keys(centers);
        const mix=(s.bw[keys[a]]*(1-t)+s.bw[keys[(a+1)%6]]*t)/100;
        const lo=Math.min(...c),hi=Math.max(...c);const gray=clamp(lo+(hi-lo)*mix);c=[gray,gray,gray];
        if(s.bw.tint)c=restoreLum(tintColor,gray);
      }
      if(s.filter.on&&s.filter.density){const l=lum(c),a=s.filter.density/100;c=c.map((v,i)=>v*(1-a)+filterColor[i]*a);if(s.filter.preserve)c=restoreLum(c,l);}
      return c.map(v=>clamp(v));
    };
  }
  function pixels(data, transform, start=0, end=data.length) {
    for(let i=start;i<end;i+=4){if(!data[i+3])continue;const c=transform([data[i]/255,data[i+1]/255,data[i+2]/255]);data[i]=Math.round(c[0]*255);data[i+1]=Math.round(c[1]*255);data[i+2]=Math.round(c[2]*255);}
    return data;
  }
  return {defaults,isNeutral,compile,pixels,curveLut,hsl,rgb};
})();
if(typeof module!=='undefined')module.exports=ColorLab;

figma.showUI(__html__, {width:780,height:780,themeColors:true});
let busy=false, revision=0, seq=0, cancelled=false;
const errors=[];
function checkCancel(){if(cancelled)throw new Error("Обработка отменена. Копии удалены, исходники сохранены.");}
const pending=new Map();
const send=m=>figma.ui.postMessage(m);
function requestImage(bytes,settings) {
  const id=++seq;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Обработка изображения заняла слишком много времени.'));},120000);
    pending.set(id,{resolve,reject,timer});send({type:'process-image',id,bytes,settings});
  });
}
function roots() {
  const selected=figma.currentPage.selection;
  return selected.filter(n=>!selected.some(p=>{let a=n.parent;while(a){if(a===p)return true;a=a.parent;}return false;}));
}
async function refresh() {
  if(busy)return;
  const version=++revision, selected=roots();
  send({type:'selection',count:selected.length,name:selected[0]?.name||''});
  if(!selected.length)return;
  try {
    const n=selected[0],b=n.absoluteRenderBounds||n.absoluteBoundingBox;
    const bytes=await n.exportAsync({format:'PNG',constraint:{type:'SCALE',value:Math.min(1,1000/Math.max(b?.width||n.width,b?.height||n.height,1))}});
    if(version===revision)send({type:'preview',bytes});
  } catch(e){if(version===revision)send({type:'preview-error',message:'Предпросмотр недоступен для этого выделения.'});}
}
const copy=v=>JSON.parse(JSON.stringify(v));
function unbindColor(v){if(v.boundVariables){v.boundVariables=copy(v.boundVariables);delete v.boundVariables.color;}return v;}
async function apply(settings,mode) {
  if(busy)return;
  const source=roots();if(!source.length){send({type:'error',message:'Выделите слои или фрейм в Figma.'});return;}
  busy=true;cancelled=false;errors.length=0;++revision;const made=[];let skipped=0,changes=0,visited=0;
  try {
    const transform=ColorLab.compile(settings), cache=new Map(),neutral=ColorLab.isNeutral(settings);
    function skippedProperty(e,n,key){checkCancel();skipped++;if(errors.length<8)errors.push({node:n.name,property:key});}
    const bounds=source.map(n=>n.absoluteRenderBounds||n.absoluteBoundingBox).filter(Boolean);
    const dx=bounds.length?Math.max(...bounds.map(b=>b.x+b.width))-Math.min(...bounds.map(b=>b.x))+64:64;
    async function imageHash(hash) {
      checkCancel();if(neutral)return hash;
      if(!cache.has(hash))cache.set(hash,(async()=>{
        const img=figma.getImageByHash(hash);if(!img)throw new Error('Исходное изображение недоступно.');
        const result=await requestImage(await img.getBytesAsync(),settings);
        return figma.createImage(new Uint8Array(result.bytes)).hash;
      })());
      return cache.get(hash);
    }
    function color(c) {if(neutral)return c;const v=transform([c.r,c.g,c.b]);return Object.assign({},c,{r:v[0],g:v[1],b:v[2]});}
    async function paints(list) {
      checkCancel();if(neutral)return list;
      const out=copy(list);
      for(const p of out){
        if(p.type==='SOLID'){p.color=color(p.color);unbindColor(p);}
        else if(p.gradientStops){p.gradientStops=p.gradientStops.map(s=>unbindColor(Object.assign({},s,{color:color(s.color)})));}
        else if(p.type==='IMAGE'&&p.imageHash){p.imageHash=await imageHash(p.imageHash);}
      }return out;
    }
    async function visit(n) {
      if(++visited%40===0)await new Promise(resolve=>setTimeout(resolve,0));
      checkCancel();
      if(neutral)return;
      const regionSnapshot=n.type==='VECTOR'&&n.vectorNetwork?.regions?.some(r=>Array.isArray(r.fills)&&r.fills.length)?copy(n.vectorNetwork):null;
      for(const key of ['fills','strokes']) {
        if(!(key in n))continue;
        if(Array.isArray(n[key])&&n[key].length){try{n[key]=await paints(n[key]);changes++;}catch(e){skippedProperty(e,n,key);}}
        else if(key==='fills'&&n.type==='TEXT'&&n.fills===figma.mixed){
          try{
            const segments=n.getStyledTextSegments(['fills']);
            for(const font of n.getRangeAllFontNames(0,n.characters.length))await figma.loadFontAsync(font);
            for(const s of segments)if(Array.isArray(s.fills))n.setRangeFills(s.start,s.end,await paints(s.fills));
            changes++;
          }catch(e){skippedProperty(e,n,key);}
        }
      }
      if('effects'in n&&n.effects.length){try{n.effects=n.effects.map(e=>{
        if(!e.color)return e;
        const next=Object.assign({},e,{color:color(e.color)});
        if(next.boundVariables){next.boundVariables=copy(next.boundVariables);delete next.boundVariables.color;}
        return next;
      });changes++;}catch(e){skippedProperty(e,n,"effects");}}
      if('backgrounds'in n&&Array.isArray(n.backgrounds)&&n.backgrounds.length&&!('fills'in n)){try{n.backgrounds=await paints(n.backgrounds);changes++;}catch(e){skippedProperty(e,n,"backgrounds");}}
      // VECTOR regions can carry distinct fills independent of the node's fills.
      if(regionSnapshot){
        try{const network=regionSnapshot;for(const r of network.regions)if(Array.isArray(r.fills))r.fills=await paints(r.fills);await n.setVectorNetworkAsync(network);changes++;}catch(e){skippedProperty(e,n,"vector regions");}
      }
      if('children'in n)for(const child of [...n.children])await visit(child);
    }
    if(mode==='layers') {
      // Move all clones to the page before awaiting image work; no changes to original layouts.
      for(const n of source){const t=copy(n.absoluteTransform),cl=n.clone();made.push(cl);figma.currentPage.appendChild(cl);t[0][2]+=dx;cl.relativeTransform=t;cl.name=n.name+' · Color Lab';}
      for(let i=0;i<made.length;i++){send({type:'progress',message:`Слои: ${i+1} / ${made.length}`});await visit(made[i]);}
    }else{
      for(let i=0;i<source.length;i++){
        checkCancel();
        const n=source[i],b=n.absoluteRenderBounds||n.absoluteBoundingBox;
        if(!b||!b.width||!b.height)throw new Error('У слоя нет видимой области.');
        send({type:'progress',message:`Изображение: ${i+1} / ${source.length}`});
        const scale=Math.min(2,4096/Math.max(b.width,b.height));
        const bytes=await n.exportAsync({format:'PNG',constraint:{type:'SCALE',value:scale}});
        const result=await requestImage(bytes,settings),hash=figma.createImage(new Uint8Array(result.bytes)).hash;
        checkCancel();
        const rect=figma.createRectangle();made.push(rect);rect.name=n.name+' · Color Lab (image)';rect.resize(b.width,b.height);rect.x=b.x+dx;rect.y=b.y;rect.fills=[{type:'IMAGE',imageHash:hash,scaleMode:'FILL'}];changes++;
      }
    }
    checkCancel();
    figma.currentPage.selection=made;figma.viewport.scrollAndZoomIntoView(made);figma.commitUndo();
    const message=`Готово: ${made.length} ${made.length===1?'копия':'копии'}.`+(skipped?` Пропущено свойств: ${skipped}.`:'');
    figma.notify(message,{error:skipped>0,timeout:5000});send({type:'done',message,skipped,changes,details:errors});
  }catch(e){for(const n of made)if(!n.removed)n.remove();send({type:'error',message:cancelled?'Обработка отменена. Копии удалены, исходники сохранены.':'Не удалось создать результат. Исходники сохранены. Попробуйте другой режим или меньшее выделение.'});}
  finally{busy=false;refresh();}
}
figma.ui.onmessage=m=>{
  if(m.type==='image-result'||m.type==='image-error'){
    const job=pending.get(m.id);if(job){clearTimeout(job.timer);pending.delete(m.id);m.type==='image-error'?job.reject(new Error(m.message)):job.resolve(m);}return;
  }
  if(m.type==='cancel'&&busy){cancelled=true;for(const [id,job]of pending){clearTimeout(job.timer);job.reject(new Error('cancelled'));pending.delete(id);}}
  if(m.type==='apply')apply(m.settings,m.mode);
  if(m.type==='demo')createDemo(m.bytes);
  if(m.type==='refresh')refresh();
  if(m.type==='close'&&!busy)figma.closePlugin();
};
figma.on('selectionchange',refresh);
refresh();

async function createDemo(bytes){
  if(busy)return;busy=true;cancelled=false;const made=[];
  try{
    await figma.loadFontAsync({family:'Inter',style:'Regular'});checkCancel();
    const frame=figma.createFrame();made.push(frame);frame.name='Color Lab · Playground';frame.resize(840,560);
    const siblings=figma.currentPage.children.filter(n=>n!==frame&&n.absoluteBoundingBox);frame.x=siblings.length?Math.max(...siblings.map(n=>n.absoluteBoundingBox.x+n.absoluteBoundingBox.width))+100:100;frame.y=100;
    frame.fills=[{type:'SOLID',color:{r:.08,g:.09,b:.1}}];frame.cornerRadius=24;
    function text(value,x,y,size,color){const n=figma.createText();n.fontName={family:'Inter',style:'Regular'};n.characters=value;n.fontSize=size;n.fills=[{type:'SOLID',color}];frame.appendChild(n);n.x=x;n.y=y;return n;}
    text('COLOR LAB / PLAYGROUND',32,28,14,{r:.72,g:.94,b:.42});
    text('One scene. Many possibilities.',32,62,32,{r:.96,g:.96,b:.93});
    const photo=figma.createRectangle();frame.appendChild(photo);photo.name='Image fill · Color study';photo.resize(776,290);photo.x=32;photo.y=120;photo.cornerRadius=12;photo.fills=[{type:'IMAGE',imageHash:figma.createImage(new Uint8Array(bytes)).hash,scaleMode:'FILL'}];
    const colors=['#e2a750','#df7564','#bd8dbf','#69a6ba','#83a875','#e8dfc0'];
    colors.forEach((hex,i)=>{const n=figma.createEllipse();frame.appendChild(n);n.name='Vector swatch '+(i+1);n.resize(36,36);n.x=32+i*52;n.y=440;n.fills=[{type:'SOLID',color:{r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255}}];});
    const gradient=figma.createRectangle();frame.appendChild(gradient);gradient.name='Editable gradient';gradient.resize(400,36);gradient.x=408;gradient.y=440;gradient.cornerRadius=18;gradient.fills=[{type:'GRADIENT_LINEAR',gradientTransform:[[1,0,0],[0,1,0]],gradientStops:[{position:0,color:{r:1,g:.45,b:.22,a:1}},{position:1,color:{r:.18,g:.7,b:.8,a:1}}]}];
    text('Image fills + editable vectors + text + gradients',32,508,14,{r:.6,g:.63,b:.65});
    checkCancel();figma.currentPage.selection=[frame];figma.viewport.scrollAndZoomIntoView([frame]);figma.commitUndo();send({type:'demo-ready'});
  }catch(e){for(const n of made)if(!n.removed)n.remove();send({type:'error',message:'Не удалось создать демо. Выделите собственный фрейм.'});}
  finally{busy=false;refresh();}
}
