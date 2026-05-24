/* ═══════════════════════════════════════════════════════════════
   CobraSetor v1 — auth.js
   Login · Permissões · Sessão · Logo · Sidebar
═══════════════════════════════════════════════════════════════ */

'use strict';


// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
function entrar() {
  const usr = (document.getElementById('l-user').value || '').trim().toLowerCase();
  const pwd = (document.getElementById('l-pass').value || '').trim().toLowerCase();
  const err = document.getElementById('l-err');

  if (!usr || !pwd) { err.textContent = '⚠️ Preencha usuário e senha.'; return; }

  USUARIOS = carregarUsuarios();

  // Busca usuário pelo nome (sem diferenciar maiúsculas)
  const uByName = USUARIOS.find(x => x.usuario.toLowerCase() === usr);
  if (!uByName) {
    err.textContent = '❌ Usuário não encontrado.';
    return;
  }
  // Verifica senha (compatível com vigia legado)
  const u = (uByName.senha === pwd) ? uByName : null;
  if (!u) { err.textContent = '❌ Senha incorreta.'; return; }

  // Verifica bloqueio direto
  if (u.bloqueado) {
    err.textContent = '🚫 Acesso bloqueado. Entre em contato com o administrador.';
    return;
  }

  // Cobrador: verifica se proprietário está bloqueado
  if (u.role === 'cobrador' && u.proprietario) {
    const prop = USUARIOS.find(x => x.usuario === u.proprietario);
    if (prop && prop.bloqueado) {
      err.textContent = '🚫 Acesso bloqueado. Entre em contato com seu responsável.';
      return;
    }
  }
  // compatibilidade legado: role=vigia → cobrador, role=dono → proprietario
  if (u.role === 'vigia') u.role = 'cobrador';
  if (u.role === 'dono')  u.role = 'proprietario';

  USER = u;
  sessionStorage.setItem('cobr_user', JSON.stringify(USER));
  err.textContent = '';

  iniciarApp();
}

// ─────────────────────────────────────────────
// INICIAR APP APÓS LOGIN
// ─────────────────────────────────────────────
function iniciarApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display     = '';

  // Garante que todas as seções começam sem active (reset seguro entre logins)
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));

  aplicarPermissoes();
  carregarLogo();

  if (USER.role === 'admin') {
    // Admin vai direto para proprietários
    document.getElementById('sec-proprietarios').classList.add('active');
    document.getElementById('ni-proprietarios').classList.add('active');
    renderProprietarios();
    return;
  }

  // Proprietário e Cobrador começam sempre no Dashboard
  document.getElementById('sec-dashboard').classList.add('active');
  document.getElementById('ni-dashboard').classList.add('active');

  syncAll();
}

// ─────────────────────────────────────────────
// SAIR
// ─────────────────────────────────────────────
function sair() {
  sessionStorage.removeItem('cobr_user');
  sessionStorage.removeItem('eps_user');
  USER = null; CLI = []; PAG = []; DESP = [];
  bloqSync = false;

  // Reseta seções e nav para estado padrão
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-dashboard')?.classList.add('active');

  document.getElementById('main-app').style.display    = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('l-pass').value = '';
  document.getElementById('l-err').textContent = '';

  // Restaura logo padrão e status
  document.getElementById('logo-prop-img').style.display = 'none';
  document.getElementById('logo-text').style.display     = '';
  setSyncStatus('ok', 'Sincronizado');
}

// ─────────────────────────────────────────────
// LOGO DO PROPRIETÁRIO NA SIDEBAR
// ─────────────────────────────────────────────
function carregarLogo() {
  const logoImg  = document.getElementById('logo-prop-img');
  const logoText = document.getElementById('logo-text');
  const logoSub  = document.getElementById('logo-sub-text');

  let logoUrl = '';
  if (USER.role === 'proprietario' && USER.logoUrl) {
    logoUrl = USER.logoUrl;
  } else if (USER.role === 'cobrador' && USER.proprietario) {
    const prop = USUARIOS.find(u => u.usuario === USER.proprietario);
    if (prop && prop.logoUrl) logoUrl = prop.logoUrl;
  }

  if (logoUrl) {
    logoImg.src           = logoUrl;
    logoImg.style.display = 'block';
    logoText.style.display = 'none';
    logoSub.textContent   = USER.role === 'cobrador' ? 'Cobrador' : 'Proprietário';
  } else {
    logoImg.style.display  = 'none';
    logoText.style.display = '';
    logoSub.textContent    = 'Gestão de Cobranças';
  }
}

// ─────────────────────────────────────────────
// PERMISSÕES POR ROLE
// ─────────────────────────────────────────────
function aplicarPermissoes() {
  const isAdmin = USER.role === 'admin';
  const isProp  = USER.role === 'proprietario';
  const isCobr  = USER.role === 'cobrador';

  // Badge de role na sidebar
  const rb = document.getElementById('user-role-badge');
  const nb = document.getElementById('user-name-sb');
  if (rb) {
    if (isAdmin) { rb.textContent = '🔑 Admin';        rb.className = 'user-role role-admin'; }
    if (isProp)  { rb.textContent = '👔 Proprietário'; rb.className = 'user-role role-prop'; }
    if (isCobr)  {
      const meus = Array.isArray(USER.setores) ? USER.setores.join(', ') : (USER.setor || '');
      rb.textContent = `👮 ${meus || 'Cobrador'}`;
      rb.className = 'user-role role-cobrador';
    }
  }
  if (nb) nb.textContent = USER.nome || USER.usuario;

  // Itens do menu — visibilidade
  const niDash   = document.getElementById('ni-dashboard');
  const niCli    = document.getElementById('ni-clientes');
  const niCob    = document.getElementById('ni-cobranca');
  const niDesp   = document.getElementById('ni-despesas');
  const niRel    = document.getElementById('ni-relatorio');
  const niCobrs  = document.getElementById('ni-cobradores');
  const niProps  = document.getElementById('ni-proprietarios');

  // Todos veem: dashboard, clientes, cobrança
  // Prop + admin: despesas, relatório, cobradores
  // Só admin: proprietários
  // Cobrador NÃO vê: despesas, relatório, cobradores, proprietários
  if (niDesp)  niDesp.style.display  = isCobr  ? 'none' : '';
  if (niRel)   niRel.style.display   = isCobr  ? 'none' : '';
  if (niCobrs) niCobrs.style.display = isAdmin  ? 'none' : (isProp ? '' : 'none');
  if (niProps) niProps.style.display = isAdmin  ? '' : 'none';

  // Botão + Novo Cliente: cobrador não pode cadastrar
  const btnN   = document.getElementById('btn-novo-cli');
  const mobN   = document.getElementById('mob-novo-cli');
  if (btnN) btnN.style.display = isCobr ? 'none' : '';
  if (mobN) mobN.style.display = isCobr ? 'none' : '';

  // Strip title
  const strip = document.getElementById('strip-title');
  if (strip) {
    if (isAdmin) strip.textContent = 'CobraSetor — Administração';
    if (isProp)  strip.textContent = `CobraSetor — ${USER.nome || 'Proprietário'}`;
    if (isCobr)  {
      const s = Array.isArray(USER.setores) ? USER.setores.join(', ') : (USER.setor || '');
      strip.textContent = `Cobrança — ${s}`;
    }
  }
}

// ─────────────────────────────────────────────
// RENDER DASHBOARD
// ─────────────────────────────────────────────
function renderDash() {
  const list = getClisFiltrados().filter(c => c.status !== 'inativo');
  const hoje = list.filter(c => st(c) === 'hoje');
  const atr  = list.filter(c => st(c) === 'atrasado');
  const rem  = list.filter(c => st(c) === 'remarcado');

  const el = id => document.getElementById(id);
  if (el('s-tot')) el('s-tot').textContent = list.length;
  if (el('s-hj'))  el('s-hj').textContent  = hoje.length;
  if (el('s-atr')) el('s-atr').textContent = atr.length;
  if (el('s-rem')) el('s-rem').textContent = rem.length;
  if (el('s-men')) el('s-men').textContent = 'R$' + list.reduce((s,c) => s + parseFloat(c.valor||0), 0).toFixed(0);

  const lbl = el('s-setor-lbl');
  if (lbl) {
    if (USER.role === 'cobrador') {
      const meus = Array.isArray(USER.setores) ? USER.setores.join(', ') : (USER.setor || '');
      lbl.textContent = meus;
    } else {
      lbl.textContent = 'ativos';
    }
  }

  // Resumo por setor: só prop e admin
  const cardSetor = document.getElementById('card-resumo-setor');
  if (cardSetor) cardSetor.style.display = USER.role === 'cobrador' ? 'none' : '';

  // Tabela recente
  const tb  = document.getElementById('tb-dash');
  if (!tb) return;
  const rec = sortClientes(list).slice(0, 8);
  if (!rec.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="eico">📋</div>Nenhum cliente.</div></td></tr>';
    return;
  }
  tb.innerHTML = rec.map(c => `<tr>
    <td><span class="cb">${c.id}</span></td>
    <td><strong>${c.nome}</strong></td>
    <td><span class="sb">${c.setor||'-'}</span></td>
    <td><span class="nvb">Dia ${c.vencDia}/${lbM(c.proxVenc||YM(new Date()))}</span></td>
    <td>${fR(c.valor)}</td>
    <td>${stLbl(st(c))}</td>
  </tr>`).join('');
}

// ─────────────────────────────────────────────
// RESUMO POR SETOR (Dashboard)
// ─────────────────────────────────────────────
function renderResumoSetor() {
  const tb = document.getElementById('tb-setor');
  if (!tb || USER?.role === 'cobrador') return;

  const q    = (document.getElementById('srch-setor')?.value || '').toLowerCase();
  const list = getClisFiltrados().filter(c => c.status !== 'inativo');

  const mapa = {};
  list.forEach(c => {
    const s = c.setor || 'Sem Setor';
    if (!mapa[s]) mapa[s] = [];
    mapa[s].push(c);
  });

  const keys = Object.keys(mapa).sort().filter(s => s.toLowerCase().includes(q));

  if (!keys.length) {
    tb.innerHTML = '<tr><td colspan="8"><div class="empty">Nenhum setor.</div></td></tr>';
    return;
  }

  let totalCli = 0, totalRec = 0, totalCobrar = 0;

  const rows = keys.map(s => {
    const clis   = mapa[s];
    const total  = clis.length;
    const rec    = clis.reduce((a,c) => a + parseFloat(c.valor||0), 0);
    const hoje   = clis.filter(c => st(c) === 'hoje').length;
    const atras  = clis.filter(c => st(c) === 'atrasado').length;
    const emdia  = clis.filter(c => ['ok','adiantado'].includes(st(c))).length;
    const cobrar = clis.filter(c => ['hoje','atrasado'].includes(st(c))).reduce((a,c) => a + parseFloat(c.valor||0), 0);
    totalCli += total; totalRec += rec; totalCobrar += cobrar;
    return `<tr>
      <td><span class="sb">${s}</span></td>
      <td style="text-align:center;font-weight:700;color:var(--accent);">${total}</td>
      <td style="color:var(--accent3);font-weight:600;">${fR(rec)}</td>
      <td style="text-align:center;color:var(--success);">${emdia}</td>
      <td style="text-align:center;color:var(--warn);font-weight:${hoje?'700':'400'};">${hoje}</td>
      <td style="text-align:center;color:var(--danger);font-weight:${atras?'700':'400'};">${atras}</td>
      <td style="color:var(--accent2);font-weight:700;">${cobrar > 0 ? fR(cobrar) : '-'}</td>
      <td><button class="btn bp bxs" onclick="filtrarSetor('${s}')">Ver →</button></td>
    </tr>`;
  });

  rows.push(`<tr style="border-top:2px solid var(--border);background:rgba(255,107,0,.05);">
    <td style="font-weight:700;color:var(--accent);">TOTAL</td>
    <td style="text-align:center;font-weight:700;color:var(--accent);">${totalCli}</td>
    <td style="color:var(--accent3);font-weight:700;">${fR(totalRec)}</td>
    <td colspan="3"></td>
    <td style="color:var(--accent2);font-weight:700;">${fR(totalCobrar)}</td>
    <td></td>
  </tr>`);

  tb.innerHTML = rows.join('');
}

function filtrarSetor(setor) {
  cobTab = 'todos';
  document.querySelectorAll('#sec-cobranca .ftab').forEach(t => t.classList.remove('active'));
  document.getElementById('ctab-todos')?.classList.add('active');
  const fset = document.getElementById('fsetor');
  if (fset) fset.value = setor;
  goTo('cobranca', document.getElementById('ni-cobranca'));
}
