(function (root) {
  'use strict';
  const pigments = [
    { name: '红色', rgb: [231, 64, 83] }, { name: '黄色', rgb: [244, 195, 47] },
    { name: '蓝色', rgb: [52, 111, 219] }, { name: '粉色', rgb: [231, 119, 171] },
    { name: '绿色', rgb: [52, 168, 110] }, { name: '青色', rgb: [52, 171, 184] },
    { name: '紫色', rgb: [148, 96, 196] },
  ];
  const CAPACITY = 100, FILL = 38;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const lerp = (a, b, x) => a + (b - a) * x;
  const color = (a, b, x) => a.map((c, i) => lerp(c, b[i], x));
  const css = (rgb, alpha = 1) => `rgba(${rgb.map(c => Math.round(clamp(c, 0, 255))).join(',')},${alpha})`;
  const empty = () => pigments.map(() => 0);
  const fill = (id) => empty().map((_, i) => i === id ? FILL : 0);
  const volume = (parts) => parts.reduce((a, b) => a + b, 0);
  const pairColors = { '0,1': [239, 123, 43], '0,2': [148, 69, 183], '1,2': [51, 159, 91], '1,5': [124, 188, 79], '2,4': [40, 143, 150], '0,4': [145, 109, 75], '1,6': [155, 126, 102], '0,5': [147, 117, 123] };
  function nameColor([r,g,b]) {
    const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    if (d < 25) return max > 170 ? '浅灰色' : '灰褐色';
    const raw = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d;
    const h = (raw * 60 + 360) % 360;
    if (d < 80 && h < 63 && max < 185) return '棕色';
    if (h < 14 || h >= 342) return r > 194 && g > 93 ? '珊瑚红' : '红色';
    if (h < 41) return '橙色';
    if (h < 68) return '黄色';
    if (h < 98) return '黄绿色';
    if (h < 160) return '绿色';
    if (h < 199) return '青色';
    if (h < 251) return '蓝色';
    if (h < 300) return '紫色';
    return max > 195 && min > 88 ? '粉色' : '玫紫色';
  }
  function describe(parts) {
    const total = volume(parts);
    if (!total) return { name: '空杯', rgb: [148, 174, 161] };
    const weights = parts.map(p => p / total);
    const single = weights.findIndex(w => w > .999999);
    if (single >= 0) return pigments[single];
    const rgb = pigments.reduce((acc, p, i) => acc.map((n, k) => n + weights[i] * p.rgb[k]), [0,0,0]);
    // Calibrated teaching colors, weighted by pigment proportions rather than repeated RGB averaging.
    for (const [pair, mix] of Object.entries(pairColors)) {
      const [a,b] = pair.split(',').map(Number);
      for (let k = 0; k < 3; k++) rgb[k] += 4 * weights[a] * weights[b] * (mix[k] - (pigments[a].rgb[k] + pigments[b].rgb[k]) / 2);
    }
    return { name: nameColor(rgb), rgb };
  }
  function transfer(from, to) {
    const source = volume(from), amount = Math.min(source, Math.max(0, CAPACITY - volume(to)));
    if (amount < .000001) return null;
    const ratio = amount / source;
    return { amount, rest: from.map(p => p * (1 - ratio)), combined: to.map((p, i) => p + from[i] * ratio) };
  }
  const api = { pigments, CAPACITY, FILL, clamp, lerp, color, css, empty, fill, volume, describe, transfer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ColorModel = api;
})(globalThis);
