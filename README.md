# Explore Bay Area

An interactive 3D field guide to the San Francisco Bay Area for newcomers: a toy-scale reconstruction of the region with real terrain, shorelines, streets, transit lines, landmarks, company offices and "quests" to go on.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Vite + React + TypeScript | Fast dev loop, static output, no server needed for the map itself |
| 3D | three.js via `@react-three/fiber` + `@react-three/drei` | Declarative scene graph, easy pointer events, `Html` labels |
| State | zustand | Tiny, works outside React (camera code) |
| Data pipeline | Node scripts (`tsx`) + `sharp` + `mapshaper` | Runs offline, bakes everything to static files in `public/data` |
| Hosting | Vercel (or Cloudflare Pages) as a static site | The whole app is static assets; serverless functions (`api/`) can be added later for the Apify feed proxy |

## Run it

```bash
pnpm install
pnpm data      # builds public/data (downloads ~40 MB of sources once into data-cache/)
pnpm dev
```

`pnpm data` fetches and caches:

- **Terrain**: AWS Terrain Tiles (Mapzen terrarium encoding) at zoom 12, resampled to a 1024² heightmap (`height.png`, RGB-encoded metres).
- **Shoreline**: US Census cartographic county boundaries (clipped to the shoreline), cut to the region and used as the land mask.
- **Streets, parks, buildings, transit**: OpenStreetMap via the Overpass API. Downtown SF building footprints are extruded for real; everywhere else procedural "row blocks" are scattered along streets.
- **Map texture**: a 4096² PNG composed from elevation tint, hillshade, parks and streets (`map.png`). Rendering roads into a texture keeps the terrain at one draw call.
- **Transit**: Muni (bus, trolleybus, Metro, cable car), BART, Caltrain, VTA light rail and bay ferries as route relations, plus BART/Caltrain/Muni stations.

All Overpass responses are cached in `data-cache/` so re-running the pipeline is instant unless you delete the cache.

Pipeline gotchas learned the hard way:

- The public Overpass servers allow 2 concurrent slots per IP and answer `429`/`504` when you go faster; the client retries with backoff. Never run two pipelines at once.
- `overpass-api.de` is IPv6-first and its v6 address is unreachable from some networks; the scripts force `ipv4first` DNS ordering.
- SFMTA's own GTFS host times out from outside, which is why Muni comes from OSM route relations instead.

## Deep links

The URL hash drives the camera and selection, so views are shareable:

```
#at=37.7955,-122.3937,9      fly to lat,lng at a camera distance (world units, 1 = 100 m)
#quest=summit                 open a quest (ai-route, nature-lover, summit, landmarks)
#landmark=ggb   #company=anthropic
```

In dev, `<html data-perf>` carries fps, worst frame and draw stats once a second.

## Coordinates

`src/lib/geo.ts` is shared by the pipeline and the app. World units are **1 unit = 100 m**, X east, Z south, Y up. Terrain is exaggerated 1.6× and buildings 1.8× so the region reads at toy scale. `project(lat, lng)` gives world `[x, z]`.

## Performance notes

- Terrain is a single 512² grid mesh (≈520k triangles) with one 4096² texture. Raycasting is disabled on it and on buildings, so hover checks only touch landmarks.
- Procedural blocks are `InstancedMesh`es bucketed into a 10×10 grid for frustum culling.
- Transit lines use `LineSegments2` (one draw call per mode) with screen-space widths.
- Labels are DOM (`drei/Html`) and are tiered by camera distance: far away shows only the biggest companies and iconic landmarks.

## Content

- `src/data/companies.ts` — companies with > $10B market cap / valuation and a Bay Area HQ or major campus. Figures are snapshots; refresh before launch.
- `src/data/landmarks.ts` — landmarks with a procedural model `kind` (see `src/scene/LandmarkModel.tsx`).
- `src/data/quests.ts` — quests: ordered stops with a to-do per stop. Progress is kept in `localStorage`.

## Roadmap

- Company X/Twitter feed via Apify (needs an `APIFY_TOKEN`; serve through a Vercel function so the token stays server-side).
- Events feed.
- Real walking routes for quests (currently a smoothed curve through the stops).
- Higher-detail street texture for SF proper; vector roads when zoomed in.
