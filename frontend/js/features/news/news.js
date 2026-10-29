import { byId, $$, esc } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { openModal, closeModal } from '../../components/modal.js';
import { loadData } from '../../utils/data.js';
import { revealOnScroll } from '../../components/nav.js';
import { registerActions } from '../../utils/actions.js';

let articles = [];
let current = [];
let visibleCount = 4;
let notice = '';

function cardSvg(a) {
  const h = a.wide ? 220 : 170;
  const lines = [40, 80, 120, 160].map((y) => `<line x1="0" y1="${y}" x2="360" y2="${y}" stroke="rgba(74,144,196,0.12)" stroke-width="1"/>`).join('')
    + [90, 180, 270].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="rgba(74,144,196,0.1)" stroke-width="1"/>`).join('');
  const mid = Math.round(h / 2);
  return `<svg viewBox="0 0 360 ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="cg${a.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${esc(a.c1)}"/><stop offset="100%" stop-color="${esc(a.c2)}"/></linearGradient></defs>
    <rect width="360" height="${h}" fill="url(#cg${a.id})"/>${lines}
    <polyline points="10,22 10,10 22,10" fill="none" stroke="rgba(74,144,196,0.5)" stroke-width="1.5"/>
    <polyline points="338,10 350,10 350,22" fill="none" stroke="rgba(74,144,196,0.5)" stroke-width="1.5"/>
    <polyline points="10,${h - 22} 10,${h - 10} 22,${h - 10}" fill="none" stroke="rgba(74,144,196,0.5)" stroke-width="1.5"/>
    <polyline points="338,${h - 10} 350,${h - 10} 350,${h - 22}" fill="none" stroke="rgba(74,144,196,0.5)" stroke-width="1.5"/>
    <circle cx="280" cy="${mid}" r="55" fill="rgba(74,144,196,0.08)" stroke="rgba(74,144,196,0.18)" stroke-width="1"/>
    <g fill="none" stroke="#4a90c4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
      <use href="assets/icons/sprite.svg#${esc(a.icon)}" x="252" y="${mid - 28}" width="56" height="56"/>
    </g></svg>`;
}

function renderCards() {
  const grid = byId('newsGrid');
  grid.innerHTML = '';
  if (!current.length) { grid.innerHTML = '<div class="state-box">No articles match your search.</div>'; }
  current.slice(0, visibleCount).forEach((a, i) => {
    const card = document.createElement('div');
    card.className = `news-card${a.wide ? ' wide' : ''}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Read: ${a.title}`);
    card.innerHTML = `
      <div class="card-img">${cardSvg(a)}<div class="card-badge ${esc(a.bc)}">${esc(a.badge)}</div></div>
      <div class="card-body">
        <div class="card-cat">${esc(a.cat_label)}</div>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.excerpt)}</p>
        <div class="card-foot"><span>${icon('calendar')} ${esc(a.date)} · ${esc(a.read)} read</span><span class="card-btn">Read more ${icon('arrow-right')}</span></div>
      </div>`;
    const open = () => openArticle(a.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    grid.appendChild(card);
    setTimeout(() => card.classList.add('card-visible'), 80 * i);
  });
  const more = byId('loadMoreBtn');
  more.style.display = visibleCount >= current.length ? 'none' : 'block';
}

function openArticle(id) {
  const a = articles.find((x) => x.id === id);
  if (!a) return;
  byId('mCat').textContent = a.cat_label;
  byId('mTitle').textContent = a.title;
  byId('mBody').textContent = a.body;
  byId('mAuthor').innerHTML = `${icon('pen-line')} ${esc(a.author)}`;
  byId('mDate').innerHTML = `${icon('calendar')} ${esc(a.date)}`;
  byId('mRead').innerHTML = `${icon('timer')} ${esc(a.read)} read`;
  openModal(byId('newsModalOverlay'), 'open');
}

function applyFilter(cat) {
  $$('.ftab').forEach((t) => { const on = t.dataset.cat === cat; t.classList.toggle('active', on); t.setAttribute('aria-pressed', String(on)); });
  visibleCount = 4;
  current = cat === 'all' ? [...articles] : articles.filter((a) => a.cat === cat);
  byId('loadMoreBtn').textContent = 'Load More Articles';
  renderCards();
}

function doSearch() {
  const q = byId('searchInput').value.toLowerCase().trim();
  current = !q ? [...articles] : articles.filter((a) => a.title.toLowerCase().includes(q) || a.excerpt.toLowerCase().includes(q));
  visibleCount = 8;
  $$('.ftab').forEach((t) => { t.classList.toggle('active', t.dataset.cat === 'all'); });
  renderCards();
}

export async function initNews() {
  const grid = byId('newsGrid');
  try {
    const [art, trend, ticker] = await Promise.all([loadData('articles'), loadData('trending'), loadData('ticker')]);
    articles = art.articles; current = [...articles]; notice = art._meta.notice;
    byId('sampleNote').textContent = 'Sample content: the articles, headlines and trending list on this page are illustrative placeholders, not real news or medical advice.';
    byId('tickerScroll').innerHTML = [...ticker.items, ...ticker.items].map((t) => `<span><span class="tick-dot">●</span>Sample: ${esc(t)}</span>`).join('');
    byId('trendList').innerHTML = trend.trending.map((t, i) =>
      `<div class="trend-item"><div class="trend-num">0${i + 1}</div><div class="trend-text"><h4>${esc(t.t)}</h4><span>${esc(t.c)} · sample</span></div></div>`).join('');
    renderCards();
  } catch (err) {
    console.error('news content failed to load:', err.message);
    grid.innerHTML = '<div class="state-box">Could not load the sample articles. Please refresh the page.</div>';
  }

  byId('filterRow').addEventListener('click', (e) => { const b = e.target.closest('.ftab'); if (b) applyFilter(b.dataset.cat); });
  byId('loadMoreBtn').addEventListener('click', function more() {
    visibleCount += 4; renderCards();
    if (visibleCount >= current.length) this.textContent = 'All Caught Up';
  });
  byId('searchBtn').addEventListener('click', doSearch);
  byId('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  byId('newsModalClose').addEventListener('click', () => closeModal(byId('newsModalOverlay')));
  byId('newsModalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(e.currentTarget); });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-footer-cat]');
    if (a) applyFilter(a.dataset.footerCat);
  });
  revealOnScroll();
}

// Legal / info modal (privacy notice + medical disclaimer), content from js/data/legal.json
export function initLegal() {
  registerActions({
    'open-legal': async ({ arg }) => {
      try {
        const legal = (await loadData('legal'))[arg];
        byId('legalTitle').textContent = legal.title;
        byId('legalBody').innerHTML = legal.html; // trusted: static, first-party JSON file
        openModal(byId('legalModalOverlay'), 'open');
      } catch { byId('legalTitle').textContent = 'Unavailable'; }
    },
  });
  byId('legalModalClose').addEventListener('click', () => closeModal(byId('legalModalOverlay')));
  byId('legalModalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(e.currentTarget); });
}
