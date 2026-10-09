// CobraSetor — /api/ler-folha (função serverless da Vercel)
//
// Recebe 1 a 6 fotos (JPEG em base64) da folha de cobrança devolvida pelo
// vigilante e devolve os códigos de cliente cuja caixinha está marcada.
// 1ª leitura: Claude Haiku 5.5. Se algum código vier com confiança não-alta
// ou não existir no setor, a MESMA foto é relida com Claude Sonnet 5.5 e o
// resultado do Sonnet é o que vale para aquela foto.
//
// A chave fica só na variável de ambiente ANTHROPIC_API_KEY da Vercel.
// Proteções contra uso por terceiros: CORS só para as 2 origens do app
// (qualquer outra origem é recusada com 403), limite de tamanho/quantidade
// de imagens e limite de chamadas por minuto.

const Anthropic = require('@anthropic-ai/sdk');

const ORIGENS_PERMITIDAS = [
  'https://cobrassetor.vercel.app',
  'https://jacksonsilva717171-hue.github.io',
];

const MODELO_RAPIDO = 'claude-haiku-5-5';
const MODELO_REVISAO = 'claude-sonnet-5-5';

const MAX_FOTOS = 6;
const MAX_BYTES_FOTO = 1200 * 1024;   // ~1,2 MB por foto (o app manda ~1600px JPEG, bem menos)
const MAX_CODIGOS = 800;
const LIMITE_POR_IP_MIN = 6;          // chamadas por minuto por IP
const LIMITE_GLOBAL_MIN = 20;         // chamadas por minuto nesta instância

// Limite de chamadas em memória (vale por instância da função; a Vercel
// reaproveita a instância entre chamadas próximas, que é o caso de abuso)
const _janela = { inicio: 0, global: 0, porIp: new Map() };
function _excedeuLimite(ip) {
  const agora = Date.now();
  if (agora - _janela.inicio > 60000) {
    _janela.inicio = agora; _janela.global = 0; _janela.porIp.clear();
  }
  const n = (_janela.porIp.get(ip) || 0) + 1;
  _janela.porIp.set(ip, n);
  _janela.global += 1;
  return n > LIMITE_POR_IP_MIN || _janela.global > LIMITE_GLOBAL_MIN;
}

const ESQUEMA = {
  type: 'object',
  properties: {
    marcados: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          codigo:    { type: 'string' },
          confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
        },
        required: ['codigo', 'confianca'],
        additionalProperties: false,
      },
    },
  },
  required: ['marcados'],
  additionalProperties: false,
};

function _prompt(codigos) {
  return [
    'Esta é a foto de uma "FOLHA DE COBRANÇA" impressa. Cada linha da tabela tem, à esquerda,',
    'uma caixinha quadrada (coluna PAGO) e, logo depois, o CÓDIGO do cliente em letra grande',
    '(ex.: EPS18743, VIN0423). O número pequeno antes do código é só a posição da linha.',
    '',
    'Liste SOMENTE os códigos das linhas cuja caixinha foi marcada à mão (X, ✓, rabisco,',
    'risco ou preenchimento). Caixinha vazia = não listar. Uma marca fora da caixinha, mas',
    'claramente na mesma linha da caixinha, conta como marcada.',
    '',
    'Para cada código informe a confiança:',
    '- "alta": a marca é clara e o código está legível;',
    '- "media": a marca ou o código têm alguma dúvida;',
    '- "baixa": não dá para ter certeza.',
    '',
    'Copie o código exatamente como impresso. Os códigos impressos nesta folha estão entre estes:',
    codigos.join(', '),
  ].join('\n');
}

async function _lerFoto(client, modelo, base64, codigos) {
  const params = {
    model: modelo,
    max_tokens: 8000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text: _prompt(codigos) },
      ],
    }],
  };
  const inicio = Date.now();
  // Sonnet 5.5: fallback do servidor em caso de recusa por classificador.
  // Haiku 5.5 não tem fallback do servidor.
  const resp = modelo === MODELO_REVISAO
    ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await client.messages.create(params);

  if (resp.stop_reason === 'refusal') throw new Error('leitura recusada pelo modelo');
  if (resp.stop_reason === 'max_tokens') throw new Error('resposta cortada (max_tokens)');
  const texto = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const json = JSON.parse(texto);
  const marcados = (json.marcados || []).map(m => ({
    codigo: String(m.codigo || '').trim().toUpperCase(),
    confianca: m.confianca,
  })).filter(m => m.codigo);
  return { modelo: resp.model || modelo, marcados, ms: Date.now() - inicio, uso: resp.usage };
}

function _precisaRevisao(leitura, validos) {
  return leitura.marcados.some(m => m.confianca !== 'alta' || !validos.has(m.codigo));
}

module.exports = async function handler(req, res) {
  const origem = req.headers.origin || '';
  if (!ORIGENS_PERMITIDAS.includes(origem)) {
    res.status(403).json({ ok: false, erro: 'Origem não permitida.' });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', origem);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, erro: 'Use POST.' }); return; }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconhecido';
  if (_excedeuLimite(ip)) {
    res.status(429).json({ ok: false, erro: 'Muitas leituras em pouco tempo. Aguarde 1 minuto.' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ ok: false, erro: 'Leitura de fotos não configurada no servidor.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const fotos   = body && Array.isArray(body.fotos) ? body.fotos : [];
  const codigos = body && Array.isArray(body.codigos) ? body.codigos : [];

  if (!fotos.length || fotos.length > MAX_FOTOS) {
    res.status(400).json({ ok: false, erro: `Envie de 1 a ${MAX_FOTOS} fotos.` });
    return;
  }
  if (!codigos.length || codigos.length > MAX_CODIGOS ||
      codigos.some(c => typeof c !== 'string' || !c.trim() || c.length > 30)) {
    res.status(400).json({ ok: false, erro: 'Lista de códigos do setor inválida.' });
    return;
  }
  const imagens = [];
  for (const f of fotos) {
    const b64 = String(f || '').replace(/^data:image\/jpeg;base64,/, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) {
      res.status(400).json({ ok: false, erro: 'Cada foto deve ser um JPEG em base64.' });
      return;
    }
    if (b64.length * 0.75 > MAX_BYTES_FOTO) {
      res.status(413).json({ ok: false, erro: 'Foto grande demais (reduza antes de enviar).' });
      return;
    }
    imagens.push(b64);
  }

  const lista = codigos.map(c => c.trim().toUpperCase());
  const validos = new Set(lista);
  const client = new Anthropic();

  try {
    const porFoto = await Promise.all(imagens.map(async (b64, i) => {
      const haiku = await _lerFoto(client, MODELO_RAPIDO, b64, lista);
      let sonnet = null;
      if (_precisaRevisao(haiku, validos)) {
        sonnet = await _lerFoto(client, MODELO_REVISAO, b64, lista);
      }
      return { foto: i + 1, haiku, sonnet, usado: sonnet ? 'sonnet' : 'haiku' };
    }));

    // Junta as fotos: mesmo código em 2 fotos → fica a maior confiança
    const ordemConf = { alta: 3, media: 2, baixa: 1 };
    const final = new Map();
    porFoto.forEach(f => {
      const leitura = f.sonnet || f.haiku;
      leitura.marcados.forEach(m => {
        const ant = final.get(m.codigo);
        if (!ant || ordemConf[m.confianca] > ordemConf[ant.confianca]) {
          final.set(m.codigo, { ...m, foto: f.foto, existe: validos.has(m.codigo) });
        }
      });
    });

    res.status(200).json({
      ok: true,
      marcados: [...final.values()],
      fotos: porFoto.map(f => ({
        foto: f.foto,
        usado: f.usado,
        haiku:  { modelo: f.haiku.modelo, marcados: f.haiku.marcados, ms: f.haiku.ms },
        sonnet: f.sonnet ? { modelo: f.sonnet.modelo, marcados: f.sonnet.marcados, ms: f.sonnet.ms } : null,
      })),
    });
  } catch (e) {
    let msg = 'Falha ao ler a foto.';
    if (e instanceof Anthropic.RateLimitError) msg = 'Serviço de leitura ocupado. Tente de novo em instantes.';
    else if (e instanceof Anthropic.APIError) msg = 'Erro no serviço de leitura (' + (e.status || '?') + ').';
    else if (e && e.message) msg = 'Falha ao ler a foto: ' + e.message;
    console.error('ler-folha:', e);
    res.status(502).json({ ok: false, erro: msg });
  }
};
