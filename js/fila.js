/* ═══════════════════════════════════════════════════════════════
   CobraSetor — fila.js
   Forma de cobrança em lote (Vigilante ⇄ Pix) ·
   Fila de cobrança pelo WhatsApp (o app abre a conversa; quem envia é você)
═══════════════════════════════════════════════════════════════ */

'use strict';

const _chaveCli = c => String(c.id || '') + '|' + String(c.setor || '');

// ─────────────────────────────────────────────
// FORMA DE COBRANÇA EM LOTE
// ─────────────────────────────────────────────
let _loteSetor = '', _loteFiltro = '';

function abrirLoteForma(setor) {
  if (USER?.role === 'cobrador') { toast('⚠️ Cobrador não altera cadastro de clientes.', 'err'); return; }
  const setores = getMeusSetores();
  if (!setores.length) { toast('⚠️ Nenhum setor disponível.', 'warn'); return; }
  const sel = document.getElementById('lt-setor');
  sel.innerHTML = setores.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const atual = setor || _loteSetor || document.getElementById('fsetor')?.value || '';
  sel.value = setores.find(s => _normSetor(s) === _normSetor(atual)) || setores[0];
  _loteFiltro = '';
  document.querySelectorAll('#lotebg .ftab').forEach(t => t.classList.toggle('active', t.dataset.f === ''));
  loteRender();
  document.getElementById('lotebg').classList.add('open');
}

function fecharLoteForma() { document.getElementById('lotebg').classList.remove('open'); }

function loteFiltro(f, el) {
  _loteFiltro = f;
  document.querySelectorAll('#lotebg .ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  loteRender();
}

function _loteClientes() {
  _loteSetor = document.getElementById('lt-setor').value;
  if (!podeVerSetor(_loteSetor)) return [];
  const q = (document.getElementById('lt-busca').value || '').trim().toLowerCase();
  return sortClientes(getClisFiltrados().filter(c =>
    c.status !== 'inativo' && _normSetor(c.setor) === _normSetor(_loteSetor)
    && (!_loteFiltro || c.formaCobranca === _loteFiltro)
    && (!q || (c.nome + ' ' + c.id + ' ' + c.rua).toLowerCase().includes(q))));
}

function loteRender() {
  const lista = _loteClientes();
  const todos = getClisFiltrados().filter(c => c.status !== 'inativo' && _normSetor(c.setor) === _normSetor(_loteSetor));
  const nPix = todos.filter(c => c.formaCobranca === 'pix').length;
  document.getElementById('lt-contagem').textContent =
    `${todos.length} cliente(s) no setor · 👮 ${todos.length - nPix} Vigilante · 💲 ${nPix} Pix`;
  document.getElementById('lt-lista').innerHTML = lista.length ? lista.map(c => `
    <label class="lt-item">
      <input type="checkbox" value="${esc(c.id)}" onchange="loteAtualizaBotoes()">
      <span class="lt-txt"><strong>${esc(c.id)}</strong> — ${esc(c.nome)}<small>${esc(_ruaNum(c))}</small></span>
      <span class="lt-badge ${c.formaCobranca === 'pix' ? 'pix' : 'vig'}">${c.formaCobranca === 'pix' ? '💲 Pix' : '👮 Vigilante'}</span>
    </label>`).join('')
    : '<div class="empty">Nenhum cliente neste filtro.</div>';
  document.getElementById('lt-todos').checked = false;
  loteAtualizaBotoes();
}

function loteMarcarTodos(v) {
  document.querySelectorAll('#lt-lista input[type=checkbox]').forEach(cb => { cb.checked = v; });
  loteAtualizaBotoes();
}

function _loteMarcados() {
  return [...document.querySelectorAll('#lt-lista input[type=checkbox]:checked')].map(cb => cb.value);
}

function loteAtualizaBotoes() {
  const n = _loteMarcados().length;
  document.getElementById('lt-sel').textContent = n ? `${n} marcado(s)` : 'Nenhum marcado';
  ['lt-btn-pix', 'lt-btn-vig'].forEach(id => { document.getElementById(id).disabled = !n; });
}

async function loteSalvar(forma) {
  const ids = _loteMarcados();
  if (!ids.length) return;
  const nomeForma = forma === 'pix' ? 'Pix' : 'Vigilante (folha)';
  const btns = ['lt-btn-pix', 'lt-btn-vig'].map(id => document.getElementById(id));
  btns.forEach(b => { b.disabled = true; });
  try {
    const r = await _postServidor('setFormaCobranca', { setor: _loteSetor, ids, forma }, { rotulo: 'Forma de cobrança em lote (' + nomeForma + ', ' + ids.length + ' cliente(s)) — ' + _loteSetor });
    if (r.pendente) {
      // não confirmado: fica em 'aguardando envio' (aviso vermelho já mostrado) e vale no aparelho
      CLI = CLI.map(c => ids.includes(c.id) && _normSetor(c.setor) === _normSetor(_loteSetor) ? { ...c, formaCobranca: forma } : c);
      localStorage.setItem('eps_cli', JSON.stringify(CLI));
      loteRender(); renderAll();
      return;
    }
    if (!r.ok) { loteAtualizaBotoes(); return; } // recusado: aviso vermelho já mostrado
    const ok = new Set(ids.filter(id => !(r.naoEncontrados || []).includes(id)));
    CLI = CLI.map(c => ok.has(c.id) && _normSetor(c.setor) === _normSetor(_loteSetor) ? { ...c, formaCobranca: forma } : c);
    localStorage.setItem('eps_cli', JSON.stringify(CLI));
    toast(`✅ ${r.alterados} cliente(s) agora são ${nomeForma} (salvo no servidor).`);
    if ((r.naoEncontrados || []).length) toast(`⚠️ Não encontrados no servidor: ${r.naoEncontrados.join(', ')}`, 'warn');
    loteRender();
    renderAll();
  } catch (e) {
    avisoNaoSalvo('NÃO foi salvo (' + e.message + '). Tente de novo.');
    loteAtualizaBotoes();
  }
}

// ─────────────────────────────────────────────
// FILA DE COBRANÇA PELO WHATSAPP
// Estado por dia, no aparelho: se o app fechar no meio, a fila continua de
// onde parou e quem já recebeu hoje não entra de novo.
// ─────────────────────────────────────────────
let FILA = null;   // estado do dia
let _filaCandidatos = []; // montagem: [{ key, item, tel, semTel, semPix }]

function _filaLS() { return 'cobr_fila_' + (USER?.usuario || '') + '_' + isoLocal(new Date()); }

function _filaCarregar() {
  try { FILA = JSON.parse(localStorage.getItem(_filaLS()) || 'null'); } catch (_) { FILA = null; }
  if (!FILA) FILA = { fila: [], pos: 0, itens: {}, enviados: {}, pulados: {}, pendente: null, saiu: false, ativa: false, semTel: 0 };
  return FILA;
}

function _filaSalvar() {
  try {
    localStorage.setItem(_filaLS(), JSON.stringify(FILA));
    // estados de dias anteriores não servem mais
    Object.keys(localStorage).filter(k => k.startsWith('cobr_fila_' + (USER?.usuario || '') + '_') && k !== _filaLS())
      .forEach(k => localStorage.removeItem(k));
  } catch (_) { /* armazenamento cheio/bloqueado: a fila segue só na memória */ }
}

function _hora() { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

/** Preenche o seletor de setor (pode estar vazio se os clientes ainda não carregaram) */
function _filaPreencherSetores() {
  const sel = document.getElementById('fl-setor-fila');
  const setores = getMeusSetores();
  const cfg = (FILA && FILA.config) || {};
  sel.innerHTML = (setores.length > 1 ? '<option value="__todos__">Todos os meus setores</option>' : '')
    + setores.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  if (sel.options.length) {
    sel.value = cfg.setor && [...sel.options].some(o => o.value === cfg.setor) ? cfg.setor : sel.options[0].value;
  }
  if (!document.getElementById('fl-data-fila').value) document.getElementById('fl-data-fila').value = cfg.data || isoLocal(new Date());
  return setores.length;
}

function abrirFila() {
  _filaCarregar();
  // Fila do dia em andamento: abre direto nela (não depende da lista de clientes)
  if (FILA.ativa) {
    document.getElementById('filabg').classList.add('open');
    _filaVista(FILA.pos < FILA.fila.length ? 'rodando' : 'fim');
    return;
  }
  document.getElementById('fl-data-fila').value = (FILA.config && FILA.config.data) || isoLocal(new Date());
  if (!_filaPreencherSetores()) { toast('⚠️ Nenhum setor disponível — sincronize os dados.', 'warn'); return; }
  _filaSetFiltro((FILA.config && FILA.config.filtro) || 'pix');
  document.getElementById('filabg').classList.add('open');
  _filaVista('montar');
  filaMontar();
}

function fecharFila() { document.getElementById('filabg').classList.remove('open'); }

function _filaVista(v) {
  ['montar', 'rodando', 'fim'].forEach(x => {
    document.getElementById('fl-v-' + x).style.display = x === v ? '' : 'none';
  });
  if (v === 'rodando') _filaRenderRodando();
  if (v === 'fim') _filaRenderFim();
}

let _filaFiltro = 'pix';
function _filaSetFiltro(f) {
  _filaFiltro = f;
  document.querySelectorAll('#filabg .fl-filtro .ftab').forEach(t => t.classList.toggle('active', t.dataset.f === f));
}
function filaFiltro(f) { _filaSetFiltro(f); filaMontar(); }

/** Monta a lista: mesma base da folha (listaCobrancaBase), por setor, na ordem da rua */
function filaMontar() {
  _filaCarregar();
  const setorSel = document.getElementById('fl-setor-fila').value;
  const data = document.getElementById('fl-data-fila').value || isoLocal(new Date());
  const setores = setorSel === '__todos__' ? getMeusSetores() : [setorSel];
  const base = [];
  setores.forEach(s => listaCobrancaBase(s, data).forEach(it => base.push(it)));
  const itens = base.filter(it => _filaFiltro === 'todos' || it.c.formaCobranca === 'pix');

  _filaCandidatos = itens.map(it => {
    const key = _chaveCli(it.c);
    const tel = telWhatsApp(it.c.tel);
    const semPix = !cfgDoSetor(it.c.setor).chavePix;
    return { key, it, tel, semTel: !tel, semPix, enviado: FILA.enviados[key] || null };
  });
  const comTel = _filaCandidatos.filter(x => !x.semTel);
  const semTel = _filaCandidatos.filter(x => x.semTel);

  const linha = x => {
    const c = x.it.c;
    const atras = x.it.mesesAtraso > 0;
    const venc = _fmtData(x.it.meses[0].data);
    const info = `<small>${esc(c.setor)} · ${fR(x.it.valorTotal)} · venc. ${venc} · `
      + (atras ? `<b class="fl-atr">🔴 atrasado</b>` : `<b class="fl-hj">⚡ vence até a data</b>`)
      + (c.formaCobranca === 'pix' ? ' · 💲 Pix' : ' · 👮 Vigilante') + '</small>';
    if (x.semTel) return `<div class="fl-item off"><span class="fl-txt"><strong>${esc(c.nome)}</strong>${info}</span><span class="fl-tag">sem telefone</span></div>`;
    if (x.enviado) return `<div class="fl-item feito"><span class="fl-txt"><strong>${esc(c.nome)}</strong>${info}</span>
      <span class="fl-tag ok">✅ Enviado hoje ${esc(x.enviado.hora)} <a href="#" onclick="filaNaoEnviei('${esc(x.key)}');return false;">Não enviei</a></span></div>`;
    if (x.semPix) return `<div class="fl-item off"><span class="fl-txt"><strong>${esc(c.nome)}</strong>${info}</span><span class="fl-tag">sem chave Pix — cadastre em Configurações</span></div>`;
    return `<label class="fl-item"><input type="checkbox" checked data-key="${esc(x.key)}" onchange="_filaContaMarcados()">
      <span class="fl-txt"><strong>${esc(c.nome)}</strong>${info}</span></label>`;
  };

  document.getElementById('fl-lista').innerHTML = _filaCandidatos.length
    ? comTel.map(linha).join('') + semTel.map(linha).join('')
    : '<div class="empty">🎉 Ninguém para cobrar com esses filtros.</div>';
  FILA.config = { setor: setorSel, data, filtro: _filaFiltro };
  _filaSalvar();
  _filaContaMarcados();
}

function _filaContaMarcados() {
  const n = document.querySelectorAll('#fl-lista input[type=checkbox]:checked').length;
  const semTel = _filaCandidatos.filter(x => x.semTel).length;
  const enviados = _filaCandidatos.filter(x => x.enviado).length;
  document.getElementById('fl-resumo-montar').textContent =
    `${n} na fila` + (enviados ? ` · ${enviados} já enviado(s) hoje` : '') + (semTel ? ` · ${semTel} sem telefone` : '');
  const b = document.getElementById('fl-btn-comecar');
  b.disabled = !n;
  b.textContent = n ? `▶ Começar (${n})` : '▶ Começar';
}

/** "Começar": guarda a fila do dia e abre o WhatsApp do 1º */
function filaComecar() {
  const keys = [...document.querySelectorAll('#fl-lista input[type=checkbox]:checked')].map(cb => cb.dataset.key);
  if (!keys.length) return;
  const porKey = new Map(_filaCandidatos.map(x => [x.key, x]));
  FILA.fila = keys;
  FILA.pos = 0;
  FILA.pulados = {};
  FILA.ativa = true;
  FILA.semTel = _filaCandidatos.filter(x => x.semTel).length;
  FILA.itens = {};
  keys.forEach(k => {
    const x = porKey.get(k), c = x.it.c;
    const msg = mensagemCobranca(c);
    FILA.itens[k] = {
      nome: c.nome, setor: c.setor, id: c.id,
      valor: fR(x.it.valorTotal), venc: _fmtData(x.it.meses[0].data), atrasado: x.it.mesesAtraso > 0,
      versao: msg.versao, link: 'https://wa.me/' + x.tel + '?text=' + encodeURIComponent(msg.texto),
    };
  });
  _filaSalvar();
  filaEnviarAtual();
}

/** Abre o WhatsApp do cliente atual com a mensagem pronta (quem envia é você) */
function filaEnviarAtual() {
  const key = FILA.fila[FILA.pos];
  const it = key && FILA.itens[key];
  if (!it) { _filaVista('fim'); return; }
  FILA.pendente = key;
  FILA.saiu = false;
  _filaSalvar();
  _filaVista('rodando');
  window.open(it.link, '_blank');
}

/** Voltou do WhatsApp: o cliente aberto fica "Enviado hoje" e vem o próximo */
function _filaRetorno() {
  if (!FILA || !FILA.pendente || !FILA.saiu) return;
  const key = FILA.pendente;
  FILA.enviados[key] = { hora: _hora() };
  FILA.pendente = null;
  FILA.saiu = false;
  if (FILA.fila[FILA.pos] === key) FILA.pos++;
  _filaSalvar();
  if (document.getElementById('filabg').classList.contains('open')) {
    _filaVista(FILA.pos < FILA.fila.length ? 'rodando' : 'fim');
  }
}

function filaPular() {
  const key = FILA.fila[FILA.pos];
  if (!key) return;
  FILA.pulados[key] = true;
  FILA.pendente = null;
  FILA.pos++;
  _filaSalvar();
  _filaVista(FILA.pos < FILA.fila.length ? 'rodando' : 'fim');
}

/** "Não enviei": desfaz e o cliente volta a ser o próximo da fila */
function filaNaoEnviei(key) {
  _filaCarregar();
  delete FILA.enviados[key];
  if (FILA.ativa && FILA.itens[key]) {
    const i = FILA.fila.indexOf(key);
    if (i >= 0) { FILA.fila.splice(i, 1); if (i < FILA.pos) FILA.pos--; }
    FILA.fila.splice(FILA.pos, 0, key);
    delete FILA.pulados[key];
  }
  _filaSalvar();
  toast('↩️ Desfeito: o cliente voltou para a fila.');
  if (FILA.ativa && FILA.pos < FILA.fila.length) _filaVista('rodando');
  else { _filaPreencherSetores(); _filaVista('montar'); filaMontar(); }
}

function filaEncerrar() {
  FILA.ativa = false;
  FILA.pendente = null;
  _filaSalvar();
  _filaPreencherSetores();
  _filaVista('montar');
  filaMontar();
}

function _filaRenderRodando() {
  const total = FILA.fila.length;
  const key = FILA.fila[FILA.pos];
  const it = FILA.itens[key];
  const nEnv = FILA.fila.filter(k => FILA.enviados[k]).length;
  const nPul = FILA.fila.filter(k => FILA.pulados[k]).length;
  document.getElementById('fl-progresso').textContent =
    `✅ ${nEnv} enviado(s) · ⏭️ ${nPul} pulado(s) · faltam ${total - FILA.pos}`;
  document.getElementById('fl-barra').style.width = Math.round(FILA.pos / Math.max(1, total) * 100) + '%';
  document.getElementById('fl-atual').innerHTML = it ? `
    <div class="fl-prox-lbl">${FILA.pos === 0 && !nEnv ? 'Primeiro da fila' : 'Próximo da fila'}</div>
    <div class="fl-prox-nome">${esc(it.nome)}</div>
    <div class="fl-prox-info">${esc(it.setor)} · ${esc(it.valor)} · venc. ${esc(it.venc)} ·
      ${it.atrasado ? '<b class="fl-atr">🔴 em atraso</b>' : '<b class="fl-hj">⚡ vence hoje</b>'}</div>` : '';
  const b = document.getElementById('fl-btn-prox');
  b.textContent = `📲 Enviar para o ${FILA.pos === 0 && !nEnv ? '1º' : 'próximo'} (${FILA.pos + 1} de ${total})`;
  b.disabled = !it;
  // últimos enviados (com "Não enviei")
  const env = FILA.fila.filter(k => FILA.enviados[k]).slice(-5).reverse();
  document.getElementById('fl-enviados').innerHTML = env.map(k =>
    `<div class="fl-env">✅ ${esc(FILA.itens[k].nome)} — enviado hoje ${esc(FILA.enviados[k].hora)}
      <a href="#" onclick="filaNaoEnviei('${esc(k)}');return false;">Não enviei</a></div>`).join('');
}

function _filaRenderFim() {
  const nEnv = FILA.fila.filter(k => FILA.enviados[k]).length;
  const nPul = FILA.fila.filter(k => FILA.pulados[k]).length;
  document.getElementById('fl-final').innerHTML =
    `<div class="ft-ok">🏁 Cobrança enviada para ${nEnv} cliente(s). Pulados: ${nPul}. Sem telefone: ${FILA.semTel || 0}.</div>
     <div class="ft-meta">Lembrete: a fila não dá baixa em ninguém — use "Pago" ou a "Baixa pela foto" quando o Pix cair.</div>`
    + FILA.fila.filter(k => FILA.enviados[k]).map(k =>
      `<div class="fl-env">✅ ${esc(FILA.itens[k].nome)} — ${esc(FILA.enviados[k].hora)}
        <a href="#" onclick="filaNaoEnviei('${esc(k)}');return false;">Não enviei</a></div>`).join('');
}

/** Ao abrir o app: se o WhatsApp ficou aberto (iOS recarrega a página) ou a fila parou no meio, retoma */
function retomarFilaSeHouver() {
  if (!USER) return;
  _filaCarregar();
  if (FILA.pendente) { FILA.saiu = true; _filaRetorno(); }
  if (FILA.ativa && FILA.pos < FILA.fila.length) {
    abrirFila();
    toast(`📲 Fila de cobrança retomada: ${FILA.pos + 1} de ${FILA.fila.length}.`);
  }
}

// Detecta a ida ao WhatsApp e a volta (visibilidade / foco da janela)
document.addEventListener('visibilitychange', () => {
  if (!FILA || !FILA.pendente) return;
  if (document.hidden) { FILA.saiu = true; _filaSalvar(); }
  else _filaRetorno();
});
window.addEventListener('blur', () => { if (FILA && FILA.pendente) { FILA.saiu = true; _filaSalvar(); } });
window.addEventListener('focus', () => { if (FILA && FILA.pendente) _filaRetorno(); });

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('lotebg')?.addEventListener('click', function (e) { if (e.target === this) fecharLoteForma(); });
});
