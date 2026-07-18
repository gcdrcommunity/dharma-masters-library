let catalog = null;
let footnotes = {};
let kepan = {};
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
    // 逐行解析：標題(#~######)一律獨立成行、不會吸走下一行內文；
    // 連續的一般行併為同一段(以 <br> 分行)，連續的 > 行併為同一 blockquote，空行分隔區塊。
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let para = [];
    let quote = [];

    const flushPara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
    const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${quote.join('<br>')}</blockquote>`); quote = []; } };
    const flushAll = () => { flushQuote(); flushPara(); };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) { flushAll(); continue; }

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            flushAll();
            const level = Math.min(heading[1].length + 1, 6); // # → h2, ## → h3, ### → h4, #### → h5 …
            out.push(`<h${level}>${escapeHtml(heading[2].trim())}</h${level}>`);
            continue;
        }

        const bq = line.match(/^>\s?(.*)$/);
        if (bq) {
            flushPara();
            quote.push(escapeHtml(bq[1]));
            continue;
        }

        flushQuote();
        para.push(escapeHtml(line));
    }
    flushAll();

    let html = out.join('');
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

// 在正文面板中尋找與科判節點對應的標題元素（依「標號＋標題前幾字」比對，避免同章重複標號誤配）
function findHeadingEl(panel, label, title) {
    if (!label) return null;
    const strip = s => (s || '').replace(/[\s、，。：；（）()〔〕【】《》「」——\-…·～]/g, '');
    const L = strip(label);
    const T = strip(title).replace(/[〔（(].*$/, '').replace(/第[一二三四五六七八九十百]+章.*$/, '');
    const heads = [...panel.querySelectorAll('h2, h3, h4, h5, h6')];
    return heads.find(h => {
        const x = strip(h.textContent);
        if (!x.startsWith(L)) return false;
        if (!T) return true;
        const rest = x.slice(L.length);
        const n = Math.min(rest.length, T.length, 3);
        return n > 0 && rest.slice(0, n) === T.slice(0, n);
    }) || null;
}

async function showChapter(index, updateHash = false, scrollTarget = null) {
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
        const panel = document.getElementById('textPanel');
        panel.innerHTML = titleHtml + markdownToHtml(text);
        switchTab('text');

        if (scrollTarget) {
            // 找到章內對應標題就捲到該段；否則（該節點＝整章，章內無此標號標題）捲到章名，而非整頁最頂
            const el = findHeadingEl(panel, scrollTarget.label, scrollTarget.title) || panel.querySelector('h2') || panel;
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

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
    list.className = 'toc-list';
    list.innerHTML = '';

    const kp = kepan[currentWorkSlug];
    if (kp && kp.nodes) {
        renderKepanTree(kp, list);
        return;
    }

    // 後備：無科判資料時，仍顯示平面章節清單
    work.chapters.forEach((chapter, i) => {
        const li = document.createElement('li');
        li.className = 'toc-item' + (i === currentChapter ? ' active' : '');
        li.textContent = `${i + 1}. ${chapter.title}`;
        li.onclick = () => showChapter(i, true);
        list.appendChild(li);
    });
}

function renderKepanTree(kp, container) {
    container.className = 'kepan-root';
    let html = '';
    if (kp.title) html += `<div class="kepan-title">${escapeHtml(kp.title)}</div>`;
    if (kp.intro) html += `<div class="kepan-intro">${escapeHtml(kp.intro)}</div>`;
    if (kp.pdf || kp.printPage) {
        html += '<div class="kepan-downloads">';
        if (kp.pdf) html += `<a class="kepan-dl" href="${encodeURI(kp.pdf)}" download="解脫莊嚴寶論-科判總覽.pdf">⬇ 下載完整科判總覽（PDF）</a>`;
        if (kp.printPage) html += `<a class="kepan-dl kepan-dl-alt" href="${encodeURI(kp.printPage)}" target="_blank" rel="noopener">🖨 可列印版</a>`;
        html += '</div>';
    }
    html += kepanNodesHtml(kp.nodes, 0);
    container.innerHTML = html;

    // 三角形按鈕：展開／收合子節點
    container.querySelectorAll('.kepan-toggle').forEach(btn => {
        btn.addEventListener('click', event => {
            event.stopPropagation();
            const branch = btn.closest('.kepan-branch');
            if (branch) branch.classList.toggle('collapsed');
        });
    });

    // 結構性群組標頭（無章節）點整列亦可展開收合
    container.querySelectorAll('.kepan-item.kepan-group').forEach(el => {
        if (el.tagName === 'DIV') {
            el.addEventListener('click', () => {
                const toggle = el.parentElement.querySelector('.kepan-toggle');
                if (toggle) toggle.click();
            });
        }
    });

    // 章節節點：點擊跳去閱讀，並捲動到章內對應標題（無對應標題則到章首）
    container.querySelectorAll('[data-ch]').forEach(el => {
        el.addEventListener('click', () => {
            const idx = Number(el.getAttribute('data-ch')) - 1;
            const target = {
                label: el.getAttribute('data-kplabel') || '',
                title: el.getAttribute('data-kptitle') || ''
            };
            switchTab('text');
            showChapter(idx, true, target);
        });
    });
}

function kepanNodesHtml(nodes, depth) {
    let html = '<div class="kepan-level">';
    nodes.forEach(node => {
        const hasCh = node.ch != null;
        const isActive = hasCh && (node.ch - 1) === currentChapter;
        const label = node.label ? `<span class="kepan-label">${escapeHtml(node.label)}</span>` : '';
        const text = `<span class="kepan-text">${escapeHtml(node.title)}</span>`;
        const badge = hasCh ? `<span class="kepan-ch">第${node.ch}章</span>` : '';
        const dataAttrs = hasCh ? `data-ch="${node.ch}" data-kplabel="${escapeHtml(node.label || '')}" data-kptitle="${escapeHtml(node.title || '')}"` : '';

        if (node.children) {
            const collapsed = depth >= 1; // 預設展開到「乙」層，其餘收合，可逐層點開
            html += `<div class="kepan-node kepan-branch${collapsed ? ' collapsed' : ''}">`;
            html += '<div class="kepan-row">';
            html += '<button type="button" class="kepan-toggle" title="展開／收合" aria-label="展開或收合">▾</button>';
            if (hasCh) {
                html += `<button type="button" class="kepan-item kepan-head${isActive ? ' active' : ''}" ${dataAttrs}>${label}${text}${badge}</button>`;
            } else {
                html += `<div class="kepan-item kepan-head kepan-group">${label}${text}</div>`;
            }
            html += '</div>';
            html += `<div class="kepan-children">${kepanNodesHtml(node.children, depth + 1)}</div>`;
            html += '</div>';
        } else {
            html += '<div class="kepan-row kepan-row-leaf">';
            if (hasCh) {
                html += `<button type="button" class="kepan-item kepan-leaf${isActive ? ' active' : ''}" ${dataAttrs}>${label}${text}${badge}</button>`;
            } else {
                html += `<div class="kepan-item kepan-leaf kepan-group">${label}${text}</div>`;
            }
            html += '</div>';
        }
    });
    html += '</div>';
    return html;
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
        kepan = await loadJson('data/kepan.json').catch(() => ({}));
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

// 返回頂部功能
const backToTopBtn = document.getElementById('backToTop');

window.addEventListener('scroll', () => {
  if (window.scrollY > 300) {
    backToTopBtn.classList.add('show');
  } else {
    backToTopBtn.classList.remove('show');
  }
});

backToTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
