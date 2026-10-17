"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { bodySubsolarPoint, subsolarPoint, type SubsolarPoint } from "@/domain/sun";
import { GHOST_VISIBLE_MIN } from "@/domain/dawn-layers";
import { landGeometry, LAND_RADIUS, LAND_LIFT } from "@/lib/globe/land-geometry";
import { lonLatToVec3, sunDirection } from "@/lib/globe/spherical";

/**
 * The WebGL dawn globe — Tier 1 spike.
 *
 * The point of this component is not the picture, it is that the picture is
 * driven by the same solar model as the two SVG globes. `subsolarPoint` and
 * `bodySubsolarPoint` (domain/sun) feed the shader uniforms directly, and
 * `tests/globe-port.test.ts` proves the shader's day test is exactly
 * `isDaylight`. So the terminator here cannot drift away from the number in
 * the caption: there is one sun model and three ways of drawing it.
 *
 * What WebGL actually buys over the hero's SVG, and it is not the one the
 * Tier-2 note assumes:
 *
 *   · the terminator is analytic, not tessellated. `dawn-layers` draws a
 *     geoCircle at 0.5° precision and re-tessellates it as the camera moves;
 *     here it is one dot product, exact at any zoom, and it costs one
 *     uniform rather than a path rebuild.
 *   · free camera. The hero's disc is clamped to ±40°/±28° and springs home,
 *     because an SVG globe mid-page cannot afford a free camera. This one can
 *     be driven anywhere, which is what the Window Seat dive needs.
 *
 * What it does not buy, deliberately: bloom. Bloom smears the 0.5° terminator
 * and the hairlines that make this an instrument rather than an ornament, and
 * it reads as 2021 crypto-globe. Depth here comes from the layer stack —
 * atmosphere, land, twilight, soft-edged night — not from a post pass.
 */

const SPHERE_R = 1.0 - LAND_LIFT * 2;
const ATMO_R = 1.09;

/** Day/night + twilight + the body's ghost line, from three directions.
 *
 *  `uSunDir` and `uBodySunDir` are `sunDirection(subsolarPoint(date))` and the
 *  same for `bodySubsolarPoint(...)` — no geometry is generated here at all,
 *  which is the whole trick. The 90° cap `dawn-layers` tessellates is exactly
 *  the set of normals with `dot(n, sunDir) < 0`. */
const DAWN_VERT = /* glsl */ `
  varying vec3 vNrm;
  void main() {
    vNrm = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DAWN_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNrm;
  uniform vec3  uSunDir;
  uniform vec3  uBodySunDir;
  uniform vec3  uBase;       // ocean or land, so both darken on the same curve
  uniform float uGhost;      // 1 while the gap is wide enough to draw
  uniform float uTwilightDeg;

  void main() {
    vec3 n = normalize(vNrm);
    float d = dot(n, uSunDir);

    // Signed distance to the terminator, in "suns" rather than degrees: the
    // twilight band has to widen with the sun's declination the way a real one
    // does, and d carries that for free.
    float band = uTwilightDeg;
    float night = smoothstep(band, -band, d);
    float dusk  = smoothstep(band, 0.0, abs(d)) * (1.0 - night);

    // One curve for land and ocean alike. A globe whose continents stay lit
    // through the night is a globe lying about where the sun is, which is the
    // one thing this screen is not allowed to do.
    vec3 col = mix(uBase, uBase * 0.16, night);
    col += vec3(0.95, 0.62, 0.34) * dusk * 0.42;

    // The body's own dawn: the same great circle against the body's sun. This
    // is the product thesis as a line on a sphere — where your body thinks the
    // sun is, versus where it is.
    if (uGhost > 0.5) {
      float g = abs(dot(n, uBodySunDir));
      col += vec3(1.00, 0.85, 0.54) * smoothstep(0.028, 0.0, g);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Fresnel rim. The cheap atmosphere: a back-faced shell whose brightness is
 *  the grazing angle, which is most of what a real limb glow is. */
const ATMO_VERT = /* glsl */ `
  varying vec3 vNrm; varying vec3 vView;
  void main() {
    vNrm = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const ATMO_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNrm; varying vec3 vView;
  uniform vec3 uColor; uniform float uPower; uniform float uStrength;
  void main() {
    float f = 1.0 - abs(dot(normalize(vNrm), normalize(vView)));
    float a = pow(clamp(f, 0.0, 1.0), uPower) * uStrength;
    gl_FragColor = vec4(uColor, a);
  }
`;

/** How wide the twilight band reads, in the same units as `dot(n, sunDir)`.
 *  cos(90°) = 0, so the band straddles zero by ±sin of its half-width. */
function twilightAmount(deg: number): number {
  return Math.sin((deg * Math.PI) / 180);
}

/** One uniform block for ocean and land alike — the two share a day/night
 *  curve, so they are built from the same object rather than two copies that
 *  could drift. Built declaratively from the solar model: the sun moves 0.25°
 *  of longitude a minute, so re-creating a handful of uniforms four times a
 *  second is free, and there is no per-frame mutation to get wrong. */
function useDawnUniforms(sub: SubsolarPoint, body: SubsolarPoint | null) {
  return useMemo(
    () => ({
      uSunDir: { value: sunDirection(sub) },
      uBodySunDir: { value: sunDirection(body ?? sub) },
      uGhost: { value: body ? 1 : 0 },
      uTwilightDeg: { value: twilightAmount(6) },
    }),
    [sub, body],
  );
}

/** Ocean: the darker of the two, so continents read as lighter shapes on it. */
const OCEAN_BASE = new THREE.Color("#16283f");
const LAND_BASE = new THREE.Color("#33507d");

function DawnSphere({ sub, body }: { sub: SubsolarPoint; body: SubsolarPoint | null }) {
  const shared = useDawnUniforms(sub, body);
  const uniforms = useMemo(
    () => ({ ...shared, uBase: { value: OCEAN_BASE } }),
    [shared],
  );
  return (
    <mesh>
      <sphereGeometry args={[SPHERE_R, 128, 96]} />
      <shaderMaterial vertexShader={DAWN_VERT} fragmentShader={DAWN_FRAG} uniforms={uniforms} />
    </mesh>
  );
}

function Atmosphere() {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#6f9bd8") },
      uPower: { value: 3.1 },
      uStrength: { value: 0.85 },
    }),
    [],
  );
  return (
    <mesh>
      <sphereGeometry args={[ATMO_R, 64, 48]} />
      <shaderMaterial
        vertexShader={ATMO_VERT}
        fragmentShader={ATMO_FRAG}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function Land({ sub, body }: { sub: SubsolarPoint; body: SubsolarPoint | null }) {
  const { geometry } = useMemo(() => landGeometry(), []);
  const shared = useDawnUniforms(sub, body);
  const uniforms = useMemo(
    () => ({ ...shared, uBase: { value: LAND_BASE } }),
    [shared],
  );
  return (
    <mesh geometry={geometry}>
      <shaderMaterial
        vertexShader={DAWN_VERT}
        fragmentShader={DAWN_FRAG}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** The two suns as physical objects on the sphere. Keeping the body's sun
 *  visible is the payoff — you can watch the ghost line close on it. */
function Suns({ sub, body }: { sub: SubsolarPoint; body: SubsolarPoint | null }) {
  const real = useMemo(() => lonLatToVec3(sub.lon, sub.lat, LAND_RADIUS + 0.012), [sub]);
  const ghost = useMemo(
    () => (body ? lonLatToVec3(body.lon, body.lat, LAND_RADIUS + 0.012) : null),
    [body],
  );
  return (
    <>
      <mesh position={real}>
        <sphereGeometry args={[0.014, 20, 16]} />
        <meshBasicMaterial color="#ffd98a" toneMapped={false} />
      </mesh>
      {ghost && (
        <mesh position={ghost}>
          <sphereGeometry args={[0.009, 16, 12]} />
          <meshBasicMaterial color="#8b93a7" toneMapped={false} />
        </mesh>
      )}
    </>
  );
}

/** Frame cost, measured rather than guessed. `WorldLens` recomputes 177
 *  country paths every frame in globe mode; the point of this spike is to
 *  show what the GPU path costs instead. */
export interface FrameStats {
  fps: number;
  p50: number;
  p95: number;
  drawCalls: number;
  triangles: number;
}

function FrameMeter({ onStats }: { onStats: (s: FrameStats) => void }) {
  const samples = useRef<number[]>([]);
  const last = useRef(0);
  const acc = useRef(0);
  const frames = useRef(0);
  const gl = useThree((s) => s.gl);

  useFrame((_, delta) => {
    if (last.current) {
      const ms = delta * 1000;
      samples.current.push(ms);
      if (samples.current.length > 180) samples.current.shift();
      acc.current += ms;
      frames.current += 1;
      if (acc.current > 500) {
        const sorted = [...samples.current].sort((a, b) => a - b);
        const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
        onStats({
          fps: Math.round((frames.current * 1000) / acc.current),
          p50: +at(0.5).toFixed(2),
          p95: +at(0.95).toFixed(2),
          drawCalls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
        });
        acc.current = 0;
        frames.current = 0;
      }
    }
    last.current = delta;
  });
  return null;
}

export interface DawnGlobeSceneProps {
  date: Date;
  /** Minutes of shift the plan still owes; null or 0 closes the ghost. */
  owedMin: number | null;
  requiredShiftMin: number;
  onStats?: (s: FrameStats) => void;
}

export function DawnGlobeScene({ date, owedMin, requiredShiftMin, onStats }: DawnGlobeSceneProps) {
  const sub = useMemo(() => subsolarPoint(date), [date]);
  const body = useMemo(() => {
    if (owedMin === null || Math.abs(owedMin) < GHOST_VISIBLE_MIN) return null;
    return bodySubsolarPoint(sub, owedMin, requiredShiftMin);
  }, [sub, owedMin, requiredShiftMin]);

  return (
    <>
      <DawnSphere sub={sub} body={body} />
      <Land sub={sub} body={body} />
      <Suns sub={sub} body={body} />
      <Atmosphere />
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.45}
        zoomSpeed={0.7}
        minDistance={1.6}
        maxDistance={6.5}
      />
      {onStats && <FrameMeter onStats={onStats} />}
    </>
  );
}

export interface DawnGlobeCanvasProps extends DawnGlobeSceneProps {
  className?: string;
}

export function DawnGlobeCanvas({ className, ...scene }: DawnGlobeCanvasProps) {
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0.75, 3.6], fov: 38 }}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <ambientLight intensity={1} />
        <DawnGlobeScene {...scene} />
      </Canvas>
    </div>
  );
}