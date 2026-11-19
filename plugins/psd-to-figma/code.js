(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // outputs/PSD-to-Figma-0.4.0/source/code.ts
  var COMMAND = "import-psd";
  figma.showUI(__html__, { width: 380, height: 630, themeColors: true });
  figma.root.setRelaunchData({ [COMMAND]: "Import PSD" });
  var active;
  var busy = false;
  var send = (m) => figma.ui.postMessage(m);
  var clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  var blends = { normal: "NORMAL", "pass through": "PASS_THROUGH", multiply: "MULTIPLY", screen: "SCREEN", overlay: "OVERLAY", darken: "DARKEN", lighten: "LIGHTEN", "color dodge": "COLOR_DODGE", "color burn": "COLOR_BURN", "hard light": "HARD_LIGHT", "soft light": "SOFT_LIGHT", difference: "DIFFERENCE", exclusion: "EXCLUSION", hue: "HUE", saturation: "SATURATION", color: "COLOR", luminosity: "LUMINOSITY" };
  function userError(e) {
    const message = String(e).replace(/^Error:\s*/, "");
    if (["A layer exceeds 20 MB as PNG. Reduce its dimensions.", "A layer or mask exceeds 32 megapixels.", "Choose a PSD file. PSB is not supported yet.", "Could not encode the layer as PNG.", "Figma did not respond within 60 seconds. Import stopped.", "Finish the current import first.", "Group nesting exceeds the maximum depth of 40.", "Import cancelled.", "Import has not started.", "Invalid group structure.", "Invalid layer coordinates.", "Invalid layer dimensions.", "Invalid vector path coordinates.", "No fonts are available.", "Save the PSD in RGB or Grayscale, 8 bits per channel.", "The PSD has no separate layers. Save it with layers enabled.", "The combined layer area exceeds 120 megapixels.", "The file contains more than 1,500 layers.", "The maximum document size is 32 megapixels and 30,000 px per side.", "The vector path is empty.", "The vector path is too complex.", "Too many layers.", "Too many vector paths."].includes(message)) return message;
    if (/memory|alloc|array buffer/i.test(message)) return "Not enough memory to import this PSD. Reduce its dimensions or number of layers.";
    if (/font/i.test(message)) return "Could not load a font. Check available fonts and try again.";
    return "Import failed. The incomplete result was removed. Check the PSD format and try again.";
  }
  function discard() {
    if (active && !active.root.removed) active.root.remove();
    active = void 0;
  }
  function dimensions(w, h) {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > 1e5 || h > 1e5 || w * h > 32e6) throw Error("Invalid layer dimensions.");
  }
  var normalize = (s) => s.toLowerCase().replace(/[^a-zа-я0-9]/g, "").replace(/(?:ps)?mt$/, "").replace(/regular$/, "");
  function preserveLines(text, lines) {
    if (!lines || lines.length < 2 || lines.length > 12 || text.includes("\n")) return text;
    const words = [], wordPattern = /\S+/g;
    let match;
    while ((match = wordPattern.exec(text)) !== null) words.push(match);
    if (words.length < lines.length) return text;
    const total = lines.reduce((sum, l) => sum + l.width, 0);
    const chars = text.split("");
    let startWord = 0, accumulated = 0;
    for (let line = 0; line < lines.length - 1; line++) {
      accumulated += lines[line].width;
      const goal = text.length * accumulated / total;
      let best = startWord, error = Infinity;
      for (let w = startWord; w <= words.length - (lines.length - line); w++) {
        const end2 = words[w].index + words[w][0].length;
        if (Math.abs(end2 - goal) < error) {
          error = Math.abs(end2 - goal);
          best = w;
        }
      }
      const end = words[best].index + words[best][0].length;
      if (/\s/.test(chars[end] || "")) chars[end] = "\n";
      startWord = best + 1;
    }
    return chars.join("");
  }
  function fitTextInk(node, item, parent, substitute) {
    var _a;
    if (!active || item.width < 1 || item.height < 1) return;
    const measure = () => {
      const copy = node.clone();
      parent.appendChild(copy);
      copy.relativeTransform = node.relativeTransform;
      copy.effects = [];
      let outline;
      try {
        outline = figma.flatten([copy], parent);
        return outline.absoluteBoundingBox;
      } finally {
        if (outline && !outline.removed) outline.remove();
        if (!copy.removed) copy.remove();
      }
    };
    try {
      let box = measure();
      if (!box || box.width <= 0 || box.height <= 0) return;
      if (substitute) {
        const scale = clamp(Math.min(item.width / box.width, item.height / box.height), 0.1, 10);
        if (Math.abs(scale - 1) > 5e-3) {
          node.rescale(scale);
          box = measure();
        }
      }
      if (!box) return;
      const align = (_a = item.text) == null ? void 0 : _a.align;
      const offset = align === "center" ? (item.width - box.width) / 2 : align === "right" ? item.width - box.width : 0;
      node.x += active.root.x + item.x + offset - box.x;
      node.y += active.root.y + item.y - box.y;
    } catch (_e) {
      active.notes.push(`${item.name}: could not align text to its visible bounds; review the report or try raster mode.`);
    }
  }
  async function textNode(item) {
    var _a;
    if (!active || !item.text) return;
    const state = active, t = item.text;
    let substituted = false;
    if (!state.fonts) state.fonts = await figma.listAvailableFontsAsync();
    const fallback = state.fonts.find((f) => f.fontName.family === "Inter" && f.fontName.style === "Regular") || state.fonts[0];
    async function fontFor(name) {
      const exact = state.fonts.find((f) => normalize(f.fontName.family + f.fontName.style) === normalize(name)) || state.fonts.find((f) => normalize(f.fontName.family) === normalize(name) && /regular|normal|roman/i.test(f.fontName.style));
      const condensed = /condensed|narrow|compressed/i.test(name);
      const bold = /bold|black|heavy/i.test(name);
      const close = state.fonts.find((f) => condensed && /DIN Condensed/i.test(f.fontName.family) && (!bold || /bold/i.test(f.fontName.style))) || state.fonts.find((f) => condensed && /Arial Narrow|Avenir Next Condensed|Roboto Condensed/i.test(f.fontName.family) && (bold ? /bold/i.test(f.fontName.style) : /regular|normal|medium/i.test(f.fontName.style)));
      const din = /^din/i.test(name) ? state.fonts.find((f) => /DIN Alternate/i.test(f.fontName.family)) : void 0;
      const weighted = state.fonts.find((f) => f.fontName.family === "Inter" && (bold ? /bold/i.test(f.fontName.style) : /medium/i.test(name) ? /medium/i.test(f.fontName.style) : /regular/i.test(f.fontName.style)));
      const font = exact || close || din || weighted || fallback;
      if (!exact) substituted = true;
      if (!font) throw Error("No fonts are available.");
      try {
        await figma.loadFontAsync(font.fontName);
      } catch (e) {
        if (!fallback || font === fallback) throw e;
        await figma.loadFontAsync(fallback.fontName);
        state.notes.push(`${item.name}: font \u201C${name}\u201D could not be loaded; replaced with ${fallback.fontName.family}.`);
        substituted = true;
        return fallback.fontName;
      }
      if (!exact) state.notes.push(`${item.name}: font \u201C${name}\u201D replaced with ${font.fontName.family} ${font.fontName.style}; text remains editable.`);
      return font.fontName;
    }
    let n;
    try {
      const cache = /* @__PURE__ */ new Map();
      for (const s of [t, ...t.runs]) if (!cache.has(s.font)) cache.set(s.font, await fontFor(s.font));
      n = figma.createText();
      n.fontName = cache.get(t.font);
      n.fontSize = clamp(t.size, 1, 2e3);
      n.characters = preserveLines(t.characters, t.inkLines);
      n.fills = [{ type: "SOLID", color: { r: t.color.r, g: t.color.g, b: t.color.b }, opacity: clamp(t.color.a, 0, 1) }];
      n.letterSpacing = { unit: "PERCENT", value: t.tracking / 10 };
      if (t.leading && t.leading > 0) n.lineHeight = { unit: "PIXELS", value: t.leading };
      n.textDecoration = t.decoration;
      n.textCase = t.caps;
      for (const s of t.runs) {
        if (s.start < 0 || s.end > t.characters.length || s.end <= s.start) continue;
        n.setRangeFontName(s.start, s.end, cache.get(s.font));
        n.setRangeFontSize(s.start, s.end, clamp(s.size, 1, 2e3));
        n.setRangeFills(s.start, s.end, [{ type: "SOLID", color: { r: s.color.r, g: s.color.g, b: s.color.b }, opacity: clamp(s.color.a, 0, 1) }]);
        n.setRangeLetterSpacing(s.start, s.end, { unit: "PERCENT", value: s.tracking / 10 });
        if (s.leading && s.leading > 0) n.setRangeLineHeight(s.start, s.end, { unit: "PIXELS", value: s.leading });
        n.setRangeTextDecoration(s.start, s.end, s.decoration);
        n.setRangeTextCase(s.start, s.end, s.caps);
      }
      n.textAlignHorizontal = t.align === "center" ? "CENTER" : t.align === "right" ? "RIGHT" : t.align.startsWith("justify") ? "JUSTIFIED" : "LEFT";
      if (((_a = t.inkLines) == null ? void 0 : _a.length) === 1) n.textAutoResize = "WIDTH_AND_HEIGHT";
      else if (t.boxWidth) {
        n.textAutoResize = "HEIGHT";
        n.resize(clamp(t.boxWidth, 1, 1e5), Math.max(1, n.height));
      } else n.textAutoResize = "WIDTH_AND_HEIGHT";
      for (const note of t.notes) state.notes.push(`${item.name}: ${note}`);
      state.notes.push(`${item.name}: text is editable; check its position and line breaks.`);
      if (substituted) state.substituted.add(n.id);
      n.setPluginData("psd-fonts", JSON.stringify([...cache.keys()]));
      return n;
    } catch (_e) {
      if (n && !n.removed) n.remove();
      state.notes.push(`${item.name}: could not create editable text; used raster fallback. Review the report.`);
      return;
    }
  }
  function shapeNode(item, parent) {
    var _a;
    if (!item.shape || !active) return;
    let holder;
    try {
      holder = figma.createFrame();
      parent.appendChild(holder);
      holder.x = 0;
      holder.y = 0;
      holder.fills = [];
      holder.clipsContent = false;
      holder.resize(item.width, item.height);
      let result;
      if (item.shape.parts.length > 251) throw Error("Too many vector paths.");
      for (const part of item.shape.parts) {
        const imported = figma.createNodeFromSvg(part.svg);
        holder.appendChild(imported);
        imported.x = 0;
        imported.y = 0;
        if (!imported.children.length) {
          imported.remove();
          continue;
        }
        const v = figma.flatten([...imported.children], holder);
        imported.remove();
        v.name = "Path";
        if (!result) result = v;
        else {
          const fills = result.fills, strokes = result.strokes, weight = result.strokeWeight;
          result = part.operation === "subtract" ? figma.subtract([result, v], holder) : part.operation === "intersect" ? figma.intersect([result, v], holder) : part.operation === "exclude" ? figma.exclude([result, v], holder) : figma.union([result, v], holder);
          if (fills !== figma.mixed) result.fills = [...fills];
          result.strokes = [...strokes];
          result.strokeWeight = weight;
        }
      }
      if (!result) throw Error("The vector path is empty.");
      if (item.shape.rasterFill && ((_a = item.png) == null ? void 0 : _a.length)) {
        const image = figma.createImage(new Uint8Array(item.png));
        result.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
      }
      result.name = item.name + " \u2014 editable path";
      for (const note of item.shape.notes) active.notes.push(`${item.name}: ${note}`);
      holder.setPluginData("psd-editable", "vector");
      return holder;
    } catch (_e) {
      if (holder && !holder.removed) holder.remove();
      active.notes.push(`${item.name}: could not create a vector; used raster fallback. Review the report.`);
      return;
    }
  }
  async function append(item) {
    var _a, _b, _c, _d;
    if (!active) throw Error("Import has not started.");
    if (++active.count > 1502) throw Error("Too many layers.");
    dimensions(item.width, item.height);
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || Math.abs(item.x) > 1e6 || Math.abs(item.y) > 1e6) throw Error("Invalid layer coordinates.");
    const parent = item.clipTo ? active.clipParents.get(item.clipTo) || active.parents.get(item.parent) : active.parents.get(item.parent);
    if (!parent || active.parents.has(item.id)) throw Error("Invalid group structure.");
    let node;
    if (item.group) {
      const frame = figma.createFrame();
      frame.fills = [];
      frame.clipsContent = false;
      frame.resize(active.root.width, active.root.height);
      active.parents.set(item.id, frame);
      node = frame;
    } else {
      let txt;
      if (item.text) txt = await textNode(item);
      const shape = !txt && item.shape ? shapeNode(item, parent) : void 0;
      if (txt) {
        node = txt;
        active.stats.text++;
      } else if (shape) {
        node = shape;
        active.stats.shape++;
      } else {
        active.stats.raster++;
        const rect = figma.createRectangle();
        node = rect;
        parent.appendChild(rect);
        rect.resize(item.width, item.height);
        if ((_a = item.png) == null ? void 0 : _a.length) {
          const image = figma.createImage(new Uint8Array(item.png));
          rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
        } else {
          rect.fills = [];
          active.notes.push(`${item.name}: no saved image; created an empty layer.`);
        }
      }
    }
    parent.appendChild(node);
    node.name = item.name.slice(0, 300);
    node.x = item.group ? 0 : item.x;
    node.y = item.group ? 0 : item.y;
    if (node.type === "TEXT" && item.text) {
      const tr = item.text.matrix, origin = item.text.boxOrigin || [item.x, item.y];
      if (tr.length === 4 && tr.every(Number.isFinite) && Math.abs(tr[0] * tr[3] - tr[1] * tr[2]) > 1e-5) {
        node.relativeTransform = [[tr[0], tr[2], origin[0]], [tr[1], tr[3], origin[1]]];
      }
    }
    if (node.type === "TEXT" && ((_b = item.text) == null ? void 0 : _b.fitInk) && item.text.characters && typeof node.clone === "function") fitTextInk(node, item, parent, active.substituted.has(node.id));
    if (((_c = item.shadows) == null ? void 0 : _c.length) && "effects" in node) {
      const target = item.shape && node.type === "FRAME" && node.children.length === 1 && "effects" in node.children[0] ? node.children[0] : node;
      if ("effects" in target) target.effects = item.shadows;
    }
    if (item.clipBase) {
      if (((_d = item.png) == null ? void 0 : _d.length) && !item.group) {
        const wrap = figma.createFrame();
        parent.appendChild(wrap);
        wrap.fills = [];
        wrap.clipsContent = false;
        wrap.resize(active.root.width, active.root.height);
        wrap.x = 0;
        wrap.y = 0;
        wrap.name = "Clipping group \u2014 " + item.name;
        wrap.visible = !item.hidden;
        const mask = figma.createRectangle();
        wrap.appendChild(mask);
        mask.resize(item.width, item.height);
        mask.x = item.x;
        mask.y = item.y;
        mask.name = "Alpha mask \u2014 " + item.name;
        const image = figma.createImage(new Uint8Array(item.png));
        mask.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
        mask.isMask = true;
        mask.maskType = "ALPHA";
        const x = node.x, y = node.y;
        wrap.appendChild(node);
        node.x = x;
        node.y = y;
        active.clipParents.set(item.id, wrap);
      } else active.notes.push(`${item.name}: clipping group could not be restored: the base layer has no raster mask.`);
    }
    node.visible = !item.hidden;
    node.opacity = clamp(Number.isFinite(item.opacity) ? item.opacity : 1, 0, 1);
    const blend = blends[item.blend];
    if (blend) node.blendMode = blend;
    else active.notes.push(`${item.name}: blend mode \u201C${item.blend}\u201D replaced with Normal.`);
    if (item.note) active.notes.push(`${item.name}: ${item.note}`);
    node.setPluginData("psd-source", "v1");
  }
  var psdExport;
  function exportStyle(s) {
    var _a;
    const fill = (_a = s.fills) == null ? void 0 : _a.filter((p2) => p2.visible !== false);
    if (!fill || fill.length !== 1 || fill[0].type !== "SOLID") return;
    const p = fill[0];
    return {
      font: { name: s.fontName.family.replace(/\s/g, "") + "-" + s.fontName.style.replace(/\s/g, "") },
      fontSize: s.fontSize,
      fillColor: { r: Math.round(p.color.r * 255), g: Math.round(p.color.g * 255), b: Math.round(p.color.b * 255) },
      tracking: s.letterSpacing.unit === "PERCENT" ? s.letterSpacing.value * 10 : s.letterSpacing.value / s.fontSize * 1e3,
      leading: s.lineHeight.unit === "PIXELS" ? s.lineHeight.value : s.lineHeight.unit === "PERCENT" ? s.fontSize * s.lineHeight.value / 100 : void 0,
      autoLeading: s.lineHeight.unit === "AUTO",
      underline: s.textDecoration === "UNDERLINE",
      strikethrough: s.textDecoration === "STRIKETHROUGH"
    };
  }
  async function startPsdExport() {
    if (active) throw Error("Finish the import before exporting.");
    if (figma.currentPage.selection.length !== 1) throw Error("Select one frame or group to export.");
    const root = figma.currentPage.selection[0];
    if (!["FRAME", "GROUP", "COMPONENT", "INSTANCE"].includes(root.type)) throw Error("Select one frame or group to export.");
    const bounds = root.absoluteBoundingBox;
    const width = Math.ceil(bounds.x + bounds.width) - Math.floor(bounds.x), height = Math.ceil(bounds.y + bounds.height) - Math.floor(bounds.y);
    dimensions(width, height);
    const entries = [], notes = [];
    let area = width * height, count = 0;
    const x = Math.floor(bounds.x), y = Math.floor(bounds.y);
    function walk(n, parent, depth, background = false) {
      var _a;
      if (++count > 1500 || depth > 40) throw Error("Export exceeds 1,500 layers or 40 group levels.");
      const id = String(entries.length), b = n.absoluteBoundingBox;
      if (!b) return;
      const layer = { id, parent, name: background ? n.name + " \u2014 background" : n.name, hidden: !n.visible, left: Math.floor(b.x) - x, top: Math.floor(b.y) - y, opacity: "opacity" in n ? n.opacity : 1 };
      const children = "children" in n ? n.children : [];
      const effects = "effects" in n && n.effects.some((e) => e.visible !== false);
      const masking = children.some((c) => "isMask" in c && c.isMask);
      const clipped = "clipsContent" in n && n.clipsContent && (n !== root || "cornerRadius" in n && n.cornerRadius !== 0);
      const safeGroup = !background && children.length && !effects && !masking && !clipped && !("blendMode" in n && !["PASS_THROUGH", "NORMAL"].includes(n.blendMode));
      if (safeGroup) {
        entries.push({ node: n, layer: __spreadProps(__spreadValues({}, layer), { group: true, opacity: layer.opacity, blendMode: "blendMode" in n && n.blendMode === "NORMAL" ? "normal" : "pass through" }) });
        if ("fills" in n && Array.isArray(n.fills) && n.fills.some((p) => p.visible !== false)) walk(n, id, depth + 1, true);
        for (const c of children) walk(c, id, depth + 1);
        return;
      }
      area += Math.ceil(b.width) * Math.ceil(b.height);
      if (area > 12e7) throw Error("Export exceeds 120 megapixels of decoded layer data.");
      if (b.width * b.height > 32e6) throw Error("An export layer exceeds 32 megapixels.");
      layer.opacity = 1;
      layer.blendMode = !background && "blendMode" in n ? Object.keys(blends).find((k) => blends[k] === n.blendMode && k !== "pass through") || "normal" : "normal";
      const tr = n.absoluteTransform;
      const axis = Math.abs(tr[0][1]) < 1e-5 && Math.abs(tr[1][0]) < 1e-5 && tr[0][0] > 0 && tr[1][1] > 0;
      const plain = !background && axis && !effects && !("strokes" in n && n.strokes.length) && (!("blendMode" in n) || n.blendMode === "NORMAL");
      if (plain && n.type === "TEXT" && n.characters.length && n.characters.length <= 1e5) {
        const segments = n.getStyledTextSegments(["fontName", "fontSize", "fills", "letterSpacing", "lineHeight", "textDecoration", "textCase"]);
        const styles = segments.map(exportStyle);
        if (styles.every(Boolean) && segments.every((s) => s.textCase === "ORIGINAL" && s.fills.every((p) => {
          var _a2;
          return p.type !== "SOLID" || ((_a2 = p.opacity) != null ? _a2 : 1) === 1;
        }))) {
          layer.opacity = n.opacity;
          layer.text = {
            text: n.characters.replace(/\n/g, "\r"),
            transform: [tr[0][0], 0, 0, tr[1][1], tr[0][2] - x, tr[1][2] - y],
            shapeType: "box",
            boxBounds: [0, 0, n.width, n.height],
            style: styles[0],
            styleRuns: segments.map((s, i) => ({ length: s.end - s.start, style: styles[i] })),
            paragraphStyle: { justification: n.textAlignHorizontal.toLowerCase() }
          };
          notes.push(n.name + ": editable text; check fonts, baseline and wrapping in Photoshop.");
        }
      }
      if (plain && ["RECTANGLE", "ELLIPSE"].includes(n.type) && "fills" in n && Array.isArray(n.fills)) {
        const fills = n.fills.filter((p) => p.visible !== false);
        const square = n.type !== "RECTANGLE" || "cornerRadius" in n && n.cornerRadius === 0;
        if (square && fills.length === 1 && fills[0].type === "SOLID") {
          const p = fills[0], l = b.x - x, t = b.y - y, w = b.width, h = b.height, k = 0.5522847498;
          let knots;
          if (n.type === "RECTANGLE") knots = [[l, t], [l + w, t], [l + w, t + h], [l, t + h]].map((a) => [...a, ...a, ...a]);
          else knots = [[l + w / 2 - k * w / 2, t, l + w / 2, t, l + w / 2 + k * w / 2, t], [l + w, t + h / 2 - k * h / 2, l + w, t + h / 2, l + w, t + h / 2 + k * h / 2], [l + w / 2 + k * w / 2, t + h, l + w / 2, t + h, l + w / 2 - k * w / 2, t + h], [l, t + h / 2 + k * h / 2, l, t + h / 2, l, t + h / 2 - k * h / 2]];
          layer.vectorFill = { type: "color", color: { r: Math.round(p.color.r * 255), g: Math.round(p.color.g * 255), b: Math.round(p.color.b * 255) } };
          layer.vectorMask = { paths: [{ open: false, operation: "combine", fillRule: "non-zero", knots: knots.map((points) => ({ linked: false, points })) }] };
          layer.opacity = ("opacity" in n ? n.opacity : 1) * ((_a = p.opacity) != null ? _a : 1);
        }
      }
      if (!layer.text && !layer.vectorFill) notes.push(layer.name + ": raster fallback" + (children.length ? " (group appearance preserved as one layer)." : "."));
      if (layer.text || layer.vectorFill) layer.editable = true;
      entries.push({ node: n, layer, background });
    }
    walk(root, "root", 0);
    psdExport = { root, entries, notes, width, height, x, y };
    return { width, height, name: root.name, layers: entries.length, notes };
  }
  async function getPsdExportLayer(index) {
    if (!psdExport) throw Error("Start an export first.");
    if (index === -1) {
      const png = await psdExport.root.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 }, useAbsoluteBounds: true, contentsOnly: true });
      return { png: Array.from(png) };
    }
    const e = psdExport.entries[index];
    if (!e) throw Error("Invalid export layer.");
    if (e.layer.group) return { layer: e.layer };
    const clone = e.node.clone();
    try {
      figma.currentPage.appendChild(clone);
      clone.relativeTransform = e.node.absoluteTransform;
      clone.visible = true;
      if ("blendMode" in clone && clone.blendMode !== "PASS_THROUGH") clone.blendMode = "NORMAL";
      if (e.layer.editable && "opacity" in clone) clone.opacity = 1;
      if (e.layer.vectorFill && "fills" in clone && Array.isArray(clone.fills)) clone.fills = clone.fills.map((p) => __spreadProps(__spreadValues({}, p), { opacity: 1 }));
      if (e.background && "children" in clone) for (const child of [...clone.children]) child.remove();
      const bytes = await clone.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 }, useAbsoluteBounds: true, contentsOnly: true });
      if (bytes.length > 20 * 1048576) throw Error("An exported PNG exceeds 20 MB.");
      return { layer: e.layer, png: Array.from(bytes) };
    } finally {
      clone.remove();
    }
  }
  figma.ui.onmessage = async (m) => {
    if (busy) return;
    busy = true;
    try {
      if (m.type === "export-start") {
        psdExport = void 0;
        send(__spreadValues({ type: "export-meta", job: m.job }, await startPsdExport()));
      } else if (m.type === "export-layer") {
        send(__spreadValues({ type: "export-layer", job: m.job }, await getPsdExportLayer(m.index)));
      } else if (m.type === "export-end") {
        psdExport = void 0;
        send({ type: "ack", job: m.job });
      } else if (m.type === "begin") {
        if (active) throw Error("Finish the current import first.");
        dimensions(m.width, m.height);
        const root = figma.createFrame();
        root.name = String(m.name || "PSD").slice(0, 300);
        root.resize(m.width, m.height);
        root.fills = [];
        root.clipsContent = true;
        const previous = figma.currentPage.children.filter((n) => n.id !== root.id);
        root.x = previous.length ? Math.max(...previous.map((n) => n.x + n.width)) + 100 : figma.viewport.center.x - m.width / 2;
        root.y = previous.length ? Math.min(...previous.map((n) => n.y)) : figma.viewport.center.y - m.height / 2;
        active = { root, parents: /* @__PURE__ */ new Map([["root", root]]), id: m.job, count: 0, notes: [], stats: { text: 0, shape: 0, raster: 0 }, clipParents: /* @__PURE__ */ new Map(), substituted: /* @__PURE__ */ new Set() };
        send({ type: "ack", job: m.job });
      } else if (active && m.job === active.id) {
        if (m.type === "item") {
          await append(m.item);
          send({ type: "ack", job: m.job });
        }
        if (m.type === "abort") {
          discard();
          send({ type: "aborted", job: m.job });
        }
        if (m.type === "finish") {
          const { root, notes, count, stats } = active;
          root.setRelaunchData({ [COMMAND]: "Import another PSD" });
          root.setPluginData("psd-import-report", JSON.stringify(notes));
          figma.currentPage.selection = [root];
          figma.viewport.scrollAndZoomIntoView([root]);
          active = void 0;
          figma.commitUndo();
          send({ type: "done", job: m.job, notes, count, stats });
        }
      }
    } catch (e) {
      if (String(m.type).startsWith("export-")) {
        psdExport = void 0;
        send({ type: "error", job: m.job, message: e instanceof Error ? e.message : "PSD export failed." });
        return;
      }
      const job = (active == null ? void 0 : active.id) || m.job;
      discard();
      send({ type: "error", job, message: userError(e) });
    } finally {
      busy = false;
    }
  };
})();
