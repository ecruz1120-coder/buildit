import { Game } from './game';
import { loadCedric } from './world/actors';
import './styles.css';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
(window as any).__game = game; // debug/testing hook

const overlay = document.getElementById('overlay')!;
overlay.classList.remove('hidden');
overlay.innerHTML = `<div class="screen"><h1>DETECTIVE NOWHERE</h1><h2>LOADING CEDRIC FARSIGHT V2…</h2><div class="loadbar"><i style="width:40%"></i></div></div>`;

async function boot() {
  const ok = await loadCedric(`${import.meta.env.BASE_URL}models/cedric.glb`);
  if (!ok) console.warn('Using stand-in Cedric');
  game.initWorld();
  game.showTitle();
  let last = performance.now();
  const loop = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    game.frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
boot();
