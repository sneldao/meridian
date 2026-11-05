/* MeridianSky — the whole stage as one painted scene (docs/FLIGHT.md).
 *  One canvas, one fragment pass: sky gradient, hash star field, FBM cloud
 *  cover (=owedMin), horizon beam, terrain ridge, the sun and its halo, and
 *  the route arc. Demand-drawn: repaints on model ticks and input — pointer
 *  pans the camera through a bounded lerp burst (the pulse pattern, never an
 *  ambient loop). DPR capped at 1.5 per the fullscreen-backdrop playbook;
 *  reduced-motion callers keep the CSS stack and never construct this. */

export interface MeridianSkyState {
  /** Sky stops (rgb 0..1): zenith, mid-band, horizon beam. */
  top: [number, number, number];
  mid: [number, number, number];
  hor: [number, number, number];
  /** Horizon band height as a fraction of the stage (stage-horizon-h). */
  horizonH: number;
  /** Star-field opacity (starFade of body altitude). */
  stars: number;
  /** Cloud cover 0..1 — the owed-sleep weather (owedMin normalised). */
  cover: number;
  /** Sun: position (y-up, 0..1), radius as height fraction, colour. */
  sun: { x: number; y: number; r: number; color: [number, number, number] };
  /** Route arc on the horizon: two endpoints + coverage marker t. */
  arc: {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    t: number;
    /** Day markers along the route (≤8), lit by how locked that day is. */
    markers?: { t: number; lit: number }[];
  } | null;
  /** The crew ahead — arc fractions (0..1) for state-lit scout markers. */
  scouts?: number[];
  /** Camera push-in about the sun (1 = none) — the next room's beat. */
  zoom?: number;
  /** 0..1 — lights the glass disc where no DOM SunSelf rides it (rooms). */
  sunLit?: number;
  /** 0..1 — pointer magnetism: how far the hand may pull the sun and arc
   *  (SkyKey.magnet). 0/absent = the model holds; the stage stays 0. */
  magnet?: number;
  /** Held flyover frame (0..1 of the scout's run toward the sun). Absent =
   *  the burst controls the uniform; set = the keyframe holds a frame. */
  streak?: number;
}

export interface MeridianSkyRenderer {
  paint(state: MeridianSkyState): void;
  /** Input-caused camera pan — a bounded lerp burst, then rest. Also the
   *  pointer's pull on the sun and arc: the same vector feeds u_mag. */
  pan(x: number, y: number): void;
  /** The scout flyover — one ember streaks from the route's end toward the
   *  sun, a bounded lerp burst (~80 frames) then off. Input-caused only:
   *  FeedWorld calls it when the located room changes. */
  streak(): void;
  setVisible(v: boolean): void;
  draw(): void;
  dispose(): void;
}

const VS = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FS = `precision mediump float;
uniform vec2 u_res;
uniform vec3 u_top,u_mid,u_hor;
uniform float u_horH,u_stars,u_cover;
uniform vec2 u_pan;
uniform vec3 u_sunCol;
uniform vec2 u_sun;
uniform float u_sunR;
uniform vec4 u_arc;   /* ax ay bx by */
uniform float u_arcT, u_arcOn;
uniform float u_markT[8];
uniform float u_markLit[8];
uniform float u_scouts[6];
uniform float u_drift;
uniform float u_zoom, u_sunLit;
uniform vec2 u_mag;
uniform float u_magnetOn;
uniform float u_streakP, u_streakOn;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
             mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){return .5*noise(p)+.3*noise(p*2.1)+.2*noise(p*4.3);}

/* The scene without the sun — everything the glass refracts: sky, stars,
   weather, terrain. One function so the disc can re-sample it at bent
   coordinates — the glass repo's core trick finally has an environment. */
vec3 scene(vec2 uv, vec2 puv, float asp){
  vec3 col=mix(u_mid,u_top,smoothstep(0.3,1.,puv.y));
  float bdy=(puv.y-u_horH)*6.;
  float band=exp(-bdy*bdy);
  col=mix(col,u_hor,band*0.5);
  col+=u_hor*0.18*exp(-abs(puv.y-u_horH)*18.);

  vec2 sp=floor((puv+u_pan*0.01)*u_res/2.4);
  float st=step(0.9975,hash(sp))*smoothstep(0.5,0.85,puv.y);
  col+=st*u_stars;

  float cd=fbm(puv*vec2(3.,2.)+vec2(u_drift*0.03,0.));
  float cm=smoothstep(1.-u_cover*0.85,1.-u_cover*0.85+0.22,cd)
          *(1.-smoothstep(u_horH+0.05,0.6,puv.y))
          *smoothstep(u_horH-0.08,u_horH+0.02,puv.y);
  col=mix(col,u_mid*0.6,cm*0.6);

  vec2 ruv=uv+u_pan*vec2(0.05,0.);
  float rid=u_horH-0.10-0.05*noise(vec2(ruv.x*6.));
  col=mix(u_top*0.55,col,smoothstep(rid,rid+0.004,uv.y));
  col+=u_hor*0.25*exp(-abs(uv.y-rid)*40.)*(1.-step(uv.y,rid-0.01));
  return col;
}

void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  /* the push-in — every sample scales about the sun's position */
  uv=u_sun+(uv-u_sun)/max(u_zoom,0.0001);
  float asp=u_res.x/u_res.y;
  vec2 puv=uv+u_pan*vec2(0.015,0.008);
  vec3 col=scene(uv,puv,asp);

  /* pointer magnetism — the hand leans the sun and the arc by a small,
     keyframed share. The zoom anchor stays modeled: the push-in never
     chases the pointer. */
  vec2 sunPos=u_sun+u_mag*vec2(0.035,0.02)*u_magnetOn;
  vec2 aOff=u_mag*vec2(0.02,0.011)*u_magnetOn;

  /* sun: halo + a glass body that refracts the scene behind it.
     Beer–Lambert tint by path length — edges warm to amber, the heart
     stays clear; a chamfer rim catches the beam; the joint highlight is
     the repo's faceted-rim trick. */
  float d=length((uv-sunPos+u_pan*vec2(0.01,0.005))*vec2(asp,1.));
  col+=u_sunCol*exp(-d*6.)*0.55;
  float inDisc=1.-smoothstep(u_sunR*0.92,u_sunR,d);
  vec2 nrm=(uv-sunPos)/max(u_sunR,0.0001)*vec2(asp,1.);
  vec2 bent=normalize(nrm+vec2(0.0001))*pow(clamp(1.-d/u_sunR,0.,1.),1.5)*0.05;
  vec3 back=scene(uv-bent,puv-bent,asp);
  float thick=clamp(1.-d/u_sunR,0.,1.);
  vec3 glass=back*mix(vec3(1.),u_sunCol,0.25+0.35*thick);
  /* faceted rim — a lit chamfer ring where the glass is thickest */
  float rim=smoothstep(u_sunR*0.82,u_sunR*0.96,d)*(1.-smoothstep(u_sunR*0.96,u_sunR,d));
  glass+=u_sunCol*rim*0.7;
  /* joint highlight — the bright arc where dome meets facet, upper-left */
  float hl=smoothstep(0.65,0.9,-nrm.y)*smoothstep(u_sunR*0.4,u_sunR*0.85,d)*(1.-smoothstep(u_sunR*0.85,u_sunR,d));
  glass+=vec3(1.,0.95,0.85)*hl*0.25;
  /* rooms carry no DOM SunSelf over the disc — the glass lights itself */
  glass=mix(glass,u_sunCol*(0.78+0.22*thick)+vec3(0.12,0.08,0.04)*hl,u_sunLit);
  col=mix(col,glass,inDisc);

  /* the route on the horizon — leaning a touch under the same hand */
  float arcOn=u_arcOn;
  vec2 a=u_arc.xy+aOff,b=u_arc.zw+aOff;
  vec2 pa=uv-a, ba=b-a;
  float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);
  float ad=length(pa-ba*h)*asp;
  col+=u_hor*arcOn*(1.-smoothstep(0.001,0.003,ad))*0.35;
  vec2 mk=mix(a,b,u_arcT);
  float md=length((uv-mk)*vec2(asp,1.));
  col+=u_sunCol*arcOn*(1.-smoothstep(0.005,0.014,md))*0.8;

  /* the days on the route — dim horizon where unplaced, sunlit where locked */
  for(int i=0;i<8;i++){
    float mt=u_markT[i];
    vec2 mp=mix(a,b,mt);
    float mdd=length((uv-mp)*vec2(asp,1.));
    col+=mix(u_hor*0.6,u_sunCol,u_markLit[i])*arcOn*step(0.,mt)
        *(1.-smoothstep(0.004,0.009,mdd))*0.9;
  }

  /* the crew ahead — state-lit ember points riding the route */
  for(int i=0;i<6;i++){
    float sc=u_scouts[i];
    vec2 sp2=mix(a,b,sc);
    float sd=length((uv-sp2)*vec2(asp,1.));
    col+=vec3(0.98,0.85,0.6)*arcOn*step(0.,sc)
        *(1.-smoothstep(0.003,0.008,sd))*0.9
        +vec3(0.98,0.85,0.6)*arcOn*step(0.,sc)*exp(-sd*60.)*0.3;
  }

  /* the scout flyover — one ember with a short tail running from the
     route's end (or the frame's far corner when no arc rides) toward the
     sun. A bounded burst feeds u_streakP; u_streakOn gates it. */
  vec2 sfrom=u_arc.zw+aOff+u_arcOn*vec2(0.15,0.06);
  vec2 sdir=u_sun-sfrom;
  float slen=max(length(sdir),0.0001);
  vec2 sn=sdir/slen;
  vec2 shead=sfrom+sdir*u_streakP;
  float shd=length((uv-shead)*vec2(asp,1.));
  vec2 stail=shead-sn*0.10;
  vec2 tp=uv-stail, tb=shead-stail;
  float th=clamp(dot(tp,tb)/max(dot(tb,tb),0.00001),0.,1.);
  float tdist=length(tp-tb*th)*asp;
  col+=vec3(0.98,0.85,0.6)*u_streakOn*(
      (1.-smoothstep(0.003,0.008,shd))*0.9
      +exp(-shd*60.)*0.35
      +(1.-smoothstep(0.0015,0.004,tdist))*th*0.4);

  gl_FragColor=vec4(col,1.);
}`;

interface U {
  [k: string]: WebGLUniformLocation | null;
}

/* "rgb(r, g, b)" / "rgba(r, g, b, a)" → 0..1 channels, for feeding the scene
   the same colours the DOM stack writes as custom properties. */
export function cssRgb(raw: string | undefined, dflt: [number, number, number]): [number, number, number] {
  const m = raw?.match(/rgba?\(([^)]+)\)/);
  if (!m) return dflt;
  const p = m[1].split(",").map((x) => parseFloat(x));
  return [p[0] / 255, p[1] / 255, p[2] / 255];
}

export function meridianSkyRenderer(
  canvas: HTMLCanvasElement,
  cb?: { onContextLost?: () => void },
): MeridianSkyRenderer | null {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
  if (!gl) { canvas.dataset.sky = "no-ctx"; return null; }
  const ctx = gl;

  const compile = (type: number, src: string) => {
    const s = ctx.createShader(type)!;
    ctx.shaderSource(s, src);
    ctx.compileShader(s);
    if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) {
      canvas.dataset.sky = `compile-${type === ctx.VERTEX_SHADER ? "vs" : "fs"}:${ctx.getShaderInfoLog(s)?.slice(0, 140)}`;
    }
    return s;
  };
  const prog = ctx.createProgram()!;
  ctx.attachShader(prog, compile(ctx.VERTEX_SHADER, VS));
  ctx.attachShader(prog, compile(ctx.FRAGMENT_SHADER, FS));
  ctx.linkProgram(prog);
  if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) {
    canvas.dataset.sky = `link-fail:${ctx.getProgramInfoLog(prog)?.slice(0, 120)}`;
    return null;
  }
  canvas.dataset.sky = "live";
  ctx.useProgram(prog);

  const buf = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
  const loc = ctx.getAttribLocation(prog, "a");
  ctx.enableVertexAttribArray(loc);
  ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);

  const u: U = {};
  for (const n of [
    "u_res", "u_top", "u_mid", "u_hor", "u_horH", "u_stars", "u_cover",
    "u_pan", "u_sunCol", "u_sun", "u_sunR", "u_arc", "u_arcT", "u_arcOn", "u_drift",
    "u_zoom", "u_sunLit", "u_mag", "u_magnetOn", "u_streakP", "u_streakOn",
  ]) u[n] = ctx.getUniformLocation(prog, n);
  const uScouts: (WebGLUniformLocation | null)[] = [];
  for (let i = 0; i < 6; i++) uScouts.push(ctx.getUniformLocation(prog, `u_scouts[${i}]`));
  const uMarkT: (WebGLUniformLocation | null)[] = [];
  const uMarkLit: (WebGLUniformLocation | null)[] = [];
  for (let i = 0; i < 8; i++) {
    uMarkT.push(ctx.getUniformLocation(prog, `u_markT[${i}]`));
    uMarkLit.push(ctx.getUniformLocation(prog, `u_markLit[${i}]`));
  }

  let state: MeridianSkyState | null = null;
  let visible = true;
  let disposed = false;
  let raf = 0;
  const pan = { x: 0, y: 0 };
  let panTo = { x: 0, y: 0 };
  let panBurst = 0;
  let drift = 0;
  // Pointer magnetism — the same vector as the pan, gated per-room by
  // state.magnet, lerped in the same bounded burst.
  const mag = { x: 0, y: 0 };
  let magTo = { x: 0, y: 0 };
  // The scout flyover — an ~80-frame lerp from the route's end to the sun.
  let streakP = 0;
  let streakOn = 0;
  let streakLeft = 0;

  const canDraw = () => !disposed && visible && !document.hidden;

  function frame() {
    raf = 0;
    // Camera lerp — a bounded burst: ≤45 frames toward the pointer, then rest.
    pan.x += (panTo.x - pan.x) * 0.09;
    pan.y += (panTo.y - pan.y) * 0.09;
    mag.x += (magTo.x - mag.x) * 0.09;
    mag.y += (magTo.y - mag.y) * 0.09;
    if (streakLeft > 0) {
      streakP += (1 - streakP) * 0.08;
      if (--streakLeft <= 0) { streakOn = 0; streakP = 0; }
    }
    drift += 0.016;
    draw();
    if (--panBurst > 0 && canDraw()) raf = requestAnimationFrame(frame);
  }
  const queue = (burst: number) => {
    panBurst = Math.max(panBurst, burst);
    if (!raf && canDraw()) raf = requestAnimationFrame(frame);
  };

  function draw() {
    if (!canDraw() || !state) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(canvas.clientWidth * dpr) || 2;
    const h = Math.round(canvas.clientHeight * dpr) || 2;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.viewport(0, 0, w, h);
    ctx.uniform2f(u.u_res, w, h);
    ctx.uniform3fv(u.u_top, state.top);
    ctx.uniform3fv(u.u_mid, state.mid);
    ctx.uniform3fv(u.u_hor, state.hor);
    ctx.uniform1f(u.u_horH, state.horizonH);
    ctx.uniform1f(u.u_stars, state.stars);
    ctx.uniform1f(u.u_cover, state.cover);
    ctx.uniform2f(u.u_pan, pan.x, pan.y);
    ctx.uniform3fv(u.u_sunCol, state.sun.color);
    ctx.uniform2f(u.u_sun, state.sun.x, state.sun.y);
    ctx.uniform1f(u.u_sunR, state.sun.r);
    const a = state.arc;
    ctx.uniform4f(u.u_arc, a?.ax ?? 0, a?.ay ?? 0, a?.bx ?? 0, a?.by ?? 0);
    ctx.uniform1f(u.u_arcT, a?.t ?? 0);
    ctx.uniform1f(u.u_arcOn, a ? 1 : 0);
    for (let i = 0; i < 8; i++) {
      const m = a?.markers?.[i];
      ctx.uniform1f(uMarkT[i], m?.t ?? -1);
      ctx.uniform1f(uMarkLit[i], m?.lit ?? 0);
    }
    ctx.uniform1f(u.u_zoom, state.zoom ?? 1);
    ctx.uniform1f(u.u_sunLit, state.sunLit ?? 0);
    ctx.uniform2f(u.u_mag, mag.x, mag.y);
    ctx.uniform1f(u.u_magnetOn, state.magnet ?? 0);
    ctx.uniform1f(u.u_streakP, state.streak ?? streakP);
    ctx.uniform1f(u.u_streakOn, state.streak !== undefined ? 1 : streakOn);
    for (let i = 0; i < 6; i++) {
      ctx.uniform1f(uScouts[i], state.scouts?.[i] ?? -1);
    }
    ctx.uniform1f(u.u_drift, drift);
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
  }

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => draw()) : null;
  ro?.observe(canvas);
  const onLost = (e: Event) => { e.preventDefault(); cb?.onContextLost?.(); };
  canvas.addEventListener("webglcontextlost", onLost);

  /* The weather's own slow clock — round 53's legal drift: a 400ms tick
     advects the cloud field at a rate a person can see, at ~2.5 repaints
     a second — ambient life without an rAF loop. Only while visible. */
  const driftTimer = setInterval(() => {
    if (!canDraw()) return;
    drift += 0.4;
    draw();
  }, 400);

  return {
    paint(s) { state = s; draw(); },
    pan(x, y) { panTo = { x, y }; magTo = { x, y }; queue(45); },
    streak() { streakOn = 1; streakP = 0; streakLeft = 80; queue(82); },
    setVisible(v) { visible = v; if (v) draw(); },
    draw,
    dispose() {
      // Never loseContext() here — StrictMode dev remounts re-use the same
      // canvas element, and a destroyed context then links every later
      // program against a dead context (link-fail, white frame). The
      // context dies with the element on real unmount regardless.
      disposed = true;
      cancelAnimationFrame(raf);
      clearInterval(driftTimer);
      ro?.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
    },
  };
}
