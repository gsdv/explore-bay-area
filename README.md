# Explore Bay Area

An interactive 3D field guide to the San Francisco Bay Area for newcomers. The region is rebuilt at toy
scale from real data — terrain, shoreline, streets, parks, transit lines, downtown buildings — and layered
with landmarks, the major companies' offices, and **quests**: routes to follow to learn the place.

Drag to look around, use the arrow keys to move, click anything.

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:5178
```

`public/data` is committed, so the app runs without the pipeline. To regenerate the data:

```bash
pnpm data:fetch     # one-time downloads into data-cache/ (~170 MB, cached forever)
pnpm data           # bake public/data (~6 s once cached)
```

Other scripts: `pnpm typecheck`, `pnpm build`, `pnpm preview`. The hosted version is at
https://explore-bay-area.vercel.app (see Deploying).

## What's in it

| Layer | Source | How it's rendered |
| --- | --- | --- |
| Terrain | AWS Terrain Tiles (Mapzen terrarium) z12, ~30 m/px | 1024² heightmap → 512² displaced grid, 1.6× vertical exaggeration |
| Shoreline | US Census cartographic county boundaries (clipped to shoreline) | Land mask for the texture and heightmap; minimap outline |
| Map texture | Composed in the pipeline: elevation tint, hillshade, parks, streets | One 4096² WebP on the terrain |
| Streets | OSM (motorway→tertiary region-wide, residential in SF) | Baked into the texture; also seed the procedural blocks |
| Parks / open space | OSM leisure, protected areas, forests | Green overlay in the texture |
| Buildings | OSM footprints with heights for downtown SF / SoMa / Mission Bay | Extruded into one merged mesh |
| Everything else | Procedural "row blocks" along streets | ~126k instances in chunked `InstancedMesh`es |
| Transit | OSM route relations: Muni (bus, trolley, Metro, cable car), BART, Caltrain, VTA light rail, ferries | `LineSegments2`, one draw call per mode, official colours |
| Stations | OSM railway=station for BART, Caltrain, Muni | Discs, labels when zoomed in |
| Landmarks | Curated (`src/data/landmarks.ts`) | Procedural low-poly models; hover = silhouette outline + pop |
| Companies | Curated (`src/data/companies.ts`), > $10 B | HQ block + logo chip → detail card |
| Quests | Curated (`src/data/quests.ts`) | Guided tours: an overview, then Begin / Next fly you stop to stop along a draped route, with a dot-line progress indicator |

## Controls

| Input | Action |
| --- | --- |
| Drag / one finger | Grab the map and pan (with inertia) |
| Right-drag, ctrl-drag, two fingers | Rotate and tilt around the point at screen centre |
| Scroll / pinch | Altitude, anchored on the ground under the cursor (dive toward what you point at) |
| R / F, PageUp / PageDown | Straight up / down |
| Arrow keys / WASD | Move over the map, relative to the view (Shift = faster) |
| Q / E | Rotate |
| Double-click | Fly to that spot |
| `?` | Controls sheet (also the button next to the title) |
| Esc | Close whatever is open |

The pitch follows altitude by default (about 76° looking down from high up, easing to 24° near the
ground); tilting adds an offset on top. Bounds are hard walls: the camera stays inside the region and
between a floor about 340 m above sea level and a ceiling of 42 km.

The **minimap** in the bottom-right corner shows the shoreline, a pulsing dot for where you are and a
cone for where you're looking. Click it to expand a labelled map; click anywhere on that map to fly there.

### Deep links

The URL hash drives the camera and selection, so views are shareable. The first one on load jumps
instantly; later hash changes animate.

```
#at=37.7955,-122.3937,9       lat,lng and camera distance (world units, 1 = 100 m)
#quest=summit                  ai-route · nature-lover · summit · landmarks
#landmark=ggb                  any id from src/data/landmarks.ts
#company=anthropic             any id from src/data/companies.ts
```

## Architecture

```
scripts/  (Node, tsx)                          src/  (Vite + React + react-three-fiber)
 fetch.ts ──► data-cache/ ──► build-data.ts ──► public/data/ ──► lib/world.ts ──► scene/*
   Overpass, terrain tiles, census              height.png, map.webp,           Terrain, Water, Buildings,
                                                buildings.json, filler.bin,     Transit, Landmarks,
                                                transit.json, stations.json,    Companies, QuestRoute,
                                                outline.json, map-small.webp    CameraRig
                         shared: src/lib/geo.ts (projection, constants)          ui/* (panels, minimap, help)
```

- **Coordinates**: 1 world unit = 100 m, X east, Y up, Z south. `project(lat, lng)` → `[x, z]`.
  Terrain ×1.6 and buildings ×1.8 vertical exaggeration so the region reads at toy scale.
- **State**: `src/store.ts` (zustand) for selection, quests, layers and fly-to requests;
  `src/scene/viewStore.ts` publishes camera position/heading/zoom tier for the UI.
- **Performance**: one terrain draw call, chunked instancing for blocks, line batches for transit and
  bridge cables, raycasting disabled on everything but landmarks, DOM labels tiered by zoom. The full
  scene is ~1.6 M triangles in ~120 draw calls.
- **Style**: a printed field guide — cream paper, ink borders, hard offset shadows, Fraunces + IBM Plex,
  International Orange as the only accent. All tokens live in `src/styles.css`.

See `CLAUDE.md` for conventions, gotchas and how to verify changes.

## Adding content

- **A company**: append to `src/data/companies.ts` with HQ lat/lng, a domain (for the logo), a one-line
  blurb, cap (USD billions; `isPrivate` for valuations), employees, founded year, X handle.
- **A landmark**: append to `src/data/landmarks.ts` with a `kind`. Kinds map to procedural models in
  `src/scene/LandmarkModel.tsx`; add a new `case` there for a new shape. Bridges take `lat2/lng2`.
- **A quest**: append to `src/data/quests.ts` with ordered stops; each stop can carry a `view`
  (camera distance and heading) for the tour, and `ref` links it to a landmark or company. Routes are a
  smoothed curve through the stops for now.
- **New geography** (a road class, an agency, a boundary): add the Overpass query in
  `scripts/lib/osm.ts`, process it in `scripts/build-data.ts`, emit a file in `public/data`, load it in
  `src/lib/world.ts`.

## Deploying

Live at **https://explore-bay-area.vercel.app**, hosted on Vercel and connected to
[github.com/gsdv/explore-bay-area](https://github.com/gsdv/explore-bay-area):

- every push to `main` builds and deploys production;
- every other branch / PR gets its own preview URL.

`vercel.json` holds the build settings (Vite preset, `pnpm build` → `dist/`) and cache headers:
hashed `/assets/*` are immutable, `/data/*` revalidates so a pipeline rebuild shows up immediately.
Because `public/data` is committed, deploys never run the pipeline. When the company feed is wired up,
put the Apify call in a serverless function (`api/`) so the token never reaches the browser.

## Troubleshooting

- **Blank scene, "Could not load data"** — `public/data` is missing; run `pnpm data`.
- **Overpass 429/504** — you're rate-limited; make sure only one `fetch.ts` is running and retry.
  The client already backs off and splits transit by agency.
- **Fetch hangs on overpass-api.de** — its IPv6 address is unreachable from some networks; the scripts
  already force IPv4. If you use a different client, do the same.
- **Muni via GTFS** — SFMTA's host times out from outside, so Muni is drawn from OSM route relations.
  A 511.org API key would allow official shapes.
- **Vite "Could not Fast Refresh" for CameraRig** — expected (it exports a non-component); reload.

## Roadmap

- Company X posts via Apify (needs a token), events feed.
- Real walking/transit routes for quests.
- Vector streets and higher-detail texture for SF proper when zoomed in.
- Live market-cap/headcount source for companies.
- Label collision avoidance downtown; touch (pinch) controls.
