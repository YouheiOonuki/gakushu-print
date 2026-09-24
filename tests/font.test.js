// なぞり書きのフォント（fonts/）に、使う字がすべて入っているか
// woff2 の cmap（文字 → 字形の表）だけを読む。依存なし（node の brotli を使う）
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const C = require('../constants.js');

// WOFF2 の既知のタグ（仕様の表。cmap は 0 番）
const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT',
  'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function codepoints(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('latin1', 0, 4), 'wOF2');
  const numTables = b.readUInt16BE(12);
  let p = 48;
  const base128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const x = b[p++]; v = v * 128 + (x & 0x7f); if (!(x & 0x80)) return v; } throw new Error('bad UIntBase128'); };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = b[p++];
    let tag = KNOWN[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = b.toString('latin1', p, p + 4); p += 4; }
    const version = flags >> 6;
    const orig = base128();
    const transformed = (tag === 'glyf' || tag === 'loca') ? version === 0 : version !== 0;
    tables.push({ tag, len: transformed ? base128() : orig });
  }
  const data = zlib.brotliDecompressSync(b.subarray(p, p + b.readUInt32BE(20)));
  let off = 0, cmap = null;
  for (const t of tables) { if (t.tag === 'cmap') cmap = data.subarray(off, off + t.len); off += t.len; }
  const set = new Set();
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const so = cmap.readUInt32BE(4 + i * 8 + 4);
    const fmt = cmap.readUInt16BE(so);
    if (fmt === 12) {
      const groups = cmap.readUInt32BE(so + 12);
      for (let g = 0; g < groups; g++) {
        const s = cmap.readUInt32BE(so + 16 + g * 12), e = cmap.readUInt32BE(so + 20 + g * 12);
        for (let c = s; c <= e; c++) set.add(c);
      }
    } else if (fmt === 4) {
      const segX2 = cmap.readUInt16BE(so + 6);
      const ends = so + 14, starts = ends + segX2 + 2;
      for (let k = 0; k < segX2; k += 2) {
        const e = cmap.readUInt16BE(ends + k), s = cmap.readUInt16BE(starts + k);
        for (let c = s; c <= e && c !== 0xffff; c++) set.add(c);
      }
    }
  }
  return set;
}

const dir = path.join(__dirname, '..', 'fonts');

test('漢字のフォントに、学年別漢字配当表の字がすべてある', () => {
  const cps = codepoints(path.join(dir, 'klee-kanji.woff2'));
  const src = fs.readFileSync(path.join(__dirname, '..', 'constants.js'), 'utf8');
  const kanji = [...new Set(src.match(/[一-鿿]/g))];
  assert.ok(kanji.length >= 1026);
  const missing = kanji.filter(k => !cps.has(k.codePointAt(0)));
  assert.deepEqual(missing, []);
});

test('かなのフォントに、ひらがな・カタカナ・長音がすべてある', () => {
  const cps = codepoints(path.join(dir, 'klee-kana.woff2'));
  const need = [];
  for (let c = 0x3041; c <= 0x3096; c++) need.push(c);
  for (let c = 0x30a1; c <= 0x30fa; c++) need.push(c);
  need.push(0x30fc);
  assert.deepEqual(need.filter(c => !cps.has(c)).map(c => String.fromCodePoint(c)), []);
});

test('フォントのファイルは小さいまま（かな 60KB・漢字 400KB 以下）', () => {
  assert.ok(fs.statSync(path.join(dir, 'klee-kana.woff2')).size < 60 * 1024);
  assert.ok(fs.statSync(path.join(dir, 'klee-kanji.woff2')).size < 400 * 1024);
});

test('C は読める（constants.js の形が変わっていない）', () => { assert.ok(C); });
