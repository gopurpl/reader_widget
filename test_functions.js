
(function () {
    if (window.ReaderWidget) return; // guard

    /* ===== Allowlist + Placeholder ===== */
    const RW_ALLOW = [
        // EXEMPEL – byt mot dina kunder/partners:
        "example.com",
        "*.example.se",
        "kund1.se",
        "www.kund2.se"
    ];
    const RW_DEV = ["localhost", "127.0.0.1", "[::1]"];

    function rwAllowedDomain(hostname) {
        const h = (hostname || location.hostname || "").toLowerCase();
        const match = (rule) => {
            const r = rule.toLowerCase().trim();
            if (r.startsWith("*.")) {
                const base = r.slice(2);
                return h === base || h.endsWith("." + base);
            }
            return h === r || h.endsWith("." + r);
        };
        return RW_DEV.includes(h) || RW_ALLOW.some(match);
    }

    /** Visas om domänen inte är tillåten (liten, diskret panel nere till höger) */
    function rwShowPlaceholder(reason) {
        // inget UI om du vill vara helt tyst: bara return;
        const box = document.createElement("div");
        box.style.cssText = [
            "position:fixed; right:12px; bottom:12px; z-index:2147483647;",
            "background:#fff; color:#111; font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;",
            "border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,.25);",
            "padding:10px 12px; max-width:280px"
        ].join("");
        box.innerHTML =
            "<strong>Läsverktyg</strong><br>" +
            "Denna domän är inte aktiverad för widgeten.<br>" +
            (reason ? "<small style='opacity:.7'>" + reason + "</small>" : "") +
            "<div style='margin-top:8px'><a href='mailto:support@din-domän.se' style='color:#1b73e8;text-decoration:underline'>Kontakta support</a></div>";
        document.body.appendChild(box);
    }

    /* Stoppa init om inte tillåten domän */
    if (!rwAllowedDomain(location.hostname)) {
        // Visa placeholder och avbryt all vidare init
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => rwShowPlaceholder("Domain not on allowlist"));
        } else {
            rwShowPlaceholder("Domain not on allowlist");
        }
        return; // ← kritiskt: ingen widget laddas
    }


    /* ==========================
       Konstant(er)
    ========================== */
    const NS = 'rw';
    const PREF_KEY = 'rw_prefs_v2';
    const BLOCK_PAUSE_MS = 1500;
    const HOVER_DWELL_MS = 1500;
    const SENTENCE_PAUSE_MS = 400;

    // NEW: Touch/coarse-pointer detection
    const IS_TOUCH = (typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches) || ('ontouchstart' in window);
    const mqSmall = window.matchMedia('(max-width: 768px)');
    const isSmallScreen = () => mqSmall.matches;

    /* ==========================
       Utils
    ========================== */
    const $ = (sel, root = document) => root.querySelector(sel);
    function h(tag, attrs, ...children) {
        const el = document.createElement(tag);
        if (attrs) for (const [k, v] of Object.entries(attrs)) {
            if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
            else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : String(v));
        }
        for (const c of children.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
        return el;
    }
    const savePrefs = (p) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { } };
    const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } };

    /* ==========================
       Helpers
    ========================== */

    function hasText(el) {
        return !!(el && (el.innerText || '').replace(/\s+/g, '').length);
    }

    function isIconish(el) {
        for (let a = el; a; a = a.parentElement) {
            if (a.getAttribute && a.getAttribute('aria-hidden') === 'true') return true;
            if (a.classList && (
                a.classList.contains('rw-ico') ||
                a.classList.contains('rw-mi') ||
                a.classList.contains('material-symbols-outlined') ||
                a.classList.contains('material-symbols-rounded') ||
                a.classList.contains('material-symbols-sharp')
            )) return true;
        }
        return false;
    }

    function applySpotlightInline() {
        if (!spotlight) return;
        // Låt CSS styra bakgrunden helt via var(--y) / var(--rw-spotlight-*)
        spotlight.style.pointerEvents = 'none';
    }


    /** Hitta närmsta "blockiga" text-element du faktiskt hovrar i widgeten */
    function findHoverRoot(el) {
        const BLOCK_SEL = 'p,li,button,label,a,summary,dt,dd,th,td,h1,h2,h3,h4,h5,h6';
        let cur = el;
        while (cur && cur !== document.body) {
            if (cur.matches && cur.matches(BLOCK_SEL) && hasText(cur)) return cur;
            // stanna uppåtstigningen vid panelens text-containers
            if (cur.classList && (cur.classList.contains('rw-body') || cur.classList.contains('rw-settings'))) break;
            cur = cur.parentElement;
        }
        return hasText(el) ? el : null;
    }

    function anyToolActive() {
        return !!document.querySelector('.rw-tools .rw-tool[aria-pressed="true"]');
    }
    function shouldStayExpanded(opts = {}) {
        const ignoreActive = !!opts.ignoreActive;
        return panel.matches(':hover') ||
            panel.contains(document.activeElement) ||
            settingsEl.classList.contains('active') ||
            (!ignoreActive && anyToolActive());
    }
    function updateMiniState(opts = {}) {
        if (!panel) return;
        // NEW: On touch, be a little more aggressive about mini unless we clearly have focus/settings open
        if (IS_TOUCH) {
            const keep =
                panel.contains(document.activeElement) ||
                settingsEl.classList.contains('active') ||
                (!opts.ignoreActive && anyToolActive());
            if (keep) panel.classList.remove('rw-mini'); else panel.classList.add('rw-mini');
            return;
        }
        if (shouldStayExpanded(opts)) panel.classList.remove('rw-mini');
        else panel.classList.add('rw-mini');
    }

    function preserveSelectionMouseDown(e) {
        if (e instanceof MouseEvent) e.preventDefault(); // hindra fokusbyte → markering ligger kvar
    }


    /* ==========================
       Google Fonts + Google Icons
    ========================== */
    const ICONS = {
        header: 'text_to_speech',
        read: 'auto_read_play',
        contrast: 'contrast',
        spotlight: 'center_focus_weak',
        dys: 'text_fields',
        hover: 'highlight_mouse_cursor',
        subs: 'closed_caption'
    };
    const MATERIAL_STYLE_CLASS = 'material-symbols-outlined'; // alt: '-rounded' | '-sharp'

    function injectGoogleAssets() {
        const pre1 = document.createElement('link'); pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
        const pre2 = document.createElement('link'); pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous';

        const inter = document.createElement('link');
        inter.rel = 'stylesheet';
        inter.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap';

        const FAMILY = {
            'material-symbols-outlined': 'Material+Symbols+Outlined',
            'material-symbols-rounded': 'Material+Symbols+Rounded',
            'material-symbols-sharp': 'Material+Symbols+Sharp'
        }[MATERIAL_STYLE_CLASS] || 'Material+Symbols+Outlined';

        const icons = document.createElement('link');
        icons.rel = 'stylesheet';
        icons.href = `https://fonts.googleapis.com/css2?family=${FAMILY}:opsz,wght,FILL,GRAD@24,500,0,0`;

        document.head.append(pre1, pre2, inter, icons);
    }
    function iconEl(name) {
        const wrap = document.createElement('span');
        wrap.className = 'rw-ico';
        wrap.setAttribute('aria-hidden', 'true');     // göm ikonen för läsaren

        const i = document.createElement('span');
        i.className = MATERIAL_STYLE_CLASS + ' rw-mi';
        i.setAttribute('aria-hidden', 'true');
        i.textContent = ICONS[name] || 'help';
        wrap.appendChild(i);
        return wrap;
    }

    /* ==========================
       State
    ========================== */
    const prefs = Object.assign({
        rate: 1.0, voiceName: '', zoom: 1,
        contrast: false, dyslexia: false,
        subs: false,
        theme: { bg: '#ffffff', fg: '#111111', accent: '#1b73e8', underline: true },
        ribbon: { opacity: 1.0, fg: '#ffffff', bg: '#0b0b0b', font: 36 },
        mask: { opacity: 0.55, height: 120 },
        dys: { scale: 1, line: 1.6, letter: 0.02, word: 0.08 },
        hoverRate: 1.0
    }, loadPrefs());

    let reading = false, spotlightOn = false, hoverOn = false;
    let voices = [];
    let panel, spotlight, ribbonEl, settingsEl, toolsHost;

    // Auto-minimize efter tangentbordsaktivering
    const AUTO_MIN_MS = 5000;
    let lastActivationByKeyboard = false;
    let inactivityTimer = null;

    let selWrapEl = null;        // aktuell wrapper runt markerad text
    let lastRange = null;        // senaste icke-tomma markeringen (klonad)

    function scheduleAutoMinimize() {
        if (!panel) return;
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            const hasFocus = panel.contains(document.activeElement);
            const hovering = panel.matches(':hover');
            const settingsOpen = settingsEl && settingsEl.classList.contains('active');
            if (!lastActivationByKeyboard) return; // bara efter kb-aktivering
            if (hasFocus || hovering || settingsOpen) return;
            panel.classList.add('rw-mini');
            lastActivationByKeyboard = false;
        }, AUTO_MIN_MS);
    }

    function markWidgetActivity() {
        if (!lastActivationByKeyboard) return;
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            const hasFocus = panel.contains(document.activeElement);
            const hovering = panel.matches(':hover');
            const settingsOpen = settingsEl && settingsEl.classList.contains('active');
            if (!lastActivationByKeyboard) return;
            if (hasFocus || hovering || settingsOpen) return;
            panel.classList.add('rw-mini');
            lastActivationByKeyboard = false;
        }, AUTO_MIN_MS);
    }

    function markKeyboardActivation(e) {
        const kb = !(e instanceof MouseEvent) || e.detail === 0;
        lastActivationByKeyboard = !!kb;
        if (lastActivationByKeyboard) {
            panel.classList.remove('rw-mini');
            scheduleAutoMinimize();
        }
    }

    // Hover-state
    let hoverTimer = null, hoverSession = 0, hoverLastEl = null;

    // Spotlight
    let lastMouseY = 0;

    // Assistive stack
    const aids = []; // senast aktiverad sist
    function pushAid(t) { const i = aids.indexOf(t); if (i !== -1) aids.splice(i, 1); aids.push(t); }
    function removeAid(t) { const i = aids.indexOf(t); if (i !== -1) aids.splice(i, 1); }

    /* ==========================
       DOM Highlighter (mening + ord)
    ========================== */
    let hi = null;

    function isInsideWidget(el) {
        while (el && el !== document.body) {
            if (el.classList && [...el.classList].some(c => c.startsWith(NS + '-'))) return true;
            el = el.parentElement;
        }
        return false;
    }

    function buildHighlighter(rootEl, opts = {}) {
        const includeWidget = !!opts.includeWidget;

        cleanupInjectedWrappers(rootEl);

        const tokens = [];
        const sentences = [];

        // Vilka element räknas som block-gränser?
        const BLOCK_TAGS = new Set([
            'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
            'P', 'LI', 'UL', 'OL', 'DL', 'DT', 'DD',
            'BLOCKQUOTE', 'PRE', 'FIGCAPTION',
            'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH',
            'MAIN', 'ARTICLE', 'SECTION', 'ASIDE', 'HEADER', 'FOOTER', 'NAV', 'ADDRESS',
            'FIELDSET', 'LEGEND', 'FORM', 'SUMMARY', 'DETAILS',
            // även "kontroller" vill vi separera tydligt:
            'BUTTON', 'LABEL', 'INPUT', 'SELECT', 'TEXTAREA',
            'BR', 'HR'
        ]);

        const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'AUDIO', 'VIDEO', 'CANVAS']);

        function closestBlockAncestor(el, includeWidgetFlag) {
            while (el && el !== document.body) {
                if (!includeWidgetFlag && el.classList && [...el.classList].some(c => c.startsWith(NS + '-'))) return null;

                if (BLOCK_TAGS.has(el.tagName)) return el;

                if (includeWidgetFlag && el.classList && (el.classList.contains('rw-body') || el.classList.contains('rw-settings'))) {
                    return el;
                }
                el = el.parentElement;
            }
            return document.body;
        }

        // 1) Samla textnoder först (manipulera inte DOM under traverseringen)
        const all = [];
        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
                // 1) Hoppa över SCRIPT/STYLE m.fl.
                const p = n.parentElement;
                if (p && SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;

                // 2) Hoppa över aria-hidden och ikon-wrappers
                for (let a = n.parentElement; a; a = a.parentElement) {
                    if (a.getAttribute && a.getAttribute('aria-hidden') === 'true') return NodeFilter.FILTER_REJECT;
                    if (a.classList && (
                        a.classList.contains('rw-ico') ||
                        a.classList.contains('material-symbols-outlined') ||
                        a.classList.contains('material-symbols-rounded') ||
                        a.classList.contains('material-symbols-sharp')
                    )) return NodeFilter.FILTER_REJECT;
                }

                // 3) Widget-policy (oförändrad)
                let el = n.parentElement;
                let insideWidget = false, insideReadableWidget = false;
                while (el && el !== document.body) {
                    if (el.classList) {
                        const cl = el.classList;
                        if ([...cl].some(c => c.startsWith(NS + '-'))) insideWidget = true;
                        if (cl.contains('rw-body') || cl.contains('rw-settings')) insideReadableWidget = true;
                    }
                    el = el.parentElement;
                }
                if (!includeWidget && insideWidget) return NodeFilter.FILTER_REJECT;
                if (includeWidget && insideWidget && !insideReadableWidget) return NodeFilter.FILTER_REJECT;

                // VIKTIGT: acceptera även whitespace-only noder → mellanslag bevaras alltid
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let tn;
        while ((tn = walker.nextNode())) {
            all.push({ node: tn, block: closestBlockAncestor(tn.parentElement, includeWidget) });
        }

        // 2) Tokenisera & ersätt varje textnod
        const re = /([.!?…]+|\s+|[^\s.!?…]+)/g;
        for (let i = 0; i < all.length; i++) {
            const { node, block } = all[i];
            const txt = node.nodeValue || '';
            const parts = txt.match(re);
            if (!parts) continue;

            const frag = document.createDocumentFragment();
            for (const part of parts) {
                if (/^\s+$/.test(part)) {
                    frag.appendChild(document.createTextNode(part));
                    tokens.push({ text: part, kind: 'space' });

                } else if (/^[.!?…]+$/.test(part)) {
                    // skiljetecken
                    const s = document.createElement('span');
                    s.className = 'rw-punct';
                    s.textContent = part;
                    tokens.push({ text: part, kind: 'punct', span: s });
                    frag.appendChild(s);

                } else {
                    // ord
                    const s = document.createElement('span');
                    s.className = 'rw-word';
                    s.textContent = part;
                    tokens.push({ text: part, kind: 'word', span: s });
                    frag.appendChild(s);
                }
            }
            node.parentNode.replaceChild(frag, node);

            // 2b) Om nästa textnod tillhör ett ANNAT block → injicera syntetisk newline (block-bryt)
            const next = all[i + 1];
            const thisBlock = block;
            const nextBlock = next ? next.block : null;
            if (thisBlock && thisBlock !== nextBlock) {
                tokens.push({ text: '\n', kind: 'space', span: null, _forcedBlock: true });
            }
        }

        // 3) Bygg meningar; markera block-brytning (newline eller syntetisk)
        (function () {
            let start = 0, i = 0;
            const flush = (endIdx, isBlock) => {
                const text = tokens.slice(start, endIdx + 1).map(t => t.text).join('');
                if (text.trim()) sentences.push({ start, end: endIdx, text, block: !!isBlock });
            };
            while (i < tokens.length) {
                const t = tokens[i];
                const isEndPunct = t.kind === 'punct' && /[.!?…]/.test(t.text);
                const isNewlineBreak = t.kind === 'space' && (/\n/.test(t.text) || t._forcedBlock === true);
                if (isEndPunct || isNewlineBreak) {
                    flush(i, isNewlineBreak);
                    i++;
                    while (i < tokens.length && tokens[i].kind === 'space') i++;
                    start = i;
                    continue;
                }
                i++;
            }
            if (start < tokens.length) flush(tokens.length - 1, true); // sista biten → behandla som block
        })();

        function clearAll() { for (const t of tokens) if (t.span) t.span.classList.remove('rw-sent-active', 'rw-word-active'); }

        return { root: rootEl, tokens, sentences, clearAll };
    }

    function highlightSentence(model, si) {
        if (!model || !model.sentences[si]) return;
        for (const t of model.tokens) if (t.span) t.span.classList.remove('rw-sent-active');
        const { start, end } = model.sentences[si];
        for (let i = start; i <= end; i++) { const t = model.tokens[i]; if (t && t.span) t.span.classList.add('rw-sent-active'); }
    }

    function highlightWord(model, si, charIndex) {
        if (!model || !model.sentences[si]) return;
        const sent = model.sentences[si];
        let acc = 0;
        for (let i = sent.start; i <= sent.end; i++) {
            const t = model.tokens[i]; const len = (t.text || '').length;
            if (charIndex < acc + len) {
                let j = i; while (j <= sent.end && model.tokens[j].kind !== 'word') j++;
                for (const tok of model.tokens) if (tok.span) tok.span.classList.remove('rw-word-active');
                if (j <= sent.end) { const w = model.tokens[j]; if (w.span) w.span.classList.add('rw-word-active'); }
                return;
            }
            acc += len;
        }
    }

    function clearSentenceHighlight(model, si) {
        if (!model || !model.sentences[si]) return;
        const { start, end } = model.sentences[si];
        for (let i = start; i <= end; i++) { const t = model.tokens[i]; if (t && t.span) t.span.classList.remove('rw-sent-active', 'rw-word-active'); }
    }

    function caretAtPoint(x, y) {
        if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) return { node: r.startContainer, offset: r.startOffset }; }
        if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) return { node: p.offsetNode, offset: p.offset }; }
        return null;
    }
    function sentenceAround(text, offset) {
        if (!text) return '';
        const endMarks = /[.!?…]/;
        let i = offset, j = offset;
        while (i > 0 && !endMarks.test(text[i - 1])) i--;
        while (j < text.length && !endMarks.test(text[j])) j++;
        if (j < text.length && endMarks.test(text[j])) j++;
        return text.slice(Math.max(0, i - 2), Math.min(text.length, j + 2)).trim();
    }
    function findReadableAncestor(el, maxHops = 10) {
        const MIN = 1, GOOD = 60;
        let best = null, hops = 0;
        while (el && el !== document.body && hops < maxHops) {
            if (!isInsideWidget(el)) {
                const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
                if (txt.length >= GOOD) return el;
                if (!best && txt.length >= MIN) best = el;
                if ((el.matches && el.matches('main,article,[role="main"],section')) && txt.length) return el;
            }
            el = el.parentElement; hops++;
        }
        return best;
    }
    function unwrap(el) {
        if (!el || !el.parentNode) return;
        const p = el.parentNode;
        while (el.firstChild) p.insertBefore(el.firstChild, el);
        p.removeChild(el);
    }

    function cleanupInjectedWrappers(rootEl) {
        if (!rootEl) return;
        const injected = rootEl.querySelectorAll('span.rw-word, span.rw-punct');
        injected.forEach(sp => unwrap(sp));
    }

    /* ==========================
       Tema / CSS-variabler
    ========================== */
    function setVar(name, val) { document.documentElement.style.setProperty(name, String(val)); }
    function applyTheme() {
        const t = prefs.theme, r = prefs.ribbon, m = prefs.mask, d = prefs.dys;

        const widgetBg = prefs.contrast ? '#151515' : t.bg;
        const widgetFg = prefs.contrast ? '#f2f2f2' : t.fg;

        function luminance(hex) {
            const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
            if (!m) return 0;
            const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16) / 255);
            const toLin = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
            const [R, G, B] = [toLin(r), toLin(g), toLin(b)];
            return 0.2126 * R + 0.7152 * G + 0.0722 * B;
        }
        const bg = r.bg === 'transparent' ? '#000000' : r.bg;
        const fg = r.fg;

        const bgIsDark = luminance(bg) < 0.25;

        let hiBg, hiFg;
        if (bgIsDark) {
            hiBg = '#FFD60A';
            hiFg = '#111111';
        } else {
            hiBg = '#111111';
            hiFg = '#ffffff';
        }
        if (fg.toLowerCase() === '#ffd60a') { hiFg = '#111111'; }
        if (fg.toLowerCase() === '#06a9bbff') { hiFg = '#111111'; }

        setVar('--rw-ribbon-hi-bg', hiBg);
        setVar('--rw-ribbon-hi-fg', hiFg);

        setVar('--rw-bg', widgetBg);
        setVar('--rw-fg', widgetFg);
        setVar('--rw-accent', t.accent);
        setVar('--rw-link-underline', t.underline ? 'underline' : 'none');

        setVar('--rw-ribbon-bg', r.bg);
        setVar('--rw-ribbon-fg', r.fg);
        setVar('--rw-ribbon-opacity', r.opacity);
        setVar('--rw-ribbon-font-size', r.font + 'px');

        setVar('--rw-spotlight-opacity', m.opacity);
        setVar('--rw-spotlight-height', m.height + 'px');

        setVar('--rw-dys-scale', d.scale);
        setVar('--rw-line-height', d.line);
        setVar('--rw-letter-spacing', d.letter + 'em');
        setVar('--rw-word-spacing', d.word + 'em');

        if (panel) {
            panel.style.backgroundColor = widgetBg;
            panel.style.color = widgetFg;
            panel.style.opacity = prefs.contrast ? '0.96' : '1';
        }
        if (spotlight) {
            spotlight.style.setProperty('--rw-spotlight-opacity', String(m.opacity));
            spotlight.style.setProperty('--rw-spotlight-height', m.height + 'px');
            applySpotlightInline();
        }
        if (ribbonEl) {
            ribbonEl.style.opacity = String(r.opacity);
            ribbonEl.style.background = r.bg === 'transparent' ? 'transparent' : r.bg;
            ribbonEl.style.color = r.fg;
        }
    }

    /* ==========================
       TTS / Uppläsning
    ========================== */
    function refreshVoices() {
        const all = window.speechSynthesis.getVoices();
        const sv = all.filter(v => v.lang && v.lang.startsWith('sv'));
        const en = all.filter(v => v.lang && v.lang.startsWith('en'));
        voices = [...sv, ...en];
    }

    function splitSentences(str) {
        const s = (str || '').replace(/\r\n/g, '\n');
        let parts = s.match(/[^.!?…\n]+[.!?…]?/g) || [];
        if (parts.length <= 1) {
            const byLines = s.split(/\n{1,}/).map(x => x.trim()).filter(Boolean);
            if (byLines.length > parts.length) parts = byLines;
        }
        return parts.map(x => x.trim()).filter(Boolean);
    }

    function escHtml(s) { return s.replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m])); }

    function showSubs() {
        if (!ribbonEl) {
            ribbonEl = h('div', { class: `${NS}-ribbon` }, h('p', null, ''));
            document.body.appendChild(ribbonEl);

            const p = ribbonEl.querySelector('p');
            if (p) p.style.whiteSpace = 'pre-wrap';
        }
    }
    function hideSubs() { if (ribbonEl) { ribbonEl.remove(); ribbonEl = null; } }

    function renderRibbonSentence(sentence, charIndex, nextSentence) {
        if (!ribbonEl) return;

        ribbonEl.innerHTML = '';
        const p = document.createElement('p');
        p.style.whiteSpace = 'pre-wrap';
        ribbonEl.appendChild(p);

        const parts = (sentence || '').match(/(\s+|\S+)/g) || [];

        let activeStart = -1, activeEnd = -1;
        if (typeof charIndex === 'number') {
            const t = sentence || '';
            let i = charIndex, j = charIndex;
            while (i > 0 && /\S/.test(t[i - 1])) i--;
            while (j < t.length && /\S/.test(t[j])) j++;
            activeStart = i; activeEnd = j;
        }

        let cursor = 0;
        for (const part of parts) {
            const isSpace = /^\s+$/.test(part);
            const start = cursor;
            const end = cursor + part.length;

            if (isSpace) {
                p.appendChild(document.createTextNode(part));
            } else {
                const isActive = (activeStart >= 0 && start === activeStart && end === activeEnd);
                if (isActive) {
                    const w = document.createElement('span');
                    w.className = 'rw-word-active';
                    w.textContent = part;
                    p.appendChild(w);
                } else {
                    p.appendChild(document.createTextNode(part));
                }
            }
            cursor = end;
        }

        if (nextSentence) {
            const nxt = document.createElement('span');
            nxt.className = 'rw-next';
            nxt.textContent = nextSentence;
            ribbonEl.appendChild(nxt);
        }
    }

    function updatePlayButton() {
        const btn = document.getElementById(`${NS}-tool-read`);
        if (!btn) return;
        const isOn = !!reading;
        const mi = btn.querySelector('.rw-ico .rw-mi');
        const lbl = btn.querySelector('.rw-label');
        btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        btn.setAttribute('aria-label', isOn ? 'Pausa uppläsning' : 'Starta uppläsning');
        btn.title = isOn ? 'Pausa uppläsning (Alt+L)' : 'Starta uppläsning (Alt+L)';
        if (mi) mi.textContent = isOn ? 'auto_read_pause' : (ICONS.read || 'auto_read_play');
        if (lbl) lbl.textContent = isOn ? 'PAUS' : 'LÄS';
    }

    function stopReading() {
        if (reading) {
            window.speechSynthesis.cancel();
            reading = false;
            updatePlayButton();
        }
        if (hi) { hi.clearAll(); hi = null; }
        if (prefs.subs) hideSubs();
        if (selWrapEl && selWrapEl.parentNode) { unwrap(selWrapEl); selWrapEl = null; }
        removeAid('reading');
        if (settingsEl) settingsEl.classList.remove('active');
    }

    function computeWordStarts(text) {
        const starts = [];
        const re = /\S+/g; let m;
        while ((m = re.exec(text))) starts.push(m.index);
        return starts;
    }

    /** Välj bästa word-start givet boundary-event eller fallback-pekare */
    function pickWordStart(boundaries, ev, fallbackPtr) {
        if (ev && typeof ev.charIndex === 'number') {
            let k = 0;
            while (k + 1 < boundaries.length && boundaries[k + 1] <= ev.charIndex) k++;
            return { idx: k, start: boundaries[k] };
        }
        const k = Math.min(fallbackPtr, boundaries.length - 1);
        return { idx: k, start: boundaries[k] };
    }

    function speakFromText(text) {
        if (!('speechSynthesis' in window)) { alert('Uppläsning stöds inte i denna webbläsare.'); return; }
        const sentences = splitSentences(text || '');
        if (!sentences.length) return;

        reading = true; updatePlayButton(); pushAid('reading');
        let si = 0;
        const autoVoice = voices.find(v => v.name === prefs.voiceName) || voices[0];

        function finish() {
            reading = false; updatePlayButton(); removeAid('reading');
            if (prefs.subs) hideSubs();
        }

        function playNext() {
            if (!reading) { window.speechSynthesis.cancel(); return; }
            if (si >= sentences.length) { finish(); return; }

            const cur = sentences[si];
            const next = sentences[si + 1] || '';

            let wordStarts = computeWordStarts(cur);
            let ptr = 0;

            if (prefs.subs) { showSubs(); renderRibbonSentence(cur, undefined, next); }

            const u = new SpeechSynthesisUtterance(cur.trim().length === 1 ? cur.toLowerCase() + '.' : cur);
            u.rate = prefs.rate; if (autoVoice) u.voice = autoVoice;

            u.onstart = () => {
                if (prefs.subs && wordStarts.length) renderRibbonSentence(cur, wordStarts[0], next);
                ptr = 0;
            };

            u.onboundary = (ev) => {
                if (prefs.subs && wordStarts.length) {
                    const usePtr = (ev && ev.name === 'word') ? (ptr + 1) : ptr;
                    const pick = pickWordStart(wordStarts, ev, usePtr);
                    ptr = pick.idx;
                    renderRibbonSentence(cur, pick.start, next);
                }
            };

            u.onerror = finish;
            u.onend = () => {
                const pause = SENTENCE_PAUSE_MS;
                si++;
                if (!reading) { window.speechSynthesis.cancel(); return; }
                if (pause > 0) setTimeout(playNext, pause); else playNext();
            };

            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
        }
        playNext();
    }



    function speakFromElement(rootEl, startSentenceText, opts = {}) {
        if (!('speechSynthesis' in window)) { alert('Uppläsning stöds inte i denna webbläsare.'); return; }
        const fallback = document.querySelector('main,article,[role="main"]');
        const el = rootEl || (fallback || document.body);

        hi = buildHighlighter(el, { includeWidget: !!opts.includeWidget });

        const seqFromHi = (hi && hi.sentences && hi.sentences.length) ? hi.sentences : [];
        const seq = seqFromHi.length ? seqFromHi
            : (opts.strictRoot ? [] : splitSentences(el.innerText || '').map(t => ({ text: t, block: false })));

        if (!seq.length) return;

        reading = true; updatePlayButton(); pushAid('reading');
        let si = 0;
        if (startSentenceText) {
            const idx = seq.findIndex(s => (s.text || '').includes(startSentenceText));
            if (idx >= 0) si = idx;
        }
        const autoVoice = voices.find(v => v.name === prefs.voiceName) || voices[0];

        function finish() {
            reading = false; updatePlayButton(); removeAid('reading');
            if (hi) { hi.clearAll(); hi = null; }
            if (selWrapEl && selWrapEl.parentNode) { unwrap(selWrapEl); selWrapEl = null; }
            if (prefs.subs) hideSubs();
        }

        function playNext() {
            if (!reading) { window.speechSynthesis.cancel(); return; }
            if (si >= seq.length) { finish(); return; }

            const cur = seq[si];
            const text = cur.text;
            const next = (seq[si + 1] && seq[si + 1].text) || '';

            let wordStarts = computeWordStarts(text);
            let ptr = 0;

            if (prefs.subs) { showSubs(); renderRibbonSentence(text, undefined, next); }

            const u = new SpeechSynthesisUtterance(text.trim().length === 1 ? text.toLowerCase() + '.' : text);
            u.rate = prefs.rate; if (autoVoice) u.voice = autoVoice;

            u.onstart = () => {
                if (hi) highlightSentence(hi, si);
                if (prefs.subs && wordStarts.length) renderRibbonSentence(text, wordStarts[0], next);
                ptr = 0;
            };

            u.onboundary = (ev) => {
                if (prefs.subs && wordStarts.length) {
                    const usePtr = (ev && ev.name === 'word') ? (ptr + 1) : ptr;
                    const pick = pickWordStart(wordStarts, ev, usePtr);
                    ptr = pick.idx;
                    renderRibbonSentence(text, pick.start, next);
                }
                if (hi && (typeof ev.charIndex === 'number' || wordStarts.length)) {
                    const usePtr = (ev && ev.name === 'word') ? ptr : ptr;
                    const charForHi = (typeof ev.charIndex === 'number') ? ev.charIndex
                        : wordStarts[Math.min(usePtr, wordStarts.length - 1)] || 0;
                    highlightWord(hi, si, charForHi);
                }
            };

            u.onerror = finish;
            u.onend = () => {
                if (hi) clearSentenceHighlight(hi, si);
                const pause = cur.block ? BLOCK_PAUSE_MS : SENTENCE_PAUSE_MS;
                si++;
                if (!reading) { window.speechSynthesis.cancel(); return; }
                if (pause > 0) setTimeout(playNext, pause); else playNext();
            };

            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
        }
        playNext();
    }


    function speakFromSelection(range) {
        if (!('speechSynthesis' in window)) { alert('Uppläsning stöds inte i denna webbläsare.'); return; }
        if (!range) return;

        let wrap = document.createElement('span'); wrap.id = `${NS}-selwrap`;
        if (selWrapEl && selWrapEl.parentNode) { unwrap(selWrapEl); selWrapEl = null; }
        try {
            range.surroundContents(wrap);
        } catch (e) {
            const txt = range.toString();
            if (txt && txt.trim()) speakFromText(txt);
            return;
        }
        selWrapEl = wrap;

        hi = buildHighlighter(wrap);
        const seq = (hi && hi.sentences && hi.sentences.length) ? hi.sentences : splitSentences(wrap.innerText || '').map(t => ({ text: t, block: false }));
        if (!seq.length) { unwrap(wrap); return; }

        reading = true; updatePlayButton(); pushAid('reading');
        let si = 0;
        const autoVoice = voices.find(v => v.name === prefs.voiceName) || voices[0];

        function finish() {
            reading = false; updatePlayButton(); removeAid('reading');
            if (hi) { hi.clearAll(); hi = null; }
            if (wrap && wrap.parentNode) unwrap(wrap);
            if (prefs.subs) hideSubs();
        }

        function playNext() {
            if (!reading) { window.speechSynthesis.cancel(); return; }
            if (si >= seq.length) { finish(); return; }

            const cur = seq[si];
            const text = cur.text;
            const next = (seq[si + 1] && seq[si + 1].text) || '';

            let wordStarts = computeWordStarts(text);
            let ptr = 0;

            if (prefs.subs) { showSubs(); renderRibbonSentence(text, undefined, next); }

            const u = new SpeechSynthesisUtterance(text.trim().length === 1 ? text.toLowerCase() + '.' : text);
            u.rate = prefs.rate; if (autoVoice) u.voice = autoVoice;

            u.onstart = () => {
                if (hi) highlightSentence(hi, si);
                if (prefs.subs && wordStarts.length) renderRibbonSentence(text, wordStarts[0], next);
                ptr = 0;
            };

            u.onboundary = (ev) => {
                if (prefs.subs && wordStarts.length) {
                    const usePtr = (ev && ev.name === 'word') ? (ptr + 1) : ptr;
                    const pick = pickWordStart(wordStarts, ev, usePtr);
                    ptr = pick.idx;
                    renderRibbonSentence(text, pick.start, next);
                }
                if (hi && (typeof ev.charIndex === 'number' || wordStarts.length)) {
                    const usePtr = (ev && ev.name === 'word') ? ptr : ptr;
                    const charForHi = (typeof ev.charIndex === 'number') ? ev.charIndex
                        : wordStarts[Math.min(usePtr, wordStarts.length - 1)] || 0;
                    highlightWord(hi, si, charForHi);
                }
            };

            u.onerror = finish;
            u.onend = () => {
                if (hi) clearSentenceHighlight(hi, si);
                const pause = cur.block ? BLOCK_PAUSE_MS : 0;
                si++;
                if (!reading) { window.speechSynthesis.cancel(); return; }
                if (pause > 0) setTimeout(playNext, pause); else playNext();
            };

            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
        }
        playNext();
    }


    function toggleRead() {
        if (reading) { stopReading(); return; }

        const sel = window.getSelection && window.getSelection();
        const hasLiveSel = sel && sel.rangeCount && !sel.isCollapsed;
        const range = hasLiveSel ? sel.getRangeAt(0) : (lastRange ? lastRange.cloneRange() : null);

        if (range) { speakFromSelection(range); return; }
        speakFromElement(document.body);
    }

    /* ==========================
       Spotlight & Hover
    ========================== */
    function setSpotlight(on) {
        spotlightOn = !!on;
        if (!spotlight) {
            spotlight = h('div', { class: `${NS}-spotlight`, 'aria-hidden': 'true', style: { display: 'none' } });
            document.body.appendChild(spotlight);
        }
        spotlight.style.display = spotlightOn ? 'block' : 'none';

        if (spotlight && spotlight.parentNode) {
            spotlight.parentNode.appendChild(spotlight);
        }

        if (spotlightOn) {
            const y0 = lastMouseY || (window.innerHeight / 2);
            spotlight.style.setProperty('--y', y0 + 'px');
        }

        const b = document.getElementById(`${NS}-tool-spotlight`);
        if (b) b.setAttribute('aria-pressed', spotlightOn ? 'true' : 'false');
        spotlightOn ? pushAid('spotlight') : removeAid('spotlight');
    }
    window.addEventListener('mousemove', (e) => { lastMouseY = e.clientY; if (spotlightOn && spotlight) spotlight.style.setProperty('--y', lastMouseY + 'px'); });
    // NEW: Follow finger for spotlight/radfokus
    window.addEventListener('touchmove', (e) => {
        if (!spotlightOn || !spotlight) return;
        const t = e.touches && e.touches[0];
        if (!t) return;
        lastMouseY = t.clientY;
        spotlight.style.setProperty('--y', lastMouseY + 'px');
    }, { passive: true });

    // Hover (dwell 1500ms)
    window.addEventListener('mousemove', (evt) => {
        if (!hoverOn) return;

        const el = document.elementFromPoint(evt.clientX, evt.clientY);
        if (!el) return;
        if (isInsideWidget(el) && !el.closest('.rw-body, .rw-settings')) return;
        if (el.closest('.rw-tools button')) return;

        const inWidget = isInsideWidget(el);
        if (inWidget && isIconish(el)) return;

        const candidate = inWidget
            ? (findHoverRoot(el) || null)
            : (findReadableAncestor(el) || document.body);

        if (inWidget && !candidate) return;

        if (hoverTimer) clearTimeout(hoverTimer);
        const mySession = ++hoverSession;

        hoverTimer = setTimeout(() => {
            if (mySession !== hoverSession) return;

            const caret = caretAtPoint(evt.clientX, evt.clientY);
            const local = (caret && caret.node && caret.node.nodeType === Node.TEXT_NODE)
                ? sentenceAround(caret.node.nodeValue || '', caret.offset)
                : null;

            if (reading) stopReading();
            const old = prefs.rate; prefs.rate = prefs.hoverRate;

            speakFromElement(
                candidate,
                local,
                { includeWidget: inWidget, strictRoot: inWidget }
            );

            prefs.rate = old;
        }, HOVER_DWELL_MS);
    });

    // AVBRYT dwell om musen lämnar fönstret
    window.addEventListener('mouseout', (e) => {
        if (e.relatedTarget === null && hoverTimer) clearTimeout(hoverTimer);
    });

    document.addEventListener('selectionchange', () => {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.rangeCount && !sel.isCollapsed) {
            const r = sel.getRangeAt(0).cloneRange();
            const node = r.commonAncestorContainer.nodeType === 1
                ? r.commonAncestorContainer
                : r.commonAncestorContainer.parentElement;
            if (node && !isInsideWidget(node)) lastRange = r;
        }
    });

    /* ==========================
       Kontrast / Dyslexi / Undertexter
    ========================== */
    function setContrast(on) {
        prefs.contrast = !!on; savePrefs(prefs);
        document.documentElement.classList.toggle(`${NS}-contrast`, prefs.contrast);
        const b = document.getElementById(`${NS}-tool-contrast`);
        if (b) b.setAttribute('aria-pressed', prefs.contrast ? 'true' : 'false');
        prefs.contrast ? pushAid('contrast') : removeAid('contrast');

        applyTheme();
    }
    function setDyslexia(on) {
        prefs.dyslexia = !!on; savePrefs(prefs);
        document.documentElement.classList.toggle(`${NS}-dyslexia`, prefs.dyslexia);
        const b = document.getElementById(`${NS}-tool-dys`);
        if (b) b.setAttribute('aria-pressed', prefs.dyslexia ? 'true' : 'false');
        prefs.dyslexia ? pushAid('dyslexia') : removeAid('dyslexia');
    }
    function setSubs(on) {
        prefs.subs = !!on; savePrefs(prefs);
        const b = document.getElementById(`${NS}-tool-subs`);
        if (b) b.setAttribute('aria-pressed', prefs.subs ? 'true' : 'false');
        if (!prefs.subs) hideSubs();
        prefs.subs ? pushAid('subs') : removeAid('subs');
    }

    /* ==========================
       UI
    ========================== */
    function toolButton(id, iconKey, label, onclick) {
        const el = h('button', {
            id: `${NS}-tool-${id}`,
            class: `${NS}-tool rw-tool rw-focus`,
            type: 'button', 'aria-pressed': 'false', onclick
        },
            iconEl(iconKey),
            h('span', { class: 'rw-label' }, label)
        );
        if (id === 'read') el.addEventListener('mousedown', preserveSelectionMouseDown);
        return el;
    }

    function renderSettings(which, afterBtnEl) {
        settingsEl.classList.remove('active');
        settingsEl.innerHTML = '';
        if (!which) return;
        // Blockera spotlight/hover-inställning på touch helt
        if (isSmallScreen() && (which === 'spotlight' || which === 'hover')) return;

        if (afterBtnEl) {
            const cell = afterBtnEl.closest('.rw-toolcell') || afterBtnEl.parentElement;
            if (cell) cell.appendChild(settingsEl);
        }

        const addRow = (label, input) => settingsEl.append(h('div', { class: 'rw-row' }, h('label', null, label), input));
        const addInline = (...nodes) => settingsEl.append(h('div', { class: 'rw-inline' }, ...nodes));

        if (which === 'read') {
            addRow('Läshastighet',
                h('input', {
                    class: 'rw-slider', type: 'range', min: '0.7', max: '1.6', step: '0.05', value: String(prefs.rate),
                    oninput: e => { prefs.rate = parseFloat(e.target.value); savePrefs(prefs); }
                })
            );
            const sel = h('select', { class: 'rw-select', onchange: e => { prefs.voiceName = e.target.value; savePrefs(prefs); } });
            voices.forEach(v => {
                const label = (v.lang || '').startsWith('sv') ? 'Svenska' : 'Engelska';
                sel.appendChild(h('option', { value: v.name, selected: v.name === prefs.voiceName }, label));
            });
            addRow('Språk', sel);
        }

        if (which === 'spotlight') {
            addRow('Mörkläggning',
                h('input', {
                    class: 'rw-slider', type: 'range', min: '0', max: '0.95', step: '0.05', value: String(prefs.mask.opacity),
                    oninput: e => { prefs.mask.opacity = parseFloat(e.target.value); savePrefs(prefs); applyTheme(); }
                })
            );
            addRow('Läsbandets höjd',
                h('input', {
                    class: 'rw-slider', type: 'range',
                    min: '60', max: '400', step: '4',
                    value: String(prefs.mask.height),
                    oninput: e => {
                        prefs.mask.height = parseInt(e.target.value, 10);
                        savePrefs(prefs);
                        applyTheme();
                    }
                })
            );
        }

        if (which === 'dys') {
            addRow('Radavstånd',
                h('input', {
                    class: 'rw-slider', type: 'range', min: '1.2', max: '2.2', step: '0.05', value: String(prefs.dys.line),
                    oninput: e => { prefs.dys.line = parseFloat(e.target.value); savePrefs(prefs); applyTheme(); }
                })
            );
            addRow('Ordavstånd',
                h('input', {
                    class: 'rw-slider', type: 'range', min: '0', max: '0.4', step: '0.01', value: String(prefs.dys.word),
                    oninput: e => { prefs.dys.word = parseFloat(e.target.value); savePrefs(prefs); applyTheme(); }
                })
            );
            addRow('Teckenavstånd',
                h('input', {
                    class: 'rw-slider', type: 'range', min: '0', max: '0.2', step: '0.005', value: String(prefs.dys.letter),
                    oninput: e => { prefs.dys.letter = parseFloat(e.target.value); savePrefs(prefs); applyTheme(); }
                })
            );
            addRow('Textstorlek',
                h('input', {
                    class: 'rw-slider', type: 'range', min: '0.9', max: '1.4', step: '0.02', value: String(prefs.dys.scale),
                    oninput: e => { prefs.dys.scale = parseFloat(e.target.value); savePrefs(prefs); applyTheme(); }
                })
            );
        }

        if (which === 'hover') {
            addRow('Läshastighet',
                h('input', {
                    class: 'rw-slider', type: 'range', min: '0.7', max: '1.6', step: '0.05', value: String(prefs.hoverRate),
                    oninput: e => { prefs.hoverRate = parseFloat(e.target.value); savePrefs(prefs); }
                })
            );
        }

        if (which === 'subs') {
            addRow('Textstorlek',
                h('input', {
                    class: 'rw-slider', type: 'range', min: '18', max: '64', step: '1',
                    value: String(prefs.ribbon.font),
                    oninput: e => {
                        prefs.ribbon.font = parseInt(e.target.value, 10);
                        savePrefs(prefs);
                        applyTheme();
                    }
                })
            );

            const bgOptions = [
                { label: 'Transparent', value: 'transparent' },
                { label: 'Svart', value: '#000000' }
            ];
            const bgWrap = h('div', { class: 'rw-inline' });
            const fgWrap = h('div', { class: 'rw-inline' });

            function rebuildFgSwatches() {
                fgWrap.innerHTML = '';
                const isBlackBg = prefs.ribbon.bg === '#000000';
                if (isBlackBg && prefs.ribbon.fg.toLowerCase() === '#000000') {
                    prefs.ribbon.fg = '#ffffff';
                    savePrefs(prefs);
                    applyTheme();
                }
                const fgOptions = ['#ffffff', '#000000', '#FFD60A', '#00E5FF'];
                fgOptions.forEach(col => {
                    const disabled = isBlackBg && col.toLowerCase() === '#000000';
                    const btn = h('button', {
                        class: 'rw-swatch',
                        style: { background: col },
                        'data-color': col,
                        'aria-pressed': prefs.ribbon.fg.toLowerCase() === col.toLowerCase() ? 'true' : 'false',
                        title: disabled ? 'Ej tillgänglig med svart bakgrund' : '',
                        disabled: disabled ? true : false,
                        onclick: () => {
                            if (disabled) return;
                            prefs.ribbon.fg = col;
                            savePrefs(prefs);
                            applyTheme();
                            [...fgWrap.children].forEach(c => c.setAttribute('aria-pressed', 'false'));
                            btn.setAttribute('aria-pressed', 'true');
                        }
                    });
                    fgWrap.appendChild(btn);
                });
            }

            bgOptions.forEach(opt => {
                const btn = h('button', {
                    class: 'rw-swatch',
                    style: {
                        background: opt.value === 'transparent' ? 'transparent' : opt.value,
                        backgroundImage: opt.value === 'transparent'
                            ? 'repeating-linear-gradient(45deg,#ccc 0,#ccc 6px,#eee 6px,#eee 12px)'
                            : undefined
                    },
                    title: opt.label,
                    'aria-pressed': prefs.ribbon.bg === opt.value ? 'true' : 'false',
                    onclick: () => {
                        prefs.ribbon.bg = opt.value;
                        prefs.ribbon.opacity = 1.0;
                        if (prefs.ribbon.bg === '#000000' && prefs.ribbon.fg.toLowerCase() === '#000000') {
                            prefs.ribbon.fg = '#ffffff';
                        }
                        savePrefs(prefs);
                        applyTheme();
                        [...bgWrap.children].forEach(c => c.setAttribute('aria-pressed', 'false'));
                        btn.setAttribute('aria-pressed', 'true');
                        rebuildFgSwatches();
                    }
                });
                bgWrap.appendChild(btn);
            });

            addRow('Bakgrund', bgWrap);
            rebuildFgSwatches();
            addRow('Textfärg', fgWrap);
        }

        settingsEl.classList.add('active');
        if (panel) panel.classList.remove('rw-mini');
        updateMiniState();
        markWidgetActivity();
    }

    function toolButtonRow() {
        // liten hjälpare som bygger en cell med knapp inuti
        const cell = (btn) => h('div', { class: 'rw-toolcell' }, btn);

        return h('div', { class: 'rw-tools' },
            cell(toolButton('read', 'read', 'LÄS', (e) => {
                markKeyboardActivation(e);
                toggleRead();
                renderSettings(reading ? 'read' : null, e.currentTarget);
            })),

            cell(toolButton('contrast', 'contrast', 'KONTRAST', (e) => {
                markKeyboardActivation(e);
                setContrast(!prefs.contrast);
                renderSettings(null);
            })),

            // RADFOKUS bara >768 px
            (!isSmallScreen() ? cell(toolButton('spotlight', 'spotlight', 'RADFOKUS', (e) => {
                markKeyboardActivation(e);
                setSpotlight(!spotlightOn);
                renderSettings(spotlightOn ? 'spotlight' : null, e.currentTarget);
            })) : null),

            cell(toolButton('dys', 'dys', 'DYSLEXI', (e) => {
                markKeyboardActivation(e);
                setDyslexia(!prefs.dyslexia);
                prefs.dyslexia ? renderSettings('dys', e.currentTarget) : renderSettings(null);
            })),

            // HOVRING bara >768 px
            (!isSmallScreen() ? cell(toolButton('hover', 'hover', 'LÄS VID HOVRING', (e) => {
                markKeyboardActivation(e);
                setHoverRead(!hoverOn);
                hoverOn ? renderSettings('hover', e.currentTarget) : renderSettings(null);
            })) : null),

            cell(toolButton('subs', 'subs', 'UNDERTEXTER', (e) => {
                markKeyboardActivation(e);
                setSubs(!prefs.subs);
                prefs.subs ? renderSettings('subs', e.currentTarget) : renderSettings(null);
            }))
        );
    }


    function reflowToolsForViewport() {
        if (!panel) return;

        // Stäng ev. spotlight/hover om vi går ner till liten skärm
        if (isSmallScreen()) {
            if (spotlightOn) setSpotlight(false);
            if (hoverOn) setHoverRead(false);

            // Stäng inställningspanelen om den råkar visa spotlight/hover
            if (settingsEl && settingsEl.classList.contains('active')) {
                const isSpotOrHoverOpen =
                    settingsEl.querySelector('.rw-row label') &&
                    /Mörkläggning|Läsbandets höjd|Läshastighet/.test(settingsEl.innerText);
                if (isSpotOrHoverOpen) settingsEl.classList.remove('active');
            }
        }

        // Rendera om knappraden
        const newTools = toolButtonRow();
        if (toolsHost && toolsHost.parentNode) {
            toolsHost.replaceWith(newTools);
        }
        toolsHost = newTools;
    }



    function setHoverRead(on) {
        if (isSmallScreen() && on) return;
        hoverOn = !!on;
        const b = document.getElementById(`${NS}-tool-hover`);
        if (b) b.setAttribute('aria-pressed', hoverOn ? 'true' : 'false');
        if (!hoverOn && hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; hoverLastEl = null; }
        hoverOn ? pushAid('hover') : removeAid('hover');
    }

    function disableHoverOnTouch() {
        if (!IS_TOUCH) return;
        hoverOn = false;
        const btn = document.getElementById(`${NS}-tool-hover`);
        if (btn) {
            btn.setAttribute('aria-disabled', 'true');
            btn.title = 'Inte tillgängligt på touch-enheter';
            btn.style.opacity = .5;
            btn.style.pointerEvents = 'none';
        }
    }

    function buildUI() {
        // Ladda fonter/ikoner (Inter + Material Symbols)
        injectGoogleAssets();

        // Skapa panelens DOM
        panel = h('section', {
            class: `${NS}-panel`,
            id: `${NS}-panel`,
            role: 'dialog',
            'aria-modal': 'false',
            style: { display: 'none' }
        },
            // Header
            h('div', { class: 'rw-header' },
                h('div', { class: 'rw-title' },
                    iconEl('header'),
                    h('span', null, 'Läsverktyg')
                ),
                // Visa bara subhead på större skärmar
                (!isSmallScreen() ? h('span', { class: 'rw-subhead' }, '(Navigera med Tab)') : null)
            ),

            h('hr', { class: 'rw-hr' }),

            // Body: knappar + inställningsyta
            h('div', { class: 'rw-body' },
                (toolsHost = toolButtonRow()),
                (settingsEl = h('div', { class: 'rw-settings', id: `${NS}-settings` }))
            ),

            // Footer: Stäng-knapp
            h('div', { class: 'rw-footer' },
                h('button', {
                    class: 'rw-btn rw-focus',
                    type: 'button',
                    onclick: () => togglePanel(false)
                }, 'Stäng')
            )
        );

        // In i dokumentet
        document.body.appendChild(panel);

        // Röstlistor
        if (window.speechSynthesis) {
            refreshVoices();
            // vissa webbläsare laddar röster asynkront
            window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
        }

        // Initiera tillstånd/tema
        document.documentElement.classList.toggle(`${NS}-contrast`, !!prefs.contrast);
        document.documentElement.classList.toggle(`${NS}-dyslexia`, !!prefs.dyslexia);
        applyTheme();
        updatePlayButton();

        // Rendera rätt knappuppsättning för aktuell viewport
        reflowToolsForViewport();

        // Uppdatera dynamiskt när vi passerar 768px
        if (mqSmall.addEventListener) {
            mqSmall.addEventListener('change', reflowToolsForViewport);
        } else if (mqSmall.addListener) {
            // äldre Safari
            mqSmall.addListener(reflowToolsForViewport);
        }
    }


    /* ==========================
       Panel / Tangentbord
    ========================== */
    function togglePanel(force) {
        const show = force != null ? force : panel.style.display === 'none';
        panel.style.display = show ? 'block' : 'none';
        if (show) {
            panel.classList.remove('rw-mini');
            const firstBtn = panel.querySelector('.rw-tools .rw-tool');
            if (firstBtn) firstBtn.focus();
        }
    }

    function deactivateAid(t) {
        switch (t) {
            case 'reading': stopReading(); break;
            case 'spotlight': setSpotlight(false); if (settingsEl) settingsEl.classList.remove('active'); break;
            case 'contrast': setContrast(false); if (settingsEl) settingsEl.classList.remove('active'); break;
            case 'dyslexia': setDyslexia(false); if (settingsEl) settingsEl.classList.remove('active'); break;
            case 'hover': setHoverRead(false); if (settingsEl) settingsEl.classList.remove('active'); break;
            case 'subs': setSubs(false); if (settingsEl) settingsEl.classList.remove('active'); break;
        }
    }

    function onKey(e) {
        if (e.key !== 'Escape') return;
        const last = aids[aids.length - 1];
        if (last) {
            e.preventDefault();
            deactivateAid(last);
            return;
        }
        if (panel && panel.style.display === 'block') {
            e.preventDefault();
            togglePanel(false);
        }
    }

    /* ==========================
       Boot & Public API
    ========================== */
    function boot() {
        buildUI();
        window.addEventListener('keydown', onKey, { capture: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

    window.ReaderWidget = {
        open() { togglePanel(true); },
        close() { togglePanel(false); }
    };
})();