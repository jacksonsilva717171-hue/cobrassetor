// ================================================
// EPS – GOOGLE APPS SCRIPT v6
// ================================================

const SHEET_CLIENTES   = 'clientes';
const SHEET_PAGAMENTOS = 'PAGAMENTOS';

const COL_CLI = ['id','nome','tel','cep','rua','num','complemento','bairro','cidade','setor',
                 'vencDia','valor','pix','chavePix','lat','lng','obs','proxVenc','criadoPor','criadoEm',
                 'dataRemarcacao'];
const COL_PAG = ['cid','nome','setor','valor','forma','mesPago','novoPv','data','vigia','origem'];

// Retorna o índice real da coluna lendo o cabeçalho da aba —
// nunca usa índice fixo do array COL_CLI para evitar escrita na coluna errada
function colIdx(header, nome) {
  return header.map(h => String(h).trim().toLowerCase())
               .indexOf(String(nome).trim().toLowerCase());
}

// Acha a coluna real do setor mesmo se o cabeçalho tiver sido renomeado
// (ex: "Setor 02" em vez de "setor") — tenta 'setor' primeiro, depois
// qualquer cabeçalho no formato "Setor N". Sem isso, getClientes(setor),
// atualizaProxVenc e atualizaAbaSetor voltam sempre vazios quando a coluna
// não se chama literalmente "setor" (já aconteceu 2x nesta planilha).
function colIdxSetor(header) {
  const direto = colIdx(header, 'setor');
  if (direto !== -1) return direto;
  return header.findIndex(h => /^[Ss]etor\s*\d+/i.test(String(h).trim()));
}

// Garante que a coluna exista no cabeçalho real da aba — se não existir, adiciona
// no final (nunca desloca colunas existentes). Necessário porque a aba "clientes"
// já existe em produção e não ganha colunas novas do COL_CLI automaticamente
// (isso só acontece quando a aba é criada do zero por getOrCreateSheet).
function ensureHeaderColumn(sheet, header, nomeCol) {
  let idx = colIdx(header, nomeCol);
  if (idx === -1) {
    idx = header.length;
    sheet.getRange(1, idx + 1).setValue(nomeCol);
    // formata a coluna inteira como texto simples — evita o Sheets converter
    // um valor tipo "2026-07-13" em data serial ao gravar via setValue
    sheet.getRange(1, idx + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
    header.push(nomeCol);
  }
  return idx;
}

// ================================================
// ENTRYPOINTS
// ================================================
function doGet(e) {
  let resultado;
  try {
    const acao = e.parameter.acao;
    if      (acao === 'getClientes')     resultado = getClientes(e.parameter.setor || null);
    else if (acao === 'getPagamentos')   resultado = getPagamentos();
    else if (acao === 'getClientesPix')  resultado = getClientesPix(e.parameter.setor || null, e.parameter.vencDia || null);
    else if (acao === 'getStatusPix')    resultado = getStatusPix(e.parameter.setor || null);
    else if (acao === 'getDebugLog')     resultado = getDebugLogRows(parseInt(e.parameter.n) || 5);
    else if (acao === 'getSpreadsheetInfo') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheetPag = ss.getSheetByName(SHEET_PAGAMENTOS);
      resultado = {
        ok: true,
        spreadsheetId: ss.getId(),
        spreadsheetName: ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        pagamentosExiste: !!sheetPag,
        pagamentosTotalLinhas: sheetPag ? sheetPag.getLastRow() - 1 : null,
      };
    }
    else if (acao === 'compararArquivos') resultado = compararArquivosDrive();
    else if (acao === 'investigarDivergenciaCopia') resultado = investigarDivergenciaCopia(e.parameter.idOriginal);
    else if (acao === 'migrarParaOriginal') resultado = migrarParaOriginal(e.parameter.idOriginal);
    else if (acao === 'contarAtrasadosPreto') resultado = contarAtrasadosPreto(e.parameter.idOriginal);
    else if (acao === 'buscarClienteEm') resultado = buscarClienteEm(e.parameter.idPlanilha, e.parameter.id);
    else if (acao === 'removerPagamentos') resultado = removerPagamentos(e.parameter.idOriginal, e.parameter.cids);
    else if (acao === 'criarClienteEm') resultado = criarClienteEm(e.parameter.idPlanilha, e.parameter.id, e.parameter.novoId);
    else if (acao === 'repararSetorVazio') resultado = repararSetorVazio();
    else if (acao === 'testeCadastroSetores') resultado = testeCadastroSetores();
    else if (acao === 'getConfigProp')   resultado = getConfigProp(e.parameter.usuario);
    else if (acao === 'gerarBackup')     resultado = baixarBackupApp();
    else if (acao === 'limparTesteCobraSetor') resultado = limparTesteCobraSetor();
    else resultado = { ok: false, erro: 'Ação desconhecida: ' + acao };
  } catch(err) { resultado = { ok: false, erro: err.toString() }; }
  return jsonResponse(resultado);
}

// Metadados do Drive (criação, modificação, dono, pasta) dos 2 arquivos em
// disputa — pra decidir qual é a fonte de verdade real, sem abrir nada manualmente.
function compararArquivosDrive() {
  const IDS = {
    'EPS_GESTAO_final (1) — ligado ao Apps Script': '1HBDTETxDn0cu4-jxjn39a4IqzbrdG_1Uljt_wGj4xOU',
    'EPS GESTAO — a que o usuário abre manualmente': '1IFUcC9-ptG9WkOOMDGLtRXi5J0sV-TvY5V7XaaJcG4c',
  };
  const out = {};
  Object.keys(IDS).forEach(label => {
    try {
      const f = Drive.Files.get(IDS[label], {
        fields: 'id,name,createdTime,modifiedTime,owners,parents,trashed,shared,lastModifyingUser'
      });
      out[label] = {
        id: f.id,
        name: f.name,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        lastModifyingUser: f.lastModifyingUser ? (f.lastModifyingUser.displayName || f.lastModifyingUser.emailAddress) : null,
        owners: (f.owners || []).map(o => o.displayName || o.emailAddress),
        trashed: f.trashed,
        parents: f.parents,
      };
    } catch (e) {
      out[label] = { erro: e.toString() };
    }
  });
  return { ok: true, arquivos: out };
}

// ================================================
// INVESTIGAR TUDO QUE FOI GRAVADO NA CÓPIA "EPS_GESTAO_final (1)" DESDE QUE
// ELA VIROU A PLANILHA LIGADA AO APPS SCRIPT (22/07/2026 15:38 -03) — SÓ
// LEITURA, NÃO ALTERA NADA (nem na cópia, nem no original)
// ================================================
// idOriginal: ID da planilha "EPS GESTAO" original, pra abrir só-leitura via
// SpreadsheetApp.openById() e comparar clientes (achar quem é novo/editado
// na cópia e não existe — ou existe diferente — no original).
function investigarDivergenciaCopia(idOriginal) {
  const CUTOFF_ISO = '2026-07-22T18:38:00Z'; // 22/07 15:38 -03, minuto do commit "novo deployment"
  const cutoff = new Date(CUTOFF_ISO);

  const ssCopia = SpreadsheetApp.getActiveSpreadsheet();

  // ---- 1) PAGAMENTOS da cópia, a partir do corte ----
  const sheetPagCopia = ssCopia.getSheetByName(SHEET_PAGAMENTOS);
  const rowsPag = sheetPagCopia ? sheetPagCopia.getDataRange().getValues() : [[]];
  const headerPag = rowsPag[0] || [];
  const pCid = colIdx(headerPag, 'cid'), pNome = colIdx(headerPag, 'nome'),
        pSetor = colIdx(headerPag, 'setor'), pValor = colIdx(headerPag, 'valor'),
        pMesPago = colIdx(headerPag, 'mesPago'), pNovoPv = colIdx(headerPag, 'novoPv'),
        pData = colIdx(headerPag, 'data'), pForma = colIdx(headerPag, 'forma'),
        pVigia = colIdx(headerPag, 'vigia'), pOrigem = colIdx(headerPag, 'origem');

  const pagamentosNovos = [];
  for (let i = 1; i < rowsPag.length; i++) {
    const row = rowsPag[i];
    const dataRaw = pData >= 0 ? row[pData] : null;
    const data = dataRaw ? new Date(dataRaw) : null;
    if (!data || isNaN(data.getTime()) || data < cutoff) continue;
    pagamentosNovos.push({
      linha: i + 1,
      cid: pCid >= 0 ? row[pCid] : '', nome: pNome >= 0 ? row[pNome] : '',
      setor: pSetor >= 0 ? row[pSetor] : '', valor: pValor >= 0 ? row[pValor] : '',
      forma: pForma >= 0 ? row[pForma] : '', mesPago: pMesPago >= 0 ? row[pMesPago] : '',
      novoPv: pNovoPv >= 0 ? row[pNovoPv] : '', data: dataRaw,
      vigia: pVigia >= 0 ? row[pVigia] : '', origem: pOrigem >= 0 ? row[pOrigem] : '',
    });
  }
  pagamentosNovos.sort((a, b) => new Date(a.data) - new Date(b.data));

  const resultado = {
    ok: true,
    corte: CUTOFF_ISO,
    pagamentosNovosNaCopia: pagamentosNovos,
    totalPagamentosNovos: pagamentosNovos.length,
  };

  // ---- 2) e 3) clientes novos/editados na cópia vs original ----
  if (!idOriginal) {
    resultado.avisoClientes = 'idOriginal não informado — pulei a comparação de clientes. Chame de novo com ?idOriginal=<ID>.';
    return resultado;
  }

  let ssOriginal;
  try {
    ssOriginal = SpreadsheetApp.openById(idOriginal);
  } catch (e) {
    resultado.avisoClientes = 'Não consegui abrir a planilha original com esse ID: ' + e.toString();
    return resultado;
  }

  const cliCopia = ssCopia.getSheetByName(SHEET_CLIENTES).getDataRange().getValues();
  const headerCliCopia = cliCopia[0];
  const cliOriginalSheet = ssOriginal.getSheetByName(SHEET_CLIENTES);
  if (!cliOriginalSheet) {
    resultado.avisoClientes = 'Aba "clientes" não encontrada na planilha original.';
    return resultado;
  }
  const cliOriginal = cliOriginalSheet.getDataRange().getValues();
  const headerCliOriginal = cliOriginal[0];

  function chave(header, row) {
    const cId = colIdx(header, 'id'), cSetor = colIdxSetor(header);
    return String(row[cId] || '').trim() + '|' + (cSetor >= 0 ? String(row[cSetor] || '').trim() : '');
  }
  function paraObjComparavel(header, row) {
    const obj = {};
    header.forEach((h, i) => { obj[String(h).trim()] = row[i]; });
    return obj;
  }

  const origById = {};
  for (let i = 1; i < cliOriginal.length; i++) {
    const id = String(cliOriginal[i][colIdx(headerCliOriginal, 'id')] || '').trim();
    if (!id) continue;
    origById[chave(headerCliOriginal, cliOriginal[i])] = paraObjComparavel(headerCliOriginal, cliOriginal[i]);
  }

  const clientesNovos = [];
  const clientesDiferentes = [];
  for (let i = 1; i < cliCopia.length; i++) {
    const id = String(cliCopia[i][colIdx(headerCliCopia, 'id')] || '').trim();
    if (!id) continue;
    const k = chave(headerCliCopia, cliCopia[i]);
    const objCopia = paraObjComparavel(headerCliCopia, cliCopia[i]);
    const objOrig = origById[k];

    if (!objOrig) {
      clientesNovos.push(objCopia);
      continue;
    }
    // Compara campo a campo (ignora diferença de tipo trivial: número vs texto do mesmo valor)
    const diffs = {};
    Object.keys(objCopia).forEach(campo => {
      const vCopia = String(objCopia[campo] == null ? '' : objCopia[campo]).trim();
      const vOrig  = String(objOrig[campo]  == null ? '' : objOrig[campo]).trim();
      if (vCopia !== vOrig) diffs[campo] = { copia: objCopia[campo], original: objOrig[campo] };
    });
    if (Object.keys(diffs).length > 0) {
      clientesDiferentes.push({ id: id, nome: objCopia.nome, setor: objCopia.setor, diffs: diffs });
    }
  }

  resultado.clientesNovosNaCopia = clientesNovos;
  resultado.totalClientesNovos = clientesNovos.length;
  resultado.clientesDiferentesEntreCopiaEOriginal = clientesDiferentes;
  resultado.totalClientesDiferentes = clientesDiferentes.length;

  return resultado;
}

// ================================================
// MIGRAÇÃO ÚNICA: leva os 3 pagamentos + 1 cliente novo gravados na cópia
// (desde 22/07 15:38) de volta pra "EPS GESTAO" original — dados hardcoded,
// já confirmados por investigarDivergenciaCopia(). Idempotente: pode rodar
// mais de uma vez sem duplicar nada (confere por cid+data antes de gravar).
// ================================================
function migrarParaOriginal(idOriginal) {
  if (!idOriginal) return { ok: false, erro: 'idOriginal não informado.' };

  const PAGAMENTOS_MIGRAR = [
    { cid: 'EPS2-5755', nome: 'HARTMUT',   setor: 'Setor 02', valor: 50, forma: 'dinheiro', mesPago: 202606, novoPv: 202607, data: '2026-07-22T21:11:47.794Z', vigia: 'preto', origem: '' },
    { cid: 'EPS18743',  nome: 'Jaqueline', setor: 'Setor 02', valor: 50, forma: 'dinheiro', mesPago: 202607, novoPv: 202608, data: '2026-07-23T18:36:00.924Z', vigia: 'preto', origem: '' },
    { cid: 'EPS2-5593', nome: 'ARLETE',    setor: 'Setor 02', valor: 35, forma: 'dinheiro', mesPago: 202607, novoPv: 202608, data: '2026-07-23T19:05:59.873Z', vigia: 'preto', origem: '' },
  ];
  const CLIENTE_NOVO = {
    id: 'EPS18740', nome: 'thiane', tel: '(47) 99265-0588', cep: '', rua: '02-09 - MANOEL FERNANDES', num: 310,
    complemento: '', bairro: 'centro', cidade: 'navegantes', setor: 'Setor 02', vencDia: 15, valor: 50,
    pix: 'nao', chavePix: '', lat: '', lng: '', obs: '', proxVenc: 0, criadoPor: 'preto',
    criadoEm: '2026-07-22T19:28:06.288Z', dataRemarcacao: '',
  };

  const relatorio = { pagamentosMigrados: [], pagamentosJaExistiam: [], proxVencAtualizados: [], clienteNovo: null, avisos: [] };

  const ssOrig = SpreadsheetApp.openById(idOriginal);

  // Mapeia um valor de campo pro header real da aba, tolerando a coluna de
  // setor renomeada (ex: "Setor 02") em vez de "setor" literal.
  function valorParaHeader(obj, header) {
    return header.map(h => {
      const campo = String(h).trim();
      if (/^[Ss]etor\s*\d+/i.test(campo) || campo.toLowerCase() === 'setor') return obj.setor !== undefined ? obj.setor : '';
      return obj[campo] !== undefined ? obj[campo] : '';
    });
  }

  // ---- PAGAMENTOS ----
  const sheetPagOrig = ssOrig.getSheetByName(SHEET_PAGAMENTOS);
  const rowsPagOrig  = sheetPagOrig.getDataRange().getValues();
  const headerPagOrig = rowsPagOrig[0];
  const pCidOrig  = colIdx(headerPagOrig, 'cid');
  const pDataOrig = colIdx(headerPagOrig, 'data');

  const existentes = new Set();
  for (let i = 1; i < rowsPagOrig.length; i++) {
    const cid = String(rowsPagOrig[i][pCidOrig] || '').trim();
    const dataRaw = pDataOrig >= 0 ? rowsPagOrig[i][pDataOrig] : '';
    const dataStr = dataRaw instanceof Date ? dataRaw.toISOString() : String(dataRaw || '');
    existentes.add(cid + '|' + dataStr);
  }

  PAGAMENTOS_MIGRAR.forEach(p => {
    if (existentes.has(p.cid + '|' + p.data)) {
      relatorio.pagamentosJaExistiam.push(p.cid);
      return;
    }
    sheetPagOrig.appendRow(valorParaHeader(p, headerPagOrig));
    relatorio.pagamentosMigrados.push(p.cid);
  });
  SpreadsheetApp.flush();

  // ---- proxVenc dos 3 clientes ----
  const sheetCliOrig = ssOrig.getSheetByName(SHEET_CLIENTES);
  const rowsCliOrig  = sheetCliOrig.getDataRange().getValues();
  const headerCliOrig = rowsCliOrig[0];
  const cIdOrig = colIdx(headerCliOrig, 'id');
  const cProxVencOrig = colIdx(headerCliOrig, 'proxVenc');

  PAGAMENTOS_MIGRAR.forEach(p => {
    let achou = false;
    for (let i = 1; i < rowsCliOrig.length; i++) {
      if (String(rowsCliOrig[i][cIdOrig] || '').trim() === p.cid) {
        achou = true;
        const atual = parseInt(rowsCliOrig[i][cProxVencOrig]) || 0;
        if (atual < p.novoPv) {
          sheetCliOrig.getRange(i + 1, cProxVencOrig + 1).setValue(p.novoPv);
          relatorio.proxVencAtualizados.push({ cid: p.cid, de: atual, para: p.novoPv });
        } else {
          relatorio.avisos.push(p.cid + ': proxVenc no original (' + atual + ') já é >= ' + p.novoPv + ', não sobrescrevi.');
        }
        break;
      }
    }
    if (!achou) relatorio.avisos.push(p.cid + ': cliente não encontrado na aba clientes do original.');
  });

  // ---- cliente novo ----
  let jaExiste = false;
  for (let i = 1; i < rowsCliOrig.length; i++) {
    if (String(rowsCliOrig[i][cIdOrig] || '').trim() === CLIENTE_NOVO.id) { jaExiste = true; break; }
  }
  if (jaExiste) {
    relatorio.clienteNovo = 'já existia no original, não dupliquei';
  } else {
    sheetCliOrig.appendRow(valorParaHeader(CLIENTE_NOVO, headerCliOrig));
    relatorio.clienteNovo = 'migrado com sucesso';
  }
  SpreadsheetApp.flush();

  relatorio.ok = true;
  return relatorio;
}

// ================================================
// RECONTAGEM REAL de "em atraso" (Setor 02+13) direto numa planilha
// arbitrária (aberta por ID, não necessariamente a que o script está
// vinculado) — mesma lógica de st()/_stCalc() de js/config.js.
// ================================================
function contarAtrasadosPreto(idPlanilha) {
  const ss = idPlanilha ? SpreadsheetApp.openById(idPlanilha) : SpreadsheetApp.getActiveSpreadsheet();
  const sheetCli = ss.getSheetByName(SHEET_CLIENTES);
  const rows = sheetCli.getDataRange().getValues();
  const header = rows[0];

  const cId = colIdx(header, 'id');
  const cNome = colIdx(header, 'nome');
  const cSetor = colIdxSetor(header);
  const cProxVenc = colIdx(header, 'proxVenc');
  const cVencDia = colIdx(header, 'vencDia');
  const cDataRemarc = colIdx(header, 'dataRemarcacao');

  const SETORES_PRETO = ['2', '13'];
  const normSetor = v => { const m = String(v || '').match(/\d+/); return m ? String(parseInt(m[0], 10)) : ''; };

  const hoje = new Date();
  const yh = hoje.getFullYear() * 100 + (hoje.getMonth() + 1);
  const dh = hoje.getDate();
  const hojeZero = new Date(); hojeZero.setHours(0, 0, 0, 0);

  let totalAtivos = 0, atrasados = 0, atrasadosZerados = 0, atrasadosComPagamentoAntigo = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = String(row[cId] || '').trim();
    if (!id) continue;
    const setorRaw = cSetor >= 0 ? row[cSetor] : '';
    if (SETORES_PRETO.indexOf(normSetor(setorRaw)) === -1) continue;

    totalAtivos++;

    const dataRemarc = cDataRemarc >= 0 ? String(row[cDataRemarc] || '').trim() : '';
    if (dataRemarc) {
      const ret = new Date(dataRemarc + 'T00:00:00');
      if (!isNaN(ret.getTime()) && ret > hojeZero) continue;
    }

    const proxVencRaw = cProxVenc >= 0 ? row[cProxVenc] : '';
    const vencDiaRaw = cVencDia >= 0 ? row[cVencDia] : '';
    const pv = parseInt(String(proxVencRaw || '').replace(/\..*$/, '')) || yh;
    const vd = parseInt(String(vencDiaRaw || '').replace(/\..*$/, '')) || 1;

    let statusCalc;
    if (pv < yh) statusCalc = 'atrasado';
    else if (pv > yh) statusCalc = 'adiantado';
    else if (vd === dh) statusCalc = 'hoje';
    else if (vd < dh) statusCalc = 'atrasado';
    else statusCalc = 'ok';

    if (statusCalc === 'atrasado') {
      atrasados++;
      const proxVencNum = parseInt(String(proxVencRaw || '').replace(/\..*$/, '')) || 0;
      if (proxVencNum === 0) atrasadosZerados++; else atrasadosComPagamentoAntigo++;
    }
  }

  return {
    ok: true,
    planilha: ss.getName(),
    totalAtivos: totalAtivos,
    atrasados: atrasados,
    atrasadosZerados: atrasadosZerados,
    atrasadosComPagamentoAntigo: atrasadosComPagamentoAntigo,
  };
}

// Leitura só-consulta: acha um cliente por id numa planilha arbitrária
// (aberta por ID), pra conferência antes de criar/apagar qualquer coisa.
function buscarClienteEm(idPlanilha, id) {
  if (!idPlanilha || !id) return { ok: false, erro: 'idPlanilha ou id não informado.' };
  const ss = SpreadsheetApp.openById(idPlanilha);
  const sheet = ss.getSheetByName(SHEET_CLIENTES);
  const rows = sheet.getDataRange().getValues();
  const header = rows[0];
  const cId = colIdx(header, 'id');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][cId] || '').trim() === id) {
      const obj = {};
      header.forEach((h, j) => { obj[String(h).trim()] = rows[i][j]; });
      return { ok: true, encontrado: true, planilha: ss.getName(), linha: i + 1, cliente: obj };
    }
  }
  return { ok: true, encontrado: false, planilha: ss.getName() };
}

// Remove linhas específicas de PAGAMENTOS na planilha original, casando por
// cid + data EXATOS (não remove por cid sozinho, pra não arriscar apagar
// outro pagamento legítimo do mesmo id por engano). Usado pra descartar os
// pagamentos do HARTMUT e da ARLETE (clientes excluídos há tempo, que não
// devem ser recriados).
function removerPagamentos(idOriginal, cidsCsv) {
  if (!idOriginal) return { ok: false, erro: 'idOriginal não informado.' };
  // cid -> data exata (mesmos valores gravados por migrarParaOriginal)
  const CONHECIDOS = {
    'EPS2-5755': '2026-07-22T21:11:47.794Z',
    'EPS2-5593': '2026-07-23T19:05:59.873Z',
  };
  const cids = (cidsCsv || Object.keys(CONHECIDOS).join(',')).split(',').map(s => s.trim()).filter(Boolean);

  const ss = SpreadsheetApp.openById(idOriginal);
  const sheet = ss.getSheetByName(SHEET_PAGAMENTOS);
  const rows = sheet.getDataRange().getValues();
  const header = rows[0];
  const pCid = colIdx(header, 'cid');
  const pData = colIdx(header, 'data');

  const removidos = [];
  const naoAchados = [];
  // de baixo pra cima, pra deleteRow não bagunçar os índices das linhas seguintes
  for (let i = rows.length - 1; i >= 1; i--) {
    const cid = String(rows[i][pCid] || '').trim();
    if (cids.indexOf(cid) === -1) continue;
    const dataAlvo = CONHECIDOS[cid];
    const dataRaw = rows[i][pData];
    const dataStr = dataRaw instanceof Date ? dataRaw.toISOString() : String(dataRaw || '');
    if (dataAlvo && dataStr !== dataAlvo) continue; // não é a linha específica que migramos
    sheet.deleteRow(i + 1);
    removidos.push(cid + ' (linha ' + (i + 1) + ')');
  }
  cids.forEach(c => { if (!removidos.some(r => r.indexOf(c) === 0)) naoAchados.push(c); });

  return { ok: true, removidos: removidos, naoEncontrados: naoAchados };
}

// Cria um cliente na planilha de destino (idPlanilha), usando os dados
// completos dele lidos da planilha ATUAL (a cópia, getActiveSpreadsheet()).
// Não duplica se já existir no destino.
function criarClienteEm(idPlanilha, id, novoId) {
  if (!idPlanilha || !id) return { ok: false, erro: 'idPlanilha ou id não informado.' };
  const idDestino = novoId || id; // permite gravar sob um id diferente (ex: colisão com outro cliente já existente no destino)

  const ssOrigemDados = SpreadsheetApp.getActiveSpreadsheet(); // a cópia
  const sheetOrigem = ssOrigemDados.getSheetByName(SHEET_CLIENTES);
  const rowsOrigem = sheetOrigem.getDataRange().getValues();
  const headerOrigem = rowsOrigem[0];
  const cIdOrigem = colIdx(headerOrigem, 'id');

  let dadosCliente = null;
  for (let i = 1; i < rowsOrigem.length; i++) {
    if (String(rowsOrigem[i][cIdOrigem] || '').trim() === id) {
      dadosCliente = {};
      headerOrigem.forEach((h, j) => { dadosCliente[String(h).trim()] = rowsOrigem[i][j]; });
      break;
    }
  }
  if (!dadosCliente) return { ok: false, erro: 'Cliente ' + id + ' não encontrado na cópia (planilha atual).' };

  // Normaliza o campo de setor pro nome genérico "setor", não importa como
  // a cópia chamava a coluna (ex: "Setor 02").
  const cSetorOrigemIdx = colIdxSetor(headerOrigem);
  if (dadosCliente.setor === undefined && cSetorOrigemIdx >= 0) {
    dadosCliente.setor = dadosCliente[headerOrigem[cSetorOrigemIdx]];
  }

  const ssDestino = SpreadsheetApp.openById(idPlanilha);
  const sheetDestino = ssDestino.getSheetByName(SHEET_CLIENTES);
  const rowsDestino = sheetDestino.getDataRange().getValues();
  const headerDestino = rowsDestino[0];
  const cIdDestino = colIdx(headerDestino, 'id');

  for (let i = 1; i < rowsDestino.length; i++) {
    if (String(rowsDestino[i][cIdDestino] || '').trim() === idDestino) {
      return { ok: true, criado: false, aviso: 'Já existe alguém com id ' + idDestino + ' no destino (linha ' + (i + 1) + '), não sobrescrevi nem dupliquei.' };
    }
  }

  const novaLinha = headerDestino.map(h => {
    const campo = String(h).trim();
    if (campo.toLowerCase() === 'id') return idDestino;
    if (/^[Ss]etor\s*\d+/i.test(campo) || campo.toLowerCase() === 'setor') return dadosCliente.setor !== undefined ? dadosCliente.setor : '';
    return dadosCliente[campo] !== undefined ? dadosCliente[campo] : '';
  });
  sheetDestino.appendRow(novaLinha);
  SpreadsheetApp.flush();

  return { ok: true, criado: true, linha: sheetDestino.getLastRow(), dadosUsados: dadosCliente };
}

// Leitura só-consulta da aba DEBUG_LOG (não cria a aba se não existir —
// diferente de getOrCreateSheet — pra dizer com certeza se ela já foi
// criada ou não por alguma chamada de doPost real).
function getDebugLogRows(n) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('DEBUG_LOG');
  if (!sheet) return { ok: true, existe: false, totalLinhas: 0, ultimas: [] };
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const dataRows = rows.slice(1);
  const ultimas = dataRows.slice(-n).map(r => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i]; });
    return obj;
  });
  return { ok: true, existe: true, totalLinhas: dataRows.length, ultimas: ultimas };
}

function doPost(e) {
  let resultado;
  let body  = {};
  let acao  = '';
  const etapas = [];
  try {
    body = JSON.parse(e.postData.contents);
    acao = body.acao;
    etapas.push('doPost recebido, acao="' + acao + '"');
    if      (acao === 'addCliente')            resultado = addCliente(body);
    else if (acao === 'editCliente')           resultado = editCliente(body);
    else if (acao === 'delCliente')            resultado = delCliente(body.id);
    else if (acao === 'remarcarCliente')       resultado = remarcarCliente(body);
    else if (acao === 'addPagamento')          resultado = addPagamento(body, etapas);
    else if (acao === 'confirmarPagamentoPix') resultado = confirmarPagamentoPix(body, etapas);
    else if (acao === 'importarLoteSetores')   resultado = importarLoteSetores(body);
    else if (acao === 'salvarConfigProp')      resultado = salvarConfigProp(body);
    else { resultado = { ok: false, erro: 'Ação desconhecida: ' + acao }; etapas.push('ação desconhecida'); }
    etapas.push('resultado final: ' + JSON.stringify(resultado));
  } catch(err) {
    resultado = { ok: false, erro: err.toString() };
    etapas.push('EXCEÇÃO em doPost: ' + err.toString() + (err.stack ? (' | stack: ' + err.stack) : ''));
  }
  // payload de importarLoteSetores tem centenas de linhas — loga só um resumo,
  // pra não inflar a aba DEBUG_LOG com o CSV inteiro em JSON
  const bodyParaLog = (acao === 'importarLoteSetores')
    ? Object.assign({}, body, { novosClientes: '[' + (body.novosClientes || []).length + ' registros omitidos do log]' })
    : body;
  debugLog(acao, bodyParaLog, etapas, (resultado && resultado.ok === false) ? resultado.erro : '');
  return jsonResponse(resultado);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ================================================
// DEBUG_LOG — diagnóstico temporário de doPost (addCliente/editCliente/
// delCliente/remarcarCliente/addPagamento/confirmarPagamentoPix)
// ================================================
// Grava uma linha por chamada recebida na aba "DEBUG_LOG": timestamp, ação,
// payload bruto (JSON) e o passo-a-passo do que aconteceu (etapas), incluindo
// exceções. Serve pra investigar o caso do pagamento de EPS18743 (Jaqueline)
// que terminou "Completed" sem erro mas não apareceu em PAGAMENTOS — sem
// acesso a Cloud Logging, a própria planilha vira o log. Envolto em
// try/catch pra NUNCA quebrar a resposta real ao app, mesmo se o log falhar.
function debugLog(acao, payload, etapas, erro) {
  try {
    const sheet = getOrCreateSheet('DEBUG_LOG', ['timestamp', 'acao', 'payload', 'etapas', 'erro']);
    sheet.appendRow([
      new Date(),
      acao || '',
      JSON.stringify(payload || {}),
      (etapas || []).join(' | '),
      erro || '',
    ]);
  } catch (e) {
    Logger.log('Falha ao escrever DEBUG_LOG: ' + e.message);
  }
}

// ================================================
// CLIENTES
// ================================================
function getClientes(setor) {
  const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const data   = rows.slice(1).map(row => rowToObj(header, row)).filter(c => c.id);

  // A coluna 'setor' pode ter sido renomeada na planilha (ex: "Setor 02") —
  // sem esse fallback, c.setor fica sempre vazio e o filtro por setor nunca
  // casa com nada (getClientes(setor) voltava sempre com 0 resultados).
  const cSetor       = colIdxSetor(header);
  const nomeColSetor = cSetor >= 0 ? header[cSetor] : null;
  function setorDe(c) {
    if (c.setor) return String(c.setor).trim();
    return nomeColSetor ? String(c[nomeColSetor] || '').trim() : '';
  }

  const setorNorm = setor ? setor.trim().toLowerCase() : null;
  const result = setorNorm
    ? data.filter(c => setorDe(c).toLowerCase() === setorNorm)
    : data;

  result.forEach(c => {
    c.setor    = setorDe(c); // normaliza a chave 'setor' na resposta, mesmo com header renomeado
    c.vencDia  = parseInt(c.vencDia)  || 1;
    c.valor    = parseFloat(c.valor)  || 0;
    c.proxVenc = parseInt(c.proxVenc) || 0;
    c.lat      = parseFloat(c.lat)    || null;
    c.lng      = parseFloat(c.lng)    || null;
    // dataRemarcacao: normaliza para string 'yyyy-MM-dd' — o Sheets pode devolver
    // a célula como objeto Date dependendo do formato aplicado na coluna
    if (c.dataRemarcacao instanceof Date) {
      c.dataRemarcacao = Utilities.formatDate(c.dataRemarcacao, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else if (c.dataRemarcacao) {
      c.dataRemarcacao = String(c.dataRemarcacao);
    } else {
      c.dataRemarcacao = '';
    }
  });
  return { ok: true, data: result };
}

// Serializa escritas concorrentes na planilha "clientes"/"PAGAMENTOS" — duas
// execuções simultâneas (ex: notebook e celular cadastrando ao mesmo tempo,
// ou dois usuários em setores diferentes) podiam se sobrepor silenciosamente:
// appendRow/setValues não são atômicos entre execuções distintas do Apps
// Script sem lock. Reforço defensivo (mesmo padrão já usado em addPagamento);
// waitLock(30s): se não conseguir o lock nesse tempo, falha visível em vez
// de arriscar gravação corrompida.
function comLockDeEscrita(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Monta a linha pra gravar/atualizar em "clientes" usando os NOMES reais do
// cabeçalho — mas a coluna de setor precisa de tratamento especial: nesta
// planilha o cabeçalho real da coluna foi renomeado pra algo tipo "Setor 02"
// (ver colIdxSetor), enquanto o app sempre manda a chave genérica "setor" no
// payload. Usar dados[header[i]] direto pra essa coluna sempre lê undefined
// e grava a célula vazia — CAUSA RAIZ real de EPS18782/EPS18785 e outros 44
// clientes: a linha era gravada certinha, só a coluna setor ficava em
// branco, então o cliente nunca aparecia em nenhum filtro por setor (sumia
// "na prática" mesmo existindo fisicamente na aba). Mesmo tratamento que já
// existia em criarClienteEm/importarLoteSetores, só que nunca tinha sido
// aplicado em addCliente/editCliente. linhaExistente: valores atuais da
// linha, usados como fallback em edição (não apaga um campo que não veio no
// payload).
function montarLinhaCliente(header, dados, linhaExistente) {
  const cSetor = colIdxSetor(header);
  return header.map((col, idx) => {
    if (idx === cSetor) {
      if (dados.setor !== undefined) return dados.setor;
      return linhaExistente ? linhaExistente[idx] : '';
    }
    if (dados[col] !== undefined) return dados[col];
    return linhaExistente ? linhaExistente[idx] : '';
  });
}

function addCliente(dados) {
  if (!dados || !dados.id)   return { ok: false, erro: 'addCliente: id não informado' };
  if (!dados.nome)           return { ok: false, erro: 'addCliente: nome não informado' };

  return comLockDeEscrita(() => {
    const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
    const rows   = sheet.getDataRange().getValues();
    const header = rows[0];
    const cId    = colIdx(header, 'id');
    const idCol  = cId >= 0 ? cId : 0;
    const ids    = rows.slice(1).map(r => String(r[idCol]));
    if (ids.includes(String(dados.id))) return editClienteImpl(dados, sheet, rows, header);

    // usa cabeçalho real pra montar a linha, com tratamento especial da coluna setor
    const row = montarLinhaCliente(header, dados, null);
    const linhaAntes = sheet.getLastRow();
    sheet.appendRow(row);
    SpreadsheetApp.flush(); // força a gravação antes de conferir — evita falso positivo por escrita em lote (mesmo tipo de bug já visto em addPagamento)
    const linhaDepois = sheet.getLastRow();
    if (linhaDepois <= linhaAntes) {
      return { ok: false, erro: 'addCliente: gravação não persistiu (linha não aumentou; antes=' + linhaAntes + ' depois=' + linhaDepois + ')' };
    }
    // confere que a linha gravada tem mesmo o id esperado — pega o caso de
    // uma execução concorrente ter escrito por cima antes do flush
    const idGravado = String(sheet.getRange(linhaDepois, idCol + 1).getValue());
    if (idGravado !== String(dados.id)) {
      return { ok: false, erro: 'addCliente: linha gravada não confere (esperado id=' + dados.id + ', encontrado "' + idGravado + '" na linha ' + linhaDepois + ')' };
    }

    if (dados.setor) atualizaAbaSetor(dados.setor);
    return { ok: true };
  });
}

function editCliente(dados) {
  return comLockDeEscrita(() => {
    const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
    const rows   = sheet.getDataRange().getValues();
    const header = rows[0];
    return editClienteImpl(dados, sheet, rows, header);
  });
}

// Núcleo de editCliente sem lock próprio — usado tanto por editCliente
// (adquire o lock) quanto por addCliente quando o id já existe (já está
// dentro do lock de addCliente; pegar o lock de novo aqui travaria).
function editClienteImpl(dados, sheet, rows, header) {
  const cId   = colIdx(header, 'id');
  const idCol = cId >= 0 ? cId : 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) === String(dados.id)) {
      const row = montarLinhaCliente(header, dados, rows[i]);
      sheet.getRange(i+1, 1, 1, row.length).setValues([row]);
      SpreadsheetApp.flush();
      if (dados.setor) atualizaAbaSetor(dados.setor);
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Cliente não encontrado: ' + dados.id };
}

function delCliente(id) {
  return comLockDeEscrita(() => {
    const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
    const rows   = sheet.getDataRange().getValues();
    const header = rows[0];
    const cId    = colIdx(header, 'id');
    const idCol  = cId >= 0 ? cId : 0;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol]) === String(id)) { sheet.deleteRow(i+1); return { ok: true }; }
    }
    return { ok: false, erro: 'Cliente não encontrado: ' + id };
  });
}

// Ação dedicada de remarcação: grava (ou limpa, se dataRemarcacao vier vazio)
// SOMENTE a célula da coluna dataRemarcacao da linha do cliente — nunca toca
// no resto da linha, então não corre o risco de sobrescrever outros campos
// com um snapshot local desatualizado (o mesmo tipo de bug já visto em
// editCliente/addPagamento quando o payload enviado estava incompleto/velho).
function remarcarCliente(dados) {
  if (!dados.id) return { ok: false, erro: 'id não informado' };

  return comLockDeEscrita(() => {
    const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
    const rows   = sheet.getDataRange().getValues();
    const header = rows[0];
    const cDataRem = ensureHeaderColumn(sheet, header, 'dataRemarcacao');
    const cId    = colIdx(header, 'id');
    const idCol  = cId >= 0 ? cId : 0;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol]) === String(dados.id)) {
        const range = sheet.getRange(i + 1, cDataRem + 1);
        range.setNumberFormat('@'); // reforça texto puro nesta célula específica
        range.setValue(dados.dataRemarcacao || '');
        SpreadsheetApp.flush();
        return { ok: true };
      }
    }
    return { ok: false, erro: 'Cliente não encontrado: ' + dados.id };
  });
}

// ================================================
// PAGAMENTOS
// ================================================
function getPagamentos() {
  const sheet  = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const data   = rows.slice(1).map(row => rowToObj(header, row)).filter(p => p.cid);
  data.forEach(p => {
    p.valor   = parseFloat(p.valor)  || 0;
    p.mesPago = parseInt(p.mesPago)  || 0;
    p.novoPv  = parseInt(p.novoPv)   || 0;
  });
  return { ok: true, data };
}

function addPagamento(dados, etapas) {
  etapas = etapas || [];
  return comLockDeEscrita(() => {
    try {
      const sheet = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
      const linhaAntes = sheet.getLastRow();
      sheet.appendRow(COL_PAG.map(col => dados[col] !== undefined ? dados[col] : ''));
      SpreadsheetApp.flush(); // força a gravação antes de checar getLastRow, evita falso negativo por escrita em lote
      const linhaDepois = sheet.getLastRow();
      const escreveuOk = linhaDepois > linhaAntes;
      etapas.push('escreveu em PAGAMENTOS: ' + (escreveuOk ? ('sim, linha ' + linhaDepois) : 'NÃO (linha não aumentou! antes=' + linhaAntes + ' depois=' + linhaDepois + ')'));

      const okProxVenc = atualizaProxVenc(dados.cid, dados.novoPv, etapas);
      etapas.push('atualizou proxVenc: ' + (okProxVenc ? 'sim' : 'não'));

      return { ok: true };
    } catch (e) {
      etapas.push('EXCEÇÃO dentro de addPagamento: ' + e.toString() + (e.stack ? (' | stack: ' + e.stack) : ''));
      throw e; // deixa doPost capturar, registrar no DEBUG_LOG e responder erro ao app
    }
  });
}

// CORRIGIDO (2x): (1) usa colIdxSetor(header) pra achar a coluna do setor
// mesmo renomeada (ex: "Setor 02") — antes usava colIdx(header,'setor') puro,
// que voltava -1 e nunca chamava atualizaAbaSetor. (2) usa colIdx(header,'id')
// pra achar a coluna do id — antes comparava rows[i][0] (coluna 0 fixa), que
// silenciosamente não atualiza NADA (sem erro, sem log) se a coluna 'id' não
// for literalmente a primeira da aba clientes.
function atualizaProxVenc(id, novoPv, etapas) {
  etapas = etapas || [];
  const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const cId    = colIdx(header, 'id');
  const cPv    = colIdx(header, 'proxVenc');
  const cSetor = colIdxSetor(header);
  if (cId === -1) { etapas.push('ERRO: coluna id não encontrada em clientes'); Logger.log('ERRO: coluna id não encontrada'); return false; }
  if (cPv === -1) { etapas.push('ERRO: coluna proxVenc não encontrada em clientes'); Logger.log('ERRO: coluna proxVenc não encontrada'); return false; }
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][cId]) === String(id)) {
      sheet.getRange(i+1, cPv+1).setValue(novoPv);
      etapas.push('linha encontrada em clientes: sim (linha ' + (i+1) + ', id=' + id + '), proxVenc gravado=' + novoPv);
      const setor = cSetor >= 0 ? rows[i][cSetor] : null;
      if (setor) atualizaAbaSetor(String(setor));
      return true;
    }
  }
  etapas.push('linha encontrada em clientes: não (id="' + id + '" não existe na aba clientes)');
  return false;
}

// ================================================
// ABAS POR SETOR
// ================================================
function atualizaAbaSetor(setor) {
  try {
    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    let tab   = ss.getSheetByName(setor);
    if (!tab) {
      tab = ss.insertSheet(setor);
      tab.getRange(1,1,1,COL_CLI.length).setValues([COL_CLI]);
      tab.getRange(1,1,1,COL_CLI.length).setFontWeight('bold').setBackground('#0c1028').setFontColor('#00cfff');
      tab.setFrozenRows(1);
    } else {
      if (tab.getLastRow() > 1)
        tab.getRange(2,1,tab.getLastRow()-1,tab.getLastColumn()).clearContent();
    }
    const sheetCli = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
    const rows     = sheetCli.getDataRange().getValues();
    const header   = rows[0];
    // Garante que a aba de setor já criada antes desta versão acompanhe
    // colunas novas do cabeçalho principal (ex: dataRemarcacao)
    if (tab.getLastColumn() < header.length) {
      tab.getRange(1, 1, 1, header.length).setValues([header]);
    }
    // CORRIGIDO: usa colIdxSetor (com fallback "Setor N") em vez de colIdx
    // puro — a coluna real da aba "clientes" está renomeada para "Setor 02"
    const cSetor = colIdxSetor(header);
    if (cSetor === -1) return;
    const setorRows = rows.slice(1).filter(r => r[cSetor] === setor);
    if (setorRows.length > 0)
      tab.getRange(2,1,setorRows.length,header.length).setValues(setorRows);
  } catch(e) { Logger.log('Erro atualizaAbaSetor: ' + e); }
}

function atualizaTodasAbas() {
  const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const cSetor = colIdxSetor(header);
  if (cSetor === -1) return { ok: false, erro: 'Coluna setor não encontrada' };
  const setores = [...new Set(rows.slice(1).map(r => r[cSetor]).filter(Boolean))];
  setores.forEach(s => atualizaAbaSetor(s));
  return { ok: true, setores };
}

// ================================================
// IMPORTAÇÃO EM LOTE POR SETOR (remove + insere de uma vez)
// ================================================
// Usada pra trocar por completo os clientes de um ou mais setores (ex:
// atualização vinda de uma planilha externa de terceiro): remove todos os
// clientes cujo setor esteja em payload.setoresRemover (e os pagamentos cujo
// cid pertença a esses clientes) e insere payload.novosClientes no final da
// aba clientes, preservando a ordem em que vieram no payload. Com
// payload.confirm !== true não altera nada — só devolve as contagens, pra
// permitir conferir antes de executar de verdade (operação destrutiva e sem
// undo). Escreve pelos NOMES reais das colunas do cabeçalho (não por posição
// fixa) porque a coluna de setor desta planilha está com o cabeçalho
// renomeado pra "Setor 02" (ver colIdxSetor) — usar dados[header[i]] direto
// deixaria a coluna de setor sempre vazia nas linhas novas.
function importarLoteSetores(payload) {
  return comLockDeEscrita(() => {
    const setoresRemover = (payload.setoresRemover || []).map(s => String(s).trim());
    const novosClientes  = payload.novosClientes || [];

    const sheetCli = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
    const sheetPag = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);

    const rowsCli    = sheetCli.getDataRange().getValues();
    const headerCli  = rowsCli[0];
    const cSetorCli  = colIdxSetor(headerCli);
    const cIdCli     = colIdx(headerCli, 'id');
    if (cSetorCli === -1) return { ok: false, erro: 'Coluna setor não encontrada em clientes' };
    if (cIdCli === -1)    return { ok: false, erro: 'Coluna id não encontrada em clientes' };

    const idxRemoverCli = []; // índices 0-based dentro de rowsCli (linha real = idx+1)
    const idsRemovidos  = {};
    for (let i = 1; i < rowsCli.length; i++) {
      if (setoresRemover.indexOf(String(rowsCli[i][cSetorCli]).trim()) !== -1) {
        idxRemoverCli.push(i);
        idsRemovidos[String(rowsCli[i][cIdCli])] = true;
      }
    }

    const rowsPag   = sheetPag.getDataRange().getValues();
    const headerPag = rowsPag[0];
    const cCidPag   = colIdx(headerPag, 'cid');
    const idxRemoverPag = [];
    if (cCidPag !== -1) {
      for (let i = 1; i < rowsPag.length; i++) {
        if (idsRemovidos[String(rowsPag[i][cCidPag])]) idxRemoverPag.push(i);
      }
    }

    if (payload.confirm !== true) {
      return {
        ok: true,
        dryRun: true,
        clientesParaRemover: idxRemoverCli.length,
        pagamentosParaRemover: idxRemoverPag.length,
        clientesParaInserir: novosClientes.length,
      };
    }

    // remove de baixo pra cima pra não bagunçar os índices das linhas seguintes
    for (let k = idxRemoverPag.length - 1; k >= 0; k--) sheetPag.deleteRow(idxRemoverPag[k] + 1);
    for (let k = idxRemoverCli.length - 1; k >= 0; k--) sheetCli.deleteRow(idxRemoverCli[k] + 1);
    SpreadsheetApp.flush();

    const headerAtual = sheetCli.getRange(1, 1, 1, sheetCli.getLastColumn()).getValues()[0];
    const cSetorAtual = colIdxSetor(headerAtual);
    const matriz = novosClientes.map(obj => headerAtual.map((h, idx) => {
      if (idx === cSetorAtual) return obj.setor !== undefined ? obj.setor : '';
      return obj[h] !== undefined ? obj[h] : '';
    }));
    if (matriz.length) {
      sheetCli.getRange(sheetCli.getLastRow() + 1, 1, matriz.length, headerAtual.length).setValues(matriz);
    }

    const setoresAtualizar = {};
    setoresRemover.forEach(s => setoresAtualizar[s] = true);
    novosClientes.forEach(o => { if (o.setor) setoresAtualizar[String(o.setor).trim()] = true; });
    Object.keys(setoresAtualizar).forEach(s => atualizaAbaSetor(s));

    return {
      ok: true,
      executado: true,
      clientesRemovidos: idxRemoverCli.length,
      pagamentosRemovidos: idxRemoverPag.length,
      clientesInseridos: matriz.length,
    };
  });
}

// ================================================
// REPARAR DADOS CORROMPIDOS
// Roda uma única vez para corrigir registros afetados
// pelo bug de índice de coluna. Sem confirmação.
// Pode ser executado pelo menu ⚡EPS ou diretamente
// pelo botão ▶ Run no editor do Apps Script.
// ================================================
function repararDadosCorretos() {
  const sheetCli  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const sheetPag  = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rowsCli   = sheetCli.getDataRange().getValues();
  const headerCli = rowsCli[0];
  const rowsPag   = sheetPag.getDataRange().getValues();
  const headerPag = rowsPag[0];

  // índices reais das colunas
  const ci = {
    id:       colIdx(headerCli, 'id'),
    nome:     colIdx(headerCli, 'nome'),
    obs:      colIdx(headerCli, 'obs'),
    proxVenc: colIdx(headerCli, 'proxVenc'),
    vencDia:  colIdx(headerCli, 'vencDia'),
    valor:    colIdx(headerCli, 'valor'),
  };
  const pi = {
    cid:    colIdx(headerPag, 'cid'),
    valor:  colIdx(headerPag, 'valor'),
    novoPv: colIdx(headerPag, 'novoPv'),
  };

  // histórico de pagamentos por cliente (mais recente primeiro)
  const pagMap = {};
  rowsPag.slice(1).forEach(r => {
    const cid = String(r[pi.cid] || '');
    if (!cid) return;
    if (!pagMap[cid]) pagMap[cid] = [];
    pagMap[cid].push({ valor: parseFloat(r[pi.valor]) || 0, novoPv: parseInt(r[pi.novoPv]) || 0 });
  });
  Object.keys(pagMap).forEach(cid => pagMap[cid].reverse()); // mais recente primeiro

  const YM    = /^20[2-9]\d(0[1-9]|1[0-2])$/; // padrão yyyymm
  const fixes  = [];
  const manual = [];

  for (let i = 1; i < rowsCli.length; i++) {
    const row      = rowsCli[i];
    const id       = String(row[ci.id]   || '');
    if (!id) continue;
    const nome     = String(row[ci.nome] || '');
    const obsVal   = ci.obs      >= 0 ? String(row[ci.obs]   || '').trim() : '';
    const proxVenc = ci.proxVenc >= 0 ? (parseInt(row[ci.proxVenc]) || 0)   : 0;
    const vencDia  = ci.vencDia  >= 0
      ? (parseInt(String(row[ci.vencDia] || '').replace(/\..*$/, '')) || 0) : 0;
    const valor    = ci.valor    >= 0 ? (parseFloat(row[ci.valor])   || 0)   : 0;
    const pags     = pagMap[id] || [];

    const rowFixes  = [];
    let newProxVenc = proxVenc;

    // ── Correção 1: obs com yyyymm (deveria ser proxVenc) ──────────────────
    if (ci.obs >= 0 && YM.test(obsVal)) {
      sheetCli.getRange(i+1, ci.obs+1).setValue('');
      rowFixes.push('obs limpa (' + obsVal + ' → "")');
      const ym = parseInt(obsVal);
      if (ym > newProxVenc) {
        newProxVenc = ym;
        rowFixes.push('proxVenc ← obs (' + ym + ')');
      }
    }

    // ── Correção 2: proxVenc zerado → recupera do último pagamento ──────────
    if (ci.proxVenc >= 0 && newProxVenc === 0 && pags.length > 0 && pags[0].novoPv > 0) {
      newProxVenc = pags[0].novoPv;
      rowFixes.push('proxVenc ← PAG (' + newProxVenc + ')');
    }
    if (ci.proxVenc >= 0 && newProxVenc !== proxVenc)
      sheetCli.getRange(i+1, ci.proxVenc+1).setValue(newProxVenc);

    // ── Correção 3: vencDia > 31 e valor = 0 ────────────────────────────────
    // O bug gravava valor_mensalidade na coluna vencDia e zerava valor.
    // Recupera: valor ← vencDia; vencDia ← último pagamento ou 1 (manual)
    if (ci.vencDia >= 0 && ci.valor >= 0 && vencDia > 31 && valor === 0) {
      sheetCli.getRange(i+1, ci.valor+1).setValue(vencDia); // recupera mensalidade
      sheetCli.getRange(i+1, ci.vencDia+1).setValue(1);     // placeholder seguro
      rowFixes.push('valor ← vencDia (' + vencDia + '); vencDia=1 (ajuste manual)');
      manual.push('• ' + nome + ' (' + id + ')  vencDia real desconhecido — ajustar manualmente');
    }
    // ── Correção 4: vencDia > 31 mas valor já OK ────────────────────────────
    else if (ci.vencDia >= 0 && vencDia > 31 && valor > 0) {
      sheetCli.getRange(i+1, ci.vencDia+1).setValue(1);     // placeholder seguro
      rowFixes.push('vencDia inválido (' + vencDia + ') → 1 (ajuste manual)');
      manual.push('• ' + nome + ' (' + id + ')  vencDia era ' + vencDia + ' — ajustar manualmente');
    }
    // ── Correção 5: valor = 0 sem vencDia corrompido → recupera de PAGAMENTOS
    else if (ci.valor >= 0 && valor === 0 && pags.length > 0 && pags[0].valor > 0) {
      sheetCli.getRange(i+1, ci.valor+1).setValue(pags[0].valor);
      rowFixes.push('valor ← PAG (R$' + pags[0].valor + ')');
    }

    if (rowFixes.length > 0) fixes.push('• ' + nome + ' [' + id + ']: ' + rowFixes.join(' | '));
  }

  // reconstrói abas de setor com dados corrigidos
  atualizaTodasAbas();

  // relatório (sem confirmação prévia — só resultado final)
  let msg = '';
  if (fixes.length > 0) {
    msg += '✅ CORRIGIDO AUTOMATICAMENTE (' + fixes.length + ' clientes):\n\n';
    msg += fixes.slice(0, 20).join('\n');
    if (fixes.length > 20) msg += '\n... e mais ' + (fixes.length - 20) + ' clientes';
    msg += '\n\n';
  }
  if (manual.length > 0) {
    msg += '⚠️ AJUSTE MANUAL NECESSÁRIO (' + manual.length + ' clientes):\n';
    msg += 'Corrija o campo vencDia diretamente na aba "clientes":\n\n';
    msg += manual.join('\n');
  }
  if (!msg) msg = '✅ Nenhum dado corrompido encontrado. Planilha OK!';

  Logger.log(msg);
  SpreadsheetApp.getUi().alert('Reparo de Dados — Relatório', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ================================================
// CORRIGIR proxVenc A PARTIR DE PAGAMENTOS
// Recalcula proxVenc de cada cliente usando o novoPv
// do pagamento mais recente (por data) na aba PAGAMENTOS.
// Cliente sem pagamento registrado → proxVenc = 0.
// Sem confirmação prévia. Rode uma vez pelo botão ▶ Run.
// ================================================
function corrigirProxVenc() {
  const sheetCli  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const sheetPag  = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rowsCli   = sheetCli.getDataRange().getValues();
  const headerCli = rowsCli[0];
  const rowsPag   = sheetPag.getDataRange().getValues();
  const headerPag = rowsPag[0];

  const cId       = colIdx(headerCli, 'id');
  const cProxVenc = colIdx(headerCli, 'proxVenc');
  if (cId === -1 || cProxVenc === -1) {
    SpreadsheetApp.getUi().alert('Erro: coluna id ou proxVenc não encontrada na aba clientes.');
    return;
  }

  const pCid    = colIdx(headerPag, 'cid');
  const pNovoPv = colIdx(headerPag, 'novoPv');
  const pData   = colIdx(headerPag, 'data');
  if (pCid === -1 || pNovoPv === -1) {
    SpreadsheetApp.getUi().alert('Erro: coluna cid ou novoPv não encontrada na aba PAGAMENTOS.');
    return;
  }

  // Para cada cliente, guarda o pagamento mais recente por data.
  // Se a data estiver ausente/inválida em algum registro, usa a ordem
  // de leitura da planilha (linhas de baixo são mais recentes) como desempate.
  const ultimoPag = {}; // cid -> { novoPv, data, linha }
  for (let i = 1; i < rowsPag.length; i++) {
    const row    = rowsPag[i];
    const cid    = String(row[pCid] || '');
    const novoPv = parseInt(row[pNovoPv]) || 0;
    if (!cid || !novoPv) continue;

    const dataRaw   = pData >= 0 ? row[pData] : null;
    const data      = dataRaw ? new Date(dataRaw) : null;
    const dataValida = data && !isNaN(data.getTime());

    const atual = ultimoPag[cid];
    if (!atual) {
      ultimoPag[cid] = { novoPv, data: dataValida ? data : null, linha: i };
      continue;
    }
    const usaEstaLinha = (dataValida && atual.data)
      ? data > atual.data          // ambas com data válida → compara data
      : i > atual.linha;           // sem data confiável → mantém a última lida
    if (usaEstaLinha) ultimoPag[cid] = { novoPv, data: dataValida ? data : atual.data, linha: i };
  }

  let totalClientes = 0, atualizados = 0, zerados = 0, jaCorretos = 0;

  for (let i = 1; i < rowsCli.length; i++) {
    const id = String(rowsCli[i][cId] || '');
    if (!id) continue;
    totalClientes++;

    const pag        = ultimoPag[id];
    const novoValor   = pag ? pag.novoPv : 0;
    const valorAtual  = parseInt(rowsCli[i][cProxVenc]) || 0;

    if (valorAtual === novoValor) { jaCorretos++; continue; }

    sheetCli.getRange(i + 1, cProxVenc + 1).setValue(novoValor);
    if (novoValor) atualizados++; else zerados++;
  }

  // Reconstrói as abas de setor com os valores corrigidos
  atualizaTodasAbas();

  const msg =
    '✅ proxVenc recalculado a partir de PAGAMENTOS:\n\n' +
    '• ' + atualizados  + ' cliente(s) atualizado(s) com o novoPv do pagamento mais recente\n' +
    '• ' + zerados      + ' cliente(s) zerado(s) (sem pagamento registrado)\n' +
    '• ' + jaCorretos   + ' de ' + totalClientes + ' já estavam corretos';

  Logger.log(msg);
  SpreadsheetApp.getUi().alert('Corrigir proxVenc — Relatório', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ================================================
// DIAGNÓSTICO (só leitura): proxVenc=0 atual, por setor, separando zero
// legítimo (nunca pagou) de zero suspeito (tem pagamento mas ficou zerado)
// ================================================
// Usa nome+setor como chave pra achar quem tem pagamento em PAGAMENTOS —
// não usa id/cid porque é exatamente esse casamento que está sob suspeita.
function TESTE_zeradosPorSetor() {
  const sheetCli  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const sheetPag  = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rowsCli   = sheetCli.getDataRange().getValues();
  const rowsPag   = sheetPag.getDataRange().getValues();
  const headerCli = rowsCli[0];
  const headerPag = rowsPag[0];

  const cId       = colIdx(headerCli, 'id');
  const cNome     = colIdx(headerCli, 'nome');
  const cSetor    = colIdxSetor(headerCli);
  const cProxVenc = colIdx(headerCli, 'proxVenc');

  const pNome  = colIdx(headerPag, 'nome');
  const pSetor = colIdx(headerPag, 'setor');

  const chave = (nome, setor) => String(nome || '').trim().toUpperCase() + '|' + String(setor || '').trim().toUpperCase();

  const temPagamento = new Set();
  for (let i = 1; i < rowsPag.length; i++) {
    const nome  = pNome  >= 0 ? rowsPag[i][pNome]  : '';
    const setor = pSetor >= 0 ? rowsPag[i][pSetor] : '';
    if (!nome) continue;
    temPagamento.add(chave(nome, setor));
  }

  const porSetor = {};
  const exemplosSuspeitos = [];

  for (let i = 1; i < rowsCli.length; i++) {
    const id = String(rowsCli[i][cId] || '').trim();
    if (!id) continue;

    const setor    = cSetor >= 0 ? String(rowsCli[i][cSetor] || '').trim() : '(sem setor)';
    const nome     = cNome  >= 0 ? rowsCli[i][cNome] : '';
    const proxVenc = parseInt(rowsCli[i][cProxVenc]) || 0;

    if (!porSetor[setor]) porSetor[setor] = { total: 0, zerados: 0, zeradosComPagamento: 0, zeradosSemPagamento: 0 };
    porSetor[setor].total++;

    if (proxVenc === 0) {
      porSetor[setor].zerados++;
      if (temPagamento.has(chave(nome, setor))) {
        porSetor[setor].zeradosComPagamento++;
        if (exemplosSuspeitos.length < 15) exemplosSuspeitos.push(setor + ' | id=' + id + ' | ' + nome);
      } else {
        porSetor[setor].zeradosSemPagamento++;
      }
    }
  }

  Logger.log('--- proxVenc = 0 (valor atual na planilha), por setor ---');
  Object.keys(porSetor).sort().forEach(setor => {
    const s = porSetor[setor];
    Logger.log(setor + ': ' + s.total + ' clientes total | ' + s.zerados + ' com proxVenc=0'
      + ' (' + s.zeradosComPagamento + ' TÊM pagamento registrado → suspeito de zeragem indevida'
      + ' | ' + s.zeradosSemPagamento + ' nunca pagaram → zero provavelmente correto)');
  });
  Logger.log('--- até 15 exemplos suspeitos (zero mas com pagamento no histórico) ---');
  exemplosSuspeitos.forEach(e => Logger.log(e));

  return porSetor;
}

// ================================================
// DIAGNÓSTICO (só leitura): contagem real de "em atraso" do Setor 02+13
// (Preto), direto da planilha, replicando EXATAMENTE st()/_stCalc() de
// js/config.js (linhas ~193-224) — sem passar por localStorage/cache de
// nenhum aparelho. Serve pra saber qual dos dois números (notebook 214 vs
// celular 36) está mais perto da verdade.
// ================================================
function TESTE_atrasadosRealPreto() {
  const sheetCli = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows     = sheetCli.getDataRange().getValues();
  const header   = rows[0];

  Logger.log('=== DIAGNÓSTICO DE ESTRUTURA (pra achar erro de nome/valor de coluna) ===');
  Logger.log('Aba lida: "' + sheetCli.getName() + '" | linhas de dados (sem cabeçalho): ' + (rows.length - 1));
  Logger.log('Cabeçalho encontrado: ' + JSON.stringify(header));

  const cId            = colIdx(header, 'id');
  const cNome          = colIdx(header, 'nome');
  const cSetor         = colIdxSetor(header);
  const cProxVenc      = colIdx(header, 'proxVenc');
  const cVencDia       = colIdx(header, 'vencDia');
  const cDataRemarc    = colIdx(header, 'dataRemarcacao');

  // A coluna "status" não existe nesta planilha (confirmado: 435/435 linhas
  // sem essa coluna) — procura qualquer coluna que pareça indicar cliente
  // inativo/excluído por outro nome, em vez de assumir 'status'.
  const NOMES_POSSIVEIS_INATIVO = ['ativo', 'inativo', 'excluido', 'excluído', 'situacao', 'situação'];
  const cInativoNome = header.find(h => NOMES_POSSIVEIS_INATIVO.indexOf(String(h).trim().toLowerCase()) !== -1);
  const cInativo = cInativoNome ? colIdx(header, cInativoNome) : -1;

  Logger.log('Índices -> id:' + cId + ' nome:' + cNome +
    ' setor:' + cSetor + ' (coluna real usada: "' + (cSetor >= 0 ? header[cSetor] : '(NÃO ACHOU)') + '")' +
    ' proxVenc:' + cProxVenc + ' vencDia:' + cVencDia + ' dataRemarcacao:' + cDataRemarc);
  Logger.log('Coluna de inativo/excluído encontrada: ' + (cInativoNome ? ('"' + cInativoNome + '"') : '(NENHUMA — vai considerar todos os 222 como universo total)'));

  const setorCount  = {};
  for (let i = 1; i < rows.length; i++) {
    const ve = cSetor >= 0 ? String(rows[i][cSetor]) : '(coluna setor não existe)';
    setorCount[ve] = (setorCount[ve] || 0) + 1;
  }
  Logger.log('--- Valores únicos em "setor" (com contagem) ---');
  Object.keys(setorCount).forEach(v => Logger.log('"' + v + '": ' + setorCount[v]));
  if (cInativo >= 0) {
    const inativoCount = {};
    for (let i = 1; i < rows.length; i++) {
      const v = String(rows[i][cInativo]);
      inativoCount[v] = (inativoCount[v] || 0) + 1;
    }
    Logger.log('--- Valores únicos em "' + cInativoNome + '" (com contagem) ---');
    Object.keys(inativoCount).forEach(v => Logger.log('"' + v + '": ' + inativoCount[v]));
  }

  // O valor real na planilha é "Setor 02" / "Setor 13" (confirmado no log:
  // "Setor 02": 155, "Setor 13": 67) — não "02"/"13" puro. Extrai só o
  // número de dentro da string, ignorando o prefixo "Setor " e zeros à
  // esquerda, em vez de comparar a string toda.
  const SETORES_PRETO = ['2', '13'];
  const normSetor = v => {
    const m = String(v || '').match(/\d+/);
    return m ? String(parseInt(m[0], 10)) : '';
  };

  const hoje      = new Date();
  const yh        = hoje.getFullYear() * 100 + (hoje.getMonth() + 1); // igual YM() de config.js
  const dh        = hoje.getDate();
  const hojeZero  = new Date(); hojeZero.setHours(0, 0, 0, 0);

  let totalAtivos = 0, atrasados = 0, atrasadosZerados = 0, atrasadosComPagamentoAntigo = 0;
  const exemplos = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id  = String(row[cId] || '').trim();
    if (!id) continue;

    const setorRaw = cSetor >= 0 ? row[cSetor] : '';
    if (SETORES_PRETO.indexOf(normSetor(setorRaw)) === -1) continue;

    // Sem coluna "status" nesta planilha — considera os 222 do setor como
    // universo total. Se existir uma coluna de inativo/excluído (logada acima),
    // ainda não filtra por ela nesta rodada até sabermos os valores reais que
    // ela usa (ver "Valores únicos" no log) — só conta, pra não excluir gente
    // errado por um chute de formato.
    totalAtivos++;

    // Réplica fiel de st(): dataRemarcacao futura conta como 'remarcado', não 'atrasado'
    const dataRemarc = cDataRemarc >= 0 ? String(row[cDataRemarc] || '').trim() : '';
    if (dataRemarc) {
      const ret = new Date(dataRemarc + 'T00:00:00');
      if (!isNaN(ret.getTime()) && ret > hojeZero) continue;
    }

    // Réplica fiel de _stCalc()
    const proxVencRaw = cProxVenc >= 0 ? row[cProxVenc] : '';
    const vencDiaRaw  = cVencDia  >= 0 ? row[cVencDia]  : '';
    const pv = parseInt(String(proxVencRaw || '').replace(/\..*$/, '')) || yh;
    const vd = parseInt(String(vencDiaRaw  || '').replace(/\..*$/, '')) || 1;

    let statusCalc;
    if (pv < yh) statusCalc = 'atrasado';
    else if (pv > yh) statusCalc = 'adiantado';
    else if (vd === dh) statusCalc = 'hoje';
    else if (vd < dh) statusCalc = 'atrasado';
    else statusCalc = 'ok';

    if (statusCalc === 'atrasado') {
      atrasados++;
      const proxVencNum = parseInt(String(proxVencRaw || '').replace(/\..*$/, '')) || 0;
      if (proxVencNum === 0) {
        atrasadosZerados++;
      } else {
        atrasadosComPagamentoAntigo++;
        const nome = cNome >= 0 ? row[cNome] : '';
        exemplos.push({ id: id, nome: String(nome || ''), proxVenc: proxVencRaw, vencDia: vencDiaRaw });
      }
    }
  }

  Logger.log('=== CONTAGEM REAL — Setor 02+13 (Preto), direto da planilha, sem localStorage ===');
  Logger.log('Total de clientes ativos: ' + totalAtivos);
  Logger.log('Total em atraso (mesma lógica de st()/_stCalc de js/config.js): ' + atrasados);
  Logger.log('  - com proxVenc = 0/vazio (nunca pagaram, ou nunca tiveram data registrada): ' + atrasadosZerados);
  Logger.log('  - com proxVenc > 0 mas no passado (pagaram antes, está vencido de verdade): ' + atrasadosComPagamentoAntigo);
  Logger.log('--- TODOS os ' + exemplos.length + ' atrasados com proxVenc > 0 (dívida real, não zeragem), ordenados por nome ---');
  exemplos
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .forEach(e => Logger.log('id=' + e.id + ' | nome=' + e.nome + ' | proxVenc=' + e.proxVenc + ' | vencDia=' + e.vencDia));

  return { totalAtivos: totalAtivos, atrasados: atrasados, atrasadosZerados: atrasadosZerados, atrasadosComPagamentoAntigo: atrasadosComPagamentoAntigo };
}

// ================================================
// DIAGNÓSTICO (só leitura): investiga a contradição ADEMIR/DOUGLAS
// ================================================
// TESTE_zeradosPorSetor achou "tem pagamento" casando por nome+setor.
// corrigirProxVenc2Clientes não achou nada casando por id/cid exato.
// Essa função mostra os valores BRUTOS dos dois lados pra revelar se é
// diferença de formatação no cid (corrigível) ou coincidência de nome
// (outro cliente com o mesmo nome, cid genuinamente diferente).
function TESTE_investigarAdemirDouglas() {
  const ALVO_NOMES = ['ADEMIR', 'DOUGLAS'];

  const sheetCli  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const sheetPag  = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rowsCli   = sheetCli.getDataRange().getValues();
  const headerCli = rowsCli[0];
  const rowsPag   = sheetPag.getDataRange().getValues();
  const headerPag = rowsPag[0];

  const cId    = colIdx(headerCli, 'id');
  const cNome  = colIdx(headerCli, 'nome');
  const cSetor = colIdxSetor(headerCli);

  const pCid    = colIdx(headerPag, 'cid');
  const pNome   = colIdx(headerPag, 'nome');
  const pSetor  = colIdx(headerPag, 'setor');
  const pNovoPv = colIdx(headerPag, 'novoPv');
  const pData   = colIdx(headerPag, 'data');

  const norm = v => String(v || '').trim().toUpperCase();

  Logger.log('--- clientes (aba clientes) com nome ADEMIR ou DOUGLAS ---');
  for (let i = 1; i < rowsCli.length; i++) {
    const nome = cNome >= 0 ? String(rowsCli[i][cNome] || '') : '';
    if (!ALVO_NOMES.some(n => norm(nome) === n || norm(nome).indexOf(n) !== -1)) continue;
    Logger.log('linha ' + (i + 1) + ' | id="' + rowsCli[i][cId] + '" (tipo ' + typeof rowsCli[i][cId] +
      ') | nome="' + nome + '" | setor="' + (cSetor >= 0 ? rowsCli[i][cSetor] : '?') + '"');
  }

  Logger.log('--- linhas de PAGAMENTOS com nome ADEMIR ou DOUGLAS ---');
  for (let i = 1; i < rowsPag.length; i++) {
    const nome = pNome >= 0 ? String(rowsPag[i][pNome] || '') : '';
    if (!ALVO_NOMES.some(n => norm(nome) === n || norm(nome).indexOf(n) !== -1)) continue;
    Logger.log('linha ' + (i + 1) +
      ' | cid="' + rowsPag[i][pCid] + '" (tipo ' + typeof rowsPag[i][pCid] + ')' +
      ' | nome="' + nome + '"' +
      ' | setor="' + (pSetor >= 0 ? rowsPag[i][pSetor] : '?') + '"' +
      ' | novoPv=' + (pNovoPv >= 0 ? rowsPag[i][pNovoPv] : '?') +
      ' | data=' + (pData >= 0 ? rowsPag[i][pData] : '?'));
  }
}

// ================================================
// CORREÇÃO PONTUAL: só EPS2-5719 (ADEMIR) e EPS18739 (DOUGLAS)
// ================================================
// Dos 234 clientes zerados na última execução de corrigirProxVenc(), 232 são
// legítimos (clientes do Vinicius sem nenhum pagamento ainda). Só esses 2
// ficaram com proxVenc=0 por engano, apesar de terem pagamento no histórico.
// Recalcula o proxVenc SÓ desses 2 a partir do pagamento mais recente em
// PAGAMENTOS (mesmo critério de "mais recente" de corrigirProxVenc: maior
// data válida; sem data válida em nenhum dos dois, usa a ordem de leitura da
// planilha como desempate). Comparação id/cid feita com .trim()+toUpperCase()
// pra não repetir o problema que zerou os 2 na primeira vez. Não toca em
// nenhum outro cliente.
function corrigirProxVenc2Clientes() {
  const ALVO = ['EPS2-5719', 'EPS18739'];

  const sheetCli  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const sheetPag  = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rowsCli   = sheetCli.getDataRange().getValues();
  const headerCli = rowsCli[0];
  const rowsPag   = sheetPag.getDataRange().getValues();
  const headerPag = rowsPag[0];

  const cId       = colIdx(headerCli, 'id');
  const cNome     = colIdx(headerCli, 'nome');
  const cProxVenc = colIdx(headerCli, 'proxVenc');
  const pCid      = colIdx(headerPag, 'cid');
  const pNovoPv   = colIdx(headerPag, 'novoPv');
  const pData     = colIdx(headerPag, 'data');

  if ([cId, cProxVenc, pCid, pNovoPv].indexOf(-1) !== -1) {
    Logger.log('Erro: coluna esperada não encontrada (id/proxVenc/cid/novoPv).');
    return;
  }

  const norm = v => String(v || '').trim().toUpperCase();

  // Pagamento mais recente de cada alvo — mesmo critério de desempate de
  // corrigirProxVenc(): maior data válida; sem data confiável, última linha lida.
  const maisRecente = {}; // idAlvo -> { novoPv, data, linha }
  for (let i = 1; i < rowsPag.length; i++) {
    const cidRaw = norm(rowsPag[i][pCid]);
    const alvo = ALVO.find(a => norm(a) === cidRaw);
    if (!alvo) continue;

    const novoPv = parseInt(rowsPag[i][pNovoPv]) || 0;
    if (!novoPv) continue;

    const dataRaw    = pData >= 0 ? rowsPag[i][pData] : null;
    const data       = dataRaw ? new Date(dataRaw) : null;
    const dataValida = data && !isNaN(data.getTime());

    const atual = maisRecente[alvo];
    if (!atual) {
      maisRecente[alvo] = { novoPv, data: dataValida ? data : null, linha: i };
      continue;
    }
    const usaEstaLinha = (dataValida && atual.data) ? data > atual.data : i > atual.linha;
    if (usaEstaLinha) maisRecente[alvo] = { novoPv, data: dataValida ? data : atual.data, linha: i };
  }

  Logger.log('--- Pagamentos mais recentes encontrados em PAGAMENTOS ---');
  ALVO.forEach(a => {
    const p = maisRecente[a];
    Logger.log(a + ': ' + (p ? ('novoPv=' + p.novoPv + ' (linha PAGAMENTOS ' + (p.linha + 1) + ')') : 'NENHUM pagamento encontrado'));
  });

  // Aplica só nas linhas de clientes cujo id (normalizado) bate com um alvo
  let atualizados = 0;
  for (let i = 1; i < rowsCli.length; i++) {
    const idNorm = norm(rowsCli[i][cId]);
    const alvo = ALVO.find(a => norm(a) === idNorm);
    if (!alvo) continue;

    const pag = maisRecente[alvo];
    const nome = cNome >= 0 ? rowsCli[i][cNome] : '';
    if (!pag) {
      Logger.log('AVISO: ' + alvo + ' (' + nome + ', linha clientes ' + (i + 1) + ') não tem pagamento — não mexido.');
      continue;
    }

    const valorAntes = rowsCli[i][cProxVenc];
    sheetCli.getRange(i + 1, cProxVenc + 1).setValue(pag.novoPv);
    atualizados++;
    Logger.log('Atualizado: ' + alvo + ' (' + nome + ', linha clientes ' + (i + 1) + '): proxVenc ' + valorAntes + ' → ' + pag.novoPv);
  }

  Logger.log('Total atualizado: ' + atualizados + ' de ' + ALVO.length + ' alvo(s).');

  atualizaTodasAbas();
  Logger.log('atualizaTodasAbas() executado — abas de setor refletindo a correção.');
}

// ================================================
// DIAGNÓSTICO (só leitura): compara formato de id (clientes) vs cid (PAGAMENTOS)
// ================================================
// Investiga por que corrigirProxVenc() não achou nenhum match (0 atualizados,
// 234 zerados) — mostra os primeiros valores brutos com o tipo de dado real
// de cada lado, e conta quantos ids batem com algum cid.
function TESTE_compararIds() {
  const sheetCli  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const sheetPag  = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rowsCli   = sheetCli.getDataRange().getValues();
  const rowsPag   = sheetPag.getDataRange().getValues();
  const headerCli = rowsCli[0];
  const headerPag = rowsPag[0];
  const cId  = colIdx(headerCli, 'id');
  const pCid = colIdx(headerPag, 'cid');

  Logger.log('--- 5 primeiros IDs em clientes ---');
  for (let i = 1; i <= 5 && i < rowsCli.length; i++) {
    Logger.log('[' + i + '] valor="' + rowsCli[i][cId] + '" tipo=' + typeof rowsCli[i][cId]);
  }
  Logger.log('--- 5 primeiros CIDs em PAGAMENTOS ---');
  for (let i = 1; i <= 5 && i < rowsPag.length; i++) {
    Logger.log('[' + i + '] valor="' + rowsPag[i][pCid] + '" tipo=' + typeof rowsPag[i][pCid]);
  }
  const cidsExistentes = new Set(rowsPag.slice(1).map(r => String(r[pCid]).trim()));
  const cidsExistentesRaw = new Set(rowsPag.slice(1).map(r => String(r[pCid])));
  let comMatch = 0, semMatch = 0, comMatchTrim = 0;
  const exemplosSemMatch = [];
  for (let i = 1; i < rowsCli.length; i++) {
    const idRaw  = String(rowsCli[i][cId]);
    const idTrim = idRaw.trim();
    if (!idTrim) continue;
    if (cidsExistentesRaw.has(idRaw)) comMatch++; else semMatch++;
    if (cidsExistentes.has(idTrim)) comMatchTrim++;
    if (!cidsExistentes.has(idTrim) && exemplosSemMatch.length < 10) {
      exemplosSemMatch.push(idRaw);
    }
  }
  Logger.log('Com match (comparação bruta, sem trim): ' + comMatch);
  Logger.log('Sem match (comparação bruta, sem trim): ' + semMatch);
  Logger.log('Com match (com .trim() nos dois lados): ' + comMatchTrim);
  Logger.log('--- 10 exemplos de id sem match (mesmo com trim) ---');
  exemplosSemMatch.forEach(id => Logger.log('"' + id + '"'));
}

// ================================================
// REPARAR SETOR VAZIO (bug de addCliente/editCliente gravando dados[header[i]]
// direto na coluna renomeada "Setor 02" — ver montarLinhaCliente)
// ================================================
// Backfill único pros clientes já afetados pelo bug antes da correção: a
// linha existe na aba "clientes" com todos os campos certos, só a coluna de
// setor ficou em branco, então o cliente nunca aparece em nenhum filtro por
// setor (fica "invisível" mesmo existindo). O valor certo de cada um foi
// recuperado batendo o id contra a aba DEBUG_LOG (payload original do
// cadastro) e, quando não achado ali, contra o histórico de PAGAMENTOS
// (coluna setor) — nunca inventado. Ids sem nenhum registro recuperável não
// entram no mapa: ficam de fora e precisam ser ajustados manualmente.
// Sem confirmação prévia. Só grava onde a célula de setor está REALMENTE
// vazia (não sobrescreve nada que já tenha um valor).
function repararSetorVazio() {
  const SETOR_CONHECIDO = {
    'EPS18764': 'Setor 02', 'EPS18765': 'Setor 02', 'EPS18769': 'Setor 13',
    'EPS18770': 'Setor 02', 'EPS18771': 'Setor 02', 'EPS18772': 'Setor 13',
    'EPS18773': 'Setor 02', 'EPS18774': 'Setor 13', 'EPS18775': 'Setor 13',
    'EPS18776': 'Setor 02', 'EPS18777': 'Setor 02', 'EPS18778': 'Setor 02',
    'EPS18779': 'Setor 02', 'EPS18780': 'Setor 04', 'EPS18781': 'Setor 04',
    'EPS18782': 'Setor 03', 'EPS18783': 'Setor 03', 'EPS18784': 'Setor 03',
    'EPS18785': 'Setor 04', 'EPS18786': 'Setor 04', 'EPS18787': 'Setor 04',
    'EPS18788': 'Setor 04', 'EPS18789': 'Setor 04',
  };

  return comLockDeEscrita(() => {
    const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
    const rows   = sheet.getDataRange().getValues();
    const header = rows[0];
    const cId    = colIdx(header, 'id');
    const cSetor = colIdxSetor(header);
    if (cId === -1 || cSetor === -1) return { ok: false, erro: 'Coluna id ou setor não encontrada' };

    const corrigidos = [];
    const setoresTocados = {};
    for (let i = 1; i < rows.length; i++) {
      const id = String(rows[i][cId] || '').trim();
      const setorAtual = String(rows[i][cSetor] || '').trim();
      if (setorAtual !== '' || !SETOR_CONHECIDO[id]) continue;
      const novoSetor = SETOR_CONHECIDO[id];
      sheet.getRange(i + 1, cSetor + 1).setValue(novoSetor);
      corrigidos.push(id + ' → ' + novoSetor);
      setoresTocados[novoSetor] = true;
    }
    SpreadsheetApp.flush();
    Object.keys(setoresTocados).forEach(s => atualizaAbaSetor(s));

    return { ok: true, corrigidos: corrigidos, total: corrigidos.length };
  });
}

// ================================================
// TESTE AUTOMATIZADO: cadastro de cliente nos 4 setores afetados
// ================================================
// Simula addCliente em cada um dos setores 02/03/04/13, e confirma por
// LEITURA DIRETA da planilha (não confia só no retorno {ok:true}) que a
// linha foi gravada com id, nome E setor corretos. Usa ids com prefixo
// TESTE_AUTO_ pra nunca colidir com id real, e remove os clientes de teste
// no final (sucesso ou falha) pra não sujar a aba "clientes" de produção.
function testeCadastroSetores() {
  const setores = ['Setor 02', 'Setor 03', 'Setor 04', 'Setor 13'];
  const stamp = new Date().getTime();
  const resultados = [];
  const idsCriados = [];

  try {
    setores.forEach(setor => {
      const id = 'TESTE_AUTO_' + stamp + '_' + setor.replace(/\s+/g, '');
      const dados = {
        id: id,
        nome: 'Teste Automático ' + setor,
        setor: setor,
        vencDia: 5,
        valor: 1,
        criadoPor: 'teste-automatizado',
        criadoEm: new Date().toISOString(),
      };

      const respAdd = addCliente(dados);
      idsCriados.push(id);

      // lê de volta diretamente da planilha (não reaproveita cache nenhum)
      const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
      const rows   = sheet.getDataRange().getValues();
      const header = rows[0];
      const cId    = colIdx(header, 'id');
      const cSetor = colIdxSetor(header);
      const linha  = rows.find(r => String(r[cId]) === id);

      const setorGravado = linha ? String(linha[cSetor] || '').trim() : null;
      const passou = !!respAdd.ok && !!linha && setorGravado === setor;

      resultados.push({
        setor: setor,
        id: id,
        respostaAddCliente: respAdd,
        linhaEncontrada: !!linha,
        setorGravado: setorGravado,
        passou: passou,
      });
    });
  } finally {
    // limpeza: remove todos os clientes de teste criados, mesmo se algum passo falhou
    idsCriados.forEach(id => { try { delCliente(id); } catch (e) {} });
  }

  const todosPassaram = resultados.every(r => r.passou);
  return { ok: true, todosPassaram: todosPassaram, resultados: resultados };
}

// ================================================
// DIAGNÓSTICO (só leitura): lista ids de cliente duplicados entre setores
// ================================================
// Ids duplicados são perigosos: qualquer ação por id (pagar, editar,
// remarcar) pode acabar afetando o cliente errado. Rode esta função pra
// ver a lista completa e decida manualmente novos ids únicos pra um dos
// dois de cada par (ex: trocar VIN0423 duplicado para VIN0423B). NÃO
// renomeia nada sozinho — só mostra o relatório, porque os ids também
// aparecem no histórico da aba PAGAMENTOS (coluna cid) e uma troca errada
// quebraria esse histórico.
function detectarIdsDuplicados() {
  const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const cId    = colIdx(header, 'id');
  const cNome  = colIdx(header, 'nome');
  const cSetor = colIdxSetor(header);

  const porId = {};
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][cId] || '');
    if (!id) continue;
    (porId[id] = porId[id] || []).push({
      linha: i + 1,
      nome:  cNome  >= 0 ? rows[i][cNome]  : '',
      setor: cSetor >= 0 ? rows[i][cSetor] : '',
    });
  }

  const duplicados = Object.keys(porId).filter(id => porId[id].length > 1);
  let msg;
  if (duplicados.length === 0) {
    msg = '✅ Nenhum id duplicado encontrado na aba clientes.';
  } else {
    msg = '⚠️ ' + duplicados.length + ' id(s) duplicado(s) — cada um usado por clientes DIFERENTES:\n\n';
    duplicados.forEach(id => {
      msg += id + ':\n';
      porId[id].forEach(r => msg += '  linha ' + r.linha + ': ' + r.nome + ' (' + r.setor + ')\n');
      msg += '\n';
    });
    msg += 'Corrija manualmente: troque o id de um dos dois de cada par direto\n';
    msg += 'na aba "clientes" (ex: VIN0423 → VIN0423B) para um valor que não exista\n';
    msg += 'em nenhuma outra linha. Não precisa mexer na aba PAGAMENTOS — o\n';
    msg += 'histórico antigo dos pagamentos já feitos continua vinculado ao id antigo.';
  }

  Logger.log(msg);
  SpreadsheetApp.getUi().alert('Ids duplicados — Relatório', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ================================================
// ENDPOINTS N8N
// ================================================
function getClientesPix(setor, vencDia) {
  let clientes = getClientes(setor).data.filter(c => c.pix === 'sim');
  if (vencDia) clientes = clientes.filter(c => parseInt(c.vencDia) === parseInt(vencDia));
  const hoje = new Date();
  const ym   = hoje.getFullYear() * 100 + (hoje.getMonth() + 1);
  clientes = clientes.map(c => {
    const pv = parseInt(c.proxVenc) || ym;
    return { ...c, statusPagamento: pv > ym ? 'pago' : pv < ym ? 'atrasado' : 'pendente' };
  });
  const pendentes = clientes.filter(c => c.statusPagamento !== 'pago');
  return { ok: true, total: pendentes.length, setor: setor||'todos', vencDia: vencDia||'todos', data: pendentes };
}

function getStatusPix(setor) {
  const pixClients = getClientes(setor).data.filter(c => c.pix === 'sim');
  const hoje = new Date();
  const ym   = hoje.getFullYear() * 100 + (hoje.getMonth() + 1);
  const pagos     = pixClients.filter(c => parseInt(c.proxVenc) > ym);
  const pendentes = pixClients.filter(c => parseInt(c.proxVenc) <= ym);
  const totalMes  = pixClients.reduce((a,c) => a + (c.valor||0), 0);
  const totalPago = pagos.reduce((a,c) => a + (c.valor||0), 0);
  return { ok:true, setor:setor||'todos', totalClientes:pixClients.length,
           pagos:pagos.length, pendentes:pendentes.length,
           totalMes, totalPago, totalPendente:totalMes-totalPago };
}

function confirmarPagamentoPix(dados, etapas) {
  etapas = etapas || [];
  const cli = getClientes(null).data.find(c => c.id === dados.cid);
  if (!cli) { etapas.push('cliente não encontrado pra cid=' + dados.cid); return { ok: false, erro: 'Cliente não encontrado: ' + dados.cid }; }
  const hoje  = new Date();
  const ym    = hoje.getFullYear() * 100 + (hoje.getMonth() + 1);
  const mes   = parseInt(String(ym).slice(-2));
  const ano   = parseInt(String(ym).slice(0, 4));
  const pag   = {
    cid: cli.id, nome: cli.nome, setor: cli.setor,
    valor:  parseFloat(dados.valor || cli.valor),
    forma:  'pix', mesPago: ym,
    novoPv: mes === 12 ? (ano+1)*100+1 : ym+1,
    data:   hoje.toISOString(),
    vigia:  dados.dono || 'n8n', origem: 'n8n',
  };
  return addPagamento(pag, etapas);
}

// ================================================
// HELPERS
// ================================================
function getOrCreateSheet(nome, colunas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script sem planilha ativa vinculada (getActiveSpreadsheet retornou null) — verifique se o Apps Script está vinculado (Extensões > Apps Script) à planilha certa.');
  let sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
    sheet.getRange(1,1,1,colunas.length).setValues([colunas]);
    sheet.getRange(1,1,1,colunas.length).setFontWeight('bold').setBackground('#0c1028').setFontColor('#00cfff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rowToObj(header, row) {
  const obj = {};
  header.forEach((col, i) => { obj[col] = row[i] !== undefined ? row[i] : ''; });
  return obj;
}

// ================================================
// MENU + TRIGGERS
// ================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ EPS')
    .addItem('🔧 Reparar dados corrompidos', 'repararDadosCorretos')
    .addItem('💰 Corrigir proxVenc a partir de PAGAMENTOS', 'corrigirProxVenc')
    .addItem('🆔 Detectar ids de cliente duplicados', 'detectarIdsDuplicados')
    .addItem('♻️ Atualizar todas as abas de setor', 'atualizaTodasAbas')
    .addSeparator()
    .addItem('📋 Publicar Web App (instruções)', 'instrucoes')
    .addToUi();
}

function instrucoes() {
  SpreadsheetApp.getUi().alert(
    '📋 Como republicar após atualizar o código:\n\n' +
    '1. Implantar → Gerenciar implantações\n' +
    '2. Clique no lápis (editar)\n' +
    '3. Versão → Nova versão\n' +
    '4. Implantar\n\n' +
    'A URL permanece a mesma.'
  );
}

function copiarSetor02() {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const clientes = ss.getSheetByName('clientes');
  const setor02  = ss.getSheetByName('Setor 02');
  const dados    = clientes.getDataRange().getValues();
  const header   = dados[0];
  const setorIdx = header.findIndex(h => String(h).toLowerCase().trim() === 'setor');
  if (setorIdx === -1) { SpreadsheetApp.getUi().alert('Coluna setor não encontrada.'); return; }
  const filtrado = dados.slice(1).filter(r => String(r[setorIdx]).trim() === 'Setor 02');
  if (filtrado.length === 0) { SpreadsheetApp.getUi().alert('Nenhum cliente do Setor 02 encontrado.'); return; }
  if (setor02.getLastRow() > 1) setor02.getRange(2,1,setor02.getLastRow()-1,setor02.getLastColumn()).clearContent();
  setor02.getRange(2,1,filtrado.length,header.length).setValues(filtrado);
  SpreadsheetApp.getUi().alert('✅ ' + filtrado.length + ' clientes restaurados no Setor 02!');
}

// ================================================
// CORRIGIR IDs DUPLICADOS (automático)
// ================================================
// Renomeia clientes com id duplicado: mantém a 1ª ocorrência (na ordem da
// planilha) com o id original, e sufixa as seguintes com B, C... Também
// realinha o histórico de pagamentos dessa pessoa na aba PAGAMENTOS (troca
// o cid antigo pelo novo), usando id+setor pra identificar com certeza
// quais linhas de PAGAMENTOS são dela — sem isso, o histórico de pagamento
// do cliente renomeado ficaria "preso" sob o id antigo, que passa a
// pertencer só à outra pessoa, e o cálculo de próximo vencimento a partir
// do pagamento mais recente (corrigirProxVenc / sync do app) pararia de
// achar os pagamentos antigos dela — podendo voltar a marcá-la como
// atrasada por engano mesmo já tendo pago.
//
// Pula (sem alterar nada) qualquer par de duplicados que esteja no MESMO
// setor — nesse caso não dá pra saber com segurança de qual pessoa é cada
// pagamento antigo só pelo setor, então fica registrado no log pra revisão
// manual em vez de arriscar trocar o pagamento de pessoa errada.
//
// Sem SpreadsheetApp.getUi() de propósito: essa função é feita pra rodar
// via Apps Script API (clasp run), que não tem contexto de UI — chamar
// getUi() nesse contexto lançaria erro depois de já ter feito as alterações.
function corrigirDuplicadosAutomatico() {
  const sheetCli  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const sheetPag  = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rowsCli   = sheetCli.getDataRange().getValues();
  const headerCli = rowsCli[0];
  const cId    = colIdx(headerCli, 'id');
  const cNome  = colIdx(headerCli, 'nome');
  const cSetor = colIdxSetor(headerCli);
  if (cId === -1) { Logger.log('Coluna id não encontrada.'); return { erro: 'Coluna id não encontrada.' }; }

  const rowsPag   = sheetPag.getDataRange().getValues();
  const headerPag = rowsPag[0];
  const pCid   = colIdx(headerPag, 'cid');
  const pSetor = colIdx(headerPag, 'setor');

  // Agrupa linhas de clientes por id original, junto com o setor de cada uma
  const porId = {};
  for (let i = 1; i < rowsCli.length; i++) {
    const id = String(rowsCli[i][cId] || '').trim();
    if (!id) continue;
    (porId[id] = porId[id] || []).push({
      linha: i,
      setor: cSetor >= 0 ? String(rowsCli[i][cSetor] || '').trim() : '',
    });
  }

  const mudancas = [];
  const avisos   = [];

  Object.keys(porId).forEach(idOriginal => {
    const ocorrencias = porId[idOriginal];
    if (ocorrencias.length < 2) return; // não é duplicado

    const setores = ocorrencias.map(o => o.setor);
    if (new Set(setores).size < setores.length) {
      avisos.push(idOriginal + ': duas ocorrências no MESMO setor — pulado (não renomeado), revise manualmente.');
      return;
    }

    for (let k = 1; k < ocorrencias.length; k++) {
      const oc     = ocorrencias[k];
      const sufixo = String.fromCharCode(64 + k + 1); // B, C, D...
      const novoId = idOriginal + sufixo;

      sheetCli.getRange(oc.linha + 1, cId + 1).setValue(novoId);
      const nome = cNome >= 0 ? rowsCli[oc.linha][cNome] : '';
      mudancas.push('clientes linha ' + (oc.linha + 1) + ': ' + idOriginal + ' → ' + novoId + ' (' + nome + ', ' + oc.setor + ')');

      if (pCid !== -1 && pSetor !== -1) {
        for (let j = 1; j < rowsPag.length; j++) {
          const pagCid   = String(rowsPag[j][pCid]   || '').trim();
          const pagSetor = String(rowsPag[j][pSetor] || '').trim();
          if (pagCid === idOriginal && pagSetor === oc.setor) {
            sheetPag.getRange(j + 1, pCid + 1).setValue(novoId);
            mudancas.push('PAGAMENTOS linha ' + (j + 1) + ': cid ' + idOriginal + ' → ' + novoId);
          }
        }
      }
    }
  });

  Logger.log('Total de mudanças: ' + mudancas.length);
  mudancas.forEach(m => Logger.log(m));
  if (avisos.length) {
    Logger.log('--- Pulados (revisar manualmente) ---');
    avisos.forEach(a => Logger.log(a));
  }

  atualizaTodasAbas();

  return { totalMudancas: mudancas.length, mudancas, avisos };
}

// ================================================
// INVESTIGAR HISTÓRICO DE VERSÕES (Drive API — Revisions)
// ================================================
// Lista as revisões salvas da planilha (metadados apenas: data/hora e quem
// editou) via Drive Advanced Service, pra ajudar a localizar quando a aba
// PAGAMENTOS perdeu linhas (caiu de ~1211 pra ~821). Não abre nem altera
// o conteúdo de nenhuma revisão — só leitura de metadados, sem risco.
//
// Depois de rodar, cruze os horários do log com Arquivo > Histórico de
// versões > Ver histórico de versões (Ctrl+Alt+Shift+H) na planilha, abrindo
// as revisões mais próximas do horário suspeito pra conferir manualmente a
// contagem de linhas da aba PAGAMENTOS (Ctrl+seta-pra-baixo na coluna A).
//
// Requer o serviço avançado "Drive API" habilitado no projeto (já
// configurado em appsscript.json → dependencies.enabledAdvancedServices).
// Na primeira execução o Apps Script vai pedir autorização extra (escopo do
// Drive) — precisa rodar pelo editor do script.google.com pra aparecer a
// tela de consentimento.
function listarRevisoesPagamentos() {
  const fileId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const resp = Drive.Revisions.list(fileId, {
    fields: 'revisions(id,modifiedTime,lastModifyingUser,size,keepForever)'
  });
  const revisions = resp.revisions || [];

  Logger.log('Total de revisões encontradas: ' + revisions.length);
  revisions.forEach(r => {
    const usuario = r.lastModifyingUser
      ? (r.lastModifyingUser.displayName || r.lastModifyingUser.emailAddress || '?')
      : '?';
    Logger.log(r.id + ' | ' + r.modifiedTime + ' | ' + usuario + ' | ' + (r.size || '?') + ' bytes' + (r.keepForever ? ' | fixada' : ''));
  });

  return revisions.map(r => ({
    id: r.id,
    modifiedTime: r.modifiedTime,
    usuario: r.lastModifyingUser ? (r.lastModifyingUser.displayName || r.lastModifyingUser.emailAddress) : null,
    size: r.size,
  }));
}

// ================================================
// INVESTIGAR PAGAMENTOS PERDIDOS DO PRETO (Setor 02+13) NA RESTAURAÇÃO DE
// VERSÃO DAS 13:31 DE 22/07/2026 — SÓ LEITURA, NÃO ALTERA NADA
// ================================================
// Baixa a revisão da planilha salva imediatamente ANTES do corte (via Drive
// API, convertendo pra um Google Sheet temporário só de leitura, apagado no
// final) e compara a aba PAGAMENTOS dela com a aba PAGAMENTOS ATUAL. Lista
// as linhas que existiam antes e não existem mais, filtradas por Setor 02+13
// (Preto), e confere especificamente se os 7 clientes informados aparecem
// entre as linhas perdidas.
function investigarPagamentosPerdidosPreto() {
  const CUTOFF_ISO = '2026-07-22T13:31:00-03:00'; // horário da restauração de versão
  const cutoff = new Date(CUTOFF_ISO);

  const fileId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const resp = Drive.Revisions.list(fileId, {
    fields: 'revisions(id,modifiedTime,lastModifyingUser)'
  });
  const revisions = (resp.revisions || []).slice()
    .sort((a, b) => new Date(a.modifiedTime) - new Date(b.modifiedTime));

  Logger.log('Total de revisões encontradas: ' + revisions.length);

  let revisaoAntiga = null;
  for (let i = 0; i < revisions.length; i++) {
    const t = new Date(revisions[i].modifiedTime);
    if (t < cutoff) revisaoAntiga = revisions[i];
    else break;
  }
  if (!revisaoAntiga) {
    Logger.log('ERRO: não encontrei nenhuma revisão anterior a ' + CUTOFF_ISO + '. Pode ter sido purgada (revisões granulares não fixadas somem depois de um tempo).');
    return;
  }
  const usuarioAntigo = revisaoAntiga.lastModifyingUser
    ? (revisaoAntiga.lastModifyingUser.displayName || revisaoAntiga.lastModifyingUser.emailAddress || '?')
    : '?';
  Logger.log('Revisão ANTES da restauração escolhida: id=' + revisaoAntiga.id +
    ' | modifiedTime=' + revisaoAntiga.modifiedTime + ' | por=' + usuarioAntigo);

  // Baixa essa revisão como xlsx (via Drive API) e converte num Google Sheet
  // temporário só pra leitura — arquivo de uso único, apagado no finally.
  const token = ScriptApp.getOAuthToken();
  const url = 'https://www.googleapis.com/drive/v3/files/' + fileId +
              '/revisions/' + revisaoAntiga.id +
              '?alt=media&mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const httpResp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (httpResp.getResponseCode() !== 200) {
    Logger.log('ERRO ao baixar a revisão antiga: HTTP ' + httpResp.getResponseCode() + ' — ' + httpResp.getContentText());
    return;
  }
  const blob = httpResp.getBlob().setName('temp_revisao_' + revisaoAntiga.id + '.xlsx');

  let tempFile;
  try {
    tempFile = Drive.Files.create({ name: 'TEMP_investigacao_' + revisaoAntiga.id, mimeType: MimeType.GOOGLE_SHEETS }, blob);
  } catch (e) {
    Logger.log('ERRO ao converter a revisão baixada em Sheet temporário: ' + e.message);
    return;
  }

  try {
    const tempSs  = SpreadsheetApp.openById(tempFile.id);
    const tempPag = tempSs.getSheetByName(SHEET_PAGAMENTOS);
    if (!tempPag) { Logger.log('ERRO: aba PAGAMENTOS não encontrada na revisão antiga.'); return; }

    const oldRows   = tempPag.getDataRange().getValues();
    const oldHeader = oldRows[0];
    Logger.log('Linhas de PAGAMENTOS na revisão ANTIGA (antes das 13:31): ' + (oldRows.length - 1));

    const sheetPagAtual = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
    const curRows = sheetPagAtual.getDataRange().getValues();
    const curHeader = curRows[0];
    Logger.log('Linhas de PAGAMENTOS na versão ATUAL: ' + (curRows.length - 1));

    // Assinatura de cada linha, usando os campos em comum — serve pra achar
    // linhas idênticas entre a revisão antiga e a atual sem depender de
    // índice de linha (que pode ter mudado).
    const CAMPOS_CHAVE = ['cid', 'nome', 'setor', 'valor', 'forma', 'mesPago', 'novoPv', 'data', 'vigia', 'origem'];
    function chaveLinha(header, row) {
      return CAMPOS_CHAVE.map(c => {
        const idx = colIdx(header, c);
        if (idx === -1) return '';
        let v = row[idx];
        if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        return String(v || '').trim();
      }).join('|');
    }

    const curKeys = new Set();
    for (let i = 1; i < curRows.length; i++) curKeys.add(chaveLinha(curHeader, curRows[i]));

    const pSetorOld = colIdx(oldHeader, 'setor');
    const pCidOld   = colIdx(oldHeader, 'cid');
    const pNomeOld  = colIdx(oldHeader, 'nome');

    const normSetor = v => {
      const m = String(v || '').match(/\d+/);
      return m ? String(parseInt(m[0], 10)) : '';
    };
    const SETORES_PRETO = ['2', '13'];

    const ALVO_IDS = ['EPS2-2386', 'EPS2-2538', 'EPS2-5196', 'EPS2-5356', 'EPS2-5783', 'EPS2-5460', 'EPS2-5792'];
    const achadosAlvo = {};

    let perdidasTotal = 0, perdidasPreto = 0;
    const perdidasPretoList = [];

    for (let i = 1; i < oldRows.length; i++) {
      const row = oldRows[i];
      const key = chaveLinha(oldHeader, row);
      if (curKeys.has(key)) continue; // ainda existe na versão atual — não foi perdida

      perdidasTotal++;

      const setorRaw = pSetorOld >= 0 ? row[pSetorOld] : '';
      const cid  = pCidOld  >= 0 ? String(row[pCidOld] || '').trim() : '';
      const nome = pNomeOld >= 0 ? row[pNomeOld] : '';

      if (SETORES_PRETO.indexOf(normSetor(setorRaw)) === -1) continue; // não é Preto

      perdidasPreto++;
      perdidasPretoList.push('linha ' + (i + 1) + ' | cid=' + cid + ' | nome=' + nome + ' | setor=' + setorRaw + ' | ' + key);

      if (ALVO_IDS.indexOf(cid) !== -1) {
        (achadosAlvo[cid] = achadosAlvo[cid] || []).push(key);
      }
    }

    Logger.log('=== RESULTADO ===');
    Logger.log('Total de linhas perdidas (revisão antiga → atual), qualquer setor: ' + perdidasTotal);
    Logger.log('Dessas, quantas são do Setor 02+13 (Preto): ' + perdidasPreto);
    Logger.log('--- Linhas perdidas do Preto ---');
    perdidasPretoList.forEach(l => Logger.log(l));

    Logger.log('--- Verificação dos 7 clientes específicos (PEDRO ROSANE, PERCI, PEDRO, RAQUEL, ROBERTA JANAUNA, ROSANGELA, ROSIMERI) ---');
    ALVO_IDS.forEach(id => {
      if (achadosAlvo[id]) {
        Logger.log(id + ': ENCONTRADO(S) ' + achadosAlvo[id].length + ' pagamento(s) perdido(s) — ' + achadosAlvo[id].join(' ; '));
      } else {
        Logger.log(id + ': nenhum pagamento perdido encontrado pra esse id (ou não existia na revisão antiga).');
      }
    });
  } finally {
    if (tempFile) {
      Drive.Files.remove(tempFile.id);
      Logger.log('Arquivo temporário removido (' + tempFile.id + ').');
    }
  }
}

// ================================================
// INVESTIGAR 7 CLIENTES ESPECÍFICOS: pagamento confirmado pelo usuário mas
// proxVenc mostra atrasado — SÓ LEITURA, NÃO ALTERA NADA
// ================================================
// Pra cada id: lista toda linha de PAGAMENTOS com cid EXATAMENTE igual,
// mostra o proxVenc atual na aba clientes, verifica se existe pagamento com
// novoPv mais recente que o proxVenc atual (sincronização não aconteceu), e
// se não achar nenhuma linha pelo id, procura pagamento com nome parecido
// mas cid diferente (pode ter sido lançado com o id errado).
function investigarSeteClientesPreto() {
  const ALVO = [
    { id: 'EPS2-2386', nome: 'PEDRO ROSANE' },
    { id: 'EPS2-2538', nome: 'PERCI' },
    { id: 'EPS2-5196', nome: 'PEDRO' },
    { id: 'EPS2-5356', nome: 'RAQUEL' },
    { id: 'EPS2-5783', nome: 'ROBERTA JANAUNA' },
    { id: 'EPS2-5460', nome: 'ROSANGELA' },
    { id: 'EPS2-5792', nome: 'ROSIMERI' },
  ];

  const sheetCli = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const sheetPag = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rowsCli   = sheetCli.getDataRange().getValues();
  const headerCli = rowsCli[0];
  const rowsPag   = sheetPag.getDataRange().getValues();
  const headerPag = rowsPag[0];

  const cId       = colIdx(headerCli, 'id');
  const cNome     = colIdx(headerCli, 'nome');
  const cProxVenc = colIdx(headerCli, 'proxVenc');
  const cSetor    = colIdxSetor(headerCli);

  const pCid     = colIdx(headerPag, 'cid');
  const pNome    = colIdx(headerPag, 'nome');
  const pSetor   = colIdx(headerPag, 'setor');
  const pValor   = colIdx(headerPag, 'valor');
  const pForma   = colIdx(headerPag, 'forma');
  const pMesPago = colIdx(headerPag, 'mesPago');
  const pNovoPv  = colIdx(headerPag, 'novoPv');
  const pData    = colIdx(headerPag, 'data');
  const pVigia   = colIdx(headerPag, 'vigia');
  const pOrigem  = colIdx(headerPag, 'origem');

  function formatRowPag(row) {
    return 'setor=' + (pSetor >= 0 ? row[pSetor] : '?') +
      ' | valor=' + (pValor >= 0 ? row[pValor] : '?') +
      ' | forma=' + (pForma >= 0 ? row[pForma] : '?') +
      ' | mesPago=' + (pMesPago >= 0 ? row[pMesPago] : '?') +
      ' | novoPv=' + (pNovoPv >= 0 ? row[pNovoPv] : '?') +
      ' | data=' + (pData >= 0 ? row[pData] : '?') +
      ' | vigia=' + (pVigia >= 0 ? row[pVigia] : '?') +
      ' | origem=' + (pOrigem >= 0 ? row[pOrigem] : '?');
  }

  ALVO.forEach(alvo => {
    Logger.log('==================================================');
    Logger.log('CLIENTE: ' + alvo.id + ' (' + alvo.nome + ')');

    // 1) Todas as linhas de PAGAMENTOS com cid EXATAMENTE igual ao id
    const linhasExatas = [];
    for (let i = 1; i < rowsPag.length; i++) {
      const cid = String(rowsPag[i][pCid] || '').trim();
      if (cid === alvo.id) linhasExatas.push({ linha: i + 1, row: rowsPag[i] });
    }
    if (linhasExatas.length === 0) {
      Logger.log('PAGAMENTOS: NENHUMA linha encontrada com cid = "' + alvo.id + '".');
    } else {
      Logger.log('PAGAMENTOS: ' + linhasExatas.length + ' linha(s) encontrada(s) com cid = "' + alvo.id + '":');
      linhasExatas.forEach(l => Logger.log('  linha ' + l.linha + ' | cid=' + alvo.id + ' | ' + formatRowPag(l.row)));
    }

    // 2) proxVenc atual na aba clientes
    let linhaCli = -1, proxVencAtual = null, nomeReal = '', setorReal = '';
    for (let i = 1; i < rowsCli.length; i++) {
      const id = String(rowsCli[i][cId] || '').trim();
      if (id === alvo.id) {
        linhaCli = i + 1;
        proxVencAtual = rowsCli[i][cProxVenc];
        nomeReal = cNome >= 0 ? rowsCli[i][cNome] : '';
        setorReal = cSetor >= 0 ? rowsCli[i][cSetor] : '';
        break;
      }
    }
    if (linhaCli === -1) {
      Logger.log('CLIENTES: id "' + alvo.id + '" NÃO encontrado na aba clientes!');
    } else {
      Logger.log('CLIENTES: linha ' + linhaCli + ' | nome=' + nomeReal + ' | setor=' + setorReal + ' | proxVenc atual = ' + proxVencAtual);
    }

    // 3) Existe pagamento com novoPv mais recente que o proxVenc atual?
    if (linhasExatas.length > 0 && linhaCli !== -1) {
      const proxVencNum = parseInt(String(proxVencAtual || '').replace(/\..*$/, '')) || 0;
      const maisRecentes = linhasExatas.filter(l => {
        const npv = parseInt(String(l.row[pNovoPv] || '').replace(/\..*$/, '')) || 0;
        return npv > proxVencNum;
      });
      if (maisRecentes.length > 0) {
        Logger.log('⚠ ACHADO: ' + maisRecentes.length + ' pagamento(s) com novoPv MAIOR que o proxVenc atual (' +
          proxVencNum + ') — pagamento registrado mas proxVenc do cliente não foi atualizado. Linhas: ' +
          maisRecentes.map(l => l.linha).join(', '));
      } else {
        Logger.log('Nenhum pagamento com novoPv maior que o proxVenc atual — não há evidência de dessincronização por esse id.');
      }
    }

    // 4) Se não achou nenhuma linha pelo id, procura nome parecido com cid diferente
    if (linhasExatas.length === 0) {
      const nomeAlvoNorm = alvo.nome.trim().toUpperCase();
      const candidatos = [];
      for (let i = 1; i < rowsPag.length; i++) {
        const nomePag = pNome >= 0 ? String(rowsPag[i][pNome] || '').trim().toUpperCase() : '';
        if (!nomePag) continue;
        if (nomePag.indexOf(nomeAlvoNorm) !== -1 || nomeAlvoNorm.indexOf(nomePag) !== -1) {
          const cidPag = String(rowsPag[i][pCid] || '').trim();
          if (cidPag !== alvo.id) candidatos.push({ linha: i + 1, cid: cidPag, row: rowsPag[i] });
        }
      }
      if (candidatos.length > 0) {
        Logger.log('🔎 Possível pagamento com NOME parecido mas cid DIFERENTE (pode ter sido lançado com o id errado):');
        candidatos.forEach(c => Logger.log('  linha ' + c.linha + ' | cid=' + c.cid + ' | ' + formatRowPag(c.row)));
      } else {
        Logger.log('Nenhum pagamento com nome parecido a "' + alvo.nome + '" encontrado em PAGAMENTOS, com qualquer cid.');
      }
    }
  });

  Logger.log('==================================================');
  Logger.log('Investigação concluída pros 7 clientes.');
}

// ================================================
// CONFIGURAÇÕES POR PROPRIETÁRIO (CobraSetor — botões de WhatsApp)
// Chave Pix, nome da empresa e textos das mensagens de cobrança, salvos
// na aba CONFIG_PROPRIETARIOS — assim valem no celular e no notebook.
// ================================================
const SHEET_CONFIG_PROP = 'CONFIG_PROPRIETARIOS';
const COL_CONFIG_PROP   = ['usuario', 'chavePix', 'empresa', 'msgHoje', 'msgAtraso', 'atualizadoEm', 'atualizadoPor'];

function getConfigProp(usuario) {
  usuario = String(usuario || '').trim();
  if (!usuario) return { ok: false, erro: 'usuario não informado' };
  const sheet = getOrCreateSheet(SHEET_CONFIG_PROP, COL_CONFIG_PROP);
  const rows  = sheet.getDataRange().getValues();
  const header = rows[0];
  const cU = colIdx(header, 'usuario');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][cU]).trim() === usuario) {
      const obj = rowToObj(header, rows[i]);
      if (obj.atualizadoEm instanceof Date) obj.atualizadoEm = obj.atualizadoEm.toISOString();
      ['chavePix', 'empresa', 'msgHoje', 'msgAtraso'].forEach(k => { obj[k] = String(obj[k] == null ? '' : obj[k]); });
      return { ok: true, data: obj };
    }
  }
  return { ok: true, data: null };
}

function salvarConfigProp(dados) {
  const usuario = String((dados && dados.usuario) || '').trim();
  if (!usuario || usuario.length > 40) return { ok: false, erro: 'usuario inválido' };
  const lim = (v, n) => String(v == null ? '' : v).slice(0, n);
  const reg = {
    usuario:       usuario,
    chavePix:      lim(dados.chavePix, 120),
    empresa:       lim(dados.empresa, 80),
    msgHoje:       lim(dados.msgHoje, 1500),
    msgAtraso:     lim(dados.msgAtraso, 1500),
    atualizadoEm:  new Date().toISOString(),
    atualizadoPor: lim(dados.atualizadoPor, 40),
  };
  return comLockDeEscrita(() => {
    const sheet  = getOrCreateSheet(SHEET_CONFIG_PROP, COL_CONFIG_PROP);
    sheet.getRange(1, 1, sheet.getMaxRows(), COL_CONFIG_PROP.length).setNumberFormat('@'); // texto puro (chave Pix com zeros à esquerda)
    const rows   = sheet.getDataRange().getValues();
    const header = rows[0];
    const cU = colIdx(header, 'usuario');
    const linha = header.map(h => reg[String(h).trim()] !== undefined ? reg[String(h).trim()] : '');
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][cU]).trim() === usuario) {
        sheet.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
        SpreadsheetApp.flush();
        return { ok: true, data: reg };
      }
    }
    // appendRow ignora o formato texto e converte "0123..." em número (perde o
    // zero da chave Pix) — grava na próxima linha com formato texto antes
    const alvo = sheet.getRange(sheet.getLastRow() + 1, 1, 1, linha.length);
    alvo.setNumberFormat('@');
    alvo.setValues([linha]);
    SpreadsheetApp.flush();
    return { ok: true, data: reg };
  });
}

// ================================================
// BACKUP AUTOMÁTICO (CobraSetor)
// Gera um .xlsx com a aba "clientes" inteira (todos os setores, todas as
// colunas) + a aba "PAGAMENTOS", salva na pasta "Backup CobraSetor" do
// Drive e (no automático) manda por e-mail com o arquivo anexado.
// Gatilho diário ~6h (Brasília): só gera se AMANHÃ for dia 1, 5, 10, 15,
// 20 ou 25 — a véspera do dia 1 é o último dia do mês (28, 29, 30 ou 31).
// ================================================
const BACKUP_EMAIL = 'jacksonsilva717171@gmail.com';
const BACKUP_PASTA = 'Backup CobraSetor';
const BACKUP_TZ    = 'America/Sao_Paulo';
const BACKUP_DIAS  = [1, 5, 10, 15, 20, 25];

/** Dia de AMANHÃ (fuso de Brasília) se for dia de backup; senão 0 */
function diaDeBackupAmanha(agora) {
  const amanha = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
  const dia = parseInt(Utilities.formatDate(amanha, BACKUP_TZ, 'd'), 10);
  return BACKUP_DIAS.indexOf(dia) >= 0 ? dia : 0;
}

function _pastaBackup() {
  const it = DriveApp.getFoldersByName(BACKUP_PASTA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_PASTA);
}

/** Gera o .xlsx, salva no Drive e devolve { blob, nome, arquivoId, totais } */
function gerarArquivoBackup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const carimbo = Utilities.formatDate(new Date(), BACKUP_TZ, 'yyyy-MM-dd_HH-mm');
  const nome = 'Backup CobraSetor ' + carimbo + '.xlsx';
  const abas = [SHEET_CLIENTES, SHEET_PAGAMENTOS];
  const tmp = SpreadsheetApp.create('tmp-backup-cobrasetor-' + carimbo);
  const totais = {};
  try {
    abas.forEach(nomeAba => {
      const orig = ss.getSheetByName(nomeAba);
      if (!orig) throw new Error('Aba não encontrada: ' + nomeAba);
      const valores = orig.getDataRange().getValues();
      const dest = tmp.insertSheet(nomeAba);
      if (valores.length && valores[0].length) {
        dest.getRange(1, 1, valores.length, valores[0].length).setValues(valores);
        dest.getRange(1, 1, 1, valores[0].length).setFontWeight('bold');
        dest.setFrozenRows(1);
      }
      const header = valores[0] || [];
      const cId = nomeAba === SHEET_CLIENTES ? colIdx(header, 'id') : colIdx(header, 'cid');
      totais[nomeAba] = {
        linhas: Math.max(0, valores.length - 1),
        comId:  cId >= 0 ? valores.slice(1).filter(r => String(r[cId]).trim()).length : null,
      };
    });
    tmp.getSheets().forEach(sh => { if (abas.indexOf(sh.getName()) < 0) tmp.deleteSheet(sh); });
    SpreadsheetApp.flush();

    const resp = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) throw new Error('exportação .xlsx falhou (HTTP ' + resp.getResponseCode() + ')');
    const blob = resp.getBlob().setName(nome);
    const arquivo = _pastaBackup().createFile(blob);
    return { blob: blob, nome: nome, arquivoId: arquivo.getId(), totais: totais };
  } finally {
    DriveApp.getFileById(tmp.getId()).setTrashed(true);
  }
}

/** Gatilho diário: só faz o backup na véspera dos dias de vencimento */
function backupAutomatico() {
  const dia = diaDeBackupAmanha(new Date());
  if (!dia) return { ok: true, gerado: false };
  const r = gerarArquivoBackup();
  MailApp.sendEmail({
    to: BACKUP_EMAIL,
    subject: 'Backup CobraSetor - véspera do dia ' + dia,
    body: 'Backup automático do CobraSetor (véspera do dia ' + dia + ').\n\n'
        + 'Arquivo: ' + r.nome + '\n'
        + 'Clientes: ' + r.totais[SHEET_CLIENTES].comId + '\n'
        + 'Pagamentos: ' + r.totais[SHEET_PAGAMENTOS].comId + '\n\n'
        + 'Uma cópia também ficou na pasta "' + BACKUP_PASTA + '" do Google Drive.',
    attachments: [r.blob],
  });
  return { ok: true, gerado: true, dia: dia, nome: r.nome };
}

/** Botão "Baixar backup agora" do app (somente admin na tela) */
function baixarBackupApp() {
  const r = gerarArquivoBackup();
  return {
    ok: true,
    nome: r.nome,
    base64: Utilities.base64Encode(r.blob.getBytes()),
    totalClientes: r.totais[SHEET_CLIENTES].comId,
    linhasClientes: r.totais[SHEET_CLIENTES].linhas,
    totalPagamentos: r.totais[SHEET_PAGAMENTOS].comId,
  };
}

/**
 * RODE UMA VEZ pelo editor (Executar → instalarGatilhoBackup): pede as
 * permissões (Drive, e-mail, gatilhos) e cria o gatilho diário das 6h.
 * Pode rodar de novo sem duplicar o gatilho.
 */
function instalarGatilhoBackup() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'backupAutomatico')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupAutomatico')
    .timeBased().everyDays(1).atHour(6).inTimezone(BACKUP_TZ)
    .create();
  _pastaBackup();
  Logger.log('Gatilho do backup instalado: todo dia ~6h (Brasília). Pasta: ' + BACKUP_PASTA);
  return 'ok';
}

/** Teste manual pelo editor: gera e manda o e-mail na hora (assunto "teste") */
function testarBackupAgora() {
  const r = gerarArquivoBackup();
  MailApp.sendEmail({
    to: BACKUP_EMAIL,
    subject: 'Backup CobraSetor - teste manual',
    body: 'Teste do backup. Arquivo: ' + r.nome + '\nClientes: ' + r.totais[SHEET_CLIENTES].comId,
    attachments: [r.blob],
  });
  Logger.log('Backup de teste enviado: ' + r.nome);
}

// ================================================
// LIMPEZA DOS DADOS DE TESTE (somente setor "Setor 99 TESTE" + ids TST-)
// ================================================
const SETOR_TESTE = 'Setor 99 TESTE';

function limparTesteCobraSetor() {
  return comLockDeEscrita(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const out = { ok: true, clientesRemovidos: 0, pagamentosRemovidos: 0, logsRemovidos: 0, abaRemovida: false };

    const cli = ss.getSheetByName(SHEET_CLIENTES);
    if (cli) {
      const rows = cli.getDataRange().getValues();
      const cId = colIdx(rows[0], 'id'), cSetor = colIdxSetor(rows[0]);
      for (let i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][cSetor]).trim() === SETOR_TESTE && String(rows[i][cId]).indexOf('TST-') === 0) {
          cli.deleteRow(i + 1); out.clientesRemovidos++;
        }
      }
    }
    const pag = ss.getSheetByName(SHEET_PAGAMENTOS);
    if (pag) {
      const rows = pag.getDataRange().getValues();
      const cCid = colIdx(rows[0], 'cid'), cSetor = colIdx(rows[0], 'setor');
      for (let i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][cSetor]).trim() === SETOR_TESTE && String(rows[i][cCid]).indexOf('TST-') === 0) {
          pag.deleteRow(i + 1); out.pagamentosRemovidos++;
        }
      }
    }
    const log = ss.getSheetByName('DEBUG_LOG');
    if (log) {
      const rows = log.getDataRange().getValues();
      for (let i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][2]).indexOf('TST-FOLHA-') >= 0) { log.deleteRow(i + 1); out.logsRemovidos++; }
      }
    }
    const aba = ss.getSheetByName(SETOR_TESTE);
    if (aba) { ss.deleteSheet(aba); out.abaRemovida = true; }
    SpreadsheetApp.flush();
    return out;
  });
}
