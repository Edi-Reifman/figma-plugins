// ER Layouts — генератор артбордов с вылетами, безопасными и слепыми зонами
figma.showUI(__html__, { width: 460, height: 740, themeColors: true });

var KEY_CUSTOM = 'erl_custom_v1';
var KEY_PACKS = 'erl_packs_v1';
var KEY_SETTINGS = 'erl_settings_v1';

var C_TRIM = { r: 0, g: 0.72, b: 1 };      // линия реза
var C_SAFE = { r: 0.95, g: 0, b: 0.75 };   // безопасная зона
var C_ZONE = { r: 1, g: 0.18, b: 0.18 };   // слепые зоны
var C_BLEED = { r: 1, g: 0.55, b: 0 };     // вылеты
var C_LABEL = { r: 0.45, g: 0.45, b: 0.5 };

figma.ui.onmessage = async function (msg) {
  try {
    if (msg.type === 'init') {
      var custom = (await figma.clientStorage.getAsync(KEY_CUSTOM)) || [];
      var packs = (await figma.clientStorage.getAsync(KEY_PACKS)) || [];
      var settings = (await figma.clientStorage.getAsync(KEY_SETTINGS)) || {};
      figma.ui.postMessage({ type: 'data', custom: custom, packs: packs, settings: settings });
    } else if (msg.type === 'save') {
      if (msg.custom) await figma.clientStorage.setAsync(KEY_CUSTOM, msg.custom);
      if (msg.packs) await figma.clientStorage.setAsync(KEY_PACKS, msg.packs);
      if (msg.settings) await figma.clientStorage.setAsync(KEY_SETTINGS, msg.settings);
    } else if (msg.type === 'generate') {
      await generate(msg.items || [], msg.options || {});
    } else if (msg.type === 'guides') {
      setGuides(!!msg.visible);
    } else if (msg.type === 'notify') {
      figma.notify(msg.text, msg.error ? { error: true } : undefined);
    }
  } catch (e) {
    console.error(e);
    figma.notify('Ошибка: ' + (e && e.message ? e.message : String(e)), { error: true });
  }
};

function solid(c, o) {
  return [{ type: 'SOLID', color: c, opacity: o === undefined ? 1 : o }];
}

function scaleConstraints(n) {
  if ('constraints' in n) n.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
}

function rect(parent, name, x, y, w, h, fill, fillOp, stroke, sw, dash) {
  var r = figma.createRectangle();
  parent.appendChild(r);
  r.name = name;
  r.resize(Math.max(0.01, w), Math.max(0.01, h));
  r.x = x;
  r.y = y;
  r.fills = fill ? solid(fill, fillOp) : [];
  if (stroke) {
    r.strokes = solid(stroke);
    r.strokeWeight = sw || 1;
    r.strokeAlign = 'INSIDE';
    if (dash) r.dashPattern = dash;
  } else {
    r.strokes = [];
  }
  scaleConstraints(r);
  return r;
}

function text(parent, str, x, y, size, color, style) {
  var t = figma.createText();
  parent.appendChild(t);
  t.fontName = { family: 'Inter', style: style || 'Medium' };
  t.characters = str;
  t.fontSize = size;
  t.fills = solid(color);
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  t.x = x;
  t.y = y;
  return t;
}

function fmt(n) {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function sizeLabel(it) {
  var s = fmt(it.w) + '×' + fmt(it.h) + (it.unit === 'mm' ? ' мм' : '');
  if (it.bleed) s += ' +вылет ' + fmt(it.bleed) + (it.unit === 'mm' ? ' мм' : '');
  return s;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function buildFrame(it, dpi) {
  var k = it.unit === 'mm' ? (it.dpi || dpi || 72) / 25.4 : 1;
  var tw = Math.round(it.w * k);
  var th = Math.round(it.h * k);
  var b = Math.round((it.bleed || 0) * k);
  var s = Math.round((it.safe || 0) * k);
  var W = tw + 2 * b;
  var H = th + 2 * b;
  var sw = Math.max(1, Math.round(Math.min(tw, th) / 450));

  var f = figma.createFrame();
  f.name = it.name + ' · ' + sizeLabel(it);
  f.resize(W, H);
  f.fills = solid({ r: 1, g: 1, b: 1 });
  f.clipsContent = true;

  // Направляющие Figma (не попадают в экспорт)
  var g = [];
  if (b > 0) g.push({ axis: 'X', offset: b }, { axis: 'X', offset: b + tw }, { axis: 'Y', offset: b }, { axis: 'Y', offset: b + th });
  if (s > 0 && tw > 2 * s && th > 2 * s) g.push({ axis: 'X', offset: b + s }, { axis: 'X', offset: b + tw - s }, { axis: 'Y', offset: b + s }, { axis: 'Y', offset: b + th - s });
  f.guides = g;

  // Визуальная разметка — отдельный заблокированный слой _guides
  var ov = figma.createFrame();
  f.appendChild(ov);
  ov.name = '_guides';
  ov.resize(W, H);
  ov.x = 0;
  ov.y = 0;
  ov.fills = [];
  ov.clipsContent = false;
  scaleConstraints(ov);

  if (b > 0) {
    rect(ov, 'Вылет', 0, 0, W, b, C_BLEED, 0.18);
    rect(ov, 'Вылет', 0, H - b, W, b, C_BLEED, 0.18);
    rect(ov, 'Вылет', 0, b, b, th, C_BLEED, 0.18);
    rect(ov, 'Вылет', W - b, b, b, th, C_BLEED, 0.18);
    rect(ov, 'Линия реза', b, b, tw, th, null, 0, C_TRIM, sw);
  }
  if (s > 0 && tw > 2 * s && th > 2 * s) {
    rect(ov, 'Безопасная зона', b + s, b + s, tw - 2 * s, th - 2 * s, null, 0, C_SAFE, sw, [sw * 8, sw * 6]);
  }

  var zs = clamp(Math.round(Math.min(tw, th) / 34), 9, 64);
  var zones = it.zones || [];
  for (var i = 0; i < zones.length; i++) {
    var z = zones[i];
    var zx = b + (z.x / 100) * tw;
    var zy = b + (z.y / 100) * th;
    var zw = (z.w / 100) * tw;
    var zh = (z.h / 100) * th;
    rect(ov, '⛔ ' + (z.name || 'Слепая зона'), zx, zy, zw, zh, C_ZONE, 0.16, C_ZONE, sw, [sw * 4, sw * 4]);
    if (z.name) {
      var t = text(ov, z.name, zx + zs * 0.4, zy + zs * 0.3, zs, C_ZONE, 'Medium');
      t.name = 'подпись зоны';
      scaleConstraints(t);
    }
  }
  ov.locked = true;
  return f;
}

async function generate(items, opt) {
  if (!items.length) {
    figma.notify('Ничего не выбрано');
    return;
  }
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

  var dpi = opt.dpi || 72;
  var gap = opt.gap || 160;
  var showLabels = opt.labels !== false;
  var pad = 160;

  var frames = items.map(function (it) { return buildFrame(it, dpi); });

  var maxW = 0;
  frames.forEach(function (f) { if (f.width > maxW) maxW = f.width; });
  var rowLimit = Math.max(6000, maxW);

  // Раскладка по рядам
  var x = 0, y = 0, rowH = 0, totalW = 0;
  var placed = [];
  for (var i = 0; i < frames.length; i++) {
    var f = frames[i];
    var ls = clamp(Math.round(f.width / 22), 16, 120);
    var labelH = showLabels ? Math.round(ls * 1.3 + ls * 0.9) : 0;
    if (x > 0 && x + f.width > rowLimit) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    placed.push({ f: f, it: items[i], x: x, y: y, ls: ls, labelH: labelH });
    x += f.width + gap;
    totalW = Math.max(totalW, x - gap);
    rowH = Math.max(rowH, f.height + labelH);
  }
  var totalH = y + rowH;

  // Куда ставить: справа от существующего контента страницы
  var ox = Math.round(figma.viewport.center.x), oy = Math.round(figma.viewport.center.y);
  var maxX = -Infinity, minY = Infinity;
  figma.currentPage.children.forEach(function (n) {
    var bb = n.absoluteBoundingBox;
    if (bb) {
      maxX = Math.max(maxX, bb.x + bb.width);
      minY = Math.min(minY, bb.y);
    }
  });
  if (isFinite(maxX)) {
    ox = Math.round(maxX + 600);
    oy = Math.round(minY);
  }

  var container = null;
  var title = opt.title || 'Артборды — ' + new Date().toLocaleDateString('ru-RU');
  var useSection = typeof figma.createSection === 'function';
  var baseX = ox + pad, baseY = oy + pad;
  if (useSection) {
    container = figma.createSection();
    container.name = title;
    container.x = ox;
    container.y = oy;
    container.resizeWithoutConstraints(totalW + pad * 2, totalH + pad * 2);
    baseX = pad;
    baseY = pad;
  }

  placed.forEach(function (p) {
    if (container) container.appendChild(p.f);
    if (showLabels) {
      var parent = container || figma.currentPage;
      var t1 = text(parent, p.it.name, baseX + p.x, baseY + p.y, p.ls, { r: 0.1, g: 0.1, b: 0.12 }, 'Medium');
      t1.name = 'Подпись: ' + p.it.name;
      var t2 = text(parent, sizeLabel(p.it) + (p.it.note ? '  ·  ' + p.it.note : ''), baseX + p.x, baseY + p.y + Math.round(p.ls * 1.3), Math.round(p.ls * 0.62), C_LABEL, 'Regular');
      t2.name = 'Размер: ' + p.it.name;
    }
    p.f.x = baseX + p.x;
    p.f.y = baseY + p.y + p.labelH;
  });

  figma.currentPage.selection = frames;
  figma.viewport.scrollAndZoomIntoView(container ? [container] : frames);
  figma.notify('Готово: ' + frames.length + ' ' + plural(frames.length, 'артборд', 'артборда', 'артбордов'));
}

function plural(n, a, b, c) {
  var m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return a;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b;
  return c;
}

function setGuides(visible) {
  var scope = figma.currentPage.selection.length ? figma.currentPage.selection : [figma.currentPage];
  var count = 0;
  scope.forEach(function (root) {
    if (root.name === '_guides' && root.type === 'FRAME') {
      root.visible = visible;
      count++;
    }
    if ('findAllWithCriteria' in root) {
      root.findAllWithCriteria({ types: ['FRAME'] }).forEach(function (n) {
        if (n.name === '_guides') {
          n.visible = visible;
          count++;
        }
      });
    }
  });
  figma.notify(count ? (visible ? 'Разметка показана' : 'Разметка скрыта — можно экспортировать') + ' (' + count + ')' : 'Слои разметки не найдены');
}
