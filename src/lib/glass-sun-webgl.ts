/* The glass sun's WebGL1 lens — an original lightweight enhancement over
 * the SVG fallback: analytic oblate-disc normals and thickness, one
 * refract call per channel (small RGB IOR spread), Beer-Lambert
 * attenuation on path length, a Fresnel edge and an off-axis softbox
 * glint, and the procedural horizon + graticule sampled through the lens.
 * NO external textures, no Three, no DOM sampling — the environment is
 * procedural and honest. Demand-draw only: no ambient rAF. */

import type { SunSelfRead } from "@/domain/sun-self";
import { glassParams } from "./glass-sun";

const VS = `attribute vec2 p;varying vec2 v;void main(){v=p*0.5+0.5;v.y=1.0-v.y;gl_Position=vec4(p,0.,1.);}`;

/* uv domain: disc is R=.84 of the unit half-box → at a 300px canvas the
   disc is a 210px diameter, matching the SVG body at r=42/120. Ticks sit
   just outside the rim (max ~1.04); alpha is 0 outside except thin ticks
   and the faint bloom bleed. The material is clear glass over a cool dark
   field (bgc) — warm tint lives at the rim and horizon, never a uniform
   opaque sphere. */
const FS = `precision mediump float;varying vec2 v;
uniform float debt,core,rough,disp,ang,lit,count,bloom,pulse,px,py;
uniform vec3 tint,spec,bgc;
float sat(float x){return clamp(x,0.,1.);}
vec2 rot(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(c*p.x-s*p.y,s*p.x+c*p.y);}
vec3 environment(vec2 p){
 float horizon=exp(-22.0*abs(p.y+0.16));
 float gx=1.0-smoothstep(0.0,0.018,abs(fract(p.x*2.2)-0.5));
 float gy=1.0-smoothstep(0.0,0.018,abs(fract(p.y*2.2)-0.5));
 return bgc*mix(0.75,1.9,sat(0.5-p.y))
   +tint*horizon*(0.25+0.45*core)+spec*(gx+gy)*0.045;
}
/* Ported from phileeppov/glass (MIT): a ray entering the slab with normal n3
   refracts and lands on the floor — TIR-safe, with a z floor, replacing the
   unbounded rd.xy*path march. */
vec2 throughSlab(vec3 n3,float ior,float h){
  vec3 t=refract(vec3(0.,0.,-1.),n3,1.0/max(ior,1.02));
  if(t==vec3(0.)) return vec2(0.);
  return -t.xy*(h/max(-t.z,0.05));
}
void main(){
 vec2 uv=(v-0.5)*2.4;
 float r=length(uv);
 float R=0.84;
 if(r>1.06){gl_FragColor=vec4(0.);return;}
 float t=sqrt(max(0.,R*R-r*r));
 float disc=1.0-smoothstep(R-0.02,R,r);
 float tick=0.;
 if(r>R+0.005 && count>0.5){
   float a=fract(atan(uv.y,uv.x)/6.2831853+1.0);
   float seg=fract(a*count);
   float idx=floor(a*count);
   tick=step(0.44,seg)*step(seg,0.56)*step(R,r)*step(r,1.04);
   tick*= (idx<lit)?0.9:0.16;
 }
 vec3 col=vec3(0.);
 float alpha=0.;
 if(disc>0.0){
   vec3 n=normalize(vec3(uv,t*1.15));
   float path=2.0*t;
   /* Faceted rim (ported concept from phileeppov/glass): near the edge the
      dome's normal blends toward a fixed chamfer — the rim stops refracting
      like a lens and starts reading as cut glass, with a bright joint line
      where dome and facet meet. */
   float facetBand=smoothstep(R-0.13,R-0.02,r)*disc;
   n=normalize(mix(n,normalize(vec3(uv*0.55,t*1.6)),facetBand*0.85));
   // Sample the same light field at three wavelength-dependent exit points.
   vec3 refr=vec3(0.);
   for(int i=0;i<3;i++){
     float ior=1.45+disp*float(i-1);
     vec2 exitPoint=rot(uv+throughSlab(n,ior,path*0.5),ang);
     refr[i]=environment(exitPoint)[i];
   }
   float joint=(1.0-smoothstep(0.0,0.012,abs(r-(R-0.075))))*disc;
   refr+=joint*spec*0.16;
   float att=exp(-path*(0.08+rough*0.7));
   col=refr*att;
   // Fresnel: bright only right at the rim, inside the disc
   float fr=pow(1.0-max(0.0,n.z),2.6)*0.85*disc;
   col+=fr*spec;
   col.r+=fr*disp*8.;col.b+=fr*disp*10.;
   // off-axis softbox: a thin sharp crescent, not a flood
   vec2 g=uv-vec2(-0.30,-0.36);
   col+=disc*exp(-dot(g,g)*60.)*0.9*spec;
   // pointer local highlight
   vec2 h=uv-vec2(px*2.4-1.2,py*2.4-1.2);
   col+=disc*exp(-dot(h,h)*9.)*0.22*spec*step(-9.0,px);
   // pulse: one soft brightening ring after a tap
   float ring=(1.0-smoothstep(0.0,0.06,abs(r-pulse*1.6)))*0.35*step(0.001,pulse);
   col+=disc*ring*spec;
   alpha=disc*sat(path*1.5+0.15)+fr;
   alpha+=(1.0-disc)*exp(-(r-R)*(10.0/(0.3+bloom)))*0.4;
   col+=(1.0-disc)*tint*exp(-(r-R)*(10.0/(0.3+bloom)))*0.5;
 }
 col+=tick*mix(tint*0.3,vec3(1.0,0.75,0.45),0.8);
 alpha=max(alpha,tick);
 col=mix(col,col*vec3(0.8,0.76,0.78),debt*0.35);
 gl_FragColor=vec4(col,sat(alpha));
}`;

export interface GlassRenderer {
  update(read: SunSelfRead): void;
  pointer(pt: { x: number; y: number } | null): void;
  pulse(): void;
  setVisible(v: boolean): void;
  draw(): void;
  dispose(): void;
}

export interface GlassRendererCallbacks {
  onContextLost?: () => void;
  onFirstDraw?: () => void;
}

function parseColor(raw: string, dflt: [number, number, number]): [number, number, number] {
  const hex = raw.match(/#([0-9a-f]{6})/i);
  if (hex) {
    const h = parseInt(hex[1], 16);
    return [(h >> 16) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  }
  const rgb = raw.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const p = rgb[1].split(",").map((x) => parseFloat(x));
    return [p[0] / 255, p[1] / 255, p[2] / 255];
  }
  return dflt;
}

export function glassSunRenderer(
  canvas: HTMLCanvasElement,
  initial: SunSelfRead,
  wrap?: HTMLElement | null,
  cb?: GlassRendererCallbacks,
): GlassRenderer | null {
  let gl: WebGLRenderingContext | null = null;
  let vs: WebGLShader | null = null;
  let fs: WebGLShader | null = null;
  let prog: WebGLProgram | null = null;
  let buf: WebGLBuffer | null = null;
  let disposed = false;
  let lost = false;

  const cleanup = () => {
    if (!gl) return;
    if (prog) gl.deleteProgram(prog);
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    if (buf) gl.deleteBuffer(buf);
    // Delete our resources without permanently losing a reusable canvas context.
    prog = vs = fs = buf = null;
    gl = null;
  };

  try {
    gl = (canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false }) ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  } catch {
    return null;
  }
  if (!gl) return null;

  const sh = (type: number, src: string): WebGLShader | null => {
    const s = gl!.createShader(type);
    if (!s) return null;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      gl!.deleteShader(s);
      return null;
    }
    return s;
  };

  vs = sh(gl.VERTEX_SHADER, VS);
  fs = sh(gl.FRAGMENT_SHADER, FS);
  prog = vs && fs ? gl.createProgram() : null;
  let ok = Boolean(prog);
  if (ok && prog) {
    gl.attachShader(prog, vs!);
    gl.attachShader(prog, fs!);
    gl.linkProgram(prog);
    ok = Boolean(gl.getProgramParameter(prog, gl.LINK_STATUS));
  }
  if (!ok || !prog) {
    cleanup(); // frees partial program + shaders + context
    return null;
  }
  const program = prog;
  const ctx = gl;

  ctx.useProgram(program);
  buf = ctx.createBuffer();
  if (!buf) { cleanup(); return null; }
  ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
  const loc = ctx.getAttribLocation(program, "p");
  if (loc < 0) { cleanup(); return null; }
  ctx.enableVertexAttribArray(loc);
  ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);
  const U = (n: string) => ctx.getUniformLocation(program, n);
  const u = {
    debt: U("debt"), core: U("core"), rough: U("rough"), disp: U("disp"),
    ang: U("ang"), lit: U("lit"), count: U("count"), bloom: U("bloom"),
    pulse: U("pulse"), px: U("px"), py: U("py"),
    tint: U("tint"), spec: U("spec"), bgc: U("bgc"),
  };

  let read = initial;
  let pt: { x: number; y: number } | null = null;
  let pulseStart: number | null = null;
  let pulseTimer: ReturnType<typeof setTimeout> | null = null;
  let drew = false;
  let visible = true;
  let raf = 0;

  const ro = typeof ResizeObserver !== "undefined" && wrap ? new ResizeObserver(() => draw()) : null;
  ro?.observe(wrap as HTMLElement);
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    cb?.onContextLost?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  /* Push the wrapper's CURRENT glass tokens every draw — tone/mood changes
     reach the GPU without recreating the context. */
  function pushColors() {
    const cs = wrap ? getComputedStyle(wrap) : null;
    ctx.uniform3fv(u.tint, parseColor(cs?.getPropertyValue("--glass-tint") ?? "", [0.91, 0.6, 0.44]));
    ctx.uniform3fv(u.spec, parseColor(cs?.getPropertyValue("--glass-spec") ?? "", [1, 0.97, 0.93]));
    ctx.uniform3fv(u.bgc, parseColor(cs?.getPropertyValue("--glass-bg") ?? "", [0.04, 0.05, 0.09]));
  }

  const canDraw = () => !lost && !disposed && !!ctx && visible && !document.hidden;

  const endPulse = () => {
    pulseStart = null;
    pulseTimer = null;
    draw(); // clean settle frame — fires even where rAF is throttled
  };
  function frame() {
    raf = 0;
    if (pulseStart !== null && performance.now() - pulseStart >= 300) {
      endPulse();
      return;
    }
    draw();
    // The pulse is one ≤300ms burst; the lens rests between draws.
    if (pulseStart !== null && canDraw()) {
      raf = requestAnimationFrame(frame);
    }
  }
  const queueFrame = () => {
    if (!raf && canDraw()) raf = requestAnimationFrame(frame);
  };

  function draw() {
    if (!canDraw()) return;
    // A draw that lands after the burst window always settles clean.
    if (pulseStart !== null && performance.now() - pulseStart >= 300) {
      pulseStart = null;
      if (pulseTimer) { clearTimeout(pulseTimer); pulseTimer = null; }
    }
    const p = glassParams(read);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(canvas.clientWidth * dpr) || 144;
    const h = Math.round(canvas.clientHeight * dpr) || 144;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.viewport(0, 0, w, h);
    pushColors();
    ctx.uniform1f(u.debt, p.debt);
    ctx.uniform1f(u.core, p.coreLight);
    ctx.uniform1f(u.rough, p.roughness);
    ctx.uniform1f(u.disp, p.dispersion);
    ctx.uniform1f(u.ang, p.angleRad);
    ctx.uniform1f(u.lit, p.raysLit);
    ctx.uniform1f(u.count, p.rayCount);
    ctx.uniform1f(u.bloom, p.bloom);
    ctx.uniform1f(u.pulse, pulseStart === null ? 0 : Math.min(1, (performance.now() - pulseStart) / 300));
    ctx.uniform1f(u.px, pt ? pt.x : -10);
    ctx.uniform1f(u.py, pt ? pt.y : -10);
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
    if (!drew) { drew = true; cb?.onFirstDraw?.(); }
  }

  return {
    update(r: SunSelfRead) { read = r; draw(); },
    pointer(p) { pt = p; draw(); },
    pulse() {
      pulseStart = performance.now();
      if (pulseTimer) clearTimeout(pulseTimer);
      // The settle is timer-backed, not rAF-only: a finite pulse must
      // leave identical pixels even where rAF is throttled (headless).
      pulseTimer = setTimeout(endPulse, 310);
      queueFrame();
    },
    setVisible(v: boolean) {
      visible = v;
      if (!v && raf) { cancelAnimationFrame(raf); raf = 0; }
      if (v) draw();
    },
    draw,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (pulseTimer) clearTimeout(pulseTimer);
      ro?.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      cleanup();
    },
  };
}
