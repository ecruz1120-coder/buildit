import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

function noise(g: CanvasRenderingContext2D, s: number, alpha: number, seed = 7) {
  let a = seed;
  for (let i = 0; i < s * s * 0.35; i++) {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    const x = a % s; const y = (a >> 8) % s;
    g.fillStyle = (a & 1) ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    g.fillRect(x, y, 1, 1);
  }
}

export const tileTex = (base: string, line: string) => canvasTex(`tile${base}${line}`, 32, (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  noise(g, s, 0.05);
  g.fillStyle = line; g.fillRect(0, 0, s, 1); g.fillRect(0, 0, 1, s);
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(1, 1, s - 2, 1);
});

export const pavingTex = () => canvasTex('paving', 32, (g, s) => {
  g.fillStyle = '#4a4f5a'; g.fillRect(0, 0, s, s);
  noise(g, s, 0.08, 3);
  g.fillStyle = '#383c45';
  g.fillRect(0, 0, s, 1); g.fillRect(0, 16, s, 1); g.fillRect(0, 0, 1, 16); g.fillRect(16, 16, 1, 16);
});

export const grassTex = () => canvasTex('grass', 32, (g, s) => {
  g.fillStyle = '#2f5a4a'; g.fillRect(0, 0, s, s);
  let a = 11;
  for (let i = 0; i < 160; i++) {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    g.fillStyle = ['#3a6d58', '#274c3e', '#46806a'][a % 3];
    g.fillRect(a % s, (a >> 7) % s, 1, 2);
  }
});

export const woodTex = () => canvasTex('wood', 32, (g, s) => {
  g.fillStyle = '#6b4a36'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 4) { g.fillStyle = y % 8 ? '#5e4130' : '#77543e'; g.fillRect(0, y, s, 1); }
  noise(g, s, 0.05, 5);
});

export const wallTex = (base: string) => canvasTex(`wall${base}`, 32, (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  noise(g, s, 0.04, 9);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, s - 3, s, 3);
  g.fillStyle = 'rgba(255,255,255,0.05)'; for (let x = 0; x < s; x += 8) g.fillRect(x, 0, 1, s - 3);
});

export const screenTex = (lines: number) => canvasTex(`screen${lines}`, 64, (g, s) => {
  g.fillStyle = '#0b2a33'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < lines; i++) { g.fillStyle = i % 3 ? '#4fd6e0' : '#9ff4ff'; g.fillRect(6, 8 + i * 8, 20 + ((i * 17) % 34), 3); }
});
