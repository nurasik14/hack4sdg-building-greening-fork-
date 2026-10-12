// EcoMetroLink workspace entry point.
// Preserves the existing IFC, region and comparison workflow from main.js, then
// layers a multi-view shell on top: Dashboard, Calculator, Incentives, Flora,
// Directory and a partner Profile page (hash routing).

import { calculatePlan, PLANS, REGION_TYPES } from '../src/domain/greening-plan.js';
import { FEATURED_SPECIES_ID, FLORA_FOCUSES, FLORA_INSTALLATIONS, FLORA_SPECIES, filterFlora, findFloraSpecies } from '../src/data/flora.js';
import { CONTRACTOR_CATEGORIES, CONTRACTORS, findContractor, filterContractors, resolvePastProject } from '../src/data/contractors.js';
import projectData from '../src/data/projects.json' with { type: 'json' };

const $ = (id) => document.getElementById(id);

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ----- Button ripple (preserved) ----------------------------------------
function buttonRipple(event) {
  if (reducedMotion.matches || (event.type === 'pointerdown' && event.button !== 0) ||
      (event.type === 'click' && event.detail !== 0)) return;
  const button = event.target instanceof Element ? event.target.closest('button, label.upload') : null;
  if (!button || !button.closest('.app-shell') || button.matches(':disabled') ||
      button.querySelector('input:disabled')) return;
  const box = button.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const fromPointer = event.type === 'pointerdown';
  const x = fromPointer ? event.clientX - box.left : box.width / 2;
  const y = fromPointer ? event.clientY - box.top : box.height / 2;
  const size = 2 * Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y));
  const ripple = document.createElement('span');
  ripple.className = 'button-ripple';
  ripple.setAttribute('aria-hidden', 'true');
  Object.assign(ripple.style, { left: `${x - button.clientLeft}px`, top: `${y - button.clientTop}px`, width: `${size}px`, height: `${size}px` });
  button.append(ripple);
  const animation = ripple.animate([
    { transform: 'translate(-50%, -50%) scale(0)', opacity: .28 },
    { transform: 'translate(-50%, -50%) scale(.65)', opacity: .17, offset: .55 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }
  ], { duration: 650, easing: 'cubic-bezier(.2,.6,.3,1)' });
  animation.finished.then(() => ripple.remove(), () => ripple.remove());
}
document.addEventListener('pointerdown', buttonRipple);
document.addEventListener('click', buttonRipple);

const money = (value) => `HK$${Math.round(value).toLocaleString('en-HK')}`;
const number = (value) => Math.round(value).toLocaleString('en-HK');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

// =====================================================================
// Project data (src/data/projects.json) → DOM bindings
// =====================================================================
const activeProject = projectData.projects.find((project) => project.id === projectData.activeProjectId) ?? projectData.projects[0];
const incentiveData = activeProject.incentive;

function lookup(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function projectBindings() {
  const { zone } = projectData;
  const { impact, incentive } = activeProject;
  const sqm = `${number(impact.greenCoverageAddedSqm)} sq.m`;
  return {
    'project.name': activeProject.name,
    'project.shortName': activeProject.shortName,
    'zone.name': zone.name,
    'zone.activeProjects': String(zone.activeProjects),
    'zone.avgCoverage': `${zone.averageGreenCoveragePct}%`,
    'impact.coveragePct': `${impact.greenCoverageAddedPct}%`,
    'impact.coverageSqmParen': `(${sqm})`,
    'impact.coverageFull': `${impact.greenCoverageAddedPct}% (${sqm})`,
    'impact.co2': String(impact.co2ReductionTonnesPerYear),
    'impact.co2Full': `${impact.co2ReductionTonnesPerYear} tonnes/year`,
    'incentive.tier': incentive.tier,
    'incentive.tierLabel': incentive.tierLabel,
    'incentive.rebatePct': `${incentive.rebatePct}%`,
    'incentive.rebateDiscount': `${incentive.rebatePct.toFixed(1)}% Discount`,
    'incentive.registration': incentive.registration,
    'incentive.progressLabel': `Progress to ${incentive.nextTier} Tier (${incentive.nextTierRebatePct}% rebate)`,
    'incentive.milestonesMet': `${incentive.milestonesMet} / ${incentive.milestonesTotal} met`,
    'incentive.progressPct': `${Math.round((incentive.milestonesMet / incentive.milestonesTotal) * 100)}%`,
    'incentive.statusText': `${incentive.milestonesMet} of ${incentive.milestonesTotal} milestones are complete. Finalise native species submittal to reach the ${incentive.nextTierRebatePct}% ${incentive.nextTier} Tier rebate.`
  };
}

function fillPlotForm() {
  for (const input of document.querySelectorAll('[data-field^="dimensions."]')) {
    input.value = lookup(activeProject, input.dataset.field) ?? '';
  }
  const zoneSelect = document.querySelector('[data-field="plotZones"]');
  if (zoneSelect) {
    zoneSelect.replaceChildren(...projectData.plotZones.map((name) => {
      const option = document.createElement('option');
      option.textContent = name;
      option.selected = name === activeProject.zone;
      return option;
    }));
  }
}

function renderIncentiveData() {
  const authorities = $('incentive-authorities-list');
  const milestones = $('incentive-milestone-list');
  if (!authorities || !milestones) return;
  authorities.replaceChildren();
  milestones.replaceChildren();
  for (const authority of incentiveData.authorities ?? []) {
    const item = document.createElement('li');
    item.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/></svg>';
    item.append(document.createTextNode(authority));
    authorities.append(item);
  }
  for (const milestone of incentiveData.milestones ?? []) {
    const row = document.createElement('div');
    row.className = `milestone ${milestone.done ? 'milestone--done' : 'milestone--pending'}`;
    row.innerHTML = `
      <span class="milestone__check">${
        milestone.done
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="5 12 10 17 19 7"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/></svg>'
      }</span>
      <div>
        <strong>${escapeHtml(milestone.title)}</strong>
        <small>${escapeHtml(milestone.description)}</small>
      </div>
      <span class="milestone__meta">${escapeHtml(milestone.meta)}</span>`;
    milestones.append(row);
  }
}

function bindProjectData() {
  const values = projectBindings();
  for (const element of document.querySelectorAll('[data-bind]')) {
    const value = values[element.dataset.bind];
    if (value !== undefined) element.textContent = value;
  }
  for (const element of document.querySelectorAll('[data-bind-width]')) {
    const value = values[element.dataset.bindWidth];
    if (value !== undefined) element.style.width = value;
  }
  fillPlotForm();
  renderIncentiveData();
}
bindProjectData();
$('reset-plot-form')?.addEventListener('click', fillPlotForm);

// =====================================================================
// Routing — light hash router
// =====================================================================
const ROUTES = ['dashboard', 'calculator', 'incentives', 'flora', 'directory', 'profile'];
const KNOWN_ROUTES = new Set(ROUTES);
const VIEWER_ROUTE = 'calculator';

function parseRoute() {
  const raw = (location.hash || '').replace(/^#\/?/, '').trim();
  if (!raw) return { name: 'dashboard', params: {} };
  const [head, ...rest] = raw.split('/');
  if (!KNOWN_ROUTES.has(head)) return { name: 'dashboard', params: {} };
  if (head === 'profile') return { name: 'profile', params: { id: decodeURIComponent(rest.join('/') || '') } };
  return { name: head, params: {} };
}

function navigate(route) {
  if (!route) return;
  location.hash = route.startsWith('#') ? route : `#/${route}`;
}

function setActiveNav(routeName) {
  for (const link of document.querySelectorAll('[data-route]')) {
    const target = link.dataset.route;
    const isCurrent = target === routeName || (routeName === 'profile' && target === 'directory');
    if (isCurrent) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function showView(routeName) {
  for (const view of document.querySelectorAll('.view')) {
    const isCurrent = view.dataset.view === routeName;
    if (isCurrent) view.setAttribute('data-active', '');
    else view.removeAttribute('data-active');
  }
}

function renderRoute() {
  const { name, params } = parseRoute();
  showView(name);
  setActiveNav(name);
  if (name === 'flora') renderFlora();
  if (name === 'directory') renderDirectory();
  if (name === 'profile') renderProfile(params.id);
  // The 3D eco-model lives in the Calculator view. Its host is display:none while another
  // view is active (container collapses to 0x0), so pause rendering when leaving and, on
  // return, resume + re-measure the canvas instead of leaving a stale/frozen renderer.
  if (name === VIEWER_ROUTE) {
    if (viewer) viewer.resume();
    else void mountViewer();
  } else {
    viewer?.pause();
  }
  if (name !== VIEWER_ROUTE) {
    for (const panel of workspacePanels) if (panel.open) closePanel(panel, { restoreFocus: false });
  }
  const active = document.querySelector(`.view[data-view="${name}"]`);
  if (active) active.scrollIntoView({ block: 'start' });
}

window.addEventListener('hashchange', renderRoute);

// =====================================================================
// Flora page
// =====================================================================
const floraState = { query: '', installation: 'all', focus: 'all', selectedId: FEATURED_SPECIES_ID ?? FLORA_SPECIES[0]?.id ?? null };

function selectedFloraSpecies() {
  return findFloraSpecies(floraState.selectedId) ?? FLORA_SPECIES[0] ?? null;
}

function renderFloraHero() {
  const featured = selectedFloraSpecies();
  const image = $('flora-hero-image');
  if (!featured || !image) return;
  image.src = featured.image;
  image.alt = `${featured.name} illustration`;
}

function renderFloraFilters() {
  const installationPills = $('flora-installation-pills');
  const focusPills = $('flora-focus-pills');
  if (!installationPills || !focusPills) return;
  installationPills.replaceChildren();
  focusPills.replaceChildren();
  for (const installation of [{ id: 'all', label: 'All' }, ...FLORA_INSTALLATIONS]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.installation = installation.id;
    button.textContent = installation.id === 'all' ? 'All' : installation.label;
    button.setAttribute('aria-pressed', String(installation.id === floraState.installation));
    button.addEventListener('click', () => {
      floraState.installation = installation.id;
      renderFlora();
    });
    installationPills.append(button);
  }
  for (const focus of [{ id: 'all', label: 'All focus' }, ...FLORA_FOCUSES]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.focus = focus.id;
    button.textContent = focus.label;
    button.setAttribute('aria-pressed', String(focus.id === floraState.focus));
    button.addEventListener('click', () => {
      floraState.focus = focus.id;
      renderFlora();
    });
    focusPills.append(button);
  }
}

function renderFlora() {
  const grid = $('flora-grid');
  const empty = $('flora-empty');
  const featuredCount = $('flora-stat-count');
  const installationsCount = $('flora-stat-installations');
  if (!grid) return;
  if (featuredCount) featuredCount.textContent = String(FLORA_SPECIES.length);
  if (installationsCount) installationsCount.textContent = String(FLORA_INSTALLATIONS.length);
  const items = filterFlora(floraState);
  grid.replaceChildren();
  renderFloraHero();
  if (!items.length) { empty.hidden = false; return; }
  empty.hidden = true;
  for (const species of items) {
    const card = document.createElement('article');
    card.className = 'species-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-selected', String(species.id === floraState.selectedId));
    card.innerHTML = `
      <div class="species-card__image"><img src="${species.image}" alt="${escapeHtml(species.name)} illustration" loading="lazy" /></div>
      <div class="species-card__body">
        <div class="species-card__head">
          <div>
            <div class="species-card__title">${escapeHtml(species.name)}</div>
            <em class="species-card__sci">${escapeHtml(species.scientificName)}</em>
          </div>
          <span class="species-card__star" aria-label="Rating ${species.score} out of 5">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 14.7 8.6 22 9.3l-5.5 4.8L18 21.5 12 17.8 6 21.5l1.5-7.4L2 9.3l7.3-.7z"/></svg>
            ${species.score.toFixed(1)}
          </span>
        </div>
        <p class="species-card__summary">${escapeHtml(species.summary)}</p>
        <div class="species-card__tags">
          ${species.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="species-card__metrics">
          <div><strong>${escapeHtml(species.maintenance)}</strong>Maintenance</div>
          <div><strong>${escapeHtml(species.matureSize)}</strong>Mature size</div>
        </div>
      </div>`;
    const selectSpecies = () => {
      floraState.selectedId = species.id;
      renderFloraHero();
      for (const node of grid.querySelectorAll('.species-card')) {
        node.setAttribute('aria-selected', String(node === card));
      }
    };
    card.addEventListener('click', selectSpecies);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectSpecies();
      }
    });
    grid.append(card);
  }
  for (const btn of document.querySelectorAll('#flora-installation-pills button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.installation === floraState.installation));
  }
  for (const btn of document.querySelectorAll('#flora-focus-pills button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.focus === floraState.focus));
  }
}

function wireFlora() {
  renderFloraFilters();
  const search = $('flora-search-input');
  if (search && !search.dataset.wired) {
    search.dataset.wired = 'true';
    search.addEventListener('input', (event) => {
      floraState.query = event.target.value;
      renderFlora();
    });
  }
}

// =====================================================================
// Directory page
// =====================================================================
// Partner photo when one is supplied, otherwise the initials badge.
const avatarMarkup = (partner) => partner.avatar
  ? `<img src="${escapeHtml(partner.avatar)}" alt="" loading="lazy" />`
  : escapeHtml(partner.initials);
const directoryState = { query: '', category: 'all' };

function renderDirectoryFilters() {
  const categoryPills = $('directory-category-pills');
  if (!categoryPills) return;
  categoryPills.replaceChildren();
  for (const category of CONTRACTOR_CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.category = category.id;
    button.textContent = category.label;
    button.setAttribute('aria-pressed', String(category.id === directoryState.category));
    button.addEventListener('click', () => {
      directoryState.category = category.id;
      renderDirectory();
    });
    categoryPills.append(button);
  }
}

function renderDirectory() {
  const grid = $('directory-grid');
  const empty = $('directory-empty');
  if (!grid) return;
  const items = filterContractors(directoryState);
  grid.replaceChildren();
  if (!items.length) { empty.hidden = false; return; }
  empty.hidden = true;
  for (const partner of items) {
    const card = document.createElement('article');
    card.className = 'partner-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.dataset.partnerId = partner.id;
    card.innerHTML = `
      <div class="partner-card__head">
        <span class="partner-avatar" aria-hidden="true">${avatarMarkup(partner)}</span>
        <div>
          <div class="partner-card__name">${escapeHtml(partner.name)}</div>
          <div class="partner-card__meta">
            <span class="partner-card__verified">${escapeHtml(partner.status)}</span>
            <span>${escapeHtml(partner.certification)}</span>
          </div>
        </div>
      </div>
      <div class="partner-card__meta">
        <strong>★ ${partner.rating.toFixed(1)}</strong>
        <span>(${partner.reviews} Reviews)</span>
        <span>·</span>
        <span>${partner.projects} Eco Projects</span>
      </div>
      <p class="partner-card__about">${escapeHtml(partner.about)}</p>
      <div class="partner-card__tags">${partner.specializations.slice(0, 3).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join('')}</div>
      <div class="partner-card__actions">
        <button class="btn btn--ghost" type="button" data-action="view-profile">View Profile</button>
        <button class="btn btn--primary" type="button" data-action="request-consultation">Request Consultation</button>
      </div>`;
    card.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'request-consultation') {
        event.stopPropagation();
        openConsultationModal(partner);
        return;
      }
      navigate(`profile/${partner.id}`);
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`profile/${partner.id}`); }
    });
    grid.append(card);
  }
  for (const btn of document.querySelectorAll('#directory-category-pills button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.category === directoryState.category));
  }
}

function wireDirectory() {
  renderDirectoryFilters();
  const search = $('directory-search-input');
  if (search && !search.dataset.wired) {
    search.dataset.wired = 'true';
    search.addEventListener('input', (event) => {
      directoryState.query = event.target.value;
      renderDirectory();
    });
  }
}

// =====================================================================
// Profile page
// =====================================================================
function renderProfile(id) {
  const partner = findContractor(id) ?? CONTRACTORS[0];
  if (!partner) return;
  const header = $('profile-header');
  const grid = $('profile-grid');
  if (!header || !grid) return;
  header.innerHTML = `
    <span class="profile-header__avatar" aria-hidden="true">${avatarMarkup(partner)}</span>
    <div>
      <h1 class="profile-header__name" id="profile-title">${escapeHtml(partner.name)}</h1>
      <div class="profile-header__meta">
        <span class="badge badge--green">${escapeHtml(partner.status)} Certified</span>
        <span class="badge badge--accent">${escapeHtml(partner.certification)}</span>
        <span class="star">★ ${partner.rating.toFixed(1)} (${partner.reviews} Reviews)</span>
      </div>
    </div>`;
  grid.innerHTML = `
    <div class="profile-main">
      <section class="section-card">
        <h3>About Partner</h3>
        <p>${escapeHtml(partner.about)}</p>
      </section>
      <section class="section-card">
        <h3>Core Specializations</h3>
        <div>${partner.specializations.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join('')}</div>
      </section>
      <section class="section-card">
        <h3>Past Sustainable Projects</h3>
        <div class="projects-grid">
          ${partner.pastProjects.map(resolvePastProject).map((project, i) => `
            <div class="project-thumb">
              <img src="${escapeHtml(project.image ?? projectData.showcaseProjects[i % projectData.showcaseProjects.length].image)}" alt="${escapeHtml(project.name)} preview" loading="lazy" />
              <div class="project-thumb__caption">
                <strong>${escapeHtml(project.name)}</strong>
                <small>${escapeHtml(project.coverage)}</small>
              </div>
            </div>`).join('')}
        </div>
      </section>
      <section class="section-card">
        <h3>Regulatory Certifications</h3>
        <ul class="certifications">${partner.certifications.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
      </section>
    </div>
    <aside class="profile-side">
      <section class="section-card">
        <h3>Quick Actions</h3>
        <div style="display:flex;gap:8px;flex-direction:column;">
          <button class="btn btn--primary" type="button" data-action="contact-now">Contact Now</button>
          <button class="btn btn--ghost" type="button" data-action="message">Message</button>
        </div>
      </section>
      <section class="section-card">
        <h3>Overview</h3>
        <p class="profile-header__meta star">★ ${partner.rating.toFixed(1)} · ${partner.reviews} Reviews</p>
        <h3 style="margin-top:14px;">Core Specializations</h3>
        <div>${partner.specializations.map((s) => `<span class="tag tag--outline">${escapeHtml(s)}</span>`).join('')}</div>
        <h3 style="margin-top:14px;">Regulatory Certifications</h3>
        <ul class="certifications">${partner.certifications.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
      </section>
    </aside>`;
  for (const btn of grid.querySelectorAll('[data-action]')) {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'contact-now') openConsultationModal(partner);
      if (action === 'message') openMessagingModal(partner.id);
    });
  }
}

// =====================================================================
// Consultation + messaging
// =====================================================================
const consultationState = { partnerId: null };
const messagingState = {
  activePartnerId: CONTRACTORS[0]?.id ?? null,
  threads: new Map(CONTRACTORS.map((partner) => [partner.id, [
    { from: 'partner', text: `Hello from ${partner.name}. Share your project details and we can start.`, at: new Date().toISOString() }
  ]]))
};

function setBodyModalState() {
  document.body.style.overflow = ($('consultation-modal')?.open || $('messaging-modal')?.open) ? 'hidden' : '';
}

function openConsultationModal(partner) {
  const modal = $('consultation-modal');
  if (!modal || !partner) return;
  consultationState.partnerId = partner.id;
  $('consultation-target-label').textContent = `To: ${partner.name}`;
  $('consultation-message').value = `Hello ${partner.name}, we'd like to request a consultation for ${activeProject.shortName}.`;
  modal.showModal();
  setBodyModalState();
  $('consultation-message').focus();
}

function closeConsultationModal() {
  const modal = $('consultation-modal');
  if (!modal?.open) return;
  modal.close();
  setBodyModalState();
}

function activeMessages() {
  return messagingState.threads.get(messagingState.activePartnerId) ?? [];
}

function renderMessageContacts() {
  const list = $('messaging-contact-list');
  if (!list) return;
  list.replaceChildren();
  for (const partner of CONTRACTORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'messaging-contact';
    button.setAttribute('aria-current', String(partner.id === messagingState.activePartnerId));
    const latest = (messagingState.threads.get(partner.id) ?? []).at(-1)?.text ?? 'No messages yet';
    button.innerHTML = `<strong>${escapeHtml(partner.name)}</strong><small>${escapeHtml(latest)}</small>`;
    button.addEventListener('click', () => {
      messagingState.activePartnerId = partner.id;
      renderMessaging();
    });
    list.append(button);
  }
}

function renderMessagingThread() {
  const partner = findContractor(messagingState.activePartnerId) ?? CONTRACTORS[0];
  const thread = $('messaging-thread');
  const title = $('messaging-chat-name');
  if (!thread || !title || !partner) return;
  title.textContent = partner.name;
  thread.replaceChildren();
  for (const message of activeMessages()) {
    const bubble = document.createElement('div');
    bubble.className = `chat-message ${message.from === 'me' ? 'chat-message--outbound' : 'chat-message--inbound'}`;
    bubble.textContent = message.text;
    thread.append(bubble);
  }
  thread.scrollTop = thread.scrollHeight;
}

function renderMessaging() {
  renderMessageContacts();
  renderMessagingThread();
}

function openMessagingModal(partnerId = messagingState.activePartnerId) {
  if (partnerId) messagingState.activePartnerId = partnerId;
  const modal = $('messaging-modal');
  if (!modal) return;
  renderMessaging();
  modal.showModal();
  setBodyModalState();
  $('messaging-input').focus();
}

function closeMessagingModal() {
  const modal = $('messaging-modal');
  if (!modal?.open) return;
  modal.close();
  setBodyModalState();
}

function appendOutgoingMessage(text) {
  const content = text.trim();
  if (!content || !messagingState.activePartnerId) return false;
  const thread = messagingState.threads.get(messagingState.activePartnerId) ?? [];
  thread.push({ from: 'me', text: content, at: new Date().toISOString() });
  messagingState.threads.set(messagingState.activePartnerId, thread);
  return true;
}

function wireMessaging() {
  $('message-launcher')?.addEventListener('click', () => openMessagingModal());
  $('messaging-close')?.addEventListener('click', closeMessagingModal);
  $('messaging-modal')?.addEventListener('cancel', (event) => { event.preventDefault(); closeMessagingModal(); });
  $('consultation-modal')?.addEventListener('cancel', (event) => { event.preventDefault(); closeConsultationModal(); });
  for (const button of document.querySelectorAll('[data-close-consultation]')) {
    button.addEventListener('click', closeConsultationModal);
  }
  $('consultation-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const partnerId = consultationState.partnerId;
    if (!partnerId) return;
    messagingState.activePartnerId = partnerId;
    if (appendOutgoingMessage($('consultation-message').value)) {
      closeConsultationModal();
      openMessagingModal(partnerId);
      showStatus(`Consultation request sent. Continuing in messaging with ${findContractor(partnerId)?.name ?? 'partner'}.`);
    }
  });
  $('messaging-composer')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!appendOutgoingMessage($('messaging-input').value)) return;
    $('messaging-input').value = '';
    renderMessaging();
  });
  $('messaging-modal')?.addEventListener('click', (event) => {
    if (event.target === $('messaging-modal')) closeMessagingModal();
  });
  $('consultation-modal')?.addEventListener('click', (event) => {
    if (event.target === $('consultation-modal')) closeConsultationModal();
  });
}

// =====================================================================
// IFC workflow (preserved, with viewer lazy mount + pause-on-hide)
// =====================================================================
let selected = null;
let viewer;
let viewerMounted = false;
let importing = false;
let selectedComponent = null;
let plannedRegions = [];
let draftRegion = null;
let preparationEpoch = 0;
let lastPlan = 'light';
let candidateEpoch = 0;
let assistantEpoch = 0;
let analysing = false;
let applyingCombination = false;
let combinationEpoch = 0;
let proposalRows = [];
let recommendedGuids = new Map();
let recommendationVersion = null;
let lastHighlightKey = null;
const candidateCache = new Map();
let loadedModel = null;

const workspacePanels = [...document.querySelectorAll('.workspace-panel')];
const panelLaunchers = [...document.querySelectorAll('[data-panel][aria-expanded]')];

function syncPanelLaunchers() {
  for (const launcher of panelLaunchers) {
    launcher.setAttribute('aria-expanded', String($(launcher.dataset.panel).open));
  }
}
function closePanel(panel, { restoreFocus = true } = {}) {
  if (!panel?.open) return;
  panel.close();
  syncPanelLaunchers();
  if (restoreFocus) panelLaunchers.find((button) => button.dataset.panel === panel.id)?.focus();
}
function openPanel(id, { focus = true } = {}) {
  const panel = $(id);
  if (panel.open) return;
  const previousFocus = document.activeElement;
  for (const other of workspacePanels) closePanel(other, { restoreFocus: false });
  panel.show();
  syncPanelLaunchers();
  if (!focus) (previousFocus === document.body ? $('bim-container') : previousFocus)?.focus({ preventScroll: true });
}
for (const button of document.querySelectorAll('[data-panel]')) button.addEventListener('click', () => {
  const panel = $(button.dataset.panel);
  if (!panel) return;
  if (panel.open) closePanel(panel);
  else openPanel(panel.id);
  if (button.classList.contains('text-button')) {
    document.querySelector('.input-details').open = true;
    $('years').focus({ preventScroll: false });
  }
});
for (const button of document.querySelectorAll('[data-close-panel]')) button.addEventListener('click', () => closePanel(button.closest('dialog')));
for (const panel of workspacePanels) panel.addEventListener('close', syncPanelLaunchers);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const panel = workspacePanels.find((item) => item.open);
  if (panel) { event.preventDefault(); closePanel(panel); }
});

// ----- IFC analysis workflow (preserved) --------------------------------
async function screenedCandidates(type) {
  if (!viewer || !loadedModel || importing) return [];
  const model = loadedModel, version = model.modelVersion, key = `${version}:${type}`;
  if (candidateCache.has(key)) return candidateCache.get(key);
  const request = viewer.listRegionCandidates(type);
  candidateCache.set(key, request);
  try {
    const candidates = await request;
    if (loadedModel !== model || importing) return [];
    return candidates;
  } catch (error) { if (candidateCache.get(key) === request) candidateCache.delete(key); throw error; }
}
async function refreshCandidates() {
  const epoch = ++candidateEpoch, type = $('region-type').value;
  $('candidate-fields').hidden = type === 'ground';
  $('region-candidate').disabled = true;
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Select a candidate component…';
  $('region-candidate').replaceChildren(placeholder);
  if (!viewer || !loadedModel || importing || type === 'ground') return;
  try {
    const candidates = await screenedCandidates(type);
    if (epoch !== candidateEpoch) return;
    for (const candidate of candidates) {
      if (!candidate.globalId) continue;
      const option = document.createElement('option'); option.value = candidate.globalId; option.textContent = `${candidate.name} · ${candidate.geometryAreaM2.toFixed(1)} m² · needs review`;
      $('region-candidate').append(option);
    }
    $('region-candidate').value = selectedComponent?.globalId ?? '';
    $('region-candidate').disabled = false;
  } catch (error) { if (epoch === candidateEpoch) $('region-draft-status').textContent = error.message; }
}
$('region-candidate').addEventListener('change', async (event) => {
  if (!event.target.value) return;
  try { await viewer.highlightRoof(event.target.value); }
  catch (error) { $('region-draft-status').textContent = error.message; }
});
function calculationInputs() {
  return { regions: plannedRegions, years: Number($('years').value), budgetHkd: $('budget').value === '' ? undefined : Number($('budget').value) };
}
function planResults() { return PLANS.map((plan) => calculatePlan({ ...calculationInputs(), plan })); }

async function analyseLocations(question = '', { open = true } = {}) {
  if (open) openPanel('inspector-panel');
  if (!loadedModel || importing) { $('assistant-answer').textContent = 'Load a building before finding planting candidates.'; return; }
  if (applyingCombination) return;
  const epoch = ++assistantEpoch, version = loadedModel.modelVersion;
  analysing = true;
  $('analyse-building').disabled = $('assistant-ask').disabled = true;
  const previousRows = proposalRows, previousSections = [...$('assistant-candidates').children];
  const previous = new Map(proposalRows.filter(row => row.picked).map(row => [row.candidate.globalId, { type: row.type, area: row.area.value }]));
  proposalRows = []; $('confirm-combination').checked = false;
  $('combination-controls').hidden = true; $('combination-status').textContent = '';
  $('assistant-candidates').replaceChildren();
  $('assistant-answer').textContent = 'Screening IFC identities and actual display faces…';
  const counts = {};
  const requested = /roof|屋頂|屋顶/i.test(question) ? ['roof'] : /facade|wall|立面|外牆|外墙/i.test(question) ? ['facade'] : /terrace|balcony|露台|陽台|阳台/i.test(question) ? ['terrace'] : /ground|courtyard|地面|庭院/i.test(question) ? ['ground'] : ['roof','facade','terrace','ground'];
  try {
    for (const type of ['roof', 'facade', 'terrace', 'ground']) {
      const candidates = type === 'ground' ? [] : await screenedCandidates(type);
      if (epoch !== assistantEpoch || loadedModel?.modelVersion !== version || importing) return;
      counts[type] = candidates.length;
      const section = document.createElement('section'), heading = document.createElement('h3');
      heading.textContent = `${REGION_TYPES[type]} · selected locations`; section.hidden = true; section.append(heading);
      candidates.forEach((candidate) => {
        if (!candidate.globalId) return;
        const row = document.createElement('div'); row.className = 'proposal-candidate';
        const choice = document.createElement('div'); choice.className = 'candidate-choice';
        const name = document.createElement('strong'); name.textContent = `${candidate.name} · ${candidate.globalId.slice(-6)}`;
        choice.append(name);
        const estimate = document.createElement('p'); estimate.className = 'empty-text'; estimate.textContent = `${candidate.geometryAreaM2.toFixed(1)} m² compatible display estimate · conditional`;
        const details = document.createElement('details'), summary = document.createElement('summary'), reason = document.createElement('p');
        summary.textContent = 'Why this candidate / missing checks'; reason.className = 'empty-text';
        reason.textContent = [...candidate.screening.reasons, ...candidate.screening.missing].join(' '); details.append(summary, reason);
        const systems = document.createElement('p'); systems.className = 'empty-text'; systems.textContent = PLANS.map(plan => `${plan.name}: ${plan.profiles[type].name}`).join(' · ');
        const areaLabel = document.createElement('label'); areaLabel.className = 'candidate-area'; areaLabel.append('Usable area (m²)');
        const area = document.createElement('input'); area.type = 'number'; area.min = '.01'; area.step = '.01'; area.max = String(candidate.geometryAreaM2);
        area.value = previous.get(candidate.globalId)?.area ?? (Math.floor(candidate.geometryAreaM2 * 100) / 100).toFixed(2); areaLabel.append(area);
        const areaError = document.createElement('p'); areaError.className = 'candidate-area-error'; areaError.id = `proposal-area-${type}-${candidate.localId}`; areaError.hidden = true; areaError.setAttribute('role', 'alert');
        area.setAttribute('aria-describedby', areaError.id);
        const locate = document.createElement('button'); locate.type = 'button'; locate.className = 'btn btn--ghost'; locate.textContent = 'Locate & inspect';
        locate.addEventListener('click', async () => {
          if (loadedModel?.modelVersion !== version || importing || applyingCombination) return;
          $('region-type').value = type; updateRegionType();
          try { await viewer.highlightRoof(candidate.globalId); openPanel('inspector-panel'); }
          catch (error) { $('assistant-answer').textContent = error.message; }
        });
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn--ghost'; remove.textContent = 'Remove from selection';
        const record = { type, candidate, picked: previous.get(candidate.globalId)?.type === type, area, areaError, locate, remove, row, section };
        remove.addEventListener('click', () => { record.picked = false; $('confirm-combination').checked = false; updateCombinationControls(); });
        area.addEventListener('input', () => { $('confirm-combination').checked = false; updateCombinationControls(); });
        row.append(choice, estimate, details, systems, areaLabel, areaError, locate, remove);
        proposalRows.push(record); section.append(row);
      });
      $('assistant-candidates').append(section);
    }
    recommendationVersion = version;
    const limits = { roof: 3, facade: 2, terrace: 2 }, countsByType = {};
    recommendedGuids = new Map();
    for (const row of proposalRows) if (!(row.type === 'roof' && proposalRows.some(other => other.type === 'terrace' && other.candidate.globalId === row.candidate.globalId)) && requested.includes(row.type) && !plannedRegions.some(region => region.globalId === row.candidate.globalId) && !recommendedGuids.has(row.candidate.globalId) && (countsByType[row.type] ?? 0) < (limits[row.type] ?? 0)) {
      recommendedGuids.set(row.candidate.globalId, row.type); countsByType[row.type] = (countsByType[row.type] ?? 0) + 1;
    }
    const chinese = /[\u3400-\u9fff]/.test(question) || (!question && $('voice-language').value.startsWith('zh'));
    const summary = Object.entries(counts).map(([type, count]) => `${chinese ? {roof:'屋顶',facade:'立面',terrace:'露台',ground:'庭院'}[type] : REGION_TYPES[type]}: ${count}`).join(' · ');
    $('assistant-answer').textContent = chinese ? `初筛：${summary}。蓝色是推荐起点，绿色是已选位置。关闭面板，直接点击建筑加入或取消；点击别处保留之前的选择。Inspect 只列出你选中的位置，核查可用面积和工程条件后统一加入两套方案。立面需确认外墙，普通楼板不当作露台，庭院需单独确认用地。当前使用规则筛选，尚未接入 AI。` : `Conditional candidates: ${summary}. Blue marks a suggested starting set; green marks your selections. Close Inspect and click the building to add or remove locations. Earlier choices remain selected. Review usable areas and missing engineering checks here before adding the set to both plans. Exterior walls and land availability require confirmation. Rule-based screening; AI is not connected.`;
  } catch (error) { if (epoch === assistantEpoch) { proposalRows = previousRows; $('assistant-candidates').replaceChildren(...previousSections); $('assistant-answer').textContent = `Location screening failed: ${error.message}. Earlier selections are preserved. Try finding locations again.`; } }
  finally { if (epoch === assistantEpoch) { analysing = false; $('combination-controls').hidden = !proposalRows.length; refreshImportControls(); } }
}
$('analyse-building').addEventListener('click', () => void analyseLocations());
$('assistant-ask').addEventListener('click', () => void analyseLocations($('assistant-question').value.trim()));
function updateCombinationControls() {
  const busy = importing || analysing || applyingCombination || !loadedModel;
  for (const row of proposalRows) {
    const assigned = plannedRegions.some(region => region.globalId === row.candidate.globalId);
    if (assigned) row.picked = false;
    row.disabled = busy || assigned || row.candidate.modelVersion !== loadedModel?.modelVersion;
    row.row.hidden = !row.picked;
    row.section.hidden = !proposalRows.some(item => item.section === row.section && item.picked);
    row.remove.disabled = busy;
    row.area.disabled = row.disabled || !row.picked;
    const invalid = row.picked && (!Number.isFinite(Number(row.area.value)) || Number(row.area.value) <= 0 || Number(row.area.value) > row.candidate.geometryAreaM2 * 1.001);
    row.area.setAttribute('aria-invalid', String(invalid)); row.areaError.hidden = !invalid;
    row.areaError.textContent = invalid ? `Enter a positive usable area within ${row.candidate.geometryAreaM2.toFixed(2)} m². The whole set is waiting for this correction.` : '';
    row.locate.disabled = busy;
  }
  const chosen = proposalRows.filter(row => row.picked);
  const total = chosen.reduce((sum, row) => sum + Number(row.area.value), 0);
  const valid = chosen.length && chosen.every(row => Number.isFinite(Number(row.area.value)) && Number(row.area.value) > 0 && Number(row.area.value) <= row.candidate.geometryAreaM2 * 1.001);
  $('combination-summary').textContent = chosen.length ? `${chosen.length} selected region(s) · ${Number.isFinite(total) ? total.toFixed(2) : '—'} m² proposed usable area. Both plans will use this same set alongside ${plannedRegions.length} already-added region(s).` : `${plannedRegions.length} region(s) already added. Close Inspect and click building locations to add / remove from the pending selection. Blue = recommended; green = selected. Review this set before adding it.`;
  $('review-combination').disabled = importing || applyingCombination || !plannedRegions.length;
  $('add-combination').disabled = busy || !valid || !$('confirm-combination').checked;
  $('confirm-combination').disabled = busy || !chosen.length;
  $('select-suggested').disabled = busy || !proposalRows.some(row => !row.disabled);
  $('clear-candidates').disabled = busy || !chosen.length;
  $('add-combination').textContent = applyingCombination ? 'Preparing selected surfaces…' : 'Add selected regions to both plans';
  $('proposal-legend').hidden = recommendationVersion !== loadedModel?.modelVersion || !proposalRows.length || selected !== null;
  const recommended = proposalRows.filter(row => recommendedGuids.get(row.candidate.globalId) === row.type && !plannedRegions.some(region => region.globalId === row.candidate.globalId));
  $('proposal-count').textContent = `${chosen.length} selected · ${new Set(recommended.map(row => row.candidate.globalId)).size} recommended`;
  const ids = { recommended: [...new Set(recommended.map(row => row.candidate.localId))], picked: chosen.map(row => row.candidate.localId), version: loadedModel?.modelVersion };
  const key = JSON.stringify(ids);
  if (viewer && key !== lastHighlightKey) { lastHighlightKey = key; void viewer.setProposalHighlights(ids).catch(error => { lastHighlightKey = null; showStatus(`Could not highlight locations: ${error.message}`); }); }
}
function toggleModelLocation(selection) {
  if (importing || analysing || applyingCombination || selection.modelVersion !== recommendationVersion) return;
  if (plannedRegions.some(region => region.globalId === selection.globalId)) {
    showStatus('This component is already in both plans. Remove it in Inspect before choosing it again.'); return;
  }
  const matches = proposalRows.filter(row => row.candidate.globalId === selection.globalId);
  const row = matches.find(item => item.picked) ?? matches.find(item => item.type === 'terrace') ?? matches[0];
  if (!row) { showStatus(`${selection.name}: not a screened planting candidate. Inspect source details for manual review; windows, ordinary floors and incompatible faces are not added.`); return; }
  if (selected !== null) { selected = null; viewer.setBeforeAfter(false); render(); }
  row.picked = !row.picked;
  $('confirm-combination').checked = false; $('combination-status').textContent = '';
  updateCombinationControls();
  showStatus(`${row.picked ? 'Added' : 'Removed'} ${selection.name}. ${proposalRows.filter(item => item.picked).length} locations selected. Earlier choices remain highlighted; review them in Inspect.`);
}
$('confirm-combination').addEventListener('change', updateCombinationControls);
$('select-suggested').addEventListener('click', () => {
  for (const row of proposalRows) if (!row.disabled && recommendedGuids.get(row.candidate.globalId) === row.type) {
    for (const other of proposalRows) if (other.candidate.globalId === row.candidate.globalId) other.picked = false;
    row.picked = true;
  }
  selected = null; viewer.setBeforeAfter(false); render();
  $('confirm-combination').checked = false; $('combination-status').textContent = 'Recommended locations added to your selection. Close Inspect to see the green highlights, then review usable areas before confirming.';
  updateCombinationControls();
});
$('clear-candidates').addEventListener('click', () => {
  for (const row of proposalRows) row.picked = false;
  $('confirm-combination').checked = false; $('combination-status').textContent = ''; updateCombinationControls();
});
$('add-combination').addEventListener('click', async () => {
  if ($('add-combination').disabled) return;
  const epoch = ++combinationEpoch;
  const requests = proposalRows.filter(row => row.picked).map(row => ({ type: row.type, localId: row.candidate.localId, globalId: row.candidate.globalId, modelVersion: row.candidate.modelVersion, area: Number(row.area.value) }));
  applyingCombination = true; invalidateRegionDraft(); refreshImportControls();
  $('combination-status').textContent = `Rechecking ${requests.length} source surfaces before adding the complete set…`;
  try {
    const added = await viewer.addCandidateRegions(requests, $('confirm-combination').checked);
    if (epoch !== combinationEpoch) return;
    $('confirm-combination').checked = false;
    selected = lastPlan; viewer.setPlan(PLANS.find(plan => plan.id === selected), true); render();
    $('combination-status').textContent = `${added.length} regions added together. Open Compare to review totals for all ${plannedRegions.length} planned regions, or remove regions in Planned regions to revise the set.`;
    showStatus('Showing combined planting. Before / After and Compare use all confirmed regions.');
  } catch (error) { if (epoch === combinationEpoch) $('combination-status').textContent = error.message; }
  finally { if (epoch === combinationEpoch) { applyingCombination = false; refreshImportControls(); } }
});

const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
let recognition = null;
function resetVoiceButton() { $('voice-record').textContent = 'Start voice input'; $('voice-record').setAttribute('aria-pressed', 'false'); }
function stopVoice() { recognition?.abort(); }
$('voice-record').disabled = !Recognition;
if (!Recognition) $('voice-status').textContent = 'Voice recognition is unavailable in this browser. Type your question instead.';
$('voice-record').addEventListener('click', () => {
  if (recognition) { recognition.stop(); return; }
  const current = new Recognition(); recognition = current;
  current.lang = $('voice-language').value; current.continuous = false; current.interimResults = false;
  $('voice-record').textContent = 'Stop voice input'; $('voice-record').setAttribute('aria-pressed', 'true');
  $('voice-status').textContent = 'Waiting for microphone access…';
  current.onstart = () => { $('voice-status').textContent = 'Listening… Your browser may send audio to its speech service.'; };
  current.onresult = event => { $('assistant-question').value = event.results[0][0].transcript; $('voice-status').textContent = 'Review the transcript, then choose Ask about locations. No region has been added.'; };
  current.onerror = event => { $('voice-status').textContent = `Voice input: ${event.error}. You can type your question instead.`; };
  current.onend = () => { if (recognition === current) { recognition = null; resetVoiceButton(); } };
  try { current.start(); } catch (error) { recognition = null; resetVoiceButton(); $('voice-status').textContent = error.message; }
});
$('inspector-panel').addEventListener('close', stopVoice);

const samples = {
  'kit-office': { name: 'KIT-Office.ifc', format: 'ifc', preview: 'KIT-Office-preview.png', source: 'https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples', description: 'Architectural office design example from KIT: exterior walls, windows and roof geometry. Fictional design, not a verified built project. 10.9 MB.' },
  'schependomlaan': { name: 'Schependomlaan.ifc', format: 'ifc', preview: 'Schependomlaan-preview.png', source: 'https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/main/IFC%202.3.0.1%20%28IFC%202x3%29/Schependomlaan', description: 'ROOT architectural design model for the Schependomlaan residential project. Published with project and construction data. 49.3 MB; conversion can take longer.' },
  'kit-house': { name: 'KIT-FZK-Haus.ifc', format: 'ifc', preview: 'KIT-FZK-Haus-preview.png', source: 'https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples', description: 'KIT architectural house design example, with windows, doors and pitched roof. Fictional design; compact import test. 2.6 MB.' },
  'school-arq': { name: 'school_arq.frag', format: 'frag', source: 'https://github.com/ThatOpen/engine_components/tree/8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922/resources', description: 'Official That Open architecture model. Preconverted Fragments for visual comparison.' },
  'school-str': { name: 'school_str.ifc', format: 'ifc', source: 'https://github.com/ThatOpen/engine_components/tree/8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922/resources', description: 'Official That Open structural school model. Tests the full IFC import pipeline; facade finishes are not included.' },
  'test-house': { name: 'Building-Architecture.ifc', format: 'ifc', source: 'https://github.com/buildingSMART/Sample-Test-Files', description: 'Compact buildingSMART test house. 13 display components for quick import and identity checks.' }
};

function render() {
  $('proposal-legend').hidden = recommendationVersion !== loadedModel?.modelVersion || !proposalRows.length || selected !== null;
  for (const [id, planId] of [['view-before', null], ['view-extensive', 'light'], ['view-intensive', 'landscape']]) {
    $(id).classList.toggle('active', selected === planId);
    $(id).setAttribute('aria-pressed', String(selected === planId));
  }
  $('preview-switch').hidden = !plannedRegions.length;
  $('preview-before').setAttribute('aria-pressed', String(selected === null));
  $('preview-after').setAttribute('aria-pressed', String(selected !== null));
  $('preview-plan-label').textContent = PLANS.find((plan) => plan.id === lastPlan).name;
  $('export-report').disabled = $('export-handoff').disabled = !plannedRegions.length;
  $('region-summary').textContent = `${plannedRegions.length} confirmed region(s) · same model, areas and period for both plans.`;
  if (!plannedRegions.length) {
    $('scenario-results').innerHTML = '<p class="empty-text">Select a component, open Inspect and add a confirmed greening region. Ground regions can be defined without selecting a component.</p>';
    $('error').textContent = '';
    return;
  }
  try {
    const results = planResults();
    $('scenario-results').innerHTML = results.map((result, index) => {
      const plan = PLANS[index], net = result.netDifferenceKgCo2e;
      return `<article class="scenario ${selected === plan.id ? 'selected' : ''}">
        <div class="scenario-title"><div><h3>${plan.name}</h3><p>${plan.description}</p></div><span>${number(result.coverageM2)} m²</span></div>
        <div class="metrics"><div><small>Installation</small><strong>${money(result.installationCostHkd)}</strong></div><div><small>${result.years}-year cost incl. maintenance</small><strong>${money(result.totalCostHkd)}</strong></div><div><small>${result.years}-year carbon difference</small><strong>${net < 0 ? '−' : '+'}${number(Math.abs(net))} kgCO₂e</strong></div></div>
        ${result.budgetHkd === null ? '' : `<p class="budget-status ${result.withinBudget ? '' : 'over-budget'}">${result.withinBudget ? 'Within' : 'Above'} installation budget of ${money(result.budgetHkd)}${result.withinBudget ? '' : ` by ${money(result.installationCostHkd - result.budgetHkd)}`}</p>`}
        <table class="region-breakdown"><thead><tr><th>Region</th><th>System</th><th>Coverage</th></tr></thead><tbody>${result.items.map((item) => `<tr><td>${REGION_TYPES[item.regionType]}</td><td>${escapeHtml(item.systemName)}</td><td>${item.coverageM2.toFixed(1)} m²</td></tr>`).join('')}</tbody></table>
        <p class="metric-explain">${number(result.installationKgCo2e)} kgCO₂e installation − ${number(result.avoidedOperationalKgCo2e)} kgCO₂e assumed energy savings. Plant carbon sequestration is excluded. Negative means a lower modelled intervention total over this period.</p>
        <details><summary>Factors, assumptions and checks</summary><ul>${result.items.map((item) => `<li>${REGION_TYPES[item.regionType]}: installation ${item.factors.installationKgCo2eM2.value} kgCO₂e/m²; assumed avoided emissions ${item.factors.annualAvoidedKgCo2eM2.value} kgCO₂e/m²/year; added load ${item.factors.addedLoadKgM2.value} kg/m².</li>`).join('')}${result.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join('')}</ul><p>All factors are presentation assumptions. Region uses and usable areas are user-confirmed, not structural approval. Vegetation, sizes and spacing are illustrative. Planted coverage follows the confirmed inputs.</p></details>
      </article>`;
    }).join('');
    $('error').textContent = '';
  } catch (error) {
    $('scenario-results').innerHTML = '';
    $('error').textContent = error.message;
    $('export-report').disabled = $('export-handoff').disabled = true;
  }
}
for (const id of ['years', 'budget']) $(id).addEventListener('input', render);

function invalidateRegionDraft() {
  preparationEpoch++; draftRegion = null;
  $('region-confirmation').hidden = true;
  $('confirm-area').checked = false;
  $('confirm-constraints').checked = false;
  $('add-region').disabled = true;
}
function updateRegionType() {
  invalidateRegionDraft();
  $('ground-fields').hidden = $('region-type').value !== 'ground';
  $('surface-crop-fields').hidden = $('region-type').value === 'ground';
  $('surface-crop').value = $('region-type').value === 'terrace' ? 'front' : 'full';
  $('region-draft-status').textContent = 'Review this surface, then confirm its use and usable area. Geometry estimates assume model coordinates are metres.';
  refreshImportControls();
  void refreshCandidates();
}
$('region-type').addEventListener('change', updateRegionType);
for (const id of ['ground-width','ground-depth','ground-x','ground-z','surface-crop','crop-depth']) $(id).addEventListener('input', invalidateRegionDraft);
$('prepare-region').addEventListener('click', async () => {
  invalidateRegionDraft();
  const epoch = preparationEpoch;
  $('prepare-region').disabled = true;
  $('region-draft-status').textContent = 'Reading the selected surface…';
  try {
    const result = await viewer.prepareRegion({ type: $('region-type').value, selection: selectedComponent, crop: { side: $('surface-crop').value, depth: Number($('crop-depth').value) }, ground: { width: Number($('ground-width').value), depth: Number($('ground-depth').value), offsetX: Number($('ground-x').value), offsetZ: Number($('ground-z').value) } });
    if (epoch !== preparationEpoch) return;
    draftRegion = result;
    $('region-screening').textContent = [...result.screening.reasons, ...result.screening.missing].join(' ');
    $('area').value = (Math.floor(result.geometryAreaM2 * 100) / 100).toFixed(2);
    $('area').max = String(result.geometryAreaM2);
    $('region-confirmation').hidden = false;
    $('region-draft-status').textContent = `Display surface estimate: ${result.geometryAreaM2.toFixed(2)} m². Confirm a usable area within this surface; ${result.type === 'ground' ? 'the rectangle is user-defined, not an IFC property boundary.' : 'the proposed region use requires your confirmation.'}`;
  } catch (error) { if (epoch === preparationEpoch) $('region-draft-status').textContent = error.message; }
  finally { refreshImportControls(); }
});
function refreshRegionConfirmation() {
  const area = Number($('area').value);
  $('add-region').disabled = !draftRegion || !$('confirm-area').checked || !$('confirm-constraints').checked || importing || !Number.isFinite(area) || area <= 0 || area > draftRegion.geometryAreaM2 * 1.001;
}
$('area').addEventListener('input', refreshRegionConfirmation);
$('confirm-area').addEventListener('change', refreshRegionConfirmation);
$('confirm-constraints').addEventListener('change', refreshRegionConfirmation);
$('add-region').addEventListener('click', () => {
  try {
    viewer.confirmRegion(draftRegion.id, Number($('area').value), $('confirm-constraints').checked);
    invalidateRegionDraft();
    selected = lastPlan;
    viewer.setPlan(PLANS.find((plan) => plan.id === selected), true);
    render();
    $('region-draft-status').textContent = 'Region added to both plans. Open Compare or select another component to continue.';
    showStatus('Showing proposed planting. Use Before / After to compare the same model.');
  } catch (error) { $('region-draft-status').textContent = error.message; }
});
function showRegions(regions) {
  plannedRegions = regions;
  if (!applyingCombination) $('combination-status').textContent = regions.length ? `${regions.length} planned region(s). Changes are shared by both comparison plans.` : '';
  $('confirm-combination').checked = false; updateCombinationControls();
  if (!regions.length) { selected = null; invalidateRegionDraft(); }
  $('region-count').textContent = String(regions.length);
  $('region-list').replaceChildren();
  for (const region of regions) {
    const item = document.createElement('li'), text = document.createElement('span'), note = document.createElement('small'), remove = document.createElement('button');
    remove.className = 'btn btn--ghost';
    text.textContent = `${REGION_TYPES[region.type]} · ${region.usableArea.value.toFixed(2)} m²`;
    note.textContent = region.name; text.append(note);
    remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${region.name}`);
    remove.addEventListener('click', () => { invalidateRegionDraft(); viewer.removeRegion(region.id); });
    item.append(text, remove); $('region-list').append(item);
  }
  if (!regions.length) {
    const empty = document.createElement('li'); empty.className = 'empty-text'; empty.textContent = 'No regions added yet.'; $('region-list').append(empty);
  }
  render();
}
function setPreview(planId) {
  if (!plannedRegions.length) { openPanel('inspector-panel'); showStatus('Add a confirmed region before previewing planting.'); return; }
  selected = planId;
  if (planId) { lastPlan = planId; viewer.setPlan(PLANS.find((plan) => plan.id === planId), true); }
  else viewer.setBeforeAfter(false);
  render();
  showStatus(planId ? 'Showing proposed planting. Use Before / After to compare the same model.' : 'Showing the original building. Proposed planting is hidden.');
}
$('preview-before').addEventListener('click', () => setPreview(null));
$('preview-after').addEventListener('click', () => setPreview(lastPlan));
function downloadReport(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function handoff() {
  const { years, budgetHkd } = calculationInputs();
  return { schemaVersion: 'building-greening-regions-1', generatedAt: new Date().toISOString(), model: loadedModel, inputs: { years, budgetHkd: budgetHkd ?? null }, regionUseProvenance: 'user-confirmed', regions: plannedRegions, preview: selected ?? 'before', plans: planResults(), warning: 'Presentation factors, not measured performance. Display geometry estimates assume metres. Professional engineering review is unresolved; no whole-building net-zero or certification claim.' };
}
$('export-handoff').addEventListener('click', () => {
  try { downloadReport(JSON.stringify(handoff(), null, 2), 'application/json', 'building-greening-handoff.json'); }
  catch (error) { $('error').textContent = error.message; }
});
$('export-report').addEventListener('click', () => {
  try {
    const report = handoff();
    const tables = report.plans.map((plan) => `<h2>${escapeHtml(plan.planName)}</h2><p>Covered area: ${plan.coverageM2.toFixed(2)} m² · Installation: ${money(plan.installationCostHkd)} · ${plan.years}-year total cost: ${money(plan.totalCostHkd)} · Carbon difference: ${plan.netDifferenceKgCo2e.toFixed(2)} kgCO₂e</p><table><tr><th>Region / IFC identity</th><th>System</th><th>Area</th><th>Installation</th></tr>${plan.items.map((item) => `<tr><td>${escapeHtml(item.regionName)}<small>${escapeHtml(item.globalId ?? item.regionId)}</small></td><td>${escapeHtml(item.systemName)}</td><td>${item.coverageM2.toFixed(2)} m²</td><td>${money(item.installationCostHkd)}</td></tr>`).join('')}</table><ul>${plan.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join('')}</ul>`).join('');
    downloadReport(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Building Greening Report</title><style>body{font:14px system-ui;max-width:1000px;margin:40px auto;padding:24px;color:#243432}h1,h2{color:#276754}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}small{display:block;overflow-wrap:anywhere;color:#678}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6f4;padding:16px}@media print{body{margin:0}h2{break-after:avoid}}</style><h1>Building greening comparison</h1><p>${escapeHtml(report.model.fileName)} · ${escapeHtml(report.generatedAt)}</p><p>Comparison period: ${report.inputs.years} years · Installation budget: ${report.inputs.budgetHkd === null ? "Not entered" : money(report.inputs.budgetHkd)}</p><p>${escapeHtml(report.warning)}</p>${tables}<h2>Traceable regions, factors and scenario results</h2><pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre></html>`, 'text/html', 'building-greening-report.html');
  } catch (error) { $('error').textContent = error.message; }
});

function showSelection(selection) {
  selectedComponent = selection; invalidateRegionDraft();
  const previousType = $('region-type').value;
  if (selection?.category?.includes('WALL')) $('region-type').value = 'facade';
  else if (selection?.category?.includes('ROOF')) $('region-type').value = 'roof';
  if ($('region-type').value !== previousType) $('surface-crop').value = 'full';
  $('ground-fields').hidden = $('region-type').value !== 'ground';
  $('surface-crop-fields').hidden = $('region-type').value === 'ground';
  refreshImportControls();
  void refreshCandidates();
  $('selection-dot').hidden = !selection;
  const panel = $('selection-details');
  panel.replaceChildren();
  if (!selection) {
    panel.classList.add('empty-text');
    panel.textContent = 'Select a roof, wall or other component in the model to inspect its IFC identity.';
    return;
  }
  panel.classList.remove('empty-text');
  const details = document.createElement('dl');
  for (const [label, value] of [
    ['Name', selection.name], ['IFC type', selection.category],
    ['GlobalId', selection.globalId ?? 'Not available in IFC'],
    ['Local selection ID', selection.localId], ['Model version', selection.modelVersion]
  ]) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = String(value);
    details.append(term, description);
  }
  const properties = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'IFC source attributes';
  const content = document.createElement('pre');
  content.textContent = JSON.stringify(selection.properties, null, 2);
  properties.append(summary, content);
  panel.append(details, properties);
  if (recommendationVersion !== selection.modelVersion) openPanel('inspector-panel', { focus: false });
}

// Name of the active IFC sample (or imported file) shown under "3D Eco-Model Projection".
function modelDisplayName(model) {
  if (!model) return 'No model loaded';
  const key = Object.keys(samples).find((id) => samples[id].name === model.fileName);
  const label = key ? $('sample-model').querySelector(`option[value="${key}"]`)?.textContent : null;
  return label ?? model.fileName;
}

function refreshImportControls() {
  $('ifc-file').disabled = importing || !viewer;
  $('load-sample').disabled = importing || !viewer;
  $('empty-load-sample').disabled = importing || !viewer;
  $('sample-model').disabled = importing;
  $('fit-model').disabled = importing || !loadedModel;
  $('view-iso').disabled = importing || !loadedModel;
  $('view-top').disabled = importing || !loadedModel;
  $('render-style').disabled = importing || !viewer;
  $('show-grid').disabled = importing || !viewer;
  $('clear-selection').disabled = importing || !loadedModel;
  $('prepare-region').disabled = importing || applyingCombination || !loadedModel || !viewer || (!selectedComponent && $('region-type').value !== 'ground');
  $('analyse-building').disabled = $('assistant-ask').disabled = importing || !loadedModel || analysing || applyingCombination;
  updateCombinationControls();
  for (const button of $('region-list').querySelectorAll('button')) button.disabled = importing || applyingCombination;
  $('loading-overlay').hidden = !importing;
  $('viewer-empty').hidden = importing || Boolean(loadedModel);
  $('bim-container').setAttribute('aria-busy', String(importing));
}

function showStatus(message) {
  $('viewer-status').textContent = message;
  $('upload-status').textContent = message;
}

async function importFile(file) {
  if (!viewer || importing) return;
  importing = true;
  refreshImportControls();
  try {
    await viewer.openIfc(file);
    closePanel($('project-panel'));
  }
  catch (error) { showStatus(`IFC import failed: ${error.message}`); }
  finally { importing = false; refreshImportControls(); void refreshCandidates(); if (loadedModel) void analyseLocations('', { open: false }); }
}

$('ifc-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (file) await importFile(file);
  event.target.value = '';
});
async function loadSample() {
  if (importing || !viewer) return;
  importing = true;
  refreshImportControls();
  const sample = samples[$('sample-model').value];
  showStatus(`Loading ${sample.name}…`);
  try {
    const response = await fetch(`/samples/${sample.name}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Sample download returned HTTP ${response.status}`);
    const file = new File([await response.arrayBuffer()], sample.name);
    await (sample.format === 'ifc' ? viewer.openIfc(file) : viewer.openFragments(file));
    closePanel($('project-panel'));
  } catch (error) { showStatus(`Could not load the sample: ${error.message}. You can select a local IFC file instead.`); }
  finally { importing = false; refreshImportControls(); void refreshCandidates(); if (loadedModel) void analyseLocations('', { open: false }); }
}
$('load-sample').addEventListener('click', loadSample);
$('empty-load-sample').addEventListener('click', () => {
  $('sample-model').value = 'kit-office';
  updateSampleDescription();
  void loadSample();
});
function updateSampleDescription() {
  const sample = samples[$('sample-model').value];
  $('sample-description').textContent = sample.description;
  $('sample-download').href = `/samples/${sample.name}`;
  $('sample-source').href = sample.source;
  $('sample-preview').hidden = !sample.preview;
  if (sample.preview) $('sample-preview').src = `/samples/${sample.preview}`;
  else $('sample-preview').removeAttribute('src');
}
$('sample-model').addEventListener('change', updateSampleDescription);
updateSampleDescription();
for (const [id, direction] of [['view-iso', 'iso'], ['view-top', 'top']]) $(id).addEventListener('click', async () => {
  try { await viewer?.setView(direction); }
  catch (error) { showStatus(`Could not change view: ${error.message}`); }
});
$('render-style').addEventListener('change', (event) => {
  try { viewer?.setRenderStyle(event.target.value); }
  catch (error) { showStatus(`Could not change rendering: ${error.message}`); }
});
$('show-grid').addEventListener('change', (event) => viewer?.setGrid(event.target.checked));
for (const [id, method] of [['fit-model', 'fit'], ['clear-selection', 'clearSelection']]) {
  $(id).addEventListener('click', async () => {
    try { await viewer?.[method](); }
    catch (error) { showStatus(error.message); }
  });
}
for (const [buttonId, scenarioId] of [['view-before', null], ['view-extensive', 'light'], ['view-intensive', 'landscape']]) $(buttonId).addEventListener('click', () => setPreview(scenarioId));

async function mountViewer() {
  if (viewerMounted || !$('bim-container')) return;
  viewerMounted = true;
  try {
    // Re-initialisation after a failed/disposed instance must start from a clean container.
    $('bim-container').replaceChildren();
    const { createBimViewer } = await import('../src/adapters/bim-viewer.js');
    viewer = await createBimViewer($('bim-container'), {
      onSelection: showSelection,
      onPick: toggleModelLocation,
      onRegions: showRegions,
      onStatus: showStatus,
      onZoom: (percent) => {
        $('zoom-indicator').hidden = percent === null;
        if (percent !== null) $('zoom-percent').textContent = `${percent}%`;
      },
      onModel: (model) => {
        assistantEpoch++; analysing = false; combinationEpoch++; applyingCombination = false; proposalRows = []; recommendedGuids.clear(); recommendationVersion = null; lastHighlightKey = null; $('proposal-legend').hidden = true; candidateCache.clear(); stopVoice();
        $('combination-controls').hidden = true; $('confirm-combination').checked = false; $('combination-status').textContent = '';
        $('assistant-candidates').replaceChildren();
        $('assistant-answer').textContent = 'Find candidates for the current model. Nothing is added automatically.';
        loadedModel = model;
        $('eco-model-name').textContent = modelDisplayName(model);
        $('model-status-label').textContent = model ? `${model.componentCount.toLocaleString()} components` : 'Ready to import';
        $('viewer-badge').textContent = model ? (model.sourceFormat === 'frag' ? 'Fragments · IFC-derived' : 'IFC geometry') : 'No model loaded';
        $('inventory-total').textContent = model ? model.componentCount.toLocaleString() : '—';
        $('category-list').replaceChildren();
        for (const category of model?.categoryCounts ?? []) {
          const item = document.createElement('li');
          const label = document.createElement('span');
          const count = document.createElement('span');
          label.textContent = category.name;
          count.textContent = category.count.toLocaleString();
          item.append(label, count);
          $('category-list').append(item);
        }
        if (!model) {
          const item = document.createElement('li');
          item.className = 'empty-text';
          item.textContent = 'Component types appear after loading.';
          $('category-list').append(item);
        }
        refreshImportControls();
      }
    });
    if (parseRoute().name !== VIEWER_ROUTE) viewer.pause(); // user navigated away while it was initialising
    showStatus('3D viewer ready. Select an IFC file or load the building sample.');
    refreshImportControls();
    void loadSample();
  } catch (error) {
    viewer = undefined;
    viewerMounted = false; // allow a retry the next time the Calculator view is opened
    showStatus(`Could not initialize the 3D viewer: ${error.message}`);
  }
}

render();
refreshImportControls();
wireFlora();
wireDirectory();
wireMessaging();

// Kick off the initial route.
if (!location.hash) location.hash = '#/dashboard';
renderRoute();

if (import.meta.hot) import.meta.hot.dispose(() => {
  document.removeEventListener('pointerdown', buttonRipple);
  document.removeEventListener('click', buttonRipple);
  for (const ripple of document.querySelectorAll('.button-ripple')) {
    for (const animation of ripple.getAnimations()) animation.cancel();
    ripple.remove();
  }
  stopVoice();
  void viewer?.dispose();
});
