/* Smart Resize: pure geometry and validation. No Figma or DOM dependency. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmartResize = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const ROLES = ['Logo','Headline','Description','CTA','Main Visual','Background'];
  function sizes(input) {
    const lines = typeof input === 'string' ? input.trim().replace(/\.$/, '').split(/[\n;]+/).flatMap(line=>/^\s*\d+\s*,\s*\d+\s*$/.test(line)?[line]:line.split(',')).filter(s=>s.trim()) : input;
    if (!Array.isArray(lines) || !lines.length || lines.length > 50) throw Error('Введите от 1 до 50 размеров.');
    const result = [], seen = new Set();
    for (const line of lines) {
      let w,h;
      if (typeof line === 'string') {
        const m = line.trim().match(/^(\d+)\s*[xх×*,]\s*(\d+)$/i);
        if (!m) throw Error('Неверный размер: '+line+'. Пример: 1080x1920');
        w=Number(m[1]); h=Number(m[2]);
      } else { w=line && line.width; h=line && line.height; }
      if (!Number.isInteger(w)||!Number.isInteger(h)||w<16||h<16||w>10000||h>10000) throw Error('Стороны: целые числа от 16 до 10000 px.');
      const key=w+'x'+h;
      if (!seen.has(key)) { result.push({width:w,height:h}); seen.add(key); }
    }
    return result;
  }
  function presets(value) {
    if (!Array.isArray(value) || value.length>40) throw Error('Допустимо до 40 наборов.');
    const names=new Set();
    return value.map(p=>{
      const name=typeof p.name==='string'?p.name.trim():'';
      if(!name||name.length>60||names.has(name)) throw Error('Имена наборов должны быть уникальными, от 1 до 60 символов.');
      names.add(name); return {name,sizes:sizes(p.sizes)};
    });
  }
  function infer(items, sw, sh) {
    const result = {}, texts=items.filter(n=>n.visible!==false&&(n.type==='TEXT'||n.textCount>0)&&!n.hasImage).sort((a,b)=>(b.textSize||b.fontSize||b.height)-(a.textSize||a.fontSize||a.height));
    for(const n of items) {
      const name=n.name.toLowerCase(); let r='';
      if (/(background|backdrop|фон|^bg\b)/i.test(name)) r='Background';
      else if (/(logo|логотип|бренд)/i.test(name)) r='Logo';
      else if (/(headline|heading|title|заголов)/i.test(name)) r='Headline';
      else if (/(description|subtitle|описан|подзаголов|дисклеймер|legal)/i.test(name)) r='Description';
      else if (/(^cta\b|button|кнопк|призыв)/i.test(name)) r='CTA';
      else if (/(visual|hero|product|продукт|товар|объект)/i.test(name)) r='Main Visual';
      else if(n.type==='ELLIPSE'&&(n.x<0||n.y<0)&&n.width>sw*.4&&n.height>sh*.8) r='Background';
      else if(n.type!=='TEXT'&&n.width>=sw*.94&&n.height>=sh*.94&&n.x<=sw*.04&&n.y<=sh*.04) r='Background';
      if(!r&&n.textCount>0&&n.width<sw*.4&&n.height<sh*.25&&/(подробнее|купить|заказать|узнать|learn more|shop|buy|order)/i.test(n.textContent||''))r='CTA';
      result[n.id]=r;
    }
    if(!Object.values(result).includes('Headline')) {
      const n=texts.find(n=>!result[n.id]); if(n) result[n.id]='Headline';
    }
    for(const n of texts) if(!result[n.id]) result[n.id]='Description';
    if(!Object.values(result).includes('Main Visual')) {
      const n=items.filter(n=>n.visible!==false&&!result[n.id]&&n.type!=='TEXT').sort((a,b)=>b.width*b.height-a.width*a.height)[0];
      if(n) result[n.id]='Main Visual';
    }
    return result;
  }
  // Candidate-based composition: measure present blocks, solve scale, score feasible layouts.
  function classify(items,sw,sh,mode){
    const inferred=infer(items,sw,sh), roles={}, uncertain=[];
    for(const n of items){
      roles[n.id]=mode==='manual'?(ROLES.includes(n.role)?n.role:''):inferred[n.id];
      const explicit=/(background|backdrop|фон|^bg\b|logo|логотип|бренд|headline|heading|title|заголов|description|subtitle|описан|cta|button|кнопк|visual|hero|product|продукт|товар)/i.test(n.name);
      if(n.visible!==false&&mode==='auto'&&!explicit&&(!roles[n.id]||((n.textCount||0)>0&&n.hasImage)))uncertain.push(n.name);
    }
    return {roles,uncertain};
  }
  function compose(items,sw,sh,w,h,mode,options){
    options=options||{};
    const {roles,uncertain}=classify(items,sw,sh,mode);
    const minFont=Number.isFinite(options.minFont)?Math.max(6,Math.min(40,options.minFont)):10;
    const omitted=[],active=[];
    for(const n of items){
      if(n.visible===false||roles[n.id]==='Background')continue;
      if(options.compact&&n.priority==='optional'){omitted.push(n.id);continue;}
      active.push(n);
    }
    const order={Logo:0,Headline:1,Description:2,'Main Visual':3,CTA:4};
    active.sort((a,b)=>(order[roles[a.id]]===undefined?3:order[roles[a.id]])-(order[roles[b.id]]===undefined?3:order[roles[b.id]])||a.y-b.y||a.x-b.x);
    const margin=Math.min(w,h)*.05,gap=Math.min(w,h)*.025;
    const box={x:margin,y:margin,width:w-2*margin,height:h-2*margin};
    const widthAt=(n,k)=>Math.max(.001,n.width*k);
    function isFlow(n){return n.type==='TEXT'&&(roles[n.id]==='Headline'||roles[n.id]==='Description');}
    function heightAt(n,k,width){
      const fs=n.fontSize||n.textSize||0;
      if(isFlow(n)&&fs){
        const count=(n.textContent||'').trim().length;
        const lines=count?Math.max(1,Math.ceil(count*fs*k*.56/width)):Math.max(1,Math.ceil(n.height*k/(fs*k*1.25)));
        return Math.max(n.height*k,lines*fs*k*1.25);
      }
      return Math.max(.001,n.height*k);
    }
    function stack(ns,b){
      if(!ns.length)return {entries:{},scale:Infinity};
      const localGap=Math.min(gap,b.height/(2*Math.max(1,ns.length-1)));
      let lo=0,hi=Math.min(...ns.map(n=>b.width/Math.max(n.width,.001)))*2;
      function heights(k){return ns.map(n=>heightAt(n,k,b.width));}
      function valid(k){return ns.every(n=>isFlow(n)||widthAt(n,k)<=b.width+.001)&&heights(k).reduce((a,c)=>a+c,0)+localGap*(ns.length-1)<=b.height;}
      for(let i=0;i<32;i++){const mid=(lo+hi)/2;if(valid(mid))lo=mid;else hi=mid;}
      const hs=heights(lo),total=hs.reduce((a,c)=>a+c,0)+localGap*(ns.length-1);let y=b.y+(b.height-total)/2;const entries={};
      ns.forEach((n,i)=>{const flow=isFlow(n);const width=flow?b.width:n.width*lo;
        entries[n.id]={x:b.x+(b.width-width)/2,y,width,height:hs[i],scale:lo,role:roles[n.id],cell:{x:b.x,y,width:b.width,height:hs[i]},flow};y+=hs[i]+localGap;});
      return {entries,scale:lo};
    }
    const candidates=[];
    function candidate(name,parts){
      const entries=Object.assign({},...parts.map(p=>p.entries));
      const scales=active.map(n=>entries[n.id].scale);
      const weighted=scales.map((k,i)=>k*(active[i].priority==='essential'?.8:1));
      const smallest=weighted.length?Math.min(...weighted):1;
      const mean=scales.length?scales.reduce((a,c)=>a+c,0)/scales.length:1;
      // A large visual must not win by making the offer unreadably small.
      const score=smallest*.85+Math.min(mean,smallest*1.5)*.15;
      candidates.push({name,entries,score});
    }
    candidate('Вертикальная композиция',[stack(active,box)]);
    const visuals=active.filter(n=>roles[n.id]==='Main Visual'),copy=active.filter(n=>roles[n.id]!=='Main Visual');
    if(visuals.length&&copy.length){
      for(const fraction of [.3,.4,.5,.6,.7]){
        const left={x:box.x,y:box.y,width:(box.width-gap)*fraction,height:box.height};
        const right={x:box.x+left.width+gap,y:box.y,width:box.width-left.width-gap,height:box.height};
        // Keep source-side preference where the visual is left of the text.
        const visualLeft=visuals.reduce((s,n)=>s+n.x+n.width/2,0)/visuals.length<copy.reduce((s,n)=>s+n.x+n.width/2,0)/copy.length;
        candidate(visualLeft?'Визуал слева':'Визуал справа',[stack(visualLeft?visuals:copy,left),stack(visualLeft?copy:visuals,right)]);
      }
    }
    if(active.length>1){
      let lo=0,hi=Math.max(w/sw,h/sh)*8;
      for(let i=0;i<32;i++){const k=(lo+hi)/2;const valid=active.reduce((s,n)=>s+n.width*k,0)+gap*(active.length-1)<=box.width&&active.every(n=>n.height*k<=box.height);if(valid)lo=k;else hi=k;}
      const total=active.reduce((s,n)=>s+n.width*lo,0)+gap*(active.length-1);let x=box.x+(box.width-total)/2;const entries={};
      for(const n of active){const b={x,y:box.y+(box.height-n.height*lo)/2,width:n.width*lo,height:n.height*lo};entries[n.id]=Object.assign({},b,{scale:lo,role:roles[n.id],cell:b,flow:false});x+=b.width+gap;}
      candidate('Горизонтальная полоса',[{entries}]);
    }
    const best=candidates.sort((a,b)=>b.score-a.score)[0];
    const output=best.entries,warnings=[];
    for(const n of items){
      if(roles[n.id]==='Background'){
        const k=Math.max(w/sw,h/sh);
        output[n.id]={x:(w-sw*k)/2+n.x*k,y:(h-sh*k)/2+n.y*k,width:n.width*k,height:n.height*k,scale:k,role:'Background',backgroundTransform:true};
      }else if(!output[n.id])output[n.id]={x:n.x,y:n.y,width:n.width,height:n.height,scale:1,role:roles[n.id],hidden:omitted.includes(n.id)};
    }
    let readable=true,smallestFont=Infinity;
    for(const n of active){const fs=n.minFont||n.fontSize||n.textSize||0;if(fs){const actual=fs*output[n.id].scale;smallestFont=Math.min(smallestFont,actual);if(actual<minFont){readable=false;warnings.push('«'+n.name+'»: около '+actual.toFixed(1)+' px (минимум '+minFont+').');}}}
    if(uncertain.length)warnings.push('Назначьте роли для уверенной адаптации: '+uncertain.join(', '));
    if(omitted.length)warnings.push('Сокращённая композиция: скрыто необязательных блоков — '+omitted.length+'.');
    return {plan:output,layout:best.name,readable,minFont:smallestFont===Infinity?null:smallestFont,warnings,uncertain,omitted};
  }
  function plan(items,sw,sh,w,h,mode,options){return compose(items,sw,sh,w,h,mode,options).plan;}
  function grid(ss,startX,startY,cols,gap) {
    const result=[];let y=startY;
    for(let i=0;i<ss.length;i+=cols) {
      let x=startX, rowH=0;
      for(const s of ss.slice(i,i+cols)) {result.push({x,y});x+=s.width+gap;rowH=Math.max(rowH,s.height);}
      y+=rowH+gap;
    }
    return result;
  }
  return {ROLES,sizes,presets,infer,plan,grid,compose,classify};
});

/* Figma adapter. Only explicit role assignment writes plugin metadata to the source. */
'use strict';
const SR=SmartResize;
const STORAGE='smart-resize.presets.v1', ROLE='smart-resize.role.v1';
const DEFAULTS=[{name:'Реклама',sizes:SR.sizes('300x250\n336x280\n300x600\n728x90\n970x90\n468x60')},{name:'Соцсети',sizes:SR.sizes('1080x1080\n1080x1920\n1200x628')}];
let source=null, busy=false, saved=[], storageOK=false;
figma.showUI(__html__,{width:440,height:720,themeColors:true});
function post(type,data){figma.ui.postMessage(Object.assign({type},data||{}));}
function error(e){post('error',{message:e instanceof Error?e.message:String(e)});}
function walk(n,fn){fn(n);if('children' in n) for(const c of n.children)walk(c,fn);}
function describe(n){
  let textCount=0,textSize=0,textContent='',hasImage=false,minFont=Infinity;
  walk(n,c=>{if(c.visible===false)return;if(c.type==='TEXT'){textCount++;textContent+=' '+c.characters;if(typeof c.fontSize==='number'){textSize=Math.max(textSize,c.fontSize);minFont=Math.min(minFont,c.fontSize);}else if(c.characters.length){for(const segment of c.getStyledTextSegments(['fontSize'])){textSize=Math.max(textSize,segment.fontSize);minFont=Math.min(minFont,segment.fontSize);}}}if('fills' in c&&Array.isArray(c.fills)&&c.fills.some(f=>f.type==='IMAGE'&&f.visible!==false))hasImage=true;});
  return {id:n.id,name:n.name,type:n.type,x:n.x,y:n.y,width:n.width,height:n.height,visible:n.visible,role:n.getPluginData(ROLE),fontSize:typeof n.fontSize==='number'?n.fontSize:0,textCount,textSize,textContent,hasImage,minFont:minFont===Infinity?0:minFont,priority:n.getPluginData('smart-resize.priority.v1')||'normal',constraints:'constraints' in n?n.constraints:null};
}
function onCurrentPage(n){while(n&&n.type!=='PAGE')n=n.parent;return n===figma.currentPage;}
function sourceValid(){return source&&!source.removed&&source.type==='FRAME'&&source.parent&&onCurrentPage(source);}
function selectionSource(){
  const selected=figma.currentPage.selection;
  if(selected.length!==1)return null;
  let n=selected[0];
  if(n.type==='FRAME')return n;
  if(sourceValid()&&rootLayer(n))return source;
  // For a selected leaf choose the outer composition, rather than a nested button frame.
  let frame=null;
  while(n&&n.type!=='PAGE'){if(n.type==='FRAME')frame=n;n=n.parent;}
  return frame;
}
function frameChoices(){
  const frames=[];let visited=0;
  function visit(parent,path){
    for(const n of parent.children||[]){
      if(++visited>10000||frames.length>=300)return;
      const label=path?path+' / '+n.name:n.name;
      if(n.type==='FRAME')frames.push({id:n.id,name:label,width:n.width,height:n.height});
      if('children' in n&&n.type!=='INSTANCE'&&n.type!=='COMPONENT'&&n.type!=='COMPONENT_SET')visit(n,label);
    }
  }
  visit(figma.currentPage,'');
  post('frames',{frames,selected:sourceValid()?source.id:'',truncated:visited>10000||frames.length>=300});
}
function findFrame(id){
  let result=null;
  function visit(n){if(n.id===id&&n.type==='FRAME'){result=n;return;}if('children' in n)for(const c of n.children){if(result)return;visit(c);}}
  visit(figma.currentPage);return result;
}
function sync(){
  if(!sourceValid()){source=null;post('source',{source:null,layers:[]});return;}
  const children=source.children;
  if(children.length>300){post('source',{source:{id:source.id,name:source.name,width:source.width,height:source.height},layers:[],issue:'Более 300 верхних слоёв: объедините элементы в группы.'});return;}
  const layers=children.map(describe),auto=SR.infer(layers,source.width,source.height);
  post('source',{source:{id:source.id,name:source.name,width:source.width,height:source.height},layers:layers.map(n=>Object.assign(n,{auto:auto[n.id]}))});
}
function pick(id){
  const next=id?findFrame(id):selectionSource();
  if(!next){
    const selected=figma.currentPage.selection;
    const detail=selected.length===1?' Сейчас выбран '+selected[0].type+'.':'';
    throw Error('Выберите Frame в списке плагина или выделите один Frame / слой внутри него на холсте.'+detail);
  }
  source=next;sync();frameChoices();
  post('notice',{message:'Исходник выбран: '+source.name});
}

function rootLayer(n){if(!sourceValid())return null;while(n&&n.parent!==source)n=n.parent;return n&&n.parent===source?n:null;}
async function loadFonts(root){
  const fonts=new Map();let count=0;
  walk(root,n=>{
    count++;
    if(n.type==='TEXT') {
      if(n.hasMissingFont)throw Error('Недоступен шрифт в «'+n.name+'». Установите его или замените перед генерацией.');
      const fs=n.characters.length?n.getRangeAllFontNames(0,n.characters.length):(n.fontName!==figma.mixed?[n.fontName]:[]);
      for(const f of fs)fonts.set(JSON.stringify(f),f);
    }
  });
  if(count>4000)throw Error('В макете более 4000 слоёв. Упростите исходник перед пакетной генерацией.');
  for(const f of fonts.values())await figma.loadFontAsync(f);
}
function scaleNode(n,k){if(!Number.isFinite(k)||k<=0)throw Error('Некорректный масштаб слоя «'+n.name+'».');n.rescale(k);}
function apply(n,p,warnings){
  if(p.hidden){n.visible=false;return;}
  if(n.width<.01||n.height<.01){warnings.push('Нулевой размер: '+n.name);return;}
  if(p.role==='Background') {
    if(p.backgroundTransform){
      if(p.backing){n.resizeWithoutConstraints(p.width,p.height);n.x=p.x;n.y=p.y;}
      else {scaleNode(n,p.scale);n.x=p.x;n.y=p.y;}
      return;
    }
    // Simple rectangles and frames stretch; compound art uses proportional cover.
    if(n.type==='RECTANGLE'||(n.type==='FRAME'&&n.children.length===0)) n.resizeWithoutConstraints(p.width,p.height);
    else {scaleNode(n,Math.max(p.width/n.width,p.height/n.height));}
    n.x=p.x+(p.width-n.width)/2;n.y=p.y+(p.height-n.height)/2;return;
  }
  const isFlowText=p.flow&&n.type==='TEXT'&&(p.role==='Headline'||p.role==='Description')&&n.characters.length;
  const k=p.scale;
  scaleNode(n,k);
  if(isFlowText) {
    const b=p.cell;
    n.textAutoResize='HEIGHT';
    n.resize(Math.max(.01,b.width),Math.max(.01,n.height));
    // Figma measures styled text after reflow; shrink until its measured height fits.
    for(let i=0;i<8&&n.height>b.height+.1;i++) {
      scaleNode(n,Math.min(.95,b.height/n.height));
      n.resize(Math.max(.01,b.width),Math.max(.01,n.height));
    }
    n.x=b.x; n.y=b.y+Math.max(0,(b.height-n.height)/2);
    if(n.height>b.height+1)warnings.push('Текст выходит из области: '+n.name);
  } else {n.x=p.x;n.y=p.y;}
  walk(n,t=>{if(t.type==='TEXT'&&t.characters.length){const fs=t.getRangeFontSize(0,t.characters.length);if(typeof fs==='number'&&fs<9)warnings.push('Мелкий текст (<9 px): '+t.name);}});
}
async function generate(msg){
  if(!sourceValid())throw Error('Сначала выберите исходный Frame.');
  const ss=SR.sizes(msg.sizes), mode=msg.mode;
  if(!['auto','manual'].includes(mode))throw Error('Неизвестный режим.');
  const cols=Number(msg.columns), gap=Number(msg.gap);
  if(!Number.isInteger(cols)||cols<1||cols>10||!Number.isFinite(gap)||gap<0||gap>2000)throw Error('Колонки: 1–10; интервал: 0–2000 px.');
  const original=source,page=figma.currentPage;
  let sourcePage=original;while(sourcePage&&sourcePage.type!=='PAGE')sourcePage=sourcePage.parent;
  if(sourcePage!==page)throw Error('Вернитесь на страницу исходного Frame.');
  if('layoutMode' in original.parent && original.parent.layoutMode!=='NONE')throw Error('Исходник находится внутри Auto Layout. Используйте самостоятельный Frame на странице: клонирование внутри Auto Layout может сдвинуть оригинал.');
  if(original.children.length>300)throw Error('Слишком много верхних слоёв: максимум 300.');
  if(original.children.some(n=>n.isMask))throw Error('Объедините маску и маскируемые слои в одну группу внутри исходного Frame.');
  await loadFonts(original);
  if(original.removed)throw Error('Исходный Frame был удалён.');
  const descriptors=original.children.map(describe);
  if(mode==='manual'&&!descriptors.some(n=>SR.ROLES.includes(n.role)))throw Error('Назначьте хотя бы одну роль или включите автоматический режим.');
  const warnings=[];
  const settings={compact:msg.compact===true,minFont:msg.minFont===undefined?10:Number(msg.minFont)};
  if(!Number.isFinite(settings.minFont)||settings.minFont<6||settings.minFont>40)throw Error('Минимальный кегль: 6–40 px.');
  const analyses=ss.map(s=>SR.compose(descriptors,original.width,original.height,s.width,s.height,mode,settings));
  const report=analyses.map((a,i)=>ss[i].width+'×'+ss[i].height+' · '+a.layout+' · '+(a.minFont===null?'без текста':a.minFont.toFixed(1)+' px')+(a.readable?'':' · тесно')+(a.warnings.length?'\n'+a.warnings.join('\n'):''));
  if(msg.type==='analyze'){post('analysis',{message:report.join('\n\n')});return;}
  if(!msg.allowSmall&&analyses.some(a=>!a.readable))throw Error('Некоторые форматы не вмещают текст читаемо. Нажмите «Проверить размеры», измените состав необязательных блоков или явно разрешите мелкий текст.');
  for(const a of analyses)warnings.push(...a.warnings);

  if(mode==='manual'&&descriptors.some(n=>n.visible&&!n.role))warnings.push('Слои без ролей включены в общую раскладку. Назначьте роли, чтобы уточнить их назначение.');
  if(descriptors.some(n=>original.children.find(c=>c.id===n.id).rotation))warnings.push('Есть повёрнутые слои: проверьте границы после адаптации.');
  let right=0;
  for(const n of page.children){const b=n.absoluteBoundingBox;if(b)right=Math.max(right,b.x+b.width);}
  const startY=original.absoluteBoundingBox?original.absoluteBoundingBox.y:0;
  const positions=SR.grid(ss,right+Math.max(gap,80),startY,cols,gap),created=[];
  try {
    for(let i=0;i<ss.length;i++){
      if(page!==figma.currentPage||original.removed)throw Error('Страница или исходник изменились. Повторите генерацию.');
      const s=ss[i],copy=original.clone();created.push(copy);page.appendChild(copy);
      copy.locked=false;copy.rotation=0;
      // Disable only the root layout on copies, retaining child groups and auto-layout components.
      copy.layoutMode='NONE';copy.resizeWithoutConstraints(s.width,s.height);copy.clipsContent=true;
      const plan=analyses[i].plan;
      const nodes=copy.children.slice();
      for(let j=0;j<nodes.length;j++)apply(nodes[j],plan[descriptors[j].id],warnings);
      if(!msg.allowSmall){
        let tooSmall='';for(const root of copy.children.filter(n=>n.visible!==false))walk(root,t=>{if(t.visible!==false&&t.type==='TEXT'&&t.characters.length&&typeof t.fontSize==='number'&&t.fontSize<settings.minFont-.05)tooSmall=t.name;});
        if(tooSmall)throw Error('После измерения текста в Figma слой «'+tooSmall+'» стал мельче '+settings.minFont+' px. Партия отменена; проверьте размеры или разрешите мелкий текст.');
      }
      copy.x=positions[i].x;copy.y=positions[i].y;
      copy.name=original.name+' — '+s.width+'×'+s.height;
      copy.setPluginData('smart-resize.generated.v1',JSON.stringify({sourceId:original.id,mode,width:s.width,height:s.height}));
      for(const n of nodes){const b=n.absoluteBoundingBox,f=copy.absoluteBoundingBox;if(n.visible&&b&&f&&(b.x<f.x-1||b.y<f.y-1||b.x+b.width>f.x+f.width+1||b.y+b.height>f.y+f.height+1)&&plan[descriptors[nodes.indexOf(n)].id].role!=='Background')warnings.push(copy.name+': проверьте границы «'+n.name+'».');}
      post('progress',{current:i+1,total:ss.length});
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    page.selection=created;figma.viewport.scrollAndZoomIntoView(created);figma.commitUndo();
    post('done',{count:created.length,warnings:[...new Set(warnings)].slice(0,30)});
  }catch(e){for(const n of created)if(!n.removed)n.remove();throw e;}
}
async function handle(msg){
  if(!msg||typeof msg.type!=='string')return;
  if(busy){post('error',{message:'Дождитесь завершения текущей операции.'});return;}
  busy=true;post('busy',{value:true});
  try{
    if(msg.type==='init'){
      try{const value=await figma.clientStorage.getAsync(STORAGE);saved=value===undefined?DEFAULTS:SR.presets(value);storageOK=true;}
      catch(e){saved=[];storageOK=false;post('error',{message:'Не удалось прочитать наборы. Сохранение отключено для защиты данных; перезапустите плагин. Можно генерировать размеры вручную.'});}
      post('presets',{presets:saved});
      if(!sourceValid())source=selectionSource();sync();frameChoices();
    }else if(msg.type==='pick')pick(msg.id);
    else if(msg.type==='refresh-frames'){sync();frameChoices();}
    else if(msg.type==='reveal'){
      if(!sourceValid())throw Error('Сначала выберите исходный Frame.');
      figma.currentPage.selection=[source];figma.viewport.scrollAndZoomIntoView([source]);
    }
    else if(msg.type==='priority'){
      if(!sourceValid())throw Error('Выберите исходник.');
      if(!['essential','normal','optional'].includes(msg.priority))throw Error('Неизвестный приоритет.');
      const n=source.children.find(n=>n.id===msg.id);if(!n)throw Error('Слой не найден.');
      n.setPluginData('smart-resize.priority.v1',msg.priority);figma.commitUndo();sync();
    }
    else if(msg.type==='role'){
      if(!sourceValid())throw Error('Выберите исходный Frame.');
      if(msg.role!==''&&!SR.ROLES.includes(msg.role))throw Error('Неизвестная роль.');
      let nodes=[];
      if(msg.id){const n=source.children.find(n=>n.id===msg.id);if(n)nodes=[n];}
      else nodes=[...new Set(figma.currentPage.selection.map(rootLayer).filter(Boolean))];
      if(!nodes.length)throw Error('Выделите слой внутри исходника. Роль назначается его верхней группе.');
      for(const n of nodes)n.setPluginData(ROLE,msg.role);
      figma.commitUndo();sync();
    }else if(msg.type==='save'){
      if(!storageOK)throw Error('Сохранение недоступно: перезапустите плагин.');
      const name=typeof msg.name==='string'?msg.name.trim():'';
      const candidate=saved.filter(p=>p.name!==name).concat([{name,sizes:SR.sizes(msg.sizes)}]);
      const valid=SR.presets(candidate);await figma.clientStorage.setAsync(STORAGE,valid);saved=valid;post('presets',{presets:saved,selected:name});post('notice',{message:'Набор сохранён: '+name});
    }else if(msg.type==='delete'){
      if(!storageOK)throw Error('Сохранение недоступно.');
      const candidate=saved.filter(p=>p.name!==msg.name);await figma.clientStorage.setAsync(STORAGE,candidate);saved=candidate;post('presets',{presets:saved});
    }else if((msg.type==='generate'||msg.type==='analyze'))await generate(msg);
  }catch(e){error(e);}finally{busy=false;post('busy',{value:false});}
}
figma.ui.onmessage=handle;
figma.on('selectionchange',()=>{
  if(busy)return;
  if(!sourceValid()){
    source=selectionSource();sync();frameChoices();
  }
  post('selection',{count:figma.currentPage.selection.map(rootLayer).filter(Boolean).length});
});
figma.on('currentpagechange',()=>{if(!busy){source=null;sync();frameChoices();}});
