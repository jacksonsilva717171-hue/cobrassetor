/* ═══════════════════════════════════════════════════════════════
   CobraSetor v1 — config.js
   Constantes · Estado Global · API Sheets · Helpers · Utils
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// CONFIGURAÇÃO SHEETS
// ─────────────────────────────────────────────
const SHEET_ID_DEFAULT = '15tc3NJ_N1CLlSNEP3CYo8Uze-trMNrOy864dUpUhM98';

// URL do Apps Script do app EPS em produção (fallback hardcoded para compatibilidade)
const SCRIPT_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbwO1PYjuVEj9yMgdZZdAPO9jchDxolwzBxjp1wOe7Mm6XRf6CMYXJlpH5sTHktNMXb9/exec';

let SHEET_ID   = localStorage.getItem('cobr_sheet_id')  || SHEET_ID_DEFAULT;
let SCRIPT_URL = localStorage.getItem('cobr_script_url')
              || localStorage.getItem('eps_script_url')  // compatibilidade EPS
              || SCRIPT_URL_DEFAULT;                      // fallback hardcoded

// ─────────────────────────────────────────────
// USUÁRIOS PADRÃO (hardcoded seed)
// ─────────────────────────────────────────────
const USUARIOS_PADRAO = [
  {
    usuario:    'admin',
    senha:      'cobra2025',
    role:       'admin',
    nome:       'Administrador',
    bloqueado:  false,
  },
  {
    usuario:    'preto',
    senha:      'jack0411',
    role:       'proprietario',
    nome:       'Preto',
    tel:        '',
    chavePix:   '',
    logoUrl:    '',
    setores:    ['Setor 13', 'Setor 02'],
    valorMensal: 100,
    bloqueado:  false,
  },
  {
    usuario:    'elite2022',
    senha:      'elite2022',
    role:       'proprietario',
    nome:       'Vinicius',
    tel:        '',
    chavePix:   '',
    logoUrl:    '',
    setores:    ['Setor 03', 'Setor 04', 'Setor 05', 'Setor 06', 'Setor 07', 'Setor 08'],
    valorMensal: 300,
    bloqueado:  false,
  },
];

// Mescla padrão + extras salvos no localStorage
function carregarUsuarios() {
  // Lê ambas as chaves; cobr_usuarios tem PRIORIDADE sobre eps_usuarios
  const salvosCobr = JSON.parse(localStorage.getItem('cobr_usuarios') || '[]');
  const salvosEps  = JSON.parse(localStorage.getItem('eps_usuarios')  || '[]');

  const merged = USUARIOS_PADRAO.map(p => ({ ...p }));

  // 1ª passagem: aplica eps_usuarios (prioridade baixa — dados legados do EPS)
  salvosEps.forEach(s => {
    const idx = merged.findIndex(u => u.usuario === s.usuario);
    // normaliza role legado antes de aplicar
    const role = s.role === 'vigia' ? 'cobrador'
               : s.role === 'dono'  ? 'proprietario'
               : (s.role || 'cobrador');
    const norm = { ...s, role };
    if (idx >= 0) merged[idx] = { ...merged[idx], ...norm };
    else merged.push(norm);
  });

  // 2ª passagem: aplica cobr_usuarios (prioridade alta — dados do CobraSetor)
  // Sobrescreve qualquer entrada do eps_usuarios com o mesmo usuário
  salvosCobr.forEach(s => {
    const idx = merged.findIndex(u => u.usuario === s.usuario);
    if (idx >= 0) merged[idx] = { ...merged[idx], ...s };
    else merged.push(s);
  });

  return merged;
}

function salvarUsuarios() {
  // Salva apenas os que diferem do padrão + os extras
  const extras = USUARIOS.filter(u => !USUARIOS_PADRAO.find(p => p.usuario === u.usuario));
  const modificados = USUARIOS.filter(u => {
    const pad = USUARIOS_PADRAO.find(p => p.usuario === u.usuario);
    if (!pad) return false;
    return JSON.stringify(u) !== JSON.stringify(pad);
  });
  const toSave = [...modificados, ...extras];
  localStorage.setItem('cobr_usuarios', JSON.stringify(toSave));
  // sincroniza chave legada EPS para cobrador EPS-compatível
  localStorage.setItem('eps_usuarios', JSON.stringify(
    toSave.map(u => ({
      ...u,
      role: u.role === 'proprietario' ? 'dono' : u.role === 'cobrador' ? 'vigia' : u.role,
      setor: Array.isArray(u.setores) ? (u.setores[0] || '') : (u.setores || ''),
    }))
  ));
  USUARIOS = carregarUsuarios();
}

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
let USUARIOS = carregarUsuarios();
let CLI  = [];   // clientes
let PAG  = [];   // pagamentos
let DESP = [];   // despesas
let USER = null; // usuário logado

// Controles de UI
let cobTab  = 'todos'; // aba ativa na cobrança
let relTab  = 'mes';   // período do relatório

// Filtros da tela de Clientes (variáveis JS — não dependem do DOM .value)
let fCliSetor  = '';
let fCliStatus = '';
let fCliForma  = '';

function setFCliSetor(v)  { fCliSetor  = v; renderCli(); }
function setFCliStatus(v) { fCliStatus = v; renderCli(); }
function setFCliForma(v)  { fCliForma  = v; renderCli(); }

// Controles de modais
let editId      = null; // cliente sendo editado
let editDespId  = null; // despesa sendo editada
let editCobrId  = null; // cobrador sendo editado (usuario string)
let editPropId  = null; // proprietário sendo editado (usuario string)
let pagId       = null;
let pagMes      = null;
let pagForma    = 'dinheiro';
let pagVoltar   = null;
let remarkId    = null;
let obsId       = null;

// Sync
let bloqSync = false; // bloqueia sync 15s após pagamento

// ─────────────────────────────────────────────
// HELPERS DE DATA/MÊS
// ─────────────────────────────────────────────
/** Retorna AAAAMM a partir de um Date */
function YM(d) {
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

/** Adiciona/subtrai meses de um AAAAMM */
function addM(ym, n) {
  let y = Math.floor(ym / 100);
  let m = (ym % 100) - 1 + n;
  y += Math.floor(m / 12);
  m  = ((m % 12) + 12) % 12;
  return y * 100 + (m + 1);
}

const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/** Formata AAAAMM → "Mai/2026" */
function lbM(ym) {
  const n = parseInt(ym) || 0;
  if (!n) return '---';
  return MES_ABREV[(n % 100) - 1] + '/' + Math.floor(n / 100);
}

/** Formata data ISO → "dd/mm/yyyy HH:MM" */
function fData(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
}

/** Hoje no formato YYYY-MM-DD (para input[type=date]) */
function hojeISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────
// CÁLCULO DE STATUS DO CLIENTE
// ─────────────────────────────────────────────
/**
 * Retorna o status calculado do cliente:
 * 'inativo' | 'remarcado' | 'hoje' | 'atrasado' | 'ok' | 'adiantado'
 */
function st(c) {
  if (c.status === 'inativo') return 'inativo';

  // Remarcado: verifica se a data de retorno já chegou
  if (c.status === 'remarcado' && c.dataRemarcacao) {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const ret  = new Date(c.dataRemarcacao + 'T00:00:00');
    if (ret > hoje) return 'remarcado'; // ainda no futuro
    // data de retorno chegou → reativa automaticamente (localmente)
    c.status = 'ativo';
    c.dataRemarcacao = '';
    // persiste a reativação em segundo plano sem bloquear UI
    setTimeout(() => sheetPost('editCliente', {...c}).catch(() => {}), 100);
  }

  return _stCalc(c);
}

function _stCalc(c) {
  const h  = new Date();
  const yh = YM(h);
  const dh = h.getDate();
  const pv = parseInt(String(c.proxVenc || '').replace(/\..*$/, '')) || yh;
  const vd = parseInt(String(c.vencDia  || '').replace(/\..*$/, '')) || 1;

  if (pv < yh) return 'atrasado';
  if (pv > yh) return 'adiantado';
  if (vd === dh) return 'hoje';
  if (vd <  dh) return 'atrasado';
  return 'ok';
}

/** Quantos meses de atraso o cliente tem */
function calcMesesAtraso(c) {
  const yh = YM(new Date());
  const pv = parseInt(c.proxVenc) || yh;
  if (pv >= yh) return 0;
  const ay = Math.floor(yh / 100), am = yh % 100;
  const py = Math.floor(pv / 100), pm = pv % 100;
  return (ay - py) * 12 + (am - pm);
}

/** HTML do badge de status */
function stLbl(s) {
  const map = {
    hoje:      '<span class="st-hj">⚡ Hoje</span>',
    atrasado:  '<span class="st-la">🔴 Atraso</span>',
    adiantado: '<span class="st-ad">⭐ Adiantado</span>',
    remarcado: '<span class="st-rm">🔵 Remarcado</span>',
    inativo:   '<span class="st-in">⚫ Inativo</span>',
    ok:        '<span class="st-ok">✅ Em dia</span>',
  };
  return map[s] || map.ok;
}

/** HTML do badge de forma de pagamento */
function fpLbl(forma) {
  const map = {
    dinheiro:       '<span class="fp-din">💵 Dinheiro</span>',
    cartao:         '<span class="fp-cart">💳 Cartão</span>',
    pix_presencial: '<span class="fp-pixp">✅ Pix Pres.</span>',
    pix_auto:       '<span class="fp-pixa">🤖 Pix Auto</span>',
    pix:            '<span class="fp-pixp">✅ Pix</span>',  // compat EPS
  };
  return map[forma] || `<span class="fp-din">${forma||'-'}</span>`;
}

// ─────────────────────────────────────────────
// ORDENAÇÃO DE CLIENTES (ordemRua → ordemRua2 → num → nome)
// ─────────────────────────────────────────────
/**
 * Extrai os números de prefixo do campo rua.
 * Formato esperado: "01-02 - NOME DA RUA" → [1, 2]
 * Retorna [9999, 9999] se não houver prefixo.
 */
function _parseOrdemRua(c) {
  // Se ordemRua já foi explicitamente definido (campo do cadastro)
  const explicit = parseInt(c.ordemRua);
  if (explicit && explicit !== 9999) return [explicit, 0];

  // Tenta extrair do prefixo do campo rua: "XX-YY - NOME" ou "XX - NOME"
  const match = String(c.rua || '').match(/^(\d+)(?:-(\d+))?[^\d]/);
  if (match) {
    return [parseInt(match[1]), parseInt(match[2] || '0')];
  }
  return [9999, 9999];
}

function sortClientes(list) {
  return [...list].sort((a, b) => {
    const [oa1, oa2] = _parseOrdemRua(a);
    const [ob1, ob2] = _parseOrdemRua(b);
    if (oa1 !== ob1) return oa1 - ob1;
    if (oa2 !== ob2) return oa2 - ob2;
    const na = parseInt(a.num) || 0;
    const nb = parseInt(b.num) || 0;
    if (na !== nb) return na - nb;
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  });
}

// ─────────────────────────────────────────────
// FILTRO DE CLIENTES POR ROLE
// ─────────────────────────────────────────────
function getClisFiltrados() {
  if (!USER) return [];
  if (USER.role === 'admin') return CLI;
  if (USER.role === 'proprietario') {
    // Comparação case-insensitive + trim para tolerar variações de digitação
    // ex: "Setor 03" === "setor 03" === "Setor 03 " (espaço extra)
    const setoresNorm = (USER.setores || []).map(s => s.trim().toLowerCase());
    return CLI.filter(c => setoresNorm.includes((c.setor || '').trim().toLowerCase()));
  }
  if (USER.role === 'cobrador') {
    const meus = Array.isArray(USER.setores) ? USER.setores
                 : (USER.setor ? [USER.setor] : []);
    const meusNorm = meus.map(s => s.trim().toLowerCase());
    return CLI.filter(c => meusNorm.includes((c.setor || '').trim().toLowerCase()));
  }
  return [];
}

/** Setores que o usuário pode ver */
function getMeusSetores() {
  if (!USER) return [];
  if (USER.role === 'admin') return [...new Set(CLI.map(c => c.setor).filter(Boolean))].sort();
  if (USER.role === 'proprietario') return [...(USER.setores || [])].sort();
  if (USER.role === 'cobrador') {
    return Array.isArray(USER.setores) ? [...USER.setores].sort()
           : (USER.setor ? [USER.setor] : []);
  }
  return [];
}

// ─────────────────────────────────────────────
// FORMATAÇÃO DE MOEDA
// ─────────────────────────────────────────────
function fR(v) {
  const n = parseFloat(v || 0);
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formata endereço completo */
function addr(c) {
  return [c.rua, c.num && ('Nº ' + c.num), c.complemento, c.bairro, c.cidade]
    .filter(Boolean).join(', ');
}

// ─────────────────────────────────────────────
// GERAÇÃO DE ID
// ─────────────────────────────────────────────
function gerarId() {
  const nums = CLI.map(c => parseInt((c.id || '').replace('EPS', '')) || 0);
  const max  = nums.length ? Math.max(...nums) : 0;
  return 'EPS' + String(max + 1).padStart(3, '0');
}

// ─────────────────────────────────────────────
// API — GOOGLE SHEETS
// ─────────────────────────────────────────────
async function fetchComTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    return r;
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

async function sheetReq(acao, dados = {}) {
  if (!SCRIPT_URL) return offlineReq(acao, dados);
  try {
    setSyncStatus('sync', 'Conectando ao Sheets...');
    const params = new URLSearchParams({ acao, ...dados });
    const r    = await fetchComTimeout(`${SCRIPT_URL}?${params}`, { method: 'GET' }, 10000);
    const text = await r.text();
    // tenta parsear JSON — às vezes o Apps Script retorna HTML de erro
    let json;
    try { json = JSON.parse(text); }
    catch(pe) {
      console.warn('Sheets retornou resposta não-JSON:', text.slice(0,200));
      setSyncStatus('err', '⚠️ Sheets retornou erro — usando dados locais');
      return offlineReq(acao, dados);
    }
    setSyncStatus('ok', '✅ Sincronizado · ' + new Date().toLocaleTimeString('pt-BR'));
    return json;
  } catch (e) {
    console.warn('sheetReq erro:', acao, e.message);
    setSyncStatus('err', '🔴 Sem conexão — dados locais');
    return offlineReq(acao, dados);
  }
}

async function sheetPost(acao, dados = {}) {
  if (!SCRIPT_URL) return offlinePost(acao, dados);
  try {
    setSyncStatus('sync', 'Salvando...');
    const r    = await fetchComTimeout(SCRIPT_URL, {
      method: 'POST',
      body:   JSON.stringify({ acao, ...dados }),
    }, 8000);
    const json = await r.json();
    setSyncStatus('ok', 'Salvo · ' + new Date().toLocaleTimeString('pt-BR'));
    return json;
  } catch (e) {
    setSyncStatus('err', 'Sem conexão — dados locais');
    return offlinePost(acao, dados);
  }
}

// ─────────────────────────────────────────────
// OFFLINE — localStorage fallback
// ─────────────────────────────────────────────
function offlineReq(acao, dados) {
  if (acao === 'getClientes') {
    let list = JSON.parse(localStorage.getItem('eps_cli') || '[]');
    if (dados.setor) list = list.filter(c => c.setor === dados.setor);
    return { ok: true, data: list };
  }
  if (acao === 'getPagamentos') {
    const pag = JSON.parse(localStorage.getItem('eps_pag') || '[]');
    return { ok: true, data: pag };
  }
  if (acao === 'getDespesas') {
    const desp = JSON.parse(localStorage.getItem('cobr_desp') || '[]');
    return { ok: true, data: desp };
  }
  return { ok: true, data: [] };
}

function offlinePost(acao, dados) {
  let cli  = JSON.parse(localStorage.getItem('eps_cli')   || '[]');
  let pag  = JSON.parse(localStorage.getItem('eps_pag')   || '[]');
  let desp = JSON.parse(localStorage.getItem('cobr_desp') || '[]');

  switch (acao) {
    case 'addCliente':
    case 'editCliente': {
      const idx = cli.findIndex(c => c.id === dados.id);
      if (idx >= 0) cli[idx] = dados; else cli.push(dados);
      localStorage.setItem('eps_cli', JSON.stringify(cli));
      break;
    }
    case 'delCliente':
      cli = cli.filter(c => c.id !== dados.id);
      localStorage.setItem('eps_cli', JSON.stringify(cli));
      break;

    case 'addPagamento': {
      pag.push(dados);
      localStorage.setItem('eps_pag', JSON.stringify(pag));
      // atualiza proxVenc local
      const idxPag = cli.findIndex(c => c.id === dados.cid);
      if (idxPag >= 0) { cli[idxPag].proxVenc = dados.novoPv; localStorage.setItem('eps_cli', JSON.stringify(cli)); }
      break;
    }

    case 'addDespesa':
    case 'editDespesa': {
      const di = desp.findIndex(d => d.id === dados.id);
      if (di >= 0) desp[di] = dados; else desp.push(dados);
      localStorage.setItem('cobr_desp', JSON.stringify(desp));
      break;
    }
    case 'delDespesa':
      desp = desp.filter(d => d.id !== dados.id);
      localStorage.setItem('cobr_desp', JSON.stringify(desp));
      break;
  }
  return { ok: true };
}

// ─────────────────────────────────────────────
// SYNC PRINCIPAL
// ─────────────────────────────────────────────

/**
 * Extrai array de uma resposta do Apps Script.
 * Aceita múltiplos formatos: {ok,data}, {status,clientes}, array direto, etc.
 */
function extArr(r, ...keys) {
  if (Array.isArray(r)) return r;
  for (const k of keys) if (Array.isArray(r?.[k])) return r[k];
  return null;
}

async function syncAll() {
  if (bloqSync) { toast('⏳ Aguarde, sincronização bloqueada por 15s após pagamento.'); return; }
  if (!USER) return;

  setSyncStatus('sync', 'Carregando dados...');

  // ── Determina qual(is) setor(es) buscar ─────────────────────────────────
  // O Apps Script lê abas separadas por setor (ex: aba "Setor 03").
  // Cobrador e Proprietário precisam passar o setor para que o script saiba
  // qual aba ler. Proprietário com múltiplos setores faz uma requisição por
  // setor e os resultados são combinados.
  let cliReqPromise;

  if (USER.role === 'cobrador') {
    const meus = Array.isArray(USER.setores) ? USER.setores : [USER.setor].filter(Boolean);
    if (meus.length === 1) {
      cliReqPromise = sheetReq('getClientes', { setor: meus[0] });
    } else {
      // cobrador com múltiplos setores: busca sem filtro (admin-like) ou combina
      cliReqPromise = sheetReq('getClientes', {});
    }

  } else if (USER.role === 'proprietario') {
    const meus = Array.isArray(USER.setores) ? USER.setores : [];
    if (meus.length === 1) {
      // ✅ FIX: proprietário passa setor igual ao cobrador — sem isso, o Apps
      // Script não sabia qual aba ler e retornava vazio (bug reportado Vinicius)
      cliReqPromise = sheetReq('getClientes', { setor: meus[0] });
    } else if (meus.length > 1) {
      // Múltiplos setores: busca paralela + merge
      cliReqPromise = Promise.all(meus.map(s => sheetReq('getClientes', { setor: s })))
        .then(results => {
          const combined = results.flatMap(r => extArr(r, 'data', 'clientes', 'rows', 'result') || []);
          // remove duplicatas por id (caso algum setor apareça em mais de uma aba)
          const seen = new Set();
          const deduped = combined.filter(c => {
            if (!c.id || seen.has(c.id)) return false;
            seen.add(c.id); return true;
          });
          return { ok: true, data: deduped };
        });
    } else {
      cliReqPromise = sheetReq('getClientes', {});
    }

  } else {
    // admin: busca todos sem filtro de setor
    cliReqPromise = sheetReq('getClientes', {});
  }

  const promises = [cliReqPromise];
  if (USER.role !== 'cobrador') {
    promises.push(sheetReq('getPagamentos'));
    promises.push(sheetReq('getDespesas'));
  } else {
    promises.push(Promise.resolve({ ok: true, data: [] }));
    promises.push(Promise.resolve({ ok: true, data: [] }));
  }

  const [rCli, rPag, rDesp] = await Promise.all(promises);

  const cliData  = extArr(rCli,  'data', 'clientes', 'rows', 'result');
  const pagData  = extArr(rPag,  'data', 'pagamentos', 'rows', 'result');
  const despData = extArr(rDesp, 'data', 'despesas', 'rows', 'result');

  if (cliData !== null && cliData.length > 0) {
    CLI = cliData.map(c => normalizarCliente(c));
    localStorage.setItem('eps_cli', JSON.stringify(CLI));   // atualiza cache local
  } else if (CLI.length === 0) {
    // resposta veio vazia ou formato inválido → usa cache localStorage
    const cached = JSON.parse(localStorage.getItem('eps_cli') || '[]');
    if (cached.length > 0) CLI = cached.map(c => normalizarCliente(c));
  }

  if (pagData !== null) {
    PAG = pagData;
    if (PAG.length > 0) localStorage.setItem('eps_pag', JSON.stringify(PAG));
  } else if (PAG.length === 0) {
    PAG = JSON.parse(localStorage.getItem('eps_pag') || '[]');
  }

  if (despData !== null) {
    DESP = despData;
    if (DESP.length > 0) localStorage.setItem('cobr_desp', JSON.stringify(DESP));
  } else if (DESP.length === 0) {
    DESP = JSON.parse(localStorage.getItem('cobr_desp') || '[]');
  }

  renderAll();

  // Garante que o dot sempre termina visível
  // (sheetReq já chama setSyncStatus ao conectar; aqui cobre o caso offline puro)
  const dot = document.getElementById('sync-dot');
  if (dot && dot.classList.contains('sync')) {
    setSyncStatus('ok', `📦 Dados locais · ${CLI.length} cliente(s)`);
  }
}

/** Normaliza tipos do cliente (garante tipos corretos — evita TypeError em .slice / .localeCompare) */
function normalizarCliente(c) {
  let pv = parseInt(String(c.proxVenc || '').replace(/\..*$/, '')) || YM(new Date());
  // compatibilidade: corrige anos anteriores (dados antigos EPS)
  if (pv > 0 && pv < 202500) {
    const mes = pv % 100;
    pv = 202600 + mes;
  }
  return {
    ...c,
    // campos de texto — sempre string (planilha pode enviar número em campo obs ou nome)
    id:       String(c.id    || ''),
    nome:     String(c.nome  || '').trim(),
    rua:      String(c.rua   || '').trim(),
    setor:    String(c.setor || '').trim(),
    bairro:   String(c.bairro || ''),
    cidade:   String(c.cidade || ''),
    obs:         c.obs != null ? String(c.obs) : '',
    tel:         String(c.tel   || ''),
    inativadoEm: c.inativadoEm ? String(c.inativadoEm) : '',
    // campos numéricos
    proxVenc:  pv,
    vencDia:   parseInt(String(c.vencDia  || '').replace(/\..*$/, '')) || 1,
    valor:     parseFloat(String(c.valor  || '').replace(/[^\d.]/g, '')) || 0,
    ordemRua:  parseInt(c.ordemRua) || 9999,
    status:    c.status || 'ativo',
  };
}

// ─────────────────────────────────────────────
// SYNC STATUS UI
// ─────────────────────────────────────────────
function setSyncStatus(state, msg) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-txt');
  if (dot) dot.className = 'sync-dot ' + state;
  if (txt) txt.textContent = msg;
}

// ─────────────────────────────────────────────
// CONFIG (modal)
// ─────────────────────────────────────────────
function openConfig() {
  document.getElementById('cfg-url').value = SCRIPT_URL || '';
  document.getElementById('cfg-id').value  = SHEET_ID   || '';
  document.getElementById('config-screen').classList.add('open');
}
function closeConfig() {
  document.getElementById('config-screen').classList.remove('open');
}
function salvarConfig() {
  const url = document.getElementById('cfg-url').value.trim();
  const id  = document.getElementById('cfg-id').value.trim();
  if (url) { SCRIPT_URL = url; localStorage.setItem('cobr_script_url', url); localStorage.setItem('eps_script_url', url); }
  if (id)  { SHEET_ID   = id;  localStorage.setItem('cobr_sheet_id', id); }
  closeConfig();
  toast('✅ Configuração salva!');
}

// ─────────────────────────────────────────────
// NAVEGAÇÃO
// ─────────────────────────────────────────────
function goTo(sec, el) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  const secEl = document.getElementById('sec-' + sec);
  if (secEl) secEl.classList.add('active');
  if (el)    el.classList.add('active');
  closeSB();
  // render específico da seção
  switch (sec) {
    case 'dashboard':      renderDash(); renderResumoSetor(); break;
    case 'clientes':       updSetorSel(); renderCli(); break;
    case 'cobranca':       updSetorSel(); renderCob(); break;
    case 'despesas':       renderDesp(); break;
    case 'relatorio':      renderRel(); break;
    case 'cobradores':     renderCobradores(); break;
    case 'proprietarios':  renderProprietarios(); break;
  }
}

function toggleSB() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('ovl').classList.toggle('open');
}
function closeSB() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('ovl').classList.remove('open');
}

// ─────────────────────────────────────────────
// RENDER GERAL (chama todos os renders ativos)
// ─────────────────────────────────────────────
function renderAll() {
  renderDash();
  renderResumoSetor();
  updSetorSel();
  renderCli();
  renderCob();
  renderDesp();
  renderRel();
  updBadge();
}

/** Atualiza badge de cobrança pendente */
function updBadge() {
  const n = getClisFiltrados().filter(c => ['hoje','atrasado'].includes(st(c))).length;
  ['badge-cobr','mob-badge'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.textContent = n; b.style.display = n > 0 ? '' : 'none'; }
  });
}

/** Atualiza selects de setor nos filtros */
function updSetorSel() {
  const setores = getMeusSetores();

  // Filtro clientes — sincroniza select visual com variável fCliSetor
  const filSe = document.getElementById('fil-setor');
  if (filSe) {
    filSe.innerHTML = '<option value="">Todos os setores</option>'
      + setores.map(s => `<option value="${s}">${s}</option>`).join('');
    filSe.value = fCliSetor; // espelha variável JS no select visual
  }

  // Filtro cobrança
  const fset = document.getElementById('fsetor');
  const wrap = document.getElementById('wrap-fsetor');
  if (fset) {
    const cur2 = fset.value;
    fset.innerHTML = '<option value="">Todos</option>'
      + setores.map(s => `<option value="${s}">${s}</option>`).join('');
    if (setores.length <= 1 && USER.role === 'cobrador') {
      if (wrap) wrap.style.display = 'none';
      if (setores.length === 1) fset.value = setores[0];
    } else {
      if (wrap) wrap.style.display = '';
      fset.value = cur2; // restaura valor anterior
    }
  }

  // Datalist setores no form de cliente
  const dlS = document.getElementById('dl-setores');
  if (dlS) dlS.innerHTML = setores.map(s => `<option value="${s}">`).join('');

  // Select despesa setor
  const deS = document.getElementById('de-setor');
  if (deS) {
    const cur3 = deS.value;
    deS.innerHTML = '<option value="">Selecione o setor...</option>'
      + setores.map(s => `<option value="${s}">${s}</option>`).join('');
    deS.value = cur3;
  }

  // Select filtro despesas
  const dFilt = document.getElementById('desp-setor');
  if (dFilt) {
    const cur4 = dFilt.value;
    dFilt.innerHTML = '<option value="">Todos os setores</option>'
      + setores.map(s => `<option value="${s}">${s}</option>`).join('');
    dFilt.value = cur4;
  }

  // Select filtro relatório por setor — não precisa, usa todas
}

// ─────────────────────────────────────────────
// CLOCK
// ─────────────────────────────────────────────
function tick() {
  const n = new Date();
  const c = document.getElementById('clock');
  const d = document.getElementById('dateInfo');
  if (c) c.textContent = n.toLocaleTimeString('pt-BR');
  if (d) d.textContent = n.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
/** Máscara de telefone */
function mPhone(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 11);
  if      (v.length > 6) v = '(' + v.slice(0,2) + ') ' + v.slice(2,7) + '-' + v.slice(7);
  else if (v.length > 2) v = '(' + v.slice(0,2) + ') ' + v.slice(2);
  else if (v.length > 0) v = '(' + v;
  el.value = v;
}

/** Toast notification */
let _toastTimer;
function toast(msg, tipo = 'ok') {
  const t  = document.getElementById('toast');
  const tm = document.getElementById('tmsg');
  if (!t || !tm) return;
  tm.textContent = msg;
  t.className = `toast show ${tipo === 'err' ? 'err' : tipo === 'warn' ? 'bw' : 'ok'}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
window.addEventListener('load', () => {
  tick();
  setInterval(tick, 1000);

  // restaura sessão
  const sess = sessionStorage.getItem('cobr_user') || sessionStorage.getItem('eps_user');
  if (sess) {
    try {
      USER = JSON.parse(sess);
      // normaliza role legado
      if (USER.role === 'dono')   USER.role = 'proprietario';
      if (USER.role === 'vigia')  USER.role = 'cobrador';
      iniciarApp();
    } catch (e) {
      sessionStorage.clear();
    }
  }

  // PWA — registra service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // Quando o SW atualizar, recarrega a página automaticamente para usar o novo código
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'SW_UPDATED') {
        window.location.reload();
      }
    });
  }
});
