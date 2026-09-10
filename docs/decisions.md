# 設計判断記録 (ADR)

設計判断、採用理由、変更履歴を記録する。新しいエントリは末尾に追加する（古い順）。

## 記録フォーマット

```
## D-XXX: タイトル

- 日付: YYYY-MM-DD
- 状態: 採用 / 却下 / 廃止（廃止の場合は後継のDを記載）

### 背景
- なぜこの判断が必要になったか

### 決定
- 何を決定したか

### 理由
- なぜその選択をしたか（検討した代替案があれば併記）

### 影響
- この決定が及ぼす影響、制約
```

---

## D-001: 所持金・スコア二重消費バグの修正範囲をUIEngine.render()の表示式1箇所に限定する

- 日付: 2026-08-11
- 状態: 採用

### 背景
- Issueでは「所持金とスコアが同時に消費される」現象の根本原因をGameEngineの状態管理・スピン処理側にあると想定し、表示だけの修正で済ませないよう指示されていた。実際に確認したところ、GameEngine.money/sessionScore/totalScoreの増減ロジック自体に二重減算は存在せず、原因はUIEngine.render()の表示式`sessionScore + spinScore`が、スピン終了後〜次スピン開始前の間だけspinScoreを二重に含んでしまうことだった。

### 決定
- GameEngine.js（経済ロジック本体）は変更しない。UIEngine.render()の表示式のみ`state.spinning`の間だけspinScoreを加算するよう修正する。

### 理由
- GameEngine._settleSpin()がspinScoreをクリアしないのは意図的な設計（main.jsのrecordSpinResult呼び出しや デバッグログが、スピン終了直後もfinalState.spinScoreで「直近スピンのスコア」を参照するため）。ここでspinScoreをクリアすると、その参照が壊れて実際の累計保存(localStorage)にリグレッションが生じる。
- 一方、表示側の「進行中のスピンのスコアをリアルタイムに見せる」という設計意図（spinning中のみsessionScoreに上乗せする）は元のコメントにも明記されており、`state.spinning`の条件を1つ加えるだけでこの意図通りに直す方が、既存のゲームシステムへの影響範囲を最小化できる。

### 影響
- 経済シミュレーション用コメント（GameEngine.js冒頭のSPIN_COST/SCORE_TO_MONEY_RATE等の調整根拠）や既存のtest/verify_*.js（リポジトリには同梱されていないコメント記載のみ）には影響しない。
- 表示のみの修正のため、既存のrecordSpinResult・リザルト画面（sessionScoreを直接参照）には影響がないことを確認済み。

---

## D-002: T-001成果物のレビュー指摘・QA発見バグの修正方針

- 日付: 2026-09-10
- 状態: 採用

### 背景
- T-001（デザイン刷新・所持金/スコア表示バグ修正）のマージ後、reviewer Agentによる敵対的レビューとPlaywrightによる実ブラウザQAを追加で実施し、以下3件の不具合を発見した。
  1. （QAで発見）デバッグモードのトグルで`judge-lines-overlay`（`<svg>`要素）が表示されない。`element.hidden = false`はHTMLElementでは属性の除去に反映されるが、SVGElementでは反映されないブラウザ実装があり、`hidden`属性が残ったままCSSの`[hidden] { display: none }`が効き続けていた。
  2. （reviewer Agentが発見、CONFIRMED）タップ波紋(ripple)演出が、マス（`.cell`、`gap: 0`で隣接マスと密着）の境界からはみ出して隣のマスの上に視覚的に重なる。
  3. （reviewer Agentが発見、PLAUSIBLE）スコア/所持金加算時の発光演出（`.score-value-gain`）を600ms以内に連続発火させると、先に積んだ`setTimeout`が後発のアニメーション中にクラスを誤って剥がし、演出が本来より早く途切れる場合がある。

### 決定
1. `overlay.hidden = boolean`の代入を`overlay.toggleAttribute("hidden", boolean)`に置き換える（`UIEngine.js`の該当2箇所）。
2. `.cell`自体に`overflow: hidden`を付けるのではなく、ripple専用のクリップ層（`.cell-ripple-layer`、`.cell`の子として追加）を新設し、そこへrippleを生成するよう変更する。
3. `setTimeout`による固定時間後のクラス除去を廃し、`animationend`イベントでクラスを外す共通ヘルパー`UIEngine#_flashGain()`を新設し、`onHit()`・`playMoneyPopup()`の両方から呼ぶよう統一する。ただし`prefers-reduced-motion`環境ではCSS側で`animation: none`となり`animationend`が発火しないため、その環境ではクラス付与自体を行わないガードを追加する。

### 理由
1. `toggleAttribute`はSVG/HTML問わずElement共通で属性を直接操作するため、IDLプロパティの反映有無というブラウザ実装差異を回避できる。
2. `.cell`に`overflow: hidden`を付けると、既存仕様である成立時ポップ演出（`cell-char`をマス境界の外まで拡大させる、既存コードコメントに明記された意図的な演出）まで切り取ってしまう回帰を招くため、影響範囲を波紋のみに限定する専用レイヤーを追加する方が安全（判定ラダー: 既存コードベースに同等の実装がないため最小の新規要素を追加）。
3. `animationend`はCSS側の実際のアニメーション時間と常に同期するため、JS側に600msという重複したマジックナンバーを持たずに済み、複数呼び出しが競合しても「最後に開始したアニメーションの終了」を正しく待てる（remove→reflow→addで前のアニメーションインスタンスを中断した場合、中断されたインスタンスの`animationend`は発火しない）。

### 影響
- いずれもUIEngine.js/style.cssの局所的な修正であり、GameEngine.js等のゲームロジックには影響しない。
- Playwright QA（プレイヤーからの入力・reduced-motion・レース条件の再現テスト含む）で再現・修正の両方を確認済み。

---

## D-003: テストフレームワークを導入せずNode.js標準のnode:testで回帰テストを追加する

- 日付: 2026-09-10
- 状態: 採用

### 背景
- 本リポジトリには自動テストが一つも存在しなかった。`GameEngine.js`冒頭のコメントは`test/verify_integration.js`等のシミュレーションスクリプトを根拠として経済パラメータ（SPIN_COST・SCORE_TO_MONEY_RATE等）の調整理由を説明しているが、これらのファイルは実体としてコミットされていない。
- T-001で修正した表示バグ（D-001参照）は、GameEngineが公開する状態（`sessionScore`・`spinScore`・`spinning`）の意味的な契約をUIEngine側が誤解していたことに起因する。この契約は今後もGameEngine側の実装変更（例: `_settleSpin()`のタイミング変更）によって静かに破られうる。

### 決定
- Vitest/Jest等のテストフレームワークやビルドツールは導入せず、Node.js標準の`node:test`・`node:assert/strict`のみを使い、`test/gameEngine.test.mjs`を新設する。
- テスト対象はGameEngineの所持金・スコア関連の状態遷移（`startSpin`・`_settleSpin`・`resetSession`・ゲームオーバー条件）と、UIEngine.render()が依存する表示契約（スピン中のみspinScoreを加算する）の両方とする。
- `README.md`に実行方法（`node --test`）を追記する。

### 理由
- 判定ラダー（AGENTS.md）に従い、まず「そもそも必要か」を検討した。本リポジトリはビルドツールを一切使わない素のESM構成であり、フレームワーク追加は依存関係・設定ファイルの増加を伴う。Node.js 18以降で標準搭載されている`node:test`で要件（アサーション・グルーピング・CLI実行）を満たせるため、既存の実行環境（本番はブラウザ、開発はNode）に新たな依存を追加しない選択をした。
- GameEngineはDOM等のブラウザAPIに依存しない純粋なクラス群（RandomEngine/DictionaryEngine/ReelEngine/JudgeEngine/GameEngine）であるため、Node上で直接importしてテストできる。UIEngine.jsはDOM操作を伴うためテスト対象から除外し、代わりにUIEngine.render()が依存する「スピン中のみspinScoreを加算する」という契約をGameEngineの状態に対するアサーションとして固定することで、UIEngine側の実装を変更せずに同等の回帰保護を得ている。

### 影響
- 新規ファイル`test/gameEngine.test.mjs`の追加のみ。既存のゲームロジック・UIコードへの変更はない。
- `node --test`で8件すべて合格することを確認済み。

