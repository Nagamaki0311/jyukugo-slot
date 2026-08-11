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

