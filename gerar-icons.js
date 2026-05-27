// Gera icon-192.png e icon-512.png usando apenas módulos nativos do Node
// Ícone: fundo laranja #ff6b00, letra "C" branca centralizada
const zlib = require('zlib');
const fs   = require('fs');

// ── helpers PNG ──────────────────────────────────────────────────────────────
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([t, data]));
  return Buffer.concat([u32(data.length), t, data, u32(crc)]);
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── desenha ícone numa grade de pixels ───────────────────────────────────────
function gerarPixels(size) {
  // cores
  const BG = [0xff, 0x6b, 0x00];   // laranja
  const FG = [0xff, 0xff, 0xff];   // branco
  const RD = [0xcc, 0x55, 0x00];   // laranja escuro (borda arredondada)

  const px = (x, y) => {
    const cx = x - size / 2, cy = y - size / 2;
    const r  = size / 2;
    const rr = r * 0.78;          // raio do fundo arredondado

    // fundo: círculo para simular ícone arredondado
    if (cx * cx + cy * cy > rr * rr) return null; // transparente (fora)

    // letra "C" aproximada com arco
    const dist = Math.sqrt(cx * cx + cy * cy);
    const ang  = Math.atan2(cy, cx) * 180 / Math.PI; // -180 a 180

    const ri = rr * 0.32, ro = rr * 0.62; // anel da letra C
    const gap = 45; // abertura do C (graus)

    if (dist >= ri && dist <= ro) {
      // abertura do C (lado direito)
      if (ang > -gap && ang < gap) return BG;
      return FG;
    }

    return BG;
  };

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter byte = 0 (None)
    for (let x = 0; x < size; x++) {
      const p = px(x, y);
      if (p) { row.push(...p, 255); }   // RGBA
      else   { row.push(0, 0, 0, 0); }  // transparente
    }
    rows.push(Buffer.from(row));
  }
  return Buffer.concat(rows);
}

function makePNG(size) {
  const sig  = Buffer.from([137,80,78,71,13,10,26,10]);

  // IHDR: RGBA (colorType=6), 8-bit
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  // bytes 10,11,12 = 0

  const raw  = gerarPixels(size);
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.writeFileSync('icon-192.png', makePNG(192));
fs.writeFileSync('icon-512.png', makePNG(512));
console.log('Ícones gerados: icon-192.png e icon-512.png');
