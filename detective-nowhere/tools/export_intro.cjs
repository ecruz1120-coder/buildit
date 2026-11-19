/**
 * Renders the opening cinematic to MP4, frame-exact, with its synthesized score.
 * Requires the dev server (npm run dev) on http://localhost:5173 and ffmpeg.
 * Usage: node tools/export_intro.cjs <out.mp4> [fps=24] [width=1280] [height=720]
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
(async () => {
  const out = path.resolve(process.argv[2] || 'opening.mp4');
  const fps = Number(process.argv[3] || 24), W = Number(process.argv[4] || 1280), H = Number(process.argv[5] || 720);
  const work = fs.mkdtempSync(path.join(path.dirname(out), '.frames-'));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.goto(process.env.URL || 'http://localhost:5173/');
  await p.waitForFunction(() => window.__game && window.__game.world && window.__game.world.ready, null, { timeout: 60000 });
  // audio first
  const b64 = await p.evaluate(async () => {
    const buf = new Uint8Array(await window.__game.renderScoreWav());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  fs.writeFileSync(path.join(work, 'score.wav'), Buffer.from(b64, 'base64'));
  await p.evaluate(() => { const g = window.__game; g.intro.fixedTime = 0; g.playIntro(() => {}); });
  await p.waitForTimeout(3000); // let textures (planet) load
  const length = await p.evaluate(() => window.__game.introLength);
  const total = Math.round(length * fps);
  for (let i = 0; i < total; i++) {
    await p.evaluate((t) => new Promise((r) => { window.__game.intro.fixedTime = t; requestAnimationFrame(() => requestAnimationFrame(r)); }), i / fps);
    await p.screenshot({ path: path.join(work, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (i % 120 === 0) console.log(`frame ${i}/${total}`);
  }
  await b.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(work, 'f%05d.jpg'), '-i', path.join(work, 'score.wav'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
  fs.rmSync(work, { recursive: true, force: true });
  console.log('wrote', out);
})();
