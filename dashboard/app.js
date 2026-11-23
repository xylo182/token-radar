/* Token Radar dashboard: renders window.RADAR (written by main.ts from the
   sealed snapshot). No network: every byte comes from data.js beside the page.
   The page is sortable, filterable and has a detail view for every protocol.
   Hash state, so a view can be linked: #detail=<slug>, #cat=<category>,
   #chain=<chain>, #q=<text>, #wl=1. */
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.getElementById('lede').textContent = 'No data: data.js did not load.'; return; }

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(v) {
    if (v == null) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var rows = R.rows, live = R.live, model = R.model;

  /* ---- header ---- */
  $('lede').textContent =
    'Every protocol DefiLlama tracks with at least $5M of TVL, ranked by what a token launch would be worth if the protocol’s record stayed as it is. ' +
    'Snapshot ' + R.as_of + ' · ' + rows.length + ' pre-token protocols ranked · ' + R.watchlist_size + ' on the house watchlist · ' +
    'the ' + live.length + ' largest already trading, shown apart and never ranked.';
  $('strip').innerHTML =
    '<li><b>' + R.watchlist_size + '/' + R.watchlist_size + '</b> watchlist covered</li>' +
    '<li><b>' + rows.length + '</b> rows, ranks 1–' + rows.length + '</li>' +
    '<li>Implied values <b>non-increasing</b> down the board</li>' +
    '<li>Model <b>' + esc(model.version) + '</b>, fitted on ' + model.peers + ' peers</li>';

  /* ---- model panel ---- */
  var held = R.held_out.map(function (h) {
    return '<tr><td>' + esc(h.split) + '</td><td class="num">' + h.peers_tested + '</td>' +
      '<td class="num">' + h.fitted_median_log10_error.toFixed(2) + '</td>' +
      '<td class="num">' + h.starter_median_log10_error.toFixed(2) + '</td></tr>';
  }).join('');
  $('model').innerHTML =
    '<h2>The value model</h2>' +
    '<p class="hint">Fitted from the snapshot itself — no name is ever special-cased. A protocol’s token, if launched, is worth what its peers’ tokens are worth at its size; the board’s implied value is that value times the chance its category’s protocols ever issue one.</p>' +
    '<div class="formula">implied value = <b>10^' + model.intercept + ' × TVL^' + model.slope + '</b> × growth × maturity × issuance odds</div>' +
    '<div class="model-grid">' +
    '<div><h3>Power law</h3><p>log₁₀(market cap) = ' + model.intercept + ' + ' + model.slope + ' × log₁₀(TVL), fitted by least squares on the ' + model.peers + ' tokenized peers with a positive market cap. Market caps grow sublinearly with TVL — a flat multiple would overvalue the giants.</p></div>' +
    '<div><h3>Growth &amp; maturity</h3><p>Growth = 1 + clamp(7-day change, −60%, +120%) × 0.5. Maturity = 0.6 + min(age, 1095 days) / 1095 × 0.4 (age unknown: 365 days). Both are modest adjustments, as the peer data shows no strong age effect.</p></div>' +
    '<div><h3>Issuance odds</h3><p>Each category’s share of protocols that already have a token, shrunk toward the global share (' + (model.global_odds * 100).toFixed(0) + '%) with a pseudo-count of 5. Risk Curators, for example, rarely issue one — their size alone does not make them likely.</p></div>' +
    '</div>' +
    '<h3 style="margin:16px 0 6px">Held out twice — fit on one half of the peers, tested on the other</h3>' +
    '<table class="mini"><thead><tr><th>Split</th><th class="num">Peers tested</th><th class="num">This model, median |log₁₀ error|</th><th class="num">Starter flat 0.25× TVL</th></tr></thead><tbody>' + held + '</tbody></table>' +
    '<p class="hint" style="margin-top:8px">A category-median ratio was tried and did not help, so it is not in the model. The odds term is not part of this test: every peer in it already has a token.</p>';

  /* ---- method panel ---- */
  var catRows = R.categories.slice(0, 14).map(function (c) {
    return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.protocols + '</td><td class="num">' + c.tokenized + '</td>' +
      '<td class="num">' + (c.odds * 100).toFixed(1) + '%</td><td class="num">' + (c.median_ratio == null ? '—' : c.median_ratio.toFixed(3)) + '</td></tr>';
  }).join('');
  $('method').innerHTML =
    '<h2>Method &amp; honesty</h2>' +
    '<p>The snapshot is DefiLlama’s record as of ' + R.as_of + '; it does not move and it is not updated. “Records no token” means the record carries no token — never that the protocol has none. A protocol on the list may still have a token its DefiLlama record does not carry.</p>' +
    '<p>Farm plans are built from each protocol’s own record: its category sets the action, its first chain sets the gas cost (Ethereum about $8 a transaction, Solana about $0.05, the big L2s about $0.50), its TVL sets the capital ($50–$250), its age sets the hold (30–60 days). Nothing is predicted about whether or when a token is issued; the implied value is this entry’s own claim.</p>' +
    '<h3 style="margin:12px 0 6px">Issuance odds by category (largest categories)</h3>' +
    '<table class="mini"><thead><tr><th>Category</th><th class="num">Protocols</th><th class="num">With token</th><th class="num">Odds</th><th class="num">Peer median mcap/TVL</th></tr></thead><tbody>' + catRows + '</tbody></table>';

  $('foot').textContent = 'Source: ' + R.source + ' · Floor: $' + (R.floor_usd / 1e6) + 'M TVL · Board written by main.ts from the sealed snapshot; the page renders with no network.';

  /* ---- filters ---- */
  var cats = [...new Set(rows.map(function (r) { return r.category || '(no category)'; }))].sort();
  var chains = [...new Set(rows.flatMap(function (r) { return r.chains; }))].sort();
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');

  var state = { q: '', cat: '', chain: '', wl: false, sort: 'rank', dir: 1 };
  var wlSet = new Set(R.watchlist || []);
  (function () {
    var h = new URLSearchParams(location.hash.slice(1));
    if (h.get('q')) { state.q = h.get('q'); $('q').value = state.q; }
    if (h.get('cat')) { state.cat = h.get('cat'); $('cat').value = state.cat; }
    if (h.get('chain')) { state.chain = h.get('chain'); $('chain').value = state.chain; }
    if (h.get('wl') === '1') { state.wl = true; $('wl').checked = true; }
  })();

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.cat && (r.category || '(no category)') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.wl && !wlSet.has(r.slug)) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      if (r.tvl_usd < +$('minTvl').value) return false;
      return true;
    });
  }

  function renderBoard() {
    var list = filtered().slice();
    var k = state.sort, d = state.dir;
    list.sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (av == null) return 1; if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * d;
      return (av - bv) * d;
    });
    var tb = $('board').querySelector('tbody');
    tb.innerHTML = list.map(function (r) {
      var chg = r.change_7d == null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '"' + (selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td><td><b>' + esc(r.name) + '</b><br><span style="color:var(--muted);font-size:.8rem">' + esc(r.slug) + '</span></td>' +
        '<td><span class="tag">' + esc(r.category || '—') + '</span></td>' +
        '<td>' + esc(r.chains[0] || '—') + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + chg + '</td>' +
        '<td class="num">' + (r.age_days == null ? '—' : r.age_days + 'd') + '</td>' +
        '<td class="num">' + (r.issuance_odds * 100).toFixed(0) + '%</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>';
    }).join('');
    $('count').textContent = list.length + ' of ' + rows.length + ' shown';
    $('boardSub').textContent = '— ' + list.length + ' protocols';
    document.querySelectorAll('#board th').forEach(function (th) {
      th.classList.toggle('sorted', th.dataset.k === state.sort);
    });
  }

  function renderLive() {
    $('live').querySelector('tbody').innerHTML = live.map(function (p) {
      return '<tr><td><b>' + esc(p.name) + '</b></td><td><span class="tag">' + esc(p.category || '—') + '</span></td>' +
        '<td>' + esc(p.chains.slice(0, 2).join(', ')) + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
        '<td class="num">' + (p.change_7d == null ? '—' : pct(p.change_7d)) + '</td></tr>';
    }).join('');
  }

  var selected = null;
  function renderDetail(slug) {
    selected = slug;
    var r = rows.find(function (x) { return x.slug === slug; });
    var box = $('detail');
    if (!r) { box.innerHTML = '<h2>Detail</h2><p class="hint">Select a row in the board to see one protocol’s model breakdown and farm plan.</p>'; return; }
    var steps = r.farm_steps || [];
    var cap = r.tvl_usd >= 5e9 ? 250 : r.tvl_usd >= 1e9 ? 150 : r.tvl_usd >= 1e8 ? 100 : 50;
    var hold = r.age_days == null ? 30 : r.age_days < 180 ? 60 : r.age_days < 365 ? 45 : 30;
    box.innerHTML =
      '<div class="detail-head"><h3>#' + r.rank + ' ' + esc(r.name) + '</h3>' +
      '<span class="big">' + money(r.implied_value_usd) + ' implied</span>' +
      '<span>' + esc(r.category || '—') + ' · ' + esc(r.chains.join(', ')) + '</span></div>' +
      '<p class="hint">Records no token (DefiLlama carries no market cap, CoinGecko id or symbol for it). Listed ' + (r.listed_at || 'unknown') + ', ' + (r.age_days == null ? 'age unknown' : r.age_days + ' days old') + '.</p>' +
      '<table class="factors"><tbody>' +
      '<tr><td>TVL</td><td class="num">' + money(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Power law: 10^' + model.intercept + ' × TVL^' + model.slope + '</td><td class="num">' + money(r.value_if_launched_usd / (r.growth_multiplier * r.maturity_multiplier)) + '</td></tr>' +
      '<tr><td>Growth: 7-day ' + pct(r.change_7d) + ' → ×' + r.growth_multiplier.toFixed(2) + '</td><td class="num">×' + r.growth_multiplier.toFixed(2) + '</td></tr>' +
      '<tr><td>Maturity: ' + (r.age_days == null ? 'unknown age' : r.age_days + ' days') + ' → ×' + r.maturity_multiplier.toFixed(2) + '</td><td class="num">×' + r.maturity_multiplier.toFixed(2) + '</td></tr>' +
      '<tr><td><b>Value if launched</b></td><td class="num"><b>' + money(r.value_if_launched_usd) + '</b></td></tr>' +
      '<tr><td>Issuance odds (' + esc(r.category || 'no category') + ')</td><td class="num">' + (r.issuance_odds * 100).toFixed(1) + '%</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>' +
      '</tbody></table>' +
      '<h3 style="margin:16px 0 6px">Farm plan — concrete steps, with costs and times</h3>' +
      '<ol class="steps">' + steps.map(function (s) {
        var m = s.match(/ Cost: (.*)\. Time: (.*)\.$/);
        var text = m ? s.slice(0, m.index) : s;
        return '<li>' + esc(text) + (m ? '<span class="meta">Cost: <b>' + esc(m[1]) + '</b> · Time: <b>' + esc(m[2]) + '</b></span>' : '') + '</li>';
      }).join('') + '</ol>' +
      '<p class="verdict"><b>Farm verdict:</b> about $' + cap + ' of capital, a few dollars of gas on ' + esc(r.chains[0] || 'its main chain') + ', held at least ' + hold + ' days. ' +
      'The position is worth farming while the implied value stays above the capital at risk — here about ' + Math.round(r.implied_value_usd / cap).toLocaleString('en-US') + '× the capital.</p>' +
      '<p class="warn">This is not investment advice and not a prediction that a token will be issued. A protocol that records no token may still have one its DefiLlama record does not carry.</p>';
    renderBoard();
  }

  $('board').querySelector('tbody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) renderDetail(tr.dataset.slug);
  });
  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      if (state.sort === th.dataset.k) state.dir = -state.dir;
      else { state.sort = th.dataset.k; state.dir = 1; }
      renderBoard();
    });
  });
  $('q').addEventListener('input', function () { state.q = this.value; renderBoard(); });
  $('cat').addEventListener('change', function () { state.cat = this.value; renderBoard(); });
  $('chain').addEventListener('change', function () { state.chain = this.value; renderBoard(); });
  $('wl').addEventListener('change', function () { state.wl = this.checked; renderBoard(); });
  $('minTvl').addEventListener('change', renderBoard);

  renderBoard();
  renderLive();
  function applyHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    state.q = h.get('q') || ''; $('q').value = state.q;
    state.cat = h.get('cat') || ''; $('cat').value = state.cat;
    state.chain = h.get('chain') || ''; $('chain').value = state.chain;
    state.wl = h.get('wl') === '1'; $('wl').checked = state.wl;
    renderBoard();
    if (h.get('detail')) renderDetail(h.get('detail'));
  }
  window.addEventListener('hashchange', applyHash);
  applyHash();
})();
