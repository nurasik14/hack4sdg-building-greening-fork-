/** Conservative concept screening, not an engineering standard or suitability certificate. */
export function screenRegion({ type, selection, surface, buildingBox }) {
  const reasons = [], missing = ['Structural capacity, drainage and access require professional review.'];
  let blocked = false;
  const reject = (reason) => { blocked = true; reasons.push(reason); };
  const category = selection?.category ?? '';
  const attributes = Object.fromEntries((selection?.properties ?? []).map(({ name, value }) => [name, value]));
  const identity = `${selection?.name ?? ''} ${attributes.PredefinedType ?? ''} ${attributes.ObjectType ?? ''}`;
  const points = surface.triangles.flatMap((triangle) => triangle.points);
  const top = points.reduce((max, point) => Math.max(max, point[1]), -Infinity);
  const slope = Math.acos(Math.min(1, Math.max(-1, surface.triangles.reduce((sum, triangle) => sum + triangle.normal[1] * triangle.area, 0) / surface.surfaceAreaM2))) * 180 / Math.PI;
  if (type === 'roof') {
    if (!/^(IFCROOF|IFCSLAB)$/.test(category)) reject('Only roof or roof-slab geometry can be considered for a roof system.');
    if (!/roof|dach/i.test(identity) && category !== 'IFCROOF' && top < buildingBox.max.y - Math.max(1, (buildingBox.max.y - buildingBox.min.y) * .15)) reject('This slab is below the upper building envelope; it is not an identified roof.');
    if (slope > 20) reject(`Average slope ${slope.toFixed(1)}° exceeds the conservative 20° concept-screening limit. A specialist system is required.`);
    if (!blocked) reasons.push(`Upward roof candidate; average slope ${slope.toFixed(1)}°. Check for structures or plant above it.`);
    missing.push('Roof exposure, waterproofing and loading are unverified.');
  } else if (type === 'facade') {
    if (!/^IFCWALL/.test(category)) reject('A facade system requires a wall component, not windows, doors or a floor.');
    if (/internal|interior|innenwand|partition|内墙|內牆/i.test(identity)) reject('The component identity indicates an internal/partition wall.');
    if (attributes.IsExternal === false || attributes.IsExternal === '.F.') reject('The supplied IFC attribute marks this wall as internal.');
    if (!blocked) reasons.push('Outward, near-vertical display faces are present. This does not prove they are exterior or unobstructed.');
    missing.push('Confirm an exterior face, window/door clearances, fixings, fire access and irrigation.');
  } else if (type === 'terrace') {
    if (!/^(IFCSLAB|IFCROOF)$/.test(category) || !/balcon|balkon|loggia|loggien|veranda|patio|terrace|terrasse|露台|阳台|陽台/i.test(identity)) reject('No balcony/terrace identity was found. An ordinary floor or cropped floor edge cannot be treated as a terrace.');
    // Judge horizontality on the near-horizontal area share. Balcony slabs carry thin edge geometry
    // that skews a whole-surface average without making the walking surface itself sloped.
    const horizontal = surface.triangles.filter((triangle) => triangle.normal[1] >= .9);
    const horizontalArea = horizontal.reduce((sum, triangle) => sum + triangle.area, 0);
    const horizontalFraction = surface.surfaceAreaM2 ? horizontalArea / surface.surfaceAreaM2 : 0;
    const horizontalSlope = horizontalArea ? Math.acos(Math.min(1, Math.max(-1, horizontal.reduce((sum, triangle) => sum + triangle.normal[1] * triangle.area, 0) / horizontalArea))) * 180 / Math.PI : 90;
    if (horizontalFraction < .5) reject(`Only ${(horizontalFraction * 100).toFixed(0)}% of the display surface is near-horizontal, so the terrace concept does not apply.`);
    else if (horizontalSlope > 5) reject(`The near-horizontal area slopes ${horizontalSlope.toFixed(1)}°, beyond the conservative 5° terrace limit.`);
    if (!blocked) reasons.push(`Named balcony/terrace; ${(horizontalFraction * 100).toFixed(0)}% of the display surface is near-horizontal at ${horizontalSlope.toFixed(1)}°. Outdoor exposure remains unverified.`);
    missing.push('Confirm outdoor exposure, loading, usable boundaries and unobstructed escape routes.');
  } else if (type === 'ground') {
    const xs = points.map((point) => point[0]), zs = points.map((point) => point[2]);
    if (Math.min(...xs) < buildingBox.max.x && Math.max(...xs) > buildingBox.min.x && Math.min(...zs) < buildingBox.max.z && Math.max(...zs) > buildingBox.min.z) reject('The proposed rectangle overlaps the building footprint. Move it outside the footprint.');
    if (!blocked) reasons.push('User-defined rectangle outside the building bounding footprint; not an IFC land boundary.');
    missing.push('Confirm available land, ground level, utilities and clear access.');
  } else reject('Unsupported region type.');
  return { status: blocked ? 'blocked' : 'conditional', canPrepare: !blocked, reasons, missing, source: 'Geometry and IFC identity screening rules; thresholds are presentation assumptions, not code compliance.' };
}
