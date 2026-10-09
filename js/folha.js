/* ═══════════════════════════════════════════════════════════════
   CobraSetor — folha.js
   Folha de cobrança impressa · Baixa pela foto · Recibos de papel
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Data local → "AAAA-MM-DD" (hojeISO() do config.js usa UTC e vira o dia às 21h) */
function isoLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _dataDeISO(iso) {
  const [y, m, d] = String(iso || '').split('-').map(n => parseInt(n));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function _fmtData(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

/** Data de vencimento do mês AAAAMM (dia 31 em mês curto vira o último dia) */
function _dataVencimento(ym, vencDia) {
  const y = Math.floor(ym / 100), m = ym % 100;
  const ultimo = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(parseInt(vencDia) || 1, ultimo));
}

/** Meses em aberto do cliente com vencimento até a data limite: [{ym, data}] */
function mesesEmAberto(c, dataLim) {
  const out = [];
  let ym = parseInt(c.proxVenc) || YM(new Date());
  for (let i = 0; i < 36; i++) {
    const data = _dataVencimento(ym, c.vencDia);
    if (data > dataLim) break;
    out.push({ ym, data });
    ym = addM(ym, 1);
  }
  return out;
}

const _normSetor = s => String(s || '').trim().toLowerCase();

/** O usuário logado pode ver este setor? */
function podeVerSetor(setor) {
  return getMeusSetores().some(s => _normSetor(s) === _normSetor(setor));
}

// ─────────────────────────────────────────────
// BUSCA ÚNICA DA FOLHA
// A folha impressa (Função 1), a baixa pela foto (Função 2) e os recibos
// de papel (Função 3) usam SEMPRE esta função — assim a lista, a ordem e
// os valores nunca ficam diferentes entre elas.
// ─────────────────────────────────────────────
/**
 * Clientes ativos do setor com vencimento até dataLimISO (atrasados + os que
 * vencem até o dia), na ordem de rua/rota do app (sortClientes / ordemRua).
 * Retorna [{ ordem, c, meses:[{ym,data}], mesesAtraso, valorTotal }].
 */
function listaFolhaCobranca(setor, dataLimISO) {
  if (!setor || !podeVerSetor(setor)) return [];
  const lim = _dataDeISO(dataLimISO);
  if (!lim) return [];
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const base = getClisFiltrados().filter(c =>
    c.status !== 'inativo' && _normSetor(c.setor) === _normSetor(setor));

  const itens = [];
  sortClientes(base).forEach(c => {
    // Remarcado para depois da data limite: fica fora da folha
    if (c.dataRemarcacao) {
      const ret = _dataDeISO(c.dataRemarcacao);
      if (ret && ret > lim) return;
    }
    const meses = mesesEmAberto(c, lim);
    if (!meses.length) return;
    itens.push({
      c,
      meses,
      mesesAtraso: meses.filter(m => m.data < hoje).length,
      valorTotal:  (parseFloat(c.valor) || 0) * meses.length,
    });
  });
  itens.forEach((it, i) => { it.ordem = i + 1; });
  return itens;
}

// ─────────────────────────────────────────────
// TELA DE IMPRESSÃO (A4, sem menus do app)
// ─────────────────────────────────────────────
function abrirImpressao(titulo, html, margemPagina) {
  const pv = document.getElementById('print-view');
  document.getElementById('pv-titulo').textContent = titulo;
  document.getElementById('pv-content').innerHTML = html;
  let st = document.getElementById('pv-page-style');
  if (!st) { st = document.createElement('style'); st.id = 'pv-page-style'; document.head.appendChild(st); }
  st.textContent = '@page { size: A4 portrait; margin: ' + (margemPagina || '10mm') + '; }';
  document.body.classList.add('imprimindo');
  pv.classList.add('open');
  pv.scrollTop = 0;
}

function fecharImpressao() {
  document.getElementById('print-view').classList.remove('open');
  document.body.classList.remove('imprimindo');
  document.getElementById('pv-content').innerHTML = '';
}

// ─────────────────────────────────────────────
// MODAL: escolher setor + data limite
// ─────────────────────────────────────────────
let _folhaModo = 'folha';

function abrirFolhaModal(modo, setor, dataISO) {
  _folhaModo = modo || 'folha';
  const sel = document.getElementById('fo-setor');
  const setores = getMeusSetores().filter(s => _folhaModo !== 'recibos' || modeloReciboPapel(s));
  if (!setores.length) { toast('⚠️ Nenhum setor disponível.', 'warn'); return; }
  sel.innerHTML = setores.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const atual = setor || document.getElementById('fsetor')?.value || '';
  if (setores.some(s => _normSetor(s) === _normSetor(atual))) sel.value = setores.find(s => _normSetor(s) === _normSetor(atual));
  document.getElementById('fo-data').value = dataISO || isoLocal(new Date());
  document.getElementById('folha-mtitle').textContent = _folhaModo === 'recibos' ? '🧾 IMPRIMIR RECIBOS' : '🖨️ FOLHA DE COBRANÇA';
  document.getElementById('fo-btn-ok').textContent   = _folhaModo === 'recibos' ? '🧾 Gerar recibos' : '🖨️ Gerar folha';
  _folhaAtualizaPrevia();
  document.getElementById('folhabg').classList.add('open');
}

function fecharFolhaModal() {
  document.getElementById('folhabg').classList.remove('open');
}

function _folhaAtualizaPrevia() {
  const setor = document.getElementById('fo-setor').value;
  const data  = document.getElementById('fo-data').value;
  const itens = listaFolhaCobranca(setor, data);
  const total = itens.reduce((a, it) => a + it.valorTotal, 0);
  const nRec  = itens.reduce((a, it) => a + it.meses.length, 0);
  document.getElementById('fo-previa').innerHTML = itens.length
    ? `📋 <strong>${itens.length}</strong> cliente(s) · total <strong>${fR(total)}</strong>`
      + (_folhaModo === 'recibos' ? `<br>🧾 <strong>${nRec}</strong> recibo(s) · ${Math.ceil(nRec / 6)} folha(s) A4` : '')
    : '🎉 Nenhum cliente com vencimento até esta data neste setor.';
}

function confirmarFolhaModal() {
  const setor = document.getElementById('fo-setor').value;
  const data  = document.getElementById('fo-data').value;
  if (!setor || !data) { toast('⚠️ Escolha o setor e a data.', 'err'); return; }
  fecharFolhaModal();
  if (_folhaModo === 'recibos') imprimirRecibos(setor, data);
  else imprimirFolha(setor, data);
}

// ─────────────────────────────────────────────
// FUNÇÃO 1 — FOLHA DE COBRANÇA
// ─────────────────────────────────────────────
function _ruaNum(c) {
  return [c.rua, c.num].filter(Boolean).join(', ');
}

function htmlFolhaCobranca(setor, dataISO) {
  const itens = listaFolhaCobranca(setor, dataISO);
  const total = itens.reduce((a, it) => a + it.valorTotal, 0);
  const agora = new Date();
  const impresso = _fmtData(agora) + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const linhas = itens.map(it => {
    const c = it.c;
    const valor = it.meses.length > 1
      ? `${fR(it.valorTotal)}<small>${it.meses.length}× ${fR(c.valor)}</small>`
      : fR(it.valorTotal);
    return `<tr>
      <td class="fl-x"><span class="fl-box"></span></td>
      <td class="fl-cod"><small>${it.ordem}</small>${esc(c.id)}</td>
      <td class="fl-rua">${esc(_ruaNum(c))}</td>
      <td class="fl-nome">${esc(c.nome)}</td>
      <td class="fl-tel">${esc(c.tel || '—')}</td>
      <td class="fl-data">${_fmtData(it.meses[0].data)}</td>
      <td class="fl-atr">${it.mesesAtraso || '—'}</td>
      <td class="fl-val">${valor}</td>
    </tr>`;
  }).join('');

  return `<div class="fl-page">
    <div class="fl-head">
      <div>
        <div class="fl-tit">FOLHA DE COBRANÇA</div>
        <div class="fl-setor">${esc(setor)}</div>
      </div>
      <div class="fl-meta">
        Vencimento até: <strong>${_fmtData(_dataDeISO(dataISO))}</strong><br>
        Impresso em: <strong>${impresso}</strong><br>
        Total de clientes: <strong>${itens.length}</strong>
      </div>
    </div>
    <div class="fl-instr">Marque com <strong>X</strong> a caixinha de cada cliente que pagou.</div>
    ${itens.length ? `<table class="fl-tab">
      <thead><tr>
        <th class="fl-x">Pago</th><th>Código</th><th>Rua e número</th><th>Nome</th>
        <th>Telefone</th><th>Data de cobrança</th><th>Meses em atraso</th><th>Valor</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>` : '<div class="fl-vazio">Nenhum cliente com vencimento até esta data.</div>'}
    <div class="fl-total">
      <span>${itens.length} cliente(s)</span>
      <span>VALOR TOTAL: <strong>${fR(total)}</strong></span>
    </div>
  </div>`;
}

function imprimirFolha(setor, dataISO) {
  if (!podeVerSetor(setor)) { toast('🚫 Setor fora das suas permissões.', 'err'); return; }
  abrirImpressao(`Folha de cobrança — ${setor}`, htmlFolhaCobranca(setor, dataISO), '10mm');
}

// ─────────────────────────────────────────────
// MODELOS DE RECIBO DE PAPEL POR PROPRIETÁRIO
// Chave = usuário do dono do setor. Cada modelo tem: nome, porFolha e
// render(recibos) → HTML das páginas A4. Para um novo dono ter o próprio
// recibo, basta registrar um modelo aqui com o usuário dele.
// ─────────────────────────────────────────────
const MODELOS_RECIBO_PAPEL = {};

function modeloReciboPapel(setor) {
  const dono = typeof _donoDoSetor === 'function' ? _donoDoSetor(setor) : null;
  return (dono && MODELOS_RECIBO_PAPEL[dono.usuario]) || null;
}

/** Mostra/esconde os botões da tela de Cobrança conforme os setores do usuário */
function atualizarBotoesFolha() {
  const r = document.getElementById('btn-imp-recibos');
  if (r) r.style.display = getMeusSetores().some(s => modeloReciboPapel(s)) ? '' : 'none';
  const f = document.getElementById('btn-baixa-foto');
  if (f) f.style.display = typeof abrirFotoModal === 'function' ? '' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('folhabg')?.addEventListener('click', function (e) { if (e.target === this) fecharFolhaModal(); });
});
