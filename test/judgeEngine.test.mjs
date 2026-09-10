// JudgeEngineのスコア計算式に対する回帰テスト。
// 実行方法: node --test test/judgeEngine.test.mjs (または node --test で一括実行)
//
// 【対象】JudgeEngine.evaluate()内のスコア式
//   score = round(100 * (2^n - 1) * (weightSum / n))
// nはそのtickで同時に成立した役数、weightSumは各役の重み（通常役=1.0、
// 端役=0.5）の合計。この式は所持金への配当（GameEngine.SCORE_TO_MONEY_RATE
// 経由）に直結するため、意図しない変更で配当が崩れないよう固定する。
//
// 乱数（受理抽選）を排除するため、acceptanceRate: 1.0（常に成立）で
// JudgeEngineを構築し、ReelEngineの盤面を既知の文字列で直接組み立てる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { JudgeEngine } from "../src/engine/JudgeEngine.js";
import { DictionaryEngine } from "../src/engine/DictionaryEngine.js";
import { ReelEngine } from "../src/engine/ReelEngine.js";
import { buildLinePairs } from "../src/judge/gridLines.js";

/**
 * @param {Record<number,string>} charsByIndex 明示的に指定したいセルのみ。
 *   指定しないセルは辞書に一致しない埋め文字「山」で埋める。
 * @param {Array<{word:string, reading:string, score:number}>} entries
 * @returns {{judgeEngine: JudgeEngine, reelEngine: ReelEngine, dictionaryEngine: DictionaryEngine}}
 */
function setupBoard(charsByIndex, entries) {
  const linePairs = buildLinePairs();
  const dictionaryEngine = new DictionaryEngine(entries);
  const reelEngine = new ReelEngine();
  const judgeEngine = new JudgeEngine(linePairs, { acceptanceRate: 1.0 });

  const chars = Array.from({ length: reelEngine.cellCount }, (_, i) => charsByIndex[i] ?? "山");
  let callIndex = 0;
  reelEngine.reset(0, () => chars[callIndex++]);

  return { judgeEngine, reelEngine, dictionaryEngine };
}

test("スコア式: 通常役1件のみ成立(n=1, weight=1.0) => score=100", () => {
  // horizontalペア(0,1): リール0・行0
  const { judgeEngine, reelEngine, dictionaryEngine } = setupBoard(
    { 0: "国", 1: "語" },
    [{ word: "国語", reading: "こくご", score: 100 }]
  );

  const { results, score, n } = judgeEngine.evaluate(reelEngine, dictionaryEngine);

  assert.equal(n, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].word, "国語");
  assert.equal(results[0].type, "horizontal");
  assert.equal(score, 100, "round(100 * (2^1-1) * (1.0/1)) = 100");
});

test("スコア式: 端役1件のみ成立(n=1, weight=0.5) => score=50", () => {
  // edgeペア(1,2): リール0とリール1の境界、行0
  const { judgeEngine, reelEngine, dictionaryEngine } = setupBoard(
    { 1: "分", 2: "家" },
    [{ word: "分家", reading: "ぶんけ", score: 100 }]
  );

  const { results, score, n } = judgeEngine.evaluate(reelEngine, dictionaryEngine);

  assert.equal(n, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].word, "分家");
  assert.equal(results[0].type, "edge");
  assert.equal(score, 50, "round(100 * (2^1-1) * (0.5/1)) = 50");
});

test("スコア式: 通常役+端役が同時成立(n=2, 重み平均0.75) => score=225", () => {
  // horizontalペア(0,1)="国語"(通常役,weight1.0) と
  // edgeペア(3,4)="分家"(端役,weight0.5) を、互いに無関係なセルで同時に成立させる。
  const { judgeEngine, reelEngine, dictionaryEngine } = setupBoard(
    { 0: "国", 1: "語", 3: "分", 4: "家" },
    [
      { word: "国語", reading: "こくご", score: 100 },
      { word: "分家", reading: "ぶんけ", score: 100 },
    ]
  );

  const { results, score, n } = judgeEngine.evaluate(reelEngine, dictionaryEngine);

  assert.equal(n, 2);
  // JS文字列比較(UTF-16コード単位)では「分」(U+5206) < 「国」(U+56FD)の順になる
  const words = results.map((r) => r.word).sort();
  assert.deepEqual(words, ["分家", "国語"]);
  const types = results.map((r) => r.type).sort();
  assert.deepEqual(types, ["edge", "horizontal"]);
  // weightSum = 1.0(通常) + 0.5(端役) = 1.5, weightSum/n = 0.75
  // score = round(100 * (2^2-1) * 0.75) = round(225) = 225
  assert.equal(score, 225);
});

test("辞書に一致しない盤面では成立しない(n=0, score=0)", () => {
  const { judgeEngine, reelEngine, dictionaryEngine } = setupBoard(
    {},
    [{ word: "国語", reading: "こくご", score: 100 }]
  );

  const { results, score, n } = judgeEngine.evaluate(reelEngine, dictionaryEngine);

  assert.equal(n, 0);
  assert.equal(score, 0);
  assert.equal(results.length, 0);
});

test("一度成立したペアは再評価されない(reset()するまで二重成立しない)", () => {
  const { judgeEngine, reelEngine, dictionaryEngine } = setupBoard(
    { 0: "国", 1: "語" },
    [{ word: "国語", reading: "こくご", score: 100 }]
  );

  const first = judgeEngine.evaluate(reelEngine, dictionaryEngine);
  assert.equal(first.n, 1);

  // 盤面・受理抽選は変わらないが、同一tick内で連続evaluate()しても
  // 確定済みペアは対象外になる(_confirmedPairsによる重複成立防止)。
  const second = judgeEngine.evaluate(reelEngine, dictionaryEngine);
  assert.equal(second.n, 0, "既に成立確定したペアは再度成立しない");

  judgeEngine.reset();
  const third = judgeEngine.evaluate(reelEngine, dictionaryEngine);
  assert.equal(third.n, 1, "reset()後は同じ盤面でも再度評価される");
});
