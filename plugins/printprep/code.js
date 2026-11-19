(function (root) {
  'use strict';
  const PT = 72 / 25.4;
  function settings(input) {
    const s = {};
    for (const key of ['width', 'height', 'bleed', 'safe', 'dpi']) {
      s[key] = Number(input[key]);
      if (!Number.isFinite(s[key])) throw new Error('Enter a number for each setting.');
    }
    if (s.width < 1 || s.height < 1 || s.width > 5000 || s.height > 5000)
      throw new Error('Each side must be between 1 and 5000 mm.');
    if (s.bleed < 0 || s.bleed > 100 || s.safe < 0 || s.safe * 2 >= Math.min(s.width, s.height))
      throw new Error('Check bleed and safe margins. The safe area must remain inside the finished size.');
    if (!Number.isInteger(s.dpi) || s.dpi < 36 || s.dpi > 1200)
      throw new Error('Resolution must be a whole number from 36 to 1200 DPI.');
    return s;
  }
  function dimensions(input, withBleed = true) {
    const s = settings(input), b = withBleed ? s.bleed : 0;
    const width = s.width + 2 * b, height = s.height + 2 * b;
    return { width, height, pxWidth: Math.max(1, Math.round(width / 25.4 * s.dpi)),
      pxHeight: Math.max(1, Math.round(height / 25.4 * s.dpi)), ptWidth: width * PT, ptHeight: height * PT };
  }
  function rasterLimit(d) {
    if (d.pxWidth > 16000 || d.pxHeight > 16000 || d.pxWidth * d.pxHeight > 40e6)
      throw new Error('TIFF is limited to 16,000 pixels per side and 40 megapixels. Lower the DPI or choose vector PDF.');
  }
  function concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out;
  }
  function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
    return (c ^ 0xffffffff) >>> 0;
  }
  function pngDpi(bytes, dpi) {
    bytes = new Uint8Array(bytes);
    if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80) throw new Error('Invalid PNG image.');
    const chunk = new Uint8Array(21), v = new DataView(chunk.buffer);
    v.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4);
    const ppm = Math.round(dpi / 0.0254);
    v.setUint32(8, ppm); v.setUint32(12, ppm); chunk[16] = 1;
    v.setUint32(17, crc32(chunk.subarray(4, 17)));
    const parts = [bytes.subarray(0, 8)]; let p = 8, inserted = false;
    while (p < bytes.length) {
      if (p + 12 > bytes.length) throw new Error('The PNG image is damaged.');
      const n = new DataView(bytes.buffer, bytes.byteOffset + p, 4).getUint32(0);
      if (p + n + 12 > bytes.length) throw new Error('The PNG image is damaged.');
      const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
      if (type !== 'pHYs') parts.push(bytes.subarray(p, p + n + 12));
      if (type === 'IHDR') { parts.push(chunk); inserted = true; }
      p += n + 12;
    }
    if (!inserted) throw new Error('The PNG header is missing.');
    return concat(parts);
  }
  function jpegDpi(bytes, dpi) {
    bytes = new Uint8Array(bytes);
    if (bytes[0] !== 255 || bytes[1] !== 216) throw new Error('Invalid JPEG image.');
    // A fresh JFIF header avoids conflicting JFIF/EXIF density metadata.
    const app = new Uint8Array([255,224,0,16,74,70,73,70,0,1,2,1,dpi >> 8,dpi & 255,dpi >> 8,dpi & 255,0,0]);
    const parts = [bytes.subarray(0, 2), app]; let p = 2;
    while (p < bytes.length) {
      if (bytes[p] !== 255) throw new Error('The JPEG image is damaged.');
      const marker = bytes[p + 1];
      if (marker === 218 || marker === 217) { parts.push(bytes.subarray(p)); break; }
      const n = (bytes[p + 2] << 8) | bytes[p + 3];
      if (n < 2 || p + n + 2 > bytes.length) throw new Error('The JPEG image is damaged.');
      if (marker !== 224 && marker !== 225) parts.push(bytes.subarray(p, p + n + 2));
      p += n + 2;
    }
    return concat(parts);
  }
  async function makePdf(PDFLib, bytes, mode, input, withBleed, marks) {
    bytes = new Uint8Array(bytes);
    const s = settings(input), d = dimensions(s, withBleed), b = (withBleed ? s.bleed : 0) * PT;
    const m = marks ? 7 * PT : 0;
    const pdf = await PDFLib.PDFDocument.create();
    const page = pdf.addPage([d.ptWidth + 2 * m, d.ptHeight + 2 * m]);
    if (mode === 'vector') {
      const [embedded] = await pdf.embedPdf(bytes, [0]);
      page.drawPage(embedded, { x: m, y: m, width: d.ptWidth, height: d.ptHeight });
    } else {
      const image = await pdf.embedPng(bytes);
      page.drawImage(image, { x: m, y: m, width: d.ptWidth, height: d.ptHeight });
    }
    page.setTrimBox(m + b, m + b, s.width * PT, s.height * PT);
    page.setBleedBox(m, m, d.ptWidth, d.ptHeight);
    page.setCropBox(0, 0, d.ptWidth + 2 * m, d.ptHeight + 2 * m);
    if (marks) {
      const gap = PT, len = 4 * PT;
      const line = (x1,y1,x2,y2) => page.drawLine({ start:{x:x1,y:y1},end:{x:x2,y:y2},thickness:0.25,color:PDFLib.rgb(0,0,0) });
      for (const x of [m + b, m + d.ptWidth - b]) {
        line(x, m-gap, x, m-gap-len); line(x, m+d.ptHeight+gap, x, m+d.ptHeight+gap+len);
      }
      for (const y of [m + b, m + d.ptHeight - b]) {
        line(m-gap, y, m-gap-len, y); line(m+d.ptWidth+gap, y, m+d.ptWidth+gap+len, y);
      }
    }
    pdf.setTitle('PrintPrep'); pdf.setCreator('PrintPrep for Figma');
    pdf.setSubject(`${s.width} x ${s.height} mm; bleed ${withBleed ? s.bleed : 0} mm; ${mode === 'vector' ? 'vector / source raster resolution' : s.dpi + ' PPI target'}`);
    return pdf.save();
  }
  function epsBounds(input, inputSettings, withBleed, marks) {
    const bytes=new Uint8Array(input), d=dimensions(inputSettings,withBleed), m=marks?14*PT:0;
    const endToken=[37,37,69,110,100,67,111,109,109,101,110,116,115];
    let end=-1;
    for(let i=0;i<Math.min(bytes.length-13,16384);i++)if(endToken.every((n,j)=>bytes[i+j]===n)){end=i+13;break;}
    if(end<0)throw new Error('The EPS converter returned an invalid file header.');
    let header=String.fromCharCode(...bytes.subarray(0,end));
    if(!header.startsWith('%!PS-Adobe-') || !header.includes('EPSF-'))throw new Error('The converter did not return an EPS file.');
    const w=d.ptWidth+m,h=d.ptHeight+m;
    header=header.replace(/^%%BoundingBox:.*$/m,`%%BoundingBox: 0 0 ${Math.ceil(w)} ${Math.ceil(h)}`)
      .replace(/^%%HiResBoundingBox:.*$/m,`%%HiResBoundingBox: 0 0 ${w.toFixed(8)} ${h.toFixed(8)}`);
    return concat([Uint8Array.from(header,c=>c.charCodeAt(0)),bytes.subarray(end)]);
  }
  function validateCmykProfile(input) {
    const bytes=new Uint8Array(input);
    if(bytes.length<132 || bytes.length>32*1024*1024)throw new Error('Choose a valid ICC profile, up to 32 MB.');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const text=(p,n)=>String.fromCharCode(...bytes.subarray(p,p+n));
    const length=view.getUint32(0);
    if(length<132 || length>bytes.length || text(36,4)!=='acsp')throw new Error('The file is not a valid ICC profile.');
    if(text(16,4)!=='CMYK' || text(12,4)!=='prtr')throw new Error('Select a CMYK output/printer profile, not RGB, monitor or device-link ICC.');
    if(![2,4].includes(bytes[8]) || !['XYZ ','Lab '].includes(text(20,4)))throw new Error('Use a standard ICC v2 or v4 CMYK printer profile.');
    const count=view.getUint32(128);
    if(!count || count>4096 || 132+count*12>length)throw new Error('The ICC tag table is invalid.');
    for(let i=0;i<count;i++){const p=132+i*12,o=view.getUint32(p+4),n=view.getUint32(p+8);if(o<128 || o+n>length)throw new Error('The ICC profile contains invalid data offsets.');}
    return {bytes:bytes.slice(0,length),version:bytes[8],space:'CMYK',kind:'printer'};
  }
  function cmykArgs(format,dpi,width,height,intent=1) {
    if(!['pdf-vector','eps','tiff'].includes(format))throw new Error('Choose PDF, EPS or TIFF.');
    if(!Number.isInteger(dpi)||dpi<36||dpi>1200||![0,1].includes(intent))throw new Error('Invalid colour conversion settings.');
    const args=['-dSAFER','--permit-file-read=/target.icc:/source.icc','-dBATCH','-dNOPAUSE','-dQUIET','-dAutoRotatePages=/None',
      '-sColorConversionStrategy=CMYK','-dProcessColorModel=/DeviceCMYK','-sOutputICCProfile=/target.icc',
      '-sDefaultRGBProfile=/source.icc','-dUseFastColor=false','-dRenderIntent='+intent,'-dBlackPtComp=1',
      '-dPreserveSeparation=false','-dDownsampleColorImages=false','-dDownsampleGrayImages=false','-dDownsampleMonoImages=false','-r'+dpi];
    if(format==='tiff'){
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('Invalid TIFF dimensions.');
      rasterLimit({pxWidth:width,pxHeight:height});
      args.push('-sDEVICE=tiff32nc','-sCompression=none','-g'+width+'x'+height,'-dFIXEDMEDIA','-dPDFFitPage','-dGraphicsAlphaBits=4','-dTextAlphaBits=4');
    }else{
      args.push('-sDEVICE='+(format==='eps'?'eps2write':'pdfwrite'),'-dBlendConversionStrategy=/Simple');
      if(format==='pdf-vector')args.push('-dCompatibilityLevel=1.7','-dAutoFilterColorImages=false','-dColorImageFilter=/FlateEncode','-dAutoFilterGrayImages=false','-dGrayImageFilter=/FlateEncode');
      else args.push('-dLanguageLevel=3');
    }
    args.push('-sOutputFile=/output','/input.pdf');return args;
  }
  async function finalizeCmykPdf(PDFLib,input,s,withBleed,marks,icc,name) {
    const profile=validateCmykProfile(icc),pdf=await PDFLib.PDFDocument.load(new Uint8Array(input));
    if(pdf.getPageCount()!==1)throw new Error('Expected a single-page PDF.');
    const page=pdf.getPage(0),d=dimensions(s,withBleed),b=(withBleed?s.bleed:0)*PT,m=marks?7*PT:0;
    page.setMediaBox(0,0,d.ptWidth+2*m,d.ptHeight+2*m);page.setCropBox(0,0,d.ptWidth+2*m,d.ptHeight+2*m);
    page.setTrimBox(m+b,m+b,s.width*PT,s.height*PT);page.setBleedBox(m,m,d.ptWidth,d.ptHeight);
    const n=PDFLib.PDFName;
    const iccStream=pdf.context.register(pdf.context.flateStream(profile.bytes,{N:4,Alternate:n.of('DeviceCMYK')}));
    const intent=pdf.context.register(pdf.context.obj({Type:n.of('OutputIntent'),S:n.of('GTS_PDFX'),
      OutputConditionIdentifier:PDFLib.PDFHexString.fromText(name||'Custom CMYK output'),
      Info:PDFLib.PDFHexString.fromText(name||'Custom CMYK output'),DestOutputProfile:iccStream}));
    pdf.catalog.set(n.of('OutputIntents'),pdf.context.obj([intent]));
    // An output intent describes the CMYK target; it does not certify PDF/X compliance.
    pdf.setCreator('PrintPrep');pdf.setSubject('CMYK ICC conversion; '+(name||'custom profile')+'; not PDF/X certified');
    return pdf.save();
  }
  function finalizeCmykTiff(input,icc,dpi,expectedWidth,expectedHeight) {
    const profile=validateCmykProfile(icc),bytes=new Uint8Array(input);
    if(bytes.length<10)throw new Error('Invalid TIFF output.');
    const little=bytes[0]===73&&bytes[1]===73;
    if(!little&&!(bytes[0]===77&&bytes[1]===77))throw new Error('Invalid TIFF byte order.');
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(v.getUint16(2,little)!==42)throw new Error('Unsupported TIFF output.');
    const offset=v.getUint32(4,little);if(offset+2>bytes.length)throw new Error('Invalid TIFF directory.');
    const count=v.getUint16(offset,little);if(count>4096||offset+2+count*12+4>bytes.length)throw new Error('Invalid TIFF directory.');
    const entries=new Map();
    for(let i=0;i<count;i++){const p=offset+2+i*12;entries.set(v.getUint16(p,little),bytes.slice(p,p+12));}
    function scalar(tag){const b=entries.get(tag);if(!b)return null;const q=new DataView(b.buffer);return q.getUint16(2,little)===3?q.getUint16(8,little):q.getUint32(8,little);}
    if(scalar(262)!==5||scalar(277)!==4)throw new Error('Conversion did not produce four-channel CMYK TIFF. Export stopped.');
    if(scalar(256)!==expectedWidth||scalar(257)!==expectedHeight)throw new Error('Converted TIFF has unexpected pixel dimensions.');
    const start=(bytes.length+1)&~1,iccOffset=start,xr=(iccOffset+profile.bytes.length+1)&~1,yr=xr+8,ifd=(yr+8+1)&~1;
    const totalCount=new Set([...entries.keys(),282,283,296,332,34675]).size;
    const result=new Uint8Array(ifd+2+12*totalCount+4);result.set(bytes);result.set(profile.bytes,iccOffset);
    const out=new DataView(result.buffer);out.setUint32(4,ifd,little);
    for(const p of [xr,yr]){out.setUint32(p,dpi,little);out.setUint32(p+4,1,little);}
    function entry(tag,type,count,value){const b=new Uint8Array(12),q=new DataView(b.buffer);q.setUint16(0,tag,little);q.setUint16(2,type,little);q.setUint32(4,count,little);if(type===3&&count===1)q.setUint16(8,value,little);else q.setUint32(8,value,little);entries.set(tag,b);}
    entry(282,5,1,xr);entry(283,5,1,yr);entry(296,3,1,2);entry(332,3,1,1);entry(34675,7,profile.bytes.length,iccOffset);
    out.setUint16(ifd,totalCount,little);let p=ifd+2;
    for(const [,b] of [...entries].sort((a,b)=>a[0]-b[0])){result.set(b,p);p+=12;}
    if(v.getUint32(offset+2+12*count,little)!==0)throw new Error('Expected a single-image TIFF.');
    return result;
  }
  const api = { PT, settings, dimensions, rasterLimit, concat, crc32, pngDpi, jpegDpi, makePdf, epsBounds, validateCmykProfile, cmykArgs, finalizeCmykPdf, finalizeCmykTiff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PrintCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

const RELEASE_LINKS={"supportEmail":"edireifman@gmail.com","sourceUrl":"","paypalUrl":"https://paypal.me/edireifman","desktopSmokeTestPassed":false};
'use strict';
const KEY = 'printprep.v1';
figma.showUI(__html__, { width: 420, height: 730, themeColors: true });
let busy = false;
function config(node) {
  try { const raw = node.getPluginData(KEY); return raw ? PrintCore.settings(JSON.parse(raw)) : null; } catch (_) { return null; }
}
function selected() {
  const nodes = figma.currentPage.selection;
  if (nodes.length !== 1 || nodes[0].type !== 'FRAME') return null;
  return nodes[0];
}
function sendSelection() {
  const node = selected();
  figma.ui.postMessage({ type:'selection', node: node ? { id:node.id, name:node.name, width:node.width, height:node.height, config:config(node) } : null });
}
figma.on('selectionchange', sendSelection);
function guides(s) {
  const p = PrintCore.PT, b = s.bleed, w = s.width, h = s.height, a = s.safe;
  return [
    ...[b,b+w,b+a,b+w-a].map(v => ({axis:'X', offset:v*p})),
    ...[b,b+h,b+a,b+h-a].map(v => ({axis:'Y', offset:v*p}))
  ];
}
function checkSize(node, s) {
  const d = PrintCore.dimensions(s);
  if (Math.abs(node.width - d.ptWidth) > 0.02 || Math.abs(node.height - d.ptHeight) > 0.02)
    throw new Error('The frame size has changed. Restore its original size or attach matching settings before exporting. This prevents stretching your artwork.');
}
function checkTransform(node) {
  const t = node.absoluteTransform;
  if (Math.abs(t[0][0]-1)>0.0001 || Math.abs(t[0][1])>0.0001 || Math.abs(t[1][0])>0.0001 || Math.abs(t[1][1]-1)>0.0001)
    throw new Error('Use an unrotated, unflipped frame with no scaling applied by its parent.');
}
async function preflight(node, s) {
  const warnings = [], p = PrintCore.PT;
  let checked = 0, uncertain = 0, effects = 0, count = 0;
  const root = node.absoluteTransform;
  const safe = { x:root[0][2] + (s.bleed+s.safe)*p, y:root[1][2] + (s.bleed+s.safe)*p,
    r:root[0][2] + (s.bleed+s.width-s.safe)*p, b:root[1][2] + (s.bleed+s.height-s.safe)*p };
  const cache = new Map();
  async function walk(n) {
    if (n.visible === false || n.opacity === 0) return;
    if (++count > 10000) throw new Error('This layout has too many layers to check at once. Split it into smaller layouts.');
    const label = n.name.slice(0, 100);
    if (n !== node && n.type === 'TEXT' && n.absoluteBoundingBox) {
      const q = n.absoluteBoundingBox;
      if (q.x < safe.x-0.05 || q.y < safe.y-0.05 || q.x+q.width > safe.r+0.05 || q.y+q.height > safe.b+0.05)
        warnings.push({level:'warning',text:`Text “${label}” extends beyond the safe area.`});
      if (n.hasMissingFont) warnings.push({level:'warning',text:`Text “${label}” has a missing font.`});
    }
    if (n.effects && n.effects.some(e=>e.visible !== false)) effects++;
    for (const paint of (Array.isArray(n.fills) ? n.fills : [])) {
      if (paint.type !== 'IMAGE' || paint.visible === false || !paint.imageHash) continue;
      if (!cache.has(paint.imageHash)) {
        const image = figma.getImageByHash(paint.imageHash);
        cache.set(paint.imageHash, image ? await image.getSizeAsync() : null);
      }
      const size = cache.get(paint.imageHash);
      if (!size) { uncertain++; continue; }
      const t = n.absoluteTransform;
      const w = n.width * Math.hypot(t[0][0], t[1][0]);
      const h = n.height * Math.hypot(t[0][1], t[1][1]);
      let density;
      if (paint.scaleMode === 'FILL') density = 72 / Math.max(w/size.width,h/size.height);
      else if (paint.scaleMode === 'FIT') density = 72 / Math.min(w/size.width,h/size.height);
      else { uncertain++; continue; }
      if (!Number.isFinite(density) || density <= 0) { uncertain++; continue; }
      checked++;
      if (density + 0.5 < s.dpi)
        warnings.push({level:'warning',text:`Image in “${label}”: about ${Math.floor(density)} PPI, below the ${s.dpi} target. Use a larger source image.`});
    }
    if ('children' in n) for (const child of n.children) await walk(child);
  }
  await walk(node);
  if (uncertain) warnings.push({level:'warning',text:`Cropped, tiled or unavailable source images: ${uncertain}. Check their effective PPI manually.`});
  if (effects) warnings.push({level:'info',text:`Layers with effects: ${effects}. Figma controls their rasterization in vector PDF; the selected DPI does not guarantee effect resolution.`});
  warnings.push({level:'info',text:'Exports are converted from Figma sRGB to the selected CMYK ICC profile. PDF/X conformance, ink limits, overprint and spot colours are not checked.'});
  return { warnings, checked, uncertain };
}
figma.ui.onmessage = async msg => {
  if (msg.type === 'ready') { sendSelection(); return; }
  if (msg.type === 'support-paypal') { if(RELEASE_LINKS.paypalUrl)figma.openExternal(RELEASE_LINKS.paypalUrl); return; }
  if (msg.type === 'view-source') { if(RELEASE_LINKS.sourceUrl)figma.openExternal(RELEASE_LINKS.sourceUrl); return; }
  if (busy) return;
  busy = true;
  try {
    if (msg.type === 'create') {
      const s = PrintCore.settings(msg.settings), d = PrintCore.dimensions(s);
      const f = figma.createFrame();
      f.name = `${String(msg.name || 'Print layout').slice(0,100)} · ${s.width} × ${s.height} mm`;
      f.resize(d.ptWidth, d.ptHeight); f.clipsContent = true;
      f.fills = [{type:'SOLID', color:{r:1,g:1,b:1}}];
      f.x = Math.round(figma.viewport.center.x - f.width/2); f.y = Math.round(figma.viewport.center.y - f.height/2);
      f.guides = guides(s); f.setPluginData(KEY, JSON.stringify(s));
      figma.currentPage.selection = [f]; figma.viewport.scrollAndZoomIntoView([f]);
      figma.ui.postMessage({type:'created'}); sendSelection();
    } else if (msg.type === 'attach') {
      const node = selected(); if (!node) throw new Error('Select one frame.');
      const s = PrintCore.settings(msg.settings);
      checkSize(node,s); checkTransform(node);
      node.setPluginData(KEY,JSON.stringify(s)); node.guides = guides(s); sendSelection();
      figma.ui.postMessage({type:'attached'});
    } else if (msg.type === 'check' || msg.type === 'export') {
      const node = selected(); if (!node) throw new Error('Select one layout frame.');
      let s = config(node); if (!s) throw new Error('Create a layout with PrintPrep or attach its settings to an existing frame first.');
      s = PrintCore.settings({...s,dpi:msg.dpi});
      checkSize(node,s); checkTransform(node);
      const report = await preflight(node,s);
      figma.ui.postMessage({type:'report',report,forExport:msg.type==='export'});
      if (msg.type === 'check') { figma.ui.postMessage({type:'checked'}); return; }
      const format = msg.format;
      if (!['pdf-vector','eps','tiff'].includes(format)) throw new Error('Choose PDF, EPS or TIFF.');
      const withBleed = !!msg.withBleed;
      const d = PrintCore.dimensions(s,withBleed);
      if (format==='tiff') PrintCore.rasterLimit(d);
      // Work on a disposable clone so selection, guides and original art stay intact.
      let copy, wrapper;
      try {
        copy = node.clone(); copy.visible = true; copy.locked = false; copy.guides = []; copy.clipsContent = true;
        wrapper = figma.createFrame(); wrapper.name = '__PrintPrep_export__';
        wrapper.resize(d.ptWidth,d.ptHeight); wrapper.fills = []; wrapper.clipsContent = true;
        wrapper.appendChild(copy); copy.x = withBleed ? 0 : -s.bleed*PrintCore.PT; copy.y = withBleed ? 0 : -s.bleed*PrintCore.PT;
        const bytes = await wrapper.exportAsync({format:'PDF',colorProfile:'SRGB',useAbsoluteBounds:true});
        figma.ui.postMessage({type:'exported',bytes,settings:s,withBleed,marks:format!=='tiff'&&!!msg.marks,format,name:node.name});
      } finally {
        if (wrapper && !wrapper.removed) wrapper.remove();
        else if (copy && !copy.removed) copy.remove();
      }
    }
  } catch (e) { figma.ui.postMessage({type:'error',message:String(e.message || e)}); }
  finally { busy = false; }
};
sendSelection();
