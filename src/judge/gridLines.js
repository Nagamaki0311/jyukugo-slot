/**
 * 判定ラインの座標定義。
 *
 * グリッド座標系: 5行×6列（row: 0-4, col: 0-5）。
 * リールr（0,1,2）は列 2r・2r+1 を占有する。
 * セルインデックス = row * 6 + col（0〜29）。
 *
 * 種別ごとの対象:
 *   - horizontal（横）: 同一リール内、同じ行の列(2r, 2r+1)
 *   - vertical（縦）  : 同一リール内、同じ列の隣接行(i, i+1)
 *   - diagonal（斜め）: 同一リール内、隣接行×隣接列の2方向
 *   - edge（端役）    : 隣接するリール同士の境界をまたぐ、同じ行の列
 *                       （左列⇔中央列、中央列⇔右列）。通常役の50%スコア。
 *
 * 合計: 横15 + 縦24 + 斜め24 + 端役10 = 73ペア
 */

const ROWS = 5;
const COLS = 6;
const REEL_COUNT = 3;

export function cellIndex(row, col) {
  return row * COLS + col;
}

export function cellCenterPercent(index) {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  return {
    x: ((col + 0.5) / COLS) * 100,
    y: ((row + 0.5) / ROWS) * 100,
  };
}

export { ROWS, COLS, REEL_COUNT };

export function buildLinePairs() {
  const pairs = [];

  // 横（15ペア）: リール内、同じ行の2列
  for (let r = 0; r < REEL_COUNT; r++) {
    const colLeft = 2 * r;
    const colRight = 2 * r + 1;
    for (let row = 0; row < ROWS; row++) {
      pairs.push({
        type: "horizontal",
        a: cellIndex(row, colLeft),
        b: cellIndex(row, colRight),
      });
    }
  }

  // 縦（24ペア）: リール内、同じ列の隣接行
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS - 1; row++) {
      pairs.push({
        type: "vertical",
        a: cellIndex(row, col),
        b: cellIndex(row + 1, col),
      });
    }
  }

  // 斜め（24ペア）: リール内、隣接行×隣接列の2方向
  for (let r = 0; r < REEL_COUNT; r++) {
    const colLeft = 2 * r;
    const colRight = 2 * r + 1;
    for (let row = 0; row < ROWS - 1; row++) {
      pairs.push({
        type: "diagonal",
        a: cellIndex(row, colLeft),
        b: cellIndex(row + 1, colRight),
      });
      pairs.push({
        type: "diagonal",
        a: cellIndex(row, colRight),
        b: cellIndex(row + 1, colLeft),
      });
    }
  }

  // 端役（10ペア）: 隣接するリール境界をまたぐ、同じ行同士
  // （リールrの右列とリールr+1の左列）。通常役の50%スコアで扱う。
  for (let boundary = 0; boundary < REEL_COUNT - 1; boundary++) {
    const rightColOfLeftReel = 2 * boundary + 1;
    const leftColOfRightReel = 2 * boundary + 2;
    for (let row = 0; row < ROWS; row++) {
      pairs.push({
        type: "edge",
        a: cellIndex(row, rightColOfLeftReel),
        b: cellIndex(row, leftColOfRightReel),
      });
    }
  }

  return pairs;
}

