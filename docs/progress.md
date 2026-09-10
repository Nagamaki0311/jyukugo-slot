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

## 2026-09-10 T-006: デザイン刷新で使用した配色のWCAGコントラスト比監査

### 実施内容
- AGENTS.mdが「手を抜かない対象」に明示するアクセシビリティについて、T-001のデザイン刷新で扱った配色トークンの組み合わせを正式にWCAGコントラスト比で検証していなかったため、実施した。
- WCAG 2.xの相対輝度・コントラスト比算出式をNode.jsスクリプトで実装し、実際にstyle.cssで使われている前景/背景の組み合わせ14件（本文、スコア表示、マス内文字、ボタン文字、ツールチップ、コンボ/リプレイバナー、リザルト画面の各要素等）を計算した。文字サイズに応じてWCAG AAの基準（通常文字4.5:1、大きめ文字[約18.66px太字/24px相当以上]3:1）を使い分けた。
- `.result-card-rank`（リザルト画面の称号表示、`--color-ki` #8b6e4e on `--color-washi` #f1ead9、font-size:0.8remの小さめ文字のため4.5:1が基準）が3.95:1でAA基準未達であることを発見した。
- `--color-ki`は装飾罫線・枠線（`.subtitle`の区切り線、`.debug-panel`のborder）でも使われており、コントラスト基準はテキストにのみ適用されるためトークン自体は変更せず、`.result-card-rank`の`color`のみ同系色でより暗い`#765e42`（同背景に対し5.08:1、安全マージンを持ってAA達成）に直接上書きした。

### 結果
- 修正後、14件全ての組み合わせがWCAG AA基準を満たすことを確認した。
- Playwrightで強制的にゲームオーバー画面を表示させ、称号表示（例:「初心」）の視認性が改善されていることをスクリーンショットで確認した。
- `.result-card-rank`以外のCSSルール・`.result-card-rank`のフォントサイズ/レイアウト自体には変更を加えていない。

### 次回開始位置
- 特になし。継続的な監視（GitHub issue/PR、本番サイトの疎通）はManagerが別途行う。

---

## 2026-09-10 T-005: JudgeEngineのスコア計算式に自動回帰テストを追加

### 実施内容
- T-004に続き、実際の配当額を左右するもう一つの中核ロジックとして、JudgeEngine.evaluate()のスコア計算式（`score = round(100 * (2^n - 1) * (weightSum / n))`、通常役weight=1.0・端役weight=0.5）に回帰テストを追加した（`test/judgeEngine.test.mjs`、node:test、追加依存なし）。
- 受理抽選（acceptanceRate）の乱数を排除するため、`acceptanceRate: 1.0`でJudgeEngineを構築し、ReelEngineの盤面を`reset(now, nextCharFn)`経由で既知の文字列に直接設定する`setupBoard()`ヘルパーを用意した。最小の2エントリ辞書（「国語」「分家」）のみを使い、テスト対象以外の全73ペアが意図せず一致しないことを手計算で確認した上で実装した。
- テストケース: 通常役1件のみ(n=1,score=100)、端役1件のみ(n=1,score=50)、通常役+端役の同時成立(n=2,重み平均0.75,score=225)、辞書不一致時の非成立(n=0)、`_confirmedPairs`による重複成立防止（同一tick内での再evaluate()では成立せず、`reset()`後は再評価される）。
- 初回実装時、「通常役+端役の同時成立」テストで`results`の順序をソートした配列の期待値を`["国語", "分家"]`と誤って書いていたため1件失敗した（JSの文字列比較はUTF-16コード単位のため「分」(U+5206) < 「国」(U+56FD)で「分家」が先に来るのが正しい）。JudgeEngine側のバグではなくテストの期待値の誤りだったため、期待値を`["分家", "国語"]`に修正して解決した。
- `README.md`のテスト説明をJudgeEngine分も含む記載に更新した。

### 結果
- `node --test`で13件すべて合格（8件はT-004のGameEngineテスト、5件が今回追加のJudgeEngineテスト）。
- JudgeEngine.js・既存のゲームロジックへの変更は行っていない（テスト追加のみ）。

### 次回開始位置
- 特になし。継続的な監視（GitHub issue/PR、本番サイトの疎通）はManagerが別途行う。

---

## 2026-09-10 T-004: GameEngineの所持金・スコアロジックに自動回帰テストを追加

### 実施内容
- 本リポジトリには自動テストが一つも存在せず、GameEngine.js冒頭のコメントが参照する`test/verify_integration.js`・`test/verify_jackpot.js`・`test/verify_replay_freq.js`も実体としてコミットされていない（開発時のローカル検証用スクリプトだったと推測される）ことを確認した。
- T-001で修正した「所持金とスコアが同時に消費されるように見える」バグは表示層の契約（`state.spinning`のときだけ`spinScore`を加算する）に起因していたため、この契約とGameEngineの所持金増減ロジックをコードで固定する回帰テストを追加することにした。ビルドツール・テストフレームワークを新規導入せず、Node.js標準の`node:test`・`node:assert/strict`のみを使用（`test/gameEngine.test.mjs`）。
- テスト内容: 初期所持金、`startSpin()`の所持金減算（通常時/リプレイ時の違い）、`_settleSpin()`の配当加算とセッションスコア合算、UIEngine.render()と同じ表示式を使った二重加算の回帰確認（修正前の式なら二重加算すること・修正後の式なら一致することの両方をアサート）、ゲームオーバー条件（所持金枯渇時/リプレイ残存時）、`resetSession()`の初期化。
- `README.md`にテストの実行方法（`node --test`）を追記した。

### 結果
- `node --test`で8件すべて合格（pass 8, fail 0）を確認した。
- GameEngine.js・既存のゲームロジックへの変更は行っていない（テスト追加のみ）。

### 次回開始位置
- 特になし。継続的な監視（GitHub issue/PR、本番サイトの疎通）はManagerが別途行う。

---

## 2026-09-10 T-003: 長時間プレイでのDOM/メモリリーク検証

### 実施内容
- T-001/T-002までで直近の実装は一通り修正済みのため、これまで未検証だった観点として、長時間プレイ時のパフォーマンス（Issueで明示された「スマートフォンでも軽快に動作する」要件に直結）を検証した。
- Playwrightで45スピン連続プレイ（ゲームオーバーに到達した場合は「もう一度プレイ」で継続）を自動実行し、10スピンごとに演出が完全に収まったアイドルタイミングでDOMノード総数・`effect-layer`/`banner-layer`の残留子要素数・`result-list`の項目数・JSヒープサイズ（`performance.memory`、`--enable-precise-memory-info`付き起動）をサンプリングした。

### 結果
- DOMノード総数: 232→235（45スピンで+3、誤差範囲。増加トレンドなし）。
- `effect-layer`・`banner-layer`: 全サンプルで残留要素0件（パーティクル・衝撃波・バナー等の一時要素が確実に自己消去されている）。
- JSヒープ: 20.02MB→10.97MB（減少。10/20/30/40スピン時点でも11.1MB→10.75MB→11.04MB→11.3MBとほぼ横ばいで、増加トレンドなし）。
- `result-list`項目数は0→1→1→4→8→3と推移し、8付近まで増えた後に3へ減少している箇所があるが、これはゲームオーバー到達→リプレイ押下で`clearResultList()`が呼ばれたことによる正常なリセット（バグではない）。
- アプリ起因のコンソール/ページエラーはなし。
- 総合判定: 長時間プレイでのDOM/メモリリークは検出されず。コード変更は行っていない（検証のみで問題なしと確認）。

### 次回開始位置
- 特になし。継続的な監視（GitHub issue/PR、本番サイトの疎通）はManagerが別途行う。

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

