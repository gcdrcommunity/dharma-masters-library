let catalog = null;
let footnotes = {};
let currentWorkSlug = null;
let currentChapter = 0;
let currentFootnotes = {};

async function loadJson(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`無法載入 ${path}`);
    return response.json();
}

async function loadText(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`無法載入 ${path}`);
    return response.text();
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function markdownToHtml(md) {
    const blocks = md.replace(/\r\n/g, '\n').split(/\n{2,}/);
    let html = blocks.map(block => {
        const raw = block.trim();
        if (!raw) return '';
        const safe = escapeHtml(raw);

        if (/^###\s+/.test(raw)) return `<h4>${safe.replace(/^###\s+/, '')}</h4>`;
        if (/^##\s+/.test(raw)) return `<h3>${safe.replace(/^##\s+/, '')}</h3>`;
        if (/^#\s+/.test(raw)) return `<h2>${safe.replace(/^#\s+/, '')}</h2>`;
        if (/^&gt;\s+/.test(safe)) return `<blockquote>${safe.replace(/^&gt;\s+/, '').replace(/\n&gt;\s+/g, '<br>')}</blockquote>`;

        return `<p>${safe.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    html = html.replace(/［(\d+)］/g, (match, num) => {
        return `<span class="footnote-btn" onclick="showNote('${num}')">[${num}]</span>`;
    });

    return html;
}

function getWork(slug) {
    return catalog.works[slug];
}

function setHeaderText() {
    document.querySelectorAll('[data-site-title]').forEach(el => el.textContent = catalog.title);
    document.querySelectorAll('[data-site-subtitle]').forEach(el => el.textContent = catalog.subtitle);
    document.querySelectorAll('[data-site-description]').forEach(el => el.textContent = catalog.description);
    document.querySelectorAll('[data-site-footer]').forEach(el => el.textContent = catalog.footer);
}

function renderHome() {
    currentWorkSlug = null;
    currentChapter = 0;

    document.getElementById('homeView').classList.add('active');
    document.getElementById('readerView').classList.remove('active');

    const container = document.getElementById('homeContainer');
    container.innerHTML = '';

    catalog.authors.forEach(author => {
        const section = document.createElement('section');
        section.className = 'author-section';

        const title = document.createElement('div');
        title.className = 'author-title';
        title.textContent = author.name;
        section.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'works-list';

        author.works.forEach(slug => {
            const work = getWork(slug);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'work-card';
            card.innerHTML = `
                <div class="work-title">${work.displayTitle}</div>
                <div class="work-info"><p>${work.translator}｜共 ${work.chapters.length} 章節</p></div>
            `;
            card.onclick = () => openWork(slug, 0, true);
            grid.appendChild(card);
        });

        section.appendChild(grid);
        container.appendChild(section);
    });

    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

async function openWork(slug, chapterIndex = 0, updateHash = false) {
    currentWorkSlug = slug;
    currentChapter = chapterIndex;
    await showReader(updateHash);
}

async function showReader(updateHash = false) {
    const work = getWork(currentWorkSlug);
    document.getElementById('homeView').classList.remove('active');
    document.getElementById('readerView').classList.add('active');
    document.getElementById('readerTitle').textContent = work.displayTitle;

    const list = document.getElementById('chaptersList');
    list.innerHTML = '';

    work.chapters.forEach((chapter, i) => {
        const btn = document.createElement('button');
        btn.className = 'chapter-btn' + (i === currentChapter ? ' active' : '');
        btn.textContent = chapter.title.length > 12 ? chapter.title.substring(0, 12) + '…' : chapter.title;
        btn.title = chapter.title;
        btn.onclick = () => showChapter(i, true);
        list.appendChild(btn);
    });

    renderTOC();
    await showChapter(currentChapter, updateHash);
}

async function showChapter(index, updateHash = false) {
    const work = getWork(currentWorkSlug);
    currentChapter = index;
    const chapter = work.chapters[index];

    document.getElementById('textPanel').innerHTML = '<div class="loading">內容載入中……</div>';

    document.querySelectorAll('.chapter-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    document.querySelectorAll('.toc-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });

    const key = `${work.title}|${chapter.title}`;
    currentFootnotes = footnotes[key] || {};

    try {
        const text = await loadText(chapter.path);
        const titleHtml = `<h2>${escapeHtml(chapter.title)}</h2>`;
        document.getElementById('textPanel').innerHTML = titleHtml + markdownToHtml(text);
        switchTab('text');

        if (updateHash) {
            history.replaceState(null, '', `#/${currentWorkSlug}/${index + 1}`);
        }
    } catch (error) {
        document.getElementById('textPanel').innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    }
}

function renderTOC() {
    const work = getWork(currentWorkSlug);
    const list = document.getElementById('tocList');
    list.innerHTML = '';

    work.chapters.forEach((chapter, i) => {
        const li = document.createElement('li');
        li.className = 'toc-item' + (i === currentChapter ? ' active' : '');
        li.textContent = `${i + 1}. ${chapter.title}`;
        li.onclick = () => showChapter(i, true);
        list.appendChild(li);
    });
}

function switchTab(tab, evt) {
    const textPanel = document.getElementById('textPanel');
    const tocPanel = document.getElementById('tocPanel');

    textPanel.classList.toggle('active', tab === 'text');
    tocPanel.classList.toggle('active', tab === 'toc');

    document.querySelectorAll('.nav-tab').forEach(button => button.classList.remove('active'));

    if (evt) {
        evt.target.classList.add('active');
    } else {
        const selector = tab === 'text' ? '[data-tab="text"]' : '[data-tab="toc"]';
        const button = document.querySelector(selector);
        if (button) button.classList.add('active');
    }
}

function showNote(num) {
    const note = currentFootnotes[num] || '無說明';
    document.getElementById('noteTitle').textContent = '註解 ' + num;
    document.getElementById('noteBody').textContent = note;
    document.getElementById('noteModal').classList.add('active');
}

function closeNote() {
    document.getElementById('noteModal').classList.remove('active');
}

function goHome() {
    renderHome();
}

async function init() {
    try {
        catalog = await loadJson('data/catalog.json');
        footnotes = await loadJson('data/footnotes.json');
        setHeaderText();

        const hashMatch = location.hash.match(/^#\/([^/]+)\/(\d+)$/);
        if (hashMatch && catalog.works[hashMatch[1]]) {
            const work = catalog.works[hashMatch[1]];
            const chapterIndex = Math.max(0, Math.min(work.chapters.length - 1, Number(hashMatch[2]) - 1));
            await openWork(hashMatch[1], chapterIndex, false);
        } else {
            renderHome();
        }
    } catch (error) {
        document.getElementById('homeContainer').innerHTML = `<div class="error">${escapeHtml(error.message)}。請確認 data/catalog.json 與正文檔案已一起上傳。</div>`;
    }
}

window.onclick = event => {
    const modal = document.getElementById('noteModal');
    if (event.target === modal) closeNote();
};

window.addEventListener('hashchange', init);
document.addEventListener('DOMContentLoaded', init);
