// BotDash — dashboard client
const api = (path, opts = {}) =>
  fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts })
    .then(async r => {
      if (r.status === 401) { location.href = '/login.html'; throw new Error('auth'); }
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (d.upgrade_required) {
          showUpgradePrompt(d.error || 'feature do plano Pro');
          throw new Error(d.error || 'plano Pro necessário');
        }
        throw new Error(d.error || r.statusText);
      }
      return r.json();
    });

function showUpgradePrompt(msg) {
  openModal(`
    <div class="modal-title">★ feature do plano Pro<button class="modal-close" onclick="closeModal()">×</button></div>
    <div style="font-size:13px;color:#aaa;margin-bottom:18px;font-family:'IBM Plex Mono',monospace;line-height:1.6;">${escapeHtml(msg)}</div>
    <div style="background:linear-gradient(135deg,#1a1530,#0e0e2e);border:1px solid #4a3a8e;border-radius:10px;padding:18px;margin-bottom:14px;">
      <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:6px;">Pro · R$47/mês</div>
      <div style="font-size:12px;color:#aaa;font-family:'IBM Plex Mono',monospace;line-height:1.6;">produtos ilimitados, afiliados, sorteios, auto-respostas, MisticPay, white-label e mais</div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="btn-g" onclick="closeModal()">agora não</button>
      <button class="btn-w" style="background:#8b6fff;" onclick="closeModal();sp('plano',document.querySelector('[data-page=plano]'))">ver planos</button>
    </div>
  `);
}

function toggleGroup(headerEl) {
  const groupName = headerEl.dataset.toggle;
  const items = document.querySelector(`.nav-group-items[data-group="${groupName}"]`);
  if (!items) return;
  const collapsed = !headerEl.classList.contains('collapsed');
  headerEl.classList.toggle('collapsed', collapsed);
  items.classList.toggle('collapsed', collapsed);
  // Persiste estado
  try {
    const state = JSON.parse(localStorage.getItem('botdash_nav_groups') || '{}');
    state[groupName] = !collapsed; // true = aberto
    localStorage.setItem('botdash_nav_groups', JSON.stringify(state));
  } catch {}
}

function restoreNavGroups() {
  try {
    const state = JSON.parse(localStorage.getItem('botdash_nav_groups') || '{}');
    for (const [name, open] of Object.entries(state)) {
      const header = document.querySelector(`.nav-group[data-toggle="${name}"]`);
      const items = document.querySelector(`.nav-group-items[data-group="${name}"]`);
      if (!header || !items) continue;
      header.classList.toggle('collapsed', !open);
      items.classList.toggle('collapsed', !open);
    }
  } catch {}
}

function toast(msg, type = 'ok', ms = 3500) {
  const w = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  w.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 250); }, ms);
}

function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-bg').classList.add('show');
}
function closeModal(id) {
  if (id) { document.getElementById(id)?.classList.remove('open'); return; }
  document.getElementById('modal-bg').classList.remove('show');
}

function confirmAsync(msg) {
  return new Promise(resolve => {
    openModal(`
      <div class="modal-title">confirmar<button class="modal-close" onclick="closeModal()">×</button></div>
      <div style="font-size:13px;color:#aaa;font-family:'IBM Plex Mono',monospace;margin-bottom:18px;line-height:1.6;">${msg}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn-g" onclick="window.__cf(false)">cancelar</button>
        <button class="btn-w" onclick="window.__cf(true)">confirmar</button>
      </div>
    `);
    window.__cf = (v) => { closeModal(); resolve(v); };
  });
}

function filterTable(tbodyId, query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll('#' + tbodyId + ' tr').forEach(tr => {
    tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function emptyRow(cols, icon, text, ctaText, ctaCall) {
  return `<tr><td colspan="${cols}" style="text-align:center;padding:50px 20px;border-bottom:none;">
    <div style="font-size:32px;opacity:.25;margin-bottom:10px;">${icon}</div>
    <div style="font-size:12.5px;font-family:'IBM Plex Mono',monospace;color:#555;line-height:1.6;max-width:340px;margin:0 auto;">${text}</div>
    ${ctaText ? `<button class="btn-g" style="margin-top:16px;" onclick="${ctaCall}">${ctaText}</button>` : ''}
  </td></tr>`;
}

function emptyBlock(icon, text, ctaText, ctaCall) {
  return `<div style="text-align:center;padding:50px 20px;">
    <div style="font-size:32px;opacity:.25;margin-bottom:10px;">${icon}</div>
    <div style="font-size:12.5px;font-family:'IBM Plex Mono',monospace;color:#555;line-height:1.6;max-width:340px;margin:0 auto;">${text}</div>
    ${ctaText ? `<button class="btn-g" style="margin-top:16px;" onclick="${ctaCall}">${ctaText}</button>` : ''}
  </div>`;
}

function exportCsv(kind) {
  const url = kind === 'sales' ? '/api/sales/export.csv' : '/api/customers/_/export.csv';
  fetch(url, { credentials: 'include' }).then(r => {
    if (!r.ok) { toast('Erro no export', 'err'); return; }
    return r.blob().then(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = kind + '.csv';
      a.click();
      toast('Arquivo baixado', 'ok');
    });
  });
}

const charts = {};
let produtos = [];
let agendamentos = [];
let canalDisponivel = [];

function doLogout(e) {
  e?.preventDefault();
  fetch('/auth/logout', { method: 'POST', credentials: 'include' }).then(() => location.href = '/login.html');
}

async function bootstrap() {
  let me;
  try { me = await fetch('/auth/me', { credentials: 'include' }).then(r => r.json()); }
  catch { location.href = '/login.html'; return; }

  if (!me.authenticated) { location.href = '/login.html'; return; }
  if (!me.admin) { location.href = '/login.html?login=denied'; return; }

  window.__me = me.user;
  const u = me.user;
  const name = u.display_name || u.username || u.email?.split('@')[0] || 'usuário';
  document.getElementById('me-tag').textContent = name;
  const avatar = u.discord_avatar || u.avatar;
  if (avatar) {
    const av = document.getElementById('bot-avatar');
    av.textContent = '';
    av.style.backgroundImage = `url(${avatar})`;
    av.style.backgroundSize = 'cover';
  } else {
    const av = document.getElementById('bot-avatar');
    av.textContent = (name[0] || 'U').toUpperCase();
  }
  // Mostra papel (owner/admin) embaixo do nome
  const meta = document.querySelector('.sidebar-foot .foot-meta');
  if (meta) meta.textContent = (u.role || 'admin') + ' · ' + (u.email ? u.email.split('@')[0] : '');

  // Popula user dropdown no topbar
  const av = document.getElementById('user-avatar');
  if (av) {
    if (avatar) { av.style.backgroundImage = `url(${avatar})`; av.textContent = ''; }
    else { av.textContent = (name[0] || 'U').toUpperCase(); }
  }
  const setUm = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v || '—'; };
  setUm('user-menu-name', name);
  setUm('user-menu-email', u.email || '');
  setUm('user-menu-last', u.last_login_at ? new Date(u.last_login_at * 1000).toLocaleString('pt-BR') : 'agora');

  restoreNavGroups();
  loadBrand();
  loadOverview();
  loadProdutos();
  loadCanais();
  loadPlanBadge();

  // Detecta retorno do checkout Stripe
  const params = new URLSearchParams(location.search);
  if (params.get('billing') === 'success') {
    toast('✓ Assinatura ativada — bem-vindo ao Pro!', 'ok', 5000);
    setTimeout(() => location.href = '/app.html', 2000);
  } else if (params.get('billing') === 'cancel') {
    toast('Checkout cancelado. Você ainda está no plano Free.', 'warn', 4000);
  }
}

async function loadPlanBadge() {
  try {
    const info = await api('/api/billing/me');
    window.__plan_id = info.plan_id;
    const badge = document.getElementById('brand-plan');
    if (badge) {
      if (info.plan_id === 'pro') {
        badge.classList.remove('plan-free');
        badge.classList.add('plan-pro');
        badge.textContent = '★ pro';
      } else {
        badge.classList.remove('plan-pro');
        badge.classList.add('plan-free');
        badge.textContent = 'free';
      }
    }
  } catch {}
}

async function loadBrand() {
  try {
    const cfg = await api('/api/config').catch(() => ({}));
    const name = cfg.bot_name || 'BotDash';
    document.getElementById('brand-name').textContent = name;

    // Carrega guilds do usuario + ativa
    let guildName = 'seu servidor';
    try {
      const data = await api('/api/guilds');
      window.__guilds = data.guilds || [];
      window.__active_guild = data.active_guild_id || null;
      const active = data.guilds.find(g => g.id === data.active_guild_id);
      if (active) guildName = active.name;
      else if (data.guilds.length === 0) guildName = '+ adicionar bot';
    } catch {}

    const txt = document.getElementById('brand-server-text');
    if (txt) txt.textContent = '· ' + guildName;

    // logo customizada
    if (cfg.brand_logo_url && /^https?:\/\//.test(cfg.brand_logo_url)) {
      const lo = document.getElementById('brand-logo');
      lo.textContent = '';
      lo.style.backgroundImage = `url('${cfg.brand_logo_url}')`;
    } else {
      const lo = document.getElementById('brand-logo');
      lo.textContent = (name[0] || 'B').toUpperCase();
    }
  } catch {}
}

function toggleGuildSwitcher(e) {
  e?.stopPropagation();
  const sw = document.getElementById('guild-switcher');
  if (sw.classList.contains('open')) {
    sw.classList.remove('open');
    return;
  }
  renderGuildSwitcher();
  sw.classList.add('open');
  setTimeout(() => {
    document.addEventListener('click', closeGuildSwitcherOnce, { once: true });
  }, 0);
}

function closeGuildSwitcherOnce() {
  document.getElementById('guild-switcher')?.classList.remove('open');
}

function renderGuildSwitcher() {
  const sw = document.getElementById('guild-switcher');
  const guilds = window.__guilds || [];
  const active = window.__active_guild;
  if (!guilds.length) {
    sw.innerHTML = `<div class="guild-empty">você não está em nenhum servidor.<br><a href="/onboarding.html" style="color:var(--primary);text-decoration:none;">adicionar bot →</a></div>`;
    return;
  }
  sw.innerHTML = guilds.map(g => `
    <div class="guild-item ${g.id === active ? 'active' : ''}" onclick="switchGuild('${escapeAttr(g.id)}')">
      <div class="gicon" ${g.icon_url ? `style="background-image:url('${escapeAttr(g.icon_url)}')"` : ''}>${g.icon_url ? '' : (g.name[0] || '?').toUpperCase()}</div>
      <div class="gname">${escapeHtml(g.name)}</div>
      ${g.id === active ? '<span class="gcheck">✓</span>' : ''}
    </div>
  `).join('') + `
    <div class="guild-item" onclick="location.href='/onboarding.html'" style="border-top:1px solid var(--border-strong);">
      <div class="gicon" style="background:var(--primary-glow);color:var(--primary);">+</div>
      <div class="gname" style="color:var(--primary);">adicionar outro servidor</div>
    </div>`;
}

async function switchGuild(guildId) {
  try {
    await api('/api/guilds/switch/' + encodeURIComponent(guildId), { method: 'POST' });
    location.reload();
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- VISAO GERAL ----------
async function loadOverview() {
  try {
    const t0 = performance.now();
    const data = await api('/api/stats/overview');
    document.getElementById('api-latency').textContent = Math.round(performance.now() - t0) + 'ms';

    setMetric('m-total', formatNum(data.members_total));
    setMetric('m-online', formatNum(data.members_online));
    setMetric('m-cmds', formatNum(data.commands_today));
    setMetric('m-mod', formatNum(data.mod_today));
    setMetric('m-revenue', 'R$' + formatNum(Math.round(data.month_revenue_cents / 100)));

    setText('m-join-week', `+${data.joins_week} esta semana`);

    renderRecentLogs('overview-logs', data.recent_logs);
    renderTopCommands(data.top_commands);
    renderModCounts(data.mod_counts);

    renderChart('cMembros', 'line', last14Labels(), [
      { data: data.member_activity_14d.map(d => d.joins), borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 2, pointRadius: 2, tension: 0.4, fill: true },
      { data: data.member_activity_14d.map(d => d.leaves), borderColor: '#555', backgroundColor: 'rgba(85,85,85,0.04)', borderWidth: 2, pointRadius: 2, tension: 0.4, fill: true }
    ]);

    renderChart('cVendasG', 'bar', last6MonthLabels(), [
      { data: data.monthly_revenue_6m, backgroundColor: 'rgba(255,255,255,0.8)', borderColor: '#fff', borderWidth: 1, borderRadius: 4 }
    ], { y: { ticks: { callback: v => 'R$' + Math.round(v / 1000) + 'k' } } });
  } catch (e) { console.warn('overview', e.message); }
}

function renderRecentLogs(id, logs) {
  const el = document.querySelector('#page-geral .brow .card .lglist');
  if (!el) return;
  el.innerHTML = logs.map(l => `
    <div class="lgi"><div class="dot ${dotClass(l.type)}"></div>
      <div><div class="ltxt">${escapeHtml(l.message)}</div>
      <div class="ltime">${timeAgo(l.created_at)}</div></div></div>
  `).join('') || '<div class="ltxt" style="color:#444">sem eventos ainda.</div>';
}

function renderTopCommands(cmds) {
  const card = document.querySelectorAll('#page-geral .card')[3];
  if (!card) return;
  const list = card.querySelector('.cmdlist');
  if (!list) return;
  const max = Math.max(1, ...cmds.map(c => c.c));
  list.innerHTML = cmds.length ? cmds.map((c, i) => {
    const pct = Math.round(c.c / max * 100);
    const shades = ['#fff', '#aaa', '#888', '#666', '#444'];
    return `<div class="cmdr"><span class="cmdn">/${escapeHtml(c.command)}</span>
      <div class="bwrap"><div class="bfill" style="width:${pct}%;background:${shades[i] || '#333'}"></div></div>
      <span class="bcnt">${c.c}</span></div>`;
  }).join('') : '<div class="ltxt" style="color:#444">sem comandos registrados.</div>';
}

function renderModCounts(c) {
  const cards = document.querySelectorAll('#page-geral .card')[4]?.querySelectorAll('.smi');
  if (!cards) return;
  const vals = [c.ban, c.kick, c.mute, c.warn];
  cards.forEach((card, i) => { const v = card.querySelector('.smival'); if (v) v.textContent = vals[i] ?? 0; });
}

// ---------- MEMBROS ----------
async function loadMembros() {
  try {
    const data = await api('/api/members/summary');
    const cards = document.querySelectorAll('#page-membros .mc');
    if (cards[0]) cards[0].querySelector('.mval').textContent = formatNum(data.total);
    if (cards[1]) cards[1].querySelector('.mval').textContent = formatNum(data.online);
    if (cards[2]) cards[2].querySelector('.mval').textContent = formatNum(data.joins_today);
    if (cards[3]) cards[3].querySelector('.mval').textContent = formatNum(data.leaves_today);

    renderChart('cGrowth', 'line', last14Labels(), [
      { data: data.growth_14d.map(d => d.joins - d.leaves), borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true }
    ]);

    const list = await api('/api/members?limit=50');
    const tbody = document.querySelector('#page-membros .vtable tbody');
    if (tbody) tbody.innerHTML = list.map(m => `
      <tr><td class="hi">${escapeHtml(m.tag)}</td>
      <td>${escapeHtml(m.roles[0] || 'membro')}</td>
      <td>${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('pt-BR') : '—'}</td>
      <td><span style="color:${m.status === 'online' ? '#5fff5f' : '#444'}">● ${m.status}</span></td></tr>
    `).join('');
  } catch (e) { console.warn('membros', e.message); }
}

// ---------- LOGS ----------
async function loadLogs() {
  try {
    const sum = await api('/api/logs/summary');
    const cards = document.querySelectorAll('#page-logs .mc');
    if (cards[0]) cards[0].querySelector('.mval').textContent = formatNum(sum.today);
    if (cards[1]) cards[1].querySelector('.mval').textContent = formatNum(sum.errors);
    if (cards[2]) cards[2].querySelector('.mval').textContent = formatNum(sum.commands);
    if (cards[3]) cards[3].querySelector('.mval').textContent = formatNum(sum.joins_leaves);

    const logs = await api('/api/logs?limit=80');
    const tbody = document.querySelector('#page-logs .vtable tbody');
    if (tbody) tbody.innerHTML = logs.map(l => `
      <tr><td>${formatTime(l.created_at)}</td>
      <td>${typeBadge(l.type)}</td>
      <td class="hi">${escapeHtml(l.message)}</td>
      <td>${escapeHtml(l.discord_tag || '—')}</td>
      <td>${escapeHtml(l.channel ? '#' + l.channel : '—')}</td></tr>
    `).join('');
  } catch (e) { console.warn('logs', e.message); }
}

// ---------- MODERACAO ----------
async function loadMod() {
  try {
    const sum = await api('/api/mod/summary');
    const cards = document.querySelectorAll('#page-mod .mc');
    const counts = [sum.counts.ban, sum.counts.kick, sum.counts.mute, sum.counts.warn, sum.counts.automod];
    cards.forEach((c, i) => { const v = c.querySelector('.mval'); if (v) v.textContent = counts[i] ?? 0; });

    renderChart('cMod', 'bar', last6MonthLabels(), [
      { label: 'bans', data: sum.monthly.map(m => m.bans), backgroundColor: '#ff5f5f', borderRadius: 3 },
      { label: 'kicks', data: sum.monthly.map(m => m.kicks), backgroundColor: '#ffdf5f', borderRadius: 3 },
      { label: 'mutes', data: sum.monthly.map(m => m.mutes), backgroundColor: '#a0a0ff', borderRadius: 3 }
    ]);
    renderChart('cModPie', 'doughnut', ['bans', 'kicks', 'mutes', 'warns'], [
      { data: [sum.counts.ban, sum.counts.kick, sum.counts.mute, sum.counts.warn], backgroundColor: ['#ff5f5f', '#ffdf5f', '#a0a0ff', '#9fff5f'], borderColor: '#0a0a0a', borderWidth: 3 }
    ], { cutout: '60%', noScales: true });

    const actions = await api('/api/mod/actions?limit=30');
    const tbody = document.querySelector('#page-mod .vtable tbody');
    if (tbody) tbody.innerHTML = actions.map(a => `
      <tr><td>${formatTime(a.created_at)}</td>
      <td class="hi">${escapeHtml(a.moderator_tag || 'bot')}</td>
      <td>${escapeHtml(a.target_tag || a.target_id)}</td>
      <td><span class="badge ${a.action === 'ban' ? 'ban' : a.action === 'kick' ? 'kick' : a.action === 'mute' ? 'mute' : 'warn'}">${a.action}</span></td>
      <td>${escapeHtml(a.reason || '—')}</td></tr>
    `).join('') || emptyRow(5, '🛡️', 'Nenhuma ação de moderação registrada. Bans, kicks e mutes vão aparecer aqui.');
  } catch (e) { console.warn('mod', e.message); }
}

// ---------- VENDAS ----------
async function loadVendas() {
  try {
    const sum = await api('/api/sales/summary');
    setText('v-revenue', 'R$' + formatNum(Math.round(sum.month_revenue_cents / 100)));
    setText('v-profit', 'R$' + formatNum(Math.round(sum.month_profit_cents / 100)));
    setText('v-today', sum.today_count);
    setText('v-avg', 'R$' + (sum.avg_ticket_cents / 100).toFixed(2).replace('.', ','));
    setText('v-top', sum.top_product);
    if (sum.month_revenue_cents > 0) {
      const margin = Math.round(sum.month_profit_cents / sum.month_revenue_cents * 100);
      setText('v-margin', `${margin}% de margem`);
    }

    renderChart('cVendasF', 'bar', last6MonthLabels(), [
      { data: sum.monthly_revenue, backgroundColor: 'rgba(255,255,255,0.85)', borderColor: '#fff', borderWidth: 1, borderRadius: 4 }
    ], { y: { ticks: { callback: v => 'R$' + Math.round(v / 1000) + 'k' } } });

    const shades = ['#fff', '#aaa', '#555', '#222'];
    renderChart('cProd', 'doughnut', sum.by_product.map(b => b.name), [
      { data: sum.by_product.map(b => b.c), backgroundColor: shades, borderColor: '#0a0a0a', borderWidth: 3 }
    ], { cutout: '60%', noScales: true });

    const txs = await api('/api/sales?limit=50');
    const tbody = document.getElementById('vendas-tbody');
    if (tbody) tbody.innerHTML = txs.length ? txs.map(t => {
      const cls = t.status === 'paid' ? 'gr' : '';
      const badge = t.status === 'paid'
        ? `<span class="badge" style="background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a">pago</span>`
        : t.status === 'pending'
        ? `<span class="badge kick">pendente</span>`
        : `<span class="badge ban">${t.status}</span>`;
      const actions = [];
      if (t.status === 'paid') actions.push(`<button class="btn-sm del" onclick="refundSale(${t.id})">reembolsar</button>`);
      if (t.product_id) actions.push(`<button class="btn-sm pub" onclick="quickAddStock(${t.product_id})">+ estoque</button>`);
      const fs = t.fraud_score || 0;
      const fraudBadge = fs >= 80 ? `<span style="color:#ef4444;font-size:10px;font-family:'IBM Plex Mono',monospace;" title="fraud score ${fs}">⚠ ${fs}</span>` :
        fs >= 60 ? `<span style="color:#f5c542;font-size:10px;font-family:'IBM Plex Mono',monospace;" title="fraud score ${fs}">⚠ ${fs}</span>` : '';
      return `<tr><td>${formatTime(t.created_at)}</td>
        <td class="hi">${escapeHtml(t.discord_tag || t.discord_id)} ${fraudBadge}</td>
        <td>${escapeHtml(t.product_name || '—')}</td>
        <td class="${cls}">R$${(t.amount_cents / 100).toFixed(2).replace('.', ',')}</td>
        <td>${badge}</td>
        <td>${actions.join(' ')}</td></tr>`;
    }).join('') : emptyRow(6, '💸', 'Nenhuma venda ainda. Crie um produto e divulgue sua loja para começar.', 'ver produtos', "sp('produtos',document.querySelector('[data-page=produtos]'))");
  } catch (e) { console.warn('vendas', e.message); }
}

// ---------- PRODUTOS ----------
async function loadProdutos() {
  try {
    produtos = await api('/api/products');
    document.getElementById('prod-count').textContent = produtos.filter(p => p.active).length;
    const list = document.getElementById('prod-list');
    list.innerHTML = produtos.length
      ? produtos.map(p => productCard(p)).join('')
      : `<div style="grid-column:1/-1;">${emptyBlock('🛍️', 'Nenhum produto cadastrado. Crie seu primeiro produto para começar a vender.', '+ novo produto', "toggleForm('prod-form')")}</div>`;
    populateProdSelect();
    populateCategorySelect();
  } catch (e) { console.warn('produtos', e.message); }
}

async function populateCategorySelect() {
  try {
    const cats = await api('/api/categories');
    const sel = document.getElementById('pcategory');
    if (sel) {
      sel.innerHTML = '<option value="">sem categoria</option>' +
        cats.map(c => `<option value="${c.id}">${escapeHtml((c.icon ? c.icon + ' ' : '') + c.name)}</option>`).join('');
    }
  } catch {}
}

function productCard(p) {
  const price = 'R$ ' + (p.price_cents / 100).toFixed(2).replace('.', ',');
  const durMap = { permanent: 'permanente', '30d': '30 dias', '7d': '7 dias', '1d': '1 dia', '1y': 'anual' };
  const dur = durMap[p.duration] || p.duration;
  const thumb = p.image_url
    ? `<div class="prod-thumb" style="background:#000 url(${escapeAttr(p.image_url)}) center/cover;"></div>`
    : `<div class="prod-thumb"></div>`;
  return `<div class="prod-card" data-id="${p.id}">
    ${thumb}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <div class="prod-name">${escapeHtml(p.name)}</div>
      <span class="status-pill ${p.active ? 'status-ativo' : 'status-inativo'}">${p.active ? 'ativo' : 'inativo'}</span>
    </div>
    <div class="prod-price">${price} <span style="font-size:10px;color:#444;font-family:'IBM Plex Mono',monospace;">/ ${dur}</span></div>
    <div class="prod-desc">${escapeHtml(p.description || 'Sem descricao.')}</div>
    <div class="prod-footer"><span class="prod-sales">${p.sales_count || 0} vendas</span></div>
    <div class="prod-actions">
      <button class="btn-sm" onclick="editProduto(${p.id})">editar</button>
      <button class="btn-sm pub" onclick="postarNoDiscord(${p.id})">publicar</button>
      <button class="btn-sm" onclick="anunciarProd(${p.id})">anunciar</button>
      <button class="btn-sm del" onclick="removerProd(${p.id})">${p.active ? 'desativar' : 'reativar'}</button>
    </div>
  </div>`;
}

async function addProduto() {
  const name = document.getElementById('pnome').value.trim();
  const price = document.getElementById('ppreco').value.trim();
  const description = document.getElementById('pdesc').value.trim();
  const duration = document.getElementById('pdur').value;
  const role_id = document.getElementById('pcargo').value.trim();
  const image_url = document.getElementById('pimg').value.trim();
  const stock = document.getElementById('pstock').value;
  const cost = document.getElementById('pcost').value;
  const accent_color = document.getElementById('pcolor').value;
  const category_id = document.getElementById('pcategory').value || null;
  const delivery_type = document.getElementById('pdelivery').value;
  const hook_url = document.getElementById('phook').value.trim() || null;
  if (!name || !price) return toast('Preencha nome e preco.', 'warn');
  try {
    await api('/api/products', { method: 'POST', body: JSON.stringify({ name, price, cost, description, duration, role_id, image_url, stock, accent_color, category_id, delivery_type, hook_url }) });
    ['pnome', 'ppreco', 'pdesc', 'pcargo', 'pimg', 'pstock', 'pcost', 'phook'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('pcolor').value = '#5865f2';
    document.getElementById('pcategory').value = '';
    document.getElementById('pdelivery').value = 'automatic';
    toggleForm('prod-form');
    loadProdutos();
    toast('Produto criado.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function postarNoDiscord(productId) {
  const channel = prompt('Em qual canal publicar o produto? (sem #)', 'loja');
  if (!channel) return;
  try {
    const r = await api('/api/products/' + productId + '/post-discord', { method: 'POST', body: JSON.stringify({ channel_name: channel }) });
    toast(r.edited ? 'Embed atualizado no Discord!' : 'Embed publicado no Discord!', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function editProduto(id) {
  const p = produtos.find(x => x.id === id);
  if (!p) return;
  openModal(`
    <div class="modal-title">editar produto<button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="fgroup"><div class="flabel">nome</div><input class="inp" id="ep-name" value="${escapeAttr(p.name)}"></div>
    <div class="fgroup"><div class="flabel">preço (R$)</div><input class="inp" id="ep-price" type="number" step="0.01" value="${(p.price_cents / 100).toFixed(2)}"></div>
    <div class="fgroup"><div class="flabel">descrição</div><textarea class="inp" id="ep-desc">${escapeHtml(p.description || '')}</textarea></div>
    <div class="fgroup"><div class="flabel">cargo (role_id)</div><input class="inp" id="ep-role" value="${escapeAttr(p.role_id || '')}"></div>
    <div class="frow">
      <div class="fgroup"><div class="flabel">custo (R$)</div><input class="inp" id="ep-cost" type="number" step="0.01" min="0" value="${p.cost_cents != null ? (p.cost_cents/100).toFixed(2) : ''}"></div>
      <div class="fgroup"><div class="flabel">duração</div>
        <select class="inp" id="ep-dur">
          ${['permanent', '1d', '7d', '30d', '1y'].map(d => `<option value="${d}" ${p.duration === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="frow">
      <div class="fgroup"><div class="flabel">estoque (vazio = ilimitado)</div><input class="inp" id="ep-stock" type="number" min="0" value="${p.stock ?? ''}"></div>
      <div class="fgroup"><div class="flabel">cor de destaque</div><input class="inp" id="ep-color" type="color" value="${p.accent_color || '#5865f2'}" style="height:38px;padding:4px;cursor:pointer;"></div>
    </div>
    <div class="frow">
      <div class="fgroup"><div class="flabel">status</div>
        <select class="inp" id="ep-active">
          <option value="1" ${p.active ? 'selected' : ''}>ativo</option>
          <option value="0" ${!p.active ? 'selected' : ''}>inativo</option>
        </select>
      </div>
      <div class="fgroup"><div class="flabel">URL da imagem</div><input class="inp" id="ep-img" value="${escapeAttr(p.image_url || '')}"></div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
      <button class="btn-g" onclick="closeModal()">cancelar</button>
      <button class="btn-w" onclick="saveProduto(${id})">salvar</button>
    </div>
  `);
}

async function saveProduto(id) {
  const stockVal = document.getElementById('ep-stock').value;
  const payload = {
    name: document.getElementById('ep-name').value.trim(),
    price: document.getElementById('ep-price').value,
    cost: document.getElementById('ep-cost').value,
    description: document.getElementById('ep-desc').value.trim(),
    role_id: document.getElementById('ep-role').value.trim() || null,
    duration: document.getElementById('ep-dur').value,
    image_url: document.getElementById('ep-img').value.trim() || null,
    stock: stockVal === '' ? null : parseInt(stockVal),
    accent_color: document.getElementById('ep-color').value,
    active: document.getElementById('ep-active').value === '1'
  };
  try {
    await api('/api/products/' + id, { method: 'PUT', body: JSON.stringify(payload) });
    closeModal();
    loadProdutos();
    toast('Produto atualizado.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function quickAddStock(productId) {
  const p = produtos.find(x => x.id === productId);
  if (!p) return;
  const qty = prompt('Quantas unidades adicionar ao estoque de ' + p.name + '?', '10');
  if (!qty) return;
  const n = parseInt(qty);
  if (!(n > 0)) return toast('Quantidade invalida.', 'err');
  const newStock = (p.stock || 0) + n;
  try {
    await api('/api/products/' + productId, { method: 'PUT', body: JSON.stringify({ stock: newStock }) });
    toast(`+${n} ao estoque de ${p.name}.`, 'ok');
    loadProdutos();
    if (document.getElementById('page-vendas').classList.contains('show')) loadVendas();
  } catch (e) { toast(e.message, 'err'); }
}

async function removerProd(id) {
  if (!await confirmAsync('Desativar este produto? Ele some da loja mas o histórico fica.')) return;
  try { await api('/api/products/' + id, { method: 'DELETE' }); loadProdutos(); toast('Produto desativado.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------- ANUNCIOS ----------
async function loadCanais() {
  try {
    canalDisponivel = await api('/api/config/channels');
    const chips = document.getElementById('canal-chips');
    if (!chips) return;
    chips.innerHTML = canalDisponivel.slice(0, 8).map((c, i) => `
      <div class="canal-chip ${i === 0 ? 'sel' : ''}" onclick="toggleCanal(this)">#${escapeHtml(c.name)}</div>
    `).join('');
  } catch (e) { /* sem bot conectado */ }
}

function populateProdSelect() {
  const sel = document.getElementById('prod-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">selecione um produto...</option>' +
    produtos.filter(p => p.active).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

async function enviarAnuncio() {
  const body = document.getElementById('anuncio-texto').value.trim();
  const channels = [...document.querySelectorAll('.canal-chip.sel')].map(c => c.textContent);
  const kind = document.getElementById('anuncio-tipo').value;
  if (!body) return toast('Digite uma mensagem.', 'warn');
  if (!channels.length) return toast('Selecione pelo menos um canal.', 'warn');

  const payload = { channels, body, kind };
  if (kind === 'embed') {
    payload.embed_title = document.getElementById('embed-titulo').value;
    payload.embed_color = document.getElementById('embed-cor').value;
  } else if (kind === 'produto') {
    payload.product_id = parseInt(document.getElementById('prod-select').value) || null;
  }
  try {
    await api('/api/announcements', { method: 'POST', body: JSON.stringify(payload) });
    document.getElementById('anuncio-texto').value = '';
    loadAnuncios();
    toast('Anuncio enviado.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function agendarAnuncio() {
  const body = document.getElementById('anuncio-texto').value.trim();
  const channels = [...document.querySelectorAll('.canal-chip.sel')].map(c => c.textContent);
  if (!body) return toast('Digite uma mensagem.', 'warn');
  if (!channels.length) return toast('Selecione pelo menos um canal.', 'warn');
  const when = prompt('Quando enviar? (formato AAAA-MM-DD HH:MM)');
  if (!when) return;
  const ts = Math.floor(new Date(when.replace(' ', 'T')).getTime() / 1000);
  if (!ts) return toast('Data invalida.', 'warn');
  try {
    await api('/api/announcements', {
      method: 'POST',
      body: JSON.stringify({
        channels, body,
        kind: document.getElementById('anuncio-tipo').value,
        embed_title: document.getElementById('embed-titulo')?.value,
        embed_color: document.getElementById('embed-cor')?.value,
        scheduled_for: ts
      })
    });
    loadAnuncios();
  } catch (e) { toast(e.message, 'err'); }
}

async function loadAnuncios() {
  try {
    const [sent, sched] = await Promise.all([
      api('/api/announcements'),
      api('/api/announcements/scheduled')
    ]);
    const hist = document.getElementById('anuncio-hist');
    const real = sent.filter(a => a.status === 'sent').slice(0, 10);
    hist.innerHTML = real.map(a => `
      <div class="anuncio-card">
        <div class="anuncio-header"><span class="anuncio-canal">${escapeHtml(a.channels)}</span>
        <span class="anuncio-hora">${formatDate(a.sent_at)}</span></div>
        <div class="anuncio-body">${escapeHtml(a.body)}</div>
        <div class="anuncio-footer"><span class="anuncio-status up">● enviado</span></div>
      </div>
    `).join('') || emptyBlock('📢', 'Nenhum anúncio enviado ainda. Crie sua primeira campanha acima.');
    document.getElementById('hist-count').textContent = real.length + ' registros';

    const list = document.getElementById('sched-list');
    if (sched.length === 0) {
      list.innerHTML = 'nenhum agendamento ativo.';
    } else {
      list.innerHTML = sched.map(a => `
        <div style="padding:8px 10px;background:#0a0a0a;border-radius:5px;border:1px solid #1a1a1a;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
          <div><span style="color:#fff">${formatDate(a.scheduled_for)}</span>
          <span style="color:#444"> → </span><span style="color:#aaa">${escapeHtml(a.channels)}</span>
          <div style="color:#555;font-size:10px;margin-top:2px;">${escapeHtml(a.body.substring(0, 60))}${a.body.length > 60 ? '...' : ''}</div></div>
          <button class="btn-sm del" onclick="cancelarAgendamento(${a.id})">cancelar</button>
        </div>
      `).join('');
    }
    document.getElementById('sched-count').textContent = sched.length + ' pendentes';
  } catch (e) { console.warn('anuncios', e.message); }
}

async function cancelarAgendamento(id) {
  if (!await confirmAsync('Cancelar este agendamento?')) return;
  await api('/api/announcements/' + id, { method: 'DELETE' });
  loadAnuncios();
  toast('Agendamento cancelado.', 'ok');
}

// ---------- CONFIG ----------
async function loadConfig() {
  try {
    const cfg = await api('/api/config');
    document.querySelectorAll('#page-config input').forEach(inp => {
      const labelEl = inp.closest('.cfgitem')?.querySelector('.cfgtxt');
      if (!labelEl) return;
      const k = configKeyFromLabel(labelEl.textContent);
      if (k && cfg[k] != null) inp.value = cfg[k];
    });
    document.querySelectorAll('#page-config .toggle').forEach(t => {
      const labelEl = t.closest('.cfgitem')?.querySelector('.cfgtxt');
      const k = configKeyFromLabel(labelEl?.textContent || '');
      if (k && cfg[k] != null) t.classList.toggle('on', cfg[k] === '1');
    });
    const wm = document.getElementById('welcome-msg');
    if (wm && cfg.welcome_message != null) wm.value = cfg.welcome_message;
    const extras = { 'forbidden-words': 'forbidden_words', 'link-allowlist': 'link_allowlist', 'rules-text': 'rules_text', 'webhook-url': 'webhook_url', 'daily-hour': 'daily_report_hour', 'fee-percent': 'fee_percent', 'fee-fixed': 'fee_fixed_cents', 'invite-channel': 'invite_join_channel', 'invite-join-msg': 'invite_join_message', 'invite-leave-msg': 'invite_leave_message', 'currency-code': 'currency_code', 'locale': 'locale', 'payment-gateway': 'payment_gateway' };
    for (const [id, k] of Object.entries(extras)) {
      const el = document.getElementById(id);
      if (el && cfg[k] != null) el.value = cfg[k];
    }
    // Tipos de ticket: JSON <-> textarea (uma linha por tipo)
    const tt = document.getElementById('ticket-types-text');
    if (tt && cfg.ticket_types) {
      try {
        const arr = JSON.parse(cfg.ticket_types);
        tt.value = arr.map(t => `${t.name} | ${t.role_id || ''} | ${t.description || ''}`).join('\n');
      } catch { tt.value = ''; }
    }
  } catch (e) { console.warn('config', e.message); }
}

async function saveConfig() {
  const payload = {};
  document.querySelectorAll('#page-config input').forEach(inp => {
    const k = configKeyFromLabel(inp.closest('.cfgitem')?.querySelector('.cfgtxt')?.textContent || '');
    if (k) payload[k] = inp.value;
  });
  document.querySelectorAll('#page-config .toggle').forEach(t => {
    const k = configKeyFromLabel(t.closest('.cfgitem')?.querySelector('.cfgtxt')?.textContent || '');
    if (k) payload[k] = t.classList.contains('on') ? '1' : '0';
  });
  const wm = document.getElementById('welcome-msg');
  if (wm) payload.welcome_message = wm.value;
  const extras = { 'forbidden-words': 'forbidden_words', 'link-allowlist': 'link_allowlist', 'rules-text': 'rules_text', 'webhook-url': 'webhook_url', 'daily-hour': 'daily_report_hour', 'fee-percent': 'fee_percent', 'fee-fixed': 'fee_fixed_cents', 'invite-channel': 'invite_join_channel', 'invite-join-msg': 'invite_join_message', 'invite-leave-msg': 'invite_leave_message', 'currency-code': 'currency_code', 'locale': 'locale', 'payment-gateway': 'payment_gateway' };
  for (const [id, k] of Object.entries(extras)) {
    const el = document.getElementById(id);
    if (el) payload[k] = el.value;
  }
  const tt = document.getElementById('ticket-types-text');
  if (tt) {
    const arr = tt.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [name, role_id, ...descParts] = l.split('|').map(s => s.trim());
      return { name, role_id: role_id || null, description: descParts.join(' | ') || '' };
    }).filter(t => t.name);
    payload.ticket_types = JSON.stringify(arr);
  }
  try { await api('/api/config', { method: 'PUT', body: JSON.stringify(payload) }); toast('Configuracao salva.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

function configKeyFromLabel(label) {
  const m = {
    'prefixo de comandos': 'prefix',
    'nome do bot': 'bot_name',
    'log de eventos ativo': 'log_events',
    'auto-moderação': 'auto_mod',
    'modo manutenção': 'maintenance',
    'canal de logs': 'logs_channel',
    'canal de boas-vindas': 'welcome_channel',
    'canal de vendas': 'sales_channel',
    'canal de moderação': 'mod_channel',
    'anti-spam': 'anti_spam',
    'anti-flood': 'anti_flood',
    'filtro de links': 'filter_links',
    'filtro de palavrões': 'filter_words',
    'alertas de ban': 'alert_bans',
    'alertas de venda': 'alert_sales',
    'relatório diário': 'daily_report',
    'DM ao comprador': 'dm_purchase',
    'DM ao admin a cada venda': 'dm_admin_on_sale',
    'anúncio automático de reposição': 'restock_announce',
    'repassar taxa do Stripe ao cliente': 'pass_fees_to_customer',
    'habilitar rastreamento': 'invite_tracker_enabled'
  };
  return m[label.trim()] || null;
}

// ---------- NAVEGACAO + UTILS ----------
const PAGE_META = {
  geral: ['Visão geral', 'resumo em tempo real do seu servidor'],
  membros: ['Membros', 'crescimento, lista e detalhes'],
  logs: ['Logs', 'todos os eventos do bot e do servidor'],
  mod: ['Moderação', 'bans, kicks, mutes e auto-mod'],
  vendas: ['Vendas', 'transações, receita e relatórios'],
  produtos: ['Produtos', 'gerencie seu catálogo'],
  clientes: ['Clientes', 'compradores agregados e LTV'],
  cupons: ['Cupons', 'descontos para a loja'],
  categorias: ['Categorias', 'organize seu catálogo por seção'],
  afiliados: ['Afiliados', 'sistema de indicações com comissão'],
  anuncios: ['Anúncios', 'envie e agende mensagens'],
  autoreply: ['Auto-respostas', 'gatilhos automáticos do bot'],
  sorteios: ['Sorteios', 'crie giveaways no Discord'],
  invites: ['Invite Tracker', 'quem trouxe quem para o servidor'],
  auditoria: ['Auditoria', 'log de todas ações administrativas'],
  credenciais: ['Credenciais', 'tokens e chaves API — encriptadas no banco'],
  equipe: ['Equipe', 'usuários com acesso ao painel'],
  plano: ['Plano', 'sua assinatura e limites de uso'],
  trial: ['Trial Gratuito', '24 horas com tudo liberado'],
  'configurar-bot': ['Configurar Bot', 'token, códigos e transferência de posse'],
  'canais-config': ['Canais', 'configure canais para logs e notificações'],
  'cargos-config': ['Cargos', 'cargos para administração e membros'],
  boasvindas: ['Boas-vindas', 'mensagens de entrada e saída'],
  carteira: ['Carteira', 'saldo, saques e estatísticas'],
  'invite-tracker': ['Rastreamento de Convites', 'mensagens e cargos por meta'],
  config: ['Configurações', 'preferências do bot e canais']
};

function sp(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('show');
  el.classList.add('active');
  const meta = PAGE_META[id];
  if (meta) {
    document.getElementById('page-title').textContent = meta[0];
    document.getElementById('page-sub').textContent = meta[1];
  }
  // breadcrumb update
  const pg = document.getElementById('crumb-page');
  if (pg) pg.textContent = (meta?.[0] || id).toLowerCase();
  document.getElementById('sidebar')?.classList.remove('open');

  // Garante que o grupo do item ativo esteja aberto
  const groupItems = el.closest('.nav-group-items');
  if (groupItems && groupItems.classList.contains('collapsed')) {
    const groupName = groupItems.dataset.group;
    const header = document.querySelector(`.nav-group[data-toggle="${groupName}"]`);
    if (header) toggleGroup(header);
  }
  if (id === 'geral') loadOverview();
  if (id === 'membros') loadMembros();
  if (id === 'logs') loadLogs();
  if (id === 'mod') loadMod();
  if (id === 'vendas') loadVendas();
  if (id === 'produtos') loadProdutos();
  if (id === 'clientes') loadClientes();
  if (id === 'cupons') loadCupons();
  if (id === 'autoreply') loadAutoReplies();
  if (id === 'anuncios') { populateProdSelect(); loadAnuncios(); }
  if (id === 'categorias') loadCategorias();
  if (id === 'afiliados') loadAfiliados();
  if (id === 'sorteios') loadSorteios();
  if (id === 'invites') loadInvites();
  if (id === 'auditoria') loadAuditoria();
  if (id === 'credenciais') loadCredenciais();
  if (id === 'equipe') loadEquipe();
  if (id === 'plano') loadPlano();
  if (id === 'config') loadConfig();
}

function toggleForm(id) {
  const el = document.getElementById(id);
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function anunciarProd(id) {
  const p = produtos.find(x => x.id === id);
  if (!p) return;
  sp('anuncios', document.querySelector('.nav .ni:nth-child(7)'));
  document.getElementById('anuncio-tipo').value = 'produto';
  setTimeout(() => {
    populateProdSelect();
    document.getElementById('prod-select').value = String(p.id);
    const price = 'R$ ' + (p.price_cents / 100).toFixed(2).replace('.', ',');
    document.getElementById('anuncio-texto').value = `Produto disponivel: ${p.name} por ${price}!\nAcesse a loja em ${location.origin}/loja.html`;
    updatePreview();
  }, 80);
}

function toggleCanal(el) { el.classList.toggle('sel'); updatePreview(); }

function addCanalCustom(e) {
  if (e.key !== 'Enter') return;
  let val = e.target.value.trim(); if (!val) return;
  if (!val.startsWith('#')) val = '#' + val;
  const chip = document.createElement('div');
  chip.className = 'canal-chip sel'; chip.textContent = val;
  chip.onclick = () => toggleCanal(chip);
  document.getElementById('canal-chips').appendChild(chip);
  e.target.value = ''; updatePreview();
}

function updatePreview() {
  const tipo = document.getElementById('anuncio-tipo').value;
  const texto = document.getElementById('anuncio-texto').value || 'sua mensagem vai aparecer aqui...';
  const canais = [...document.querySelectorAll('.canal-chip.sel')].map(c => c.textContent).join(', ') || '#geral';
  document.querySelector('.preview-label').textContent = 'discord — ' + canais;
  document.getElementById('preview-msg').textContent = texto;
  const emb = document.getElementById('preview-embed');
  document.getElementById('embed-fields').style.display = tipo === 'embed' ? 'block' : 'none';
  document.getElementById('produto-field').style.display = tipo === 'produto' ? 'block' : 'none';
  if (tipo === 'embed') {
    const titulo = document.getElementById('embed-titulo').value || 'Título do Embed';
    const cor = document.getElementById('embed-cor').value;
    emb.innerHTML = `<div class="embed-box" style="border-left-color:${cor}"><div class="embed-title">${escapeHtml(titulo)}</div><div class="embed-desc">${escapeHtml(texto)}</div></div>`;
    document.getElementById('preview-msg').textContent = '';
  } else if (tipo === 'produto') {
    const idx = document.getElementById('prod-select').value;
    const p = produtos.find(x => String(x.id) === idx);
    if (p) {
      const price = 'R$ ' + (p.price_cents / 100).toFixed(2).replace('.', ',');
      emb.innerHTML = `<div class="embed-box"><div class="embed-title">${escapeHtml(p.name)}</div><div class="embed-desc">${escapeHtml(p.description || '')}</div><div class="embed-price">${price}</div></div>`;
    } else { emb.innerHTML = ''; }
  } else { emb.innerHTML = ''; }
}

// ---------- CHART HELPERS ----------
const gc = () => ({
  x: { ticks: { color: '#333', font: { family: "'IBM Plex Mono'", size: 10 }, maxRotation: 0 }, grid: { color: '#161616' }, border: { color: '#1a1a1a' } },
  y: { ticks: { color: '#333', font: { family: "'IBM Plex Mono'", size: 10 } }, grid: { color: '#161616' }, border: { color: '#1a1a1a' } }
});

function renderChart(id, type, labels, datasets, opts = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  if (charts[id]) charts[id].destroy();

  const hasData = datasets.some(d => d.data && d.data.some(v => v));
  if (!hasData) {
    el.parentElement.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#333;font-family:'IBM Plex Mono',monospace;font-size:11px;gap:6px;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      <span>sem dados ainda</span>
    </div>`;
    return;
  }

  if (type === 'line') {
    datasets = datasets.map(d => ({
      pointRadius: 2, pointBackgroundColor: d.borderColor || '#fff',
      pointHoverRadius: 5, tension: 0.4, fill: true, borderWidth: 2, ...d
    }));
  }

  const scales = opts.noScales ? {} : { ...gc(), ...(opts.y ? { y: { ...gc().y, ...opts.y } } : {}) };
  charts[id] = new Chart(el, {
    type, data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111', borderColor: '#2a2a2a', borderWidth: 1,
          titleColor: '#fff', bodyColor: '#aaa', padding: 10, cornerRadius: 6,
          titleFont: { family: "'IBM Plex Mono'", size: 10 },
          bodyFont: { family: "'IBM Plex Mono'", size: 11 }
        }
      },
      scales: opts.noScales ? {} : scales,
      cutout: opts.cutout,
      interaction: { mode: 'index', intersect: false }
    }
  });
}

// ---------- UTILS ----------
function setMetric(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function formatNum(n) { return new Intl.NumberFormat('pt-BR').format(n || 0); }
function formatTime(ts) { return new Date(ts * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function formatDate(ts) { return new Date(ts * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
  return `há ${Math.floor(s / 86400)}d`;
}
function dotClass(type) {
  return ({ entrada: 'ok', cmd: 'inf', ban: 'err', kick: 'err', mute: 'wrn', warn: 'wrn', venda: 'ok', erro: 'err', anuncio: 'inf' })[type] || 'inf';
}
function typeBadge(type) {
  const styles = {
    entrada: 'background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a',
    saida: 'background:#1f0a0a;color:#ff5f5f;border:1px solid #3a1010',
    cmd: 'background:#1a1a1a;color:#fff;border:1px solid #333',
    ban: 'background:#1f0a0a;color:#ff5f5f;border:1px solid #3a1010',
    kick: 'background:#1f1600;color:#ffdf5f;border:1px solid #3a2800',
    mute: 'background:#0a0a1f;color:#a0a0ff;border:1px solid #1a1a3a',
    warn: 'background:#0a1500;color:#9fff5f;border:1px solid #1a3000',
    venda: 'background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a',
    anuncio: 'background:#1a1900;color:#ffdf5f;border:1px solid #3a3000',
    erro: 'background:#1f0a0a;color:#ff5f5f;border:1px solid #3a1010'
  };
  return `<span class="badge" style="${styles[type] || styles.cmd}">${type}</span>`;
}
function last14Labels() {
  const out = []; const now = new Date();
  for (let i = 13; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); out.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })); }
  return out;
}
function last6MonthLabels() {
  const out = []; const now = new Date();
  for (let i = 5; i >= 0; i--) { const d = new Date(now); d.setMonth(d.getMonth() - i); out.push(d.toLocaleDateString('pt-BR', { month: 'short' })); }
  return out;
}

// ---------- CLIENTES ----------
async function loadClientes() {
  try {
    const [sum, list] = await Promise.all([
      api('/api/customers/_/summary'),
      api('/api/customers?limit=200')
    ]);
    setText('cli-total', formatNum(sum.total_customers));
    setText('cli-new', formatNum(sum.new_today));
    setText('cli-ltv', 'R$' + (sum.avg_ltv_cents / 100).toFixed(2).replace('.', ','));
    setText('cli-top', list[0]?.discord_tag || list[0]?.discord_id || '—');
    setText('cli-count', list.length + ' registros');

    const tbody = document.getElementById('cli-tbody');
    tbody.innerHTML = list.length ? list.map(c => `
      <tr>
        <td class="hi">${escapeHtml(c.discord_tag || c.discord_id)}</td>
        <td>${c.paid_count} pagas</td>
        <td class="gr">R$${(c.total_cents / 100).toFixed(2).replace('.', ',')}</td>
        <td>${c.last_purchase_at ? formatDate(c.last_purchase_at) : '—'}</td>
        <td>${c.refunded_count > 0 ? `<span class="badge ban">${c.refunded_count}</span>` : '—'}</td>
        <td><button class="btn-sm" onclick="verCliente('${escapeAttr(c.discord_id)}')">detalhes</button></td>
      </tr>
    `).join('') : emptyRow(6, '👥', 'Ainda sem clientes. Quando alguém comprar pela loja, aparece aqui agregado por Discord.');
  } catch (e) { console.warn('clientes', e.message); }
}

async function verCliente(id) {
  try {
    const list = await api('/api/customers/' + encodeURIComponent(id));
    const rows = list.length ? list.map(s => `
      <tr>
        <td style="font-size:10px;color:#666;">${new Date(s.created_at * 1000).toLocaleString('pt-BR')}</td>
        <td>${escapeHtml(s.product_name || '—')}</td>
        <td class="gr">R$${(s.amount_cents / 100).toFixed(2).replace('.', ',')}</td>
        <td>${s.status}</td>
      </tr>`).join('') : '<tr><td colspan="4" style="color:#444">sem compras.</td></tr>';
    openModal(`
      <div class="modal-title">cliente ${escapeHtml(id)}<button class="modal-close" onclick="closeModal()">×</button></div>
      <table class="vtable"><thead><tr><th>data</th><th>produto</th><th>valor</th><th>status</th></tr></thead>
      <tbody>${rows}</tbody></table>
    `);
  } catch (e) { toast(e.message, 'err'); }
}

async function refundSale(id) {
  if (!await confirmAsync('Reembolsar esta venda? Isso vai cancelar no Stripe e remover o cargo do comprador.')) return;
  try {
    await api('/api/sales/' + id + '/refund', { method: 'POST' });
    toast('Reembolso processado.', 'ok');
    loadVendas();
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- CUPONS ----------
async function loadCupons() {
  try {
    const list = await api('/api/coupons');
    document.getElementById('cup-count').textContent = list.filter(c => c.active).length;
    const tbody = document.getElementById('cup-tbody');
    tbody.innerHTML = list.length ? list.map(c => `
      <tr>
        <td class="hi" style="font-family:'IBM Plex Mono',monospace;">${escapeHtml(c.code)}</td>
        <td class="gr">-${c.discount_percent}%</td>
        <td>${c.uses}</td>
        <td>${c.max_uses ?? '∞'}</td>
        <td>${c.min_amount_cents ? 'R$ ' + (c.min_amount_cents / 100).toFixed(2).replace('.', ',') : '—'}</td>
        <td>${c.expires_at ? formatDate(c.expires_at) : 'sem expiração'}</td>
        <td>${c.active ? '<span class="badge" style="background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a">ativo</span>' : '<span class="badge" style="background:#1a1a1a;color:#666;border:1px solid #2a2a2a">inativo</span>'}</td>
        <td>${c.active ? `<button class="btn-sm del" onclick="removerCupom(${c.id})">desativar</button>` : ''}</td>
      </tr>
    `).join('') : emptyRow(8, '🎟️', 'Nenhum cupom cadastrado. Crie códigos de desconto para promover sua loja.', '+ novo cupom', "toggleForm('cup-form')");
  } catch (e) { console.warn('cupons', e.message); }
}

async function addCupom() {
  const code = document.getElementById('cup-code').value.trim();
  const discount_percent = document.getElementById('cup-pct').value.trim();
  const max_uses = document.getElementById('cup-max').value.trim() || null;
  const min_amount = document.getElementById('cup-min').value.trim() || null;
  const required_role_id = document.getElementById('cup-role').value.trim() || null;
  const min_quantity = document.getElementById('cup-qmin').value.trim() || null;
  const max_quantity = document.getElementById('cup-qmax').value.trim() || null;
  const expVal = document.getElementById('cup-exp').value;
  const expires_at = expVal ? Math.floor(new Date(expVal).getTime() / 1000) : null;
  if (!code || !discount_percent) return toast('Preencha código e desconto.', 'warn');
  try {
    await api('/api/coupons', { method: 'POST', body: JSON.stringify({ code, discount_percent, max_uses, min_amount, required_role_id, min_quantity, max_quantity, expires_at }) });
    ['cup-code', 'cup-pct', 'cup-max', 'cup-min', 'cup-exp', 'cup-role', 'cup-qmin', 'cup-qmax'].forEach(id => document.getElementById(id).value = '');
    toggleForm('cup-form');
    loadCupons();
    toast('Cupom criado.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function removerCupom(id) {
  if (!await confirmAsync('Desativar este cupom?')) return;
  try { await api('/api/coupons/' + id, { method: 'DELETE' }); loadCupons(); toast('Cupom desativado.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------- AUTO-RESPOSTAS ----------
async function loadAutoReplies() {
  try {
    const list = await api('/api/auto-replies');
    document.getElementById('ar-count').textContent = list.filter(a => a.active).length;
    const tbody = document.getElementById('ar-tbody');
    const matchLabel = { contains: 'contém', equals: 'exata', starts_with: 'começa' };
    tbody.innerHTML = list.length ? list.map(a => `
      <tr>
        <td class="hi" style="font-family:'IBM Plex Mono',monospace;">${escapeHtml(a.trigger)}</td>
        <td>${matchLabel[a.match_type] || a.match_type}</td>
        <td style="white-space:pre-wrap;color:#888;">${escapeHtml(a.response.substring(0, 120))}${a.response.length > 120 ? '...' : ''}</td>
        <td>${a.uses}</td>
        <td><div class="toggle ${a.active ? 'on' : ''}" onclick="toggleAutoReply(${a.id}, this)" style="display:inline-block;"></div></td>
        <td><button class="btn-sm del" onclick="removerAutoReply(${a.id})">remover</button></td>
      </tr>
    `).join('') : emptyRow(6, '💬', 'Nenhuma auto-resposta cadastrada. O bot pode responder automaticamente quando alguém digitar palavras-chave.', '+ nova auto-resposta', "toggleForm('ar-form')");
  } catch (e) { console.warn('autoreply', e.message); }
}

async function addAutoReply() {
  const trigger = document.getElementById('ar-trigger').value.trim();
  const match_type = document.getElementById('ar-match').value;
  const response = document.getElementById('ar-response').value.trim();
  if (!trigger || !response) return toast('Preencha gatilho e resposta.', 'warn');
  try {
    await api('/api/auto-replies', { method: 'POST', body: JSON.stringify({ trigger, match_type, response }) });
    document.getElementById('ar-trigger').value = '';
    document.getElementById('ar-response').value = '';
    toggleForm('ar-form');
    loadAutoReplies();
  } catch (e) { toast(e.message, 'err'); }
}

async function toggleAutoReply(id, el) {
  const active = !el.classList.contains('on');
  try {
    await api('/api/auto-replies/' + id, { method: 'PUT', body: JSON.stringify({ active }) });
    el.classList.toggle('on', active);
    loadAutoReplies();
  } catch (e) { toast(e.message, 'err'); }
}

async function removerAutoReply(id) {
  if (!await confirmAsync('Remover esta auto-resposta?')) return;
  try { await api('/api/auto-replies/' + id, { method: 'DELETE' }); loadAutoReplies(); toast('Auto-resposta removida.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------- BUSCA GLOBAL ----------
let _searchCache = { products: [], coupons: [], customers: [], at: 0 };
async function refreshSearchCache() {
  if (Date.now() - _searchCache.at < 30000) return;
  try {
    const [products, coupons, customers] = await Promise.all([
      api('/api/products').catch(() => []),
      api('/api/coupons').catch(() => []),
      api('/api/customers').catch(() => [])
    ]);
    _searchCache = { products, coupons, customers, at: Date.now() };
  } catch {}
}

async function globalSearch(q) {
  const box = document.getElementById('gs-results');
  q = q.trim().toLowerCase();
  if (!q) { box.innerHTML = ''; box.style.display = 'none'; return; }
  await refreshSearchCache();
  const hits = [];
  _searchCache.products.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
    .slice(0, 4).forEach(p => hits.push({ kind: 'produto', label: p.name, meta: 'R$ ' + (p.price_cents / 100).toFixed(2).replace('.', ','), goto: () => sp('produtos', document.querySelector('[data-page=produtos]')) }));
  _searchCache.coupons.filter(c => c.code.toLowerCase().includes(q))
    .slice(0, 4).forEach(c => hits.push({ kind: 'cupom', label: c.code, meta: `-${c.discount_percent}%`, goto: () => sp('cupons', document.querySelector('[data-page=cupons]')) }));
  _searchCache.customers.filter(c => (c.discord_tag || c.discord_id || '').toLowerCase().includes(q))
    .slice(0, 4).forEach(c => hits.push({ kind: 'cliente', label: c.discord_tag || c.discord_id, meta: `R$ ${((c.total_cents || 0) / 100).toFixed(2).replace('.', ',')}`, goto: () => verCliente(c.discord_id) }));

  box.innerHTML = hits.length
    ? hits.map((h, i) => `<div class="gs-row" data-i="${i}"><span class="gs-kind">${h.kind}</span>${escapeHtml(h.label)}<span class="gs-meta">${escapeHtml(h.meta)}</span></div>`).join('')
    : '<div class="gs-empty">nada encontrado para "' + escapeHtml(q) + '"</div>';
  box.style.display = 'block';
  window._gsHits = hits;
  box.querySelectorAll('.gs-row').forEach(r => r.onmousedown = e => { e.preventDefault(); hits[r.dataset.i].goto(); document.getElementById('gsearch').value = ''; box.style.display = 'none'; });
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    document.getElementById('gsearch')?.focus();
  }
  if (e.key === 'Escape') {
    closeModal();
    const gs = document.getElementById('gs-results'); if (gs) gs.style.display = 'none';
    document.getElementById('notif-panel')?.classList.remove('show');
  }
});

// ---------- NOTIFICACOES ----------
let _lastSeenLog = parseInt(localStorage.getItem('botdash_last_seen') || '0');

async function pollNotifs() {
  try {
    const logs = await api('/api/logs?limit=10');
    const unseen = logs.filter(l => l.created_at > _lastSeenLog);
    document.getElementById('notif-dot').style.display = unseen.length ? 'block' : 'none';
    const panel = document.getElementById('notif-panel');
    panel.innerHTML = `
      <div class="notif-head">
        <span>notificações${unseen.length ? ` · ${unseen.length}` : ''}</span>
        <button class="btn-sm" onclick="markAllSeen()">marcar lidas</button>
      </div>
      <div class="notif-list">
        ${logs.length ? logs.map(l => `
          <div class="notif-item">
            <div class="dot ${dotClass(l.type)}"></div>
            <div style="flex:1;min-width:0;">
              <div class="ltxt" style="font-size:11.5px;">${escapeHtml(l.message)}</div>
              <div class="ltime">${timeAgo(l.created_at)} · ${l.type}</div>
            </div>
          </div>`).join('') : '<div class="gs-empty">sem notificações.</div>'}
      </div>`;
  } catch {}
}

function toggleNotif(e) {
  e.stopPropagation();
  document.getElementById('notif-panel').classList.toggle('show');
  pollNotifs();
}

function markAllSeen() {
  _lastSeenLog = Math.floor(Date.now() / 1000);
  localStorage.setItem('botdash_last_seen', String(_lastSeenLog));
  document.getElementById('notif-dot').style.display = 'none';
  document.getElementById('notif-panel').classList.remove('show');
  toast('Notificações marcadas como lidas.', 'ok');
}

document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  if (panel && !e.target.closest('.notif-wrap')) panel.classList.remove('show');
});

// ---------- CATEGORIAS ----------
async function loadCategorias() {
  try {
    const list = await api('/api/categories');
    setText('cat-count', list.length);
    const tbody = document.getElementById('cat-tbody');
    tbody.innerHTML = list.length ? list.map(c => `
      <tr>
        <td style="font-size:18px;">${escapeHtml(c.icon || '📦')}</td>
        <td class="hi">${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.description || '—')}</td>
        <td>${c.product_count || 0}</td>
        <td>${c.display_order}</td>
        <td><button class="btn-sm del" onclick="removerCategoria(${c.id})">remover</button></td>
      </tr>
    `).join('') : emptyRow(6, '📂', 'Crie categorias para organizar seu catálogo (ex: VIPs, Skins, Suporte).', '+ nova categoria', "toggleForm('cat-form')");
  } catch (e) { console.warn('cat', e.message); }
}

async function addCategoria() {
  const name = document.getElementById('cat-name').value.trim();
  const description = document.getElementById('cat-desc').value.trim();
  const icon = document.getElementById('cat-icon').value.trim();
  if (!name) return toast('Preencha o nome.', 'warn');
  try {
    await api('/api/categories', { method: 'POST', body: JSON.stringify({ name, description, icon }) });
    ['cat-name', 'cat-desc', 'cat-icon'].forEach(id => document.getElementById(id).value = '');
    toggleForm('cat-form');
    loadCategorias();
    toast('Categoria criada.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function removerCategoria(id) {
  if (!await confirmAsync('Remover esta categoria? Produtos vinculados ficam sem categoria.')) return;
  try { await api('/api/categories/' + id, { method: 'DELETE' }); loadCategorias(); toast('Categoria removida.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------- SORTEIOS ----------
async function loadSorteios() {
  try {
    const list = await api('/api/giveaways');
    setText('gv-count', list.length);
    const tbody = document.getElementById('gv-tbody');
    tbody.innerHTML = list.length ? list.map(g => {
      const status = g.ended
        ? '<span class="badge" style="background:#1a1a1a;color:#666;border:1px solid #2a2a2a">encerrado</span>'
        : (g.ends_at < Math.floor(Date.now() / 1000) ? '<span class="badge kick">pendente</span>' : '<span class="badge" style="background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a">ativo</span>');
      const actions = `
        <button class="btn-sm" onclick="openGiveawayAdvanced(${g.id})" style="margin-right:4px;background:rgba(139,111,255,.15);border:1px solid rgba(139,111,255,.3);color:#b9a8ff;">configurar</button>
        ${g.ended ? '' : `<button class="btn-sm" onclick="encerrarSorteio(${g.id})">encerrar agora</button>`}
      `;
      return `<tr>
        <td class="hi">${escapeHtml(g.prize)}</td>
        <td>${g.winners_count}</td>
        <td>${g.entries_count}</td>
        <td>${formatDate(g.ends_at)}</td>
        <td>${status}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('') : emptyRow(6, '🎁', 'Nenhum sorteio ainda. Crie um sorteio com prêmio, canal e duração — o bot publica embed com botão de participar.', '+ novo sorteio', "toggleForm('gv-form')");
  } catch (e) { console.warn('gv', e.message); }
}

async function addSorteio() {
  const prize = document.getElementById('gv-prize').value.trim();
  const channel_name = document.getElementById('gv-channel').value.trim();
  const winners_count = document.getElementById('gv-winners').value;
  const duration_minutes = document.getElementById('gv-duration').value;
  const required_role_id = document.getElementById('gv-role').value.trim() || null;
  if (!prize || !channel_name || !duration_minutes) return toast('Preencha prêmio, canal e duração.', 'warn');
  try {
    await api('/api/giveaways', { method: 'POST', body: JSON.stringify({ prize, channel_name, winners_count, duration_minutes, required_role_id }) });
    ['gv-prize', 'gv-channel', 'gv-role'].forEach(id => document.getElementById(id).value = '');
    toggleForm('gv-form');
    loadSorteios();
    toast('Sorteio publicado no Discord!', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function encerrarSorteio(id) {
  if (!await confirmAsync('Encerrar este sorteio agora e sortear os vencedores?')) return;
  try { await api('/api/giveaways/' + id + '/end', { method: 'POST' }); loadSorteios(); toast('Sorteio encerrado.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------- AFILIADOS ----------
async function loadAfiliados() {
  try {
    const list = await api('/api/affiliates');
    setText('af-active', list.filter(a => a.active).length);
    setText('af-sales', list.reduce((s, a) => s + a.sales_paid, 0));
    setText('af-paid', 'R$' + formatNum(Math.round(list.reduce((s, a) => s + a.total_commission_cents, 0) / 100)));
    const tbody = document.getElementById('af-tbody');
    tbody.innerHTML = list.length ? list.map(a => `
      <tr>
        <td class="hi" style="font-family:'IBM Plex Mono',monospace;">${escapeHtml(a.code)}</td>
        <td>${escapeHtml(a.discord_tag || a.discord_id)}</td>
        <td>${a.commission_percent}%</td>
        <td>${a.sales_paid}</td>
        <td class="gr">R$${(a.total_commission_cents / 100).toFixed(2).replace('.', ',')}</td>
        <td>${a.active ? '<span class="badge" style="background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a">ativo</span>' : '<span class="badge" style="background:#1a1a1a;color:#666;border:1px solid #2a2a2a">inativo</span>'}</td>
        <td>${a.active ? `<button class="btn-sm del" onclick="desativarAfiliado(${a.id})">desativar</button>` : ''}</td>
      </tr>
    `).join('') : emptyRow(7, '🤝', 'Crie afiliados que ganham comissão divulgando sua loja. Eles compartilham o link com ?ref=CODIGO.', '+ novo afiliado', "toggleForm('af-form')");
  } catch (e) { console.warn('afiliados', e.message); }
}

async function addAfiliado() {
  const discord_id = document.getElementById('af-id').value.trim();
  const discord_tag = document.getElementById('af-tag').value.trim() || null;
  const code = document.getElementById('af-code').value.trim();
  const commission_percent = document.getElementById('af-pct').value;
  if (!discord_id || !code) return toast('Preencha discord ID e código.', 'warn');
  try {
    await api('/api/affiliates', { method: 'POST', body: JSON.stringify({ discord_id, discord_tag, code, commission_percent }) });
    ['af-id', 'af-tag', 'af-code'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('af-pct').value = '10';
    toggleForm('af-form');
    loadAfiliados();
    toast('Afiliado criado.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function desativarAfiliado(id) {
  if (!await confirmAsync('Desativar este afiliado?')) return;
  try { await api('/api/affiliates/' + id, { method: 'DELETE' }); loadAfiliados(); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------- INVITE TRACKER ----------
async function loadInvites() {
  try {
    const [list, leaderboard] = await Promise.all([
      api('/api/invites'),
      api('/api/invites/leaderboard')
    ]);
    setText('inv-total', list.length);
    setText('inv-top', leaderboard[0]?.inviter_tag || leaderboard[0]?.inviter_id || '—');

    const lead = document.getElementById('inv-lead-tbody');
    lead.innerHTML = leaderboard.length ? leaderboard.map((l, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="hi">${escapeHtml(l.inviter_tag || l.inviter_id)}</td>
        <td><strong style="color:#fff">${l.total_invites}</strong></td>
        <td class="gr">${l.active_invites}</td>
        <td style="color:#ff5f5f">${l.lost_invites}</td>
      </tr>
    `).join('') : emptyRow(5, '👥', 'Ninguém convidou ninguém ainda.');

    const log = document.getElementById('inv-log-tbody');
    log.innerHTML = list.length ? list.map(l => `
      <tr>
        <td>${formatDate(l.joined_at)}</td>
        <td class="hi">${escapeHtml(l.member_tag || l.member_id)}</td>
        <td>${escapeHtml(l.inviter_tag || l.inviter_id || 'link direto')}</td>
        <td><code style="background:#161616;padding:1px 5px;border-radius:3px;color:#aaa;font-size:10px;">${l.invite_code || '—'}</code></td>
        <td>${l.left_at ? '<span class="badge ban">saiu</span>' : '<span class="badge" style="background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a">ativo</span>'}</td>
      </tr>
    `).join('') : emptyRow(5, '🔗', 'Ainda sem registros de entradas.');
  } catch (e) { console.warn('invites', e.message); }
}

// ---------- PLANO ----------
async function loadPlano() {
  try {
    const info = await api('/api/billing/me');
    window.__plan = info;
    renderPlanBanner(info);
    renderPlanCurrent(info);
    renderPlanCompare(info);
  } catch (e) { console.warn('plano', e.message); }
}

function renderPlanBanner(info) {
  const banner = document.getElementById('plan-banner');
  const sub = info.my_subscription;
  if (sub?.status === 'trialing' && sub.trial_ends_at) {
    const days = Math.ceil((sub.trial_ends_at - Date.now() / 1000) / 86400);
    banner.style.display = 'block';
    banner.style.background = 'linear-gradient(135deg,#1a1530,#0e0e2e)';
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;flex-wrap:wrap;">
        <div>
          <div style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:#b9a8ff;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">★ você está no trial Pro</div>
          <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">${days > 1 ? `Faltam ${days} dias` : (days === 1 ? 'Último dia' : 'Expirando')} do seu trial gratuito</div>
          <div style="font-size:13px;color:#aaa;font-family:'IBM Plex Mono',monospace;">assine antes pra não perder acesso às features Pro</div>
        </div>
        ${info.is_owner ? `<button class="btn-w" style="background:#8b6fff;padding:13px 24px;" onclick="upgradePro()">★ assinar agora</button>` : ''}
      </div>`;
    return;
  }
  if (info.plan_id === 'free') {
    banner.style.display = 'block';
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:18px;justify-content:space-between;flex-wrap:wrap;">
        <div>
          <div style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:#8888c8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">você está no plano free</div>
          <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">Desbloqueie tudo no Pro por R$47/mês</div>
          <div style="font-size:13px;color:#aaa;font-family:'IBM Plex Mono',monospace;">produtos ilimitados, afiliados, sorteios, auto-respostas, white-label</div>
        </div>
        ${info.is_owner ? `<button class="btn-w" style="background:#8b6fff;padding:13px 24px;" onclick="upgradePro()">★ fazer upgrade</button>` : `<div style="font-size:11px;color:#888;font-family:'IBM Plex Mono',monospace;">peça pro owner (${escapeHtml(info.owner_email || '')}) assinar</div>`}
      </div>`;
  } else if (sub?.status === 'past_due') {
    banner.style.display = 'block';
    banner.style.background = 'linear-gradient(135deg,#1f1900,#0e0e2e)';
    banner.style.borderColor = '#3a3000';
    banner.innerHTML = `<div style="color:#ffdf5f;font-family:'IBM Plex Mono',monospace;font-size:13px;"><b>⚠️ Pagamento atrasado</b> — atualize o cartão pelo portal antes que sua assinatura seja cancelada.</div>`;
  } else {
    banner.style.display = 'none';
  }
}

function renderPlanCurrent(info) {
  const sub = info.my_subscription;
  const plan = info.plan;
  const planBadge = info.plan_id === 'pro'
    ? '<span class="badge" style="background:#1a1530;color:#b9a8ff;border:1px solid #4a3a8e;padding:4px 10px;font-size:11px;">★ PRO</span>'
    : '<span class="badge" style="background:#1a1a1a;color:#888;border:1px solid #2a2a2a;padding:4px 10px;font-size:11px;">FREE</span>';

  const status = sub?.status
    ? (sub.status === 'active' ? `<span style="color:#5fff5f;">● ativa</span>`
       : sub.status === 'trialing' ? `<span style="color:#5fff5f;">● em trial</span>`
       : sub.status === 'past_due' ? `<span style="color:#ffdf5f;">● atrasada</span>`
       : `<span style="color:#ff5f5f;">● ${escapeHtml(sub.status)}</span>`)
    : '<span style="color:#666;">sem assinatura</span>';

  const portalBtn = info.is_owner && sub?.has_stripe_customer
    ? `<button class="btn-g" onclick="abrirPortal()">gerenciar assinatura ↗</button>`
    : '';

  document.getElementById('plan-current').innerHTML = `
    <div class="ctitle">seu plano atual</div>
    <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;justify-content:space-between;">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          ${planBadge}
          <div style="font-size:22px;font-weight:700;color:#fff;">${escapeHtml(plan.name)}</div>
          ${status ? `<div style="font-size:12px;font-family:'IBM Plex Mono',monospace;">${status}</div>` : ''}
        </div>
        <div style="font-size:13px;color:#888;font-family:'IBM Plex Mono',monospace;">${escapeHtml(plan.description)}</div>
        ${sub?.ends_at ? `<div style="font-size:11px;color:#666;font-family:'IBM Plex Mono',monospace;margin-top:6px;">próxima renovação em ${formatDate(sub.ends_at)}</div>` : ''}
      </div>
      ${portalBtn}
    </div>
  `;
}

function renderPlanCompare(info) {
  const featureLabels = {
    max_products: 'produtos ativos',
    max_coupons: 'cupons',
    max_affiliates: 'afiliados',
    max_giveaways_active: 'sorteios simultâneos',
    autoreply: 'auto-respostas',
    tickets: 'tickets',
    manual_delivery: 'entrega manual',
    misticpay_checkout: 'MisticPay (PIX BR)',
    custom_branding: 'cor/logo customizada',
    audit_log: 'log de auditoria',
    api_webhooks: 'webhooks por produto'
  };

  document.getElementById('plan-compare').innerHTML = info.plans_available.map(p => {
    const isCurrent = p.id === info.plan_id;
    return `
      <div class="card" style="${p.id === 'pro' ? 'border-color:#4a3a8e;background:linear-gradient(180deg,#111,#1a1530 200%);' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div style="font-size:18px;font-weight:700;color:#fff;">${escapeHtml(p.name)}</div>
          ${isCurrent ? '<span class="badge" style="background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a;">atual</span>' : ''}
        </div>
        <div style="font-size:32px;font-weight:800;color:#fff;letter-spacing:-.02em;margin-bottom:4px;">${p.price_monthly_brl === 0 ? 'R$0' : 'R$' + p.price_monthly_brl}<span style="font-size:13px;color:#666;font-weight:400;font-family:'IBM Plex Mono',monospace;"> / mês</span></div>
        <div style="font-size:12px;color:#888;font-family:'IBM Plex Mono',monospace;margin-bottom:18px;">${escapeHtml(p.description)}</div>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
          ${Object.entries(featureLabels).map(([k, label]) => {
            const v = p.features[k];
            const enabled = v === -1 || (v && v !== 0);
            const display = typeof v === 'number' ? (v === -1 ? 'ilimitado' : v) : (v ? '✓' : '✗');
            return `<li style="display:flex;justify-content:space-between;font-size:12.5px;font-family:'IBM Plex Mono',monospace;color:${enabled ? '#aaa' : '#555'};">
              <span>${escapeHtml(label)}</span>
              <span style="color:${enabled ? '#5fff5f' : '#555'};">${display}</span>
            </li>`;
          }).join('')}
        </ul>
        ${p.id !== info.plan_id && p.id === 'pro' && info.is_owner
          ? `<button class="btn-w" style="width:100%;background:#8b6fff;justify-content:center;" onclick="upgradePro()">assinar Pro →</button>`
          : ''}
      </div>`;
  }).join('');
}

async function upgradePro() {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = 'redirecionando...'; }
  try {
    const r = await api('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: 'pro' }) });
    if (r.url) location.href = r.url;
  } catch (e) {
    toast(e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = '★ fazer upgrade'; }
  }
}

async function abrirPortal() {
  try {
    const r = await api('/api/billing/portal', { method: 'POST' });
    if (r.url) location.href = r.url;
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- EQUIPE ----------
async function loadEquipe() {
  try {
    const users = await api('/auth/users');
    setText('team-count', users.length);
    const me = window.__me;
    const isOwner = me?.role === 'owner';
    const btn = document.getElementById('team-add-btn');
    if (btn) btn.style.display = isOwner ? '' : 'none';

    const tbody = document.getElementById('team-tbody');
    tbody.innerHTML = users.length ? users.map(u => `
      <tr>
        <td class="hi">${escapeHtml(u.display_name || u.email.split('@')[0])}${me?.id === u.id ? ' <span style="color:#666;font-size:10px;">(você)</span>' : ''}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${roleBadge(u.role)}</td>
        <td>${u.last_login_at ? formatDate(u.last_login_at) : '<span style="color:#444">nunca</span>'}</td>
        <td>${isOwner && me?.id !== u.id && u.active ? `<button class="btn-sm del" onclick="desativarUsuario(${u.id})">remover</button>` : (!u.active ? '<span style="color:#ff5f5f;font-size:10px;">inativo</span>' : '')}</td>
      </tr>
    `).join('') : emptyRow(5, '👥', 'Nenhum usuário ainda.');
  } catch (e) { console.warn('equipe', e.message); }
}

function roleBadge(role) {
  const map = {
    owner: '<span class="badge" style="background:#1f1900;color:#ffdf5f;border:1px solid #3a3000">👑 owner</span>',
    admin: '<span class="badge" style="background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a">admin</span>',
    member: '<span class="badge" style="background:#1a1a1a;color:#888;border:1px solid #2a2a2a">member</span>'
  };
  return map[role] || role;
}

async function convidarUsuario() {
  const email = document.getElementById('inv-email').value.trim();
  const role = document.getElementById('inv-role').value;
  if (!email) return toast('Preencha o email.', 'warn');
  try {
    const r = await api('/auth/invite', { method: 'POST', body: JSON.stringify({ email, role }) });
    document.getElementById('inv-email').value = '';
    toggleForm('team-form');
    loadEquipe();
    openModal(`
      <div class="modal-title">acesso criado<button class="modal-close" onclick="closeModal()">×</button></div>
      <div style="font-size:13px;color:#aaa;margin-bottom:14px;font-family:'IBM Plex Mono',monospace;">Email: <b style="color:#fff">${escapeHtml(r.email)}</b></div>
      <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;font-family:'IBM Plex Mono',monospace;">senha temporária — copie e envie pelo canal seguro</div>
      <input class="inp" value="${escapeAttr(r.temporary_password)}" readonly onclick="this.select()" style="font-family:'IBM Plex Mono',monospace;">
      <div style="font-size:11px;color:#ffdf5f;background:#1f1900;border:1px solid #3a3000;padding:10px;border-radius:6px;margin-top:14px;font-family:'IBM Plex Mono',monospace;">⚠️ peça pro usuário trocar a senha no primeiro login na aba "Equipe".</div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px;">
        <button class="btn-w" onclick="closeModal()">ok, copiei</button>
      </div>
    `);
  } catch (e) { toast(e.message, 'err'); }
}

async function desativarUsuario(id) {
  if (!await confirmAsync('Desativar este usuário? Ele perde acesso ao painel.')) return;
  try {
    await api('/auth/users/' + id, { method: 'DELETE' });
    toast('Usuário desativado.', 'ok');
    loadEquipe();
  } catch (e) { toast(e.message, 'err'); }
}

async function trocarSenha() {
  const current_password = document.getElementById('pwd-current').value;
  const new_password = document.getElementById('pwd-new').value;
  if (!new_password || new_password.length < 8) return toast('Senha mínima de 8 caracteres.', 'warn');
  try {
    await api('/auth/password', { method: 'PUT', body: JSON.stringify({ current_password, new_password }) });
    document.getElementById('pwd-current').value = '';
    document.getElementById('pwd-new').value = '';
    toast('Senha alterada.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- CREDENCIAIS ----------
async function loadCredenciais() {
  try {
    const creds = await api('/api/credentials');
    const byGroup = { discord: [], stripe: [], misticpay: [], billing: [], email: [] };
    creds.forEach(c => { if (byGroup[c.group]) byGroup[c.group].push(c); });

    document.getElementById('cred-discord').innerHTML = byGroup.discord.map(credRow).join('');
    document.getElementById('cred-stripe').innerHTML = byGroup.stripe.map(credRow).join('');
    document.getElementById('cred-misticpay').innerHTML = byGroup.misticpay.map(credRow).join('');
    const cbe = document.getElementById('cred-billing'); if (cbe) cbe.innerHTML = byGroup.billing.map(credRow).join('');
    const cee = document.getElementById('cred-email'); if (cee) cee.innerHTML = byGroup.email.map(credRow).join('');

    const statusBadge = (list) => {
      const all = list.length;
      const done = list.filter(c => c.configured).length;
      if (done === all) return `<span style="background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a">✓ completo (${done}/${all})</span>`;
      if (done === 0) return `<span style="background:#1f0a0a;color:#ff5f5f;border:1px solid #3a1010">pendente (0/${all})</span>`;
      return `<span style="background:#1a1900;color:#ffdf5f;border:1px solid #3a3000">parcial (${done}/${all})</span>`;
    };
    document.getElementById('cred-discord-status').outerHTML = `<span class="cbadge" id="cred-discord-status">${statusBadge(byGroup.discord)}</span>`;
    document.getElementById('cred-stripe-status').outerHTML = `<span class="cbadge" id="cred-stripe-status">${statusBadge(byGroup.stripe)}</span>`;
    document.getElementById('cred-misticpay-status').outerHTML = `<span class="cbadge" id="cred-misticpay-status">${statusBadge(byGroup.misticpay)}</span>`;
    const sb = document.getElementById('cred-billing-status'); if (sb) sb.outerHTML = `<span class="cbadge" id="cred-billing-status">${statusBadge(byGroup.billing)}</span>`;
    const se = document.getElementById('cred-email-status'); if (se) se.outerHTML = `<span class="cbadge" id="cred-email-status">${statusBadge(byGroup.email)}</span>`;
  } catch (e) { console.warn('credenciais', e.message); }
}

function credRow(c) {
  const sourceTag = c.source === 'env'
    ? '<span style="background:#1a1900;color:#ffdf5f;border:1px solid #3a3000;font-size:9px;padding:1px 6px;border-radius:3px;font-family:IBM Plex Mono,monospace;">via .env</span>'
    : c.source === 'db'
    ? '<span style="background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a;font-size:9px;padding:1px 6px;border-radius:3px;font-family:IBM Plex Mono,monospace;">salvo</span>'
    : '<span style="background:#1f0a0a;color:#ff5f5f;border:1px solid #3a1010;font-size:9px;padding:1px 6px;border-radius:3px;font-family:IBM Plex Mono,monospace;">vazio</span>';
  const preview = c.preview ? `<code style="background:#161616;color:#aaa;font-size:11px;padding:3px 8px;border-radius:3px;font-family:IBM Plex Mono,monospace;">${escapeHtml(c.preview)}</code>` : '<span style="color:#444;font-size:11px;font-family:IBM Plex Mono,monospace;">não configurado</span>';
  const placeholder = c.secret ? 'cole o valor aqui (mantém vazio pra não alterar)' : 'cole o valor aqui';
  return `<div class="cfgitem" style="flex-direction:column;align-items:stretch;gap:8px;padding:12px 0;border-bottom:1px solid #161616;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div>
        <div style="color:#fff;font-size:13px;font-weight:600;">${escapeHtml(c.label)} ${sourceTag}</div>
        <div style="font-size:10px;color:#555;font-family:IBM Plex Mono,monospace;letter-spacing:.06em;margin-top:2px;">${escapeHtml(c.key)}</div>
      </div>
      <div>${preview}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <input class="inp" id="cv-${c.key}" type="${c.secret ? 'password' : 'text'}" placeholder="${placeholder}" style="flex:1;font-family:IBM Plex Mono,monospace;">
      <button class="btn-sm pub" onclick="saveCredential('${c.key}')">salvar</button>
      ${c.configured && c.source === 'db' ? `<button class="btn-sm del" onclick="clearCredential('${c.key}')">limpar</button>` : ''}
    </div>
  </div>`;
}

async function saveCredential(key) {
  const value = document.getElementById('cv-' + key).value;
  if (!value.trim()) return toast('Digite um valor.', 'warn');
  try {
    await api('/api/credentials/' + encodeURIComponent(key), { method: 'PUT', body: JSON.stringify({ value }) });
    toast('Credencial salva.', 'ok');
    document.getElementById('cv-' + key).value = '';
    loadCredenciais();
  } catch (e) { toast(e.message, 'err'); }
}

async function clearCredential(key) {
  if (!await confirmAsync(`Limpar a credencial ${key}?`)) return;
  try {
    await api('/api/credentials/' + encodeURIComponent(key), { method: 'DELETE' });
    toast('Credencial removida.', 'ok');
    loadCredenciais();
  } catch (e) { toast(e.message, 'err'); }
}

async function testarEmail() {
  const to = document.getElementById('email-test-to').value.trim() || null;
  try {
    const r = await api('/api/credentials/email/test', { method: 'POST', body: JSON.stringify({ to }) });
    if (r.sent) toast(`Email enviado via ${r.via.toUpperCase()} ✓`, 'ok');
    else toast(r.reason || 'falha', 'warn');
  } catch (e) { toast(e.message, 'err'); }
}

async function restartBot() {
  if (!await confirmAsync('Reiniciar o bot agora? Ele vai desconectar do Discord por alguns segundos.')) return;
  try {
    await api('/api/credentials/bot/restart', { method: 'POST' });
    toast('Bot reiniciando...', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- AUDITORIA ----------
async function loadAuditoria() {
  try {
    const [sum, list] = await Promise.all([
      api('/api/audit/summary'),
      api('/api/audit?limit=200')
    ]);
    setText('au-today', sum.today);
    setText('au-top', sum.by_action[0]?.action || '—');
    const tbody = document.getElementById('au-tbody');
    tbody.innerHTML = list.length ? list.map(a => {
      let det = '';
      try { const o = JSON.parse(a.details || '{}'); det = Object.keys(o).slice(0, 3).map(k => `${k}=${typeof o[k] === 'string' ? o[k].slice(0, 30) : o[k]}`).join(', '); } catch {}
      return `<tr>
        <td>${formatTime(a.created_at)}</td>
        <td class="hi">${escapeHtml(a.actor_name || '?')}</td>
        <td><span class="badge" style="background:#1a1a1a;color:#aaa;border:1px solid #2a2a2a">${escapeHtml(a.action)}</span></td>
        <td>${escapeHtml(a.target_type ? a.target_type + '#' + a.target_id : '—')}</td>
        <td style="font-size:10px;color:#666;">${escapeHtml(det)}</td>
      </tr>`;
    }).join('') : emptyRow(5, '📜', 'Nenhuma ação registrada ainda.');
  } catch (e) { console.warn('audit', e.message); }
}

bootstrap();
setInterval(() => { if (document.getElementById('page-geral').classList.contains('show')) loadOverview(); }, 30000);
setInterval(pollNotifs, 45000);
setTimeout(pollNotifs, 2000);

// ============ SALDO + SACAR ============
async function loadBalance() {
  try {
    const r = await fetch('/api/wallet/balance', { credentials: 'same-origin' });
    if (!r.ok) return;
    const j = await r.json();
    const v = (j.available_cents || 0) / 100;
    const el = document.getElementById('balance-val');
    if (el) el.textContent = 'R$ ' + v.toFixed(2).replace('.', ',');
    window.__balance = j;
  } catch {}
}

async function openWithdrawModal() {
  await loadBalance();
  const b = window.__balance || { available_cents: 0, pending_cents: 0, blocked_cents: 0 };
  const verif = await fetch('/api/verification', { credentials: 'same-origin' }).then(r => r.json()).catch(() => null);
  const verified = verif && verif.status === 'approved';
  const avail = (b.available_cents / 100).toFixed(2).replace('.', ',');

  document.getElementById('modal-withdraw-body').innerHTML = `
    <div style="display:flex;gap:14px;margin-bottom:18px;">
      <div style="flex:1;background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;">
        <div style="font-size:10px;text-transform:uppercase;color:#666;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">disponível</div>
        <div style="font-size:22px;font-weight:800;color:#7dd3a4;margin-top:6px;">R$ ${avail}</div>
      </div>
      <div style="flex:1;background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;">
        <div style="font-size:10px;text-transform:uppercase;color:#666;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">pendente</div>
        <div style="font-size:16px;font-weight:700;color:#aaa;margin-top:8px;">R$ ${(b.pending_cents/100).toFixed(2).replace('.',',')}</div>
      </div>
    </div>
    ${!verified ? `<div style="background:rgba(245,197,66,0.10);border:1px solid rgba(245,197,66,0.30);border-radius:8px;padding:12px;margin-bottom:14px;color:#f5c542;font-size:12.5px;">
      ⚠ Você precisa verificar sua identidade antes de sacar. <a href="#" onclick="closeModal('modal-withdraw');openVerificationModal();return false;" style="color:#f5c542;text-decoration:underline;">Verificar agora</a>
    </div>` : ''}
    <div class="kyc-field">
      <label>Valor a sacar (R$)</label>
      <input type="number" id="wd-amount" step="0.01" min="10" placeholder="0,00" oninput="updateWdPreview()" ${!verified ? 'disabled' : ''}>
    </div>
    <div class="kyc-field">
      <label>Tipo de saque</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div id="wd-opt-normal" onclick="selectWdType('normal')" style="background:#1a1a1a;border:1px solid var(--primary);border-radius:8px;padding:12px;cursor:pointer;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;"><b style="color:#fff;font-size:13px;">Normal</b><span style="color:#7dd3a4;font-size:11px;font-family:'IBM Plex Mono',monospace;">R$ 0,50</span></div>
          <div style="color:#888;font-size:11px;margin-top:3px;">até 24h úteis</div>
        </div>
        <div id="wd-opt-instant" onclick="selectWdType('instant')" style="background:#0a0a0a;border:1px solid var(--border);border-radius:8px;padding:12px;cursor:pointer;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;"><b style="color:#fff;font-size:13px;">⚡ Instantâneo</b><span style="color:#f5c542;font-size:11px;font-family:'IBM Plex Mono',monospace;">R$ 3,50</span></div>
          <div style="color:#888;font-size:11px;margin-top:3px;">em minutos</div>
        </div>
      </div>
    </div>
    <div id="wd-preview" style="background:#0a0a0a;border:1px solid var(--border);border-radius:8px;padding:11px 14px;margin-bottom:14px;font-size:12px;font-family:'IBM Plex Mono',monospace;color:#888;display:none;"></div>
    <div class="kyc-hint" style="margin-bottom:14px;">Mínimo R$10. Chave PIX: <b style="color:#aaa;">${verif?.pix_key ? escapeHtml(verif.pix_key) : '—'}</b></div>
    <div class="kyc-actions">
      <button class="kyc-btn secondary" onclick="closeModal('modal-withdraw')">Cancelar</button>
      <button class="kyc-btn primary" onclick="submitWithdraw()" ${!verified ? 'disabled' : ''}>Solicitar saque</button>
    </div>
  `;
  window.__wdType = 'normal';
  document.getElementById('modal-withdraw').classList.add('open');
}

function selectWdType(type) {
  window.__wdType = type;
  const n = document.getElementById('wd-opt-normal');
  const i = document.getElementById('wd-opt-instant');
  if (n) { n.style.background = type === 'normal' ? '#1a1a1a' : '#0a0a0a'; n.style.borderColor = type === 'normal' ? 'var(--primary)' : 'var(--border)'; }
  if (i) { i.style.background = type === 'instant' ? '#1a1a1a' : '#0a0a0a'; i.style.borderColor = type === 'instant' ? 'var(--primary)' : 'var(--border)'; }
  updateWdPreview();
}

function updateWdPreview() {
  const amt = parseFloat(document.getElementById('wd-amount')?.value || 0);
  const preview = document.getElementById('wd-preview');
  if (!preview) return;
  if (!amt || amt < 10) { preview.style.display = 'none'; return; }
  const fee = window.__wdType === 'instant' ? 3.50 : 0.50;
  const net = amt - fee;
  preview.style.display = 'block';
  preview.innerHTML = `Valor solicitado <b style="color:#fff;float:right;">R$ ${amt.toFixed(2).replace('.', ',')}</b><br>
    Taxa de saque <b style="color:#f5c542;float:right;">- R$ ${fee.toFixed(2).replace('.', ',')}</b><br>
    <div style="border-top:1px solid var(--border);margin:6px 0;padding-top:6px;"></div>
    Você receberá <b style="color:#7dd3a4;float:right;font-size:13.5px;">R$ ${net.toFixed(2).replace('.', ',')}</b>`;
}

async function submitWithdraw() {
  const amount = document.getElementById('wd-amount').value;
  if (!amount || parseFloat(amount) < 10) return toast('Valor mínimo R$10', 'err');
  try {
    const r = await fetch('/api/wallet/withdraw', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, type: window.__wdType || 'normal' })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha no saque', 'err');
    toast('Saque solicitado! Será processado em até 24h.');
    closeModal('modal-withdraw');
    loadBalance();
  } catch (e) { toast(e.message, 'err'); }
}

// ============ VERIFICAÇÃO DE IDENTIDADE ============
let __verifState = null;

async function openVerificationModal() {
  const r = await fetch('/api/verification', { credentials: 'same-origin' });
  __verifState = await r.json();
  renderVerifModal();
  document.getElementById('modal-verify').classList.add('open');
}

function renderVerifModal() {
  const s = __verifState || { status: 'not_started' };
  const body = document.getElementById('modal-verify-body');
  const stepIdx = { not_started: 0, pending_payment: 0, pending_proof: 1, pending_review: 2, approved: 2, rejected: 0 }[s.status] ?? 0;

  const steps = `
    <div class="kyc-steps">
      <div class="kyc-step ${stepIdx >= 0 ? 'active' : ''} ${stepIdx > 0 ? 'done' : ''}"><div class="num">${stepIdx > 0 ? '✓' : '1'}</div>Pagamento</div>
      <div class="kyc-step-bar ${stepIdx > 0 ? 'done' : ''}"></div>
      <div class="kyc-step ${stepIdx >= 1 ? 'active' : ''} ${stepIdx > 1 ? 'done' : ''}"><div class="num">${stepIdx > 1 ? '✓' : '2'}</div>Comprovante</div>
      <div class="kyc-step-bar ${stepIdx > 1 ? 'done' : ''}"></div>
      <div class="kyc-step ${stepIdx >= 2 ? 'active' : ''} ${s.status === 'approved' ? 'done' : ''}"><div class="num">${s.status === 'approved' ? '✓' : '3'}</div>Concluído</div>
    </div>
  `;

  if (s.status === 'not_started' || s.status === 'rejected') {
    body.innerHTML = steps + `
      ${s.status === 'rejected' ? `<div style="background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.30);padding:10px;border-radius:8px;color:#ff8a8a;font-size:12px;margin-bottom:14px;">Sua verificação anterior foi rejeitada: ${escapeHtml(s.rejection_reason || 'motivo nao informado')}. Corrija os dados e tente de novo.</div>` : ''}
      <div class="kyc-field">
        <label>CPF ou CNPJ</label>
        <input id="kyc-doc" placeholder="apenas números (11 ou 14 dígitos)" inputmode="numeric">
        <div class="kyc-hint">Use o documento do titular da chave PIX.</div>
      </div>
      <div class="kyc-field">
        <label>Nova chave PIX</label>
        <input id="kyc-pix" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória">
        <div class="kyc-hint">A chave PIX deve estar vinculada à conta bancária do mesmo CPF/CNPJ informado acima.</div>
      </div>
      <div class="kyc-actions">
        <button class="kyc-btn secondary" onclick="closeModal('modal-verify')">Cancelar</button>
        <button class="kyc-btn primary" onclick="kycStart()">Iniciar Verificação</button>
      </div>
    `;
  } else if (s.status === 'pending_payment') {
    body.innerHTML = steps + `
      <div class="kyc-grid">
        <div>
          <h4 style="margin:0 0 10px;color:#fff;font-size:14px;">Informações do Pagamento</h4>
          <p style="font-size:12.5px;color:#bbb;line-height:1.5;">Escaneie com o app do seu banco e efetue o pagamento de <b style="color:#fff;">R$ 0,99</b> para confirmar sua identidade.</p>
          <div style="background:rgba(245,197,66,0.08);border:1px solid rgba(245,197,66,0.25);padding:10px;border-radius:8px;font-size:11.5px;color:#d4b860;line-height:1.5;margin-top:12px;">
            <b>Importante:</b> Após o pagamento, o sistema confirma que você é o titular da conta. O valor é reembolsado em até 24h.
          </div>
        </div>
        <div>
          <div class="kyc-qr"><canvas id="kyc-qr-canvas"></canvas></div>
          <div style="margin-top:10px;">
            <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Código PIX</div>
            <div class="kyc-pix-code" id="kyc-pix-payload">${escapeHtml(s.payment_qr_payload || '')}</div>
            <button class="kyc-btn secondary" style="width:100%;margin-top:8px;" onclick="kycCopyPix()">Copiar Código PIX</button>
          </div>
        </div>
      </div>
      <div class="kyc-actions">
        <button class="kyc-btn secondary" onclick="closeModal('modal-verify')">Fechar</button>
        <button class="kyc-btn primary" onclick="kycGoProofStep()">Já paguei — enviar comprovante</button>
      </div>
    `;
    if (window.QRCode && s.payment_qr_payload) {
      QRCode.toCanvas(document.getElementById('kyc-qr-canvas'), s.payment_qr_payload, { width: 280, margin: 1 }, () => {});
    }
  } else if (s.status === 'pending_proof' || (s.status === 'pending_review' && !s.proof_file_path)) {
    body.innerHTML = steps + `
      <div style="text-align:center;margin-bottom:18px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h3 style="margin:8px 0 4px;color:#fff;font-size:16px;">Envie o Comprovante de Pagamento</h3>
        <div style="font-size:12.5px;color:#aaa;">Formatos aceitos: JPG, PNG ou PDF (até 5MB)</div>
      </div>
      <div class="dropzone" onclick="document.getElementById('kyc-file').click()">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <div style="color:#fff;font-weight:600;font-size:13px;">Clique para selecionar o comprovante</div>
        <div style="font-size:11px;color:#666;margin-top:4px;">ou arraste e solte aqui</div>
        <input type="file" id="kyc-file" accept="image/*,.pdf" style="display:none;" onchange="kycUploadProof(this)">
      </div>
      <div class="kyc-actions">
        <button class="kyc-btn secondary" onclick="closeModal('modal-verify')">Cancelar</button>
      </div>
    `;
  } else if (s.status === 'pending_review') {
    body.innerHTML = steps + `
      <div style="text-align:center;padding:30px 10px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <h3 style="margin:14px 0 8px;color:#fff;">Em análise</h3>
        <div style="color:#aaa;font-size:13px;line-height:1.5;">Recebemos seu comprovante. Vamos analisar e aprovar sua verificação em até 24h úteis. Você receberá uma notificação.</div>
      </div>
      <div class="kyc-actions"><button class="kyc-btn secondary" onclick="closeModal('modal-verify')">Fechar</button></div>
    `;
  } else if (s.status === 'approved') {
    body.innerHTML = steps + `
      <div style="text-align:center;padding:30px 10px;">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <h3 style="margin:14px 0 8px;color:#fff;">Verificação aprovada</h3>
        <div style="color:#aaa;font-size:13px;line-height:1.5;">Você já pode receber pagamentos e sacar para sua chave PIX <b style="color:#fff;">${escapeHtml(s.pix_key || '')}</b>.</div>
      </div>
      <div class="kyc-actions"><button class="kyc-btn primary" onclick="closeModal('modal-verify')">Fechar</button></div>
    `;
  }
}

async function kycStart() {
  const cpf = document.getElementById('kyc-doc').value.trim();
  const pix = document.getElementById('kyc-pix').value.trim();
  if (!cpf || !pix) return toast('Preencha CPF/CNPJ e chave PIX', 'err');
  try {
    const r = await fetch('/api/verification/start', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf_cnpj: cpf, pix_key: pix })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    __verifState = j;
    renderVerifModal();
    checkKycBanner();
  } catch (e) { toast(e.message, 'err'); }
}

function kycCopyPix() {
  const txt = document.getElementById('kyc-pix-payload')?.textContent || '';
  navigator.clipboard.writeText(txt).then(() => toast('Código PIX copiado'));
}

async function kycGoProofStep() {
  __verifState = { ...__verifState, status: 'pending_proof' };
  renderVerifModal();
}

async function kycUploadProof(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return toast('Arquivo > 5MB', 'err');
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const r = await fetch('/api/verification/upload-proof', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content_base64: reader.result })
      });
      const j = await r.json();
      if (!r.ok) return toast(j.error || 'Falha no upload', 'err');
      __verifState = j;
      renderVerifModal();
      checkKycBanner();
      toast('Comprovante enviado!');
    } catch (e) { toast(e.message, 'err'); }
  };
  reader.readAsDataURL(file);
}

async function checkKycBanner() {
  try {
    const j = await fetch('/api/verification', { credentials: 'same-origin' }).then(r => r.json());
    const banner = document.getElementById('kyc-banner');
    if (!banner) return;
    if (j.status === 'approved') { banner.style.display = 'none'; return; }
    const msgs = {
      not_started: 'Confirme sua identidade para evitar interrupções no serviço de pagamento.',
      pending_payment: 'Você iniciou a verificação. Pague o PIX de R$ 0,99 e envie o comprovante.',
      pending_proof: 'Envie o comprovante do pagamento para concluir.',
      pending_review: 'Comprovante recebido — em análise.',
      rejected: 'Sua verificação foi rejeitada. Tente novamente.'
    };
    document.getElementById('kyc-banner-d').textContent = msgs[j.status] || msgs.not_started;
    banner.style.display = 'flex';
  } catch {}
}

// ============ BOT CONTROLS ============
async function botCtl(action) {
  if (!confirm(`${action === 'stop' ? 'Desligar' : action === 'restart' ? 'Reiniciar' : 'Ligar'} o bot?`)) return;
  try {
    const r = await fetch(`/api/bot/${action}`, { method: 'POST', credentials: 'same-origin' });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    toast(`bot ${action === 'stop' ? 'desligado' : action === 'restart' ? 'reiniciado' : 'ligado'}`);
    setTimeout(refreshBotStatus, 2000);
  } catch (e) { toast(e.message, 'err'); }
}

async function refreshBotStatus() {
  try {
    const j = await fetch('/api/bot/status', { credentials: 'same-origin' }).then(r => r.json());
    const txt = document.getElementById('bot-status-text');
    if (txt) txt.textContent = j.ready ? 'online' : 'offline';
    const ctls = document.getElementById('bot-controls');
    if (ctls) ctls.style.display = 'flex';
  } catch {}
}

// inicia ao carregar
setTimeout(() => { loadBalance(); checkKycBanner(); refreshBotStatus(); }, 800);
setInterval(loadBalance, 60000);
setInterval(refreshBotStatus, 30000);

// ============ PERMISSÕES DA EQUIPE (per-guild) ============
let __teamMembers = [];
let __teamPerms = [];
let __teamSelected = null;
let __teamPending = null;   // Set de perms pendentes (nao salvo) — null = sincronizado
let __teamOriginal = null;  // Set original do servidor pra comparar

async function loadTeamPerms() {
  try {
    const [members, meta] = await Promise.all([
      fetch('/api/team/members', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []),
      fetch('/api/team/permissions/_meta', { credentials: 'same-origin' }).then(r => r.json())
    ]);
    __teamMembers = members;
    __teamPerms = meta;
    __teamPending = null;
    __teamOriginal = null;
    renderTeamMembers();
    if (members.length && !__teamSelected) selectTeamMember(members[0].id);
    else if (__teamSelected) selectTeamMember(__teamSelected);
  } catch (e) { console.warn('team perms', e.message); }
}

function renderTeamMembers() {
  const wrap = document.getElementById('team-members-list');
  if (!wrap) return;
  if (!__teamMembers.length) {
    wrap.innerHTML = '<div style="color:#666;font-size:12px;padding:14px;text-align:center;">nenhum membro ainda</div>';
    return;
  }
  wrap.innerHTML = __teamMembers.map(m => `
    <div onclick="selectTeamMember(${m.id})" style="display:flex;align-items:center;gap:10px;padding:10px;background:${__teamSelected === m.id ? '#1a1a1a' : '#0a0a0a'};border:1px solid ${__teamSelected === m.id ? 'var(--primary)' : 'var(--border)'};border-radius:8px;cursor:pointer;transition:all .12s;">
      <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#8b6fff,#5865f2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;${m.discord_avatar ? `background:url('${escapeAttr(m.discord_avatar)}') center/cover;` : ''}">${m.discord_avatar ? '' : (m.display_name || m.email || '?').charAt(0).toUpperCase()}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.display_name || m.discord_tag || m.email)}</div>
        <div style="font-size:10px;color:#666;font-family:'IBM Plex Mono',monospace;text-transform:uppercase;">${escapeHtml(m.role)}</div>
      </div>
    </div>
  `).join('');
}

function selectTeamMember(userId) {
  // se tinha mudancas pendentes, alerta
  if (__teamPending && hasTeamDirty()) {
    if (!confirm('Você tem alterações não salvas. Descartar e trocar de membro?')) return;
  }
  __teamSelected = userId;
  const m = __teamMembers.find(x => x.id === userId);
  if (!m) return;
  __teamOriginal = new Set(m.permissions);
  __teamPending = new Set(m.permissions);
  renderTeamMembers();
  renderPermsPane();
}

function hasTeamDirty() {
  if (!__teamPending || !__teamOriginal) return false;
  if (__teamPending.size !== __teamOriginal.size) return true;
  for (const p of __teamPending) if (!__teamOriginal.has(p)) return true;
  return false;
}

function renderPermsPane() {
  const m = __teamMembers.find(x => x.id === __teamSelected);
  if (!m) return;
  const pane = document.getElementById('team-perms-pane');
  const isOwner = m.role === 'owner';

  // Agrupa por p.group
  const groups = {};
  for (const p of __teamPerms) {
    const g = p.group || 'Outros';
    if (!groups[g]) groups[g] = [];
    groups[g].push(p);
  }

  const dirty = hasTeamDirty();
  const groupOrder = ['Principal', 'Geral', 'Moderação', 'Outros'];
  const sortedGroups = Object.keys(groups).sort((a, b) => {
    const ai = groupOrder.indexOf(a), bi = groupOrder.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  pane.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div>
        <div style="font-size:13px;color:#fff;font-weight:700;">Permissões para ${escapeHtml(m.display_name || m.discord_tag || m.email)}</div>
        <div style="font-size:11.5px;color:#888;margin-top:2px;">${isOwner ? 'Owner sempre tem todas as permissões.' : 'Selecione as permissões que deseja conceder a este usuário'}</div>
      </div>
      ${!isOwner ? `<button class="btn-g" style="color:#ff8a8a;border-color:rgba(255,107,107,.3);font-size:11px;" onclick="removeMember(${m.id})">remover</button>` : ''}
    </div>
    <div style="max-height:520px;overflow-y:auto;padding-right:6px;">
      ${sortedGroups.map(g => `
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#666;font-family:'IBM Plex Mono',monospace;margin:14px 0 8px;">${escapeHtml(g)}</div>
        ${groups[g].map(p => {
          const on = isOwner ? true : __teamPending.has(p.key);
          return `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:11px 12px;background:#0a0a0a;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:12.5px;color:#fff;font-weight:600;">${escapeHtml(p.label)}</div>
                <div style="font-size:11px;color:#888;margin-top:2px;">${escapeHtml(p.desc)}</div>
              </div>
              <label style="position:relative;display:inline-block;width:38px;height:22px;flex-shrink:0;margin-top:3px;cursor:${isOwner ? 'not-allowed' : 'pointer'};">
                <input type="checkbox" ${on ? 'checked' : ''} ${isOwner ? 'disabled' : ''} onchange="togglePending('${p.key}',this.checked)" style="opacity:0;width:0;height:0;">
                <span style="position:absolute;inset:0;background:${on ? '#3b82f6' : '#1a1a1a'};border:1px solid ${on ? '#3b82f6' : 'var(--border)'};border-radius:22px;transition:.2s;"></span>
                <span style="position:absolute;height:16px;width:16px;left:${on ? '19px' : '3px'};top:2px;background:#fff;border-radius:50%;transition:.2s;"></span>
              </label>
            </div>
          `;
        }).join('')}
      `).join('')}
    </div>
    ${!isOwner ? `
      <div style="position:sticky;bottom:-22px;margin:14px -22px -22px;padding:12px 22px;background:linear-gradient(180deg,transparent,#0e0e0e 30%);border-top:1px solid var(--border);display:flex;align-items:center;justify-content:flex-end;gap:10px;">
        ${dirty ? '<span style="margin-right:auto;font-size:11.5px;color:#f5c542;font-family:\'IBM Plex Mono\',monospace;">● Alterações não salvas</span>' : ''}
        <button class="kyc-btn secondary" ${!dirty ? 'disabled' : ''} onclick="discardTeamChanges()">Limpar</button>
        <button class="kyc-btn primary" ${!dirty ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''} onclick="saveTeamChanges()">Salvar</button>
      </div>
    ` : ''}
  `;
}

function togglePending(perm, on) {
  if (!__teamPending) return;
  if (on) __teamPending.add(perm); else __teamPending.delete(perm);
  renderPermsPane();
}

function discardTeamChanges() {
  if (!__teamOriginal) return;
  __teamPending = new Set(__teamOriginal);
  renderPermsPane();
}

async function saveTeamChanges() {
  if (!__teamSelected || !__teamPending) return;
  try {
    const r = await fetch(`/api/team/permissions/${__teamSelected}`, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: [...__teamPending] })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha ao salvar', 'err');
    toast('Permissões salvas');
    const m = __teamMembers.find(x => x.id === __teamSelected);
    if (m) m.permissions = [...__teamPending];
    __teamOriginal = new Set(__teamPending);
    renderPermsPane();
  } catch (e) { toast(e.message, 'err'); }
}

// ===== Modal de busca de usuario pra adicionar =====
let __userSearchTimer = null;

function openAddMemberPrompt() {
  document.getElementById('modal-add-member')?.classList.add('open');
  setTimeout(() => document.getElementById('user-search-input')?.focus(), 50);
}

function onUserSearchInput(v) {
  clearTimeout(__userSearchTimer);
  const q = v.trim();
  const out = document.getElementById('user-search-results');
  if (q.length < 2) { out.innerHTML = '<div style="color:#666;font-size:12.5px;text-align:center;padding:24px;">Digite para pesquisar usuários</div>'; return; }
  __userSearchTimer = setTimeout(async () => {
    try {
      const r = await fetch('/api/team/users/search?q=' + encodeURIComponent(q), { credentials: 'same-origin' });
      const list = await r.json();
      if (!Array.isArray(list) || !list.length) { out.innerHTML = '<div style="color:#666;font-size:12.5px;text-align:center;padding:24px;">Nenhum usuário encontrado</div>'; return; }
      out.innerHTML = list.map(u => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;cursor:${u.already_member ? 'default' : 'pointer'};${u.already_member ? 'opacity:.4;' : 'background:#0a0a0a;'}" ${!u.already_member ? `onclick="addMemberById(${u.id})"` : ''}>
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#8b6fff,#5865f2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;${u.discord_avatar ? `background:url('${escapeAttr(u.discord_avatar)}') center/cover;` : ''}">${u.discord_avatar ? '' : (u.display_name || u.email || '?').charAt(0).toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12.5px;color:#fff;font-weight:600;">${escapeHtml(u.display_name || u.discord_tag || u.email)}</div>
            <div style="font-size:10.5px;color:#666;font-family:'IBM Plex Mono',monospace;">${escapeHtml(u.discord_id || u.email)}</div>
          </div>
          ${u.already_member ? '<span style="font-size:10px;color:#666;text-transform:uppercase;">membro</span>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'}
        </div>
      `).join('');
    } catch (e) { out.innerHTML = '<div style="color:#ff8a8a;font-size:12px;padding:14px;">' + e.message + '</div>'; }
  }, 250);
}

async function addMemberById(userId) {
  try {
    const r = await fetch('/api/team/members', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role: 'admin' })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    toast('Membro adicionado');
    closeModal('modal-add-member');
    __teamSelected = userId;
    loadTeamPerms();
  } catch (e) { toast(e.message, 'err'); }
}

async function removeMember(userId) {
  if (!confirm('Remover este membro da guild?')) return;
  try {
    const r = await fetch(`/api/team/members/${userId}`, { method: 'DELETE', credentials: 'same-origin' });
    if (!r.ok) return toast('Falha', 'err');
    toast('Membro removido');
    __teamSelected = null;
    loadTeamPerms();
  } catch (e) { toast(e.message, 'err'); }
}

// Hook: quando navegar pra equipe, carrega perms
const __origSp = window.sp;
if (typeof __origSp === 'function') {
  window.sp = function (page, el) {
    __origSp(page, el);
    if (page === 'equipe') loadTeamPerms();
  };
}

// ============ PERMISSÕES POR CARGO ============
let __teamRoles = [];
let __teamRoleSelected = null;
let __teamRolePending = null;
let __teamRoleOriginal = null;

function switchPermTab(tab) {
  document.querySelectorAll('.perm-tab').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.style.color = on ? '#fff' : '#666';
    b.style.borderBottomColor = on ? 'var(--primary)' : 'transparent';
  });
  document.getElementById('perm-pane-members').style.display = tab === 'members' ? 'grid' : 'none';
  document.getElementById('perm-pane-roles').style.display = tab === 'roles' ? 'grid' : 'none';
  if (tab === 'roles' && !__teamRoles.length) loadRolePerms();
}

async function loadRolePerms() {
  try {
    const [roles, meta] = await Promise.all([
      fetch('/api/team/roles', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []),
      __teamPerms.length ? Promise.resolve(__teamPerms) : fetch('/api/team/permissions/_meta', { credentials: 'same-origin' }).then(r => r.json())
    ]);
    __teamRoles = roles;
    __teamPerms = meta;
    renderRolesList();
    if (roles.length && !__teamRoleSelected) selectRole(roles[0].role_id);
  } catch (e) { console.warn('role perms', e.message); }
}

function renderRolesList() {
  const wrap = document.getElementById('team-roles-list');
  if (!wrap) return;
  if (!__teamRoles.length) {
    wrap.innerHTML = '<div style="color:#666;font-size:12px;padding:14px;text-align:center;">nenhum cargo encontrado<br><span style="font-size:10.5px;">(bot precisa estar conectado)</span></div>';
    return;
  }
  wrap.innerHTML = __teamRoles.map(r => `
    <div onclick="selectRole('${r.role_id}')" style="display:flex;align-items:center;gap:10px;padding:10px;background:${__teamRoleSelected === r.role_id ? '#1a1a1a' : '#0a0a0a'};border:1px solid ${__teamRoleSelected === r.role_id ? 'var(--primary)' : 'var(--border)'};border-radius:8px;cursor:pointer;">
      <div style="width:10px;height:10px;border-radius:50%;background:${r.color || '#7289da'};flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(r.role_name || r.role_id)}</div>
        <div style="font-size:10px;color:#666;font-family:'IBM Plex Mono',monospace;">${r.permissions.length} permissões</div>
      </div>
    </div>
  `).join('');
}

function selectRole(roleId) {
  if (__teamRolePending && hasRoleDirty()) {
    if (!confirm('Você tem alterações não salvas. Descartar?')) return;
  }
  __teamRoleSelected = roleId;
  const r = __teamRoles.find(x => x.role_id === roleId);
  if (!r) return;
  __teamRoleOriginal = new Set(r.permissions);
  __teamRolePending = new Set(r.permissions);
  renderRolesList();
  renderRolePermsPane();
}

function hasRoleDirty() {
  if (!__teamRolePending || !__teamRoleOriginal) return false;
  if (__teamRolePending.size !== __teamRoleOriginal.size) return true;
  for (const p of __teamRolePending) if (!__teamRoleOriginal.has(p)) return true;
  return false;
}

function renderRolePermsPane() {
  const r = __teamRoles.find(x => x.role_id === __teamRoleSelected);
  if (!r) return;
  const pane = document.getElementById('team-role-perms-pane');
  const groups = {};
  for (const p of __teamPerms) {
    const g = p.group || 'Outros';
    if (!groups[g]) groups[g] = [];
    groups[g].push(p);
  }
  const dirty = hasRoleDirty();
  const groupOrder = ['Principal', 'Geral', 'Moderação', 'Outros'];
  const sortedGroups = Object.keys(groups).sort((a, b) => {
    const ai = groupOrder.indexOf(a), bi = groupOrder.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  pane.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:12px;height:12px;border-radius:50%;background:${r.color || '#7289da'};"></div>
      <div style="font-size:13px;color:#fff;font-weight:700;">Permissões do cargo ${escapeHtml(r.role_name || r.role_id)}</div>
    </div>
    <div style="font-size:11.5px;color:#888;margin-bottom:14px;">Membros com este cargo herdam estas permissões automaticamente.</div>
    <div style="max-height:520px;overflow-y:auto;padding-right:6px;">
      ${sortedGroups.map(g => `
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#666;font-family:'IBM Plex Mono',monospace;margin:14px 0 8px;">${escapeHtml(g)}</div>
        ${groups[g].map(p => {
          const on = __teamRolePending.has(p.key);
          return `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:11px 12px;background:#0a0a0a;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:12.5px;color:#fff;font-weight:600;">${escapeHtml(p.label)}</div>
                <div style="font-size:11px;color:#888;margin-top:2px;">${escapeHtml(p.desc)}</div>
              </div>
              <label style="position:relative;display:inline-block;width:38px;height:22px;cursor:pointer;">
                <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleRolePending('${p.key}',this.checked)" style="opacity:0;width:0;height:0;">
                <span style="position:absolute;inset:0;background:${on ? '#3b82f6' : '#1a1a1a'};border:1px solid ${on ? '#3b82f6' : 'var(--border)'};border-radius:22px;transition:.2s;"></span>
                <span style="position:absolute;height:16px;width:16px;left:${on ? '19px' : '3px'};top:2px;background:#fff;border-radius:50%;transition:.2s;"></span>
              </label>
            </div>
          `;
        }).join('')}
      `).join('')}
    </div>
    <div style="position:sticky;bottom:-22px;margin:14px -22px -22px;padding:12px 22px;background:linear-gradient(180deg,transparent,#0e0e0e 30%);border-top:1px solid var(--border);display:flex;align-items:center;justify-content:flex-end;gap:10px;">
      ${dirty ? '<span style="margin-right:auto;font-size:11.5px;color:#f5c542;font-family:\'IBM Plex Mono\',monospace;">● Alterações não salvas</span>' : ''}
      <button class="kyc-btn secondary" ${!dirty ? 'disabled' : ''} onclick="discardRoleChanges()">Limpar</button>
      <button class="kyc-btn primary" ${!dirty ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''} onclick="saveRoleChanges()">Salvar</button>
    </div>
  `;
}

function toggleRolePending(perm, on) {
  if (!__teamRolePending) return;
  if (on) __teamRolePending.add(perm); else __teamRolePending.delete(perm);
  renderRolePermsPane();
}

function discardRoleChanges() {
  if (!__teamRoleOriginal) return;
  __teamRolePending = new Set(__teamRoleOriginal);
  renderRolePermsPane();
}

async function saveRoleChanges() {
  if (!__teamRoleSelected || !__teamRolePending) return;
  const r = __teamRoles.find(x => x.role_id === __teamRoleSelected);
  try {
    const resp = await fetch(`/api/team/roles/${__teamRoleSelected}/permissions`, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: [...__teamRolePending], role_name: r?.role_name })
    });
    const j = await resp.json();
    if (!resp.ok) return toast(j.error || 'Falha', 'err');
    toast('Permissões do cargo salvas');
    if (r) r.permissions = [...__teamRolePending];
    __teamRoleOriginal = new Set(__teamRolePending);
    renderRolesList();
    renderRolePermsPane();
  } catch (e) { toast(e.message, 'err'); }
}

// ============ ADMIN KYC (owner only) ============
async function loadVerifications(status, btn) {
  if (btn) {
    document.querySelectorAll('.vf-tab').forEach(b => {
      b.style.background = 'transparent';
      b.style.borderColor = 'var(--border)';
      b.style.color = '#888';
    });
    btn.style.background = '#1a1a1a';
    btn.style.borderColor = 'var(--primary)';
    btn.style.color = '#fff';
  }
  try {
    const qs = status ? '?status=' + status : '';
    const r = await fetch('/api/verification/admin/list' + qs, { credentials: 'same-origin' });
    if (!r.ok) {
      document.getElementById('verif-tbody').innerHTML = '<tr><td colspan="6" style="color:#ff6b6b">sem permissão (apenas owner)</td></tr>';
      return;
    }
    const rows = await r.json();
    document.getElementById('verif-tbody').innerHTML = rows.length ? rows.map(v => {
      const docMasked = v.cpf_cnpj ? (v.cpf_cnpj.slice(0, 3) + '***' + v.cpf_cnpj.slice(-2)) : '—';
      const statusColor = { approved: '#22c55e', pending_review: '#f5c542', rejected: '#ef4444', pending_payment: '#888', pending_proof: '#888' }[v.status] || '#888';
      const statusLabel = { approved: 'aprovada', pending_review: 'em análise', rejected: 'rejeitada', pending_payment: 'aguardando pagamento', pending_proof: 'aguardando comprovante' }[v.status] || v.status;
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#8b6fff,#5865f2);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;${v.discord_avatar ? `background:url('${escapeAttr(v.discord_avatar)}') center/cover;` : ''}">${v.discord_avatar ? '' : (v.display_name || v.email || '?').charAt(0).toUpperCase()}</div>
              <div>
                <div style="color:#fff;font-size:12px;">${escapeHtml(v.display_name || v.discord_tag || v.email)}</div>
                <div style="color:#666;font-size:10px;font-family:'IBM Plex Mono',monospace;">${escapeHtml(v.email)}</div>
              </div>
            </div>
          </td>
          <td style="font-family:'IBM Plex Mono',monospace;font-size:11px;">${escapeHtml(docMasked)}</td>
          <td style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#aaa;">${escapeHtml(v.pix_key)}</td>
          <td><span style="font-size:10px;padding:3px 8px;border-radius:10px;background:${statusColor}22;color:${statusColor};font-weight:600;text-transform:uppercase;">${statusLabel}</span></td>
          <td>${v.has_proof ? `<a href="/api/verification/admin/${v.user_id}/proof" target="_blank" style="color:#3b82f6;font-size:11px;">ver →</a>` : '<span style="color:#666;font-size:11px;">—</span>'}</td>
          <td>
            ${v.status === 'pending_review' || v.status === 'rejected' ? `<button class="btn-w" style="padding:5px 10px;font-size:11px;margin-right:4px;" onclick="reviewKyc(${v.user_id},'approve')">aprovar</button>` : ''}
            ${v.status === 'pending_review' || v.status === 'approved' ? `<button class="btn-g" style="padding:5px 10px;font-size:11px;color:#ff8a8a;border-color:rgba(255,107,107,.3);" onclick="reviewKyc(${v.user_id},'reject')">rejeitar</button>` : ''}
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="6" style="color:#666;text-align:center;padding:30px;">nenhuma verificação</td></tr>';
  } catch (e) { console.warn(e); }
}

async function reviewKyc(userId, action) {
  let reason = '';
  if (action === 'reject') {
    reason = prompt('Motivo da rejeição:');
    if (!reason) return;
  }
  try {
    const r = await fetch(`/api/verification/${userId}/review`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    toast(action === 'approve' ? 'Verificação aprovada' : 'Verificação rejeitada');
    const active = document.querySelector('.vf-tab[style*="rgb(139, 111, 255)"]') || document.querySelector('.vf-tab.active') || document.querySelector('.vf-tab');
    const status = active?.dataset.vf || 'pending_review';
    loadVerifications(status, active);
    updateVerifBadge();
  } catch (e) { toast(e.message, 'err'); }
}

async function updateVerifBadge() {
  try {
    const r = await fetch('/api/verification/admin/list?status=pending_review', { credentials: 'same-origin' });
    if (!r.ok) return;
    const rows = await r.json();
    const nav = document.getElementById('nav-verif');
    const badge = document.getElementById('verif-badge');
    if (nav) nav.style.display = 'flex';
    if (badge) {
      if (rows.length > 0) { badge.style.display = 'inline-block'; badge.textContent = rows.length; }
      else badge.style.display = 'none';
    }
  } catch {}
}

// Hook page
const __origSp2 = window.sp;
if (typeof __origSp2 === 'function' && !window.__spHookedV2) {
  window.__spHookedV2 = true;
  window.sp = function (page, el) {
    __origSp2(page, el);
    if (page === 'verificacoes') loadVerifications('pending_review', document.querySelector('.vf-tab[data-vf="pending_review"]'));
  };
}
setTimeout(updateVerifBadge, 1500);
setInterval(updateVerifBadge, 90000);

// ============ BRANDING ============
async function loadBranding() {
  try {
    const j = await fetch('/api/features/branding', { credentials: 'same-origin' }).then(r => r.json());
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('brand-bot-name', j.bot_name); set('brand-bot-avatar', j.bot_avatar_url);
    set('brand-color', j.color || '#5865f2'); set('brand-tagline', j.tagline);
    set('brand-welcome', j.welcome); set('brand-goodbye', j.goodbye); set('brand-sale-dm', j.sale_dm);
  } catch {}
}
async function saveBranding() {
  const body = {
    bot_name: document.getElementById('brand-bot-name').value,
    bot_avatar_url: document.getElementById('brand-bot-avatar').value,
    color: document.getElementById('brand-color').value,
    tagline: document.getElementById('brand-tagline').value,
    welcome: document.getElementById('brand-welcome')?.value,
    goodbye: document.getElementById('brand-goodbye')?.value,
    sale_dm: document.getElementById('brand-sale-dm')?.value
  };
  try {
    const r = await fetch('/api/features/branding', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return toast('Falha ao salvar', 'err');
    toast('Aparência salva');
  } catch (e) { toast(e.message, 'err'); }
}
async function saveBrandingMessages() { return saveBranding(); }

// ============ RECURSOS / FEATURES ============
async function loadFeatures() {
  const grid = document.getElementById('features-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="color:#666;padding:20px;">carregando...</div>';
  try {
    const list = await fetch('/api/features/features', { credentials: 'same-origin' }).then(r => r.json());
    grid.innerHTML = list.map(f => `
      <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <div style="font-size:22px;">${f.icon}</div>
            <div style="min-width:0;">
              <div style="color:#fff;font-weight:700;font-size:13px;">${escapeHtml(f.label)}</div>
              <div style="color:#888;font-size:11px;margin-top:2px;line-height:1.4;">${escapeHtml(f.desc)}</div>
            </div>
          </div>
          <label style="position:relative;display:inline-block;width:38px;height:22px;flex-shrink:0;cursor:pointer;">
            <input type="checkbox" ${f.enabled ? 'checked' : ''} onchange="toggleFeature('${f.key}',this.checked)" style="opacity:0;width:0;height:0;">
            <span style="position:absolute;inset:0;background:${f.enabled ? '#3b82f6' : '#1a1a1a'};border:1px solid ${f.enabled ? '#3b82f6' : 'var(--border)'};border-radius:22px;transition:.2s;"></span>
            <span style="position:absolute;height:16px;width:16px;left:${f.enabled ? '19px' : '3px'};top:2px;background:#fff;border-radius:50%;transition:.2s;"></span>
          </label>
        </div>
      </div>
    `).join('');
  } catch (e) { grid.innerHTML = '<div style="color:#ff6b6b;padding:20px;">' + e.message + '</div>'; }
}

async function toggleFeature(key, enabled) {
  try {
    await fetch('/api/features/features/' + key, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
    toast(enabled ? 'Módulo ativado' : 'Módulo desativado');
  } catch (e) { toast(e.message, 'err'); }
}

// ============ PROTEÇÃO ============
// ============ PROTECAO 7 TABS ============
let __protMeta = null, __protCfg = null, __protTab = 'anti_fake';
// Backwards-compat: backend agora retorna { structure, schemas, punicoes, rule_types }
function protStructure() { return __protMeta?.structure || __protMeta || {}; }
function protRuleType(key) { return (__protMeta?.rule_types || {})[key]; }
function protPunicoes() { return __protMeta?.punicoes || [
  { value: 'banir', label: 'Banir' },
  { value: 'avisar', label: 'Apenas Avisar' }
]; }

async function loadProtection() {
  if (!document.getElementById('prot-tabs')) return;
  try {
    const [meta, cfg] = await Promise.all([
      fetch('/api/protection-v2/_meta', { credentials: 'same-origin' }).then(r => r.json()),
      fetch('/api/protection-v2', { credentials: 'same-origin' }).then(r => r.json())
    ]);
    __protMeta = meta; __protCfg = cfg || {};
    renderProtTabs();
    renderProtTab();
  } catch (e) { console.warn('protection', e.message); }
}

function renderProtTabs() {
  const wrap = document.getElementById('prot-tabs');
  if (!wrap || !__protMeta) return;
  wrap.innerHTML = Object.entries(protStructure()).map(([id, g]) => `
    <button onclick="switchProtTab('${id}')" style="background:transparent;border:0;color:${__protTab === id ? '#fff' : '#666'};padding:10px 14px;font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;border-bottom:2px solid ${__protTab === id ? 'var(--primary)' : 'transparent'};">${escapeHtml(g.label)}</button>
  `).join('');
}

function switchProtTab(id) {
  __protTab = id;
  renderProtTabs();
  renderProtTab();
}

function renderProtTab() {
  const wrap = document.getElementById('prot-tab-body');
  if (!wrap || !__protMeta) return;
  const g = protStructure()[__protTab];
  if (!g) return;
  const tabCfg = __protCfg[__protTab] || {};
  const isPermsTab = __protTab === 'permissoes_comandos';
  const isGlobalToggle = ['anti_fake', 'anti_spam'].includes(__protTab);

  wrap.innerHTML = `
    <div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b9a8ff" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <div style="font-size:14px;font-weight:700;color:#fff;">${escapeHtml(g.label)}</div>
      </div>
      <div style="font-size:11.5px;color:#b9a8ff;margin-top:3px;margin-left:22px;">${escapeHtml(g.desc)}</div>
    </div>
    ${isGlobalToggle && !tabCfg.enabled ? `
      <div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:10px 14px;margin-bottom:12px;color:#ff8a8a;font-size:11.5px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:5px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
        Desativado globalmente - Ative o sistema de proteção para que as regras tenham efeito.
      </div>` : ''}
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${g.rules.map(r => {
        if (isPermsTab) {
          return `
            <details style="background:#0a0a0a;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
              <summary style="padding:12px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;list-style:none;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:30px;height:30px;border-radius:7px;background:#1a1a1a;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:#666;font-family:'IBM Plex Mono',monospace;font-size:13px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                  </div>
                  <div>
                    <div style="color:#fff;font-weight:700;font-size:13px;font-family:'IBM Plex Mono',monospace;">${escapeHtml(r.label)}</div>
                    <div style="color:#888;font-size:11px;margin-top:2px;">${escapeHtml(r.desc)}</div>
                  </div>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </summary>
              <div style="padding:12px 14px;border-top:1px solid var(--border);background:#0e0e0e;">
                <div style="font-size:11px;color:#888;margin-bottom:8px;">Cargos permitidos (separados por vírgula):</div>
                <input type="text" value="${escapeAttr((tabCfg[r.key] || []).join(', '))}" data-perm="${escapeAttr(r.key)}" oninput="updateProtField('${r.key}', this.value.split(',').map(s=>s.trim()).filter(Boolean))" class="inp" placeholder="ID dos cargos">
              </div>
            </details>
          `;
        }
        const on = !!tabCfg[r.key];
        return `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:12px 14px;background:#0a0a0a;border:1px solid var(--border);border-radius:8px;">
            <div style="display:flex;align-items:flex-start;gap:11px;flex:1;min-width:0;">
              <div style="width:30px;height:30px;border-radius:7px;background:#1a1a1a;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:#666;flex-shrink:0;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <div style="color:#fff;font-weight:700;font-size:13px;">${escapeHtml(r.label)}</div>
                <div style="color:#888;font-size:11px;margin-top:2px;">${escapeHtml(r.desc)}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              <label style="position:relative;display:inline-block;width:38px;height:22px;cursor:pointer;">
                <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleProtField('${r.key}',this.checked)" style="opacity:0;width:0;height:0;">
                <span style="position:absolute;inset:0;background:${on ? '#22c55e' : '#1a1a1a'};border:1px solid ${on ? '#22c55e' : 'var(--border)'};border-radius:22px;transition:.2s;"></span>
                <span style="position:absolute;height:16px;width:16px;left:${on ? '19px' : '3px'};top:2px;background:#fff;border-radius:50%;transition:.2s;"></span>
              </label>
              <button onclick="openProtRuleModal('${escapeAttr(r.key)}','${escapeAttr(r.label)}')" style="background:#1a1a1a;border:1px solid var(--border);color:#aaa;border-radius:7px;padding:6px 10px;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Editar
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Expansão: Anti Fake e Anti Spam têm config adicional embaixo das regras
  if (__protTab === 'anti_fake') loadAntiFakeExpanded();
  if (__protTab === 'anti_spam') loadAntiSpamExpanded();
}

// ---------- Anti Fake expandido ----------
async function loadAntiFakeExpanded() {
  try {
    const cfg = await fetch('/api/protection-v2/anti-fake/config', { credentials: 'same-origin' }).then(r => r.json());
    const wrap = document.getElementById('prot-tab-body');
    if (!wrap) return;
    const html = `
      <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;margin-top:14px;">
        <div style="font-weight:700;color:#fff;font-size:13.5px;margin-bottom:12px;">Configuração avançada</div>
        <div style="margin-bottom:12px;">
          <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Dias Mínimos de Conta</label>
          <input id="af-dias-min" type="number" min="0" value="${cfg.dias_minimos_conta || 0}" class="inp" style="margin-top:5px;max-width:200px;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Status Blacklist <span style="text-transform:none;color:#666;">(um por linha)</span></label>
          <textarea id="af-status-bl" rows="4" placeholder="Digite um status por linha" class="inp" style="margin-top:5px;">${escapeHtml((cfg.status_blacklist || []).join('\n'))}</textarea>
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Nomes Blacklist <span style="text-transform:none;color:#666;">(um por linha)</span></label>
          <textarea id="af-nomes-bl" rows="4" placeholder="Digite um nome por linha" class="inp" style="margin-top:5px;">${escapeHtml((cfg.nomes_blacklist || []).join('\n'))}</textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button onclick="saveAntiFakeExpanded()" class="kyc-btn primary">Salvar configuração</button>
        </div>
      </div>
    `;
    const expanded = document.createElement('div');
    expanded.id = 'prot-expanded';
    expanded.innerHTML = html;
    const old = document.getElementById('prot-expanded'); if (old) old.remove();
    wrap.appendChild(expanded);
  } catch (e) { console.warn('antiFakeExpanded', e.message); }
}

async function saveAntiFakeExpanded() {
  const body = {
    enabled: true,
    dias_minimos_conta: parseInt(document.getElementById('af-dias-min').value) || 0,
    status_blacklist: (document.getElementById('af-status-bl').value || '').split('\n').map(s => s.trim()).filter(Boolean),
    nomes_blacklist: (document.getElementById('af-nomes-bl').value || '').split('\n').map(s => s.trim()).filter(Boolean)
  };
  try {
    const r = await fetch('/api/protection-v2/anti-fake/config', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return toast('Falha', 'err');
    toast('Configuração salva');
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- Anti Spam mega-painel ----------
let __asCfg = null;

async function loadAntiSpamExpanded() {
  try {
    __asCfg = await fetch('/api/protection-v2/anti-spam/config', { credentials: 'same-origin' }).then(r => r.json());
    const wrap = document.getElementById('prot-tab-body');
    if (!wrap) return;
    const expanded = document.createElement('div');
    expanded.id = 'prot-expanded';
    expanded.innerHTML = renderAntiSpamHtml();
    const old = document.getElementById('prot-expanded'); if (old) old.remove();
    wrap.appendChild(expanded);
  } catch (e) { console.warn('antiSpamExpanded', e.message); }
}

function asFilterDropdowns(prefix) {
  const c = __asCfg[prefix] || {};
  return `
    <div style="background:rgba(245,197,66,.06);border:1px solid rgba(245,197,66,.25);border-radius:8px;padding:9px 12px;margin:10px 0;color:#d4b860;font-size:11px;display:flex;align-items:flex-start;gap:8px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
      <span><b>Dica:</b> Lista vazia em "Aplicar somente" = aplica em todos. Itens em "Ignorar" sempre excluem do filtro.</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
      ${[
        ['aplicar_canais', 'Aplicar somente nos canais', 'Todos'],
        ['ignorar_canais', 'Ignorar canais', 'Nenhum'],
        ['aplicar_cargos', 'Aplicar somente nos cargos', 'Todos'],
        ['ignorar_cargos', 'Ignorar cargos', 'Nenhum'],
        ['aplicar_usuarios', 'Aplicar somente nos usuários', 'Todos'],
        ['ignorar_usuarios', 'Ignorar usuários', 'Nenhum']
      ].map(([k, l, ph]) => `
        <div>
          <label style="font-size:10px;color:#888;font-family:'IBM Plex Mono',monospace;">${l}</label>
          <input type="text" data-as-${prefix}="${k}" value="${escapeAttr((c[k] || []).join(', '))}" placeholder="${ph}" class="inp" style="margin-top:4px;font-size:11px;font-family:'IBM Plex Mono',monospace;">
        </div>
      `).join('')}
    </div>
  `;
}

function renderAntiSpamHtml() {
  const c = __asCfg;
  return `
    <div id="prot-expanded-content" style="margin-top:14px;">
      <!-- Configurações Gerais -->
      <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;">
        <div style="font-weight:700;color:#fff;font-size:12.5px;margin-bottom:12px;">Configurações Gerais</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <label style="display:flex;align-items:center;gap:8px;padding:9px;background:#0e0e0e;border:1px solid var(--border);border-radius:7px;cursor:pointer;">
            <input type="checkbox" id="as-geral-comandos" ${c.geral?.aplicar_comandos ? 'checked' : ''} style="accent-color:#8b6fff;">
            <div>
              <div style="font-size:12px;color:#fff;font-weight:600;">Aplicar em comandos</div>
              <div style="font-size:10.5px;color:#666;">Mensagens de comandos passarem pelas regras</div>
            </div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:9px;background:#0e0e0e;border:1px solid var(--border);border-radius:7px;cursor:pointer;">
            <input type="checkbox" id="as-geral-admin" ${c.geral?.ignorar_admin ? 'checked' : ''} style="accent-color:#8b6fff;">
            <div>
              <div style="font-size:12px;color:#fff;font-weight:600;">Ignorar Administradores</div>
              <div style="font-size:10.5px;color:#666;">Membros com admin não serão afetados</div>
            </div>
          </label>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
          <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Canal de Logs</label><input id="as-geral-canal-logs" type="text" value="${escapeAttr(c.geral?.canal_logs || '')}" placeholder="Nenhum" class="inp" style="margin-top:4px;"></div>
          <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Canais Ignorados (Global)</label><input id="as-geral-canais-ig" type="text" value="${escapeAttr((c.geral?.canais_ignorados || []).join(', '))}" placeholder="Selecione canais globais" class="inp" style="margin-top:4px;"></div>
          <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Cargos Ignorados (Global)</label><input id="as-geral-cargos-ig" type="text" value="${escapeAttr((c.geral?.cargos_ignorados || []).join(', '))}" placeholder="Selecione cargos globais" class="inp" style="margin-top:4px;"></div>
          <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Usuários Ignorados (Global)</label><input id="as-geral-usuarios-ig" type="text" value="${escapeAttr((c.geral?.usuarios_ignorados || []).join(', '))}" placeholder="Nenhum" class="inp" style="margin-top:4px;"></div>
        </div>
      </div>

      <!-- Ação Padrão -->
      <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;">
        <div style="font-weight:700;color:#fff;font-size:12.5px;margin-bottom:12px;">Ação Padrão para Violações</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <label style="display:flex;align-items:center;gap:8px;padding:9px;background:#0e0e0e;border:1px solid var(--border);border-radius:7px;cursor:pointer;">
            <input type="checkbox" id="as-acao-apagar" ${c.acao_padrao?.apagar_mensagem ? 'checked' : ''} style="accent-color:#8b6fff;">
            <div><div style="font-size:12px;color:#fff;font-weight:600;">Apagar Mensagem</div><div style="font-size:10.5px;color:#666;">Remove a mensagem no ato</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:9px;background:#0e0e0e;border:1px solid var(--border);border-radius:7px;cursor:pointer;">
            <input type="checkbox" id="as-acao-avisar" ${c.acao_padrao?.avisar_usuario ? 'checked' : ''} style="accent-color:#8b6fff;">
            <div><div style="font-size:12px;color:#fff;font-weight:600;">Avisar Usuário</div><div style="font-size:10.5px;color:#666;">Manda o aviso configurado</div></div>
          </label>
          <div style="padding:9px;background:#0e0e0e;border:1px solid var(--border);border-radius:7px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:#fff;font-weight:600;">Timeout (Segundos)<span id="as-timeout-val" style="font-family:'IBM Plex Mono',monospace;color:#b9a8ff;">${c.acao_padrao?.timeout_segundos || 30} s</span></div>
            <input type="range" id="as-timeout" min="0" max="3600" value="${c.acao_padrao?.timeout_segundos || 30}" oninput="document.getElementById('as-timeout-val').textContent=this.value+' s'" style="width:100%;accent-color:#8b6fff;margin-top:6px;">
            <div style="font-size:10.5px;color:#666;margin-top:2px;">Tempo que o usuário ficará mutado</div>
          </div>
        </div>
      </div>

      <!-- Sistema de Tolerância -->
      <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;border-left:3px solid #8b6fff;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;color:#fff;font-size:12.5px;">Sistema de Tolerância</div>
            <div style="font-size:11px;color:#888;margin-top:2px;">Aplica punições progressivas baseadas em strikes</div>
          </div>
          <label style="position:relative;display:inline-block;width:38px;height:22px;cursor:pointer;">
            <input type="checkbox" id="as-tolerancia" ${c.tolerancia_enabled ? 'checked' : ''} style="opacity:0;width:0;height:0;">
            <span style="position:absolute;inset:0;background:${c.tolerancia_enabled ? '#22c55e' : '#1a1a1a'};border:1px solid var(--border);border-radius:22px;"></span>
            <span style="position:absolute;height:16px;width:16px;left:${c.tolerancia_enabled ? '19px' : '3px'};top:2px;background:#fff;border-radius:50%;"></span>
          </label>
        </div>
      </div>

      ${asSubCard('Anti Flood', 'Detecta o envio de várias mensagens em curto intervalo.', 'flood', c.flood, [
        ['max_mensagens', 'Máximo de mensagens', 1, 30],
        ['janela', 'Janela de tempo (s)', 1, 60]
      ])}
      ${asSubCard('Anti Spam', 'Detecta e bloqueia o envio de mensagens repetitivas ou muito similares.', 'spam', c.spam, [
        ['mensagens_similares', 'Mensagens similares máx.', 1, 30],
        ['janela_analise', 'Janela de análise (s)', 1, 120],
        ['tamanho_minimo', 'Tamanho mínimo', 1, 50]
      ])}
      ${asSubCard('Anti Garbage (Caracteres ou Repetição)', 'Bloqueia textos com proporção alta de caracteres estranhos ou letras excessivamente repetidas (ex: loooool).', 'garbage', c.garbage, [
        ['proporcao_max', 'Proporção Máx. Não-Alfanumérico', 0.1, 1, 0.05],
        ['max_repeticao', 'Máx. repetição mesma letra', 2, 50]
      ], true)}
      ${asLinkCard(c.link)}
      ${asSubCard('Anti Padrão em Massa (Raids)', 'Detecta comportamento repetitivo de múltiplos usuários simultaneamente (ex: botnets atacando chat).', 'raid', c.raid, [
        ['janela_tempo', 'Janela de tempo (s)', 1, 600],
        ['min_usuarios', 'Mínimo de usuários', 1, 100],
        ['min_mensagens', 'Mínimo de mensagens', 1, 200],
        ['min_caracteres', 'Tamanho mín. caracteres', 1, 100]
      ])}

      <div style="display:flex;justify-content:flex-end;margin-top:14px;">
        <button onclick="saveAntiSpamExpanded()" class="kyc-btn primary">Salvar configuração Anti Spam</button>
      </div>
    </div>
  `;
}

function asSubCard(title, desc, key, val, sliders, skipFilters) {
  return `
    <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;border-left:3px solid ${val?.enabled ? '#22c55e' : 'var(--border)'};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <div style="font-weight:700;color:#fff;font-size:12.5px;">${escapeHtml(title)}</div>
          <div style="font-size:11px;color:#b9a8ff;margin-top:2px;">${escapeHtml(desc)}</div>
        </div>
        <label style="position:relative;display:inline-block;width:38px;height:22px;cursor:pointer;">
          <input type="checkbox" data-as-${key}-enabled ${val?.enabled ? 'checked' : ''} style="opacity:0;width:0;height:0;">
          <span style="position:absolute;inset:0;background:${val?.enabled ? '#22c55e' : '#1a1a1a'};border:1px solid var(--border);border-radius:22px;"></span>
          <span style="position:absolute;height:16px;width:16px;left:${val?.enabled ? '19px' : '3px'};top:2px;background:#fff;border-radius:50%;"></span>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${sliders.length},1fr);gap:10px;">
        ${sliders.map(s => {
          const [k, l, mn, mx, step] = s;
          return `
            <div>
              <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#fff;font-weight:600;">${escapeHtml(l)}<span data-as-${key}-${k}-val style="font-family:'IBM Plex Mono',monospace;color:#b9a8ff;">${val?.[k] ?? mn}</span></div>
              <input type="range" data-as-${key}="${k}" min="${mn}" max="${mx}" ${step ? 'step="' + step + '"' : ''} value="${val?.[k] ?? mn}" oninput="document.querySelector('[data-as-${key}-${k}-val]').textContent=this.value" style="width:100%;accent-color:#8b6fff;margin-top:4px;">
            </div>
          `;
        }).join('')}
      </div>
      ${skipFilters ? '' : asFilterDropdowns(key)}
    </div>
  `;
}

function asLinkCard(val) {
  return `
    <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;border-left:3px solid ${val?.enabled ? '#22c55e' : 'var(--border)'};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <div style="font-weight:700;color:#fff;font-size:12.5px;">Anti Link / Convites</div>
          <div style="font-size:11px;color:#b9a8ff;margin-top:2px;">Filtra URLs enviadas no chat com configurações de bloqueio e liberação.</div>
        </div>
        <label style="position:relative;display:inline-block;width:38px;height:22px;cursor:pointer;">
          <input type="checkbox" data-as-link-enabled ${val?.enabled ? 'checked' : ''} style="opacity:0;width:0;height:0;">
          <span style="position:absolute;inset:0;background:${val?.enabled ? '#22c55e' : '#1a1a1a'};border:1px solid var(--border);border-radius:22px;"></span>
          <span style="position:absolute;height:16px;width:16px;left:${val?.enabled ? '19px' : '3px'};top:2px;background:#fff;border-radius:50%;"></span>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <label style="display:flex;align-items:center;gap:8px;padding:9px;background:#0e0e0e;border:1px solid var(--border);border-radius:7px;cursor:pointer;">
          <input type="checkbox" data-as-link="bloquear_todos" ${val?.bloquear_todos ? 'checked' : ''} style="accent-color:#8b6fff;">
          <div><div style="font-size:12px;color:#fff;font-weight:600;">Bloquear Todos</div><div style="font-size:10.5px;color:#666;">Permite qualquer domínio não liberado</div></div>
        </label>
        <label style="display:flex;align-items:center;gap:8px;padding:9px;background:#0e0e0e;border:1px solid var(--border);border-radius:7px;cursor:pointer;">
          <input type="checkbox" data-as-link="permitir_discord_invites" ${val?.permitir_discord_invites ? 'checked' : ''} style="accent-color:#8b6fff;">
          <div><div style="font-size:12px;color:#fff;font-weight:600;">Permitir Convites Discord</div><div style="font-size:10.5px;color:#666;">discord.gg/ ignorado</div></div>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Domínios Permitidos (um por linha)</label><textarea data-as-link-domain="dominios_permitidos" rows="3" placeholder="youtube.com&#10;github.com" class="inp" style="margin-top:4px;font-family:'IBM Plex Mono',monospace;font-size:11px;">${escapeHtml((val?.dominios_permitidos || []).join('\n'))}</textarea></div>
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Domínios Bloqueados (um por linha)</label><textarea data-as-link-domain="dominios_bloqueados" rows="3" placeholder="dominioruim.com" class="inp" style="margin-top:4px;font-family:'IBM Plex Mono',monospace;font-size:11px;">${escapeHtml((val?.dominios_bloqueados || []).join('\n'))}</textarea></div>
      </div>
      ${asFilterDropdowns('link')}
    </div>
  `;
}

async function saveAntiSpamExpanded() {
  const csvField = sel => {
    const el = document.querySelector(sel);
    return el ? (el.value || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  };
  const collectFilters = prefix => ({
    aplicar_canais: csvField(`[data-as-${prefix}="aplicar_canais"]`),
    ignorar_canais: csvField(`[data-as-${prefix}="ignorar_canais"]`),
    aplicar_cargos: csvField(`[data-as-${prefix}="aplicar_cargos"]`),
    ignorar_cargos: csvField(`[data-as-${prefix}="ignorar_cargos"]`),
    aplicar_usuarios: csvField(`[data-as-${prefix}="aplicar_usuarios"]`),
    ignorar_usuarios: csvField(`[data-as-${prefix}="ignorar_usuarios"]`)
  });
  const num = sel => {
    const el = document.querySelector(sel);
    return el ? parseFloat(el.value) : null;
  };
  const checked = sel => !!document.querySelector(sel)?.checked;

  const body = {
    enabled: true,
    geral: {
      aplicar_comandos: checked('#as-geral-comandos'),
      ignorar_admin: checked('#as-geral-admin'),
      canal_logs: document.getElementById('as-geral-canal-logs')?.value || null,
      canais_ignorados: csvField('#as-geral-canais-ig'),
      cargos_ignorados: csvField('#as-geral-cargos-ig'),
      usuarios_ignorados: csvField('#as-geral-usuarios-ig')
    },
    acao_padrao: {
      apagar_mensagem: checked('#as-acao-apagar'),
      avisar_usuario: checked('#as-acao-avisar'),
      timeout_segundos: parseInt(document.getElementById('as-timeout').value) || 30
    },
    tolerancia_enabled: checked('#as-tolerancia'),
    flood: {
      enabled: checked('[data-as-flood-enabled]'),
      max_mensagens: parseInt(num('[data-as-flood="max_mensagens"]')) || 6,
      janela: parseInt(num('[data-as-flood="janela"]')) || 6,
      ...collectFilters('flood')
    },
    spam: {
      enabled: checked('[data-as-spam-enabled]'),
      mensagens_similares: parseInt(num('[data-as-spam="mensagens_similares"]')) || 4,
      janela_analise: parseInt(num('[data-as-spam="janela_analise"]')) || 20,
      tamanho_minimo: parseInt(num('[data-as-spam="tamanho_minimo"]')) || 6,
      ...collectFilters('spam')
    },
    garbage: {
      enabled: checked('[data-as-garbage-enabled]'),
      proporcao_max: parseFloat(num('[data-as-garbage="proporcao_max"]')) || 0.7,
      max_repeticao: parseInt(num('[data-as-garbage="max_repeticao"]')) || 12
    },
    link: {
      enabled: checked('[data-as-link-enabled]'),
      bloquear_todos: checked('[data-as-link="bloquear_todos"]'),
      permitir_discord_invites: checked('[data-as-link="permitir_discord_invites"]'),
      dominios_permitidos: (document.querySelector('[data-as-link-domain="dominios_permitidos"]')?.value || '').split('\n').map(s => s.trim()).filter(Boolean),
      dominios_bloqueados: (document.querySelector('[data-as-link-domain="dominios_bloqueados"]')?.value || '').split('\n').map(s => s.trim()).filter(Boolean),
      ...collectFilters('link')
    },
    raid: {
      enabled: checked('[data-as-raid-enabled]'),
      janela_tempo: parseInt(num('[data-as-raid="janela_tempo"]')) || 60,
      min_usuarios: parseInt(num('[data-as-raid="min_usuarios"]')) || 5,
      min_mensagens: parseInt(num('[data-as-raid="min_mensagens"]')) || 10,
      min_caracteres: parseInt(num('[data-as-raid="min_caracteres"]')) || 3,
      ...collectFilters('raid')
    }
  };
  try {
    const r = await fetch('/api/protection-v2/anti-spam/config', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return toast('Falha', 'err');
    toast('Anti Spam salvo');
  } catch (e) { toast(e.message, 'err'); }
}

function toggleProtField(key, on) {
  if (!__protCfg[__protTab]) __protCfg[__protTab] = {};
  __protCfg[__protTab][key] = !!on;
  renderProtTab();
  saveProtTab();
}

function updateProtField(key, value) {
  if (!__protCfg[__protTab]) __protCfg[__protTab] = {};
  __protCfg[__protTab][key] = value;
  saveProtTabDebounced();
}

let __protSaveTimer = null;
function saveProtTabDebounced() {
  clearTimeout(__protSaveTimer);
  __protSaveTimer = setTimeout(saveProtTab, 600);
}

async function saveProtTab() {
  try {
    await fetch('/api/protection-v2/' + __protTab, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(__protCfg[__protTab] || {})
    });
  } catch (e) { toast(e.message, 'err'); }
}

// ============ MODAL "Editar Regra de Proteção" reusável ============
function openProtRuleModal(ruleKey, ruleLabel, isGlobals) {
  const type = isGlobals ? 'globals' : (protRuleType(ruleKey) || 'defense');
  const tabCfg = __protCfg[__protTab] || {};
  const cur = isGlobals ? (tabCfg.globals || {}) : ((tabCfg.rules || {})[ruleKey] || {});
  document.getElementById('modal-prot-title').textContent = isGlobals
    ? 'Configurações Globais'
    : ruleLabel;
  const showLimite = type === 'monitoring' || type === 'defense';
  const body = `
    ${showLimite ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <div>
          <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Limite</label>
          <input id="prm-limite" type="number" min="1" value="${cur.limite || 3}" class="inp" style="margin-top:5px;">
        </div>
        <div>
          <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Intervalo (s)</label>
          <input id="prm-intervalo" type="number" min="1" value="${cur.intervalo || 60}" class="inp" style="margin-top:5px;">
        </div>
      </div>
    ` : ''}
    <div style="margin-bottom:14px;">
      <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Punição</label>
      <select id="prm-punicao" class="inp" style="margin-top:5px;">
        ${protPunicoes().map(p => `<option value="${p.value}" ${cur.punicao === p.value ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Cargos Imunes (IDs, vírgula)</label>
      <input id="prm-imunes" type="text" value="${escapeAttr((cur.cargos_imunes || []).join(', '))}" placeholder="Selecione cargos..." class="inp" style="margin-top:5px;">
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Canal de Logs</label>
      <input id="prm-canal" type="text" value="${escapeAttr(cur.canal_logs || '')}" placeholder="ID do canal (vazio = nenhum)" class="inp" style="margin-top:5px;">
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;">
      <button onclick="closeModal('modal-prot-rule')" class="kyc-btn secondary">Cancelar</button>
      <button onclick="saveProtRuleModal('${escapeAttr(ruleKey)}',${!!isGlobals})" class="kyc-btn primary">Salvar</button>
    </div>
  `;
  document.getElementById('modal-prot-body').innerHTML = body;
  document.getElementById('modal-prot-rule').classList.add('open');
}

async function saveProtRuleModal(ruleKey, isGlobals) {
  const get = id => document.getElementById(id);
  const data = {
    punicao: get('prm-punicao')?.value || 'banir',
    cargos_imunes: (get('prm-imunes')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
    canal_logs: get('prm-canal')?.value?.trim() || null
  };
  if (get('prm-limite')) data.limite = parseInt(get('prm-limite').value) || 3;
  if (get('prm-intervalo')) data.intervalo = parseInt(get('prm-intervalo').value) || 60;

  const path = isGlobals
    ? `/api/protection-v2/${__protTab}/globals`
    : `/api/protection-v2/${__protTab}/rule/${ruleKey}`;
  try {
    const r = await fetch(path, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); return toast(j.error || 'Falha ao salvar', 'err'); }
    toast('Configuração salva');
    // atualiza cache local
    if (!__protCfg[__protTab]) __protCfg[__protTab] = {};
    if (isGlobals) {
      __protCfg[__protTab].globals = { ...(__protCfg[__protTab].globals || {}), ...data };
    } else {
      if (!__protCfg[__protTab].rules) __protCfg[__protTab].rules = {};
      __protCfg[__protTab].rules[ruleKey] = { ...(__protCfg[__protTab].rules[ruleKey] || {}), ...data };
    }
    closeModal('modal-prot-rule');
  } catch (e) { toast(e.message, 'err'); }
}

// ============ ECLOUD ============
async function loadEcloud() {
  try {
    const j = await fetch('/api/features/ecloud', { credentials: 'same-origin' }).then(r => r.json());
    document.getElementById('ecloud-redirect').value = j.redirect_uri || '';
    document.getElementById('ecloud-target').value = j.target_guild || '';
  } catch {}
}
async function saveEcloud() {
  try {
    await fetch('/api/features/ecloud', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_guild: document.getElementById('ecloud-target').value.trim() }) });
    toast('eCloud salvo');
  } catch (e) { toast(e.message, 'err'); }
}

// ============ VIPs ============
let __vipTiers = [];
async function loadVips() {
  try {
    const j = await fetch('/api/features/vips', { credentials: 'same-origin' }).then(r => r.json());
    __vipTiers = j.tiers || [];
    renderVipTiers();
  } catch {}
}
function renderVipTiers() {
  const wrap = document.getElementById('vip-tiers');
  if (!wrap) return;
  wrap.innerHTML = __vipTiers.map((t, i) => `
    <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;">
      <input value="${escapeAttr(t.name)}" oninput="__vipTiers[${i}].name=this.value" placeholder="nome do tier" style="background:transparent;border:0;color:#fff;font-size:15px;font-weight:700;width:100%;outline:none;">
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:#888;font-family:'IBM Plex Mono',monospace;">a partir de R$</div>
      <input type="number" value="${t.min_spend || 0}" oninput="__vipTiers[${i}].min_spend=parseInt(this.value)||0" class="inp" style="margin-top:4px;">
      <div style="margin-top:8px;font-size:11px;color:#888;font-family:'IBM Plex Mono',monospace;">benefícios</div>
      <textarea class="inp" rows="2" oninput="__vipTiers[${i}].perks=this.value" style="margin-top:4px;">${escapeHtml(t.perks || '')}</textarea>
      <button class="btn-g" style="margin-top:8px;width:100%;color:#ff8a8a;border-color:rgba(255,107,107,.3);font-size:11px;" onclick="removeVipTier(${i})">remover</button>
    </div>
  `).join('') + `
    <div style="display:flex;align-items:flex-end;justify-content:flex-end;padding:14px;">
      <button class="btn-w" onclick="saveVipTiers()">salvar todos</button>
    </div>
  `;
}
function addVipTier() {
  __vipTiers.push({ name: 'Novo Tier', min_spend: 0, perks: '' });
  renderVipTiers();
}
function removeVipTier(i) {
  __vipTiers.splice(i, 1);
  renderVipTiers();
}
async function saveVipTiers() {
  try {
    await fetch('/api/features/vips', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tiers: __vipTiers }) });
    toast('Tiers salvos');
  } catch (e) { toast(e.message, 'err'); }
}

// Hook do sp pra carregar as pages quando entrar
const __origSp3 = window.sp;
if (typeof __origSp3 === 'function' && !window.__spHookedV3) {
  window.__spHookedV3 = true;
  window.sp = function (page, el) {
    __origSp3(page, el);
    if (page === 'personalizacao') loadBranding();
    if (page === 'recursos') loadFeatures();
    if (page === 'protecao') loadProtection();
    if (page === 'ecloud') loadEcloud();
    if (page === 'vips') loadVips();
  };
}

// ============ BOT SWITCHER (multi-bot) ============
let __botInstances = [];
let __activeBot = null;
let __botSwOpen = false;

async function loadBotSwitcher() {
  try {
    const j = await fetch('/api/bots', { credentials: 'same-origin' }).then(r => r.json());
    __botInstances = j.instances || [];
    __activeBot = __botInstances.find(b => b.id === j.active_id) || __botInstances[0];
    window.__activeBot = __activeBot;
    renderBotSwitcher();
  } catch (e) { console.warn('bot switcher', e.message); }
}

function renderBotSwitcher() {
  if (!__activeBot) return;
  const av = document.getElementById('bot-sw-avatar');
  const nm = document.getElementById('bot-sw-name');
  const id = document.getElementById('bot-sw-id');
  if (av) {
    if (__activeBot.avatar_url) {
      av.style.backgroundImage = `url('${__activeBot.avatar_url}')`;
      av.textContent = '';
    } else {
      av.style.backgroundImage = '';
      av.textContent = (__activeBot.name || '?').charAt(0).toUpperCase();
    }
  }
  if (nm) nm.textContent = __activeBot.nickname || __activeBot.name;
  const idEl = document.getElementById('bot-id-full');
  const fullId = __activeBot.discord_client_id || ('app-' + __activeBot.id);
  if (idEl) idEl.textContent = fullId;
  updateBreadcrumb();
  const status = document.getElementById('bot-sw-status');
  if (status) {
    const isActive = __activeBot.status === 'active' || !__activeBot.status;
    status.textContent = isActive ? 'Aplicação ativa' : 'Aplicação inativa';
    status.previousElementSibling && (status.previousElementSibling.style.background = isActive ? '#22c55e' : '#666');
  }
}

function toggleBotSwitcher(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('bot-sw-menu');
  __botSwOpen = !__botSwOpen;
  if (!__botSwOpen) { menu.style.display = 'none'; return; }
  menu.innerHTML = `
    ${__botInstances.map(b => `
      <div onclick="activateBot(${b.id})" style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid #131313;${b.id === __activeBot?.id ? 'background:#1a1a1a;' : ''}">
        <div style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#8b6fff,#5865f2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;${b.avatar_url ? `background:url('${escapeAttr(b.avatar_url)}') center/cover;` : ''}">${b.avatar_url ? '' : (b.name || '?').charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div style="color:#fff;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(b.name)}</div>
          <div style="color:#666;font-size:10px;font-family:'IBM Plex Mono',monospace;">${b.status} · ${b.plan}</div>
        </div>
        ${b.id === __activeBot?.id ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>
    `).join('')}
    <div onclick="openNewBotPrompt()" style="display:flex;align-items:center;gap:10px;padding:11px 12px;cursor:pointer;color:#3b82f6;font-weight:600;font-size:12.5px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      criar novo bot
    </div>
  `;
  menu.style.display = 'block';
  setTimeout(() => document.addEventListener('click', closeBotSwitcherOnce, { once: true }), 50);
}

function closeBotSwitcherOnce() {
  const m = document.getElementById('bot-sw-menu');
  if (m) m.style.display = 'none';
  __botSwOpen = false;
}

async function activateBot(id) {
  try {
    await fetch(`/api/bots/${id}/activate`, { method: 'POST', credentials: 'same-origin' });
    toast('bot ativado');
    closeBotSwitcherOnce();
    // recarrega pra trocar de contexto (guild/dados)
    setTimeout(() => location.reload(), 300);
  } catch (e) { toast(e.message, 'err'); }
}

async function openNewBotPrompt() {
  closeBotSwitcherOnce();
  const name = prompt('Nome do novo bot:');
  if (!name) return;
  try {
    const r = await fetch('/api/bots', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    toast('Bot criado! Vá em Credenciais pra configurar o token.');
    setTimeout(() => location.reload(), 600);
  } catch (e) { toast(e.message, 'err'); }
}

setTimeout(loadBotSwitcher, 600);

// ============ CONQUISTAS ============
async function loadAchievements() {
  try {
    const j = await fetch('/api/achievements', { credentials: 'same-origin' }).then(r => r.json());
    const totals = document.getElementById('ach-totals');
    const u = document.getElementById('ach-unlocked');
    const l = document.getElementById('ach-locked');
    if (!totals) return;

    const volBRL = (j.totals.volume_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    totals.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(139,111,255,.10),rgba(139,111,255,.02));border:1px solid rgba(139,111,255,.3);border-radius:12px;padding:18px;">
        <div style="font-size:11px;text-transform:uppercase;color:#a99cff;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">volume total</div>
        <div style="font-size:26px;font-weight:800;color:#fff;margin-top:6px;">R$ ${volBRL}</div>
      </div>
      <div style="background:linear-gradient(135deg,rgba(34,197,94,.10),rgba(34,197,94,.02));border:1px solid rgba(34,197,94,.3);border-radius:12px;padding:18px;">
        <div style="font-size:11px;text-transform:uppercase;color:#7dd3a4;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">vendas pagas</div>
        <div style="font-size:26px;font-weight:800;color:#fff;margin-top:6px;">${j.totals.sales_count}</div>
      </div>
    `;

    document.getElementById('ach-unlocked-count').textContent = j.unlocked.length;
    u.innerHTML = j.unlocked.length ? j.unlocked.map(a => achievementPlaque(a, true)).join('') :
      '<div style="grid-column:1/-1;color:#666;text-align:center;padding:24px;font-size:12.5px;">Nenhuma conquista ainda. Faça sua primeira venda!</div>';
    l.innerHTML = j.locked.length ? j.locked.map(a => achievementProgress(a)).join('') :
      '<div style="color:#7dd3a4;text-align:center;padding:14px;font-size:12.5px;">🎉 Você desbloqueou todas as conquistas!</div>';
  } catch (e) { console.warn(e); }
}

function achievementPlaque(a, unlocked) {
  const m = a.meta || { color: '#8b6fff', label: a.tier, emoji: '🏆' };
  const subtitle = a.kind === 'volume'
    ? `R$ ${((a.threshold_cents || 0) / 100).toLocaleString('pt-BR')}`
    : a.kind === 'sales_count'
    ? `${a.threshold_count} vendas`
    : 'Primeira venda';
  return `
    <div style="background:linear-gradient(135deg,${m.color}22,${m.color}05);border:1px solid ${m.color}55;border-radius:14px;padding:18px;text-align:center;${unlocked ? '' : 'opacity:.5;filter:grayscale(.5);'}">
      <div style="font-size:36px;line-height:1;">${m.emoji}</div>
      <div style="margin-top:8px;font-size:14px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:.05em;">${m.label}</div>
      <div style="margin-top:4px;font-size:11px;color:#aaa;font-family:'IBM Plex Mono',monospace;">${subtitle}</div>
      ${unlocked && a.unlocked_at ? `<div style="margin-top:10px;font-size:9.5px;color:#666;text-transform:uppercase;letter-spacing:.06em;">desbloqueada em<br>${new Date(a.unlocked_at * 1000).toLocaleDateString('pt-BR')}</div>` : ''}
    </div>
  `;
}

function achievementProgress(a) {
  const m = a.meta || { color: '#888', label: a.tier, emoji: '🏆' };
  const target = a.kind === 'volume'
    ? `R$ ${((a.threshold_cents || 0) / 100).toLocaleString('pt-BR')}`
    : `${a.threshold_count} vendas`;
  const have = a.kind === 'volume'
    ? `R$ ${((a.progress_value || 0) / 100).toLocaleString('pt-BR')}`
    : `${a.progress_value || 0}`;
  return `
    <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:22px;opacity:.5;">${m.emoji}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">
            <div style="color:#fff;font-weight:700;font-size:13px;">${m.label} <span style="color:#666;font-weight:400;font-size:11px;">· ${a.kind === 'volume' ? 'volume' : 'vendas'}</span></div>
            <div style="font-size:11px;color:#888;font-family:'IBM Plex Mono',monospace;">${have} / ${target}</div>
          </div>
          <div style="margin-top:8px;height:6px;background:#1a1a1a;border-radius:6px;overflow:hidden;">
            <div style="height:100%;width:${a.progress_pct}%;background:linear-gradient(90deg,${m.color}88,${m.color});border-radius:6px;transition:width .3s;"></div>
          </div>
        </div>
        <div style="font-size:11px;color:#666;font-family:'IBM Plex Mono',monospace;min-width:32px;text-align:right;">${a.progress_pct}%</div>
      </div>
    </div>
  `;
}

// Hook na navegação
const __origSp4 = window.sp;
if (typeof __origSp4 === 'function' && !window.__spHookedV4) {
  window.__spHookedV4 = true;
  window.sp = function (page, el) {
    __origSp4(page, el);
    if (page === 'conquistas') loadAchievements();
  };
}

// ============ TUTORIAIS ============
let __tutCat = '';
async function loadTutorials() {
  const q = document.getElementById('tut-search')?.value || '';
  try {
    const j = await fetch('/api/tutorials?category=' + encodeURIComponent(__tutCat) + '&q=' + encodeURIComponent(q), { credentials: 'same-origin' }).then(r => r.json());

    const cats = document.getElementById('tut-cats');
    if (cats) cats.innerHTML = j.categories.map(c => `
      <button onclick="setTutCat('${c.slug}')" style="background:${__tutCat === c.slug ? 'rgba(139,111,255,.2)' : 'transparent'};border:1px solid ${__tutCat === c.slug ? 'var(--primary)' : 'var(--border)'};color:${__tutCat === c.slug ? '#fff' : '#888'};padding:7px 14px;border-radius:20px;cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:600;">
        ${escapeHtml(c.label)} <span style="opacity:.6;font-size:10px;margin-left:3px;">${c.count}</span>
      </button>
    `).join('');

    const grid = document.getElementById('tut-grid');
    if (grid) grid.innerHTML = j.tutorials.length ? j.tutorials.map(t => `
      <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:12px;overflow:hidden;cursor:pointer;transition:border-color .15s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'" ${t.video_url ? `onclick="window.open('${escapeAttr(t.video_url)}','_blank')"` : ''}>
        <div style="aspect-ratio:16/9;background:linear-gradient(135deg,#1a1a3e,#0a0a1f);position:relative;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
            <div style="width:48px;height:48px;border-radius:50%;background:rgba(139,111,255,.25);backdrop-filter:blur(4px);border:1px solid rgba(139,111,255,.5);display:flex;align-items:center;justify-content:center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
          </div>
          <div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.7);color:#fff;font-size:10.5px;padding:2px 7px;border-radius:4px;font-family:'IBM Plex Mono',monospace;">${escapeHtml(t.duration)}</div>
          <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,.5);color:#aaa;font-size:9px;padding:2px 7px;border-radius:4px;font-family:'IBM Plex Mono',monospace;text-transform:uppercase;">${escapeHtml(t.category)}</div>
        </div>
        <div style="padding:14px;">
          <div style="color:#fff;font-weight:700;font-size:13.5px;line-height:1.3;">${escapeHtml(t.title)}</div>
          <div style="color:#888;font-size:11.5px;margin-top:6px;line-height:1.5;">${escapeHtml(t.description)}</div>
          <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:10.5px;color:#666;font-family:'IBM Plex Mono',monospace;">
            <span>👁 ${t.views || 0} views</span>
            <span>⏱ ${escapeHtml(t.duration)}</span>
          </div>
        </div>
      </div>
    `).join('') : '<div style="grid-column:1/-1;color:#666;text-align:center;padding:40px;">Nenhum tutorial encontrado.</div>';
  } catch (e) { console.warn(e); }
}

function setTutCat(slug) {
  __tutCat = slug;
  loadTutorials();
}

const __origSp5 = window.sp;
if (typeof __origSp5 === 'function' && !window.__spHookedV5) {
  window.__spHookedV5 = true;
  window.sp = function (page, el) {
    __origSp5(page, el);
    if (page === 'tutoriais') loadTutorials();
  };
}

// ============ SAQUES ADMIN ============
async function loadAdminWithdrawals(status, btn) {
  if (btn) {
    document.querySelectorAll('.sq-tab').forEach(b => {
      b.style.background = 'transparent';
      b.style.borderColor = 'var(--border)';
      b.style.color = '#888';
    });
    btn.style.background = '#1a1a1a';
    btn.style.borderColor = 'var(--primary)';
    btn.style.color = '#fff';
  }
  try {
    const r = await fetch('/api/wallet/admin/withdrawals?status=' + (status || ''), { credentials: 'same-origin' });
    if (!r.ok) {
      document.getElementById('saques-tbody').innerHTML = '<tr><td colspan="8" style="color:#ff6b6b">sem permissão</td></tr>';
      return;
    }
    const rows = await r.json();
    const statusColor = { pending: '#f5c542', approved: '#3b82f6', paid: '#22c55e', rejected: '#ef4444' };
    document.getElementById('saques-tbody').innerHTML = rows.length ? rows.map(w => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#8b6fff,#5865f2);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;${w.discord_avatar ? `background:url('${escapeAttr(w.discord_avatar)}') center/cover;` : ''}">${w.discord_avatar ? '' : (w.display_name || w.email || '?').charAt(0).toUpperCase()}</div>
            <div><div style="color:#fff;font-size:12px;">${escapeHtml(w.display_name || w.discord_tag || w.email)}</div><div style="color:#666;font-size:10px;font-family:'IBM Plex Mono',monospace;">${escapeHtml(w.email)}</div></div>
          </div>
        </td>
        <td><span style="font-size:10px;text-transform:uppercase;padding:3px 8px;border-radius:10px;background:${w.withdraw_type === 'instant' ? 'rgba(245,197,66,.15)' : 'rgba(59,130,246,.15)'};color:${w.withdraw_type === 'instant' ? '#f5c542' : '#88c0ff'};font-family:'IBM Plex Mono',monospace;">${w.withdraw_type || 'normal'}</span></td>
        <td style="font-family:'IBM Plex Mono',monospace;">R$ ${(w.amount_cents/100).toFixed(2).replace('.', ',')}</td>
        <td style="font-family:'IBM Plex Mono',monospace;color:#f5c542;">- R$ ${(w.fee_cents/100).toFixed(2).replace('.', ',')}</td>
        <td style="font-family:'IBM Plex Mono',monospace;color:#7dd3a4;font-weight:700;">R$ ${(w.net_cents/100).toFixed(2).replace('.', ',')}</td>
        <td style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#aaa;">${escapeHtml(w.pix_key)}</td>
        <td style="font-size:11px;color:#888;">${new Date(w.requested_at * 1000).toLocaleString('pt-BR')}</td>
        <td><span style="font-size:10px;padding:3px 8px;border-radius:10px;background:${statusColor[w.status]}22;color:${statusColor[w.status]};font-weight:600;text-transform:uppercase;">${w.status}</span>
          ${w.status === 'pending' ? `
            <button class="btn-w" style="padding:5px 9px;font-size:10.5px;margin-left:6px;" onclick="reviewWithdraw(${w.id},'approve')">aprovar</button>
            <button class="btn-g" style="padding:5px 9px;font-size:10.5px;color:#ff8a8a;border-color:rgba(255,107,107,.3);" onclick="reviewWithdraw(${w.id},'reject')">rejeitar</button>
          ` : w.status === 'approved' ? `
            <button class="btn-w" style="padding:5px 9px;font-size:10.5px;margin-left:6px;background:#22c55e;color:#000;" onclick="reviewWithdraw(${w.id},'paid')">marcar pago</button>
          ` : ''}
        </td>
      </tr>
    `).join('') : '<tr><td colspan="8" style="color:#666;text-align:center;padding:30px;">nenhum saque</td></tr>';
  } catch (e) { console.warn(e); }
}

async function reviewWithdraw(id, action) {
  let reason, external_tx_id;
  if (action === 'reject') {
    reason = prompt('Motivo da rejeição:');
    if (!reason) return;
  } else if (action === 'paid') {
    external_tx_id = prompt('ID da transação PIX (opcional):') || '';
  }
  try {
    const r = await fetch(`/api/wallet/admin/withdrawals/${id}/review`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason, external_tx_id })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    toast({ approve: 'Saque aprovado', paid: 'Marcado como pago', reject: 'Saque rejeitado' }[action]);
    const active = document.querySelector('.sq-tab[style*="rgb(139, 111, 255)"]') || document.querySelector('.sq-tab');
    loadAdminWithdrawals(active?.dataset.sq || 'pending', active);
    updateAdminBadges();
  } catch (e) { toast(e.message, 'err'); }
}

// ============ ANTI-FRAUDE ADMIN ============
async function loadFraudPage() {
  try {
    const cfg = await fetch('/api/config', { credentials: 'same-origin' }).then(r => r.json()).catch(() => ({}));
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('fraud-threshold', cfg.fraud_threshold || '60');
    set('fraud-block-threshold', cfg.fraud_block_threshold || '80');
    set('fraud-blacklist', cfg.fraud_blacklist || '');

    const rows = await fetch('/api/wallet/admin/suspicious-sales', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []);
    document.getElementById('fraud-tbody').innerHTML = rows.length ? rows.map(s => {
      let signals = [];
      try { signals = JSON.parse(s.fraud_signals || '[]'); } catch {}
      const sigText = signals.map(g => typeof g === 'string' ? g : g.kind).join(', ');
      const scoreColor = s.fraud_score >= 80 ? '#ef4444' : s.fraud_score >= 60 ? '#f5c542' : '#888';
      return `
        <tr>
          <td><span style="font-size:14px;font-weight:800;font-family:'IBM Plex Mono',monospace;color:${scoreColor};">${s.fraud_score}</span></td>
          <td><div style="color:#fff;font-size:12px;">${escapeHtml(s.discord_tag || '—')}</div><div style="color:#666;font-size:10px;font-family:'IBM Plex Mono',monospace;">${escapeHtml(s.discord_id)}</div></td>
          <td style="font-size:12px;">${escapeHtml(s.product_name || '—')}</td>
          <td style="font-family:'IBM Plex Mono',monospace;">R$ ${(s.amount_cents/100).toFixed(2).replace('.', ',')}</td>
          <td style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#aaa;">${escapeHtml(s.last_ip || '—')}</td>
          <td style="font-size:10.5px;color:#aaa;">${escapeHtml(sigText)}</td>
          <td><span style="font-size:10px;padding:3px 8px;border-radius:10px;background:#1a1a1a;color:#aaa;">${s.status}</span></td>
          <td><a href="#" onclick="addToBlacklist('${escapeAttr(s.discord_id)}');return false;" style="color:#ff8a8a;font-size:11px;">+ blacklist</a></td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="8" style="color:#666;text-align:center;padding:30px;">nenhuma venda suspeita</td></tr>';
  } catch (e) { console.warn(e); }
}

async function saveFraudConfig() {
  const body = {
    fraud_threshold: document.getElementById('fraud-threshold').value,
    fraud_block_threshold: document.getElementById('fraud-block-threshold').value,
    fraud_blacklist: document.getElementById('fraud-blacklist').value
  };
  try {
    const r = await fetch('/api/config', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return toast('Falha', 'err');
    toast('Configuração salva');
  } catch (e) { toast(e.message, 'err'); }
}

function addToBlacklist(id) {
  const t = document.getElementById('fraud-blacklist');
  const cur = (t.value || '').trim();
  t.value = cur ? cur + ', ' + id : id;
  toast('Adicione e clique em salvar');
}

async function updateAdminBadges() {
  try {
    const r = await fetch('/api/wallet/admin/withdrawals?status=pending', { credentials: 'same-origin' });
    if (!r.ok) return;
    const rows = await r.json();
    const nav = document.getElementById('nav-saques');
    const badge = document.getElementById('saques-badge');
    if (nav) nav.style.display = 'flex';
    if (badge) {
      if (rows.length > 0) { badge.style.display = 'inline-block'; badge.textContent = rows.length; }
      else badge.style.display = 'none';
    }
    // anti-fraude tem nav visivel pra owner
    const f = document.getElementById('nav-fraude');
    if (f) f.style.display = 'flex';
  } catch {}
}

const __origSpAdmin = window.sp;
if (typeof __origSpAdmin === 'function' && !window.__spHookedAdmin) {
  window.__spHookedAdmin = true;
  window.sp = function (page, el) {
    __origSpAdmin(page, el);
    if (page === 'saques-admin') loadAdminWithdrawals('pending', document.querySelector('.sq-tab[data-sq="pending"]'));
    if (page === 'fraude') loadFraudPage();
  };
}
setTimeout(updateAdminBadges, 1800);
setInterval(updateAdminBadges, 90000);

// ============ USER MENU ============
function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('user-dropdown');
  if (!dd) return;
  const open = dd.style.display === 'block';
  dd.style.display = open ? 'none' : 'block';
  if (!open) setTimeout(() => document.addEventListener('click', closeUserMenuOnce, { once: true }), 50);
}
function closeUserMenuOnce() { closeUserMenu(); }
function closeUserMenu() {
  const dd = document.getElementById('user-dropdown');
  if (dd) dd.style.display = 'none';
}

// ============ BREADCRUMB + COPY ID ============
function updateBreadcrumb() {
  const crumb = document.getElementById('crumb-bot');
  if (!crumb) return;
  if (window.__activeBot) {
    const b = window.__activeBot;
    const nick = b.nickname || b.name;
    const isTrial = b.plan && b.plan.includes('trial');
    crumb.innerHTML = nick + (isTrial ? '<span style="color:#f5c542;font-size:9.5px;margin-left:6px;">-TRIAL</span>' : '');
  } else {
    crumb.textContent = '—';
  }
  const pageEl = document.getElementById('crumb-page');
  const titleEl = document.getElementById('page-title');
  if (pageEl && titleEl) pageEl.textContent = (titleEl.textContent || '').toLowerCase();
}

function copyBotId(e) {
  e.stopPropagation();
  const id = document.getElementById('bot-id-full')?.textContent || '';
  navigator.clipboard.writeText(id).then(() => toast('ID copiado'));
}

// Expor __activeBot pra updateBreadcrumb
const __origLoadBotSwitcher = window.loadBotSwitcher;

// ============ CARD ASSINATURA + MODULOS + WARNING BANNERS ============
async function loadVisaoGeralExtras() {
  try {
    const [bills, cred, guild] = await Promise.all([
      fetch('/api/billing/me', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/credentials', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch('/api/guilds', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);
    renderSubscriptionCard(bills);
    renderConfigWarnings(cred);
    renderMainServer(guild);
    loadAuditMini();
  } catch (e) { console.warn('visao geral extras', e.message); }
}

function renderSubscriptionCard(bills) {
  if (!bills) return;
  const status = bills.guild_subscription?.status || bills.my_subscription?.status || 'free';
  const ends = bills.guild_subscription?.ends_at || bills.guild_subscription?.trial_ends_at
    || bills.my_subscription?.ends_at || bills.my_subscription?.trial_ends_at;
  const now = Math.floor(Date.now() / 1000);
  const daysLeft = ends ? Math.max(0, Math.ceil((ends - now) / 86400)) : null;

  const badge = document.getElementById('sub-status-badge');
  const days = document.getElementById('sub-days-left');
  const fill = document.getElementById('sub-progress-fill');

  if (badge) {
    const map = { active: ['Ativo', '#22c55e'], trialing: ['Trial', '#f5c542'], expired: ['Expirado', '#ef4444'], canceled: ['Cancelado', '#888'], past_due: ['Atrasado', '#ef4444'] };
    const [lbl, col] = map[status] || ['—', '#888'];
    badge.textContent = lbl;
    badge.style.background = col + '22';
    badge.style.color = col;
  }
  if (days) days.textContent = daysLeft != null ? daysLeft : '∞';
  if (fill) {
    const total = status === 'trialing' ? 7 : 30;
    const pct = daysLeft != null ? Math.min(100, (daysLeft / total) * 100) : 100;
    fill.style.width = pct + '%';
  }

  // Modulos = features do plano resumidas
  const wrap = document.getElementById('sub-modules');
  if (wrap) {
    const f = bills.plan?.features || {};
    const mods = [
      { key: 'stripe_checkout', label: 'Módulo de Vendas' },
      { key: 'tickets', label: 'Módulo de Ticket' },
      { key: 'autoreply', label: 'Módulo de Automações' },
      { key: 'custom_branding', label: 'Personalização' }
    ];
    wrap.innerHTML = mods.map(m => {
      const on = f[m.key];
      return `<div style="display:flex;align-items:center;justify-content:space-between;font-size:11.5px;font-family:'IBM Plex Mono',monospace;">
        <span style="display:flex;align-items:center;gap:6px;color:${on ? '#fff' : '#666'};">
          <span style="width:6px;height:6px;border-radius:50%;background:${on ? '#22c55e' : '#444'};"></span>
          ${m.label}
        </span>
        <span style="color:#666;">${on ? (daysLeft ?? '∞') + 'd' : '—'}</span>
      </div>`;
    }).join('');
  }
}

function renderConfigWarnings(cred) {
  const wrap = document.getElementById('config-warnings');
  if (!wrap) return;
  const warnings = [];
  if (!cred.DISCORD_TOKEN) warnings.push({
    title: 'Token Discord não configurado',
    body: 'Cole o token do seu bot Discord pra ele aparecer online.',
    cta: 'Configurar agora',
    target: 'credenciais'
  });
  if (!cred.STRIPE_SECRET_KEY && !cred.MISTICPAY_API_KEY) warnings.push({
    title: 'Chave API não configurada',
    body: 'Configure sua chave API do gateway de pagamento para que as vendas funcionem.',
    cta: 'Configurar agora',
    target: 'credenciais'
  });
  wrap.innerHTML = warnings.map(w => `
    <div style="background:linear-gradient(90deg,rgba(245,197,66,0.10),rgba(245,197,66,0.02));border:1px solid rgba(245,197,66,0.3);border-radius:11px;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;gap:14px;">
      <div style="display:flex;gap:11px;align-items:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f5c542" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div>
          <div style="font-weight:700;color:#f5c542;font-size:12.5px;">${escapeHtml(w.title)}</div>
          <div style="font-size:11px;color:#bbb;margin-top:2px;">${escapeHtml(w.body)}</div>
        </div>
      </div>
      <button onclick="sp('${w.target}',document.querySelector('[data-page=${w.target}]'))" style="background:#f5c542;color:#0a0a0a;border:0;padding:7px 12px;border-radius:7px;font-weight:700;font-family:inherit;font-size:11.5px;cursor:pointer;flex-shrink:0;">${escapeHtml(w.cta)}</button>
    </div>
  `).join('');
}

function renderMainServer(guild) {
  const wrap = document.getElementById('main-server-card');
  if (!wrap) return;
  const list = guild?.guilds || guild?.instances || [];
  const active = list.find(g => g.active !== 0) || list[0];
  if (!active) return;
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#8b6fff,#5865f2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;${active.icon_url ? `background:url('${escapeAttr(active.icon_url)}') center/cover;` : ''}">${active.icon_url ? '' : (active.name || '?').charAt(0).toUpperCase()}</div>
      <div style="flex:1;min-width:0;">
        <div style="color:#fff;font-weight:700;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(active.name || '—')}</div>
        <div style="color:#666;font-size:10px;font-family:'IBM Plex Mono',monospace;">ID: ${escapeHtml(String(active.id || ''))}</div>
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      <span style="font-size:10.5px;background:#1a1a1a;border:1px solid var(--border);color:#aaa;padding:3px 8px;border-radius:10px;font-family:'IBM Plex Mono',monospace;">membros</span>
    </div>
  `;
}

async function loadAuditMini() {
  try {
    const j = await fetch('/api/audit?limit=5', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []);
    const wrap = document.getElementById('audit-mini-list');
    if (!wrap) return;
    if (!Array.isArray(j) || !j.length) return;
    wrap.innerHTML = j.slice(0, 5).map(a => `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #131313;font-size:11px;">
        <span style="color:#aaa;font-family:'IBM Plex Mono',monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.action || '')}</span>
        <span style="color:#666;font-family:'IBM Plex Mono',monospace;font-size:10px;">${a.created_at ? new Date(a.created_at * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
      </div>
    `).join('');
  } catch {}
}

// Hook na boot do visao geral
const __origLoadOverview2 = window.loadOverview;
if (typeof __origLoadOverview2 === 'function') {
  window.loadOverview = async function () {
    try { await __origLoadOverview2.apply(this, arguments); } catch {}
    loadVisaoGeralExtras();
  };
}
setTimeout(() => { if (document.getElementById('page-geral')?.classList.contains('show')) loadVisaoGeralExtras(); }, 1200);

// ============ TRIAL 24H ATIVAR ============
async function activateTrial24h() {
  const btn = document.getElementById('btn-activate-trial');
  if (btn) { btn.disabled = true; btn.style.opacity = '.6'; btn.innerHTML = 'Ativando...'; }
  // Mostra modal de loading
  document.getElementById('modal-loading-bot')?.classList.add('open');
  fakeProgress();
  try {
    const r = await fetch('/api/billing/trial-24h', { method: 'POST', credentials: 'same-origin' });
    const j = await r.json();
    if (!r.ok) {
      document.getElementById('modal-loading-bot')?.classList.remove('open');
      toast(j.error || 'Falha', 'err');
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '🎁 Ativar Trial Gratuito'; }
      return;
    }
    // Simula finish após chegar a 100%
    setTimeout(() => {
      document.getElementById('modal-loading-bot')?.classList.remove('open');
      toast('Trial Pro ativado por 24h!');
      setTimeout(() => location.reload(), 800);
    }, 3200);
  } catch (e) {
    document.getElementById('modal-loading-bot')?.classList.remove('open');
    toast(e.message, 'err');
  }
}

function fakeProgress() {
  const fill = document.getElementById('loading-bot-progress');
  const pct = document.getElementById('loading-bot-pct');
  const step = document.getElementById('loading-bot-step');
  if (!fill) return;
  fill.style.width = '0%';
  const steps = [
    { pct: 20, msg: 'Instalando dependências...' },
    { pct: 45, msg: 'Configurando ambiente...' },
    { pct: 70, msg: 'Inicializando módulos...' },
    { pct: 92, msg: 'Quase lá...' },
    { pct: 100, msg: 'Pronto!' }
  ];
  steps.forEach((s, i) => setTimeout(() => {
    fill.style.width = s.pct + '%';
    if (pct) pct.textContent = s.pct + '%';
    if (step) step.textContent = s.msg;
  }, 500 + i * 600));
}

// Helper banner "Precisa de ajuda?" — pode ser embutido em qualquer page
function renderHelpBanner(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = `
    <div style="background:linear-gradient(90deg,rgba(139,111,255,.08),rgba(139,111,255,.02));border:1px solid rgba(139,111,255,.25);border-radius:11px;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px;">
      <div style="display:flex;gap:11px;align-items:center;">
        <div style="width:34px;height:34px;border-radius:8px;background:rgba(139,111,255,.15);display:flex;align-items:center;justify-content:center;color:#b9a8ff;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div>
          <div style="color:#fff;font-weight:700;font-size:12.5px;">Precisa de ajuda para configurar?</div>
          <div style="color:#888;font-size:11px;margin-top:2px;">Tutoriais passo a passo, do básico ao avançado.</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="sp('tutoriais',document.querySelector('[data-page=tutoriais]'))" style="background:#8b6fff;color:#fff;border:0;padding:7px 14px;border-radius:7px;font-weight:700;font-family:inherit;font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Ver Tutoriais</button>
        <button onclick="window.open('https://discord.gg/','_blank')" style="background:#1a1a1a;color:#aaa;border:1px solid var(--border);padding:7px 14px;border-radius:7px;font-weight:600;font-family:inherit;font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Suporte</button>
      </div>
    </div>
  `;
}

// Hook page trial
const __origSpTrial = window.sp;
if (typeof __origSpTrial === 'function' && !window.__spHookedTrial) {
  window.__spHookedTrial = true;
  window.sp = function (page, el) {
    __origSpTrial(page, el);
    if (page === 'trial') {
      // poderia carregar status do trial aqui
    }
  };
}

// ============ CONFIGURAR BOT ============
async function loadConfigurarBot() {
  renderHelpBanner('cb-help-banner');
  try {
    const j = await fetch('/api/bot-config/token-status', { credentials: 'same-origin' }).then(r => r.json());
    const badge = document.getElementById('cb-token-status');
    if (badge) {
      if (j.configured) {
        badge.textContent = 'configurado';
        badge.style.background = 'rgba(34,197,94,.15)';
        badge.style.color = '#7dd3a4';
      } else {
        badge.textContent = 'não configurado';
        badge.style.background = 'rgba(245,197,66,.15)';
        badge.style.color = '#f5c542';
      }
    }
    const inp = document.getElementById('cb-token');
    if (inp && j.masked) inp.placeholder = j.masked;
  } catch {}
}

function toggleCbTokenVis() {
  const inp = document.getElementById('cb-token');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function updateBotToken() {
  const token = document.getElementById('cb-token').value.trim();
  if (!token) return toast('Cole o token primeiro', 'err');
  if (token.length < 50) return toast('Token parece inválido', 'err');
  try {
    const r = await fetch('/api/bot-config/token', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    toast('Token atualizado! Bot reiniciando.');
    document.getElementById('cb-token').value = '';
    loadConfigurarBot();
  } catch (e) { toast(e.message, 'err'); }
}

async function redeemPromo() {
  const code = document.getElementById('cb-promo').value.trim().toUpperCase();
  if (!code) return toast('Cole o código', 'err');
  try {
    const r = await fetch('/api/bot-config/redeem', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    const msg = j.kind === 'trial_extend' ? `Trial estendido por ${j.value}!`
      : j.kind === 'credit' ? `Crédito de R$ ${(parseInt(j.value) / 100).toFixed(2)} adicionado!`
      : j.kind === 'module_unlock' ? `Módulo "${j.value}" desbloqueado!`
      : 'Código resgatado!';
    toast(msg);
    document.getElementById('cb-promo').value = '';
  } catch (e) { toast(e.message, 'err'); }
}

async function transferBot() {
  const target = document.getElementById('cb-transfer').value.trim();
  if (!target || !/^\d{16,20}$/.test(target)) return toast('Discord ID inválido', 'err');
  if (!confirm('Tem CERTEZA? Esta ação é IRREVERSÍVEL. Você perderá acesso ao bot.')) return;
  const botId = window.__activeBot?.id;
  if (!botId) return toast('Bot ativo não detectado', 'err');
  try {
    const r = await fetch('/api/bot-config/transfer', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_instance_id: botId, target_discord_id: target, confirm: 'IRREVERSIVEL' })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    toast('Bot transferido. Você foi desvinculado.');
    setTimeout(() => location.href = '/login.html', 2000);
  } catch (e) { toast(e.message, 'err'); }
}

const __origSpCb = window.sp;
if (typeof __origSpCb === 'function' && !window.__spHookedCb) {
  window.__spHookedCb = true;
  window.sp = function (page, el) {
    __origSpCb(page, el);
    if (page === 'configurar-bot') loadConfigurarBot();
  };
}

// ============ CANAIS CONFIG ============
let __chMeta = null, __chCfg = null, __chChannels = null;

async function loadCanaisConfig() {
  try {
    const [meta, cfg, channels] = await Promise.all([
      fetch('/api/channel-config/_meta', { credentials: 'same-origin' }).then(r => r.json()),
      fetch('/api/channel-config', { credentials: 'same-origin' }).then(r => r.json()),
      fetch('/api/config/channels', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []).catch(() => [])
    ]);
    __chMeta = meta; __chCfg = cfg; __chChannels = channels;
    renderChannelGroups();
  } catch (e) { console.warn('canais cfg', e.message); }
}

function renderChannelGroups() {
  const wrap = document.getElementById('cc-groups');
  if (!wrap || !__chMeta) return;
  wrap.innerHTML = __chMeta.map(g => `
    <div class="card" style="padding:16px 18px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="width:3px;height:14px;background:var(--primary);border-radius:2px;"></span>
        <div style="font-size:13px;color:#fff;font-weight:700;">${escapeHtml(g.label)}</div>
      </div>
      <div style="font-size:11px;color:#888;margin-bottom:14px;padding-left:11px;">${escapeHtml(g.desc)}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
        ${g.keys.map(k => `
          <div>
            <div style="font-size:11px;color:#aaa;margin-bottom:5px;font-family:'IBM Plex Mono',monospace;">${escapeHtml(k.label)}</div>
            <select data-cc="${escapeAttr(k.key)}" class="inp" style="width:100%;font-size:12px;">
              <option value="">${'#'} Não configurado</option>
              ${(__chChannels || []).map(ch => `<option value="${escapeAttr(ch.id)}" ${__chCfg[k.key] === ch.id ? 'selected' : ''}># ${escapeHtml(ch.name)}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function saveChannelConfig() {
  const body = {};
  document.querySelectorAll('[data-cc]').forEach(s => { body[s.dataset.cc] = s.value || null; });
  try {
    const r = await fetch('/api/channel-config', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) return toast('Falha', 'err');
    toast('Canais salvos');
  } catch (e) { toast(e.message, 'err'); }
}

// ============ CARGOS CONFIG ============
let __rcMeta = null, __rcCfg = null, __rcRoles = null;

async function loadCargosConfig() {
  try {
    const [meta, cfg, roles] = await Promise.all([
      fetch('/api/role-config/_meta', { credentials: 'same-origin' }).then(r => r.json()),
      fetch('/api/role-config', { credentials: 'same-origin' }).then(r => r.json()),
      fetch('/api/config/roles', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []).catch(() => [])
    ]);
    __rcMeta = meta; __rcCfg = cfg; __rcRoles = roles;
    renderRoleGroups();
  } catch (e) { console.warn('cargos cfg', e.message); }
}

function renderRoleGroups() {
  const wrap = document.getElementById('rc-groups');
  if (!wrap || !__rcMeta) return;
  wrap.innerHTML = __rcMeta.map(g => `
    <div class="card" style="padding:16px 18px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="width:3px;height:14px;background:var(--primary);border-radius:2px;"></span>
        <div style="font-size:13px;color:#fff;font-weight:700;">${escapeHtml(g.label)}</div>
      </div>
      <div style="font-size:11px;color:#888;margin-bottom:14px;padding-left:11px;">${escapeHtml(g.desc)}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
        ${g.keys.map(k => `
          <div>
            <div style="font-size:11px;color:#aaa;margin-bottom:5px;font-family:'IBM Plex Mono',monospace;">${escapeHtml(k.label)}</div>
            <select data-rc="${escapeAttr(k.key)}" class="inp" style="width:100%;font-size:12px;">
              <option value="">⚪ Não configurado</option>
              ${(__rcRoles || []).map(r => `<option value="${escapeAttr(r.id)}" style="color:${r.color || '#aaa'};" ${__rcCfg[k.key] === r.id ? 'selected' : ''}>● ${escapeHtml(r.name)}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function saveRoleConfig() {
  const body = {};
  document.querySelectorAll('[data-rc]').forEach(s => { body[s.dataset.rc] = s.value || null; });
  try {
    const r = await fetch('/api/role-config', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) return toast('Falha', 'err');
    toast('Cargos salvos');
  } catch (e) { toast(e.message, 'err'); }
}

const __origSpCc = window.sp;
if (typeof __origSpCc === 'function' && !window.__spHookedCc) {
  window.__spHookedCc = true;
  window.sp = function (page, el) {
    __origSpCc(page, el);
    if (page === 'canais-config') loadCanaisConfig();
    if (page === 'cargos-config') loadCargosConfig();
  };
}

// ============ PERSONALIZACAO (estendido) ============
function switchPrsTab(tab) {
  document.querySelectorAll('.prs-tab').forEach(b => {
    const on = b.dataset.prs === tab;
    b.style.color = on ? '#fff' : '#666';
    b.style.borderBottomColor = on ? 'var(--primary)' : 'transparent';
  });
  document.getElementById('prs-pane-geral').style.display = tab === 'geral' ? 'block' : 'none';
  document.getElementById('prs-pane-embeds').style.display = tab === 'embeds' ? 'block' : 'none';
}

async function loadPersonalizacaoExtra() {
  // Atualiza header com info do bot ativo
  const b = window.__activeBot;
  if (b) {
    const nm = document.getElementById('prs-bot-name');
    const id = document.getElementById('prs-bot-id');
    const an = document.getElementById('prs-app-name');
    const ai = document.getElementById('prs-app-id');
    if (nm) nm.textContent = b.nickname || b.name || '—';
    if (id) id.textContent = b.discord_client_id || ('app-' + b.id);
    if (an) an.textContent = b.name || '—';
    if (ai) ai.textContent = b.discord_client_id || ('app-' + b.id);
  }
  // Prefixo
  try {
    const j = await fetch('/api/features/prefix', { credentials: 'same-origin' }).then(r => r.json());
    const p = document.getElementById('prs-prefix');
    if (p) p.value = j.prefix || '!';
  } catch {}
  // Banner URL
  try {
    const j = await fetch('/api/features/branding', { credentials: 'same-origin' }).then(r => r.json());
    const inp = document.getElementById('prs-banner-url');
    if (inp && j.banner_url) inp.value = j.banner_url;
    const banner = document.getElementById('prs-banner');
    if (banner && j.banner_url) banner.style.backgroundImage = `linear-gradient(135deg,rgba(0,0,0,.3),rgba(0,0,0,.5)), url('${j.banner_url}')`;
    banner && (banner.style.backgroundSize = 'cover');
    banner && (banner.style.backgroundPosition = 'center');
  } catch {}
}

async function savePrefix() {
  const p = document.getElementById('prs-prefix').value.trim() || '!';
  try {
    await fetch('/api/features/prefix', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: p })
    });
    toast('Prefixo salvo');
  } catch (e) { toast(e.message, 'err'); }
}

// ============ BOAS-VINDAS ============
let __bvData = { boas_vindas: [], despedida: [] };
let __bvTab = 'boas_vindas';

async function loadBoasVindas() {
  try {
    __bvData = await fetch('/api/features/welcome-messages', { credentials: 'same-origin' }).then(r => r.json());
    if (!__bvData.boas_vindas) __bvData.boas_vindas = [];
    if (!__bvData.despedida) __bvData.despedida = [];
    renderBvList();
  } catch {}
}

function switchBvTab(tab) {
  __bvTab = tab;
  document.querySelectorAll('.bv-tab').forEach(b => {
    const on = b.dataset.bv === tab;
    b.style.background = on ? 'rgba(139,111,255,.15)' : 'transparent';
    b.style.color = on ? '#b9a8ff' : '#888';
  });
  renderBvList();
}

function renderBvList() {
  const list = __bvData[__bvTab] || [];
  const wrap = document.getElementById('bv-list');
  const empty = document.getElementById('bv-empty');
  if (!wrap) return;
  empty.style.display = list.length ? 'none' : 'block';
  wrap.innerHTML = list.map((m, i) => {
    const mode = m.mode || 'texto';
    const preview = mode === 'embed'
      ? (m.embed?.title || m.embed?.description || '(embed sem título)')
      : (m.message || '(sem mensagem)');
    const channels = Array.isArray(m.channels) ? m.channels : (m.channel ? [m.channel] : []);
    return `
      <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:10px;padding:2px 7px;border-radius:8px;background:${mode === 'embed' ? 'rgba(139,111,255,.15)' : '#1a1a1a'};color:${mode === 'embed' ? '#b9a8ff' : '#aaa'};text-transform:uppercase;letter-spacing:.04em;font-family:'IBM Plex Mono',monospace;">${mode}</span>
            <span style="font-size:11px;color:#888;font-family:'IBM Plex Mono',monospace;">${channels.length ? channels.map(c => '#' + escapeHtml(c)).join(', ') : 'qualquer canal'}</span>
          </div>
          <div style="font-size:12.5px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(preview).slice(0, 90)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button onclick="openBvModal(${i})" style="background:#1a1a1a;border:1px solid var(--border);color:#aaa;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:11px;">Editar</button>
          <button onclick="removeBvMessage(${i})" style="background:transparent;border:1px solid rgba(255,107,107,.3);color:#ff8a8a;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:11px;">×</button>
        </div>
      </div>
    `;
  }).join('');
}

function addBvMessage() {
  __bvData[__bvTab].push({ mode: 'texto', message: '', channels: [], delay: 0, embed: null });
  renderBvList();
  saveBvDebounced();
  openBvModal(__bvData[__bvTab].length - 1);
}

// ============ Modal Boas-vindas/Despedida v2 ============
let __bvEditIdx = null;
let __bvEditBuilder = null;
let __bvEditMode = 'texto';
let __bvEditEmbed = null;

function openBvModal(idx) {
  const m = __bvData[__bvTab][idx];
  if (!m) return;
  __bvEditIdx = idx;
  __bvEditMode = m.mode || 'texto';
  __bvEditEmbed = m.embed || { color: '#5865F2', title: '', description: '' };

  document.getElementById('modal-bv-title').textContent =
    (__bvTab === 'boas_vindas' ? 'Boas-vindas' : 'Despedida') + ' — Mensagem #' + (idx + 1);

  const body = document.getElementById('modal-bv-body');
  const channels = Array.isArray(m.channels) ? m.channels : (m.channel ? [m.channel] : []);
  body.innerHTML = `
    <div style="background:rgba(139,111,255,.06);border:1px solid rgba(139,111,255,.2);border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b9a8ff" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span style="font-size:12px;font-weight:700;color:#b9a8ff;text-transform:uppercase;letter-spacing:.04em;font-family:'IBM Plex Mono',monospace;">Variáveis disponíveis</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11.5px;">
        ${[
          { v: '{serverName}', d: 'Nome do servidor' },
          { v: '{user}', d: 'Menção do usuário' },
          { v: '{user.name}', d: 'Nome global do usuário' },
          { v: '{user.username}', d: 'Username do usuário' }
        ].map(x => `
          <div style="display:flex;align-items:center;gap:8px;">
            <button onclick="bvCopyVar('${x.v}')" style="background:#1a1a1a;border:1px solid var(--border);color:#b9a8ff;padding:3px 8px;border-radius:5px;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:10.5px;">${x.v}</button>
            <span style="color:#888;font-size:11px;">${x.d}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <span style="font-size:11.5px;color:#888;">Modo:</span>
      <div style="display:flex;gap:6px;background:#0a0a0a;border:1px solid var(--border);border-radius:8px;padding:4px;">
        <button class="bv-mode-btn" data-mode="texto" onclick="switchBvMode('texto')" style="background:${__bvEditMode === 'texto' ? '#1a1a1a' : 'transparent'};border:0;color:${__bvEditMode === 'texto' ? '#fff' : '#888'};padding:6px 14px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:600;">Texto</button>
        <button class="bv-mode-btn" data-mode="embed" onclick="switchBvMode('embed')" style="background:${__bvEditMode === 'embed' ? 'linear-gradient(90deg,#8b6fff,#7758ff)' : 'transparent'};border:0;color:${__bvEditMode === 'embed' ? '#fff' : '#888'};padding:6px 14px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:600;">Embed</button>
      </div>
    </div>

    <div id="bv-content-wrap"></div>

    <div style="display:grid;grid-template-columns:1fr 200px;gap:12px;margin-top:14px;">
      <div>
        <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Canais (nomes sem #, separados por vírgula)</label>
        <input id="bv-channels" type="text" value="${escapeAttr(channels.join(', '))}" placeholder="geral, boas-vindas" class="inp" style="margin-top:5px;font-family:'IBM Plex Mono',monospace;">
      </div>
      <div>
        <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Delay para exclusão (s)</label>
        <input id="bv-delay" type="number" min="0" value="${m.delay || 0}" class="inp" style="margin-top:5px;">
        <div style="font-size:10.5px;color:#666;margin-top:4px;">0 = não excluir automaticamente</div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
      <button onclick="closeModal('modal-bv-edit')" class="kyc-btn secondary">Cancelar</button>
      <button onclick="saveBvFromModal()" class="kyc-btn primary">Salvar</button>
    </div>
  `;

  renderBvContent(m);
  document.getElementById('modal-bv-edit').classList.add('open');
}

function bvCopyVar(v) {
  navigator.clipboard.writeText(v).then(() => toast('Variável copiada: ' + v));
}

function switchBvMode(mode) {
  __bvEditMode = mode;
  document.querySelectorAll('.bv-mode-btn').forEach(b => {
    const on = b.dataset.mode === mode;
    b.style.background = on ? (mode === 'embed' ? 'linear-gradient(90deg,#8b6fff,#7758ff)' : '#1a1a1a') : 'transparent';
    b.style.color = on ? '#fff' : '#888';
  });
  renderBvContent(__bvData[__bvTab][__bvEditIdx]);
}

function renderBvContent(m) {
  const wrap = document.getElementById('bv-content-wrap');
  if (!wrap) return;
  if (__bvEditMode === 'texto') {
    wrap.innerHTML = `
      <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;">
        <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Mensagem</label>
        <textarea id="bv-text-message" rows="4" placeholder="Digite uma mensagem de boas-vindas..." class="inp" style="margin-top:5px;">${escapeHtml(m.message || '')}</textarea>
      </div>
    `;
    __bvEditBuilder = null;
  } else {
    wrap.innerHTML = '<div id="bv-embed-builder"></div>';
    __bvEditBuilder = mountEmbedBuilder({
      container: document.getElementById('bv-embed-builder'),
      value: __bvEditEmbed,
      showAuthor: true, showImage: true, showFooter: true, showFields: true,
      onChange: v => { __bvEditEmbed = v; }
    });
  }
}

async function saveBvFromModal() {
  if (__bvEditIdx == null) return;
  const channels = (document.getElementById('bv-channels')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  const delay = parseInt(document.getElementById('bv-delay')?.value) || 0;
  const m = __bvData[__bvTab][__bvEditIdx];
  m.mode = __bvEditMode;
  m.channels = channels;
  delete m.channel; // legado
  m.delay = delay;
  if (__bvEditMode === 'texto') {
    m.message = document.getElementById('bv-text-message').value;
    m.embed = null;
  } else {
    m.embed = __bvEditBuilder ? __bvEditBuilder.getValue() : __bvEditEmbed;
    m.message = '';
  }
  renderBvList();
  saveBvDebounced();
  closeModal('modal-bv-edit');
  toast('Mensagem salva');
}

function removeBvMessage(i) {
  __bvData[__bvTab].splice(i, 1);
  renderBvList();
  saveBvDebounced();
}

let __bvSaveTimer = null;
function saveBvDebounced() {
  clearTimeout(__bvSaveTimer);
  __bvSaveTimer = setTimeout(async () => {
    try {
      await fetch('/api/features/welcome-messages', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(__bvData)
      });
    } catch {}
  }, 800);
}

const __origSpPrs = window.sp;
if (typeof __origSpPrs === 'function' && !window.__spHookedPrs) {
  window.__spHookedPrs = true;
  window.sp = function (page, el) {
    __origSpPrs(page, el);
    if (page === 'personalizacao') loadPersonalizacaoExtra();
    if (page === 'boasvindas') loadBoasVindas();
  };
}

// ============ CARTEIRA ============
async function loadCarteira() {
  try {
    const [bal, ws] = await Promise.all([
      fetch('/api/wallet/balance', { credentials: 'same-origin' }).then(r => r.json()),
      fetch('/api/wallet/withdrawals', { credentials: 'same-origin' }).then(r => r.json())
    ]);
    window.__balance = bal;
    const setRS = (id, c) => { const el = document.getElementById(id); if (el) el.textContent = 'R$ ' + ((c || 0) / 100).toFixed(2).replace('.', ','); };
    setRS('ct-available', bal.available_cents);
    setRS('ct-blocked', bal.blocked_cents);
    setRS('ct-med', bal.med_blocked_cents);
    setRS('ct-total', bal.total_cents);
    setRS('ct-avail-line', bal.available_cents);
    document.getElementById('ct-med-line').textContent = '-R$ ' + ((bal.med_blocked_cents || 0) / 100).toFixed(2).replace('.', ',');

    // banner 2FA
    const banner = document.getElementById('ct-2fa-banner');
    if (banner) banner.style.display = bal.twofa_enabled ? 'none' : 'flex';
    const btn = document.getElementById('ct-withdraw-btn');
    if (btn) {
      if (!bal.twofa_enabled) {
        btn.innerHTML = '🔐 Ative o 2FA para Sacar';
        btn.style.background = '#1a1a1a';
        btn.style.color = '#666';
        btn.style.cursor = 'not-allowed';
        btn.disabled = true;
      } else {
        btn.style.background = '#22c55e';
        btn.style.color = '#000';
        btn.style.cursor = 'pointer';
        btn.disabled = false;
      }
    }

    // stats
    const stats = computeWalletStats(ws);
    document.getElementById('ct-stat-sales').textContent = stats.salesCount;
    document.getElementById('ct-stat-volume').textContent = 'R$ ' + (bal.earned_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    document.getElementById('ct-stat-withdrawn').textContent = 'R$ ' + (stats.totalWithdrawn / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    document.getElementById('ct-stat-meds').textContent = stats.medCount;
    document.getElementById('ct-cnt-approved').textContent = stats.approved;
    document.getElementById('ct-cnt-pending').textContent = stats.pending;
    document.getElementById('ct-cnt-refunded').textContent = stats.refunded;
    document.getElementById('ct-cnt-canceled').textContent = stats.canceled;

    updateCtPreview();
  } catch (e) { console.warn('carteira', e.message); }
}

function computeWalletStats(ws) {
  if (!Array.isArray(ws)) return { salesCount: 0, totalWithdrawn: 0, medCount: 0, approved: 0, pending: 0, refunded: 0, canceled: 0 };
  let totalWithdrawn = 0, approved = 0, pending = 0, refunded = 0, canceled = 0, medCount = 0;
  for (const w of ws) {
    if (['paid', 'approved'].includes(w.status)) totalWithdrawn += w.net_cents || 0;
    if (w.status === 'approved' || w.status === 'paid') approved++;
    if (w.status === 'pending') pending++;
    if (w.status === 'rejected') refunded++;
    if (w.med_blocked_cents > 0) medCount++;
  }
  return { salesCount: ws.length, totalWithdrawn, medCount, approved, pending, refunded, canceled };
}

function updateCtPreview() {
  const amt = parseFloat(document.getElementById('ct-amount')?.value || 0);
  const turbo = document.getElementById('ct-turbo')?.checked;
  const fee = turbo ? 3.50 : 0.50;
  document.getElementById('ct-fee-line').textContent = 'R$ ' + fee.toFixed(2).replace('.', ',');
  document.getElementById('ct-receive-line').textContent = 'R$ ' + Math.max(0, amt - fee).toFixed(2).replace('.', ',');
}

function validatePix() {
  const k = document.getElementById('ct-pix-key').value.trim();
  if (!k) return toast('Cole a chave PIX', 'err');
  toast('Chave válida (modo demo)', 'ok');
}

async function submitCarteiraWithdraw() {
  const amount = document.getElementById('ct-amount').value;
  if (!amount || parseFloat(amount) < 10) return toast('Mínimo R$10', 'err');
  const turbo = document.getElementById('ct-turbo').checked;
  try {
    const r = await fetch('/api/wallet/withdraw', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, type: turbo ? 'instant' : 'normal' })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    toast('Saque solicitado!');
    loadCarteira();
  } catch (e) { toast(e.message, 'err'); }
}

async function emailExtract() {
  try {
    const r = await fetch('/api/wallet/extract-email', { method: 'POST', credentials: 'same-origin' });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    toast('Extrato enviado pro email');
  } catch (e) { toast(e.message, 'err'); }
}

// ============ 2FA SETUP ============
async function open2faSetup() {
  document.getElementById('modal-2fa')?.classList.add('open');
  const body = document.getElementById('modal-2fa-body');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:#888;">Gerando QR code...</div>';
  try {
    const j = await fetch('/api/2fa/setup', { method: 'POST', credentials: 'same-origin' }).then(r => r.json());
    if (j.error) { body.innerHTML = '<div style="color:#ff8a8a;padding:14px;">' + j.error + '</div>'; return; }
    body.innerHTML = `
      <div style="text-align:center;">
        <div style="background:#fff;padding:14px;border-radius:10px;display:inline-block;"><canvas id="totp-qr"></canvas></div>
        <div style="margin-top:14px;color:#aaa;font-size:12.5px;line-height:1.5;">Escaneie o QR no Google Authenticator, Authy ou similar.</div>
        <div style="background:#0a0a0a;border:1px solid var(--border);padding:8px;border-radius:6px;margin-top:10px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#888;word-break:break-all;">${escapeHtml(j.secret)}</div>
        <input id="totp-token" placeholder="código de 6 dígitos" maxlength="6" style="background:#0a0a0a;border:1px solid var(--border);color:#fff;border-radius:8px;padding:11px 14px;font-family:'IBM Plex Mono',monospace;font-size:18px;text-align:center;letter-spacing:.3em;width:200px;margin-top:18px;">
        <div><button onclick="confirm2fa()" style="background:#3b82f6;color:#fff;border:0;padding:11px 22px;border-radius:8px;font-weight:800;font-family:inherit;font-size:12.5px;cursor:pointer;margin-top:14px;">Confirmar e Ativar</button></div>
      </div>
    `;
    if (window.QRCode) QRCode.toCanvas(document.getElementById('totp-qr'), j.uri, { width: 220, margin: 1 });
  } catch (e) { body.innerHTML = '<div style="color:#ff8a8a;padding:14px;">' + e.message + '</div>'; }
}

async function confirm2fa() {
  const token = document.getElementById('totp-token').value.trim();
  if (!/^\d{6}$/.test(token)) return toast('código deve ter 6 dígitos', 'err');
  try {
    const r = await fetch('/api/2fa/verify-setup', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    document.getElementById('modal-2fa-body').innerHTML = `
      <div style="text-align:center;padding:14px 0;">
        <div style="width:54px;height:54px;border-radius:50%;background:rgba(34,197,94,.15);display:flex;align-items:center;justify-content:center;margin:0 auto;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h3 style="color:#fff;margin-top:14px;">2FA ativado!</h3>
        <p style="color:#aaa;font-size:12.5px;margin-top:6px;">Salve os códigos de recuperação abaixo num local seguro. Eles funcionam UMA vez cada se você perder o dispositivo.</p>
        <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:8px;padding:14px;margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:6px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:#7dd3a4;">
          ${j.recovery_codes.map(c => `<div>${c}</div>`).join('')}
        </div>
        <button onclick="closeModal('modal-2fa');loadCarteira()" style="background:#22c55e;color:#000;border:0;padding:11px 22px;border-radius:8px;font-weight:800;font-family:inherit;font-size:12.5px;cursor:pointer;margin-top:14px;">Concluir</button>
      </div>
    `;
  } catch (e) { toast(e.message, 'err'); }
}

const __origSpCt = window.sp;
if (typeof __origSpCt === 'function' && !window.__spHookedCt) {
  window.__spHookedCt = true;
  window.sp = function (page, el) {
    __origSpCt(page, el);
    if (page === 'carteira') loadCarteira();
  };
}

// ============ INVITE TRACKER ============
let __itData = null;
async function loadInviteTracker() {
  try {
    __itData = await fetch('/api/extras/invite-tracker', { credentials: 'same-origin' }).then(r => r.json());
    document.getElementById('it-enabled').checked = !!__itData.enabled;
    document.getElementById('it-log-channel').value = __itData.log_channel || '';
    document.getElementById('it-entry-msg').value = __itData.entry_message || '';
    document.getElementById('it-leave-msg').value = __itData.leave_message || '';
    // toggle visual
    const ck = document.getElementById('it-enabled');
    const bg = ck.parentElement.querySelector('.tg-bg');
    const th = ck.parentElement.querySelector('.tg-th');
    bg.style.background = ck.checked ? '#22c55e' : '#1a1a1a';
    bg.style.borderColor = ck.checked ? '#22c55e' : 'var(--border)';
    th.style.left = ck.checked ? '19px' : '3px';
    renderItRewards();
  } catch (e) { console.warn('it', e.message); }
}

function renderItRewards() {
  const wrap = document.getElementById('it-rewards');
  if (!wrap || !__itData) return;
  const rewards = __itData.role_rewards || [];
  wrap.innerHTML = rewards.length ? rewards.map((r, i) => `
    <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;gap:10px;align-items:center;">
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#aaa;">A partir de</div>
      <input type="number" min="1" value="${r.invites || 0}" oninput="__itData.role_rewards[${i}].invites=parseInt(this.value)||0;saveItDebounced()" class="inp" style="width:80px;font-family:'IBM Plex Mono',monospace;">
      <div style="font-size:11px;color:#aaa;">convites →</div>
      <input value="${escapeAttr(r.role_id || '')}" oninput="__itData.role_rewards[${i}].role_id=this.value;saveItDebounced()" placeholder="ID do cargo" class="inp" style="flex:1;font-family:'IBM Plex Mono',monospace;font-size:11px;">
      <button onclick="__itData.role_rewards.splice(${i},1);renderItRewards();saveIt()" style="background:transparent;border:0;color:#ff8a8a;cursor:pointer;font-size:14px;">×</button>
    </div>
  `).join('') : '<div style="color:#666;font-size:11.5px;text-align:center;padding:14px;">Nenhuma meta configurada</div>';
}

function addItReward() {
  if (!__itData.role_rewards) __itData.role_rewards = [];
  __itData.role_rewards.push({ invites: 10, role_id: '' });
  renderItRewards();
  saveIt();
}

let __itSaveTimer = null;
function saveItDebounced() {
  clearTimeout(__itSaveTimer);
  __itSaveTimer = setTimeout(saveIt, 600);
}

async function saveIt() {
  if (!__itData) return;
  __itData.enabled = document.getElementById('it-enabled').checked;
  __itData.log_channel = document.getElementById('it-log-channel').value;
  __itData.entry_message = document.getElementById('it-entry-msg').value;
  __itData.leave_message = document.getElementById('it-leave-msg').value;
  // toggle visual sync
  const ck = document.getElementById('it-enabled');
  const bg = ck.parentElement.querySelector('.tg-bg');
  const th = ck.parentElement.querySelector('.tg-th');
  bg.style.background = ck.checked ? '#22c55e' : '#1a1a1a';
  bg.style.borderColor = ck.checked ? '#22c55e' : 'var(--border)';
  th.style.left = ck.checked ? '19px' : '3px';
  try {
    await fetch('/api/extras/invite-tracker', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(__itData)
    });
  } catch {}
}

const __origSpIt = window.sp;
if (typeof __origSpIt === 'function' && !window.__spHookedIt) {
  window.__spHookedIt = true;
  window.sp = function (page, el) {
    __origSpIt(page, el);
    if (page === 'invite-tracker') loadInviteTracker();
  };
}

// ============ PAGE CONTA (user-level Configurações) ============
function switchContaTab(tab) {
  document.querySelectorAll('.conta-tab').forEach(b => {
    const on = b.dataset.contaTab === tab;
    b.classList.toggle('active', on);
    b.style.background = on ? 'rgba(139,111,255,.15)' : 'transparent';
    b.style.borderColor = on ? 'rgba(139,111,255,.3)' : 'transparent';
    b.style.color = on ? '#fff' : '#888';
  });
  document.querySelectorAll('.conta-pane').forEach(p => p.style.display = 'none');
  const pane = document.getElementById('conta-tab-' + tab);
  if (pane) pane.style.display = 'block';
  if (tab === 'carteira') loadConta();
}

async function loadConta() {
  try {
    const j = await fetch('/api/conta', { credentials: 'same-origin' }).then(r => r.json());
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
    set('conta-company-name', j.company_name);
    set('conta-company-logo', j.company_logo_url);
    set('conta-company-color', j.company_color || '#8B5CF6');
    set('conta-company-color-picker', j.company_color || '#8B5CF6');
    set('conta-webhook-url', j.webhook_url);
    set('conta-callback-url', j.callback_url);
    const repassChk = document.getElementById('conta-repass-fee');
    if (repassChk) repassChk.checked = !!j.repass_fee_to_customer;
    // API Key
    const keyInput = document.getElementById('conta-api-key');
    const createdLbl = document.getElementById('conta-api-created');
    if (keyInput) keyInput.value = j.api_key_masked || '';
    if (createdLbl) createdLbl.textContent = j.api_key_created_at
      ? 'Criada em ' + new Date(j.api_key_created_at * 1000).toLocaleString('pt-BR')
      : '';
    // Banner 2FA
    const banner = document.getElementById('conta-2fa-required');
    if (banner) banner.style.display = j.twofa_enabled ? 'none' : 'flex';
    const genBtn = document.getElementById('conta-api-gen');
    if (genBtn) {
      genBtn.disabled = !j.twofa_enabled;
      genBtn.style.opacity = j.twofa_enabled ? '1' : '.5';
      genBtn.style.cursor = j.twofa_enabled ? 'pointer' : 'not-allowed';
    }
  } catch (e) { console.warn('loadConta', e.message); }
}

async function saveConta() {
  const get = id => document.getElementById(id)?.value || '';
  const body = {
    company_name: get('conta-company-name').trim(),
    company_logo_url: get('conta-company-logo').trim() || null,
    company_color: get('conta-company-color').trim() || '#8B5CF6',
    webhook_url: get('conta-webhook-url').trim() || null,
    callback_url: get('conta-callback-url').trim() || null,
    repass_fee_to_customer: document.getElementById('conta-repass-fee')?.checked || false
  };
  try {
    const r = await fetch('/api/conta', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha ao salvar', 'err');
    toast('Configurações salvas');
  } catch (e) { toast(e.message, 'err'); }
}

async function generateApiKey() {
  if (!confirm('Gerar nova API Key?\n\nIsso REVOGA a anterior. Você só verá a key inteira uma vez — copie agora.')) return;
  try {
    const r = await fetch('/api/conta/api-key/generate', { method: 'POST', credentials: 'same-origin' });
    const j = await r.json();
    if (!r.ok) {
      if (j.twofa_required) toast('Ative 2FA antes de gerar API Key', 'err');
      else toast(j.error || 'Falha', 'err');
      return;
    }
    const input = document.getElementById('conta-api-key');
    if (input) {
      input.value = j.api_key;
      input.type = 'text';
      input.style.color = '#7dd3a4';
    }
    toast('API Key gerada — copie agora!');
    setTimeout(loadConta, 200);
  } catch (e) { toast(e.message, 'err'); }
}

async function copyApiKey() {
  const v = document.getElementById('conta-api-key')?.value || '';
  if (!v) return toast('Nenhuma key — gere uma primeiro', 'err');
  try { await navigator.clipboard.writeText(v); toast('API Key copiada'); }
  catch { toast('Falha ao copiar', 'err'); }
}

// Hook na nav sp
const __origSpConta = window.sp;
if (typeof __origSpConta === 'function' && !window.__spHookedConta) {
  window.__spHookedConta = true;
  window.sp = function (page, el) {
    __origSpConta(page, el);
    if (page === 'conta') loadConta();
  };
}

async function endAllSessions() {
  if (!confirm('Encerrar todas as sessões em todos os dispositivos?\n\nVocê será deslogado agora.')) return;
  try {
    const r = await fetch('/auth/sessions/end-all', { method: 'POST', credentials: 'same-origin' });
    if (r.ok) {
      toast('Sessões encerradas. Redirecionando...');
      setTimeout(() => location.href = '/login.html', 800);
    } else toast('Falha', 'err');
  } catch (e) { toast(e.message, 'err'); }
}

function scrollTo2FA() {
  // Tenta scroll ao card 2FA do app.html se existir (carteira tem o setup)
  setTimeout(() => {
    const el = document.getElementById('ct-2fa-banner') || document.querySelector('[id*="2fa"]');
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }, 200);
}

// ============ MULTI-CONTA (browser-side, localStorage) ============
// Mantem lista de contas conhecidas pra trocar sem refazer login.
// Cada conta salva: { id, email, display_name, avatar, last_seen }
// A sessao real ainda eh server-side (cookie por dominio).

const MULTI_ACC_KEY = 'botdash:accounts';

function loadKnownAccounts() {
  try { return JSON.parse(localStorage.getItem(MULTI_ACC_KEY) || '[]'); }
  catch { return []; }
}

function saveKnownAccounts(list) {
  try { localStorage.setItem(MULTI_ACC_KEY, JSON.stringify(list.slice(0, 5))); } catch {}
}

function trackCurrentAccount() {
  // Captura o user atual e adiciona/atualiza no storage local
  fetch('/auth/me', { credentials: 'same-origin' }).then(r => r.json()).then(me => {
    if (!me?.authenticated || !me.user) return;
    const u = me.user;
    const list = loadKnownAccounts();
    const idx = list.findIndex(a => a.id == u.id || a.email === u.email);
    const entry = {
      id: u.id, email: u.email,
      display_name: u.display_name || u.username || u.email,
      avatar: u.discord_avatar || null,
      last_seen: Date.now(),
      active: true
    };
    if (idx >= 0) list[idx] = { ...list[idx], ...entry };
    else list.unshift(entry);
    // marca outras como inativas
    for (const a of list) if (a.id != entry.id) a.active = false;
    saveKnownAccounts(list);
    renderMultiAccountList();
  }).catch(() => {});
}

function renderMultiAccountList() {
  const wrap = document.getElementById('multi-accounts-list');
  if (!wrap) return;
  const list = loadKnownAccounts();
  const others = list.filter(a => !a.active);
  if (others.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  wrap.innerHTML = `
    <div style="padding:4px 16px;font-size:9.5px;color:#666;text-transform:uppercase;letter-spacing:.08em;font-family:'IBM Plex Mono',monospace;">Outras contas</div>
    ${others.map(a => `
      <a href="#" onclick="switchAccount('${escapeAttr(a.email)}');return false;" class="um-item" style="display:flex;align-items:center;gap:10px;padding:8px 16px;color:#aaa;text-decoration:none;font-size:12.5px;cursor:pointer;">
        <div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#8b6fff,#5865f2);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;${a.avatar ? `background:url('${escapeAttr(a.avatar)}') center/cover;` : ''}">${a.avatar ? '' : (a.display_name || a.email || '?').charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div style="color:#fff;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.display_name)}</div>
          <div style="font-size:10px;color:#666;font-family:'IBM Plex Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.email)}</div>
        </div>
      </a>
    `).join('')}
  `;
}

function switchAccount(email) {
  // Desloga atual e redireciona pro login com email pre-preenchido
  if (!confirm('Trocar pra conta ' + email + '?\n\nVocê será deslogado e levado ao login.')) return;
  fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).then(() => {
    location.href = '/login.html?email=' + encodeURIComponent(email);
  });
}

function openAddAccountFlow() {
  closeUserMenu();
  if (!confirm('Adicionar outra conta?\n\nVocê será deslogado e levado ao login. A conta atual permanece salva.')) return;
  fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).then(() => {
    location.href = '/login.html?add=1';
  });
}

setTimeout(trackCurrentAccount, 1200);

// ============ PAGE LOJA (Painéis + Geral + Cupons) ============
let __shopPanels = [];
let __selectedShopPanel = null;

function switchLojaTab(tab) {
  document.querySelectorAll('.loja-tab').forEach(b => {
    const on = b.dataset.lojaTab === tab;
    b.style.color = on ? '#fff' : '#666';
    b.style.borderBottomColor = on ? 'var(--primary)' : 'transparent';
  });
  document.querySelectorAll('.loja-pane').forEach(p => p.style.display = 'none');
  const pane = document.getElementById('loja-pane-' + tab);
  if (pane) pane.style.display = 'block';
  if (tab === 'geral') loadLojaCheckout();
  if (tab === 'paineis') loadShopPanels();
}

async function loadLojaCheckout() {
  try {
    const c = await fetch('/api/shop/checkout-config', { credentials: 'same-origin' }).then(r => r.json());
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
    set('lojacfg-api-key', c.api_key_masked || '');
    document.getElementById('lojacfg-repass').checked = !!c.repass_fee;
    set('lojacfg-currency', c.currency || 'BRL');
    set('lojacfg-locale', c.locale || 'pt-BR');
    set('lojacfg-color-center', c.brand_color_center || '#8B5CF6');
    set('lojacfg-color-center-picker', c.brand_color_center || '#8B5CF6');
    set('lojacfg-color-border', c.brand_color_border || '#6D28D9');
    set('lojacfg-color-border-picker', c.brand_color_border || '#6D28D9');
    set('lojacfg-logo-url', c.brand_logo_url || '');
    set('lojacfg-zoom', c.qr_zoom || 100);
    document.getElementById('lojacfg-zoom-val').textContent = c.qr_zoom || 100;
    setQrPos(c.qr_position || 'main');
    document.getElementById('lojacfg-instr-enabled').checked = !!c.instruction_enabled;
    updateInstrToggleVisual();
    set('lojacfg-instr-msg', c.instruction_message || '');
    set('lojacfg-btn-name', c.instruction_button_name || '');
    set('lojacfg-btn-url', c.instruction_button_url || '');
    // banner warning api key
    document.getElementById('loja-api-warning').style.display = c.api_key_present ? 'none' : 'flex';
    updateCheckoutPreview();
    document.getElementById('lojacfg-instr-enabled').addEventListener('change', updateInstrToggleVisual);
  } catch (e) { console.warn('loadLojaCheckout', e.message); }
}

function updateInstrToggleVisual() {
  const cb = document.getElementById('lojacfg-instr-enabled');
  if (!cb) return;
  const track = cb.parentElement.querySelector('.inst-track');
  const knob = cb.parentElement.querySelector('.inst-knob');
  if (track) {
    track.style.background = cb.checked ? '#8b6fff' : '#1a1a1a';
    track.style.borderColor = cb.checked ? '#8b6fff' : 'var(--border)';
  }
  if (knob) knob.style.left = cb.checked ? '19px' : '3px';
}

function setQrPos(pos) {
  window.__qrPos = pos;
  const m = document.getElementById('lojacfg-pos-main');
  const t = document.getElementById('lojacfg-pos-thumb');
  if (m) {
    m.style.background = pos === 'main' ? 'rgba(139,111,255,.2)' : 'transparent';
    m.style.borderColor = pos === 'main' ? 'rgba(139,111,255,.4)' : 'var(--border)';
    m.style.color = pos === 'main' ? '#fff' : '#888';
  }
  if (t) {
    t.style.background = pos === 'thumbnail' ? 'rgba(139,111,255,.2)' : 'transparent';
    t.style.borderColor = pos === 'thumbnail' ? 'rgba(139,111,255,.4)' : 'var(--border)';
    t.style.color = pos === 'thumbnail' ? '#fff' : '#888';
  }
}

function updateCheckoutPreview() {
  const center = document.getElementById('lojacfg-color-center')?.value || '#8B5CF6';
  const logoUrl = document.getElementById('lojacfg-logo-url')?.value || '';
  const zoom = parseInt(document.getElementById('lojacfg-zoom')?.value || 100);
  const prev = document.getElementById('checkout-preview');
  if (prev) prev.style.borderLeftColor = center;
  const logo = document.getElementById('prev-qr-logo');
  if (logo) {
    if (logoUrl) {
      logo.src = logoUrl;
      logo.style.display = 'block';
      logo.style.width = (42 * zoom / 100) + 'px';
      logo.style.height = (42 * zoom / 100) + 'px';
    } else logo.style.display = 'none';
  }
}

async function saveLojaCheckout() {
  const get = id => document.getElementById(id);
  const keyInput = get('lojacfg-api-key');
  const body = {
    repass_fee: get('lojacfg-repass').checked,
    currency: get('lojacfg-currency').value,
    locale: get('lojacfg-locale').value,
    brand_color_center: get('lojacfg-color-center').value,
    brand_color_border: get('lojacfg-color-border').value,
    brand_logo_url: get('lojacfg-logo-url').value || null,
    qr_zoom: parseInt(get('lojacfg-zoom').value),
    qr_position: window.__qrPos || 'main',
    instruction_enabled: get('lojacfg-instr-enabled').checked,
    instruction_message: get('lojacfg-instr-msg').value || null,
    instruction_button_name: get('lojacfg-btn-name').value || null,
    instruction_button_url: get('lojacfg-btn-url').value || null
  };
  // Só envia api_key se foi editada (não é o mascarado)
  const v = keyInput.value;
  if (v && !v.includes('••')) body.api_key = v;
  try {
    const r = await fetch('/api/shop/checkout-config', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    toast('Configurações salvas');
    loadLojaCheckout();
  } catch (e) { toast(e.message, 'err'); }
}

// ============ Painéis ============
async function loadShopPanels() {
  try {
    __shopPanels = await fetch('/api/shop/panels', { credentials: 'same-origin' }).then(r => r.json());
    renderShopPanelsList();
  } catch (e) { console.warn('loadShopPanels', e.message); }
}

function renderShopPanelsList() {
  const wrap = document.getElementById('loja-panel-list');
  if (!wrap) return;
  const q = (document.getElementById('loja-panel-search')?.value || '').toLowerCase();
  const list = q ? __shopPanels.filter(p => p.name.toLowerCase().includes(q)) : __shopPanels;
  if (!list.length) {
    wrap.innerHTML = '<div style="text-align:center;color:#666;padding:20px;font-size:11.5px;">Nenhum painel encontrado</div>';
    return;
  }
  wrap.innerHTML = list.map(p => `
    <div onclick="selectShopPanel(${p.id})" style="background:${__selectedShopPanel === p.id ? '#1a1a1a' : '#0e0e0e'};border:1px solid ${__selectedShopPanel === p.id ? 'var(--primary)' : 'var(--border)'};border-radius:8px;padding:10px;cursor:pointer;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:700;color:#fff;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</div>
        <span style="font-size:9.5px;padding:2px 6px;border-radius:6px;background:${p.posted_message_id ? 'rgba(34,197,94,.15)' : '#1a1a1a'};color:${p.posted_message_id ? '#7dd3a4' : '#666'};">${p.posted_message_id ? 'postado' : 'rascunho'}</span>
      </div>
      <div style="font-size:11px;color:#888;margin-top:3px;">${(p.product_ids || []).length} produto(s)</div>
    </div>
  `).join('');
}

function newShopPanel() {
  const name = prompt('Nome do novo painel:');
  if (!name) return;
  fetch('/api/shop/panels', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, embed_color: '#5865F2', embed_title: name })
  }).then(r => r.json()).then(j => {
    if (j.ok) { toast('Painel criado'); loadShopPanels(); }
    else toast(j.error || 'Falha', 'err');
  });
}

function selectShopPanel(id) {
  __selectedShopPanel = id;
  const p = __shopPanels.find(x => x.id === id);
  if (!p) return;
  renderShopPanelsList();
  const editor = document.getElementById('loja-panel-editor');
  editor.style.display = 'block';
  editor.style.alignItems = 'stretch';
  editor.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="font-weight:700;color:#fff;font-size:14px;">${escapeHtml(p.name)}</div>
      <button onclick="deleteShopPanel(${p.id})" style="background:transparent;border:1px solid rgba(255,107,107,.3);color:#ff8a8a;padding:6px 12px;border-radius:7px;cursor:pointer;font-size:11px;">Remover</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
      <div>
        <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Nome</label>
        <input id="sp-name" type="text" value="${escapeAttr(p.name)}" class="inp" style="margin-top:5px;">
      </div>
      <div>
        <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Canal (ID)</label>
        <input id="sp-channel" type="text" value="${escapeAttr(p.channel_id || '')}" placeholder="ID do canal" class="inp" style="margin-top:5px;font-family:'IBM Plex Mono',monospace;">
      </div>
    </div>
    <div style="margin-bottom:10px;">
      <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Descrição</label>
      <textarea id="sp-desc" rows="2" class="inp" style="margin-top:5px;">${escapeHtml(p.description || '')}</textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
      <div>
        <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Cor do Embed</label>
        <input id="sp-color" type="color" value="${p.embed_color || '#5865F2'}" style="width:100%;height:38px;margin-top:5px;border:1px solid var(--border);border-radius:7px;background:#0a0a0a;">
      </div>
      <div>
        <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Imagem do Embed (URL)</label>
        <input id="sp-image" type="text" value="${escapeAttr(p.embed_image_url || '')}" class="inp" style="margin-top:5px;">
      </div>
    </div>
    <div style="margin-bottom:10px;">
      <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Título do Embed</label>
      <input id="sp-title" type="text" value="${escapeAttr(p.embed_title || '')}" class="inp" style="margin-top:5px;">
    </div>
    <div style="margin-bottom:10px;">
      <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Descrição do Embed</label>
      <textarea id="sp-embed-desc" rows="3" class="inp" style="margin-top:5px;">${escapeHtml(p.embed_description || '')}</textarea>
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Rodapé</label>
      <input id="sp-footer" type="text" value="${escapeAttr(p.embed_footer || '')}" class="inp" style="margin-top:5px;">
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button onclick="saveShopPanel(${p.id})" style="background:linear-gradient(90deg,#8b6fff,#7758ff);color:#fff;border:0;padding:10px 18px;border-radius:7px;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;">Salvar painel</button>
    </div>
  `;
}

async function saveShopPanel(id) {
  const g = i => document.getElementById(i)?.value || '';
  const body = {
    name: g('sp-name'),
    channel_id: g('sp-channel') || null,
    description: g('sp-desc') || null,
    embed_color: g('sp-color'),
    embed_image_url: g('sp-image') || null,
    embed_title: g('sp-title') || null,
    embed_description: g('sp-embed-desc') || null,
    embed_footer: g('sp-footer') || null
  };
  try {
    const r = await fetch('/api/shop/panels/' + id, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) return toast('Falha', 'err');
    toast('Painel salvo'); loadShopPanels();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteShopPanel(id) {
  if (!confirm('Remover painel?')) return;
  try {
    await fetch('/api/shop/panels/' + id, { method: 'DELETE', credentials: 'same-origin' });
    toast('Removido');
    __selectedShopPanel = null;
    const editor = document.getElementById('loja-panel-editor');
    editor.innerHTML = 'Selecione um painel para editar';
    editor.style.display = 'flex';
    editor.style.alignItems = 'center';
    editor.style.justifyContent = 'center';
    loadShopPanels();
  } catch (e) { toast(e.message, 'err'); }
}

// Hook
const __origSpLoja = window.sp;
if (typeof __origSpLoja === 'function' && !window.__spHookedLoja) {
  window.__spHookedLoja = true;
  window.sp = function (page, el) {
    __origSpLoja(page, el);
    if (page === 'loja-cfg') { loadShopPanels(); loadLojaCheckout(); }
  };
}

// ============ SORTEIOS — Modal Avançado ============
let __gv = null;       // sorteio carregado
let __gvTab = 'geral';

async function openGiveawayAdvanced(id) {
  try {
    __gv = await fetch('/api/giveaway-advanced/' + id, { credentials: 'same-origin' }).then(r => r.json());
    document.getElementById('modal-gv-title').textContent = 'Configurar: ' + (__gv.prize || 'sorteio');
    __gvTab = 'geral';
    renderGvTabs();
    renderGvTab();
    document.getElementById('modal-gv-adv').classList.add('open');
  } catch (e) { toast(e.message, 'err'); }
}

function switchGvTab(tab) {
  __gvTab = tab;
  renderGvTabs();
  renderGvTab();
}

function renderGvTabs() {
  document.querySelectorAll('.gv-tab').forEach(b => {
    const on = b.dataset.gvTab === __gvTab;
    b.style.color = on ? '#fff' : '#666';
    b.style.borderBottomColor = on ? 'var(--primary)' : 'transparent';
  });
}

function renderGvTab() {
  const body = document.getElementById('modal-gv-body');
  if (!__gv || !body) return;

  if (__gvTab === 'geral') {
    body.innerHTML = `
      <div style="border-left:3px solid var(--primary);padding-left:12px;margin-bottom:14px;">
        <div style="font-weight:700;color:#fff;font-size:13.5px;">Informações Básicas</div>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Nome do Sorteio</label>
        <input id="gv-adv-name" type="text" value="${escapeAttr(__gv.prize || '')}" class="inp" style="margin-top:5px;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div>
          <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Ícone (URL)</label>
          <input id="gv-adv-icon" type="text" value="${escapeAttr(__gv.icon_url || '')}" placeholder="https://..." class="inp" style="margin-top:5px;font-family:'IBM Plex Mono',monospace;">
        </div>
        <div>
          <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Banner (URL)</label>
          <input id="gv-adv-banner" type="text" value="${escapeAttr(__gv.banner_url || '')}" placeholder="https://..." class="inp" style="margin-top:5px;font-family:'IBM Plex Mono',monospace;">
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Descrição</label>
        <textarea id="gv-adv-desc" rows="3" class="inp" style="margin-top:5px;">${escapeHtml(__gv.description || '')}</textarea>
      </div>

      <div style="border-left:3px solid var(--primary);padding-left:12px;margin:18px 0 12px;">
        <div style="font-weight:700;color:#fff;font-size:13.5px;">Modo de Entrega Automática</div>
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Tipo de Entrega</label>
        <select id="gv-adv-delivery" class="inp" style="margin-top:5px;" onchange="document.getElementById('gv-adv-payload-wrap').style.display=this.value==='none'?'none':'block'">
          <option value="none" ${__gv.delivery_type === 'none' ? 'selected' : ''}>Sem entrega automática</option>
          <option value="cargo" ${__gv.delivery_type === 'cargo' ? 'selected' : ''}>Cargo Discord</option>
          <option value="codigo" ${__gv.delivery_type === 'codigo' ? 'selected' : ''}>Código de resgate</option>
          <option value="mensagem" ${__gv.delivery_type === 'mensagem' ? 'selected' : ''}>Mensagem DM</option>
        </select>
      </div>
      <div id="gv-adv-payload-wrap" style="margin-bottom:14px;display:${__gv.delivery_type && __gv.delivery_type !== 'none' ? 'block' : 'none'};">
        <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Payload</label>
        <input id="gv-adv-payload" type="text" value="${escapeAttr(__gv.delivery_payload || '')}" placeholder="role_id, código, ou mensagem" class="inp" style="margin-top:5px;">
      </div>

      <label style="display:flex;align-items:center;gap:10px;padding:11px;background:#0a0a0a;border:1px solid var(--border);border-radius:8px;cursor:pointer;">
        <input type="checkbox" id="gv-adv-monitor" ${__gv.monitor ? 'checked' : ''} style="accent-color:#8b6fff;">
        <div>
          <div style="font-size:12.5px;color:#fff;font-weight:600;">Monitorar</div>
          <div style="font-size:11px;color:#888;margin-top:2px;">Notifica owner quando há novos participantes</div>
        </div>
      </label>

      <div style="display:flex;justify-content:flex-end;margin-top:18px;">
        <button onclick="saveGvGeneral()" style="background:linear-gradient(90deg,#8b6fff,#7758ff);color:#fff;border:0;padding:10px 18px;border-radius:8px;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;">Salvar</button>
      </div>
    `;
  } else if (__gvTab === 'requisitos') {
    const r = __gv.requirements || {};
    const toggles = r.toggles || {};
    body.innerHTML = `
      <div style="border-left:3px solid var(--primary);padding-left:12px;margin-bottom:14px;">
        <div style="font-weight:700;color:#fff;font-size:13.5px;">Requisitos de Participação</div>
        <div style="font-size:11.5px;color:#888;margin-top:3px;">Filtros pra quem pode entrar no sorteio</div>
      </div>
      ${[
        { k: 'membro_cliente', l: 'Membro Cliente' },
        { k: 'feedback', l: 'Feedback Science' },
        { k: 'verificado', l: 'Membro Verificado' },
        { k: 'em_voz', l: 'Em Canal de Voz' },
        { k: 'voz_mutada', l: 'Voz Mutada' },
        { k: 'voz_surda', l: 'Voz Surda' }
      ].map(t => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:#0a0a0a;border:1px solid var(--border);border-radius:7px;margin-bottom:5px;">
          <span style="font-size:12.5px;color:#fff;">${t.l}</span>
          <label style="position:relative;display:inline-block;width:34px;height:20px;cursor:pointer;">
            <input type="checkbox" data-gv-toggle="${t.k}" ${toggles[t.k] ? 'checked' : ''} style="opacity:0;width:0;height:0;" onchange="this.parentElement.querySelector('.tk').style.background=this.checked?'#22c55e':'#1a1a1a';this.parentElement.querySelector('.kb').style.left=this.checked?'17px':'3px'">
            <span class="tk" style="position:absolute;inset:0;background:${toggles[t.k] ? '#22c55e' : '#1a1a1a'};border:1px solid var(--border);border-radius:20px;transition:.2s;"></span>
            <span class="kb" style="position:absolute;height:14px;width:14px;left:${toggles[t.k] ? '17px' : '3px'};top:2px;background:#fff;border-radius:50%;transition:.2s;"></span>
          </label>
        </div>
      `).join('')}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Dias de Conta Mín.</label><input id="gv-req-dias-conta" type="number" min="0" value="${r.dias_conta_min || 0}" class="inp" style="margin-top:4px;"></div>
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Convites Mínimos</label><input id="gv-req-convites" type="number" min="0" value="${r.convites_min || 0}" class="inp" style="margin-top:4px;"></div>
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Gasto Mínimo (R$)</label><input id="gv-req-gasto-min" type="number" min="0" step="0.01" value="${(r.gasto_min || 0) / 100}" class="inp" style="margin-top:4px;"></div>
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Gasto Máximo (R$)</label><input id="gv-req-gasto-max" type="number" min="0" step="0.01" value="${(r.gasto_max || 0) / 100}" class="inp" style="margin-top:4px;"></div>
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Primeira Compra (Dias)</label><input id="gv-req-primeira" type="number" min="0" value="${r.primeira_compra_dias || 0}" class="inp" style="margin-top:4px;"></div>
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Última Compra (Dias)</label><input id="gv-req-ultima" type="number" min="0" value="${r.ultima_compra_dias || 0}" class="inp" style="margin-top:4px;"></div>
      </div>

      <div style="margin-top:14px;">
        <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Cargos Obrigatórios (IDs, vírgula)</label>
        <input id="gv-req-cargos-ob" type="text" value="${escapeAttr((r.cargos_obrigatorios || []).join(', '))}" placeholder="Selecione cargos..." class="inp" style="margin-top:4px;font-family:'IBM Plex Mono',monospace;">
      </div>
      <div style="margin-top:10px;">
        <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Cargos Bloqueados (IDs, vírgula)</label>
        <input id="gv-req-cargos-bl" type="text" value="${escapeAttr((r.cargos_bloqueados || []).join(', '))}" placeholder="Selecione cargos..." class="inp" style="margin-top:4px;font-family:'IBM Plex Mono',monospace;">
      </div>
      <div style="margin-top:10px;">
        <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Canais de Voz (IDs, vírgula)</label>
        <input id="gv-req-canais-voz" type="text" value="${escapeAttr((r.canais_voz || []).join(', '))}" placeholder="Selecione canais..." class="inp" style="margin-top:4px;font-family:'IBM Plex Mono',monospace;">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Nicknames (um por linha)</label><textarea id="gv-req-nicks" rows="3" class="inp" style="margin-top:4px;">${escapeHtml((r.nicknames || []).join('\n'))}</textarea></div>
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Status (um por linha)</label><textarea id="gv-req-status" rows="3" class="inp" style="margin-top:4px;">${escapeHtml((r.status || []).join('\n'))}</textarea></div>
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Atividades (um por linha)</label><textarea id="gv-req-ativ" rows="3" class="inp" style="margin-top:4px;">${escapeHtml((r.atividades || []).join('\n'))}</textarea></div>
        <div><label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Bios (um por linha)</label><textarea id="gv-req-bios" rows="3" class="inp" style="margin-top:4px;">${escapeHtml((r.bios || []).join('\n'))}</textarea></div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:18px;">
        <button onclick="saveGvRequirements()" style="background:linear-gradient(90deg,#8b6fff,#7758ff);color:#fff;border:0;padding:10px 18px;border-radius:8px;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;">Salvar Requisitos</button>
      </div>
    `;
  } else if (__gvTab === 'tarefas') {
    const tasks = __gv.tasks || [];
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div>
          <div style="font-weight:700;color:#fff;font-size:13.5px;">Tarefas</div>
          <div style="font-size:11.5px;color:#888;margin-top:3px;">Gamificação — usuário tem que cumprir antes de entrar</div>
        </div>
        <button onclick="addGvTask()" style="background:rgba(139,111,255,.2);border:1px solid rgba(139,111,255,.3);color:#b9a8ff;padding:7px 12px;border-radius:7px;cursor:pointer;font-family:inherit;font-size:12px;">+ Nova Tarefa</button>
      </div>
      ${tasks.length ? tasks.map(t => `
        <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:10px;background:#1a1a1a;border:1px solid var(--border);color:#aaa;padding:2px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:.04em;font-family:'IBM Plex Mono',monospace;">${escapeHtml(t.type)}</span>
            <button onclick="deleteGvTask(${t.id})" style="background:transparent;border:0;color:#ff8a8a;font-size:11px;cursor:pointer;">remover</button>
          </div>
          <div style="font-weight:700;color:#fff;font-size:13px;margin-bottom:6px;">${escapeHtml(t.title)}</div>
          ${t.url ? `<div style="font-size:11px;color:#88c0ff;font-family:'IBM Plex Mono',monospace;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(t.url)}</div>` : ''}
        </div>
      `).join('') : `
        <div style="text-align:center;padding:40px 20px;color:#666;">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:10px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <div style="font-size:13px;">Crie uma tarefa para começar</div>
        </div>
      `}
    `;
  }
}

async function saveGvGeneral() {
  if (!__gv) return;
  const get = id => document.getElementById(id)?.value || '';
  const body = {
    name: get('gv-adv-name'),
    icon_url: get('gv-adv-icon') || null,
    banner_url: get('gv-adv-banner') || null,
    description: get('gv-adv-desc') || null,
    delivery_type: get('gv-adv-delivery'),
    delivery_payload: get('gv-adv-payload') || null,
    monitor: document.getElementById('gv-adv-monitor')?.checked || false
  };
  try {
    const r = await fetch('/api/giveaway-advanced/' + __gv.id + '/general', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) return toast('Falha', 'err');
    toast('Salvo'); openGiveawayAdvanced(__gv.id);
  } catch (e) { toast(e.message, 'err'); }
}

async function saveGvRequirements() {
  if (!__gv) return;
  const toggles = {};
  document.querySelectorAll('[data-gv-toggle]').forEach(el => { toggles[el.dataset.gvToggle] = el.checked; });
  const g = id => document.getElementById(id)?.value || '';
  const lines = id => g(id).split('\n').map(s => s.trim()).filter(Boolean);
  const list = id => g(id).split(',').map(s => s.trim()).filter(Boolean);
  const body = {
    toggles,
    dias_conta_min: parseInt(g('gv-req-dias-conta')) || 0,
    convites_min: parseInt(g('gv-req-convites')) || 0,
    gasto_min: Math.round(parseFloat(g('gv-req-gasto-min')) * 100) || 0,
    gasto_max: Math.round(parseFloat(g('gv-req-gasto-max')) * 100) || 0,
    primeira_compra_dias: parseInt(g('gv-req-primeira')) || 0,
    ultima_compra_dias: parseInt(g('gv-req-ultima')) || 0,
    cargos_obrigatorios: list('gv-req-cargos-ob'),
    cargos_bloqueados: list('gv-req-cargos-bl'),
    canais_voz: list('gv-req-canais-voz'),
    nicknames: lines('gv-req-nicks'),
    status: lines('gv-req-status'),
    atividades: lines('gv-req-ativ'),
    bios: lines('gv-req-bios')
  };
  try {
    const r = await fetch('/api/giveaway-advanced/' + __gv.id + '/requirements', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) return toast('Falha', 'err');
    toast('Requisitos salvos');
    __gv.requirements = body;
  } catch (e) { toast(e.message, 'err'); }
}

async function addGvTask() {
  const title = prompt('Título da tarefa:');
  if (!title) return;
  const type = prompt('Tipo (twitter_follow / discord_join / youtube_sub / url_visit / custom):', 'url_visit') || 'url_visit';
  const url = prompt('URL (opcional):') || null;
  try {
    const r = await fetch('/api/giveaway-advanced/' + __gv.id + '/tasks', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type, url })
    });
    if (!r.ok) return toast('Falha', 'err');
    toast('Tarefa criada');
    openGiveawayAdvanced(__gv.id);
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteGvTask(taskId) {
  if (!confirm('Remover tarefa?')) return;
  try {
    await fetch('/api/giveaway-advanced/' + __gv.id + '/tasks/' + taskId, { method: 'DELETE', credentials: 'same-origin' });
    toast('Removida');
    openGiveawayAdvanced(__gv.id);
  } catch (e) { toast(e.message, 'err'); }
}

// ============ TICKETS — Paineis de Suporte ============
let __supportPanels = [];

async function loadSupportPanels() {
  try {
    __supportPanels = await fetch('/api/support-panels', { credentials: 'same-origin' }).then(r => r.json());
    renderSupportPanelsList();
  } catch (e) { console.warn('loadSupportPanels', e.message); }
}

function renderSupportPanelsList() {
  const wrap = document.getElementById('sp-list-wrap');
  if (!wrap) return;
  const q = (document.getElementById('sp-search')?.value || '').toLowerCase();
  const list = q ? __supportPanels.filter(p => (p.name + ' ' + (p.description || '')).toLowerCase().includes(q)) : __supportPanels;
  if (!list.length) {
    wrap.innerHTML = '<div style="text-align:center;color:#666;padding:30px;background:#0a0a0a;border:1px solid var(--border);border-radius:10px;">Nenhum painel ainda. Clique em "Novo Painel" pra criar.</div>';
    return;
  }
  wrap.innerHTML = list.map(p => `
    <details style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;border-left:3px solid var(--primary);">
      <summary style="padding:14px 16px;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:14px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="font-weight:700;color:#fff;font-size:14px;">${escapeHtml(p.name)}</div>
            <span style="font-size:10px;padding:2px 7px;border-radius:8px;background:${p.posted_message_id ? 'rgba(34,197,94,.15)' : '#1a1a1a'};color:${p.posted_message_id ? '#7dd3a4' : '#666'};">${p.posted_message_id ? 'postado' : 'nao postado'}</span>
          </div>
          <div style="font-size:11.5px;color:#888;margin-top:3px;">${escapeHtml(p.description || 'sem descricao')}</div>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <span style="font-size:10px;background:#1a1a1a;border:1px solid var(--border);color:#aaa;padding:2px 8px;border-radius:10px;font-family:'IBM Plex Mono',monospace;">${(p.functions || []).length} funções</span>
            <span style="font-size:10px;background:#1a1a1a;border:1px solid var(--border);color:#aaa;padding:2px 8px;border-radius:10px;font-family:'IBM Plex Mono',monospace;">${(p.functions || []).filter(f => f.role_required).length} cargos</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button onclick="event.stopPropagation();postSupportPanel(${p.id})" style="background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);color:#7dd3a4;padding:6px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">Postar Painel</button>
          <button onclick="event.stopPropagation();deleteSupportPanel(${p.id})" style="background:transparent;border:1px solid rgba(255,107,107,.3);color:#ff8a8a;padding:6px 10px;border-radius:7px;font-size:11px;cursor:pointer;">×</button>
        </div>
      </summary>
      <div style="padding:0 16px 16px;">
        <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:14px;">
          <button onclick="event.preventDefault();switchSpTab(${p.id},'geral')" class="sp-pane-tab" data-sp-tab-${p.id}="geral" style="background:transparent;border:0;color:#fff;padding:10px 14px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid var(--primary);">Geral</button>
          <button onclick="event.preventDefault();switchSpTab(${p.id},'funcoes')" class="sp-pane-tab" data-sp-tab-${p.id}="funcoes" style="background:transparent;border:0;color:#666;padding:10px 14px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;">Funções</button>
          <button onclick="event.preventDefault();switchSpTab(${p.id},'embed')" class="sp-pane-tab" data-sp-tab-${p.id}="embed" style="background:transparent;border:0;color:#666;padding:10px 14px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;">Embed</button>
        </div>
        <div id="sp-pane-${p.id}">
          ${renderSupportPanelTab(p, 'geral')}
        </div>
      </div>
    </details>
  `).join('');
}

function switchSpTab(id, tab) {
  document.querySelectorAll(`[data-sp-tab-${id}]`).forEach(b => {
    const on = b.getAttribute(`data-sp-tab-${id}`) === tab;
    b.style.color = on ? '#fff' : '#666';
    b.style.borderBottomColor = on ? 'var(--primary)' : 'transparent';
  });
  const p = __supportPanels.find(x => x.id === id);
  if (!p) return;
  const pane = document.getElementById('sp-pane-' + id);
  if (pane) pane.innerHTML = renderSupportPanelTab(p, tab);
}

function renderSupportPanelTab(p, tab) {
  if (tab === 'geral') {
    const days = ['seg','ter','qua','qui','sex','sab','dom'];
    const selected = new Set(p.schedule_days || []);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-weight:600;font-size:12.5px;color:#fff;">Status</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" data-sp-active="${p.id}" ${p.active ? 'checked' : ''} style="accent-color:#22c55e;">
          <span style="color:${p.active ? '#7dd3a4' : '#888'};font-size:12px;font-weight:600;">${p.active ? 'Ativo' : 'Inativo'}</span>
        </label>
      </div>
      <div style="font-weight:600;font-size:12.5px;color:#fff;margin-bottom:10px;">Configurações de Funcionamento</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div>
          <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Início <span style="text-transform:none;color:#666;">(Opcional)</span></label>
          <input id="sp-start-${p.id}" type="time" value="${escapeAttr(p.schedule_start || '')}" class="inp" style="margin-top:5px;">
        </div>
        <div>
          <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Fim <span style="text-transform:none;color:#666;">(Opcional)</span></label>
          <input id="sp-end-${p.id}" type="time" value="${escapeAttr(p.schedule_end || '')}" class="inp" style="margin-top:5px;">
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Dias de Funcionamento</label>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
          ${days.map(d => {
            const on = selected.has(d);
            return `<button onclick="event.preventDefault();toggleSpDay(${p.id},'${d}')" data-sp-day-${p.id}="${d}" style="background:${on ? 'rgba(139,111,255,.25)' : 'transparent'};border:1px solid ${on ? 'rgba(139,111,255,.4)' : 'var(--border)'};color:${on ? '#fff' : '#888'};padding:6px 12px;border-radius:6px;font-family:inherit;font-size:11.5px;font-weight:600;cursor:pointer;text-transform:capitalize;">${d}</button>`;
          }).join('')}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button onclick="saveSupportPanel(${p.id})" style="background:#fff;color:#000;border:0;padding:9px 18px;border-radius:7px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;">Salvar</button>
      </div>
    `;
  }
  if (tab === 'funcoes') {
    const fns = p.functions || [];
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-weight:600;color:#fff;font-size:12.5px;">Funções do painel</div>
        <button onclick="addSpFunction(${p.id})" style="background:rgba(139,111,255,.2);border:1px solid rgba(139,111,255,.3);color:#b9a8ff;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">+ Nova Função</button>
      </div>
      ${fns.length ? fns.map((f, i) => `
        <div style="background:#0e0e0e;border:1px solid var(--border);border-radius:7px;padding:10px;margin-bottom:6px;display:flex;align-items:center;gap:10px;">
          <span style="font-size:16px;">${escapeHtml(f.emoji || '🎫')}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:#fff;font-size:12.5px;">${escapeHtml(f.label || 'sem nome')}</div>
            <div style="font-size:11px;color:#888;">${escapeHtml(f.category || 'sem categoria')}${f.role_required ? ' • cargo: ' + f.role_required : ''}</div>
          </div>
          <button onclick="rmSpFunction(${p.id},${i})" style="background:transparent;border:0;color:#ff8a8a;font-size:11px;cursor:pointer;">×</button>
        </div>
      `).join('') : '<div style="color:#666;font-size:11.5px;padding:14px;text-align:center;">Nenhuma função ainda</div>'}
    `;
  }
  if (tab === 'embed') {
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div>
          <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Cor</label>
          <input id="sp-color-${p.id}" type="color" value="${p.embed_color || '#5865F2'}" style="width:100%;height:36px;margin-top:5px;border:1px solid var(--border);border-radius:7px;background:#0a0a0a;">
        </div>
        <div>
          <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Imagem URL</label>
          <input id="sp-img-${p.id}" type="text" value="${escapeAttr(p.embed_image_url || '')}" class="inp" style="margin-top:5px;">
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Título</label>
        <input id="sp-title-${p.id}" type="text" value="${escapeAttr(p.embed_title || '')}" class="inp" style="margin-top:5px;">
      </div>
      <div style="margin-bottom:10px;">
        <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Descrição</label>
        <textarea id="sp-desc-${p.id}" rows="3" class="inp" style="margin-top:5px;">${escapeHtml(p.embed_description || '')}</textarea>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Rodapé</label>
        <input id="sp-footer-${p.id}" type="text" value="${escapeAttr(p.embed_footer || '')}" class="inp" style="margin-top:5px;">
      </div>
      <div style="display:flex;justify-content:flex-end;">
        <button onclick="saveSupportEmbed(${p.id})" style="background:#fff;color:#000;border:0;padding:9px 18px;border-radius:7px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;">Salvar Embed</button>
      </div>
    `;
  }
  return '';
}

function toggleSpDay(id, day) {
  const p = __supportPanels.find(x => x.id === id);
  if (!p) return;
  p.schedule_days = p.schedule_days || [];
  const idx = p.schedule_days.indexOf(day);
  if (idx >= 0) p.schedule_days.splice(idx, 1);
  else p.schedule_days.push(day);
  switchSpTab(id, 'geral');
}

async function newSupportPanel() {
  const name = prompt('Nome do painel:');
  if (!name) return;
  try {
    const r = await fetch('/api/support-panels', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!r.ok) return toast('Falha', 'err');
    toast('Painel criado'); loadSupportPanels();
  } catch (e) { toast(e.message, 'err'); }
}

async function saveSupportPanel(id) {
  const p = __supportPanels.find(x => x.id === id);
  if (!p) return;
  const get = i => document.getElementById(i)?.value || '';
  const body = {
    schedule_start: get('sp-start-' + id) || null,
    schedule_end: get('sp-end-' + id) || null,
    schedule_days: p.schedule_days || [],
    active: document.querySelector(`[data-sp-active="${id}"]`)?.checked
  };
  try {
    await fetch('/api/support-panels/' + id, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    toast('Salvo'); loadSupportPanels();
  } catch (e) { toast(e.message, 'err'); }
}

async function saveSupportEmbed(id) {
  const get = i => document.getElementById(i)?.value || '';
  const body = {
    embed_color: get('sp-color-' + id),
    embed_image_url: get('sp-img-' + id) || null,
    embed_title: get('sp-title-' + id) || null,
    embed_description: get('sp-desc-' + id) || null,
    embed_footer: get('sp-footer-' + id) || null
  };
  try {
    await fetch('/api/support-panels/' + id, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    toast('Embed salvo'); loadSupportPanels();
  } catch (e) { toast(e.message, 'err'); }
}

async function addSpFunction(id) {
  const label = prompt('Nome da função:');
  if (!label) return;
  const emoji = prompt('Emoji (opcional):') || '🎫';
  const category = prompt('Categoria (opcional):') || null;
  const role_required = prompt('Cargo exigido (opcional):') || null;
  const p = __supportPanels.find(x => x.id === id);
  if (!p) return;
  p.functions = p.functions || [];
  p.functions.push({ label, emoji, category, role_required });
  try {
    await fetch('/api/support-panels/' + id, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functions: p.functions })
    });
    toast('Função adicionada'); loadSupportPanels();
  } catch (e) { toast(e.message, 'err'); }
}

async function rmSpFunction(id, idx) {
  const p = __supportPanels.find(x => x.id === id);
  if (!p) return;
  p.functions.splice(idx, 1);
  try {
    await fetch('/api/support-panels/' + id, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functions: p.functions })
    });
    toast('Removida'); loadSupportPanels();
  } catch (e) { toast(e.message, 'err'); }
}

async function postSupportPanel(id) {
  if (!confirm('Postar painel no Discord?\n(Em breve com integração ao bot.service)')) return;
  try {
    await fetch('/api/support-panels/' + id + '/post', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    toast('Painel marcado como postado');
    loadSupportPanels();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteSupportPanel(id) {
  if (!confirm('Remover painel?')) return;
  try {
    await fetch('/api/support-panels/' + id, { method: 'DELETE', credentials: 'same-origin' });
    toast('Removido'); loadSupportPanels();
  } catch (e) { toast(e.message, 'err'); }
}

// Hook
const __origSpSp = window.sp;
if (typeof __origSpSp === 'function' && !window.__spHookedSp) {
  window.__spHookedSp = true;
  window.sp = function (page, el) {
    __origSpSp(page, el);
    if (page === 'support-panels') loadSupportPanels();
  };
}

// ============ eCloud landing ============
function ecloudShowConfig() {
  document.getElementById('ecloud-landing').style.display = 'none';
  document.getElementById('ecloud-config').style.display = 'block';
  if (typeof loadEcloud === 'function') loadEcloud();
}
function ecloudShowLanding() {
  document.getElementById('ecloud-landing').style.display = 'block';
  document.getElementById('ecloud-config').style.display = 'none';
}

// ============ EMBED BUILDER reusável ============
// mountEmbedBuilder({ container, value, onChange, showAuthor, showImage, showFooter, showFields, showButtons })
// value: { color, author:{name,url,iconUrl}, title, url, description, fields:[{name,value,inline}], imageUrl, footer:{text,iconUrl}, buttons:[{label,url}] }
function mountEmbedBuilder(opts = {}) {
  const root = opts.container;
  if (!root) return null;
  const value = Object.assign({
    color: '#5865F2',
    author: { name: '', url: '', iconUrl: '' },
    title: '',
    url: '',
    description: '',
    fields: [],
    imageUrl: '',
    footer: { text: '', iconUrl: '' },
    buttons: []
  }, opts.value || {});
  const opt = {
    showAuthor: true, showImage: true, showFooter: true, showFields: true, showButtons: false,
    botName: 'Bot', botAvatar: '',
    ...opts
  };

  function emit() { if (typeof opts.onChange === 'function') opts.onChange(getValue()); renderPreview(); }
  function getValue() { return JSON.parse(JSON.stringify(value)); }
  function setValue(v) { Object.assign(value, v); render(); }

  function render() {
    root.innerHTML = `
      <div class="eb-wrap" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="eb-left" style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;border-left:3px solid ${value.color};">
          <div style="font-size:11px;text-transform:uppercase;color:#888;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;margin-bottom:6px;">Cor da Embed</div>
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:14px;">
            <input type="color" class="eb-color" value="${value.color}" style="width:32px;height:32px;border:1px solid var(--border);border-radius:6px;cursor:pointer;">
            <input type="text" class="eb-color-hex" value="${value.color}" class="inp" style="flex:1;font-family:'IBM Plex Mono',monospace;background:#0e0e0e;border:1px solid var(--border);color:#fff;padding:7px 10px;border-radius:6px;">
          </div>

          ${opt.showAuthor ? `
            <div style="font-size:11px;text-transform:uppercase;color:#888;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;margin-bottom:6px;">Autor <span style="text-transform:none;color:#666;">(${(value.author.name || '').length}/256)</span></div>
            <div style="display:flex;gap:6px;margin-bottom:12px;">
              <div style="width:32px;height:32px;background:#0e0e0e;border:1px dashed var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;color:#666;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </div>
              <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
                <input class="eb-author-name" placeholder="Nome" value="${escapeAttr(value.author.name || '')}" maxlength="256" class="inp" style="background:#0e0e0e;border:1px solid var(--border);color:#fff;padding:6px 9px;border-radius:6px;font-size:11.5px;">
                <input class="eb-author-icon" placeholder="URL do ícone" value="${escapeAttr(value.author.iconUrl || '')}" class="inp" style="background:#0e0e0e;border:1px solid var(--border);color:#fff;padding:6px 9px;border-radius:6px;font-size:11.5px;font-family:'IBM Plex Mono',monospace;">
              </div>
            </div>
          ` : ''}

          <div style="font-size:11px;text-transform:uppercase;color:#888;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;margin-bottom:6px;">Título <span style="text-transform:none;color:#666;">(${(value.title || '').length}/256)</span></div>
          <input class="eb-title" value="${escapeAttr(value.title || '')}" placeholder="Escreva um título..." maxlength="256" style="width:100%;background:#0e0e0e;border:1px solid var(--border);color:#fff;padding:8px 10px;border-radius:6px;font-size:12.5px;margin-bottom:12px;">

          <div style="font-size:11px;text-transform:uppercase;color:#888;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;margin-bottom:6px;">Descrição <span style="text-transform:none;color:#666;">(${(value.description || '').length}/4096)</span></div>
          <textarea class="eb-desc" rows="4" placeholder="Escreva uma descrição..." maxlength="4096" style="width:100%;background:#0e0e0e;border:1px solid var(--border);color:#fff;padding:8px 10px;border-radius:6px;font-size:12.5px;margin-bottom:12px;font-family:inherit;">${escapeHtml(value.description || '')}</textarea>

          ${opt.showFields ? `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div style="font-size:11px;text-transform:uppercase;color:#888;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Fields ( Campos )</div>
              <button class="eb-add-field" style="background:rgba(139,111,255,.15);border:1px solid rgba(139,111,255,.3);color:#b9a8ff;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">+</button>
            </div>
            <div class="eb-fields-wrap" style="margin-bottom:12px;">
              ${(value.fields || []).map((f, i) => `
                <div class="eb-field" style="background:#0e0e0e;border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px;">
                  <div style="display:flex;gap:6px;margin-bottom:4px;">
                    <input class="eb-field-name" data-i="${i}" value="${escapeAttr(f.name || '')}" placeholder="Nome do campo" style="flex:1;background:#1a1a1a;border:1px solid var(--border);color:#fff;padding:5px 8px;border-radius:5px;font-size:11.5px;">
                    <button class="eb-field-rm" data-i="${i}" style="background:transparent;border:0;color:#ff8a8a;cursor:pointer;font-size:14px;">×</button>
                  </div>
                  <input class="eb-field-value" data-i="${i}" value="${escapeAttr(f.value || '')}" placeholder="Valor" style="width:100%;background:#1a1a1a;border:1px solid var(--border);color:#fff;padding:5px 8px;border-radius:5px;font-size:11.5px;">
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${opt.showImage ? `
            <div style="font-size:11px;text-transform:uppercase;color:#888;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;margin-bottom:6px;">Imagem</div>
            <div style="background:#0e0e0e;border:1px dashed var(--border);border-radius:6px;padding:18px;text-align:center;margin-bottom:12px;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" style="margin-bottom:6px;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <input class="eb-image" type="text" value="${escapeAttr(value.imageUrl || '')}" placeholder="URL da imagem (PNG/JPG/GIF até 10MB)" style="width:100%;background:#1a1a1a;border:1px solid var(--border);color:#fff;padding:6px 10px;border-radius:6px;font-size:11px;font-family:'IBM Plex Mono',monospace;">
            </div>
          ` : ''}

          ${opt.showFooter ? `
            <div style="font-size:11px;text-transform:uppercase;color:#888;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;margin-bottom:6px;">Rodapé <span style="text-transform:none;color:#666;">(${(value.footer.text || '').length}/2048)</span></div>
            <div style="display:flex;gap:6px;margin-bottom:8px;">
              <div style="width:32px;height:32px;background:#0e0e0e;border:1px dashed var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;color:#666;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </div>
              <input class="eb-footer-text" placeholder="Digite um rodapé..." value="${escapeAttr(value.footer.text || '')}" maxlength="2048" style="flex:1;background:#0e0e0e;border:1px solid var(--border);color:#fff;padding:7px 9px;border-radius:6px;font-size:11.5px;">
            </div>
          ` : ''}

          ${opt.showButtons ? `
            <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 6px;">
              <div style="font-size:11px;text-transform:uppercase;color:#888;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Botões <span style="text-transform:none;color:#666;">(${(value.buttons || []).length}/4)</span></div>
              <button class="eb-add-btn" ${(value.buttons || []).length >= 4 ? 'disabled' : ''} style="background:rgba(139,111,255,.15);border:1px solid rgba(139,111,255,.3);color:#b9a8ff;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:11px;">Adicionar Botão</button>
            </div>
            <div class="eb-buttons-wrap">
              ${(value.buttons || []).map((b, i) => `
                <div style="background:#0e0e0e;border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px;display:flex;gap:6px;">
                  <input class="eb-btn-label" data-i="${i}" value="${escapeAttr(b.label || '')}" placeholder="Texto" style="flex:1;background:#1a1a1a;border:1px solid var(--border);color:#fff;padding:5px 8px;border-radius:5px;font-size:11.5px;">
                  <input class="eb-btn-url" data-i="${i}" value="${escapeAttr(b.url || '')}" placeholder="URL" style="flex:1;background:#1a1a1a;border:1px solid var(--border);color:#fff;padding:5px 8px;border-radius:5px;font-size:11.5px;font-family:'IBM Plex Mono',monospace;">
                  <button class="eb-btn-rm" data-i="${i}" style="background:transparent;border:0;color:#ff8a8a;cursor:pointer;">×</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div class="eb-right">
          <div style="font-size:11px;text-transform:uppercase;color:#888;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;margin-bottom:8px;">Preview em tempo real</div>
          <div class="eb-preview" style="background:#36393F;border-radius:8px;overflow:hidden;border-left:4px solid ${value.color};padding:14px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#8b6fff,#5865f2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;${opt.botAvatar ? `background:url('${escapeAttr(opt.botAvatar)}') center/cover;` : ''}">${opt.botAvatar ? '' : (opt.botName || 'B').charAt(0)}</div>
              <span style="color:#fff;font-weight:600;font-size:13px;">${escapeHtml(opt.botName || 'Bot')}</span>
              <span style="color:#72767d;font-size:10.5px;">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            ${value.author.name ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">${value.author.iconUrl ? `<img src="${escapeAttr(value.author.iconUrl)}" style="width:18px;height:18px;border-radius:50%;">` : ''}<span style="color:#fff;font-size:11.5px;">${escapeHtml(value.author.name)}</span></div>` : ''}
            ${value.title ? `<div style="color:#fff;font-weight:700;font-size:14px;margin-bottom:6px;">${escapeHtml(value.title)}</div>` : ''}
            ${value.description ? `<div style="color:#dcddde;font-size:12.5px;line-height:1.45;white-space:pre-wrap;">${escapeHtml(value.description)}</div>` : ''}
            ${value.fields && value.fields.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">${value.fields.map(f => `<div style="flex:1;min-width:140px;"><div style="color:#fff;font-weight:700;font-size:11.5px;">${escapeHtml(f.name || '')}</div><div style="color:#dcddde;font-size:11px;">${escapeHtml(f.value || '')}</div></div>`).join('')}</div>` : ''}
            ${value.imageUrl ? `<img src="${escapeAttr(value.imageUrl)}" style="max-width:100%;border-radius:5px;margin-top:10px;">` : ''}
            ${value.footer.text ? `<div style="color:#72767d;font-size:11px;margin-top:8px;display:flex;align-items:center;gap:6px;">${value.footer.iconUrl ? `<img src="${escapeAttr(value.footer.iconUrl)}" style="width:16px;height:16px;border-radius:50%;">` : ''}${escapeHtml(value.footer.text)}</div>` : ''}
            ${value.buttons && value.buttons.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">${value.buttons.map(b => `<div style="background:#4f545c;color:#fff;padding:7px 14px;border-radius:5px;font-size:12px;font-weight:600;">${escapeHtml(b.label || 'Botão')}</div>`).join('')}</div>` : ''}
          </div>
        </div>
      </div>
    `;
    wireEvents();
  }

  function wireEvents() {
    root.querySelector('.eb-color')?.addEventListener('input', e => { value.color = e.target.value; root.querySelector('.eb-color-hex').value = e.target.value; root.querySelector('.eb-left').style.borderLeftColor = e.target.value; renderPreview(); emit(); });
    root.querySelector('.eb-color-hex')?.addEventListener('input', e => { value.color = e.target.value; root.querySelector('.eb-color').value = e.target.value; renderPreview(); emit(); });
    root.querySelector('.eb-author-name')?.addEventListener('input', e => { value.author.name = e.target.value; emit(); });
    root.querySelector('.eb-author-icon')?.addEventListener('input', e => { value.author.iconUrl = e.target.value; emit(); });
    root.querySelector('.eb-title')?.addEventListener('input', e => { value.title = e.target.value; emit(); });
    root.querySelector('.eb-desc')?.addEventListener('input', e => { value.description = e.target.value; emit(); });
    root.querySelector('.eb-image')?.addEventListener('input', e => { value.imageUrl = e.target.value; emit(); });
    root.querySelector('.eb-footer-text')?.addEventListener('input', e => { value.footer.text = e.target.value; emit(); });
    root.querySelector('.eb-add-field')?.addEventListener('click', e => { e.preventDefault(); value.fields = value.fields || []; value.fields.push({ name: '', value: '' }); render(); emit(); });
    root.querySelectorAll('.eb-field-name').forEach(el => el.addEventListener('input', e => { value.fields[+e.target.dataset.i].name = e.target.value; emit(); }));
    root.querySelectorAll('.eb-field-value').forEach(el => el.addEventListener('input', e => { value.fields[+e.target.dataset.i].value = e.target.value; emit(); }));
    root.querySelectorAll('.eb-field-rm').forEach(el => el.addEventListener('click', e => { value.fields.splice(+e.target.dataset.i, 1); render(); emit(); }));
    root.querySelector('.eb-add-btn')?.addEventListener('click', e => { e.preventDefault(); value.buttons = value.buttons || []; if (value.buttons.length < 4) { value.buttons.push({ label: '', url: '' }); render(); emit(); } });
    root.querySelectorAll('.eb-btn-label').forEach(el => el.addEventListener('input', e => { value.buttons[+e.target.dataset.i].label = e.target.value; emit(); }));
    root.querySelectorAll('.eb-btn-url').forEach(el => el.addEventListener('input', e => { value.buttons[+e.target.dataset.i].url = e.target.value; emit(); }));
    root.querySelectorAll('.eb-btn-rm').forEach(el => el.addEventListener('click', e => { value.buttons.splice(+e.target.dataset.i, 1); render(); emit(); }));
  }

  function renderPreview() {
    const prev = root.querySelector('.eb-preview');
    if (!prev) return;
    prev.style.borderLeftColor = value.color;
  }

  render();
  return { getValue, setValue };
}

// ============ MENSAGEM AUTOMATICA — Modal (usa Embed Builder) ============
let __amCurrent = null;     // { id?, ... } sendo editado
let __amBuilder = null;     // referencia do builder mountado

function openAutoMessageModal(initial) {
  __amCurrent = Object.assign({
    id: null,
    channel_id: '',
    content: '',
    mode: 'embed',
    interval_minutes: 60,
    embed: { color: '#5865F2', author: { name: '', iconUrl: '' }, title: '', description: '', fields: [], imageUrl: '', footer: { text: '', iconUrl: '' }, buttons: [] }
  }, initial || {});

  document.getElementById('modal-am-title').textContent = __amCurrent.id
    ? 'Editar Mensagem Automática'
    : 'Adicionar Mensagem Automática';

  const body = document.getElementById('modal-am-body');
  body.innerHTML = `
    <div style="font-size:13px;color:#888;margin-bottom:14px;">Configure os detalhes da mensagem que será enviada automaticamente.</div>

    <div style="margin-bottom:12px;">
      <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Canal</label>
      <input id="am-channel" type="text" value="${escapeAttr(__amCurrent.channel_id || '')}" placeholder="ID do canal de texto" class="inp" style="margin-top:5px;font-family:'IBM Plex Mono',monospace;">
    </div>

    <div style="margin-bottom:12px;">
      <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Conteúdo <span style="text-transform:none;color:#666;">(texto acima da embed)</span></label>
      <textarea id="am-content" rows="2" placeholder="Digite o conteúdo da mensagem..." class="inp" style="margin-top:5px;">${escapeHtml(__amCurrent.content || '')}</textarea>
    </div>

    <div style="margin-bottom:14px;">
      <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Modo de Envio</label>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:5px;">
        ${[
          { v: 'embed', l: 'Embed (Padrão)' },
          { v: 'components_v2', l: 'Components V2' },
          { v: 'legacy', l: 'Legacy (Texto)' }
        ].map(o => `
          <button class="am-mode-btn" data-mode="${o.v}" onclick="amSetMode('${o.v}')" style="background:${__amCurrent.mode === o.v ? 'linear-gradient(90deg,#8b6fff,#7758ff)' : '#0e0e0e'};border:1px solid ${__amCurrent.mode === o.v ? 'transparent' : 'var(--border)'};color:${__amCurrent.mode === o.v ? '#fff' : '#888'};padding:9px;border-radius:7px;cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:600;">${o.l}</button>
        `).join('')}
      </div>
    </div>

    <div style="margin-bottom:14px;">
      <label style="font-size:10.5px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;">Intervalo (minutos)</label>
      <input id="am-interval" type="number" min="1" value="${__amCurrent.interval_minutes || 60}" class="inp" style="margin-top:5px;">
    </div>

    <div id="am-builder-wrap" style="margin-bottom:14px;"></div>

    <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:14px;border-top:1px solid var(--border);position:sticky;bottom:-22px;background:#0e0e0e;margin:0 -22px -22px;padding:14px 22px;">
      <button onclick="closeModal('modal-auto-msg')" class="kyc-btn secondary">Cancelar</button>
      <button onclick="saveAutoMessage()" class="kyc-btn primary">Salvar</button>
    </div>
  `;

  amRenderBuilder();
  document.getElementById('modal-auto-msg').classList.add('open');
}

function amSetMode(mode) {
  __amCurrent.mode = mode;
  document.querySelectorAll('.am-mode-btn').forEach(b => {
    const on = b.dataset.mode === mode;
    b.style.background = on ? 'linear-gradient(90deg,#8b6fff,#7758ff)' : '#0e0e0e';
    b.style.borderColor = on ? 'transparent' : 'var(--border)';
    b.style.color = on ? '#fff' : '#888';
  });
  amRenderBuilder();
}

function amRenderBuilder() {
  const wrap = document.getElementById('am-builder-wrap');
  if (!wrap) return;
  if (__amCurrent.mode === 'legacy') {
    wrap.innerHTML = '<div style="background:#0a0a0a;border:1px solid var(--border);border-radius:8px;padding:18px;color:#888;font-size:12.5px;text-align:center;">Modo Legacy: somente o texto do campo "Conteúdo" será enviado.</div>';
    __amBuilder = null;
    return;
  }
  wrap.innerHTML = '';
  __amBuilder = mountEmbedBuilder({
    container: wrap,
    value: __amCurrent.embed,
    showAuthor: true, showImage: true, showFooter: true, showFields: true,
    showButtons: __amCurrent.mode === 'components_v2',
    onChange: v => { __amCurrent.embed = v; }
  });
}

async function saveAutoMessage() {
  if (!__amCurrent) return;
  const channel = document.getElementById('am-channel').value.trim();
  if (!channel) return toast('Canal obrigatório', 'err');
  const body = {
    channel_id: channel,
    content: document.getElementById('am-content').value || null,
    mode: __amCurrent.mode,
    interval_minutes: parseInt(document.getElementById('am-interval').value) || 60,
    embed: __amBuilder ? __amBuilder.getValue() : __amCurrent.embed
  };
  try {
    const url = __amCurrent.id ? '/api/auto-messages/' + __amCurrent.id : '/api/auto-messages';
    const method = __amCurrent.id ? 'PUT' : 'POST';
    const r = await fetch(url, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Falha', 'err');
    toast(__amCurrent.id ? 'Atualizada' : 'Criada');
    closeModal('modal-auto-msg');
    if (typeof loadAutoMessages === 'function') loadAutoMessages();
  } catch (e) { toast(e.message, 'err'); }
}

// ============ PAGE ACOES AUTOMATICAS — 5 sub-tabs ============
let __aaTab = 'mensagens';
let __autoMessagesList = [];
let __autoReactions = null;
let __autoRepost = null;
let __autoCleanup = null;
let __autoSuggestions = null;

function switchAaTab(tab) {
  __aaTab = tab;
  document.querySelectorAll('.aa-tab').forEach(b => {
    const on = b.dataset.aaTab === tab;
    b.style.color = on ? '#fff' : '#666';
    b.style.borderBottomColor = on ? 'var(--primary)' : 'transparent';
  });
  renderAaTab();
}

async function renderAaTab() {
  const body = document.getElementById('aa-body');
  if (!body) return;
  body.innerHTML = '<div style="color:#666;padding:30px;text-align:center;">carregando...</div>';
  try {
    if (__aaTab === 'mensagens') return renderAaMensagens();
    if (__aaTab === 'reacoes') return renderAaReacoes();
    if (__aaTab === 'repostagem') return renderAaRepostagem();
    if (__aaTab === 'limpeza') return renderAaLimpeza();
    if (__aaTab === 'sugestoes') return renderAaSugestoes();
  } catch (e) { body.innerHTML = '<div style="color:#ff6b6b;padding:20px;">' + escapeHtml(e.message) + '</div>'; }
}

// --- MENSAGENS AUTOMATICAS ---
async function loadAutoMessages() {
  const q = document.getElementById('am-search')?.value || '';
  __autoMessagesList = await fetch('/api/auto-messages?q=' + encodeURIComponent(q), { credentials: 'same-origin' }).then(r => r.json());
  renderAaMensagensList();
}

async function renderAaMensagens() {
  const body = document.getElementById('aa-body');
  __autoMessagesList = await fetch('/api/auto-messages', { credentials: 'same-origin' }).then(r => r.json());
  body.innerHTML = `
    <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="am-master-enabled" checked style="accent-color:#22c55e;">
          <span style="font-size:13px;color:#fff;font-weight:600;">Ativar mensagens automáticas</span>
        </label>
        <button onclick="openAutoMessageModal()" style="background:linear-gradient(90deg,#8b6fff,#7758ff);color:#fff;border:0;padding:8px 14px;border-radius:7px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Adicionar Mensagem
        </button>
      </div>
      <div style="font-size:10.5px;text-transform:uppercase;color:#666;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;margin-bottom:8px;">Mensagens configuradas</div>
      <input id="am-search" placeholder="Pesquisar por canal..." class="inp" oninput="loadAutoMessages()" style="margin-bottom:12px;">
      <div id="am-list"></div>
    </div>
  `;
  renderAaMensagensList();
}

function renderAaMensagensList() {
  const wrap = document.getElementById('am-list');
  if (!wrap) return;
  if (!__autoMessagesList.length) {
    wrap.innerHTML = `<div style="text-align:center;color:#666;padding:30px;background:#0e0e0e;border:1px solid var(--border);border-radius:8px;">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:8px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <div style="font-size:12.5px;">Nenhuma mensagem configurada</div>
    </div>`;
    return;
  }
  wrap.innerHTML = __autoMessagesList.map(m => `
    <div style="background:#0e0e0e;border:1px solid var(--border);border-radius:8px;padding:11px 14px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;color:#fff;font-size:12.5px;display:flex;align-items:center;gap:8px;">
          <span style="font-family:'IBM Plex Mono',monospace;">#${escapeHtml(m.channel_id)}</span>
          <span style="font-size:9.5px;padding:2px 7px;border-radius:8px;background:#1a1a1a;color:#aaa;text-transform:uppercase;letter-spacing:.04em;">${m.mode}</span>
          <span style="font-size:10.5px;color:#666;">${m.interval_minutes} min</span>
        </div>
        ${m.embed?.title ? `<div style="font-size:11.5px;color:#aaa;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.embed.title)}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button onclick='openAutoMessageModal(${JSON.stringify(m).replace(/'/g,"\\'")})' style="background:#1a1a1a;border:1px solid var(--border);color:#aaa;padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">Editar</button>
        <button onclick="deleteAutoMessage(${m.id})" style="background:transparent;border:1px solid rgba(255,107,107,.3);color:#ff8a8a;padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">×</button>
      </div>
    </div>
  `).join('');
}

async function deleteAutoMessage(id) {
  if (!confirm('Remover esta mensagem automática?')) return;
  try {
    await fetch('/api/auto-messages/' + id, { method: 'DELETE', credentials: 'same-origin' });
    toast('Removida');
    loadAutoMessages();
  } catch (e) { toast(e.message, 'err'); }
}

// --- REACOES ---
async function renderAaReacoes() {
  const body = document.getElementById('aa-body');
  __autoReactions = await fetch('/api/auto-actions/reactions', { credentials: 'same-origin' }).then(r => r.json());
  body.innerHTML = `
    <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="ar-enabled" ${__autoReactions.enabled ? 'checked' : ''} onchange="saveArEnabled(this.checked)" style="accent-color:#22c55e;">
          <span style="font-size:13px;color:#fff;font-weight:600;">Ativar reações automáticas</span>
        </label>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:12.5px;color:#fff;font-weight:600;">Canais com Reações</div>
        <button onclick="addAutoReaction()" style="background:linear-gradient(90deg,#8b6fff,#7758ff);color:#fff;border:0;padding:7px 12px;border-radius:7px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;">Adicionar Canal</button>
      </div>
      ${(__autoReactions.items || []).map(r => `
        <div style="background:#0e0e0e;border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-weight:600;color:#fff;font-size:12px;">Canal #${escapeHtml(r.channel_id)}</div>
            <button onclick="deleteAutoReaction(${r.id})" style="background:transparent;border:0;color:#ff8a8a;cursor:pointer;font-size:14px;">×</button>
          </div>
          <div style="margin-bottom:6px;">
            <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Canal (ID)</label>
            <input type="text" value="${escapeAttr(r.channel_id)}" data-ar-channel="${r.id}" placeholder="Selecione um canal" class="inp" style="margin-top:4px;">
          </div>
          <div>
            <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Reações (emojis, separados por vírgula)</label>
            <input type="text" value="${escapeAttr((r.emojis || []).join(', '))}" data-ar-emojis="${r.id}" placeholder="👍, ❤️, 🔥" class="inp" style="margin-top:4px;">
          </div>
          <button onclick="saveAutoReaction(${r.id})" style="margin-top:8px;background:#fff;color:#000;border:0;padding:7px 14px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700;">Salvar</button>
        </div>
      `).join('') || '<div style="text-align:center;color:#666;padding:24px;font-size:12px;">Nenhum canal configurado</div>'}
    </div>
  `;
}

async function saveArEnabled(on) {
  await fetch('/api/auto-actions/reactions/_enabled', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: on }) });
  toast(on ? 'Ativado' : 'Desativado');
}

async function addAutoReaction() {
  const ch = prompt('ID do canal:');
  if (!ch) return;
  await fetch('/api/auto-actions/reactions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id: ch, emojis: [] }) });
  renderAaReacoes();
}

async function saveAutoReaction(id) {
  const ch = document.querySelector(`[data-ar-channel="${id}"]`)?.value || '';
  const ems = (document.querySelector(`[data-ar-emojis="${id}"]`)?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  await fetch('/api/auto-actions/reactions/' + id, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id: ch, emojis: ems }) });
  toast('Salvo');
}

async function deleteAutoReaction(id) {
  if (!confirm('Remover?')) return;
  await fetch('/api/auto-actions/reactions/' + id, { method: 'DELETE', credentials: 'same-origin' });
  renderAaReacoes();
}

// --- REPOSTAGEM ---
async function renderAaRepostagem() {
  const body = document.getElementById('aa-body');
  __autoRepost = await fetch('/api/auto-actions/repost', { credentials: 'same-origin' }).then(r => r.json());
  body.innerHTML = `
    <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
        <input type="checkbox" id="rp-enabled" ${__autoRepost.enabled ? 'checked' : ''} style="accent-color:#22c55e;">
        <span style="font-size:13px;color:#fff;font-weight:600;">Ativar repostagem automática</span>
      </div>
      <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Horário da Repostagem</label>
      <input id="rp-time" type="time" value="${escapeAttr(__autoRepost.time || '12:00')}" class="inp" style="margin-top:5px;max-width:160px;">
      <div style="display:flex;justify-content:flex-end;margin-top:14px;">
        <button onclick="saveAutoRepost()" class="kyc-btn primary">Salvar</button>
      </div>
    </div>
  `;
}

async function saveAutoRepost() {
  await fetch('/api/auto-actions/repost', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    enabled: document.getElementById('rp-enabled').checked,
    time: document.getElementById('rp-time').value
  }) });
  toast('Salvo');
}

// --- LIMPEZA ---
async function renderAaLimpeza() {
  const body = document.getElementById('aa-body');
  __autoCleanup = await fetch('/api/auto-actions/cleanup', { credentials: 'same-origin' }).then(r => r.json());
  body.innerHTML = `
    <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="cl-enabled" ${__autoCleanup.enabled ? 'checked' : ''} onchange="saveClEnabled(this.checked)" style="accent-color:#22c55e;">
          <span style="font-size:13px;color:#fff;font-weight:600;">Ativar limpeza automática</span>
        </label>
        <button onclick="addAutoCleanup()" style="background:linear-gradient(90deg,#8b6fff,#7758ff);color:#fff;border:0;padding:7px 12px;border-radius:7px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;">Adicionar Canal</button>
      </div>
      ${(__autoCleanup.items || []).map(c => `
        <div style="background:#0e0e0e;border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-weight:600;color:#fff;font-size:12px;">Canal #${escapeHtml(c.channel_id)}</div>
            <button onclick="deleteAutoCleanup(${c.id})" style="background:transparent;border:0;color:#ff8a8a;cursor:pointer;font-size:14px;">×</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Canal (ID)</label>
              <input type="text" value="${escapeAttr(c.channel_id)}" data-cl-ch="${c.id}" class="inp" style="margin-top:4px;">
            </div>
            <div>
              <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Limpar mensagens ao trancar</label>
              <label style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer;">
                <input type="checkbox" data-cl-clear="${c.id}" ${c.clear_on_lock ? 'checked' : ''} style="accent-color:#22c55e;">
                <span style="font-size:12px;color:${c.clear_on_lock ? '#7dd3a4' : '#888'};">${c.clear_on_lock ? 'Sim' : 'Não'}</span>
              </label>
            </div>
            <div>
              <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Horário para Trancar</label>
              <input type="time" value="${escapeAttr(c.lock_time || '22:00')}" data-cl-lock="${c.id}" class="inp" style="margin-top:4px;">
            </div>
            <div>
              <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Horário para Destrancar</label>
              <input type="time" value="${escapeAttr(c.unlock_time || '08:00')}" data-cl-unlock="${c.id}" class="inp" style="margin-top:4px;">
            </div>
          </div>
          <button onclick="saveAutoCleanup(${c.id})" style="margin-top:10px;background:#fff;color:#000;border:0;padding:7px 14px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700;">Salvar</button>
        </div>
      `).join('') || '<div style="text-align:center;color:#666;padding:24px;font-size:12px;">Nenhum canal configurado</div>'}
    </div>
  `;
}

async function saveClEnabled(on) {
  await fetch('/api/auto-actions/cleanup/_enabled', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: on }) });
}

async function addAutoCleanup() {
  const ch = prompt('ID do canal:');
  if (!ch) return;
  await fetch('/api/auto-actions/cleanup', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id: ch }) });
  renderAaLimpeza();
}

async function saveAutoCleanup(id) {
  await fetch('/api/auto-actions/cleanup/' + id, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    channel_id: document.querySelector(`[data-cl-ch="${id}"]`)?.value || '',
    clear_on_lock: document.querySelector(`[data-cl-clear="${id}"]`)?.checked || false,
    lock_time: document.querySelector(`[data-cl-lock="${id}"]`)?.value || '22:00',
    unlock_time: document.querySelector(`[data-cl-unlock="${id}"]`)?.value || '08:00'
  }) });
  toast('Salvo');
}

async function deleteAutoCleanup(id) {
  if (!confirm('Remover?')) return;
  await fetch('/api/auto-actions/cleanup/' + id, { method: 'DELETE', credentials: 'same-origin' });
  renderAaLimpeza();
}

// --- SUGESTOES (usa Embed Builder) ---
let __sugBuilder = null;
async function renderAaSugestoes() {
  const body = document.getElementById('aa-body');
  __autoSuggestions = await fetch('/api/auto-actions/suggestions', { credentials: 'same-origin' }).then(r => r.json());
  body.innerHTML = `
    <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:14px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <div>
          <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Canal de Sugestões <span style="text-transform:none;color:#666;">(onde serão postadas)</span></label>
          <input id="sug-channel" type="text" value="${escapeAttr(__autoSuggestions.channel_id || '')}" placeholder="Selecione um canal" class="inp" style="margin-top:5px;">
        </div>
        <div style="display:flex;gap:6px;align-items:flex-end;">
          <div style="flex:1;">
            <label style="font-size:10.5px;color:#888;font-family:'IBM Plex Mono',monospace;">Canal para enviar o painel</label>
            <input id="sug-post-channel" type="text" value="${escapeAttr(__autoSuggestions.post_channel_id || '')}" placeholder="Selecione um canal" class="inp" style="margin-top:5px;">
          </div>
          <button onclick="postSugPanel()" style="background:linear-gradient(90deg,#8b6fff,#7758ff);color:#fff;border:0;padding:9px 14px;border-radius:7px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;">Enviar</button>
        </div>
      </div>
      <div style="font-size:10.5px;text-transform:uppercase;color:#666;letter-spacing:.06em;font-family:'IBM Plex Mono',monospace;margin-bottom:8px;">Configuração do Painel</div>
      <div id="sug-builder-wrap"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px;">
        <button onclick="saveSugPanel()" class="kyc-btn primary">Salvar Painel</button>
      </div>
    </div>
  `;
  __sugBuilder = mountEmbedBuilder({
    container: document.getElementById('sug-builder-wrap'),
    value: __autoSuggestions.embed || { color: '#5865F2', title: 'Central de Sugestoes', description: 'Clique no botão abaixo para enviar sua sugestão!' },
    botName: "Bot"
  });
}

async function saveSugPanel() {
  await fetch('/api/auto-actions/suggestions', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    channel_id: document.getElementById('sug-channel').value,
    post_channel_id: document.getElementById('sug-post-channel').value,
    embed: __sugBuilder ? __sugBuilder.getValue() : null
  }) });
  toast('Painel salvo');
}

async function postSugPanel() {
  await saveSugPanel();
  toast('Em breve: envio direto via bot');
}

// Hook
const __origSpAa = window.sp;
if (typeof __origSpAa === 'function' && !window.__spHookedAa) {
  window.__spHookedAa = true;
  window.sp = function (page, el) {
    __origSpAa(page, el);
    if (page === 'acoes-automaticas') { __aaTab = 'mensagens'; renderAaTab(); }
  };
}
