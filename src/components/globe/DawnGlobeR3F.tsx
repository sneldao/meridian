"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  bodySubsolarPoint,
  isDaylight,
  solarZenithDeg,
  subsolarPoint,
  type SubsolarPoint,
} from "@/domain/sun";
import { GHOST_VISIBLE_MIN } from "@/domain/dawn-layers";
import type { Trip } from "@/domain/types";
import { clusterAirports, dotBrightness, resolveLightSet } from "@/domain/city-lights";
import { AIRPORTS } from "@/domain/airports";
import {
  alongArc,
  chasePosition,
  easeInOut,
  greatCircle,
  type GreatCircle,
} from "@/lib/globe/great-circle";
import { landGeometry, LAND_RADIUS, LAND_LIFT } from "@/lib/globe/land-geometry";
import { lonLatToVec3, sunDirection, viewBasis } from "@/lib/globe/spherical";

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
 *  the set of normals with `dot(n, sunDir) < 0`.
 *
 *  The normal is taken from the *position*, not the `normal` attribute, on
 *  purpose: both surfaces this shader serves sit exactly on spheres centred at
 *  the origin, so the position direction is the true analytic normal — and the
 *  land geometry is unindexed with duplicated vertices, where `computeVertex-
 *  Normals` would give flat per-facet normals and a stair-stepped terminator
 *  over the continents while the ocean's stayed smooth. One dot product on the
 *  position fixes both shares of the world to the same analytic curve. */
const DAWN_VERT = /* glsl */ `
  varying vec3 vNrm;
  void main() {
    vNrm = normalize(position);
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

/** The trip's route and its two pins, drawn with the same geometry the SVG
 *  hero draws: the `geoInterpolate` arc (via `greatCircle`) and one pin per
 *  city in the brand colours — origin is `--color-sun-home`, destination
 *  `--color-sun-dest`. Mounted whenever `trip` is given, so the hero and the
 *  spike show the same journey the flat lens shows; a camera move on the
 *  globe cannot contradict the arc on the map. */
function RouteArc({ trip }: { trip: Trip }) {
  const points = useMemo(() => greatCircle(trip, LAND_RADIUS + 0.006).points, [trip]);
  const origin = useMemo(
    () => lonLatToVec3(trip.origin.lon, trip.origin.lat, LAND_RADIUS + 0.012),
    [trip],
  );
  const dest = useMemo(
    () => lonLatToVec3(trip.destination.lon, trip.destination.lat, LAND_RADIUS + 0.012),
    [trip],
  );
  return (
    <>
      <Line
        points={points}
        color="#8b93a7"
        transparent
        opacity={0.55}
        lineWidth={1.2}
        dashed
        dashSize={0.045}
        gapSize={0.035}
      />
      <mesh position={origin}>
        <sphereGeometry args={[0.02, 16, 12]} />
        <meshBasicMaterial color="#9db8ff" toneMapped={false} />
      </mesh>
      <mesh position={dest}>
        <sphereGeometry args={[0.022, 16, 12]} />
        <meshBasicMaterial color="#ffc46b" toneMapped={false} />
      </mesh>
    </>
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

/** The flight camera — the 85-second payoff, on a scrubbable dial.
 *
 *  `progress` is a ref rather than state on purpose: this runs every frame,
 *  and a React re-render per frame is the exact cost this migration exists to
 *  remove. The host mirrors it to state at a human rate for the read-out.
 *
 *  The move is a chase, not a rail: the camera trails the tangent and lifts,
 *  so the globe rolls away underneath the traveller. Driven by `greatCircle`,
 *  which is the same `geoInterpolate` arc WorldLens already draws.
 *
 *  This only runs when the controls are registered as the scene default
 *  (`makeDefault`) — that is how the laptop-honest handoff works: orbit is
 *  disabled for the flight, this camera takes the wheel, and when the ref
 *  reaches 1 the dial hands control back exactly where the camera now is. */
function FlightCamera({
  gc,
  progress,
  enabled,
  distance = 0.86,
  lift = 0.3,
}: {
  gc: GreatCircle;
  progress: React.RefObject<number>;
  enabled: boolean;
  distance?: number;
  lift?: number;
}) {
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  const camera = useThree((s) => s.camera);
  const pos = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  // Set on the first frame of a flight, so the dive starts from whatever
  // framing the user had parked the camera in — not from the origin, which
  // is *inside* the sphere and would show the shell's dark back-face for the
  // first few frames of every flight.
  const started = useRef(false);

  // Handing control back resets this, so the *next* flight again starts wherever
  // the user has since parked the camera.
  useEffect(() => {
    if (!enabled) started.current = false;
  }, [enabled]);

  useFrame((_, delta) => {
    if (!enabled || !controls) return;
    if (!started.current) {
      started.current = true;
      pos.current.copy(camera.position);
      look.current.copy(controls.target);
    }
    const t = easeInOut(progress.current);
    const { point, tangent } = alongArc(gc, t);
    const want = chasePosition(point, tangent, distance, lift);
    // Smooth toward the goal in *time*, not per frame — the ease-out as it
    // approaches a scrubbed target reads identically at 30fps and 120fps,
    // instead of gliding 4x slower between them.
    const k = 1 - Math.exp(-delta / 0.15);
    pos.current.lerp(want, k);
    look.current.lerp(point, k);
    camera.position.copy(pos.current);
    controls.target.copy(look.current);
    controls.update();
  });
  return null;
}

/** The pointer's target, drawn on the surface: a small ring that breathes once
 *  per second-corner-tap, so the eye has something to find the tooltip's place
 *  against. It cannot be confused with a city light — cities are round and
 *  steady; this is a hollow gold ring, and there is at most one. */
function HoverRing({ point }: { point: { lat: number; lon: number } }) {
  const ref = useRef<THREE.Mesh>(null);
  const position = useMemo(
    () => lonLatToVec3(point.lon, point.lat, LAND_RADIUS + 0.03),
    [point.lon, point.lat],
  );
  // RingGeometry lies flat in XY facing +Z; the normal through the point is its
  // out-of-sphere direction.
  const quaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        lonLatToVec3(point.lon, point.lat, 1).normalize(),
      ),
    [point.lon, point.lat],
  );
  useFrame(({ clock }) => {
    ref.current?.scale.setScalar(1 + 0.13 * Math.sin(clock.elapsedTime * 4));
  });
  return (
    <mesh ref={ref} position={position} quaternion={quaternion}>
      <ringGeometry args={[0.02, 0.029, 40]} />
      <meshBasicMaterial
        color="#ffc46b"
        transparent
        opacity={0.9}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/** The lights, via the lens's own clustering, gated by the lens's own curve.
 *
 *  These are the ~1,145 airports WorldLens draws as SVG circles, cut with the
 *  same clustering (`clusterAirports`) and the same per-cluster screen-size
 *  decision (`resolveLightSet` → `shouldSplit`) — dense cells resolve into
 *  their members once they cover `EXPAND_PX`, sparse ones stay one light.
 *
 *  Brightness is `dotBrightness(solarZenithDeg(...))` — the exact curve the
 *  lens keys its SVG dots on, imported from the same place so the parity is
 *  by construction, not by a matching constant. A light is bright here on the
 *  same nights the lens makes it bright, because both read one curve of one
 *  sun. Feeding 1,145 airports the same brightness through day would be the
 *  continent-lit-through-the-night lie the land shader refuses to tell.
 *
 *  The shader exists because a per-vertex attribute cannot drive the stock
 *  `pointsMaterial`: nothing reads `aBright` otherwise, and the dishonesty
 *  would be silent. It also buys round, soft-edged sprites and a cheap
 *  discard for dots the terminator has fully extinguished.
 *
 *  The win over the SVG version is that 700–1,150 nodes become ONE draw call,
 *  and the split/cluster decision no longer costs a React reconciliation. */

const LIGHT_VERT = /* glsl */ `
  attribute float aBright;
  varying float vBright;
  uniform float uSize;   // world-space sprite scale, as three's points use it
  uniform float uScale;  // half the drawing-buffer height in device px
  void main() {
    vBright = aBright;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * (uScale / max(0.01, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;
const LIGHT_FRAG = /* glsl */ `
  precision highp float;
  varying float vBright;
  uniform vec3  uColor;
  uniform float uOpacity;
  void main() {
    float a = vBright * uOpacity;
    // Fully dark where the sun has the dot in daylight.
    if (a <= 0.015) discard;
    // Round, soft-edged sprite: gl_PointCoord is 0..1 across the billboard.
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

/** Hovering must stay on the visible face. The library's default Points
 *  threshold is 1 *world unit* — a full globe radius — so an unconfigured
 *  ray names a metro on the far side of the planet. 0.025 is ~1.4° of arc;
 *  the hemisphere test below closes the graze-the-limb gap that even a tuned
 *  threshold leaves open. */
const PICK_THRESHOLD = 0.025;
function CityLights({ date, onHover }: { date: Date; onHover?: (h: CityHover | null) => void }) {
  const sub = useMemo(() => subsolarPoint(date), [date]);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);

  // One buffer, rebuilt only when the split decision flips — not per frame.
  const { geometry, members } = useMemo(() => {
    const clusters = clusterAirports(AIRPORTS);
    // Pixels per degree at the globe's surface, for EXPAND_PX's test. Measured
    // to the *surface*, not the origin — what matters is how many pixels a
    // metro covers, and it covers them up close. Recomputed on every clock
    // tick (4Hz), which is human-speed for a clustering decision.
    const fov = ((camera as THREE.PerspectiveCamera).fov ?? 40) * (Math.PI / 180);
    const halfH = size.height / 2 / Math.tan(fov / 2);
    const dist = Math.max(0.35, camera.position.length() - (1 + 0.004));
    const pxPerDeg = (halfH / dist) * (180 / Math.PI);
    // Per-cluster split, exactly as the lens decides — the global threshold
    // keyed to `clusters[0]` was order-dependent and wrong.
    const list = resolveLightSet(clusters, pxPerDeg);
    const positions = new Float32Array(list.length * 3);
    const brightness = new Float32Array(list.length);
    list.forEach((d, i) => {
      const v = lonLatToVec3(d.lon, d.lat, LAND_RADIUS + 0.004);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
      // Same curve WorldLens uses — `dotBrightness`, the shared one.
      brightness[i] = dotBrightness(solarZenithDeg(d.lat, d.lon, sub));
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aBright", new THREE.BufferAttribute(brightness, 1));
    return { geometry: g, members: list };
  }, [camera, size, sub]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Hover: raycast against the points, then report the nearest airport — on
  // the camera's side of the limb only. The screen picks the cluster; the
  // members are then searched in the same cell so the read-out names a real
  // airport rather than a grid centroid.
  const handleMove = (e: { pointer: THREE.Vector3; stopPropagation: () => void }) => {
    if (!onHover) return;
    e.stopPropagation();
    const obj = pointsRef.current;
    if (!obj) return;
    const hits = raycasterRef.current;
    // `pointer` is NDC; `point` is world space, which setFromCamera will not take.
    // R3F hands a Vector3 here (Vector2-compatible x/y); project to a fresh
    // Vector2 so the raycaster type stays honest.
    hits.setFromCamera(new THREE.Vector2(e.pointer.x, e.pointer.y), camera);
    const camDir = camera.position.clone().normalize();
    let hit: THREE.Intersection | null = null;
    for (const h of hits.intersectObject(obj, false)) {
      if (h.index === undefined) continue;
      // Reject candidates on the far hemisphere: the ray grazes a metro over
      // ~12,000 km of rock well before the answer would be interesting.
      if (h.point.clone().normalize().dot(camDir) > 0.08) {
        hit = h;
        break;
      }
    }
    if (!hit || hit.index === undefined) {
      onHover(null);
      return;
    }
    const d = members[hit.index];
    if (!d) {
      onHover(null);
      return;
    }
    onHover({
      code: "code" in d ? String(d.code) : "",
      name: "name" in d && d.name ? String(d.name) : "",
      lat: d.lat,
      lon: d.lon,
      daylight: isDaylight(d.lat, d.lon, date),
      tz: "tz" in d && typeof d.tz === "string" ? d.tz : undefined,
      count: "members" in d && Array.isArray(d.members) ? d.members.length : 1,
    });
  };

  const pointsRef = useRef<THREE.Points>(null);
  const raycasterRef = useRef(new THREE.Raycaster());

  // Set the pick radius once; the library default is one whole globe radius.
  useEffect(() => {
    raycasterRef.current.params.Points = { threshold: PICK_THRESHOLD };
  }, []);

  // Size-attenuated billboards: uScale is half the drawing-buffer height in
  // device pixels, exactly the factor three's own points shader consumes.
  // Recreated on resize the same way the dawn uniforms are recreated per tick
  // — the lint rule forbids mutating a value already handed to a hook, and the
  // cost is one color object on the rare resize, not per frame.
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#cfe0ff") },
      uOpacity: { value: 0.9 },
      uSize: { value: 0.011 },
      uScale: { value: (size.height / 2) * gl.getPixelRatio() },
    }),
    [size, gl],
  );

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      onPointerMove={handleMove}
      onPointerOut={() => onHover?.(null)}
    >
      <shaderMaterial
        vertexShader={LIGHT_VERT}
        fragmentShader={LIGHT_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

/** What the globe reports on hover. `daylight` is computed, never guessed, so
 *  the tooltip cannot disagree with the terminator it is sitting next to. `tz`
 *  is the airport's own IANA zone (held clusters have none — the centroid
 *  belongs to nobody), and `count` explains a dot that is more than one place: the lens
 *  merges a metro into one light whenever its members are under `EXPAND_PX` on
 *  screen, and the pointer deserves to say so rather than print an em dash. */
export interface CityHover {
  code: string;
  name: string;
  lat: number;
  lon: number;
  daylight: boolean;
  /** Present when the dot resolved into a real airport. */
  tz?: string;
  /** Airports behind this light — 1, or the held cluster's member count. */
  count?: number;
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
  /** Where the pointer last landed, mirrored back from the host — a ring is
   *  drawn there so the tooltip has an anchor in the scene itself. */
  hoverPoint?: { lat: number; lon: number } | null;
  /** The route to fly. Omit to leave the camera free. */
  trip?: Trip;
  /** 0..1 along the arc. A ref so the camera can read it every frame without
   *  a React render; see FlightCamera. */
  flightProgress?: React.RefObject<number>;
  /** Set false to hand the camera back to the user mid-flight. */
  flying?: boolean;
  onHover?: (h: CityHover | null) => void;
  onStats?: (s: FrameStats) => void;
  /** Free orbit on the canvas. The hero mounts the globe with this off: the
   *  scrubber drives the read, and a mid-page canvas that captures drags
   *  steals the page scroll on touch — the same reason the SVG disc's drag is
   *  fine-pointer-only. */
  interact?: boolean;
}

export function DawnGlobeScene({
  date,
  owedMin,
  requiredShiftMin,
  hoverPoint,
  trip,
  flightProgress,
  flying = false,
  onHover,
  onStats,
  interact = true,
}: DawnGlobeSceneProps) {
  const sub = useMemo(() => subsolarPoint(date), [date]);
  const body = useMemo(() => {
    if (owedMin === null || Math.abs(owedMin) < GHOST_VISIBLE_MIN) return null;
    return bodySubsolarPoint(sub, owedMin, requiredShiftMin);
  }, [sub, owedMin, requiredShiftMin]);
  const gc = useMemo(() => (trip ? greatCircle(trip) : null), [trip]);

  return (
    <>
      <DawnSphere sub={sub} body={body} />
      <Land sub={sub} body={body} />
      <Suns sub={sub} body={body} />
      <CityLights date={date} onHover={onHover} />
      {hoverPoint && <HoverRing point={hoverPoint} />}
      {trip && <RouteArc trip={trip} />}
      <Atmosphere />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.45}
        zoomSpeed={0.7}
        minDistance={1.6}
        maxDistance={6.5}
        enabled={interact && !flying}
      />
      {gc && flightProgress && <FlightCamera gc={gc} progress={flightProgress} enabled={flying} />}
      {onStats && <FrameMeter onStats={onStats} />}
    </>
  );
}

export interface DawnGlobeCanvasProps extends DawnGlobeSceneProps {
  className?: string;
  /** Centre the initial camera on a geographic point, d3-orthographic style
   *  (north up, east right — the same `viewBasis` the port test projects
   *  through). Omitted, the camera parks on the spike's default framing. */
  center?: { lon: number; lat: number };
  /** Angular span to fit in frame, degrees. Given with `center`, the camera
   *  pulls back exactly far enough for both ends of a route that wide to sit
   *  inside the vertical fov, plus a 15% margin for pins and atmosphere. */
  fitSpanDeg?: number;
}

const FIT_FOV = 38;

/** Camera framing that puts `center` at the screen centre, north up, east
 *  right — the same orientation `viewBasis` projects through, so the port
 *  test's d3 comparison applies to this camera too. The rotation is computed
 *  explicitly rather than left to R3F's implicit look-at, which does not
 *  honour a custom `up`. */
function cameraSetup(center?: { lon: number; lat: number }, fitSpanDeg?: number) {
  if (!center) return { fov: FIT_FOV, position: [0, 0.75, 3.6] as const };
  const { forward, up } = viewBasis(center.lon, center.lat);
  let dist = 3.6;
  if (fitSpanDeg && fitSpanDeg > 0) {
    // A point `θ` from the view centre projects at atan(sinθ/(d−cosθ));
    // solving for that to equal half the fov gives the minimum distance,
    // plus a 15% margin for pins and atmosphere.
    const half = (fitSpanDeg / 2) * (Math.PI / 180);
    const min = Math.cos(half) + Math.sin(half) / Math.tan((FIT_FOV / 2) * (Math.PI / 180));
    dist = Math.max(2.2, min * 1.15);
  }
  const pos = forward.clone().multiplyScalar(dist);
  const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(0, 0, 0), up);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(m));
  return {
    fov: FIT_FOV,
    position: pos.toArray() as [number, number, number],
    rotation: [e.x, e.y, e.z] as [number, number, number],
  };
}

export function DawnGlobeCanvas({ className, center, fitSpanDeg, ...scene }: DawnGlobeCanvasProps) {
  const camera = useMemo(() => cameraSetup(center, fitSpanDeg), [center, fitSpanDeg]);
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        dpr={[1, 2]}
        camera={camera}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <DawnGlobeScene {...scene} />
      </Canvas>
    </div>
  );
}