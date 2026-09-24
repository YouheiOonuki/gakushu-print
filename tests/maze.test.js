// 迷路のテスト（必ず解ける・道はひとつ・むずかしさで大きさと枝分かれが増える）: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

const SEEDS = Array.from({ length: 30 }, (_, i) => i * 7919 + 1);

test('genMaze: どの種・どのむずかしさでも、すべてのマスがつながり、通路はマスの数−1（＝道はひとつ）', () => {
  for (const level of Object.keys(C.MAZE_LEVELS)) {
    for (const seed of SEEDS) {
      const m = C.genMaze(level, seed, 0);
      const L = C.MAZE_LEVELS[level];
      assert.equal(m.cols, L.cols);
      assert.equal(m.rows, L.rows);
      const s = C.mazeStats(m);
      assert.equal(s.reachable, s.cells, `${level} ${seed}: すべてのマスに行ける`);
      assert.equal(s.passages, s.cells - 1, `${level} ${seed}: 輪がない（完全迷路）`);
      assert.ok(m.path.length > 0, '解ける');
      assert.equal(m.path[0], m.start);
      assert.equal(m.path[m.path.length - 1], m.goal);
    }
  }
});

test('genMaze: 壁は両側でそろっている（片側だけの壁がない）', () => {
  const m = C.genMaze('hard', 3, 0);
  for (let y = 0; y < m.rows; y++) {
    for (let x = 0; x < m.cols; x++) {
      const i = y * m.cols + x;
      if (x < m.cols - 1) assert.equal(!!(m.walls[i] & 2), !!(m.walls[i + 1] & 8));
      if (y < m.rows - 1) assert.equal(!!(m.walls[i] & 4), !!(m.walls[i + m.cols] & 1));
      if (x === 0) assert.ok(m.walls[i] & 8, '外周の左');
      if (y === m.rows - 1) assert.ok(m.walls[i] & 4, '外周の下');
    }
  }
});

test('genMaze: 答えの道は隣り合うマスを通り、同じマスを 2 回通らない', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const m = C.genMaze('normal', seed, 0);
    assert.equal(new Set(m.path).size, m.path.length);
    for (let i = 1; i < m.path.length; i++) {
      const a = m.path[i - 1], b = m.path[i];
      const d = Math.abs((a % m.cols) - (b % m.cols)) + Math.abs(Math.floor(a / m.cols) - Math.floor(b / m.cols));
      assert.equal(d, 1);
    }
  }
});

test('genMaze: 答えの道は短すぎない（たて＋よこの 1.6 倍を目安に作り直す）', () => {
  for (const level of Object.keys(C.MAZE_LEVELS)) {
    const L = C.MAZE_LEVELS[level];
    const lens = SEEDS.map((s) => C.genMaze(level, s, 0).path.length);
    const min = Math.min(...lens);
    assert.ok(min >= L.cols + L.rows - 1, `${level}: 最短でも左上から右下までの距離以上（${min}）`);
    const ok = lens.filter((n) => n >= (L.cols + L.rows) * 1.6).length;
    assert.ok(ok >= lens.length * 0.9, `${level}: 9 割以上が目安を満たす（${ok}/${lens.length}）`);
  }
});

test('genMaze: むずかしいほど行き止まりが多い（1 マスあたり）', () => {
  const avg = (level) => {
    const xs = SEEDS.map((s) => { const st = C.mazeStats(C.genMaze(level, s, 0)); return st.deadEnds / st.cells; });
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const e = avg('easy'), n = avg('normal'), h = avg('hard');
  assert.ok(e < n && n < h, `easy ${e.toFixed(3)} < normal ${n.toFixed(3)} < hard ${h.toFixed(3)}`);
});

test('genMaze: 同じ種・同じページは同じ迷路、ページがちがえばちがう迷路', () => {
  assert.deepEqual(C.genMaze('normal', 5, 0).walls, C.genMaze('normal', 5, 0).walls);
  assert.notDeepEqual(C.genMaze('normal', 5, 0).walls, C.genMaze('normal', 5, 1).walls);
});
