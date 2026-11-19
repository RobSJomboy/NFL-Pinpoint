// NFL Pinpoint Challenge \u2014 shared engine (list math, renderer, transport)
// Used by index.html (control) and display.html (OBS).
window.PP = (() => {
  const HUB_DEFAULT = 'https://jomboy-relay.jomboymedia.workers.dev';
  const W = 1920, H = 1080;

  // \u2500\u2500 Stats (same definitions as jomboytrivia.com Football Pinpoint) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const IDX = { PID:0, TID:1, YEAR:2, POS:3, G:4, CMP:5, PASS_ATT:6, PASS_YDS:7, PASS_TD:8, INT:9,
    CAR:10, RUSH_YDS:11, RUSH_TD:12, REC:13, TGT:14, REC_YDS:15, REC_TD:16, KR_YDS:17, KR_TD:18, PR_YDS:19, PR_TD:20, FL:21, TWOPT:22 };
  const STATS = {
    pass_yds:     { label:'Pass Yards',          short:'PassYds',  card:'Passing Yards',        col:IDX.PASS_YDS },
    pass_td:      { label:'Passing TDs',         short:'PassTD',   card:'Passing Touchdowns',   col:IDX.PASS_TD },
    pass_int:     { label:'Interceptions',       short:'INT',      card:'Interceptions Thrown', col:IDX.INT },
    completions:  { label:'Completions',         short:'CMP',      card:'Completions',          col:IDX.CMP },
    rush_yds:     { label:'Rush Yards',          short:'RushYds',  card:'Rushing Yards',        col:IDX.RUSH_YDS },
    rush_td:      { label:'Rush TDs',            short:'RushTD',   card:'Rushing Touchdowns',   col:IDX.RUSH_TD },
    carries:      { label:'Carries',             short:'Car',      card:'Carries',              col:IDX.CAR },
    rec_yds:      { label:'Receiving Yards',     short:'RecYds',   card:'Receiving Yards',      col:IDX.REC_YDS },
    rec_td:       { label:'Receiving TDs',       short:'RecTD',    card:'Receiving Touchdowns', col:IDX.REC_TD },
    receptions:   { label:'Receptions',          short:'Rec',      card:'Receptions',           col:IDX.REC },
    scrimmage_yds:{ label:'Scrimmage Yards',     short:'ScrimYds', card:'Scrimmage Yards',      col:null },
    ap_yds:       { label:'All-Purpose Yards',   short:'APYds',    card:'All-Purpose Yards',    col:null },
    total_td:     { label:'Total TDs (non-pass)',short:'TotTD',    card:'Total Touchdowns',     col:null },
    fantasy_std:  { label:'Fantasy Pts (Std)',   short:'FanPts',   card:'Fantasy Points - STD', col:null },
    fantasy_ppr:  { label:'Fantasy Pts (PPR)',   short:'PPR',      card:'Fantasy Points - PPR', col:null },
    games:        { label:'Games Played',        short:'GP',       card:'Games Played',         col:IDX.G },
  };
  const STAT_GROUPS = [
    ['Passing', ['pass_yds','pass_td','pass_int','completions']],
    ['Rushing', ['rush_yds','rush_td','carries']],
    ['Receiving', ['rec_yds','rec_td','receptions']],
    ['Combined', ['scrimmage_yds','ap_yds','total_td','fantasy_std','fantasy_ppr','games']],
  ];
  function statValue(r, stat) {
    switch (stat) {
      case 'scrimmage_yds': return r[IDX.RUSH_YDS] + r[IDX.REC_YDS];
      case 'ap_yds': return r[IDX.RUSH_YDS] + r[IDX.REC_YDS] + r[IDX.KR_YDS] + r[IDX.PR_YDS];
      case 'total_td': return r[IDX.RUSH_TD] + r[IDX.REC_TD] + r[IDX.KR_TD] + r[IDX.PR_TD];
      case 'fantasy_std': case 'fantasy_ppr': {
        const v = r[IDX.PASS_YDS]/25 + r[IDX.PASS_TD]*4 - r[IDX.INT]*2 + r[IDX.RUSH_YDS]/10 + r[IDX.RUSH_TD]*6
          + r[IDX.REC_YDS]/10 + r[IDX.REC_TD]*6 + r[IDX.TWOPT]*2 - r[IDX.FL]*2 + (stat === 'fantasy_ppr' ? r[IDX.REC] : 0);
        return Math.round(v * 10) / 10;
      }
      default: { const d = STATS[stat]; return d && d.col != null ? r[d.col] : 0; }
    }
  }

  const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const normHy = s => norm((s || '').replace(/-/g, ' '));
  const lastName = s => { const p = norm(s).split(' ').filter(x => !/^(jr|sr|ii|iii|iv|v)$/.test(x)); return p[p.length - 1] || ''; };

  // Assign rank / tie ranks to a list sorted desc by val. Points = rank.
  function rankRows(rows) {
    let i = 0;
    while (i < rows.length) {
      let j = i; while (j < rows.length && rows[j].val === rows[i].val) j++;
      for (let k = i; k < j; k++) { rows[k].rank = i + 1; rows[k].dr = (j - i > 1 ? 'T' : '') + (i + 1); }
      i = j;
    }
    return rows;
  }
  function cutTop(ranked, n) {
    let cut = Math.min(n, ranked.length);
    if (cut > 0 && cut < ranked.length) { const b = ranked[cut - 1].rank; while (cut < ranked.length && ranked[cut].rank === b) cut++; }
    return ranked.slice(0, cut);
  }

  // computeList over the jomboytrivia dataset (port of computeFPList)
  function computeList(DS, setup) {
    const { stat, yearMin, yearMax, poolTab = 'all', confValues = [], teamCodes = [], posCodes = [], listSize = 100 } = setup;
    let allowed = null;
    if (poolTab === 'team' && teamCodes.length) { const s = new Set(teamCodes); allowed = new Set(); DS.teamIndex.forEach((c, i) => s.has(c) && allowed.add(i)); }
    else if (poolTab === 'conf' && confValues.length) { const s = new Set(confValues); allowed = new Set(); DS.teamIndex.forEach((c, i) => DS.teams[c] && s.has(DS.teams[c].conf) && allowed.add(i)); }
    const pos = posCodes.length ? new Set(posCodes) : null;
    if (pos && (pos.has(1) || pos.has(4))) { pos.add(1); pos.add(4); }
    const agg = new Map();
    for (const r of DS.offense) {
      const y = r[IDX.YEAR];
      if (y < yearMin || y > yearMax) continue;
      if (allowed && !allowed.has(r[IDX.TID])) continue;
      if (r[IDX.POS] === 5) continue;
      if (pos && !pos.has(r[IDX.POS])) continue;
      const v = statValue(r, stat);
      if (v === 0 && stat !== 'games') continue;
      agg.set(r[IDX.PID], (agg.get(r[IDX.PID]) || 0) + v);
    }
    const ranked = [];
    agg.forEach((val, pi) => {
      const id = DS.playerIndex[pi], p = DS.players[id];
      if (!p || !p.n) return;
      ranked.push({ id, name: p.n, val: Math.round(val * 10) / 10, hs: DS.hs && DS.hs[id] || '' });
    });
    ranked.sort((a, b) => b.val - a.val);
    rankRows(ranked);
    return { top: cutTop(ranked, listSize), full: ranked };
  }

  function subtitleFor(yMin, yMax, first, last) {
    if (yMin <= first && yMax >= last) return 'All-Time';
    if (yMin === yMax) return 'In ' + yMin;
    if (yMax >= last) return 'Since ' + yMin;
    if (yMin % 10 === 0 && yMax === yMin + 9) return 'The ' + yMin + 's';
    return yMin + '\u2013' + yMax;
  }

  const fmtVal = v => {
    if (v == null || v === '') return '';
    if (typeof v === 'string') return v;
    return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };
  // hs codes: u<id>/p<id> = NFL.com cutout (upload/private), e<id> = ESPN headshot
  const headshotUrl = hs => !hs ? '' : /^https?:|^data:/.test(hs) ? hs
    : hs[0] === 'e' ? `https://a.espncdn.com/i/headshots/nfl/players/full/${hs.slice(1)}.png`
    : `https://static.www.nfl.com/image/${hs[0] === 'u' ? 'upload' : 'private'}/t_headshot_desktop_2x/league/${hs.slice(1)}`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const CARD_THEMES = [
    { panel:'#12c2f4', ban:'#f45fb5' }, // cyan / pink (the episode look)
    { panel:'#f6d02a', ban:'#1fae5b' }, // yellow / green
    { panel:'#ff7a3d', ban:'#2e6fe3' }, // orange / blue
    { panel:'#8fdf4f', ban:'#ec3d55' }, // lime / red
    { panel:'#b784ef', ban:'#f6a12e' }, // purple / orange
    { panel:'#ff5a7a', ban:'#1fb8b0' }, // coral / teal
  ];
  const PLAYER_COLORS = ['#f7a35c', '#f45fb5', '#f6e04a', '#5cc8ff', '#7be07b'];

  // card x/y/size \u00b7 scoreboard x/y/size \u00b7 strike boxes centre-x/y/size \u00b7 board size
  const LAY_DEFAULT = { cx: 30, cy: 12, cs: 100, sx: 805, sy: 615, ss: 100, kx: 1350, ky: 819, ks: 100, bs: 100 };

  // \u2500\u2500 Renderer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // state = { seq, show:{card,score,strikes,board,title,turn}, card, players[], turn, maxStrikes, title, sub, size, board, layout, theme }
  function createStage(host) {
    host.innerHTML = `
      <div class="pp-stage">
        <div class="pp-cardwrap"><div class="pp-card"></div></div>
        <div class="pp-sbwrap">
          <div class="pp-title"></div>
          <div class="pp-score"></div>
        </div>
        <div class="pp-kwrap"><div class="pp-kin"><div class="pp-strikes"></div></div></div>
        <div class="pp-board"></div>
      </div>`;
    const $ = s => host.querySelector(s);
    const el = { stage: $('.pp-stage'), cardwrap: $('.pp-cardwrap'), card: $('.pp-card'), sbwrap: $('.pp-sbwrap'), kwrap: $('.pp-kwrap'),
      title: $('.pp-title'), score: $('.pp-score'), strikes: $('.pp-strikes'), board: $('.pp-board') };
    let lastCardKey = '', lastScores = {}, lastStrikes = {}, lastBoardKey = '';
    let latest = null, waitingKey = '';
    const loaded = new Set();
    const frames = new Map();
    const failed = new Set();   // photos that would not load: draw the silhouette, never a broken-image icon   // src -> {x,y,w,h} placement for cutouts, measured from the image's own pixels
    // Load a photo before the card is drawn, so card and photo always arrive together.
    // Cutouts are measured on the way in so every player is framed the same: top of the head just
    // under the top of the oval, head centred left-right, shoulders filling the bottom.
    const preload = (src, cutout) => new Promise(res => {
      const im = new Image(); let done = false;
      const fin = ok => { if (!done) { done = true; clearTimeout(t); res(ok); } };
      const t = setTimeout(() => fin(false), 4000);
      if (cutout) im.crossOrigin = 'anonymous';
      im.onload = () => { if (cutout) { try { const f = frameCutout(im); if (f) frames.set(src, f); } catch {} } fin(true); };  // (no img.decode(): it can hang)
      im.onerror = () => { if (cutout && im.crossOrigin) { im.onerror = () => fin(false); im.removeAttribute('crossorigin'); im.src = src + ''; } else fin(false); };
      im.src = src;
    });
    function frameCutout(im) {
      const W0 = 120, H0 = Math.max(1, Math.round(W0 * im.naturalHeight / im.naturalWidth));
      const cv = document.createElement('canvas'); cv.width = W0; cv.height = H0;
      const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, W0, H0);
      const d = cx.getImageData(0, 0, W0, H0).data;
      const solid = (x, y) => d[(y * W0 + x) * 4 + 3] > 60;
      let top = -1;
      for (let y = 0; y < H0 && top < 0; y++) { let n = 0; for (let x = 0; x < W0; x++) if (solid(x, y)) n++; if (n >= 3) top = y; }
      if (top < 0) return null;
      // head centre = middle of the opaque span a little below the crown
      let sx = 0, sn = 0;
      for (let y = top; y < Math.min(H0, top + Math.round(H0 * 0.18)); y++) for (let x = 0; x < W0; x++) if (solid(x, y)) { sx += x; sn++; }
      const headX = sn ? sx / sn / W0 : 0.5;
      const topF = top / H0;
      const HEAD_TOP = 92, BOTTOM = 845;                       // card units (oval spans y 52\u2013828)
      let h = (BOTTOM - HEAD_TOP) / Math.max(0.35, 1 - topF);
      h = Math.min(h, 1250);
      const w = h * im.naturalWidth / im.naturalHeight;
      return { x: Math.round(370 - headX * w), y: Math.round(HEAD_TOP - topF * h), w: Math.round(w), h: Math.round(h) };
    }

    function renderCard(S) {
      const c = S.card;
      const on = !!(S.show && S.show.card && c && !(S.show.board && S.board));
      if (!c) { el.cardwrap.classList.toggle('on', false); return; }
      const key = c.id + '|' + (c.img || '');
      if (key !== lastCardKey && c.img && !loaded.has(c.img + (c.photo ? '' : '#c'))) {
        // hold the new card off screen until its photo is ready
        el.cardwrap.classList.remove('on');
        if (waitingKey !== key) {
          waitingKey = key;
          preload(c.img, !c.photo).then(ok => { if (!ok) failed.add(c.img); loaded.add(c.img + (c.photo ? '' : '#c')); if (waitingKey === key) { waitingKey = ''; if (latest) renderCard(latest); } });
        }
        return;
      }
      el.cardwrap.classList.toggle('on', on);
      if (key === lastCardKey) return;
      lastCardKey = key;
      const th = CARD_THEMES[(c.theme || 0) % CARD_THEMES.length];
      const miss = c.kind === 'miss';
      const nameSize = c.name.length > 20 ? 40 : c.name.length > 16 ? 46 : 54;
      const fbTop = miss ? (c.rank ? '#' + c.rank : '\u2715') : '#' + (c.dr || c.rank);
      const fbSub = miss ? (c.rank ? 'Off the list' : 'Not on list') : (S.sub || '');
      const fbSize = fbTop.length > 4 ? 56 : fbTop.length > 3 ? 64 : 74;
      const src = c.img && !failed.has(c.img) ? c.img : '';
      const img = !src ? '' : c.photo
        ? `<image href="${esc(c.img)}" x="55" y="50" width="630" height="780" preserveAspectRatio="xMidYMin slice" clip-path="url(#ppOval${c.id})" ${miss ? 'filter="url(#ppGray)"' : ''}/>`
        : (f => `<image href="${esc(c.img)}" ${frames.has(c.img) ? 'crossorigin="anonymous"' : ''} x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" preserveAspectRatio="xMidYMin meet" clip-path="url(#ppOval${c.id})" ${miss ? 'filter="url(#ppGray)"' : ''}/>`)(
            frames.get(c.img) || (c.espn ? { x: -153, y: 116, w: 1046, h: 760 } : { x: -130, y: 15, w: 1000, h: 1000 }));
      const silhouette = !src ? `<g clip-path="url(#ppOval${c.id})" opacity=".35"><circle cx="370" cy="360" r="130" fill="#0b1a2b"/><path d="M130 840 Q140 560 370 540 Q600 560 610 840Z" fill="#0b1a2b"/></g>` : '';
      el.card.className = 'pp-card' + (miss ? ' miss' : '') + (c.pinpoint ? ' pinpoint' : '');
      el.card.innerHTML = `
        <svg viewBox="0 0 740 1060" width="740" height="1060">
          <defs>
            <clipPath id="ppOval${c.id}"><ellipse cx="370" cy="440" rx="312" ry="388"/></clipPath>
            <radialGradient id="ppBg${c.id}" cx="50%" cy="38%" r="70%">
              <stop offset="0" stop-color="#6d8aa6"/><stop offset=".55" stop-color="#34506b"/><stop offset="1" stop-color="#14263a"/>
            </radialGradient>
            <filter id="ppGray"><feColorMatrix type="saturate" values="0.05"/><feComponentTransfer><feFuncR type="linear" slope=".8"/><feFuncG type="linear" slope=".8"/><feFuncB type="linear" slope=".8"/></feComponentTransfer></filter>
          </defs>
          <rect x="0" y="0" width="740" height="1060" fill="#0a0a0a"/>
          <rect x="11" y="11" width="718" height="1038" fill="#fff"/>
          <rect x="30" y="30" width="680" height="1000" rx="26" fill="${th.panel}"/>
          <ellipse cx="370" cy="440" rx="312" ry="388" fill="url(#ppBg${c.id})"/>
          ${img}${silhouette}
          <ellipse cx="370" cy="440" rx="312" ry="388" fill="none" stroke="#0a0a0a" stroke-width="7"/>
          ${miss ? `<g class="pp-x" stroke-linecap="round"><path d="M175 230 L565 650 M565 230 L175 650" stroke="#0a0a0a" stroke-width="72"/><path d="M175 230 L565 650 M565 230 L175 650" stroke="#e3262f" stroke-width="50"/></g>` : ''}
          <path d="M34 788 Q300 830 668 752 Q690 748 694 770 L655 968 Q645 990 620 994 Q330 1040 70 1004 Q48 1000 52 980 Q84 900 34 806 Q28 790 34 788Z" fill="${miss ? '#7b7b7b' : th.ban}" stroke="#0a0a0a" stroke-width="7" stroke-linejoin="round"/>
          <ellipse cx="612" cy="944" rx="132" ry="80" fill="${miss ? '#c3262f' : '#8a4a2a'}" stroke="#0a0a0a" stroke-width="6"/>
        </svg>
        <div class="pp-ctext pp-name" style="font-size:${nameSize}px">${esc(c.name)}</div>
        <div class="pp-ctext pp-val">${miss ? (c.val !== '' && c.val != null ? esc(fmtVal(c.val)) : 'NOT ON THE LIST') : esc(fmtVal(c.val))}</div>
        <div class="pp-ctext pp-lbl">${esc(miss && (c.val === '' || c.val == null) ? (S.title || '') : (S.cardLabel || ''))}</div>
        <div class="pp-ctext pp-fb1" style="font-size:${fbSize}px">${esc(fbTop)}</div>
        <div class="pp-ctext pp-fb2">${esc(fbSub)}</div>
        ${c.pinpoint ? `<div class="pp-pin"><span>Best possible answer</span>PINPOINT!</div>` : ''}
        ${c.rare && !c.pinpoint ? `<div class="pp-rare">Rare find</div>` : ''}
        ${c.who ? `<div class="pp-who" style="--pc:${esc(c.whoColor || '#fff')}">${esc(c.who)}${miss ? ' \u00b7 STRIKE' : ' +' + esc(c.pts)}</div>` : ''}`;
      // restart entrance animation
      el.card.classList.remove('enter'); void el.card.offsetWidth; el.card.classList.add('enter');
    }

    function renderScore(S) {
      const ps = S.players || [];
      el.sbwrap.style.setProperty('--n', ps.length || 1);
      el.sbwrap.classList.toggle('many', ps.length > 3);
      el.kwrap.classList.toggle('many', ps.length > 3); el.kwrap.style.setProperty('--n', ps.length || 1);
      el.score.classList.toggle('on', !!(S.show && S.show.score));
      el.strikes.classList.toggle('on', !!(S.show && S.show.strikes));
      el.title.classList.toggle('on', !!(S.show && S.show.title && S.title));
      el.title.innerHTML = `<b>${esc(S.title || '')}</b>${S.size ? `<i>Top ${esc(S.size)}</i>` : ''}`;
      const turnOn = S.show && S.show.turn;
      el.score.innerHTML = ps.map((p, i) => `
        <div class="pp-col${p.out ? ' out' : ''}${turnOn && S.turn === i && !p.out ? ' turn' : ''}" style="--pc:${esc(p.color)}">
          <div class="pp-pname" style="font-size:${Math.min(62, Math.floor(1000 / ps.length / Math.max(4, p.name.length) / 0.56))}px">${esc(p.name)}</div>
          <div class="pp-pscore">${p.score}</div>
          ${p.out ? '<div class="pp-out">OUT</div>' : ''}
          ${lastScores[i] != null && p.score > lastScores[i] ? `<div class="pp-plus">+${p.score - lastScores[i]}</div>` : ''}
        </div>`).join('');
      const max = S.maxStrikes || 0;
      el.strikes.innerHTML = ps.map((p, i) => {
        let boxes;
        if (max > 0 && max <= 5) boxes = Array.from({ length: max }, (_, k) => `<div class="pp-box${k < p.strikes ? ' x' : ''}${k === p.strikes - 1 && lastStrikes[i] != null && p.strikes > lastStrikes[i] ? ' new' : ''}">${k < p.strikes ? XSVG : ''}</div>`).join('');
        else boxes = `<div class="pp-box x">${XSVG}</div><div class="pp-xcount">\u00d7 ${p.strikes}</div>`;
        return `<div class="pp-scol${p.out ? ' out' : ''}">${boxes}</div>`;
      }).join('');
      ps.forEach((p, i) => { lastScores[i] = p.score; lastStrikes[i] = p.strikes; });
    }

    function renderBoard(S) {
      const on = !!(S.show && S.show.board && S.board);
      el.board.classList.toggle('on', on);
      if (!on) return;
      const key = JSON.stringify(S.board) + S.title;
      if (key === lastBoardKey) return;
      lastBoardKey = key;
      const rows = S.board;
      const n = rows.length;
      const cols = n <= 12 ? 1 : n <= 30 ? 2 : n <= 60 ? 3 : 4;
      const per = Math.ceil(n / cols);
      const rh = Math.min(64, Math.floor((830 - 5 * (per - 1)) / per));
      el.board.innerHTML = `
        <div class="pp-bhead"><b>${esc(S.title || '')}</b><span>${esc(S.sub || '')} \u00b7 Top ${esc(S.size || n)}</span></div>
        <div class="pp-bgrid" style="grid-template-rows:repeat(${per},${rh}px);grid-template-columns:repeat(${cols},1fr);font-size:${Math.round(rh * 0.56)}px">
          ${rows.map(r => `<div class="pp-slot${r.c ? ' got' : ''}${r.rv ? ' rv' : ''}" style="${r.c ? `--pc:${esc(r.c)}` : ''}">
            <span class="r">${esc(r.r)}</span><span class="n">${r.n ? esc(r.n) : '?????'}</span><span class="v">${r.n ? esc(fmtVal(r.v)) : ''}</span></div>`).join('')}
        </div>`;
    }

    function applyLayout(S) {
      const L = Object.assign({}, LAY_DEFAULT, S.layout || {});
      el.cardwrap.style.transform = `translate(${L.cx}px,${L.cy}px) scale(${L.cs / 100})`;
      el.sbwrap.style.transform = `translate(${L.sx}px,${L.sy}px) scale(${L.ss / 100})`;
      el.kwrap.style.transform = `translate(${L.kx}px,${L.ky}px) scale(${L.ks / 100})`;
      el.board.style.transform = el.board.classList.contains('on') ? `scale(${L.bs / 100})` : `scale(${L.bs / 100 * 0.96})`;
    }

    function render(S) {
      if (!S) return;
      latest = S;
      applyLayout(S);
      renderCard(S);
      renderScore(S);
      renderBoard(S);
      el.sbwrap.style.opacity = el.kwrap.style.opacity = S.show && S.show.board && S.board ? 0 : 1;
      applyLayout(S);
    }
    return { el, render };
  }
  const XSVG = `<svg viewBox="0 0 100 100"><path d="M18 18 L82 82 M82 18 L18 82" stroke="#0a0a0a" stroke-width="30" stroke-linecap="round"/><path d="M18 18 L82 82 M82 18 L18 82" stroke="#e3262f" stroke-width="18" stroke-linecap="round"/></svg>`;

  // fit a 1920x1080 stage into its parent
  function fitStage(stageHost) {
    const fit = () => {
      const p = stageHost.parentElement; if (!p) return;
      const s = Math.min(p.clientWidth / W, p.clientHeight / H) || 1;
      stageHost.style.transform = `scale(${s})`;
    };
    fit(); window.addEventListener('resize', fit);
    if (window.ResizeObserver) new ResizeObserver(fit).observe(stageHost.parentElement);
    return fit;
  }

  // \u2500\u2500 Transport: Jomboy relay (WebSocket + stored state) + BroadcastChannel \u2500\u2500\u2500\u2500
  const hubOf = params => (params.get('hub') || HUB_DEFAULT).replace(/\/$/, '');
  function publisher(hub, getRoom, onStatus) {
    let bc = null, bcRoom = null, inflight = 0;
    return async payload => {
      const room = getRoom();
      if (bcRoom !== room) { try { bc && bc.close(); bc = new BroadcastChannel('npp-' + room); bcRoom = room; } catch { bc = null; } }
      try { bc && bc.postMessage(payload); } catch {}
      const my = ++inflight;
      onStatus('sending\u2026', '');
      try {
        const r = await fetch(`${hub}/r/${encodeURIComponent(room)}`, { method: 'POST', body: JSON.stringify(payload), signal: AbortSignal.timeout(6000) });
        const j = await r.json().catch(() => ({}));
        if (my !== inflight) return;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        onStatus(`on air \u00b7 ${j.sent ?? 0} screen${j.sent === 1 ? '' : 's'} listening`, 'ok');
      } catch { if (my === inflight) onStatus('relay unreachable \u2014 OBS will not update', 'bad'); }
    };
  }
  async function fetchRoom(hub, room) {
    const r = await fetch(`${hub}/r/${encodeURIComponent(room)}?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const t = await r.text();
    return t && t !== 'null' ? JSON.parse(t) : null;
  }
  function subscribe(hub, room, apply) {
    try { new BroadcastChannel('npp-' + room).onmessage = e => apply(e.data); } catch {}
    const url = `${hub}/r/${encodeURIComponent(room)}`;
    let backoff = 2000;
    const open = () => {
      try {
        const ws = new WebSocket(url.replace(/^http/, 'ws'));
        ws.onopen = () => { backoff = 2000; };
        ws.onmessage = ev => { try { apply(JSON.parse(ev.data)); } catch {} };
        ws.onclose = () => { setTimeout(open, backoff); backoff = Math.min(backoff * 2, 30000); };
      } catch { setTimeout(open, backoff); }
    };
    open();
    const poll = () => fetchRoom(hub, room).then(apply).catch(() => {});
    poll(); setInterval(poll, 30000);
  }

  return { W, H, IDX, STATS, STAT_GROUPS, statValue, norm, normHy, lastName, rankRows, cutTop, computeList, subtitleFor,
    fmtVal, headshotUrl, esc, CARD_THEMES, PLAYER_COLORS, LAY_DEFAULT, createStage, fitStage, hubOf, publisher, fetchRoom, subscribe };
})();
