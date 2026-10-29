// Builds the blog from content/ on every Vercel deploy (npm run build).
//
// Inputs:  content/blog/*.md           posts written in the /owner editor (front matter + markdown)
//          content/blog-categories.json categories and subcategories (also edited in /owner)
//          content/sitemap-pages.xml    hand-maintained sitemap entries for the non-blog pages
//          services/drywall-paint.html  source of the shared nav, footer, base styles and tracking
// Outputs: blog.html, blog/<slug>.html, blog/category/<cat>.html, blog/category/<cat>/<sub>.html,
//          blog/feed.xml, llms.txt, llms-full.txt, sitemap.xml  (all gitignored)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { Marked } from 'marked';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.bellnhammer.com';
const BIZ = 'Bell & Hammer';
const LICENSE = 'BELLHH*754BC';
const INDEXNOW_KEY = fs.readFileSync(path.join(ROOT, 'content/indexnow-key.txt'), 'utf8').trim();

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => { const f = path.join(ROOT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const iso = d => (d instanceof Date ? d.toISOString() : String(d || '')).slice(0, 10);
const nice = d => new Date(iso(d) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const ENT = { amp: '&', quot: '"', apos: "'", '#39': "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–' };
const plain = html => html.replace(/<[^>]+>/g, ' ').replace(/&([a-z]+|#\d+);/gi, (m, e) => ENT[e.toLowerCase()] ?? ' ').replace(/\s+/g, ' ').trim();
const warn = m => console.warn('  ! ' + m);

// ── Shared chrome lifted from a stable page so sitewide nav/footer edits flow into the blog ──
const src = read('services/drywall-paint.html');
const grab = (re, what) => { const m = src.match(re); if (!m) throw new Error('template piece not found: ' + what); return m[0]; };
const rootPaths = s => s.replace(/(href|src)="\.\.\//g, '$1="/');
const BASE_STYLE = grab(/<style>[\s\S]*?<\/style>/, 'style');
const TRACKING = src.slice(src.indexOf('<!-- Google tag (gtag.js) -->'), src.indexOf('<link rel="stylesheet" href="../assets/site-extras.css">'));
const NAV = rootPaths(grab(/<nav class="nav">[\s\S]*?<\/nav>/, 'nav'));
const FOOTER = rootPaths(grab(/<footer[\s\S]*?<\/footer>/, 'footer'));
const NAVJS = grab(/<script>const toggle=[\s\S]*?<\/script>/, 'nav script');
if (!TRACKING.includes('AW-18087596761')) throw new Error('conversion tracking not found in template');

const AUTHORS = {
  'Bryce Bell': { type: 'Person', title: 'Co-Founder, Bell & Hammer', mono: 'BB' },
  'Trayton Shelton': { type: 'Person', title: 'Co-Founder, Bell & Hammer', mono: 'TS' },
  'Bell & Hammer Team': { type: 'Organization', title: 'Licensed General Contractor, Kitsap County WA', mono: 'BH' },
};
const SERVICES = {
  'services/kitchen-bath-remodels.html': 'Kitchen & Bath Remodels', 'services/home-additions-adus.html': 'Home Additions & ADUs',
  'services/roofing-siding.html': 'Roofing & Siding', 'services/windows-doors.html': 'Windows & Doors',
  'services/decks-fences.html': 'Decks & Fences', 'services/repairs-restoration.html': 'Repairs & Restoration',
  'services/flooring-tile.html': 'Flooring & Tile', 'services/drywall-paint.html': 'Drywall, Texture & Paint',
  'services/landscape-outdoor.html': 'Landscape & Outdoor', 'demo-and-hauling.html': 'Demo & Hauling', 'commercial.html': 'Commercial',
};
const PUBLISHER = { '@type': 'GeneralContractor', '@id': SITE + '/#business', name: BIZ, url: SITE + '/', telephone: '+1-360-710-0409',
  logo: { '@type': 'ImageObject', url: SITE + '/images/logo.png' }, image: SITE + '/images/logo.png',
  identifier: { '@type': 'PropertyValue', propertyID: 'WA L&I Contractor License', value: LICENSE } };

// ── Categories ──
const catData = JSON.parse(read('content/blog-categories.json'));
const cats = (catData.categories || []).filter(c => c && c.name).map(c => ({ ...c, slug: slugify(c.name), subs: [] }));
const catByName = new Map(cats.map(c => [c.name, c]));
for (const s of catData.subcategories || []) {
  if (!s || !s.name) continue;
  const parent = catByName.get(s.parent);
  if (!parent) { warn(`subcategory "${s.name}" has unknown parent "${s.parent}" — skipped`); continue; }
  parent.subs.push({ ...s, slug: slugify(s.name), parentCat: parent });
}
const catUrl = c => `/blog/category/${c.slug}.html`;
const subUrl = s => `/blog/category/${s.parentCat.slug}/${s.slug}.html`;

// ── Posts ──
const posts = [];
for (const file of fs.readdirSync(path.join(ROOT, 'content/blog')).filter(f => f.endsWith('.md')).sort()) {
  const { data, content } = matter(read('content/blog/' + file));
  if (data.draft) { console.log('  draft, skipped:', file); continue; }
  if (!data.title) { warn(file + ' has no title — skipped'); continue; }
  const slug = slugify(path.basename(file, '.md'));
  const cat = catByName.get(data.category);
  if (!cat) warn(`${file}: category "${data.category}" not found`);
  let sub = cat && data.subcategory ? cat.subs.find(s => s.name === data.subcategory) : null;
  if (data.subcategory && !sub) warn(`${file}: subcategory "${data.subcategory}" is not under "${data.category}"`);

  // Headings get ids for the table of contents and for deep links from AI answers
  const toc = [];
  const used = new Set();
  const renderer = {
    heading({ tokens, depth }) {
      const inner = this.parser.parseInline(tokens);
      let id = slugify(plain(inner)) || 'section';
      while (used.has(id)) id += '-2';
      used.add(id);
      if (depth === 2) toc.push({ id, text: plain(inner) });
      return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
    },
  };
  const md = new Marked({ gfm: true, renderer });
  const html = md.parse(content || '');
  const words = plain(html).split(' ').length;
  posts.push({
    ...data, slug, cat, sub, html, toc, words, url: `/blog/${slug}.html`,
    date: iso(data.date) || '2026-01-01', updated: iso(data.updated) || iso(data.date) || '2026-01-01',
    takeaways: (data.takeaways || []).filter(Boolean), faq: (data.faq || []).filter(f => f && f.question && f.answer),
    author: AUTHORS[data.author] ? data.author : 'Bell & Hammer Team', markdown: content || '',
  });
}
posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

// ── Page shell ──
function page({ path: p, title, description, body, schema = [], ogType = 'website', image, noindex }) {
  const url = SITE + p;
  const img = image ? (image.startsWith('http') ? image : SITE + image) : SITE + '/images/logo.png';
  const ld = schema.map(s => `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">'}
    <link rel="canonical" href="${url}">
    <link rel="alternate" type="application/rss+xml" title="Bell &amp; Hammer Blog" href="${SITE}/blog/feed.xml">
    <meta property="og:site_name" content="Bell &amp; Hammer">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:type" content="${ogType}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${img}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <link rel="icon" href="/images/logo.png">
    <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    ${BASE_STYLE}
    <link rel="stylesheet" href="/assets/blog.css">
${ld}
${TRACKING}<link rel="stylesheet" href="/assets/site-extras.css">
<script src="/assets/site-extras.js" defer></script>
</head>
<body>
${NAV}
${body}
${FOOTER}
${NAVJS}
</body></html>
`;
}

function blogNav(activeCat, activeSub) {
  const items = cats.map(c => {
    const dd = c.subs.length ? `<div class="bn-dd">${c.subs.map(s => `<a href="${subUrl(s)}"${s === activeSub ? ' class="on"' : ''}>${esc(s.name)}</a>`).join('')}</div>` : '';
    return `<div class="bn-item"><a class="bn-link${c === activeCat ? ' on' : ''}" href="${catUrl(c)}">${esc(c.name)}${c.subs.length ? '<span class="caret">&#9660;</span>' : ''}</a>${dd}</div>`;
  }).join('');
  return `<nav class="blog-nav" aria-label="Blog categories"><div class="bn-inner"><div class="bn-item"><a class="bn-link${activeCat ? '' : ' on'}" href="/blog.html">All Posts</a></div>${items}</div></nav>`;
}

function crumbs(list) {
  const html = list.map(([n, u], i) => i === list.length - 1 ? `<span>${esc(n)}</span>` : `<a href="${u}">${esc(n)}</a><span aria-hidden="true">/</span>`).join('');
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE + u })) };
  return [`<nav class="crumbs" aria-label="Breadcrumb">${html}</nav>`, ld];
}

const card = (p, featured) => `<a class="post-card${featured ? ' featured' : ''}" href="${p.url}">
  ${p.cover ? `<div class="pc-img"><img src="${esc(p.cover)}" alt="${esc(p.cover_alt || p.title)}" loading="lazy"></div>` : ''}
  <div class="pc-body"><span class="pc-cat">${esc(p.sub ? p.sub.name : p.cat ? p.cat.name : p.label || 'Blog')}</span>
  <h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><time class="pc-date" datetime="${p.updated}">Updated ${nice(p.updated)}</time></div></a>`;

const itemList = (list, name) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name,
  itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + p.url, name: p.title })) });

// ── Post pages ──
for (const p of posts) {
  const trail = [['Home', '/'], ['Blog', '/blog.html']];
  if (p.cat) trail.push([p.cat.name, catUrl(p.cat)]);
  if (p.sub) trail.push([p.sub.name, subUrl(p.sub)]);
  trail.push([p.title, p.url]);
  const [crumbHtml, crumbLd] = crumbs(trail);
  const a = AUTHORS[p.author];
  const minutes = Math.max(1, Math.round(p.words / 230));
  const related = posts.filter(o => o !== p && o.cat && o.cat === p.cat).concat(posts.filter(o => o !== p && o.cat !== p.cat)).slice(0, 3);
  const svc = SERVICES[p.service] ? p.service : null;

  const body = `
<header class="article-hero"><div class="container">
  ${crumbHtml}
  <h1>${esc(p.title)}</h1>
  <div class="article-meta"><span>By <strong>${esc(p.author)}</strong></span><span>Updated <time datetime="${p.updated}">${nice(p.updated)}</time></span><span>${minutes} min read</span>${p.label ? `<span>${esc(p.label)}</span>` : ''}</div>
</div></header>
${blogNav(p.cat, p.sub)}
<article class="article-body">
  ${p.cover ? `<figure class="cover"><img src="${esc(p.cover)}" alt="${esc(p.cover_alt || p.title)}"></figure>` : ''}
  ${p.quick_answer ? `<div class="quick-answer"><span class="qa-label">Quick Answer</span><p>${esc(p.quick_answer)}</p></div>` : ''}
  ${p.takeaways.length ? `<div class="takeaways"><span class="qa-label">Key Takeaways</span><ul>${p.takeaways.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
  ${p.toc.length >= 3 ? `<nav class="toc" aria-label="In this article"><span class="qa-label">In This Article</span><ol>${p.toc.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></nav>` : ''}
  ${p.html}
  ${p.faq.length ? `<section class="faq-block"><h2 id="faq">Frequently Asked Questions</h2>${p.faq.map(f => `<div class="faq-q"><h3>${esc(f.question)}</h3><p>${esc(f.answer)}</p></div>`).join('')}</section>` : ''}
  <div class="author-box"><div class="mono">${a.mono}</div><p><strong>${esc(p.author)} &middot; ${esc(a.title)}</strong>Bell &amp; Hammer is a licensed, bonded &amp; insured general contractor (WA L&amp;I ${LICENSE}) based in Bremerton, serving Kitsap County homeowners. Pricing and timelines in this article come from our own job sites.</p></div>
</article>
<div class="article-cta">
  <div class="tag">Get Started</div>
  <h2>${esc(p.cta_heading || "Let's Talk About Your Project")}</h2>
  <p>${esc(p.cta_text || "We'll walk through your space, talk through your goals, and give you a straight answer on cost and timeline. No pressure.")}</p>
  <div class="cta-actions"><a href="/#contact" class="btn btn-rust">Request Free Estimate</a><a href="tel:3607100409" class="btn btn-ghost">(360) 710-0409</a></div>
  ${svc ? `<a class="svc-link" href="/${svc}">Learn about our ${esc(SERVICES[svc])} services &rarr;</a>` : ''}
</div>
${related.length ? `<section class="related"><div class="tag">Keep Reading</div><h2>Related Articles</h2><div class="post-grid">${related.map(r => card(r)).join('')}</div></section>` : ''}`;

  const article = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', '@id': SITE + p.url + '#article',
    headline: p.title.slice(0, 110), description: p.description, url: SITE + p.url, mainEntityOfPage: SITE + p.url,
    datePublished: p.date, dateModified: p.updated, wordCount: p.words, inLanguage: 'en-US',
    articleSection: p.cat ? p.cat.name : undefined, keywords: [p.cat?.name, p.sub?.name, 'Kitsap County'].filter(Boolean).join(', '),
    image: p.cover ? SITE + p.cover : SITE + '/images/logo.png',
    author: a.type === 'Person' ? { '@type': 'Person', name: p.author, jobTitle: a.title, worksFor: { '@id': PUBLISHER['@id'] } } : { '@id': PUBLISHER['@id'], '@type': 'GeneralContractor', name: BIZ, url: SITE + '/' },
    publisher: PUBLISHER, isPartOf: { '@type': 'Blog', '@id': SITE + '/blog.html#blog', name: 'Bell & Hammer Blog' },
    ...(p.quick_answer ? { abstract: p.quick_answer } : {}),
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.quick-answer', 'h1'] },
  };
  const schema = [article, crumbLd];
  if (p.faq.length) schema.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) });
  write(p.url.slice(1), page({ path: p.url, title: `${p.seo_title || p.title} | Bell & Hammer`, description: p.description, body, schema, ogType: 'article', image: p.cover }));
}

// ── Category + subcategory pages ──
function listing({ path: pth, title, heading, lead, list, cat, sub, trail }) {
  const [crumbHtml, crumbLd] = crumbs(trail);
  const chips = cat && cat.subs.length ? `<div class="sub-chips"><a href="${catUrl(cat)}"${sub ? '' : ' class="on"'}>All ${esc(cat.name)}</a>${cat.subs.map(s => `<a href="${subUrl(s)}"${s === sub ? ' class="on"' : ''}>${esc(s.name)}</a>`).join('')}</div>` : '';
  const body = `
<header class="article-hero wide"><div class="container">${crumbHtml}<h1>${heading}</h1>${lead ? `<p class="hero-lead">${esc(lead)}</p>` : ''}</div></header>
${blogNav(cat, sub)}
<section class="blog-wrap">${chips}${list.length ? `<div class="post-grid">${list.map(p => card(p)).join('')}</div>` : '<p class="empty">No articles here yet &mdash; check back soon.</p>'}</section>`;
  const schema = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: SITE + pth, description: lead, isPartOf: { '@id': SITE + '/blog.html#blog' } }, itemList(list, title), crumbLd];
  write(pth.slice(1), page({ path: pth, title: `${title} | Bell & Hammer Blog`, description: lead || `${title} articles from Bell & Hammer, a Kitsap County general contractor.`, body, schema, noindex: !list.length }));
}
for (const c of cats) {
  const inCat = posts.filter(p => p.cat === c);
  listing({ path: catUrl(c), title: c.name, heading: esc(c.name), lead: c.description, list: inCat, cat: c, trail: [['Home', '/'], ['Blog', '/blog.html'], [c.name, catUrl(c)]] });
  for (const s of c.subs) {
    listing({ path: subUrl(s), title: `${s.name} — ${c.name}`, heading: `${esc(s.name)}`, lead: s.description, list: inCat.filter(p => p.sub === s), cat: c, sub: s,
      trail: [['Home', '/'], ['Blog', '/blog.html'], [c.name, catUrl(c)], [s.name, subUrl(s)]] });
  }
}

// ── Blog index ──
{
  const [crumbHtml, crumbLd] = crumbs([['Home', '/'], ['Blog', '/blog.html']]);
  const topics = cats.map(c => { const n = posts.filter(p => p.cat === c).length; return `<a class="topic" href="${catUrl(c)}"><h3>${esc(c.name)}</h3><p>${esc(c.description || '')}</p><span class="count">${n} article${n === 1 ? '' : 's'}${c.subs.length ? ` &middot; ${c.subs.length} topic${c.subs.length === 1 ? '' : 's'}` : ''}</span></a>`; }).join('');
  const body = `
<header class="article-hero wide"><div class="container">${crumbHtml}<div class="tag">Resources</div><h1>The <em>Blog</em></h1>
<p class="hero-lead">Straight answers on remodel costs, permits, timelines and materials from a licensed Kitsap County general contractor &mdash; based on real job sites, not national averages.</p></div></header>
${blogNav(null, null)}
<section class="blog-wrap">
  ${posts.length ? `<div class="post-grid">${posts.map((p, i) => card(p, i === 0)).join('')}</div>` : '<p class="empty">Articles coming soon.</p>'}
  ${cats.length ? `<div class="tag" style="margin-top:72px;">Browse by Topic</div><div class="topic-grid" style="margin-top:12px;">${topics}</div>` : ''}
</section>`;
  const schema = [{ '@context': 'https://schema.org', '@type': 'Blog', '@id': SITE + '/blog.html#blog', name: 'Bell & Hammer Blog', url: SITE + '/blog.html', publisher: PUBLISHER, inLanguage: 'en-US',
    blogPost: posts.map(p => ({ '@type': 'BlogPosting', headline: p.title, url: SITE + p.url, datePublished: p.date, dateModified: p.updated })) }, crumbLd];
  write('blog.html', page({ path: '/blog.html', title: 'Blog — Remodel Costs, Permits & Materials in Kitsap County | Bell & Hammer', description: 'Straight answers on remodel costs, permits, timelines and materials from a licensed Kitsap County general contractor.', body, schema }));
}

// ── RSS ──
const xml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
write('blog/feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>Bell &amp; Hammer Blog</title><link>${SITE}/blog.html</link><description>Remodel costs, permits and materials in Kitsap County, WA.</description><language>en-us</language>
<atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${posts.map(p => `<item><title>${xml(p.title)}</title><link>${SITE}${p.url}</link><guid>${SITE}${p.url}</guid><pubDate>${new Date(p.date + 'T12:00:00Z').toUTCString()}</pubDate>${p.cat ? `<category>${xml(p.cat.name)}</category>` : ''}<description>${xml(p.quick_answer || p.description)}</description></item>`).join('\n')}
</channel></rss>
`);

// ── llms.txt (the index AI assistants read) + llms-full.txt (full article text) ──
const servicesList = Object.entries(SERVICES).map(([u, n]) => `- [${n}](${SITE}/${u})`).join('\n');
write('llms.txt', `# Bell & Hammer

> Bell & Hammer is a licensed, bonded and insured residential general contractor based in Bremerton, Washington (WA L&I license ${LICENSE}), serving Kitsap County: Bremerton, Silverdale, Poulsbo, Port Orchard, Bainbridge Island and nearby communities. Commercial tenant-improvement work is offered in King and Snohomish County. Founded November 2024 by Bryce Bell and Trayton Shelton. Phone (360) 710-0409, email admin@bellnhammer.biz. Rated 5.0 on Google; BBB Accredited.

## Key pages
- [Home](${SITE}/): services overview, free estimates, cost estimator
- [About](${SITE}/about.html): company story, founders, license and service area
- [Reviews](${SITE}/reviews.html): client reviews
- [Portfolio](${SITE}/portfolio.html): real project photos
- [Commercial](${SITE}/commercial.html): tenant improvements in King & Snohomish County
- [Equipment Rentals](${SITE}/rentals.html)
- [Blog](${SITE}/blog.html)

## Services
${servicesList}

## Articles
${posts.map(p => `- [${p.title}](${SITE}${p.url}): ${p.quick_answer || p.description}`).join('\n')}

## Optional
- [Full article text](${SITE}/llms-full.txt)
- [RSS feed](${SITE}/blog/feed.xml)
`);
write('llms-full.txt', `# Bell & Hammer — Full Article Text\n\nSource: ${SITE}/blog.html · Licensed WA general contractor ${LICENSE} · Kitsap County, WA\n\n` +
  posts.map(p => [`---\n\n# ${p.title}`, `URL: ${SITE}${p.url}`, `Updated: ${p.updated}`, p.cat ? `Topic: ${p.cat.name}${p.sub ? ' > ' + p.sub.name : ''}` : '',
    p.quick_answer ? `\n**Quick answer:** ${p.quick_answer}` : '', p.takeaways.length ? '\n**Key takeaways:**\n' + p.takeaways.map(t => '- ' + t).join('\n') : '',
    '\n' + p.markdown.trim(), p.faq.length ? '\n## Frequently Asked Questions\n\n' + p.faq.map(f => `### ${f.question}\n\n${f.answer}`).join('\n\n') : ''].filter(Boolean).join('\n')).join('\n\n') + '\n');

// ── Sitemap: static pages + everything generated here ──
const blogUrls = [
  { loc: '/blog.html', mod: posts[0]?.updated, pr: '0.8' },
  ...posts.map(p => ({ loc: p.url, mod: p.updated, pr: '0.7' })),
  ...cats.flatMap(c => { const n = posts.filter(p => p.cat === c); const out = n.length ? [{ loc: catUrl(c), mod: n[0].updated, pr: '0.5' }] : [];
    return out.concat(c.subs.map(s => ({ s, n: n.filter(p => p.sub === s) })).filter(x => x.n.length).map(x => ({ loc: subUrl(x.s), mod: x.n[0].updated, pr: '0.4' }))); }),
];
const base = read('content/sitemap-pages.xml').replace(/\s*<\/urlset>\s*$/, '');
write('sitemap.xml', base + '\n' + blogUrls.map(u => `  <url><loc>${SITE}${u.loc}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>${u.pr}</priority></url>`).join('\n') + '\n</urlset>\n');

console.log(`Blog built: ${posts.length} posts, ${cats.length} categories, ${cats.reduce((n, c) => n + c.subs.length, 0)} subcategories.`);

// ── Tell Bing/IndexNow (feeds Copilot and ChatGPT search) about the blog on production deploys ──
if (process.env.VERCEL_ENV === 'production') {
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ host: 'www.bellnhammer.com', key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: blogUrls.map(u => SITE + u.loc) }),
    });
    console.log('IndexNow:', res.status);
  } catch (e) { console.log('IndexNow skipped:', e.message); }
}
