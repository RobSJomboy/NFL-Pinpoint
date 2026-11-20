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

  // \u2500\u2500 Teams: colours + era-correct abbreviations \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const TEAM_COLORS = {
    ARI:['#97233F','#FFB612'], ATL:['#A71930','#101010'], BAL:['#241773','#9E7C0C'], BUF:['#00338D','#C60C30'], CAR:['#0085CA','#101820'],
    CHI:['#0B162A','#C83803'], CIN:['#FB4F14','#101010'], CLE:['#311D00','#FF3C00'], DAL:['#003594','#869397'], DEN:['#FB4F14','#002244'],
    DET:['#0076B6','#B0B7BC'], GB:['#203731','#FFB612'], HOU:['#03202F','#A71930'], IND:['#002C5F','#A2AAAD'], JAX:['#006778','#D7A22A'],
    KC:['#E31837','#FFB81C'], LAC:['#0080C6','#FFC20E'], LAR:['#003594','#FFA300'], LV:['#101010','#A5ACAF'], MIA:['#008E97','#FC4C02'],
    MIN:['#4F2683','#FFC62F'], NE:['#002244','#C60C30'], NO:['#101820','#D3BC8D'], NYG:['#0B2265','#A71930'], NYJ:['#125740','#FFFFFF'],
    PHI:['#004C54','#A5ACAF'], PIT:['#101820','#FFB612'], SEA:['#002244','#69BE28'], SF:['#AA0000','#B3995D'], TB:['#D50A0A','#FF7900'],
    TEN:['#0C2340','#4B92DB'], WAS:['#5A1414','#FFB612'],
  };
  const TEAM_ALIAS = { LA: 'LAR', SD: 'LAC', OAK: 'LV', STL: 'LAR', SL: 'LAR' };
  const teamColors = code => TEAM_COLORS[TEAM_ALIAS[code] || code] || ['#2b4a63', '#fbcc7a'];
  // franchise code + season -> what the team was called that year
  function teamLabel(code, y) {
    switch (code) {
      case 'LAC': return y < 1961 ? 'LAC' : y < 2017 ? 'SD' : 'LAC';
      case 'LV': return y < 1982 ? 'OAK' : y < 1995 ? 'LARd' : y < 2020 ? 'OAK' : 'LV';
      case 'LAR': return y < 1946 ? 'CLE' : y < 1995 ? 'LA' : y < 2016 ? 'STL' : 'LAR';
      case 'TEN': return y < 1997 ? 'HOU' : 'TEN';
      case 'ARI': return y < 1960 ? 'CHI' : y < 1988 ? 'STL' : y < 1994 ? 'PHO' : 'ARI';
      case 'IND': return y < 1984 ? 'BAL' : 'IND';
      case 'KC': return y < 1963 ? 'DTX' : 'KC';
      case 'NE': return y < 1971 ? 'BOS' : 'NE';
      case 'WAS': return y < 1937 ? 'BOS' : 'WAS';
      default: return code;
    }
  }
  const yrs = (a, b) => a === b ? String(a) : `${a}\u2013${String(b).slice(-2)}`;
  // [{t:'SD', y:'2010\u201314', c:[primary,secondary]}...] + the team he played most for
  function teamStints(DS, id) {
    const pi = DS.playerIndex.indexOf(id); if (pi < 0) return null;
    const seasons = DS.offense.filter(r => r[0] === pi && DS.teamIndex[r[1]] !== '2TM').map(r => ({ y: r[2], code: DS.teamIndex[r[1]], g: r[4] }))
      .sort((a, b) => a.y - b.y);
    if (!seasons.length) return null;
    const out = [], games = {};
    for (const s of seasons) {
      games[s.code] = (games[s.code] || 0) + s.g;
      const lab = teamLabel(s.code, s.y), last = out[out.length - 1];
      if (last && last.t === lab && s.y <= last.y1 + 1) last.y1 = s.y;
      else out.push({ t: lab, code: s.code, y0: s.y, y1: s.y });
    }
    const main = Object.keys(games).sort((a, b) => games[b] - games[a])[0];
    return { stints: out.map(s => ({ t: s.t, y: yrs(s.y0, s.y1), c: teamColors(s.code) })), main: teamColors(main) };
  }

  // \u2500\u2500 Renderer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // state = { seq, show:{card,score,strikes,board,title,turn}, card, players[], turn, maxStrikes, title, sub, size, board, layout, theme }
  function createStage(host, opts = {}) {
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
    let latest = null, waitingKey = '', lastPre = '', rankState = 'shown';
    // sounds play only on a stage created with {sound:true} (the OBS display), never for the state replayed on connect
    const born = Date.now(); let sfxCfg = null; const audio = {};
    function sfx(kind) {
      if (!opts.sound || !sfxCfg || !sfxCfg.on || Date.now() - born < 2500) return;
      const name = sfxCfg[kind]; if (!name) return;
      try {
        const a = audio[name] || (audio[name] = new Audio('sfx/' + name + '.m4a'));
        a.volume = Math.max(0, Math.min(1, (sfxCfg.vol ?? 80) / 100)); a.currentTime = 0; a.play().catch(() => {});
      } catch {}
    }
    const loaded = new Set();   // src+mode that finished loading (ok or not)
    const frames = new Map();   // src -> {x,y,w,h}: cutout placement measured from the image's own pixels
    const failed = new Set();   // photos that would not load: draw the silhouette, never a broken-image icon
    const pending = new Map();  // src+mode -> promise, so a preload and a card share one fetch
    const PH_W = 692, PH_H = 640; // photo window on the card
    // Load a photo before the card is drawn, so card and photo always arrive together (no img.decode(): it can hang).
    function preload(src, cutout) {
      const k = src + (cutout ? '#c' : '');
      if (loaded.has(k)) return Promise.resolve(!failed.has(src));
      if (pending.has(k)) return pending.get(k);
      const p = new Promise(res => {
        const im = new Image(); let done = false;
        const fin = ok => { if (!done) { done = true; clearTimeout(t); pending.delete(k); loaded.add(k); if (!ok) failed.add(src); res(ok); } };
        const t = setTimeout(() => fin(false), 6000);
        if (cutout && !/^data:/.test(src)) im.crossOrigin = 'anonymous';
        im.onload = () => { if (cutout) { try { const f = frameCutout(im); if (f) frames.set(src, f); } catch {} } fin(true); };
        im.onerror = () => { if (im.crossOrigin) { im.onerror = () => fin(false); im.removeAttribute('crossorigin'); im.src = src; } else fin(false); };
        im.src = src;
      });
      pending.set(k, p);
      return p;
    }
    // Every cutout framed the same way: crown just under the top of the photo window, head centred.
    function frameCutout(im) {
      const W0 = 120, H0 = Math.max(1, Math.round(W0 * im.naturalHeight / im.naturalWidth));
      const cv = document.createElement('canvas'); cv.width = W0; cv.height = H0;
      const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, W0, H0);
      const d = cx.getImageData(0, 0, W0, H0).data;
      const solid = (x, y) => d[(y * W0 + x) * 4 + 3] > 60;
      let top = -1;
      for (let y = 0; y < H0 && top < 0; y++) { let n = 0; for (let x = 0; x < W0; x++) if (solid(x, y)) n++; if (n >= 3) top = y; }
      if (top < 0) return null;
      let sx = 0, sn = 0;
      for (let y = top; y < Math.min(H0, top + Math.round(H0 * 0.18)); y++) for (let x = 0; x < W0; x++) if (solid(x, y)) { sx += x; sn++; }
      const headX = sn ? sx / sn / W0 : 0.5;
      const topF = top / H0;
      const HEAD_TOP = 92, BOTTOM = 700;
      const h = Math.min((BOTTOM - HEAD_TOP) / Math.max(0.35, 1 - topF), 1250);
      const w = h * im.naturalWidth / im.naturalHeight;
      return { x: Math.round(PH_W / 2 - headX * w), y: Math.round(HEAD_TOP - topF * h), w: Math.round(w), h: Math.round(h) };
    }
    // Shrink a line until it fits its box: text is never clipped.
    function fitText(root) {
      root.querySelectorAll('[data-fit]').forEach(n => {
        const max = +n.dataset.fit, min = +(n.dataset.min || 24), box = n.parentElement.clientWidth || +n.dataset.w;
        let s = max; n.style.fontSize = s + 'px';
        while (s > min && n.scrollWidth > box) { s -= 2; n.style.fontSize = s + 'px'; }
      });
    }
    if (document.fonts) { document.fonts.ready.then(() => fitText(el.card)); document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => fitText(el.card)); }

    function renderCard(S) {
      const c = S.card;
      const on = !!(S.show && S.show.card && c && !(S.show.board && S.board));
      if (!c) { el.cardwrap.classList.toggle('on', false); return; }
      const key = c.id + '|' + (c.img || '') + '|' + (c.photo ? 1 : 0) + '|' + (S.cardLabel || '') + '|' + (S.sub || '');
      const lk = c.img + (c.photo ? '' : '#c');
      if (key !== lastCardKey && c.img && !loaded.has(lk)) {
        el.cardwrap.classList.remove('on');           // hold the new card until its photo is ready
        if (waitingKey !== key) { waitingKey = key; preload(c.img, !c.photo).then(() => { if (waitingKey === key) { waitingKey = ''; if (latest) renderCard(latest); } }); }
        return;
      }
      el.cardwrap.classList.toggle('on', on);
      if (key === lastCardKey) { syncRank(c); return; }
      const sameId = lastCardKey.split('|')[0] === String(c.id);
      lastCardKey = key;
      const miss = c.kind === 'miss';
      const src = c.img && !failed.has(c.img) ? c.img : '';
      const gray = miss ? 'filter="url(#jcGray)"' : '';
      const fid = 'jcSh' + String(c.id).replace(/\W/g, '');
      const shade = `filter="url(#${fid})"`;   // cutouts get a soft dark drop shadow
      let photo = '';
      if (src && c.photo) photo = `<image href="${esc(src)}" x="0" y="0" width="${PH_W}" height="${PH_H}" preserveAspectRatio="xMidYMin slice" ${gray}/>`;
      else if (src) { const f = frames.get(src) || (c.espn ? { x: -170, y: 80, w: 1040, h: 755 } : { x: -150, y: 15, w: 1000, h: 1000 });
        photo = `<image href="${esc(src)}" ${frames.has(src) && !/^data:/.test(src) ? 'crossorigin="anonymous"' : ''} x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" preserveAspectRatio="xMidYMin meet" ${shade}/>`; }
      else photo = `<g opacity=".35" fill="#0a0a0a"><circle cx="${PH_W / 2}" cy="270" r="118"/><path d="M110 660 Q120 440 ${PH_W / 2} 425 Q${PH_W - 120} 440 ${PH_W - 110} 660Z"/></g>`;
      const tc = c.tc || ['#2b4a63', '#fbcc7a'];
      const hasVal = c.val !== '' && c.val != null;
      const statBig = miss && !hasVal ? 'Not on the list' : fmtVal(c.val);
      const statLbl = miss && !hasVal ? (S.title || '') : (S.cardLabel || '');
      const rankTop = miss ? (c.rank ? 'Actual rank' : 'Strike') : (c.dr && c.dr[0] === 'T' ? 'Tied' : 'Rank');
      const rankBig = miss ? (c.rank ? '#' + c.rank : '\u2715') : '#' + (c.dr || c.rank);
      const st = (c.teams || []);
      const shown = st.length > 9 ? st.slice(0, 8) : st;
      const tags = shown.map((t, i) => `<span class="jt" style="--t1:${esc(t.c[0])};--t2:${esc(t.c[1])};--r:${i % 2 ? 2.5 : -2.5}deg"><b>${esc(t.t)}</b>${esc(t.y)}</span>`).join('')
        + (st.length > 9 ? `<span class="jt more" style="--r:2deg"><b>+${st.length - 8}</b>more</span>` : '');
      const star = Array.from({ length: 28 }, (_, i) => { const a = Math.PI * i / 14, r = i % 2 ? 84 : 100; return `${(100 + r * Math.cos(a)).toFixed(1)},${(100 + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
      const rankHidden = !miss && c.rankShown === false;
      rankState = rankHidden ? 'hidden' : 'shown';
      el.card.className = 'pp-card jc' + (miss ? ' miss' : '') + (c.pinpoint ? ' pin' : '') + (rankHidden ? ' rank-hidden' : '');
      el.card.style.setProperty('--pc', c.whoColor || '#ffd84a');
      el.card.style.setProperty('--t1', miss ? '#5d646b' : tc[0]);
      el.card.style.setProperty('--t2', miss ? '#9aa1a8' : tc[1]);
      el.card.innerHTML = `
        <div class="jc-photo">
          <div class="jc-rays"></div><div class="jc-dots"></div>
          <svg class="jc-img" viewBox="0 0 ${PH_W} ${PH_H}" width="${PH_W}" height="${PH_H}">
            <defs>
              <filter id="jcGray"><feColorMatrix type="saturate" values="0"/></filter>
              <filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%">
                <feColorMatrix in="SourceGraphic" type="saturate" values="${miss ? 0 : 1}" result="g"/>
                <feGaussianBlur in="SourceAlpha" stdDeviation="16" result="b1"/><feOffset in="b1" dx="10" dy="14" result="o1"/>
                <feFlood flood-color="#05080c" flood-opacity=".62"/><feComposite in2="o1" operator="in" result="soft"/>
                <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b2"/><feOffset in="b2" dx="4" dy="5" result="o2"/>
                <feFlood flood-color="#05080c" flood-opacity=".35"/><feComposite in2="o2" operator="in" result="near"/>
                <feMerge><feMergeNode in="soft"/><feMergeNode in="near"/><feMergeNode in="g"/></feMerge>
              </filter>
            </defs>
            ${photo}
          </svg>
          ${tags ? `<div class="jc-teams${st.length > 6 ? ' many2' : st.length > 3 ? ' many' : ''}">${tags}</div>` : ''}
          ${miss ? `<svg class="jc-x" viewBox="0 0 100 100"><path d="M20 20 L80 80 M80 20 L20 80" stroke="#0a0a0a" stroke-width="20" stroke-linecap="round"/><path d="M20 20 L80 80 M80 20 L20 80" stroke="#e3262f" stroke-width="12" stroke-linecap="round"/></svg>` : ''}
          ${c.pinpoint ? `<div class="jc-pin rv"><span>Best possible answer</span>PINPOINT!</div>` : ''}
        </div>
        ${c.who ? `<div class="jc-who">${esc(c.who)}${miss ? ' <b>STRIKE</b>' : ` <b class="rv">+${esc(c.pts)}</b>`}</div>` : ''}
        ${c.rare && !c.pinpoint ? `<div class="jc-rare rv">Rare find!</div>` : ''}
        <div class="jc-info">
          <div class="jc-namebox"><div class="jc-name" data-fit="124" data-min="48">${esc(c.name)}</div></div>
          <div class="jc-row">
            <div class="jc-stat"><div class="jc-statbox"><b class="jc-val" data-fit="${miss && !hasVal ? 64 : 124}" data-min="36">${esc(statBig)}</b></div>
              <div class="jc-lbl">${esc(statLbl)}</div></div>
            <div class="jc-rank${rankHidden ? ' hide' : ''}"><svg viewBox="0 0 200 200"><polygon points="${star}"/></svg><div><i>${esc(rankTop)}</i><b data-fit="70" data-min="30" data-w="120">${esc(rankBig)}</b></div></div>
          </div>
        </div>`;
      fitText(el.card);
      if (!sameId) { el.card.classList.remove('enter'); void el.card.offsetWidth; el.card.classList.add('enter'); sfx('card'); }
    }
    // star-wipe the rank in when the producer reveals it (no full re-render, so the card doesn't re-animate)
    function syncRank(c) {
      if (!c || c.kind === 'miss') return;
      const want = c.rankShown === false ? 'hidden' : 'shown';
      if (want === rankState) return;
      rankState = want;
      const r = el.card.querySelector('.jc-rank'); if (!r) return;
      if (want === 'shown') {
        el.card.classList.remove('rank-hidden');
        r.classList.remove('hide'); r.classList.remove('wipe'); void r.offsetWidth; r.classList.add('wipe');
        el.card.classList.add('revealed');
        sfx('reveal');
      } else { r.classList.add('hide'); r.classList.remove('wipe'); el.card.classList.add('rank-hidden'); el.card.classList.remove('revealed'); }
    }
    // warm a whole list of photos (display does this as soon as a list is chosen)
    async function preloadAll(items) {
      let i = 0; const run = async () => { while (i < items.length) { const it = items[i++]; await preload(it.img, !it.photo); } };
      await Promise.all(Array.from({ length: 4 }, run));
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
      latest = S; sfxCfg = S.sfx || null;
      if (opts.sound && sfxCfg) ['card', 'reveal'].forEach(k => { const n = sfxCfg[k]; if (n && !audio[n]) { const au = new Audio('sfx/' + n + '.m4a'); au.preload = 'auto'; audio[n] = au; } });
      if (S.pre && S.pre.length) { const k = S.pre.map(x => x.img).join('|'); if (k !== lastPre) { lastPre = k; preloadAll(S.pre); } }
      applyLayout(S);
      renderCard(S);
      renderScore(S);
      renderBoard(S);
      el.sbwrap.style.opacity = el.kwrap.style.opacity = S.show && S.show.board && S.board ? 0 : 1;
      applyLayout(S);
    }
    return { el, render, preloadAll, preload, frames };
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
    fmtVal, headshotUrl, esc, CARD_THEMES, PLAYER_COLORS, LAY_DEFAULT, createStage, fitStage, TEAM_COLORS, teamColors, teamLabel, teamStints, hubOf, publisher, fetchRoom, subscribe };
})();
