/* ═══════════════════════════════════════════════════════════════
   CobraSetor — ajustes.js
   Configurações por proprietário (Pix, empresa, mensagens) ·
   Botões de WhatsApp na cobrança · Backup (admin)
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// MENSAGENS PADRÃO (variáveis: {nome} {valor} {vencimento} {chavepix} {empresa})
// ─────────────────────────────────────────────
const MSG_PADRAO_HOJE =
  'Olá, {nome}! Tudo bem? 😊\n'
  + 'Passando para lembrar que a mensalidade da {empresa}, no valor de {valor}, vence hoje ({vencimento}).\n'
  + 'Você pode pagar pelo Pix: {chavepix}\n'
  + 'Se já pagou, por favor desconsidere. Obrigado!';

const MSG_PADRAO_ATRASO =
  'Olá, {nome}! Tudo bem?\n'
  + 'Consta em aberto a mensalidade da {empresa}, no valor de {valor}, em atraso desde {vencimento}.\n'
  + 'Para regularizar é só pagar pelo Pix: {chavepix}\n'
  + 'Se já pagou, por favor desconsidere esta mensagem. Obrigado!';

// ─────────────────────────────────────────────
// CONFIGURAÇÃO POR PROPRIETÁRIO
// Fonte de verdade: servidor (aba CONFIG_PROPRIETARIOS via Apps Script).
// Cópia no localStorage só como fallback offline / antes do deploy.
// Valor inicial: o que já existe na identidade do recibo (RECIBO_IDENTIDADES)
// e no cadastro do proprietário — sem um segundo cadastro diferente.
// ─────────────────────────────────────────────
let CFG_PROP = {};              // usuario → config vinda do servidor
let CFG_ORIGEM = {};            // usuario → 'servidor' | 'local'
const CFG_LS = 'cobr_cfg_prop';

function _cfgLocal() {
  try { return JSON.parse(localStorage.getItem(CFG_LS) || '{}'); } catch (_) { return {}; }
}
function _cfgSalvarLocal(usuario, dados) {
  const all = _cfgLocal();
  all[usuario] = dados;
  localStorage.setItem(CFG_LS, JSON.stringify(all));
}

function _usuarioProp(usuario) {
  return (typeof USUARIOS !== 'undefined' && USUARIOS.find(u => u.usuario === usuario))
      || USUARIOS_PADRAO.find(u => u.usuario === usuario) || null;
}

function cfgPadraoProp(usuario) {
  const dono  = _usuarioProp(usuario) || {};
  const ident = (typeof RECIBO_IDENTIDADES !== 'undefined' && RECIBO_IDENTIDADES[usuario]) || {};
  return {
    chavePix:  ident.pix || dono.chavePix || '',
    titular:   ident.titular || '',
    empresa:   ident.empresa || dono.nome || '',
    msgHoje:   MSG_PADRAO_HOJE,
    msgAtraso: MSG_PADRAO_ATRASO,
  };
}

/** Config efetiva: padrão ← cópia local ← servidor */
function cfgDoProp(usuario) {
  const loc = _cfgLocal()[usuario] || {};
  const srv = CFG_PROP[usuario] || {};
  const out = { ...cfgPadraoProp(usuario) };
  [loc, srv].forEach(o => Object.keys(o).forEach(k => { if (o[k] !== undefined && o[k] !== null) out[k] = o[k]; }));
  return out;
}

function cfgDoSetor(setor) {
  const dono = typeof _donoDoSetor === 'function' ? _donoDoSetor(setor) : null;
  return dono ? cfgDoProp(dono.usuario) : { ...cfgPadraoProp(''), empresa: '' };
}

/** Donos cujas configs este login precisa (cobrança + tela de Configurações) */
function _donosRelevantes() {
  if (!USER) return [];
  if (USER.role === 'proprietario') return [USER.usuario];
  if (USER.role === 'cobrador') return USER.proprietario ? [USER.proprietario] : [];
  return USUARIOS.filter(u => u.role === 'proprietario').map(u => u.usuario);
}

async function _getServidor(acao, dados) {
  return _tentarSheetReq(SCRIPT_URL, acao, dados);
}

/** POST direto (sem o fallback offline do sheetPost, que responde ok:true mesmo sem rede) */
async function _postServidor(acao, dados) {
  const r = await fetchComTimeout(SCRIPT_URL, {
    method: 'POST', cache: 'no-store', body: JSON.stringify({ acao, ...dados }),
  }, 15000);
  return r.json();
}

async function carregarConfigsProp() {
  const donos = _donosRelevantes();
  await Promise.all(donos.map(async u => {
    try {
      const r = await _getServidor('getConfigProp', { usuario: u });
      if (r && r.ok) {
        CFG_ORIGEM[u] = 'servidor';
        if (r.data) { CFG_PROP[u] = r.data; _cfgSalvarLocal(u, r.data); }
      }
    } catch (_) { /* offline: fica a cópia local */ }
  }));
  if (typeof renderCob === 'function') renderCob();
}

// ─────────────────────────────────────────────
// WHATSAPP
// ─────────────────────────────────────────────
/**
 * Normaliza telefone brasileiro para o wa.me: só dígitos, com 55 na frente.
 * Celular antigo sem o 9 (DDD + 8 dígitos começando com 6-9) ganha o 9.
 * Retorna '' se não der um número válido.
 */
function telWhatsApp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  d = d.replace(/^0+/, '');                       // 0 de operadora/DDD (047...)
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);
  if (d.length !== 10 && d.length !== 11) return '';
  if (parseInt(d.slice(0, 2)) < 11) return '';   // DDD inválido
  return '55' + d;
}

function linkWhatsApp(tel, texto) {
  const n = telWhatsApp(tel);
  if (!n) return '';
  return 'https://wa.me/' + n + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

function _preencherMsg(modelo, vars) {
  return String(modelo || '').replace(/\{(nome|valor|vencimento|chavepix|empresa)\}/gi,
    (_, k) => vars[k.toLowerCase()] ?? '');
}

/**
 * Mensagem de cobrança do cliente. Escolhe sozinho a versão:
 * "vence hoje" se o 1º mês em aberto vence hoje; senão "em atraso".
 * Valor = total em aberto até hoje (mensalidade × meses).
 */
function mensagemCobranca(c, cfg) {
  cfg = cfg || cfgDoSetor(c.setor);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const meses = mesesEmAberto(c, hoje);
  const venc = meses.length ? meses[0].data : _dataVencimento(parseInt(c.proxVenc) || YM(hoje), c.vencDia);
  const versao = venc.getTime() === hoje.getTime() || venc > hoje ? 'hoje' : 'atraso';
  const total = (parseFloat(c.valor) || 0) * Math.max(1, meses.length);
  const texto = _preencherMsg(versao === 'hoje' ? cfg.msgHoje : cfg.msgAtraso, {
    nome: String(c.nome || '').trim(),
    valor: fR(total),
    vencimento: _fmtData(venc),
    chavepix: cfg.chavePix || '',
    empresa: cfg.empresa || '',
  });
  return { versao, texto };
}

/** HTML dos 2 botões verdes do card de cobrança */
function botoesWhatsApp(c) {
  const n = telWhatsApp(c.tel);
  if (!n) {
    return `<button class="btn bzap-off bsm" onclick="toast('📵 Cliente sem telefone válido — cadastre o número.','warn')" title="sem telefone">💬 WhatsApp</button>
      <button class="btn bzap-off bsm" onclick="toast('📵 Cliente sem telefone — cadastre o número para cobrar pelo WhatsApp.','warn')" title="sem telefone">💲 Cobrar Pix</button>
      <span class="zap-semtel">sem telefone</span>`;
  }
  const cfg = cfgDoSetor(c.setor);
  const zap = `<a class="btn bzap bsm" href="${linkWhatsApp(c.tel)}" target="_blank" rel="noopener">💬 WhatsApp</a>`;
  if (!cfg.chavePix) {
    return zap + `<button class="btn bzap bsm" onclick="toast('🔑 Cadastre sua chave Pix em Configurações.','warn')">💲 Cobrar Pix</button>`;
  }
  const { texto } = mensagemCobranca(c, cfg);
  return zap + `<a class="btn bzap bsm" href="${esc(linkWhatsApp(c.tel, texto))}" target="_blank" rel="noopener">💲 Cobrar Pix</a>`;
}

// ─────────────────────────────────────────────
// TELA DE CONFIGURAÇÕES
// ─────────────────────────────────────────────
let _ajUsuario = '';
let _ajUltimoCampo = 'aj-msg-hoje';

function renderAjustes() {
  const isAdmin = USER?.role === 'admin';
  const donos = _donosRelevantes();
  const sel = document.getElementById('aj-prop');
  const wrapSel = document.getElementById('aj-prop-wrap');
  if (wrapSel) wrapSel.style.display = isAdmin ? '' : 'none';
  if (!donos.length) return;
  if (!donos.includes(_ajUsuario)) _ajUsuario = donos[0];
  if (sel) {
    sel.innerHTML = donos.map(u => `<option value="${esc(u)}">${esc((_usuarioProp(u) || {}).nome || u)} (${esc(u)})</option>`).join('');
    sel.value = _ajUsuario;
  }
  const cfg = cfgDoProp(_ajUsuario);
  document.getElementById('aj-pix').value     = cfg.chavePix || '';
  document.getElementById('aj-empresa').value = cfg.empresa || '';
  document.getElementById('aj-msg-hoje').value   = cfg.msgHoje || MSG_PADRAO_HOJE;
  document.getElementById('aj-msg-atraso').value = cfg.msgAtraso || MSG_PADRAO_ATRASO;
  _ajStatus();
  ajPrevia();
  const bk = document.getElementById('aj-backup-card');
  if (bk) bk.style.display = isAdmin ? '' : 'none';
}

function ajTrocarProp(u) { _ajUsuario = u; renderAjustes(); }

function _ajStatus() {
  const el = document.getElementById('aj-status');
  if (!el) return;
  const srv = CFG_PROP[_ajUsuario];
  el.innerHTML = srv
    ? `☁️ Salvo no servidor${srv.atualizadoEm ? ' · ' + esc(fData(srv.atualizadoEm)) : ''}${srv.atualizadoPor ? ' por ' + esc(srv.atualizadoPor) : ''}`
    : (_cfgLocal()[_ajUsuario] ? '📱 Salvo só neste aparelho (servidor ainda sem esta configuração)' : '✏️ Usando os dados padrão do cadastro');
}

function _ajLerForm() {
  return {
    chavePix:  document.getElementById('aj-pix').value.trim(),
    empresa:   document.getElementById('aj-empresa').value.trim(),
    msgHoje:   document.getElementById('aj-msg-hoje').value.trim(),
    msgAtraso: document.getElementById('aj-msg-atraso').value.trim(),
  };
}

function ajPrevia() {
  const f = _ajLerForm();
  const cfg = { ...cfgDoProp(_ajUsuario), ...f };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ex = { nome: 'Maria Silva', valor: fR(50), vencimento: _fmtData(hoje), chavepix: cfg.chavePix || '(sem chave Pix)', empresa: cfg.empresa };
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 10);
  document.getElementById('aj-previa-hoje').textContent   = _preencherMsg(cfg.msgHoje, ex);
  document.getElementById('aj-previa-atraso').textContent = _preencherMsg(cfg.msgAtraso, { ...ex, vencimento: _fmtData(ontem) });
}

function ajInserirVar(campoId, v) {
  const t = document.getElementById(campoId);
  const ini = t.selectionStart ?? t.value.length, fim = t.selectionEnd ?? t.value.length;
  t.value = t.value.slice(0, ini) + v + t.value.slice(fim);
  t.focus(); t.selectionStart = t.selectionEnd = ini + v.length;
  ajPrevia();
}

function ajRestaurarPadrao() {
  const p = cfgPadraoProp(_ajUsuario);
  document.getElementById('aj-msg-hoje').value = p.msgHoje;
  document.getElementById('aj-msg-atraso').value = p.msgAtraso;
  ajPrevia();
  toast('↩️ Textos padrão restaurados — clique em Salvar para gravar.');
}

async function ajSalvar() {
  const dados = _ajLerForm();
  if (!dados.msgHoje || !dados.msgAtraso) { toast('⚠️ As duas mensagens são obrigatórias.', 'err'); return; }
  const btn = document.getElementById('aj-btn-salvar');
  btn.disabled = true; btn.textContent = '⏳ Salvando...';
  const payload = { ...dados, usuario: _ajUsuario, atualizadoPor: USER.usuario };
  _cfgSalvarLocal(_ajUsuario, { ...dados });
  try {
    const r = await _postServidor('salvarConfigProp', payload);
    if (r && r.ok) {
      CFG_PROP[_ajUsuario] = r.data || { ...dados, atualizadoEm: new Date().toISOString(), atualizadoPor: USER.usuario };
      CFG_ORIGEM[_ajUsuario] = 'servidor';
      toast('✅ Configurações salvas no servidor — valem no celular e no notebook.');
    } else {
      toast('⚠️ Salvo só neste aparelho: o servidor ainda não aceita esta configuração (' + ((r && r.erro) || 'erro') + ').', 'warn');
    }
  } catch (e) {
    toast('⚠️ Sem conexão — salvo só neste aparelho por enquanto.', 'warn');
  } finally {
    btn.disabled = false; btn.textContent = '💾 Salvar';
    _ajStatus();
    if (typeof renderCob === 'function') renderCob();
  }
}

// ─────────────────────────────────────────────
// BACKUP (somente admin)
// ─────────────────────────────────────────────
async function baixarBackupAgora() {
  if (USER?.role !== 'admin') { toast('🚫 Somente o administrador pode baixar o backup.', 'err'); return; }
  const btn = document.getElementById('aj-btn-backup');
  const info = document.getElementById('aj-backup-info');
  btn.disabled = true; btn.textContent = '⏳ Gerando backup...';
  info.textContent = 'Isso pode levar até 1 minuto.';
  try {
    const params = new URLSearchParams({ acao: 'gerarBackup' });
    const r = await fetchComTimeout(SCRIPT_URL + '?' + params, { method: 'GET', cache: 'no-store' }, 120000);
    const json = await r.json();
    if (!json.ok || !json.base64) throw new Error(json.erro || 'o servidor ainda não tem a função de backup');
    const bin = atob(json.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = json.nome || 'Backup CobraSetor.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    info.textContent = `✅ ${json.nome} · ${json.totalClientes} clientes · ${json.totalPagamentos} pagamentos (cópia também salva no Drive).`;
    toast('✅ Backup baixado!');
  } catch (e) {
    info.textContent = '❌ ' + e.message;
    toast('❌ Backup: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '🗄️ Baixar backup agora';
  }
}
