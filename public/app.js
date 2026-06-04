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
      const actions = g.ended ? '' : `<button class="btn-sm" onclick="encerrarSorteio(${g.id})">encerrar agora</button>`;
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
  wrap.innerHTML = Object.entries(__protMeta).map(([id, g]) => `
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
  const g = __protMeta[__protTab];
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
              <button onclick="toast('editar em breve','info')" style="background:#1a1a1a;border:1px solid var(--border);color:#aaa;border-radius:7px;padding:6px 10px;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Editar
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
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

// ============ PÁGINA CARTEIRA ============
async function loadCarteira() {
  try {
    const [bal, withdrawals] = await Promise.all([
      fetch('/api/wallet/balance', { credentials: 'same-origin' }).then(r => r.json()),
      fetch('/api/wallet/withdrawals', { credentials: 'same-origin' }).then(r => r.json())
    ]);

    const fmt = c => 'R$ ' + ((c || 0) / 100).toFixed(2).replace('.', ',');
    document.getElementById('wa-available').textContent = fmt(bal.available_cents);
    document.getElementById('wa-pending').textContent = fmt(bal.pending_cents);
    document.getElementById('wa-blocked').textContent = fmt(bal.blocked_cents);
    document.getElementById('wa-total').textContent = fmt(bal.earned_cents);

    document.getElementById('wa-w-count').textContent = withdrawals.length || 0;
    const tbody = document.getElementById('wa-w-tbody');
    tbody.innerHTML = withdrawals.length ? withdrawals.map(w => {
      const statusColor = { paid: '#22c55e', approved: '#3b82f6', pending: '#f5c542', rejected: '#ef4444' }[w.status] || '#888';
      const tlabel = w.withdraw_type === 'instant' ? '⚡ instantâneo' : 'normal';
      return `
        <tr>
          <td style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#aaa;">${new Date(w.requested_at * 1000).toLocaleString('pt-BR')}</td>
          <td style="font-size:11px;color:#aaa;">${tlabel}</td>
          <td>${fmt(w.amount_cents)}</td>
          <td style="color:#f5c542;font-size:11px;">${fmt(w.fee_cents)}</td>
          <td style="color:#7dd3a4;font-weight:700;">${fmt(w.net_cents)}</td>
          <td style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#888;">${escapeHtml((w.pix_key || '').slice(0, 18))}${(w.pix_key || '').length > 18 ? '…' : ''}</td>
          <td><span style="font-size:10px;padding:3px 8px;border-radius:10px;background:${statusColor}22;color:${statusColor};text-transform:uppercase;font-weight:600;">${w.status}</span></td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="7" style="color:#444;text-align:center;padding:30px;">nenhum saque ainda</td></tr>';
  } catch (e) { console.warn(e); }
}

const __origSp6 = window.sp;
if (typeof __origSp6 === 'function' && !window.__spHookedV6) {
  window.__spHookedV6 = true;
  window.sp = function (page, el) {
    __origSp6(page, el);
    if (page === 'carteira') loadCarteira();
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

const __origSp6 = window.sp;
if (typeof __origSp6 === 'function' && !window.__spHookedV6) {
  window.__spHookedV6 = true;
  window.sp = function (page, el) {
    __origSp6(page, el);
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
  wrap.innerHTML = list.map((m, i) => `
    <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:10px;padding:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:11px;color:#888;font-family:'IBM Plex Mono',monospace;">Canal: #${escapeHtml(m.channel || 'qualquer')}</div>
        <button onclick="removeBvMessage(${i})" style="background:transparent;border:0;color:#ff8a8a;cursor:pointer;font-size:14px;">×</button>
      </div>
      <input value="${escapeAttr(m.channel || '')}" oninput="__bvData['${__bvTab}'][${i}].channel=this.value" placeholder="nome do canal" class="inp" style="margin-bottom:6px;">
      <textarea oninput="__bvData['${__bvTab}'][${i}].message=this.value" placeholder="Mensagem com {user} {server} {count}" rows="2" class="inp">${escapeHtml(m.message || '')}</textarea>
    </div>
  `).join('');
}

function addBvMessage() {
  __bvData[__bvTab].push({ channel: '', message: '' });
  renderBvList();
  saveBvDebounced();
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
