# 作業履歴

作業内容、実施結果、次回開始位置を記録する。新しいエントリは先頭に追加する（新しい順）。

## 記録フォーマット

```
## YYYY-MM-DD タスクID/概要

### 実施内容
- 何を行ったか

### 結果
- 動作確認結果、テスト結果など

### 次回開始位置
- 次に着手すべき場所（ファイル/関数/タスクID）
```

---

## 2026-09-10 T-002: T-001成果物のレビュー指摘・QA発見バグの修正

### 実施内容
- ユーザーが8時間就寝する間の夜間作業として、T-001（デザイン刷新・スコア表示バグ修正、PR#3としてマージ済み）の成果物を追加で検証した。
- reviewer Agentをバックグラウンドで起動し、直近2コミットの差分（origin/main基準、project001同期コミット652080bも含めて確認）を敵対的レビューさせた。並行してPlaywrightによる実ブラウザQA（reduced-motion、連打時の多重起動防止、キーボード操作・フォーカストラップ、iPhone SE幅でのレイアウト、localStorage永続化、デバッグモード切替、15連続スピンでのエラー有無）を自ら実施した。
- 発見した3件を修正した：
  1. QAで発見: デバッグモードのトグルで`judge-lines-overlay`（SVG）が表示されない。`element.hidden = false`がSVGElementでは属性除去に反映されないブラウザ実装に起因していた。`UIEngine.js`の該当2箇所を`toggleAttribute("hidden", ...)`に置き換えて修正。
  2. reviewer Agentが発見（CONFIRMED）: タップ波紋(ripple)がマス境界からはみ出し隣接マスに重なる。`.cell`へ`overflow: hidden`を付けると既存の成立時ポップ演出（マス境界外への拡大、意図的な仕様）まで切り取ってしまうため、ripple専用のクリップ層`.cell-ripple-layer`を新設して対応。
  3. reviewer Agentが発見（PLAUSIBLE）: `score-value-gain`演出の`setTimeout`ベースのクラス除去が、600ms以内の連続発火（コンボ等）でレースし演出が早期に途切れる恐れ。`animationend`イベントで外す共通ヘルパー`_flashGain()`に統一し、`onHit()`・`playMoneyPopup()`双方から呼ぶよう変更。`prefers-reduced-motion`ではCSS側で`animation: none`となり`animationend`が発火しないため、その環境ではクラス付与自体をスキップするガードも追加した。
- 詳細な背景・判断理由はD-002（`docs/decisions.md`）に記録した。

### 結果
- SVG hidden属性の修正: Playwrightで`hasAttribute("hidden")`が正しくtrue/falseを切り替えることを確認（修正前はtoggle後もtrueのまま残留していた）。
- rippleクリップ層: `.cell-ripple-layer`の`overflow`計算値が`hidden`であること、タップでripple要素がそのレイヤー内に生成されることをPlaywrightのタッチイベント経由で確認。
- `_flashGain`レース修正: `_flashGain`を200ms間隔で2回連続呼び出すシミュレーションで、700ms時点（1回目基準なら消えているはずの時点）でもクラスが残り、900ms時点（2回目基準の600ms経過後）で正しく消えることを確認。reduced-motion環境ではクラス自体が付与されず残留しないことも確認。
- 修正後、初回のPlaywright QAスイート（reduced-motion／連打防止／キーボード操作・フォーカストラップ／iPhone SE幅／localStorage永続化／デバッグモード切替／15連続スピン）を再実行し、全12項目合格を確認した（修正前はデバッグモード切替のみNGだった）。

### 次回開始位置
- 特になし。git commit/pushはManagerが別途行う。

---

## 2026-08-11 T-001: デザイン刷新および所持金・スコア二重消費バグの修正

### 実施内容
- まず所持金・スコア・スピン処理・配当処理・リプレイ処理（GameEngine.js全体）を精読し、Node上でGameEngineのスピン一巡（startSpin→tick相当の状態操作→_settleSpin→次のstartSpin）を模したシミュレーションスクリプトで実際の数値遷移を再現した。
- 原因はGameEngine自体（money/sessionScore/totalScoreの増減ロジック）ではなく、UIEngine.render()の表示式`sessionScore + spinScore`にあると特定した。GameEngine._settleSpinはスピン終了時にspinScoreをsessionScoreへ合算するが、spinScore自体はrecordSpinResult等が直近スピンのスコアを参照するためクリアしない。そのため「スピン終了後〜次スピン開始前」の間だけ表示上二重加算され、次のスピン開始でspinScoreが0にリセットされる瞬間に表示スコアが不当に下がる（＝所持金が減る一瞬と重なり「所持金とスコアが同時に消費される」ように見える）ことを確認した。
- 修正はUIEngine.render()の1箇所のみ：`state.spinning`のときだけspinScoreを加算するよう変更（スピン終了後はsessionScore単体が正しい合計）。GameEngine.js（経済ロジック本体）は無変更。
- デザイン刷新は既存の「和紙×墨×朱」の原稿用紙モチーフを土台に、ゼロから作り直さず深化させる方針で実施。style.cssに奥行き（shadow/gradient）・スコア加算時の発光・スピン中のアンビエント発光（baseティア）・スピン停止フラッシュ・タップ波紋(ripple)・盤面の立ち上がり演出・レスポンシブ調整（狭幅でのletter-spacing/paddingの折り返し対策）・リザルト画面のbackdrop-filterとフェードイン/アウトを追加。AnimationEngine.jsにplaySpinStart/playSpinStop/spawnRippleを追加し、main.js/UIEngine.jsから配線した。prefers-reduced-motionの対象クラスも新規追加分すべてに追記した。

### 結果
- Node上のシミュレーションで、修正前は「所持金470→449(スピンコスト分のみのはずが数値が合わない)・表示スコア600→300(2倍表示から正しい値へ落ちる)」という不整合を再現し、修正後は「表示スコアがスピン開始前後で完全に一致（下がらない）」ことを確認した。
- ローカル静的サーバー(python3 -m http.server)+Playwright（Chromium、デスクトップ1280×900とモバイル390×844の両方）で実ブラウザ動作を確認：
  - 初期表示・スピン・成立・所持金加算・スピン開始時のスコア不変・横スクロールなし・タップでのripple発火・強制ゲームオーバー時のリザルト表示とフェードクローズ、いずれも意図通り。
  - コンソールエラーはサンドボックス環境固有のGoogle Fonts外部接続失敗（フォント読み込み不可、システムフォントへフォールバックするのみで機能に影響なし）とブラウザ既定のfavicon.ico 404のみで、アプリコード起因のエラーは無し。
  - 初回、リザルトカードの見出し・ボタン文言が390px幅で不自然に折り返す問題を発見し、`@media (max-width: 420px)`でletter-spacing/paddingを調整して解消したことをスクリーンショット比較で確認した。

### 次回開始位置
- 特になし。git commit/pushはManagerが別途行う。

---

