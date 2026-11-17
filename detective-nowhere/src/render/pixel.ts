import * as THREE from 'three';

/**
 * Retro pixel pipeline: render the scene into a low-resolution target (nearest-filtered),
 * then a post pass that posterizes with ordered dithering (16/32-bit palette feel),
 * blends into the cyan HoloBand scan look, and adds a soft vignette.
 */
export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private rt: THREE.WebGLRenderTarget;
  private post: THREE.Mesh;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uScan: { value: 0 },
    uTime: { value: 0 },
    uLevels: { value: 28 },
    uDamage: { value: 0 },
  };
  pixelScale = 3;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.uniforms.tDiffuse.value = this.rt.texture;
    this.post = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `
          uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uScan; uniform float uTime; uniform float uLevels; uniform float uDamage;
          varying vec2 vUv;
          float bayer4(vec2 p){
            int x = int(mod(p.x,4.0)); int y = int(mod(p.y,4.0));
            int i = x + y*4;
            float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
            for(int k=0;k<16;k++){ if(k==i) return m[k]/16.0 - 0.5; }
            return 0.0;
          }
          void main(){
            vec2 px = floor(vUv * uRes);
            vec3 c = texture2D(tDiffuse, vUv).rgb;
            float d = bayer4(px);
            c = floor(c * uLevels + d + 0.5) / uLevels;
            float lum = dot(c, vec3(0.299,0.587,0.114));
            vec3 scan = vec3(0.10,0.55,0.62) * (0.35 + lum*1.25);
            float grid = step(0.94, fract(px.x/12.0)) + step(0.94, fract(px.y/12.0));
            scan += vec3(0.25,0.9,1.0) * grid * 0.12;
            scan += vec3(0.3,1.0,1.0) * step(0.985, fract(vUv.y*2.0 - uTime*0.35)) * 0.25;
            c = mix(c, scan, uScan);
            vec2 q = vUv - 0.5;
            c *= 1.0 - dot(q,q) * 0.35;
            c = mix(c, vec3(0.7,0.08,0.1), uDamage * (0.35 + dot(q,q)));
            gl_FragColor = vec4(c, 1.0);
          }`,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.postScene.add(this.post);
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    const lw = Math.max(2, Math.floor(w / this.pixelScale));
    const lh = Math.max(2, Math.floor(h / this.pixelScale));
    this.rt.setSize(lw, lh);
    this.uniforms.uRes.value.set(lw, lh);
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
