'use strict';

const API_KEY  = 'pub_65775f28d35647a8861b3d110df8b6ce';
const CACHE_KEY = 'briefd_cache';
const CACHE_TTL = 30 * 60 * 1000;

const CATEGORY_COLORS = {
  Finance:    '#1B2A4A',
  Technology: '#2A4A1B',
  Ecommerce:  '#4A1B2A',
};

const QUERIES = [
  { category: 'Finance',    q: 'finance',   domain: '' },
  { category: 'Technology', q: 'technology',domain: '' },
  { category: 'Ecommerce',  q: 'ecommerce', domain: '' },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function timeAgo(dateString) {
  if (!dateString) return '';
  const then = new Date(dateString).getTime();
  if (isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60)  return `${mins}m ago`;
  if (hrs  < 24)  return `${hrs}h ago`;
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g,    ' ')
    .trim();
}

function extractSummary(text) {
  const clean = stripHtml(text);
  const parts = clean.split('. ');
  if (parts.length <= 1) return clean;
  return parts.slice(0, 2).join('. ').trimEnd() + '.';
}

function firstSentence(text) {
  const idx = text.indexOf('. ');
  return idx !== -1 ? text.slice(0, idx + 1) : text;
}

function escHtml(str) {
  return (str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? url : '#';
  } catch { return '#'; }
}

// ─── Cache ────────────────────────────────────────────────────────────────────

function getCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL) return null;
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

function setCached(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchAllFeeds() {
  const cached = getCached();
  if (cached) return cached;

  const results = await Promise.allSettled(
    QUERIES.map(async ({ category, q }) => {
      const url = `https://newsdata.io/api/1/news?apikey=${API_KEY}&q=${encodeURIComponent(q)}&language=en&size=10`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status !== 'success') throw new Error(json.message || 'API error');
      return (json.results || []).map(item => ({
        title:       (item.title || '').trim(),
        url:         item.link || '',
        source:      item.source_name || item.source_id || 'Unknown',
        category,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : '',
        imageUrl:    item.image_url || null,
        description: extractSummary(item.description || item.content || ''),
      }));
    })
  );

  const seen     = new Set();
  const articles = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const a of result.value) {
      if (!a.title) continue;
      const key = a.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      articles.push(a);
    }
  }

  articles.sort((a, b) => {
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });

  setCached(articles);
  return articles;
}

// ─── HTML Builders ────────────────────────────────────────────────────────────

window.briefdImgError = function (img) {
  const ph = document.createElement('div');
  ph.className = 'article-image image-placeholder';
  ph.style.background = CATEGORY_COLORS[img.dataset.category] || '#333';
  ph.innerHTML = `<span>${escHtml(img.dataset.category || '')}</span>`;
  img.replaceWith(ph);
};

function imgHtml(article) {
  const bg  = CATEGORY_COLORS[article.category] || '#333';
  const cat = escHtml(article.category);
  if (!article.imageUrl) {
    return `<div class="article-image image-placeholder" style="background:${bg}"><span>${cat}</span></div>`;
  }
  return `<img class="article-image" src="${escHtml(article.imageUrl)}" alt="" loading="lazy" data-category="${cat}" onerror="briefdImgError(this)">`;
}

function metaHtml(a) {
  return `<span class="article-meta">${escHtml(a.source)} &middot; ${escHtml(timeAgo(a.publishedAt))}</span>`;
}

function headlineHtml(a, cls) {
  return `<a class="${cls}" href="${escHtml(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${escHtml(a.title)}</a>`;
}

// ─── Renderers ────────────────────────────────────────────────────────────────

function renderHero(article, container) {
  const el = container || document.getElementById('hero');
  if (!article) { el.innerHTML = ''; return; }
  el.innerHTML = `
    ${imgHtml(article)}
    <span class="article-category">${escHtml(article.category)}</span>
    ${headlineHtml(article, 'article-headline')}
    ${metaHtml(article)}
    <p class="article-summary">${escHtml(article.description)}</p>
  `;
}

function renderMedium(articles, container) {
  const el = container || document.getElementById('row-two');
  el.innerHTML = articles.slice(0, 2).map(a => `
    <div class="article-card">
      ${imgHtml(a)}
      <span class="article-category">${escHtml(a.category)}</span>
      ${headlineHtml(a, 'article-headline')}
      ${metaHtml(a)}
      <p class="article-summary">${escHtml(a.description)}</p>
    </div>
  `).join('');
}

function renderSmall(articles, container) {
  const el = container || document.getElementById('row-three');
  el.innerHTML = articles.slice(0, 3).map(a => `
    <div class="article-card">
      <span class="article-category">${escHtml(a.category)}</span>
      ${headlineHtml(a, 'article-headline')}
      ${metaHtml(a)}
      <p class="article-summary">${escHtml(firstSentence(a.description))}</p>
    </div>
  `).join('');
}

function renderSidebar(articles) {
  document.getElementById('sidebar-list').innerHTML = articles.slice(0, 8).map(a => `
    <li class="sidebar-item">
      <a class="sidebar-headline" href="${escHtml(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${escHtml(a.title)}</a>
      <span class="sidebar-timestamp">${escHtml(timeAgo(a.publishedAt))}</span>
    </li>
  `).join('');
}

function renderNewspaper(articles) {
  document.querySelectorAll('.hero-slot.appended, .row-two.appended, .row-three.appended').forEach(el => el.remove());
  if (!articles || articles.length === 0) {
    document.getElementById('loader').innerHTML = '<p class="error-msg">No articles found. Try refreshing.</p>';
    return;
  }
  renderHero(articles[0]);
  renderMedium(articles.slice(1, 3));
  renderSmall(articles.slice(3, 6));
  renderSidebar(articles.slice(0, 8));
  window.remainingArticles = articles.slice(6);
  const btn = document.getElementById('load-more');
  btn.style.display = window.remainingArticles.length ? '' : 'none';
}
// ─── Load More ────────────────────────────────────────────────────────────────

function appendMoreArticles() {
  const pool = window.remainingArticles || [];
  if (!pool.length) return;
  const batch = pool.splice(0, 6);
  window.remainingArticles = pool;
  const gridMain     = document.querySelector('.grid-main');
  const loadMoreWrap = document.getElementById('load-more').parentElement;
  if (batch[0]) {
    const sec = document.createElement('section');
    sec.className = 'hero-slot appended';
    renderHero(batch[0], sec);
    gridMain.insertBefore(sec, loadMoreWrap);
  }
  if (batch[1]) {
    const sec = document.createElement('section');
    sec.className = 'row-two appended';
    renderMedium(batch.slice(1, 3), sec);
    gridMain.insertBefore(sec, loadMoreWrap);
  }
  if (batch[3]) {
    const sec = document.createElement('section');
    sec.className = 'row-three appended';
    renderSmall(batch.slice(3, 6), sec);
    gridMain.insertBefore(sec, loadMoreWrap);
  }
  if (!pool.length) document.getElementById('load-more').style.display = 'none';
}

// ─── Filter & Tabs ────────────────────────────────────────────────────────────

function filterAndRender(category) {
  const all      = window.allArticles || [];
  const filtered = category === 'All' ? all : all.filter(a => a.category === category);
  renderNewspaper(filtered);
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      filterAndRender(tab.dataset.category);
    });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function setMastheadDate() {
  const el = document.getElementById('masthead-date');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  setMastheadDate();
  initTabs();
  document.getElementById('load-more').addEventListener('click', appendMoreArticles);

  const loader = document.getElementById('loader');
  const grid   = document.getElementById('newspaper-grid');

  try {
    const articles     = await fetchAllFeeds();
    window.allArticles = articles;
    loader.hidden      = true;
    grid.hidden        = false;
    renderNewspaper(articles);
  } catch (err) {
    loader.innerHTML = '<p class="error-msg">Could not load news. Try refreshing.</p>';
    console.error('[BRIEFD]', err);
  }
});