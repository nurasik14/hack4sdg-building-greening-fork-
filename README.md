# Building Greening Decision Support

An IFC-based presentation workspace for building professionals to compare greening plans across roofs, facades, balconies/terraces and ground areas. Architects, BIM coordinators and sustainability designers prepare regions and scenarios; developers or building owners review the results.

## Presentation flow

1. Run `npm ci` and `npm run dev`, then open `http://127.0.0.1:5173/` (Node 20.19+ or 22.12+). The KIT office architectural example opens as a full-viewport interactive model.
2. Location screening runs after loading. Blue highlights mark a conditional starting set. **Click the building itself** to toggle eligible locations green; earlier selections stay highlighted when clicking another component or blank space. Incompatible windows/floors are not added. Inspect stays closed while selecting. Open **Inspect** to review only the selected locations, edit each usable area and read missing checks; **Use recommended locations** adds the suggested set while retaining other choices. Acknowledge the reviewed set, then **Add selected regions to both plans** and **Compare combined plans**. Optional **Custom strip or courtyard** provides detailed cropping and manually defined ground regions. Ordinary floors cannot be treated as terraces.
3. Click **Review region surface**, verify/edit the usable area within the extracted surface and acknowledge exterior/available space and unresolved professional checks, then confirm its type/area. Click **Add region to both plans**.
4. For **Ground / courtyard**, set rectangle dimensions and offsets before reviewing/confirming. The rectangle must stay outside the conservative building bounding footprint. Confirm ground level, available land and utilities. It is user-defined design geometry, not an IFC site/ownership boundary.
5. Open **Compare**, switch **Light-touch** / **Landscape mix**, and use **Before / After** on the model. Both plans use the same confirmed regions. Light-touch renders low roof vegetation and sparse climbers; Landscape mix renders roof shrubs, dense living walls and courtyard trees. Terrace concepts use planter boxes. These are illustrative 3D systems; vegetation counts do not change calculated coverage or impacts. Region removal updates both plans.
6. In **Project**, edit the comparison period/budget or load another model. Replacement clears old regions and overlays.
7. Download the HTML comparison report and JSON handoff. They retain current model/IFC identities, areas, systems, factors, checks and results for team integration.

**Voice interaction stays in Inspect.** Expand **Voice input & questions**, choose Cantonese/Mandarin/English, start recording and review/edit the transcript. Choose **Ask about locations** to run the same screening, or type directly. Nothing is added automatically. Microphone access and language support depend on the browser; speech audio may be processed by its speech service. There is no separate Assist panel. Explanations are rule-based by default; **Optional AI explanation service** in Inspect can connect a user-supplied HTTPS chat-completions endpoint. Only proposal text is sent — never IFC data, areas, costs or carbon figures — and any reply containing a number or approval language is rejected, with a silent fallback to the rule-based text. The key stays in the tab and is never saved or exported.

A/B/C/D presentation responsibilities and browser acceptance are in [TEAM_TASKS.md](TEAM_TASKS.md); implementation and provenance boundaries are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Verification

`npm test` runs deterministic calculation, identity, whole-set confirmation without partial mutation, four-region aggregation, edge clipping, continuous visual coverage area, compatibility screening, seeded vegetation sampling, hole/edge clearance, bounded density and four-type planting coverage checks. `npm run build` produces the browser build. `node scripts/check-greening.mjs` checks original KIT office candidate screening, then separately exercises synthetic four-region geometry extraction, coverage and plan calculation without claiming browser or spatial suitability validation. `npm run test:ifc -- /path/to/file.ifc` verifies parser/conversion identities.

## Evidence boundaries

Current costs/carbon factors are explicitly labelled presentation assumptions. Display mesh areas assume renderer units are metres and require user confirmation; confirmed area is not professional engineering approval. The comparison covers proposed interventions only, excludes plant carbon sequestration, and does not establish whole-building emissions or net-zero status. Structural loading, waterproofing, drainage, facade fixings, access/fire strategy, irrigation and land/utility availability remain unresolved checks.

Scenario profiles and location screening are structured rules. Explanations are labelled `rule-based` or `model-generated` in the interface and in both exports; a generated narrative never supplies arithmetic or approval. No government incentive approval, certification or marketplace transaction is claimed. Local IFC files are processed in the browser.

## Architectural samples and licensing

Project offers original KIT office/house IFC designs (explicitly fictional), the documented Schependomlaan residential design model, official That Open school architecture Fragments/structural IFC and the compact buildingSMART test house. Source links, byte hashes, license notices and local geometry previews are in `public/samples/README.md`. Schependomlaan's byte-identical original IFC is restored from the bundled lossless gzip by the asset-preparation script; its 49.3 MB conversion may take longer.

The viewer reuses [That Open Components](https://github.com/ThatOpen/engine_components). [xeokit-bim-viewer](https://github.com/xeokit/xeokit-bim-viewer) supplies UI inspiration only. No xeokit implementation is included.
