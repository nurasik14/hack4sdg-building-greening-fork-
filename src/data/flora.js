import floraData from './flora.json' with { type: 'json' };

export const FLORA_INSTALLATIONS = floraData.installations;
export const FLORA_FOCUSES = floraData.focuses;
export const FLORA_SPECIES = floraData.species;
export const FEATURED_SPECIES_ID = floraData.featuredSpeciesId;

export function findFloraSpecies(id) {
  return FLORA_SPECIES.find((species) => species.id === id) ?? null;
}

export function filterFlora({ query = '', installation = 'all', focus = 'all' } = {}) {
  const normalized = query.trim().toLowerCase();
  return FLORA_SPECIES.filter((species) => {
    if (installation !== 'all' && species.type !== installation) return false;
    if (focus !== 'all' && species.focus !== focus) return false;
    if (!normalized) return true;
    return [species.name, species.scientificName, ...(species.tags ?? [])]
      .some((field) => field.toLowerCase().includes(normalized));
  });
}
