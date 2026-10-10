# Building Greening — Presentation Architecture

## Required experience

A professional opens an authorized IFC building, defines roof, facade, balcony/terrace and ground regions, confirms their use and usable areas, compares two complete planting plans on the same model, switches before/after, and exports a consistent report and machine-readable handoff. IFC geometry remains the interactive page background. Project, Inspect, Compare and View are initially closed nonmodal panels; closing them preserves the model, inputs and camera.

```text
IFC / architectural sample
          ↓
That Open display geometry + stable GlobalId + model content hash
          ↓
Inspect: geometry/identity screening + voice/text questions
          ↓
Blue model recommendations → click IFC components to accumulate green selections
          ↓
Review each face and usable area / define ground rectangles outside building footprint
          ↓
Extract display face → optional edge strip → acknowledge exterior/available space and checks → confirm usable area
          ↓
Shared region contract
          ↓
Light-touch plan / Landscape mix (systems for all four region types)
          ↓
Independent 3D overlays + deterministic region/aggregate calculations
          ↓
Before/after on original model + HTML report + JSON handoff
```

## Stack and module ownership

The browser app retains plain JavaScript, Vite, Three.js and the installed That Open Components/Components Front/Fragments/WebIFC/Camera Controls packages. No backend, UI framework replacement, new runtime dependency or directory change is introduced. Local IFC files remain in the browser; bundled samples carry source links and redistribution notices. Voice recognition is an explicitly initiated browser API and may use the browser provider's speech service; it is separate from local IFC processing.

- `src/adapters/bim-viewer.js` (A) owns initialization, IFC/Fragments import, camera, selection, candidate lookup, shared region preparation, single and atomic batch confirmation, independent overlay rendering, model replacement and cleanup.
- `src/adapters/greening-geometry.js` (A) handles world transforms, face filtering, edge-strip clipping and continuous clipped area-proportional visual coverage. Separating geometry from browser lifecycle permits meaningful tests against original IFC triangles.
- `src/adapters/planting-visuals.js` (A) builds independent procedural planting systems from clipped coverage geometry. Separating appearance from the viewer keeps area conservation and placement sampling testable; it reuses Three.js with no new dependency or directory.
- `src/domain/region-screening.js` (A/C integration) isolates conservative IFC identity, slope, upper-envelope and footprint screening from rendering. This pure module makes compatibility rules testable without a browser; it adds no dependency, directory or backend. Thresholds are presentation assumptions, not building-code checks.
- `src/domain/region-confirmation.js` (A/B integration) validates single or batch confirmations before any region collection mutation. Extracting the existing area/identity/overlap checks into a pure module ensures a later invalid region cannot partially commit a set and makes failure rollback testable; it adds no dependency or directory.
- `src/domain/greening-plan.js` (B/C integration) defines two presentation profiles for all four region types and aggregates the existing deterministic calculator. The original roof-shaped calculator input is an internal compatibility adapter; exported results use region identifiers. This avoids replacing working arithmetic or adding a second calculation engine.
- `src/domain/calculate.js` (B) retains unit/provenance validation and deterministic intervention arithmetic.
- `web/` (D) owns floating panels, region confirmation/list/removal, plan selection, before/after controls, comparison period/budget and report/JSON exports.
- `scripts/check-greening.mjs` tests original IFC geometry through face extraction, coverage and calculation without asserting browser or engineering acceptance.

## Region contract and provenance

A confirmed region includes `id`, project/model version, region type, IFC GlobalId/local ID when present, display geometry source, optional edge-strip crop or ground rectangle placement, display area estimate and a separately user-confirmed `usableArea` quantity. Display geometry comes from the loaded IFC, but its area is an estimate assuming the renderer coordinate unit is metres. The proposed role and usable area require explicit confirmation. IFC categories, scalar attributes and names provide initial identity screening; this does not resolve property-set relationships or establish physical exposure. Roof candidates must have upward geometry and a compatible roof identity or upper-envelope slab, with average slope at most 20°. Terrace candidates require explicit balcony/terrace identity and approximately horizontal geometry (at most 5° average slope). Generic floor cropping cannot create a terrace identity. Facade candidates need outward near-vertical wall geometry and are excluded when scalar attributes or names mark them internal. Geometry alone cannot detect all interiors, occlusion, services, structural capacity or openings not modeled as holes. Unknown exterior status stays conditional. Ground regions are user-defined design rectangles and are never labelled IFC boundaries or owned land.

The viewer rejects missing/current-model selection, geometry without a suitable display face, invalid dimensions, stale drafts, duplicate component assignment and overlapping ground rectangles or rectangles intersecting the conservative building bounding footprint. Confirmed usable area must fit within the selected display surface. Roof/terrace extraction keeps upward-facing triangles; facade extraction keeps outward-facing near-vertical triangles. User-selected edge strips clip existing triangles and preserve their holes/slopes. They do not infer an approved balcony boundary.

Each overlay uses confirmed area / extracted display area × system coverage fraction. A shared clipping plane moves across the longer horizontal dimension, with its depth solved against actual clipped triangle area. This creates a continuous planted strip while preserving source openings, with surface area matching deterministic coverage. The vegetation layer uses the same clipped triangles; area-weighted seeded sampling adds decorative plants independently of triangle count. The strip direction is a concept presentation choice, not an optimized layout. Light-touch roofs use folded low foliage and small flowers; Landscape mix roofs use raised beds and volumetric shrubs. Facades distinguish sparse climber leaf clusters/support stems from textured dense living walls. Terraces use planter boxes and shrubs; ground uses low vegetation or shrubs and small trees. A sampled footprint-clearance check avoids modeled holes and edges but is approximate, not collision or engineering validation. Decorative sizes, density and species are illustrative; counts do not enter area, cost or carbon calculations. The appearance is a concept visualization, not construction assemblies or a photoreal planting simulation. Selection uses a muted blue highlight; showing an After plan clears it to distinguish component selection from green planting. The original model object and source IFC bytes are never edited. Before hides overlays; After and plan changes rebuild them using the same region data. Model replacement/disposal clears drafts, selections, regions, GPU overlay geometries, materials and generated textures. Each plant kind is drawn with instancing and bounded density. The That Open excluded-material pass restores original planting colors after the BIM pen/ambient-occlusion passes, including technical drawing mode; disposal removes those material references before freeing resources.

## Calculations and report

Each plan uses the same regions, comparison period and budget. Per-region cost is installation plus period maintenance. Carbon difference is installation embodied emissions minus assumed avoided operational emissions over the period. Presentation profiles currently contain assumed factors, with explicit source/provenance. Terrace and ground profiles assume zero avoided operational emissions; no unsupported tree sequestration term is added. Aggregate budget checks use total installation cost across regions. Duplicate IDs, mixed model versions or mixed projects are rejected. Plan results preserve the entered budget (including zero), with an explicit within-budget status; a missing budget is recorded as null. Budget status is visible on each comparison card, and report inputs retain both period and budget.

The HTML report and JSON handoff are generated from the same current region/plan inputs used on screen. They retain model version, IFC identity, ground placement/crops, confirmed areas, plan coverage, factors, calculation versions, totals, scope and unresolved checks. Names/properties are escaped in exported HTML. Report generation rejects missing regions or invalid comparison inputs. No external AI inference, government approval, certification or marketplace transaction is claimed by these exports; those integrations remain separate team responsibilities.

## Rendering and interface

The PostproductionRenderer uses shaded edges/ambient occlusion with technical/basic alternatives. Camera motion events disable expensive passes while moving and restore the selected style afterward. Rotation speed is 0.9, truck speed 1.8, dolly speed 2.2, smooth time 0.1 seconds and dragging smooth time 0.035 seconds. Full viewport size stays stable while panels open. Fit includes planned ground regions. The comparison-input shortcut opens Project, expands its inputs and focuses the comparison period. When component selection changes the inferred region type, the previous edge-strip choice is reset rather than silently carried to another type. Native dialog close buttons, same-button toggles and Escape support return focus; component selection opens Inspect without taking focus from the model. Narrow screens constrain panels above the dock with internal scrolling; reduced-motion preferences disable animations.

The bottom-right zoom readout uses the latest fitted view as 100%. Perspective magnification is camera zoom divided by camera-target distance; orthographic magnification uses camera zoom. Camera update events refresh only changed integer percentages, so orbit/pan preserve the reference while dolly/zoom change the readout. Loading a model, Fit, and camera presets establish a new reference after fitting completes. The indicator hides when no valid model view exists and sits above the dock on narrow screens. This is a relative navigation reference, not a physical drawing scale.

Workspace buttons and the IFC upload control share a water-ripple interaction. A delegated pointer/keyboard handler covers static controls and dynamic region-removal buttons, starts the wave at the pointer or button centre, and animates only transform/opacity using the browser Web Animations API. The clipped ripple stays behind button text, inherits its colour, ignores disabled controls and respects reduced-motion preferences. Animations remove their temporary nodes on completion/cancellation; hot reload removes handlers and active waves. No dependency or framework change is needed.

## Inspect location guidance and voice interaction

Inspect integrates selected-location review, IFC source details, voice/text questions and region confirmation. Screening runs after import without opening a panel. Blue highlights identify up to three roof, two facade and two explicit terrace candidates ranked by compatible display area, excluding assigned or duplicate GlobalIds. These are conditional starting points, not AI inference, budget optimisation or engineering approval. Users click source components directly to toggle a persistent proposal; clicking elsewhere or clearing the focused component preserves the set. Previously selected locations and edited areas survive rerunning screening. Inspect lists only selected locations and their editable areas/reasons/checks; Use recommended locations adds to existing choices. Full source details and custom strip/courtyard controls are collapsed by default. Available ground land cannot be inferred.

The viewer maintains separate That Open Highlighter styles for focused inspection, recommendations and picked locations, with picked > recommended > focused priority. Physical picks are processed in arrival order independently of the latest focused-component callback, so slower metadata reads cannot erase earlier clicks. Programmatic locating does not toggle proposal membership. Highlight writes are serialized and bound to the current model instance/content hash; replacement clears all styles and proposal state. Recommendation/picked colors are hidden in After previews to distinguish source-location selection from actual planting overlays, and restored for Before/selection. No dependencies or frameworks were added.

The recommendation and draft paths share conservative rules. Explicit exterior/availability and usable-area acknowledgement is required before adding a region or a whole selected set. Changes to chosen areas/locations reset acknowledgement. Batch addition rereads source identity and geometry, checks every member before one collection update, and rejects invalid, duplicate, stale or overlapping regions without changing existing regions. Compare aggregates all confirmed regions. Source screening and acknowledgements are exported with each region.

Browser SpeechRecognition/webkitSpeechRecognition offers requested `zh-HK`, `zh-CN` and `en-US` languages when supported. Recording starts only on a user action. Users review/edit transcripts and separately ask; transcripts never automatically create regions. Unsupported browsers, permission/network/language errors preserve text input. Closing Inspect, model replacement and hot reload stop voice activity. Cached screening is scoped to the current model and stale results are discarded.

This is deterministic geometry/identity guidance with browser speech interaction. Proposals and explanations are rule-based by default; no credentials or external AI backend are bundled. `src/domain/ai-narrator.js` optionally connects a user-supplied HTTPS chat-completions endpoint, sending only non-numeric proposal text. Replies containing a number with a unit, a large number, or approval/certification language are rejected, and any failure falls back to the rule-based text. An AI reply never supplies arithmetic, coverage, cost, carbon or structural approval. Free text selects known region topics rather than providing a general AI conversation. Current acceptance requires a real browser microphone check; source/build tests cannot verify recognition quality or Cantonese support.

## Assets and licenses

That Open Components is the implementation foundation; xeokit-bim-viewer is a UI reference only. Installed Components/Components Front/Fragments/Three.js/Camera Controls/Vite use MIT; WebIFC uses MPL-2.0 and its WASM/license are copied unchanged during asset preparation. All sample-specific sources, source revisions, checksums and redistribution notices are recorded in `public/samples/README.md`.

KIT office/house designs are fictional architectural examples; Schependomlaan is a documented residential design dataset. They are not claims of engineering approval. Schependomlaan is stored losslessly gzipped to fit GitHub's API transport constraint; Node built-ins restore its original IFC and verify the published SHA-256 before development/build. The large residential source is fetched only when selected. Static preview PNGs come from actual placed geometry and are distinct from browser screenshots.

## Acceptance boundary

A complete presentation flow requires real browser checks listed in `TEAM_TASKS.md`: region selection/confirmation, all four uses, plan/Before/After switching, period/budget changes, removal/model replacement and matching exports. Unit, geometry and build checks do not establish GPU performance, visual polish or pointer/dialog behavior. Engineering/factor validation remains disclosed in every result; a greening concept and intervention calculation do not establish whole-building net-zero status.
