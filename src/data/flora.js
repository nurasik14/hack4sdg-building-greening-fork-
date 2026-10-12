// Static demonstration data for the EcoMetroLink Flora page.
// Each entry mirrors the desktop "Flora Database & Biodiversity Guides" card:
// a native species with installation guidance, biodiversity focus and rating.

export const FLORA_INSTALLATIONS = [
  {
    id: 'rooftop',
    label: 'Rooftop',
    description: 'Drought-tolerant and wind-resistant species suitable for exposed roofs.'
  },
  {
    id: 'wall',
    label: 'Wall',
    description: 'Climbing plants and modular living-wall species for facades.'
  },
  {
    id: 'ground',
    label: 'Ground',
    description: 'Low planting and courtyard species for accessible ground works.'
  }
];

export const FLORA_FOCUSES = [
  { id: 'native', label: 'Native', description: 'Local flora that supports indigenous biodiversity.' },
  { id: 'pollinator', label: 'Pollinator', description: 'Flowering species that sustain bees and butterflies.' },
  { id: 'edible', label: 'Edible', description: 'Food-producing plants suitable for community spaces.' }
];

export const FLORA_SPECIES = [
  {
    id: 'hong-kong-bauhinia',
    name: 'Hong Kong Bauhinia',
    scientificName: 'Bauhinia blakeana',
    type: 'rooftop',
    focus: 'native',
    score: 4.9,
    bioScore: 4.8,
    summary: 'The city flower. Partial-sun, high biodiversity contribution with showy magenta blooms from late autumn to early spring.',
    tags: ['Native', 'Pollinator', 'Showy bloom'],
    image: '/images/flora/bauhinia.jpg',
    maintenance: 'Low — light pruning after flowering',
    watering: 'Moderate; tolerates short dry spells once established',
    matureSize: '6–8 m canopy, suitable for planter trees'
  },
  {
    id: 'native-broad-ferns',
    name: 'Native Broad Ferns',
    scientificName: 'Nephrolepis auriculata',
    type: 'ground',
    focus: 'native',
    score: 4.6,
    bioScore: 4.7,
    summary: 'Shade-tolerant ground cover. Excellent soil-moisture retention and a stable habitat for invertebrates.',
    tags: ['Ground', 'Shade', 'Habitat'],
    image: '/images/flora/fern.jpg',
    maintenance: 'Low — remove old fronds once a year',
    watering: 'Consistent moisture; mulch recommended',
    matureSize: '60–90 cm spread'
  },
  {
    id: 'vertical-wall-ivy',
    name: 'Vertical Wall Ivy',
    scientificName: 'Hedera nepalensis',
    type: 'wall',
    focus: 'pollinator',
    score: 4.5,
    bioScore: 4.3,
    summary: 'Self-clinging climber for full-sun, high-particulate-matter purification. Late-season nectar for pollinators.',
    tags: ['Wall', 'Air quality', 'Pollinator'],
    image: '/images/flora/ivy.jpg',
    maintenance: 'Medium — train and trim twice a year',
    watering: 'Drip irrigation; drought-tolerant once mature',
    matureSize: 'Up to 8 m vertical growth'
  },
  {
    id: 'subtropical-roof-grasses',
    name: 'Subtropical Roof Grasses',
    scientificName: 'Zoysia japonica',
    type: 'rooftop',
    focus: 'edible',
    score: 4.4,
    bioScore: 4.0,
    summary: 'Drought-resistant, low-maintenance mat-forming grass used in the EcoMetro demonstration green-roof trials.',
    tags: ['Rooftop', 'Low water', 'Foot traffic'],
    image: '/images/flora/grass.jpg',
    maintenance: 'Low — mow twice per season',
    watering: 'Rain-fed after establishment',
    matureSize: 'Tight 5–8 cm turf mat'
  },
  {
    id: 'kumquat-courtyard',
    name: 'Kumquat Courtyard Tree',
    scientificName: 'Citrus japonica',
    type: 'ground',
    focus: 'edible',
    score: 4.7,
    bioScore: 4.4,
    summary: 'Compact courtyard tree producing winter fruit. Suited to community gardens and edible green corridors.',
    tags: ['Edible', 'Courtyard', 'Fragrant bloom'],
    image: '/samples/flora/kumquat.svg',
    maintenance: 'Medium — annual shaping and feeding',
    watering: 'Deep, infrequent watering',
    matureSize: '2.5–3.5 m'
  },
  {
    id: 'sedum-roof-mix',
    name: 'Sedum Roof Mix',
    scientificName: 'Sedum mexicanum',
    type: 'rooftop',
    focus: 'pollinator',
    score: 4.5,
    bioScore: 4.6,
    summary: 'Pollinator-friendly succulent carpet. Late-summer flowers sustain solitary bees on otherwise bare roofs.',
    tags: ['Rooftop', 'Pollinator', 'Low water'],
    image: '/samples/flora/sedum.svg',
    maintenance: 'Low — minimal weeding',
    watering: 'Rain-fed; tolerates 30+ day drought',
    matureSize: '10–20 cm mat'
  }
];

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
