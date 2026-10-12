// Static demonstration data for the EcoMetroLink Contractor Directory pages.
// Each entry matches the desktop "Eco Partner Network" card and the partner
// profile page that opens when a card is activated.

import projectData from './projects.json' with { type: 'json' };

const showcaseById = new Map(projectData.showcaseProjects.map((project) => [project.id, project]));

// Resolve a past-project reference into display fields. Showcase projects (shared
// numbers + images) come from projects.json; other entries stay inline.
export function resolvePastProject(entry) {
  const showcase = entry.projectId ? showcaseById.get(entry.projectId) : null;
  if (!showcase) return { name: entry.name, coverage: entry.coverage, image: entry.image ?? null };
  return { name: showcase.name, coverage: `${showcase.greenCoveragePct}% Green`, image: showcase.image };
}

export const CONTRACTOR_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'architects', label: 'Architects' },
  { id: 'contractors', label: 'Contractors' },
  { id: 'consultants', label: 'Consultants' }
];

export const CONTRACTORS = [
  {
    id: 'shen-hk-ecodesigns',
    name: 'Shen-HK EcoDesigns',
    initials: 'SK',
    category: 'architects',
    status: 'S-rank',
    certification: 'EC-HK Approved',
    rating: 4.9,
    reviews: 118,
    projects: 24,
    location: 'Shenzhen–Hong Kong Metropolis',
    about: 'Specialising in seamless ecological facade development across the Shenzhen–HK Northern Metropolis. We deliver certified high-biodiversity ecosystems that align with regional low-carbon policies.',
    specializations: [
      'Hydroponic Living Walls',
      'Rooftop Solar-Green Biosolar Systems',
      'High-Altitude Native Flora Planting',
      'Greywater Integration'
    ],
    pastProjects: [
      { projectId: 'lmc-tower' },
      { projectId: 'futian-hub' },
      { projectId: 'yuen-long' }
    ],
    certifications: [
      'HK Building Department RGBC License',
      'SZ Eco-Environment Bureau Tier-1 Certification'
    ]
  },
  {
    id: 'evergreen-contractors',
    name: 'Evergreen Contractors Co.',
    initials: 'EV',
    category: 'contractors',
    status: 'Authorized',
    certification: 'Eco Build',
    rating: 4.8,
    reviews: 96,
    projects: 18,
    location: 'Northern Metropolis',
    about: 'Subtropical roof and rainwater-harvesting contractor. Field crews specialise in retrofit green roofs on existing commercial stock across the greater bay area.',
    specializations: [
      'Subtropical Roof Retrofit',
      'Rainwater Harvesting Integration',
      'Modular Planter Supply'
    ],
    pastProjects: [
      { name: 'Tin Shui Wai Civic Roof', coverage: '32% Green' },
      { name: 'Tseung Kwan O Office Park', coverage: '41% Green' }
    ],
    certifications: [
      'HKGBC Retro-commissioning Accreditation',
      'GBI Certified Contractor'
    ]
  },
  {
    id: 'metropolis-biofacades',
    name: 'Metropolis Bio-Facades Ltd.',
    initials: 'MB',
    category: 'contractors',
    status: 'HK Green Installer',
    certification: 'Bio-Facade Pro',
    rating: 4.7,
    reviews: 82,
    projects: 21,
    location: 'Kowloon & Lantau',
    about: 'Modular living walls and micro-climate facade design. Trusted supplier for the EcoMetro Living Wall pilot at the LMC Eco Tower.',
    specializations: [
      'Facade Living Walls',
      'Micro-climate Modelling',
      'Irrigation Maintenance Contracts'
    ],
    pastProjects: [
      { name: 'Kai Tak Terminal Facade', coverage: '28% Green' },
      { name: 'Cyberport Living Lab', coverage: '38% Green' }
    ],
    certifications: [
      'HKQAA Green Installer',
      'ISO 14001 Environmental Management'
    ]
  },
  {
    id: 'habitat-greenworks',
    name: 'Habitat Greenworks Studio',
    initials: 'HG',
    category: 'consultants',
    status: 'Consultant',
    certification: 'Biodiversity Lead',
    rating: 4.8,
    reviews: 64,
    projects: 15,
    location: 'Hong Kong Island',
    about: 'Ecological consultants supporting planning submissions, biodiversity surveys, and maintenance plans for greening projects above 1,000 m².',
    specializations: [
      'Biodiversity Baseline Surveys',
      'Maintenance Playbooks',
      'Planning Submission Support'
    ],
    pastProjects: [
      { name: 'Wong Chuk Hang Eco Corridor', coverage: '22% Green' },
      { name: 'Shek O Country Park Buffer', coverage: '17% Green' }
    ],
    certifications: [
      'IUCN Member Firm',
      'AFCD Biodiversity Assessor'
    ]
  }
];

export function findContractor(id) {
  return CONTRACTORS.find((item) => item.id === id) ?? null;
}

export function filterContractors({ query = '', category = 'all' } = {}) {
  const normalized = query.trim().toLowerCase();
  return CONTRACTORS.filter((partner) => {
    if (category !== 'all' && partner.category !== category) return false;
    if (!normalized) return true;
    return [partner.name, partner.about, partner.location, ...(partner.specializations ?? [])]
      .some((field) => field.toLowerCase().includes(normalized));
  });
}
