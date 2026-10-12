import projectData from './projects.json' with { type: 'json' };
import directoryData from './directory.json' with { type: 'json' };

const showcaseById = new Map(projectData.showcaseProjects.map((project) => [project.id, project]));

export function resolvePastProject(entry) {
  const showcase = entry.projectId ? showcaseById.get(entry.projectId) : null;
  if (!showcase) return { name: entry.name, coverage: entry.coverage, image: entry.image ?? null };
  return { name: showcase.name, coverage: `${showcase.greenCoveragePct}% Green`, image: showcase.image };
}

export const CONTRACTOR_CATEGORIES = directoryData.categories;
export const CONTRACTORS = directoryData.contractors;

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
