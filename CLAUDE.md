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
pnpm tweets               # bake company X posts into public/data/tweets.json via Apify (needs APIFY_TOKEN; ~$0.005/company)
```

There are no tests yet. Verification is: `pnpm typecheck`, then run the app and look at it.
Pushing `main` deploys to production immediately (see Hosting), so verify locally before pushing.

## Layout

```
scripts/                data pipeline (run with tsx; Node 24)
  fetch.ts              downloads everything into data-cache/ (gitignored, ~170 MB)
  build-data.ts         composes public/data/* from the cache (the only place output files are written)
  fetch-tweets.ts       one Apify run per company → public/data/tweets.json (raw runs in data-cache/tweets-raw/)
  lib/overpass.ts       Overpass client: cached, retries, IPv4-first, one query at a time
  lib/osm.ts            the Overpass queries (bboxes for SF, downtown, full region)
  lib/terrain.ts        terrarium tiles → 1024² heightmap, RGB-encoded PNG
  lib/land.ts           census counties → shoreline polygons (mapshaper)
  lib/rent.ts           Zillow ZORI CSV + census ZCTA polygons for the rent choropleth
  lib/hoods.ts          SF neighborhood polygons + Census places for the neighborhood atlas
  lib/footprints.ts     footprint → minimum-area bounding box (position, size, bearing, fill ratio)
  lib/sfbuildings.ts    DataSF building footprints (every SF building, lidar heights)
  lib/overture.ts       Overture Maps footprints for the other detail areas (DuckDB over S3 parquet)
  lib/svg.ts            SVG builder + sharp rasteriser for the 4096² map texture
  lib/palette.ts        map colours and road stroke styles
src/
  lib/geo.ts            THE shared projection + constants (imported by scripts AND app)
  lib/blocks.ts         filler.bin codec (one box per house), shared with the pipeline
  lib/tweets.ts         Post/TweetsFile types (shared with the script), lazy loader + useTweets(companyId)
  lib/rent.ts           rent classes/colours shared by the pipeline (paints rent.webp) and the legend
  lib/hoods.ts          atlas tints, wash alpha and the hoods.json label type (shared with the pipeline)
  lib/world.ts          loads public/data, decodes the heightmap, exposes heights.yAt(x,z)
  lib/extrude.ts        building footprints → one merged geometry (earcut roofs, quad walls)
  store.ts              zustand app state: selection, active quest, layer toggles, flyTo requests
  scene/Scene.tsx       Canvas, lights, fog; mounts every scene layer
  scene/CameraRig.tsx   custom camera (keys/drag/scroll), bounds, floor, fly-to animation
  scene/viewStore.ts    camera state published for UI (minimap, label tiers)
  scene/Terrain.tsx     512² displaced grid + map texture, with each detail area's sharper inset mixed in by the shader
  scene/Water.tsx       translucent sea-level plane
  scene/HoodLabels.tsx  names for the neighborhood atlas; shown by apparent size (sqrt(area)/camera distance), culled to the view
  scene/Heatmap.tsx     ground washes (heat-food.webp, rent.webp, hoods.webp) draped on the shared terrain grid; one per kind, cross-fade
  scene/Buildings.tsx   true-outline extrusions + one instanced block per house (20×20 chunks), pastel paint + greyed roofs via onBeforeCompile
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
- **Deep links** (`#at=lat,lng,dist[,yaw]`, `#quest=`, `#company=`, `#landmark=`) are applied by
  `ui/DeepLink.tsx`; the first application is instant, later hash changes animate. Yaw is radians: 0 looks north,
  π looks south from the north side, ~4.3 looks in from the west-north-west (handy downtown, where towers block the south).
- **Quest mode / tour.** `store.openQuest(q)` selects a quest and flies to an overview; `questStep` is
  `null` (overview) or the current stop index; `beginQuest/nextStop/prevStop/goToStop` fly to each stop's
  predefined `view` (dist + yaw in `quests.ts`). While active: `QuestFrame` draws the coloured border, the
  header becomes the tour guide (quest-coloured title, Begin / Back / Next / Finish, Exit), `QuestProgress`
  shows the dot line top-right, the quest list and Layers panel hide, company chips hide (route pins carry
  the names), landmarks lose labels/hover/select. No check-off state: the owner removed it on purpose.
  Esc exits when nothing else is open. Anything new that adds clutter should respect `activeQuest`.
- **Layers panel folds.** Its header is a button and `L` toggles it (local state in `Layers.tsx`, like the quest list).
  The fold is a `grid-template-rows: 1fr → 0fr` transition; rows are pinned to the panel's bottom edge so they stay put
  while the top edge comes down. The body uses `overflow: clip` (unscrollable) and the rent key sits outside it, hidden
  while folded. Global key handlers must let checkboxes through: they keep focus after a click.
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
- Detail areas (`DETAIL_AREAS` in `geo.ts`: sf, eastbay, paloalto, sanjose; boxes must not overlap) are where the app goes
  street-level. Each gets (a) residential streets from OSM (`osm.fetchRoadsMinor`, one paced query per area), (b) a sharper
  inset of the map texture, `map-<id>.webp` (≈4–6 m/px against the regional ≈20 m/px): the same layers re-rasterised
  through an SVG `viewBox` window (`composeMap(size, view, …)` in step 4) so strokes keep their ground width, mixed over
  its rectangle with a feathered edge by `Terrain.tsx` (`onBeforeCompile`, one unrolled sampler per area), and (c) real
  building footprints (below). Adding a city = one entry there + `pnpm data` (≈3 min of Overture download, +GPU memory for
  its texture: 89 MB at 4096², 22 MB at 2048²). An 8192² regional texture was avoided on purpose (~360 MB with mipmaps).
- Houses in the detail areas are real (experiment, uncommitted at the time of writing). SF: `lib/sfbuildings.ts` downloads DataSF's "Building Footprints" (`ynuv-fyni`, the city's
  lidar survey: ~177k polygons, a measured height each, one keyless 118 MB request cached as `data-cache/sf-footprints.geojson`).
  It is the dataset OSM's SF buildings were imported from; Overpass was tried first and 429'd, then refused connections.
  `build-data.ts` step 5b fits a box to each footprint (`lib/footprints.ts`) and writes it into `filler.bin` beside the
  procedural blocks; footprints over 3,000 m², or over 500 m² and far from rectangular, go to `buildings.json` with their
  true outline. Boxes stand on their lowest corner so nothing floats on slopes. Downtown stays OSM (newer towers), split
  from the survey by centroid. Footprints under a landmark model's ground rectangle are dropped (`STANDS_IN_TOWN`, sized
  from `landmarkParts`), so a new landmark kind that stands among buildings belongs in that list; so are footprints under
  a company HQ block. The other areas: `lib/overture.ts` reads Overture Maps' buildings GeoParquet straight from S3 with
  DuckDB (`@duckdb/node-api`, dev-only; release pinned in `RELEASE`), cached as `data-cache/overture-<id>.ndjson`. ~79% of
  those carry a height; the rest are guessed from floor area. ~417k real boxes + ~6k true outlines in all.
- `Buildings.tsx` splits every chunk into houses (< 400 m², < ~20 m) and bigger blocks; house chunks are skipped beyond
  `HOUSE_RANGE` (25 km), where a house is about a pixel, so the far view doesn't draw millions of sub-pixel triangles.
- `filler.bin` is quantised (`src/lib/blocks.ts`, shared codec: float32 x/z, uint16 for the rest, 18 bytes a block).
- Procedural filler (step 6) now only fills 150 m cells with no real footprints near them, i.e. everything outside the detail areas.
  Density is tuned by spacing/prob there. The `-0.03` ground sink is baked into `filler.bin`, not applied by the renderer.
- Overpass punishes bursts: several 429s in a row end in refused connections for a good while. Pace any tiled query.

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
  new kind there (parts list, optional `landmarkLines` for thin geometry). Mark thin surface parts (stripes, struts)
  `detail: true` so the hover hull skips them, and give grid-aligned buildings a `bearing` (downtown SF is −9°).
  A landmark that *is* the building (kinds `pyramid`, `tower`, `coit`, `ferry`) has its OSM footprint dropped in `build-data.ts` step 5
  (`MODELLED`), otherwise the footprint extrudes as a prism around the model. A company housed in one sets `landmark: '<id>'`
  in `companies.ts`, so no HQ block is drawn inside the model and its chip rides above the landmark label.
  The `stack` part geo (rounded-square slabs along y, unit-normalised) builds tapering bodies and their floor bands as one mesh each.
  `fluted` is a ribbed tapering cylinder and `arcade` paints arched/square openings round a drum in one mesh (both used by Coit Tower).
  `arches` does the same on flat walls (rows of storeys, one or both opposite walls per mesh; the Ferry Building's arcades). Module-level
  helpers `box`, `drum`, `drumOpenings`, `wallOpenings` build these parts; avoid `rot` on long parts, it squares up the hover box.
  The Palace of Fine Arts adds `ringwall` (a ring of walls with real see-through arches, via ExtrudeGeometry), `columns` (free-standing
  columns at plan spots, one mesh, always `detail`) and `sector` (curved walls about a centre on the z axis). The last two normalise to
  their own bounding box so pos/scale stay true for the hover box and the pipeline's clearing; a sector's hover hull is built already
  offset (`partGeometry(p, grow)`, see `hullGeoFor`) because scaling a curve about its centre doesn't outline it. The clearing is
  symmetric about the landmark point, so a lopsided complex puts its origin mid-complex (the Palace's is 25 m behind the rotunda).
  Fisherman's Wharf & Pier 39 (`wharf`) is a diorama: the pier is true to the footprints (origin mid-pier, stands at sea level like
  bridges/islands), everything round it (marinas, boats, sea lions, the wharf sign and the SkyStar wheel, both pulled in from Taylor St)
  is `detail` so the clearing stays pier-sized. `blocks` draws any number of same-coloured boxes or gabled roofs as one mesh (a few
  hundred boats are three parts). In `build-data.ts` step 5 a `COMPLEX` kind (only `wharf`) also drops every downtown OSM footprint
  centred under its clearing (the pier's two dozen shops); the other modelled kinds still drop just the footprint they stand in.
  Two more `Part` flags: `hullOnly` (never drawn, only its hover hull: one clean outline round a huddle of `detail` parts such as the
  Painted Ladies or the pier's shops, and it sizes the clearing; stop it at the eaves so the grown hull just reaches the ridges) and
  `scenery` (drawn, but outside the hover box and label height: Stanford's Main Quad beside Hoover Tower). A landmark's `covers`
  points make the pipeline drop the real footprints containing them (the Quad is one solid 5 ha polygon in Overture).
  `blocks` also does roofs with the ridge along x and pyramids.
  Models on a hilltop stand on the height at their centre only, so run their base below y = 0 (Coit has a green knoll for this).
- `src/data/quests.ts`: ordered stops with a to-do and a tour `view` each. No persisted progress.
- Restaurant heatmap: `osm.fetchFood()` (amenity=restaurant|cafe|fast_food, bars excluded on purpose) is binned,
  gaussian-blurred (σ ≈ 200 m), sqrt-normalised to the 99.5th percentile and coloured through `palette.ts`'s heat
  ramp in `build-data.ts` step 8. Retune the ramp or radius there and run `pnpm data`; the app only drapes the texture.
- Rent heatmap: Zillow's ZORI ZIP CSV (`data-cache/zori-zip.csv`, free, no key; delete it to pull a newer month) joined to
  Census 2020 ZCTA polygons (67 MB national zip, clipped with mapshaper) in `build-data.ts` step 9. Classes and colours are
  in `src/lib/rent.ts`; `rent.json` carries the as-of month (no longer shown in the UI). The legend is a key tab hanging off the
  Layers panel beside the Rent row (absolute, always mounted, placed by `--key-b` measured in `Layers.tsx`) so toggling never resizes the panel. Not live: refresh = `pnpm data` + commit.
- Neighborhood atlas: `build-data.ts` step 10 paints SF's 37 classic neighborhoods (Zillow boundaries via the
  `blackmad/neighborhoods` GitHub mirror, because DataSF's export was returning 503) plus Census 2023 places for every
  other city/town into `hoods.webp`, greedy-coloured from `HOOD_TINTS` so bbox-neighbours differ. `hoods.json` holds one
  label per area (pole of inaccessibility, km²). The SF city polygon is unpainted and flagged `group`, so its label
  hands over to the neighborhoods as you descend. While this wash is on, landmark labels show on hover only (several
  share a name with their neighborhood). Oakland/Berkeley/San Jose are single areas for now.
- Washes are exclusive: `store.heat` is `'food' | 'rent' | 'hoods' | null` and `toggleHeat(kind)` swaps; each `Heatmap` instance
  fades itself in/out, so switching cross-fades.
- Company X feed: **baked, never fetched at runtime.** `pnpm tweets` runs one Apify run per company
  (`kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest`, query
  `from:HANDLE -filter:replies -filter:retweets`, 20 items, ~16 s and $0.005 each) and writes the newest 5
  original posts per company to `public/data/tweets.json`, which `DetailCard` loads lazily. The token
  lives in `.env.local` as `APIFY_TOKEN` (gitignored) and must never reach Vercel or the browser.
  Gotchas: the apidojo actors refuse API use on Apify's Free plan and return `{demo: true}` items with a
  SUCCEEDED status (the script treats all-demo output as a failure); when X search finds nothing this
  actor pads the run with `mock_tweet` items and still bills its minimum (logged as "no results", the
  previous posts are kept); `usageTotalUsd` settles after the run so per-run cost logs read 0.
  `--only id,id`, `--dry`, `--from-cache` (re-normalise the raw files for free). Refresh = `pnpm tweets` +
  commit; a nightly GitHub Action for this is planned but not set up.

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
