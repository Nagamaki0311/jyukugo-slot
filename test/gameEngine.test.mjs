// GameEngineの所持金・スコア関連の状態遷移に対する回帰テスト。
// ビルドツール・追加依存を導入しないため、Node.js標準のnode:testを使う。
// 実行方法: node --test test/
//
// 【背景】2026-09-10、UIEngine.render()の「現在のスコア」表示式
// (sessionScore + spinScore) が、スピン終了後〜次スピン開始前の間だけ
// spinScoreを二重に含んでしまうバグを修正した(D-001参照)。
// GameEngine._settleSpin()がspinScoreをクリアしないのは意図的な設計
// (recordSpinResult等が直近スピンのスコアを参照するため)であり、
// 表示側はstate.spinningを見て二重加算を避ける契約になっている。
// このファイルはGameEngine側の状態遷移そのものと、UIEngine.render()が
// 依存しているこの契約の両方を固定する。

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GameEngine,
  INITIAL_MONEY,
  SPIN_COST,
  SCORE_TO_MONEY_RATE,
} from "../src/engine/GameEngine.js";

// 辞書一致に依存する乱数抽選(JudgeEngine.evaluate等)を経由せず、
// spinScore/totalScore等を直接操作して「ヒットが発生した状態」を再現する。
// 辞書自体はGameEngine構築に最低限必要な形（配列であること）だけを満たす。
function createEngine() {
  const kanjiList = ["国", "語", "分", "家", "時"];
  const jukugoEntries = [{ word: "国語", reading: "こくご", score: 100 }];
  return new GameEngine(kanjiList, jukugoEntries);
}

test("初期状態: 所持金はINITIAL_MONEY、セッションスコアは0", () => {
  const engine = createEngine();
  assert.equal(engine.money, INITIAL_MONEY);
  assert.equal(engine.sessionScore, 0);
  assert.equal(engine.spinScore, 0);
  assert.equal(engine.gameOver, false);
});

test("startSpin(非リプレイ): 所持金がSPIN_COST分だけ減少し、spinScoreは0にリセットされる", () => {
  const engine = createEngine();
  const before = engine.money;

  engine.spinScore = 999; // 前回スピンの残留値を模す
  const started = engine.startSpin(0);

  assert.equal(started, true);
  assert.equal(engine.money, before - SPIN_COST);
  assert.equal(engine.spinScore, 0);
  assert.equal(engine.isReplaySpin, false);
});

test("startSpin(リプレイ): 所持金は変化せず、pendingReplaysが1減る", () => {
  const engine = createEngine();
  engine._pendingReplays = 2;
  const before = engine.money;

  engine.startSpin(0);

  assert.equal(engine.money, before, "リプレイスピンは所持金を消費しない");
  assert.equal(engine._pendingReplays, 1);
  assert.equal(engine.isReplaySpin, true);
});

test("_settleSpin(): spinScoreに応じた配当がmoneyへ加算され、sessionScoreにspinScoreが合算される", () => {
  const engine = createEngine();
  engine.startSpin(0);
  const moneyAfterCost = engine.money;

  engine.spinScore = 300; // このスピンでの獲得スコアを模す
  engine._settleSpin();

  const expectedGain = Math.floor(300 * SCORE_TO_MONEY_RATE);
  assert.equal(engine.money, moneyAfterCost + expectedGain);
  assert.equal(engine.sessionScore, 300);
  // spinScore自体はクリアされない(recordSpinResult等が直近スピンのスコアを
  // 参照するための意図的な仕様。D-001/D-002参照)。
  assert.equal(engine.spinScore, 300);
});

test(
  "回帰テスト: UIEngine.render()が依存する「スピン中のみspinScoreを加算する」" +
    "契約を満たさないと、スピン終了後の表示スコアが二重加算される",
  () => {
    const engine = createEngine();
    engine.startSpin(0);
    engine.spinScore = 300;
    engine._settleSpin(); // spinning=falseはtick()側の責務のため、ここではテスト用に明示する
    engine.spinning = false;

    const state = engine.getState();

    // UIEngine.render()と同じ式(修正後): スピン中のみspinScoreを加算する。
    const displayScoreFixed =
      (state.sessionScore || 0) + (state.spinning ? state.spinScore || 0 : 0);
    assert.equal(
      displayScoreFixed,
      300,
      "修正後の式ではスピン終了後にsessionScore単体(=300)と一致するはず"
    );

    // 修正前の式(spinningを見ない)だと二重加算されてしまうことを確認し、
    // この契約がなぜ必要かを将来の変更者にも分かるようにする。
    const displayScoreBuggy = (state.sessionScore || 0) + (state.spinScore || 0);
    assert.equal(
      displayScoreBuggy,
      600,
      "修正前の式は二重加算(300+300)されるため、意図的に不一致になることを確認"
    );
  }
);

test("ゲームオーバー: 所持金がSPIN_COST未満かつpendingReplaysが0ならゲームオーバーになる", () => {
  const engine = createEngine();
  engine.money = SPIN_COST - 1;
  engine.spinScore = 0;

  engine._settleSpin();

  assert.equal(engine.gameOver, true);
});

test("ゲームオーバー回避: 所持金が尽きていてもpendingReplaysが残っていればゲームオーバーにならない", () => {
  const engine = createEngine();
  engine.money = SPIN_COST - 1;
  engine.spinScore = 0;
  engine._pendingReplays = 1;

  engine._settleSpin();

  assert.equal(engine.gameOver, false);
});

test("resetSession(): 所持金・セッション統計が初期値に戻る", () => {
  const engine = createEngine();
  engine.money = 12345;
  engine.sessionScore = 999;
  engine.sessionPlayCount = 7;
  engine.gameOver = true;

  engine.resetSession();

  assert.equal(engine.money, INITIAL_MONEY);
  assert.equal(engine.sessionScore, 0);
  assert.equal(engine.sessionPlayCount, 0);
  assert.equal(engine.gameOver, false);
});
