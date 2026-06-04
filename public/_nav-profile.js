// Shared topnav profile logic — usado por index/faq/tutoriais/legal pages.
// Quando o user esta logado, substitui o botao "Entrar" (.nav-cta, classe
// .btn ou #nav-auth-slot) por um avatar+dropdown.
(function () {
  function init() {
    fetch('/auth/me', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(me => {
        if (!me || !me.authenticated || !me.user) return;
        renderProfile(me.user);
      }).catch(() => {});
  }

  function renderProfile(u) {
    var slot = document.getElementById('nav-auth-slot');
    if (!slot) {
      var fallback = document.querySelector('.nav-cta');
      if (!fallback) return;
      slot = document.createElement('div');
      slot.id = 'nav-auth-slot';
      fallback.parentElement.replaceChild(slot, fallback);
    }

    var name = u.display_name || u.username || (u.email || '').split('@')[0] || 'Conta';
    var avatar = u.discord_avatar || '';
    var initial = (name || '?').charAt(0).toUpperCase();
    var avatarStyle = avatar
      ? "background:url('" + avatar + "') center/cover;"
      : "";

    slot.innerHTML = ''
      + '<div style="position:relative;">'
      + '  <button id="nav-profile-btn" type="button" style="background:transparent;border:1px solid var(--border-strong);border-radius:30px;padding:5px 14px 5px 5px;display:flex;align-items:center;gap:9px;cursor:pointer;color:#fff;font-family:inherit;">'
      + '    <span style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#8b6fff,#5865f2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;' + avatarStyle + '">' + (avatar ? '' : initial) + '</span>'
      + '    <span style="font-size:13px;font-weight:600;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(name) + '</span>'
      + '    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg>'
      + '  </button>'
      + '  <div id="nav-profile-menu" style="display:none;position:absolute;right:0;top:calc(100% + 6px);background:#0e0e0e;border:1px solid var(--border-strong);border-radius:12px;min-width:240px;box-shadow:0 14px 40px rgba(0,0,0,.6);overflow:hidden;z-index:50;">'
      + '    <div style="padding:12px 16px;border-bottom:1px solid var(--border);">'
      + '      <div style="font-size:13px;color:#fff;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(name) + '</div>'
      + '      <div style="font-size:11px;color:#888;font-family:\'IBM Plex Mono\',monospace;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(u.email || '') + '</div>'
      + '    </div>'
      + '    <a href="/app.html" style="display:flex;align-items:center;gap:10px;padding:10px 16px;color:#aaa;text-decoration:none;font-size:12.5px;">'
      + '      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>'
      + '      Painel'
      + '    </a>'
      + '    <a href="/app.html#conta" style="display:flex;align-items:center;gap:10px;padding:10px 16px;color:#aaa;text-decoration:none;font-size:12.5px;">'
      + '      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>'
      + '      Minha Conta'
      + '    </a>'
      + '    <a href="/faq.html" style="display:flex;align-items:center;gap:10px;padding:10px 16px;color:#aaa;text-decoration:none;font-size:12.5px;">'
      + '      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
      + '      Suporte'
      + '    </a>'
      + '    <div style="border-top:1px solid var(--border);padding:5px 0;">'
      + '      <button id="nav-profile-logout" type="button" style="display:flex;align-items:center;gap:10px;padding:10px 16px;width:100%;background:transparent;border:0;color:#ff8a8a;font-size:12.5px;cursor:pointer;font-family:inherit;text-align:left;">'
      + '        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
      + '        Sair da conta'
      + '      </button>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    var btn = document.getElementById('nav-profile-btn');
    var menu = document.getElementById('nav-profile-menu');
    if (btn && menu) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        menu.style.display = (menu.style.display === 'none' || !menu.style.display) ? 'block' : 'none';
      });
      document.addEventListener('click', function () { menu.style.display = 'none'; });
    }
    var logout = document.getElementById('nav-profile-logout');
    if (logout) {
      logout.addEventListener('click', function () {
        fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
          .then(function () { location.reload(); });
      });
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
