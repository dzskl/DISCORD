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
function closeModal() { document.getElementById('modal-bg').classList.remove('show'); }

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
      return `<tr><td>${formatTime(t.created_at)}</td>
        <td class="hi">${escapeHtml(t.discord_tag || t.discord_id)}</td>
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
