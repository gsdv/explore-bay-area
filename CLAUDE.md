# CLAUDE.md — working notes for Explore Bay Area

Explore Bay Area is a 3D, toy-scale field guide to the SF Bay Area for newcomers: real terrain and
shoreline, OSM streets/parks/buildings, transit lines, company HQs, landmarks and "quests".
It is a static Vite + React + react-three-fiber app fed by a Node data pipeline that bakes
everything into `public/data`. Read `README.md` for the user-facing overview; this file is the
operating manual for working on the code.

## Commands

```bash
pnpm install              # pnpm only; native builds for sharp are allowlisted in package.json
pnpm dev                  # Vite on http://localhost:5178 (strict port; 5174 belongs to another project — never use it)
pnpm typecheck            # tsc -b over src/ and scripts/ (must be clean before committing)
pnpm build                # production build to dist/
pnpm data                 # rebuild public/data from data-cache/ (≈6 s when sources are cached)
pnpm data:fetch           # only download sources into data-cache/ (Overpass, terrain tiles, census)
```

There are no tests yet. Verification is: `pnpm typecheck`, then run the app and look at it.
Pushing `main` deploys to production immediately (see Hosting), so verify locally before pushing.

## Layout

```
scripts/                data pipeline (run with tsx; Node 24)
  fetch.ts              downloads everything into data-cache/ (gitignored, ~170 MB)
  build-data.ts         composes public/data/* from the cache (the only place output files are written)
  lib/overpass.ts       Overpass client: cached, retries, IPv4-first, one query at a time
  lib/osm.ts            the Overpass queries (bboxes for SF, downtown, full region)
  lib/terrain.ts        terrarium tiles → 1024² heightmap, RGB-encoded PNG
  lib/land.ts           census counties → shoreline polygons (mapshaper)
  lib/svg.ts            SVG builder + sharp rasteriser for the 4096² map texture
  lib/palette.ts        map colours and road stroke styles
src/
  lib/geo.ts            THE shared projection + constants (imported by scripts AND app)
  lib/world.ts          loads public/data, decodes the heightmap, exposes heights.yAt(x,z)
  lib/extrude.ts        building footprints → one merged geometry (earcut roofs, quad walls)
  store.ts              zustand app state: selection, active quest, layer toggles, flyTo requests
  scene/Scene.tsx       Canvas, lights, fog; mounts every scene layer
  scene/CameraRig.tsx   custom camera (keys/drag/scroll), bounds, floor, fly-to animation
  scene/viewStore.ts    camera state published for UI (minimap, label tiers)
  scene/Terrain.tsx     512² displaced grid + map texture
  scene/Water.tsx       translucent sea-level plane
  scene/Buildings.tsx   downtown extrusions + instanced procedural blocks (10×10 chunks)
  scene/Transit.tsx     LineSegments2 per mode + station discs/labels
  scene/Landmarks.tsx   landmark groups: hover outline (inverted hull), pop-up scale, labels
  scene/LandmarkModel.tsx  procedural part lists per landmark kind; bridge cables as line batches
  scene/Companies.tsx   HQ blocks + Html chips
  scene/QuestRoute.tsx  active quest path + numbered pins
  scene/DevStats.tsx    dev-only: writes fps/draw stats and camera state to <html data-perf/data-view>
  ui/                   Header (+ help button / quest title), QuestPanel, QuestFrame, Layers, DetailCard, Minimap, Help, DeepLink
  data/                 hand-curated content: companies.ts, landmarks.ts, quests.ts
  styles.css            the entire visual language (see Style below)
public/data/            generated, committed (≈9 MB) so deploys don't need the pipeline
.claude/launch.json     "dev" preview config used by the Claude Code browser pane
vercel.json             build settings + cache headers for Vercel (see Hosting)
```

## Core conventions

- **Coordinates.** World units: 1 unit = 100 m. X east, Y up, Z south (north is −Z). `project(lat, lng)`
  returns `[x, z]`; `unproject` reverses it; `worldToUV`/`toUV` map into texture space (v=0 at the
  north edge). Terrain heights are exaggerated ×1.6 and buildings ×1.8 (`geo.ts`). Never hard-code a
  projection anywhere else; scripts and app must agree.
- **Everything spatial is baked.** If new geography is needed (roads, parks, another agency), add it to
  the pipeline and emit a file in `public/data`; don't fetch from third parties at runtime.
- **Heights at runtime** come from `world.heights.yAt(x, z)` (bilinear on the decoded heightmap).
  Anything placed on the ground samples this; the pipeline bakes `y` into fillers and transit lines.
- **Raycasting is opt-in.** Terrain, water, buildings and lines set `raycast={() => null}` so pointer
  events only hit landmark meshes. Keep it that way; hover would crawl otherwise.
- **Labels are DOM** (`drei/Html`). Tier them by `useZoomTier()` ('far' | 'mid' | 'near') so the far
  view isn't a wall of chips. Html `zIndexRange` must stay below 40; UI panels start at z-index 100.
- **State.** App state in `src/store.ts`; camera state in `scene/viewStore.ts` (written by the rig,
  throttled). Zustand selectors must return stable references (no `?? []` inline) — that caused an
  infinite render loop once.
- **Camera requests** go through `store.flyTo(x, z, distance?, instant?)`; the rig picks them up in
  its frame loop, so it's safe to call before the rig mounts.
- **Deep links** (`#at=lat,lng,dist`, `#quest=`, `#company=`, `#landmark=`) are applied by
  `ui/DeepLink.tsx`; the first application is instant, later hash changes animate.
- **Quest mode / tour.** `store.openQuest(q)` selects a quest and flies to an overview; `questStep` is
  `null` (overview) or the current stop index; `beginQuest/nextStop/prevStop/goToStop` fly to each stop's
  predefined `view` (dist + yaw in `quests.ts`). While active: `QuestFrame` draws the coloured border, the
  header becomes the tour guide (quest-coloured title, Begin / Back / Next / Finish, Exit), `QuestProgress`
  shows the dot line top-right, the quest list and Layers panel hide, company chips hide (route pins carry
  the names), landmarks lose labels/hover/select. No check-off state: the owner removed it on purpose.
  Esc exits when nothing else is open. Anything new that adds clutter should respect `activeQuest`.
- **Landmark hit-testing** uses an invisible bounding box around each model (`Landmarks.tsx`), so gaps
  between tower legs or bridge spans still count as hovering. Keep it when adding kinds.
- **Transit lines are clipped** to the terrain rectangle in `build-data.ts` (`clipToWorld`); Overpass
  returns whole ways that cross the bbox, so never skip this for new line data.

## Style rules (from the owner — treat as requirements)

- No "AI-isms": no purple gradients, no pill-shaped everything, no card grids for their own sake.
- The look is a printed field guide: cream paper (`--paper`), ink borders, hard offset shadows,
  Fraunces for display, IBM Plex Mono for labels/meta, IBM Plex Sans for body, International Orange
  (`--orange`) as the single accent. Keep new UI inside this system; add tokens to `:root` rather than
  ad-hoc colours.
- Floating windows must animate in (see `.card` / `.modal` keyframes) and sit above every in-scene label.
- Delight over density: tier labels, don't overcrowd the minimap (no companies on it), keep panels calm.

## Camera + bounds (what the owner asked for)

- "Fly over a toy city" model (commit "Camera: pan/orbit/zoom-to-cursor…", revertible in one step if the
  owner prefers the previous orbit-target scheme): camera state is position + yaw + pitch. Left-drag
  grabs the ground (exact grab-pan with inertia), right/ctrl-drag orbits the screen-centre ground point,
  scroll/pinch changes altitude anchored on the ground under the cursor, R/F go straight up/down,
  WASD/arrows pan, Q/E rotate, double-click flies. Pitch = `autoPitch(altitude)` + a user tilt offset.
- Hard walls: camera x/z clamped to the region (`MARGIN`), altitude between `FLOOR` and `CEILING`.
- Floor: a single flat height `FLOOR` (3.4 units ≈ 340 m above sea level). The owner explicitly removed
  per-rooftop/terrain clearance because it felt bumpy; clipping through Salesforce Tower or Mt Tam is
  acceptable. Don't reintroduce a terrain-following clamp without asking.
- Input listeners live on the canvas's parent container, not the canvas, so wheel/touch over DOM labels
  still drive the camera. A press on a label only becomes a drag after 4 px of movement so clicks reach it.
- `viewStore` publishes the screen-centre ground point (not the camera position); `flyTo(x, z, dist)`
  means "put ground point x,z at screen centre, dist away".

## Data pipeline gotchas

- Public Overpass servers: 2 slots per IP, `429`/`504` when pushed. The client retries with backoff and
  the transit query is split per agency. **Never run two pipelines concurrently**; kill strays with
  `pkill -f scripts/fetch.ts`.
- `overpass-api.de` over IPv6 hangs from some networks; `util.ts` sets `dns.setDefaultResultOrder('ipv4first')`.
- Mirrors `overpass.kumi.systems` and `overpass.private.coffee` were unreachable; don't re-add without testing.
- SFMTA's GTFS host times out, so Muni comes from OSM route relations (`network=Muni`). A 511.org key
  would allow official GTFS shapes later.
- Census county boundaries come back as a `GeometryCollection` after `-dissolve`; `land.ts` normalises it.
- `map.webp` (4096², q90) replaced a 14 MB PNG. Keep textures as WebP.
- Procedural filler density is tuned in `build-data.ts` (spacing/prob). ~126k instances today.

## Verifying in the Claude Code browser pane

- Start with the `dev` config from `.claude/launch.json` (port 5178). Navigating to the same URL with only
  a different `#hash` does **not** reload; add a throwaway `?r=N` query to force a fresh load.
- The pane pauses rendering when hidden: `requestAnimationFrame`, timers, fly animations and `data-perf`
  all stall. Take screenshots (each renders a few frames) rather than waiting; use `#at=` deep links,
  which jump instantly, to reach a spot.
- `javascript_tool` runs in an isolated world — page globals are invisible. Use the DOM instead:
  `document.documentElement.dataset.perf` / `.view` (dev only) and dispatched `KeyboardEvent`s.
- Console messages accumulate across navigations; check for errors after a real reload.

## Content

- `src/data/companies.ts`: > $10 B market cap/valuation with a Bay Area HQ or major campus; figures are
  hand-written snapshots and need a live source before launch. Logos come from Google's favicon service.
- `src/data/landmarks.ts`: each has a `kind` mapped to a procedural model in `LandmarkModel.tsx`. Add a
  new kind there (parts list, optional `landmarkLines` for thin geometry).
- `src/data/quests.ts`: ordered stops with a to-do and a tour `view` each. No persisted progress.
- Company X/Twitter feed is intentionally stubbed until the owner supplies an Apify token; it should be
  proxied through a serverless function so the token stays server-side.

## Hosting

- Vercel project `explore-bay-area` in scope `gsdvs-projects`, git-connected to `github.com/gsdv/explore-bay-area`.
  Pushing `main` deploys production (https://explore-bay-area.vercel.app); other branches get previews.
  No CI workflow is needed; don't add one for deploys.
- `vercel.json` is the source of truth for build settings and headers. `.vercel/` and `.env*` are gitignored.
- Local CLI: `pnpm dlx vercel@latest` (not installed globally). Non-interactive commands need
  `--scope gsdvs-projects` until the directory is linked; `vercel inspect <url>` shows a deploy's status.

## Git

The owner runs the repo. Commit when asked or when a round of requested changes is verified; use clear
multi-line messages and the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer.
`public/data` is committed on purpose; `data-cache/` and `tsconfig.tsbuildinfo` are not.
