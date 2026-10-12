import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import workerUrl from '@thatopen/fragments/worker?url';
import { createPlantingVisual } from './planting-visuals.js';
import { confirmRegionBatch } from '../domain/region-confirmation.js';
import { screenRegion } from '../domain/region-screening.js';
import { normalizeSelection } from './selection-data.js';
import { extractGreeningSurface, groundSurface, coveredSurface, cropGreeningSurface } from './greening-geometry.js';

/** IFC display, confirmed greening regions, scenario overlays and frontend handoff. */
export async function createBimViewer(container, { onSelection, onStatus, onModel, onRegions = () => {}, onZoom = () => {}, onPick = () => {} }) {
  const components = new OBC.Components();
  const world = components.get(OBC.Worlds).create();
  let currentModel = null;
  let modelVersion = null;
  let categoryById = new Map();
  let selectionEpoch = 0;
  let loading = false;
  let programmaticSelection = 0;
  let pickQueue = Promise.resolve();
  let proposalQueue = Promise.resolve();
  let proposalState = null;
  let displayIds = [];
  let buildingBox;
  let pendingRegion;
  let regionSequence = 0;
  let regionEpoch = 0;
  const regions = new Map();
  const overlays = new THREE.Group();
  let activePlan = null;
  let showAfter = false;

  try {
    world.scene = new OBC.SimpleScene(components);
    world.scene.setup({
      backgroundColor: new THREE.Color('#f1f3f4'),
      ambientLight: { color: new THREE.Color('#ffffff'), intensity: 1.1 },
      directionalLight: { color: new THREE.Color('#ffffff'), intensity: 1.8, position: new THREE.Vector3(40, 60, 25) }
    });
    world.scene.three.add(overlays);
    world.renderer = new OBF.PostproductionRenderer(components, container);
    world.renderer.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    world.camera = new OBC.OrthoPerspectiveCamera(components);
    const controls = world.camera.controls;
    let fittedMagnification = null;
    let lastZoomPercent = null;
    function magnification() {
      const camera = world.camera.three;
      return camera.isOrthographicCamera ? camera.zoom : camera.zoom / controls.distance;
    }
    function publishZoom() {
      const scale = magnification();
      const percent = fittedMagnification && Number.isFinite(scale) && scale > 0
        ? Math.max(1, Math.round(100 * scale / fittedMagnification)) : null;
      if (percent === lastZoomPercent) return;
      lastZoomPercent = percent;
      onZoom(percent);
    }
    function resetZoomReference() {
      fittedMagnification = magnification();
      publishZoom();
    }
    controls.azimuthRotateSpeed = 0.9;
    controls.polarRotateSpeed = 0.9;
    controls.truckSpeed = 1.8;
    controls.dollySpeed = 2.2;
    controls.smoothTime = 0.1;
    controls.draggingSmoothTime = 0.035;
    controls.dollyToCursor = true;
    await world.camera.controls.setLookAt(25, 20, 25, 0, 0, 0);
    components.init();
    world.dynamicAnchor = false;
    const grid = components.get(OBC.Grids).create(world);
    grid.setup({ color: new THREE.Color('#b7c1c4'), primarySize: 10, secondarySize: 1, distance: 120 });
    const postproduction = world.renderer.postproduction;
    postproduction.enabled = true;
    postproduction.basePass.isolatedMaterials.push(grid.material);
    postproduction.style = OBF.PostproductionAspect.COLOR_PEN_SHADOWS;
    postproduction.edgesPass.color.set('#526368');
    postproduction.edgesPass.width = 1;
    postproduction.smaaEnabled = true;
    postproduction.excludedObjectsEnabled = true;

    let cameraMoving = false;
    let renderStyle = 'shaded';
    // Camera motion events cover wheel/pinch as well as pointer dragging.
    // Keep expensive passes off until damping finishes, then restore the chosen style.
    controls.addEventListener('wake', () => {
      cameraMoving = true;
      postproduction.enabled = false;
    });
    controls.addEventListener('sleep', () => {
      cameraMoving = false;
      postproduction.enabled = renderStyle !== 'basic';
    });

    const fragments = components.get(OBC.FragmentsManager);
    fragments.init(workerUrl);
    const updateCamera = () => { fragments.core.update(); publishZoom(); };
    controls.addEventListener('update', updateCamera);
    world.onCameraChanged.add((camera) => {
      for (const [, model] of fragments.list) model.useCamera(camera.three);
      postproduction.updateCamera();
      fragments.core.update(true);
    });
    fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
      if (!material.isLodMaterial) {
        material.polygonOffset = true;
        material.polygonOffsetUnits = 1;
        material.polygonOffsetFactor = 1;
      }
    });
    fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(world.camera.three);
      world.scene.three.add(model.object);
      fragments.core.update(true);
    });

    const loader = components.get(OBC.IfcLoader);
    await loader.setup({ autoSetWasm: false, wasm: { path: '/wasm/', absolute: true } });
    components.get(OBC.Raycasters).get(world);
    const highlighter = components.get(OBF.Highlighter);
    highlighter.setup({ world, selectMaterialDefinition: {
      color: new THREE.Color('#7a99b2'), opacity: .45, transparent: true, renderedFaces: 0, priority: -1
    } });
    highlighter.multiple = 'none';
    // Focus is separate from persistent proposal membership. Every repeated click is delivered.
    highlighter.autoToggle.delete('select');
    highlighter.styles.set('recommended', { color: new THREE.Color('#72b4dd'), opacity: .78, transparent: true, renderedFaces: 0, priority: 0 });
    highlighter.styles.set('picked', { color: new THREE.Color('#24b38c'), opacity: .9, transparent: true, renderedFaces: 0, priority: 1 });

    highlighter.events.select.onHighlight.add(async (modelIdMap) => {
      const epoch = ++selectionEpoch;
      const model = currentModel;
      const version = modelVersion;
      if (!model || loading) return;
      const ids = modelIdMap[model.modelId];
      const localId = ids?.values().next().value;
      if (localId === undefined) return;
      const fromModel = programmaticSelection === 0;
      const dataPromise = Promise.all([model.getItemsData([localId]), model.getGuidsByLocalIds([localId])]);
      const resolveSelection = dataPromise.then(([data, guids]) => normalizeSelection({ modelVersion: version, localId, globalId: guids[0], category: categoryById.get(localId), data: data[0] }));
      // Rapid clicks must toggle in arrival order, even when IFC reads finish out of order.
      if (fromModel) pickQueue = pickQueue.then(async () => {
        const selection = await resolveSelection;
        if (model === currentModel && !loading) onPick(selection);
      }).catch(error => { if (model === currentModel && !loading) onStatus(`Could not select location: ${error.message}`); });
      try {
        const selection = await resolveSelection;
        if (epoch === selectionEpoch && model === currentModel) onSelection(selection);
      } catch (error) {
        if (epoch === selectionEpoch) onStatus(`Could not read component: ${error.message}`);
      }
    });
    highlighter.events.select.onClear.add(() => { selectionEpoch++; onSelection(null); });

    function clearOverlayObjects() {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      overlays.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of [].concat(object.material ?? [])) materials.add(material);
      });
      overlays.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) {
        postproduction.excludedObjectsPass.removeExcludedMaterial(material);
        if (material.map) textures.add(material.map);
        material.dispose();
      }
      for (const texture of textures) texture.dispose();
    }
    function renderOverlays() {
      clearOverlayObjects();
      if (!activePlan) return;
      for (const { data, surface } of regions.values()) {
        const profile = activePlan.profiles[data.type];
        if (!profile) continue;
        const fraction = Math.min(1, data.usableArea.value / surface.surfaceAreaM2 * profile.coverageFraction);
        const planting = createPlantingVisual({ positions: coveredSurface(surface, fraction), type: data.type, planId: activePlan.id, seed: data.globalId ?? data.id });
        planting.userData.regionId = data.id;
        // Restore original planting colors after BIM pen/AO passes, including technical drawing mode.
        planting.traverse(object => { if (object.material) postproduction.excludedObjectsPass.addExcludedMaterial(object.material); });
        overlays.add(planting);
      }
      overlays.visible = showAfter;
    }
    function publishRegions() { onRegions([...regions.values()].map(({ data }) => structuredClone(data))); }
    function resetRegions() {
      regionEpoch++; pendingRegion = null; regions.clear(); activePlan = null; showAfter = false;
      clearOverlayObjects(); publishRegions();
    }
    async function buildRegion({ type, selection, ground, crop }, context) {
      if (!currentModel || loading) throw new Error('Load a model before planning a region');
      if (!['roof','facade','terrace','ground'].includes(type)) throw new Error('Select a region type');
      const { model, version, epoch, selectionStamp } = context;
      const center = buildingBox.getCenter(new THREE.Vector3());
      let surface, globalId = null, localId = null, name, geometrySource, placement;
      if (type === 'ground') {
        placement = { ...ground, x: center.x + ground.offsetX, z: buildingBox.max.z + ground.offsetZ, y: buildingBox.min.y + .04 };
        surface = groundSurface(placement); name = `Courtyard region ${regionSequence + 1}`; geometrySource = 'user-defined rectangle beside the model; not an IFC site boundary';
      } else {
        if (!selection || selection.modelVersion !== version || !selection.globalId) throw new Error('Select an IFC component in the current model first');
        const meshes = (await model.getItemsGeometry([selection.localId]))[0];
        if (epoch !== regionEpoch || currentModel !== model || loading || (selectionStamp !== null && selectionStamp !== selectionEpoch)) throw new Error('Selection changed while preparing the region');
        model.object.updateMatrixWorld(true);
        surface = extractGreeningSurface(meshes, model.object.matrixWorld, type, center);
        const screening = screenRegion({ type, selection, surface, buildingBox });
        if (!screening.canPrepare) throw new Error(screening.reasons.join(' '));
        surface = cropGreeningSurface(surface, crop);
        globalId = selection.globalId; localId = selection.localId; name = selection.name;
        geometrySource = 'IFC display triangles; selected use is user-defined, not engineering approval';
      }
      const screening = screenRegion({ type, selection, surface, buildingBox });
      if (!screening.canPrepare) throw new Error(screening.reasons.join(' '));
      const id = `${version}:region:${++regionSequence}`;
      const data = { id, projectId: 'LOCAL-BUILDING-REVIEW', modelVersion: version, type, globalId, localId, name, geometrySource, surfaceCrop: type === 'ground' ? null : crop, screening, geometryAreaM2: surface.surfaceAreaM2, geometryAreaProvenance: 'assumed', geometryAreaSource: 'Display mesh estimate assuming model coordinates are metres; user confirmation required', placement: placement ?? null };
      if (epoch !== regionEpoch || currentModel !== model || loading) throw new Error('The building or planning state changed; review the regions again');
      return { data, surface, selectionStamp };
    }
    async function prepareRegion(request) {
      const context = { model: currentModel, version: modelVersion, epoch: ++regionEpoch, selectionStamp: selectionEpoch };
      pendingRegion = null;
      pendingRegion = await buildRegion(request, context);
      return structuredClone(pendingRegion.data);
    }
    function confirmRegion(id, area, constraintsConfirmed = false) {
      if (!constraintsConfirmed) throw new Error('Confirm the exterior/available region and unresolved review requirements first');
      if (!pendingRegion || pendingRegion.data.id !== id || pendingRegion.data.modelVersion !== modelVersion || loading) throw new Error('Review the region again before confirming');
      if (pendingRegion.data.type !== 'ground' && pendingRegion.selectionStamp !== selectionEpoch) throw new Error('Selection changed; review the region again');
      const { data, surface } = pendingRegion;
      const [confirmed] = confirmRegionBatch({ entries: [{ data, area }], existing: [...regions.values()].map(region => region.data), constraintsConfirmed });
      regions.set(id, { data: confirmed, surface }); pendingRegion = null; regionEpoch++;
      publishRegions(); renderOverlays(); return structuredClone(confirmed);
    }
    async function addCandidateRegions(requests, constraintsConfirmed = false) {
      if (!currentModel || loading) throw new Error('Load a building before adding regions');
      if (!constraintsConfirmed || !requests.length) throw new Error('Select regions and confirm their areas and unresolved checks first');
      const context = { model: currentModel, version: modelVersion, epoch: ++regionEpoch, selectionStamp: null };
      pendingRegion = null;
      const ids = requests.map(request => request.localId);
      if (requests.some(request => request.modelVersion !== context.version || !displayIds.includes(request.localId))) throw new Error('A candidate belongs to an old or missing model');
      const [data, guids] = await Promise.all([context.model.getItemsData(ids), context.model.getGuidsByLocalIds(ids)]);
      if (context.model !== currentModel || context.epoch !== regionEpoch || loading) throw new Error('The building changed; find candidates again');
      const prepared = [];
      for (let index = 0; index < requests.length; index++) {
        const request = requests[index];
        if (!guids[index] || request.globalId !== guids[index]) throw new Error('The source component identity changed');
        const selection = normalizeSelection({ modelVersion: context.version, localId: ids[index], globalId: guids[index], category: categoryById.get(ids[index]), data: data[index] });
        const region = await buildRegion({ type: request.type, selection, crop: { side: 'full' } }, context);
        prepared.push({ ...region, area: request.area });
      }
      // Every geometry, identity and confirmation must pass before a single collection update.
      const confirmed = confirmRegionBatch({ entries: prepared, existing: [...regions.values()].map(region => region.data), constraintsConfirmed });
      confirmed.forEach((data, index) => regions.set(data.id, { data, surface: prepared[index].surface }));
      regionEpoch++;
      publishRegions(); renderOverlays();
      return structuredClone(confirmed);
    }

    async function setView(direction) {
      if (!currentModel || loading) return;
      const sphere = await world.camera.getItemsBounding({ [currentModel.modelId]: new Set(displayIds) });
      const center = sphere.center;
      const offset = direction === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(1, 0.7, 1);
      offset.normalize().multiplyScalar(Math.max(sphere.radius * 3, 1));
      await world.camera.controls.setLookAt(center.x + offset.x, center.y + offset.y, center.z + offset.z, center.x, center.y, center.z, true);
      await world.camera.fitToItems({ [currentModel.modelId]: new Set(displayIds) });
      resetZoomReference();
    }

    async function openFile(file, format) {
        if (loading) throw new Error('A model import is already in progress');
        if (!file.name.toLowerCase().endsWith(`.${format}`)) throw new TypeError(`Select a ${format.toUpperCase()} file`);
        loading = true;
        highlighter.enabled = false;
        selectionEpoch++;
        onSelection(null);
        let replacing = false;
        try {
          onStatus(`Reading ${format === 'ifc' ? 'IFC' : 'official Fragments sample'}…`);
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (format === 'ifc' && !new TextDecoder().decode(bytes.slice(0, 256)).includes('ISO-10303-21')) throw new TypeError('This file does not contain a supported IFC STEP header');
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          const version = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
          proposalState = null;
          await highlighter.clear();
          replacing = true;
          resetRegions();
          fittedMagnification = null;
          publishZoom();
          if (currentModel) {
            world.scene.three.remove(currentModel.object);
            await fragments.core.disposeModel(currentModel.modelId);
          }
          currentModel = null;
          displayIds = [];
          categoryById = new Map();
          onModel(null);
          onStatus(format === 'ifc' ? 'Converting IFC geometry…' : 'Opening the official school architecture model…');
          const model = format === 'ifc' ? await loader.load(bytes, true, version, { processData: {
            progressCallback: (progress) => onStatus(`Converting IFC… ${Math.round(progress * 100)}%`)
          } }) : await fragments.core.load(bytes, { modelId: version });
          currentModel = model;
          modelVersion = version;
          const [categories, geometryIds] = await Promise.all([model.getItemsOfCategories([/.*/]), model.getItemsIdsWithGeometry()]);
          for (const [category, ids] of Object.entries(categories)) for (const id of ids) categoryById.set(id, category);
          if (!geometryIds.length) throw new Error('The IFC contains no supported display geometry');
          displayIds = geometryIds;
          const visibleIds = new Set(geometryIds);
          const categoryCounts = Object.entries(categories).map(([name, ids]) => ({ name, count: ids.filter((id) => visibleIds.has(id)).length })).filter(({ count }) => count > 0).sort((a, b) => b.count - a.count);
          const box = await model.getMergedBox(geometryIds);
          buildingBox = box.clone();
          grid.three.position.y = box.min.y - 0.05;
          const sphere = box.getBoundingSphere(new THREE.Sphere());
          const center = sphere.center;
          const distance = Math.max(sphere.radius * 2.5, 1);
          await world.camera.projection.set('Perspective');
          await world.camera.controls.setLookAt(center.x + distance, center.y + distance * 0.7, center.z + distance, center.x, center.y, center.z);
          await world.camera.fitToItems({ [model.modelId]: new Set(geometryIds) });
          resetZoomReference();
          await fragments.core.update(true);
          const info = { modelVersion: version, fileName: file.name, sourceFormat: format, componentCount: geometryIds.length, categoryCounts };
          onModel(info);
          onStatus(`${file.name} · ${geometryIds.length.toLocaleString()} components. Click a component to inspect it.`);
          return info;
        } catch (error) {
          if (replacing && currentModel) {
            world.scene.three.remove(currentModel.object);
            await fragments.core.disposeModel(currentModel.modelId);
            currentModel = null;
          }
          if (replacing) {
            fittedMagnification = null;
            publishZoom();
            modelVersion = null;
            displayIds = [];
            categoryById.clear();
            onModel(null);
          }
          throw error;
        } finally {
          loading = false;
          highlighter.enabled = true;
        }
      }

    function applyProposalHighlights() {
      const state = proposalState, model = currentModel;
      proposalQueue = proposalQueue.catch(() => {}).then(async () => {
        if (!model || loading || currentModel !== model || state?.version !== modelVersion) return;
        const visible = new Set(displayIds);
        for (const style of ['recommended', 'picked']) {
          if (currentModel !== model || loading) return;
          const valid = showAfter ? [] : state[style].filter(id => visible.has(id));
          if (valid.length) await highlighter.highlightByID(style, { [model.modelId]: new Set(valid) }, true, false);
          else await highlighter.clear(style);
        }
      });
      return proposalQueue;
    }

    // Lifecycle: the host view is hidden with display:none when the user navigates away, which
    // collapses the container to 0x0. Keep the renderer, camera aspect and post-processing passes
    // in sync with the real container size, and stop rendering while the view is hidden.
    let disposed = false;
    function syncSize() {
      if (disposed) return;
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return; // hidden: keep the last good size
      world.renderer.resize();
      world.camera.updateAspect();
      postproduction.updateCamera();
      world.renderer.needsUpdate = true;
      fragments.core.update(true);
    }
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(syncSize) : null;
    resizeObserver?.observe(container);
    const canvas = world.renderer.three.domElement;
    const onContextLost = (event) => { event.preventDefault(); onStatus('3D view paused: graphics context was lost. Restoring…'); };
    const onContextRestored = () => { syncSize(); onStatus('3D view restored.'); };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    return {
      /** Stop rendering while the host view is hidden. */
      pause() { if (!disposed) world.renderer.enabled = false; },
      /** Resume after the host view is shown again; always re-measures the container. */
      resume() {
        if (disposed) return;
        world.renderer.enabled = true;
        // Wait one frame so the freshly un-hidden container has been laid out.
        requestAnimationFrame(() => { syncSize(); void controls.update?.(0); });
      },
      resize: syncSize,
      openIfc: (file) => openFile(file, 'ifc'),
      openFragments: (file) => openFile(file, 'frag'),
      setView,
      prepareRegion,
      confirmRegion,
      addCandidateRegions,
      async listRegionCandidates(type) {
        if (!currentModel || loading || type === 'ground') return [];
        const model = currentModel, version = modelVersion;
        const pattern = type === 'facade' ? /^IFCWALL/ : /^(IFCROOF|IFCSLAB)$/;
        const ids = displayIds.filter((id) => pattern.test(categoryById.get(id)));
        const [data, guids] = await Promise.all([model.getItemsData(ids), model.getGuidsByLocalIds(ids)]);
        if (model !== currentModel || version !== modelVersion) return [];
        const candidates = ids.map((localId, index) => normalizeSelection({ localId, modelVersion: version, globalId: guids[index], category: categoryById.get(localId), data: data[index] }));
        const accepted = [];
        for (const candidate of candidates) {
          if (model !== currentModel || version !== modelVersion) return [];
          try {
            const meshes = (await model.getItemsGeometry([candidate.localId]))[0];
            model.object.updateMatrixWorld(true);
            const surface = extractGreeningSurface(meshes, model.object.matrixWorld, type, buildingBox.getCenter(new THREE.Vector3()));
            const screening = screenRegion({ type, selection: candidate, surface, buildingBox });
            if (screening.canPrepare) accepted.push({ ...candidate, screening, geometryAreaM2: surface.surfaceAreaM2 });
          } catch { /* No compatible face means no candidate for this region type. */ }
        }
        if (model !== currentModel || version !== modelVersion) return [];
        return accepted.sort((a, b) => b.geometryAreaM2 - a.geometryAreaM2);

      },
      removeRegion(id) { regionEpoch++; pendingRegion = null; regions.delete(id); publishRegions(); renderOverlays(); },
      setPlan(plan, after = true) { activePlan = plan; showAfter = after; if (after) void highlighter.clear('select'); void applyProposalHighlights().catch(error => onStatus(error.message)); renderOverlays(); },
      setBeforeAfter(after) { if (after) void highlighter.clear('select'); showAfter = after; void applyProposalHighlights().catch(error => onStatus(error.message)); overlays.visible = Boolean(activePlan) && after; },
      getRegions() { return [...regions.values()].map(({ data }) => structuredClone(data)); },
      setRenderStyle(style) {
        renderStyle = style;
        postproduction.enabled = !cameraMoving && style !== 'basic';
        if (style !== 'basic') {
          postproduction.style = style === 'technical' ? OBF.PostproductionAspect.PEN_SHADOWS : OBF.PostproductionAspect.COLOR_PEN_SHADOWS;
        }
      },
      setGrid(visible) { grid.visible = visible; },
      async fit() {
        if (!currentModel || loading) return;
        const box = buildingBox.clone();
        for (const { surface } of regions.values()) for (const triangle of surface.triangles) for (const point of triangle.points) box.expandByPoint(new THREE.Vector3().fromArray(point));
        await controls.fitToSphere(box.getBoundingSphere(new THREE.Sphere()), true);
        resetZoomReference();
      },
      async clearSelection() { await highlighter.clear('select'); },
      setProposalHighlights({ recommended = [], picked = [], version }) {
        proposalState = { recommended, picked, version };
        return applyProposalHighlights();
      },
      async highlightRoof(globalId) {
        if (!currentModel || loading) return;
        const [id] = await currentModel.getLocalIdsByGuids([globalId]);
        if (id === null) throw new Error('That IFC GlobalId is not present in the loaded model');
        programmaticSelection++;
        try { await highlighter.highlightByID('select', { [currentModel.modelId]: new Set([id]) }); }
        finally { programmaticSelection--; }
      },
      async dispose() {
        disposed = true;
        resizeObserver?.disconnect();
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
        controls.removeEventListener('update', updateCamera);
        selectionEpoch++;
        resetRegions();
        components.dispose();
      }
    };
  } catch (error) {
    components.dispose();
    throw error;
  }
}
