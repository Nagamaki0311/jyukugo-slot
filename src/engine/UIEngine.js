import { buildLinePairs, cellCenterPercent } from "../judge/gridLines.js";

/**
 * UIEngine
 *
 * DOMの描画とユーザー入力（SPINボタン・設定変更・リザルト画面の再プレイ・
 * 成立マスのツールチップ表示）のバインディングを担当する。GameEngineの状態を
 * 「表示用に変換」するのみで、正のゲーム状態はGameEngineが保持する
 * （このEngineはGameEngineの状態を直接書き換えない）。
 *
 * 各セルは <div class="cell"><span class="cell-char">文字</span></div> という
 * 構造にしている。成立時の拡大演出（cell-pop）を内側のspanのみに適用することで、
 * マス自体のサイズ・レイアウトを変えずに文字だけが拡大するようにするため。
 */
export class UIEngine {
  /**
   * @param {{root: HTMLElement, gameEngine: import("./GameEngine.js").GameEngine, audioEngine: import("./AudioEngine.js").AudioEngine, createAnimationEngine: (getCharElement: (i:number)=>HTMLElement, getCellElement: (i:number)=>HTMLElement, effectLayerEl: HTMLElement, bannerLayerEl: HTMLElement) => import("./AnimationEngine.js").AnimationEngine}} params
   */
  constructor({ root, gameEngine, audioEngine, createAnimationEngine }) {
    this.root = root;
    this.gameEngine = gameEngine;
    this.audioEngine = audioEngine;

    this._cellElements = [];
    this._cellCharElements = [];
    this._prevGrid = [];
    this._debugVisible = false;

    this._buildDom();

    const effectLayerEl = this.root.querySelector('[data-role="effect-layer"]');
    const bannerLayerEl = this.root.querySelector('[data-role="banner-layer"]');
    // セルDOM構築後にAnimationEngineを生成する（getterがセル要素配列を参照するため）
    this.animationEngine = createAnimationEngine(
      (i) => this._cellCharElements[i],
      (i) => this._cellElements[i],
      effectLayerEl,
      bannerLayerEl
    );

    this._bindEvents();
  }

  _buildDom() {
    this.root.innerHTML = `
      <div class="jukugo-slot">
        <header class="header">
          <h1 class="title">熟語スロット</h1>
          <p class="subtitle">常用漢字二千百三十六字による国語スロット</p>
        </header>

        <div class="score-panel">
          <div class="score-item">
            <span class="score-label">所持金</span>
            <span class="score-value score-value-money" data-role="money">500円</span>
          </div>
          <div class="score-item">
            <span class="score-label">現在のスコア</span>
            <span class="score-value" data-role="current-score">0</span>
          </div>
        </div>

        <div class="reel-grid-wrapper" data-role="reel-grid-wrapper">
          <div class="reel-grid" data-role="reel-grid"></div>
          <svg class="judge-lines-overlay" data-role="judge-lines-overlay" hidden aria-hidden="true"></svg>
          <div class="effect-layer" data-role="effect-layer" aria-hidden="true"></div>
          <div class="banner-layer" data-role="banner-layer" aria-hidden="true"></div>
          <div class="word-tooltip" data-role="word-tooltip" hidden aria-hidden="true"></div>
        </div>

        <div class="controls">
          <button class="spin-button" data-role="spin-button">SPIN</button>
          <label class="debug-toggle">
            <input type="checkbox" data-role="debug-toggle" />
            デバッグモード
          </label>
        </div>

        <p class="sr-only" data-role="sr-announcer" aria-live="polite" aria-atomic="true"></p>

        <div class="result-panel">
          <h2 class="result-heading">成立熟語一覧</h2>
          <ul class="result-list" data-role="result-list"></ul>
        </div>

        <div class="stats-panel">
          <span>スピン回数: <span data-role="total-play-count">0</span></span>
          <span>最高コンボ: <span data-role="max-combo">0</span></span>
        </div>

        <div class="debug-panel" data-role="debug-panel" hidden>
          <div>FPS: <span data-role="debug-fps">-</span></div>
          <div>辞書検索時間(直近評価/ms): <span data-role="debug-search-time">-</span></div>
          <div class="debug-log" data-role="debug-log"></div>
        </div>

        <div
          class="result-overlay"
          data-role="result-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-card-heading"
          aria-describedby="result-card-sub"
          hidden
        >
          <div class="result-card" data-role="result-card">
            <div class="result-stamp" data-role="result-stamp" aria-hidden="true">
              <span data-role="result-stamp-text">終</span>
            </div>
            <p class="result-card-rank" data-role="result-rank">見習い</p>
            <h2 class="result-card-heading" id="result-card-heading">ゲームオーバー</h2>
            <p class="result-card-sub" id="result-card-sub">所持金が尽きました</p>
            <dl class="result-card-stats">
              <div><dt>最終スコア</dt><dd data-role="result-final-score">0</dd></div>
              <div><dt>最終所持金</dt><dd data-role="result-final-money">0円</dd></div>
              <div><dt>最大コンボ</dt><dd data-role="result-max-combo">0</dd></div>
              <div><dt>スピン回数</dt><dd data-role="result-play-count">0</dd></div>
            </dl>
            <button class="result-replay-button" data-role="result-replay-button">もう一度プレイ</button>
          </div>
        </div>
      </div>
    `;

    const grid = this.root.querySelector('[data-role="reel-grid"]');
    for (let i = 0; i < this.gameEngine.reelEngine.cellCount; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.index = String(i);
      cell.tabIndex = -1;

      const charEl = document.createElement("span");
      charEl.className = "cell-char";
      cell.appendChild(charEl);

      grid.appendChild(cell);
      this._cellElements.push(cell);
      this._cellCharElements.push(charEl);

      // マウス: ホバーで表示。タッチ/キーボード: タップ・Enter/Spaceでトグル表示。
      // mouseenter/leaveではなくpointerenter/leaveをpointerType==="mouse"に
      // 限定して使う。タッチ操作はtouchend後にmouseenter等のマウスイベントを
      // 合成発火することがあり、素朴にmouseenterへ反応すると
      // 「表示した直後に自分のclickで閉じる」二重発火になるため。
      cell.addEventListener("pointerenter", (e) => {
        if (e.pointerType === "mouse") this._showTooltipForCell(i, cell);
      });
      cell.addEventListener("pointerleave", (e) => {
        if (e.pointerType === "mouse") this._hideTooltip();
      });
      cell.addEventListener("pointerdown", (e) => {
        this._lastCellPointerType = e.pointerType;
      });
      cell.addEventListener("click", (e) => {
        if (this._lastCellPointerType === "mouse") return;
        e.stopPropagation();
        this._toggleTooltipForCell(i, cell);
      });
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          this._toggleTooltipForCell(i, cell);
        } else if (e.key === "Escape") {
          this._hideTooltip();
        }
      });
    }

    document.addEventListener("click", () => this._hideTooltip());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this._hideTooltip();
    });

    this._buildJudgeLinesOverlay();
  }

  _buildJudgeLinesOverlay() {
    const svg = this.root.querySelector('[data-role="judge-lines-overlay"]');
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");

    const colorByType = {
      horizontal: "rgba(166, 56, 44, 0.35)",
      vertical: "rgba(139, 110, 78, 0.45)",
      diagonal: "rgba(35, 33, 29, 0.3)",
    };

    const lines = buildLinePairs();
    const fragment = document.createDocumentFragment();
    for (const pair of lines) {
      const p1 = cellCenterPercent(pair.a);
      const p2 = cellCenterPercent(pair.b);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(p1.x));
      line.setAttribute("y1", String(p1.y));
      line.setAttribute("x2", String(p2.x));
      line.setAttribute("y2", String(p2.y));
      line.setAttribute("stroke", colorByType[pair.type] || "rgba(0,0,0,0.2)");
      line.setAttribute("stroke-width", "0.5");
      fragment.appendChild(line);
    }
    svg.appendChild(fragment);
  }

  /**
   * 成立済みマスにカーソルを合わせたとき、そのマスが関与して成立した
   * 熟語（複数ありうる）をツールチップで表示する。
   */
  _showTooltipForCell(index, cellEl) {
    const words = this.gameEngine.getWordsAtCell(index);
    if (!words || words.length === 0) return;

    const tooltip = this.root.querySelector('[data-role="word-tooltip"]');
    tooltip.innerHTML = words
      .map((w) => `<div>${w.word}（${w.reading}）</div>`)
      .join("");

    const wrapperRect = this.root
      .querySelector(".reel-grid-wrapper")
      .getBoundingClientRect();
    const cellRect = cellEl.getBoundingClientRect();
    const left = cellRect.left - wrapperRect.left + cellRect.width / 2;
    const top = cellRect.top - wrapperRect.top;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.hidden = false;
    this._shownTooltipIndex = index;
  }

  /**
   * タップ/クリック・キーボード操作用。同じマスへの操作なら閉じ、
   * 別マスまたは非表示状態なら表示する。
   */
  _toggleTooltipForCell(index, cellEl) {
    if (this._shownTooltipIndex === index) {
      this._hideTooltip();
      return;
    }
    this._showTooltipForCell(index, cellEl);
  }

  _hideTooltip() {
    const tooltip = this.root.querySelector('[data-role="word-tooltip"]');
    tooltip.hidden = true;
    this._shownTooltipIndex = null;
  }

  _bindEvents() {
    const spinButton = this.root.querySelector('[data-role="spin-button"]');
    spinButton.addEventListener("click", () => {
      this.audioEngine.play("buttonPress");
      this._onSpinRequested?.();
    });

    const debugToggle = this.root.querySelector('[data-role="debug-toggle"]');
    debugToggle.addEventListener("change", (e) => {
      this._debugVisible = e.target.checked;
      const panel = this.root.querySelector('[data-role="debug-panel"]');
      panel.hidden = !this._debugVisible;
      const overlay = this.root.querySelector('[data-role="judge-lines-overlay"]');
      overlay.hidden = !this._debugVisible;
      this._onSettingsChanged?.({ debug: this._debugVisible });
    });

    const replayButton = this.root.querySelector('[data-role="result-replay-button"]');
    replayButton.addEventListener("click", () => {
      this.audioEngine.play("buttonPress");
      this._onReplayRequested?.();
    });
  }

  /** @param {() => void} handler */
  onSpinRequested(handler) {
    this._onSpinRequested = handler;
  }

  /** @param {(partialSettings: object) => void} handler */
  onSettingsChanged(handler) {
    this._onSettingsChanged = handler;
  }

  /** @param {() => void} handler */
  onReplayRequested(handler) {
    this._onReplayRequested = handler;
  }

  setDebugVisible(visible) {
    this._debugVisible = visible;
    const toggle = this.root.querySelector('[data-role="debug-toggle"]');
    const panel = this.root.querySelector('[data-role="debug-panel"]');
    const overlay = this.root.querySelector('[data-role="judge-lines-overlay"]');
    toggle.checked = visible;
    panel.hidden = !visible;
    overlay.hidden = !visible;
  }

  setSpinButtonEnabled(enabled) {
    const spinButton = this.root.querySelector('[data-role="spin-button"]');
    spinButton.disabled = !enabled;
  }

  /**
   * スコア・所持金の表示数値を、値が変わったときだけ滑らかにカウントアップ/
   * ダウンさせる。同じ目標値への呼び出しは無視する（毎フレームrender()から
   * 呼ばれても、値が変わっていない限りアニメーションを再開させないため）。
   * prefers-reduced-motionが有効な場合は即座に確定値を表示する。
   * @param {string} key アニメーション状態を区別するキー（"score"|"money"等）
   * @param {HTMLElement} el
   * @param {number} toValue
   * @param {{suffix?: string, duration?: number}} [opts]
   */
  _animateNumberTo(key, el, toValue, opts = {}) {
    const { suffix = "", duration = 350 } = opts;
    const tweens = (this._numberTweens ||= new Map());
    const prev = tweens.get(key);

    if (prev && prev.target === toValue) return;

    const fromValue = prev ? prev.current : toValue;
    if (prev && prev.rafId != null) cancelAnimationFrame(prev.rafId);

    const prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || fromValue === toValue) {
      el.textContent = `${toValue}${suffix}`;
      tweens.set(key, { current: toValue, target: toValue, rafId: null });
      return;
    }

    const startTime = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - t) ** 3;
      const value = Math.round(fromValue + (toValue - fromValue) * eased);
      el.textContent = `${value}${suffix}`;
      if (t < 1) {
        const rafId = requestAnimationFrame(tick);
        tweens.set(key, { current: value, target: toValue, rafId });
      } else {
        tweens.set(key, { current: toValue, target: toValue, rafId: null });
      }
    };
    const rafId = requestAnimationFrame(tick);
    tweens.set(key, { current: fromValue, target: toValue, rafId });
  }

  /**
   * スピン終了直後、所持金の増減を score-item の近くに小さくポップアップ表示する。
   * @param {number} amount 増減額（円）。0のときは何もしない。
   */
  playMoneyPopup(amount) {
    if (!amount) return;
    const moneyEl = this.root.querySelector('[data-role="money"]');
    const moneyItem = moneyEl?.closest(".score-item");
    if (!moneyItem) return;

    const popup = document.createElement("span");
    popup.className = "money-popup";
    popup.textContent = amount > 0 ? `+${amount}円` : `${amount}円`;
    moneyItem.appendChild(popup);
    setTimeout(() => popup.remove(), 900);
  }

  /**
   * スクリーンリーダー向けに、視覚的には非表示のライブリージョンへ
   * メッセージを流す。役成立・リプレイ発生・ゲームオーバーなど、
   * 意味のある変化のみを通知し、毎フレームの盤面更新では呼ばない。
   * 直前と同一の文言でも再度読み上げられるよう、一度空にしてから設定する。
   * @param {string} text
   */
  announce(text) {
    const el = this.root.querySelector('[data-role="sr-announcer"]');
    if (!el) return;
    el.textContent = "";
    // 同一テキストの連続通知でも再読み上げされるよう、次フレームで設定する
    requestAnimationFrame(() => {
      el.textContent = text;
    });
  }

  /**
   * 毎フレーム呼び出し、GameEngineの状態をDOMへ反映する。
   * 「現在のスコア」は、このゲーム（セッション）で完了したスピンの合計
   * （sessionScore）に、進行中のスピンのスコア（spinScore）を加えたもの。
   * @param {object} state GameEngine.getState()の結果
   */
  render(state) {
    for (let i = 0; i < state.grid.length; i++) {
      const cellEl = this._cellElements[i];
      const charEl = this._cellCharElements[i];
      const char = state.grid[i] || "";
      if (charEl.textContent !== char) {
        charEl.textContent = char;
        if (this._prevGrid[i] !== char && !state.fixedFlags[i]) {
          this.animationEngine.playCellChange(i);
        }
      }
      cellEl.classList.toggle("cell-fixed", !!state.fixedFlags[i]);

      // 成立語を持つ確定マスのみキーボード操作対象にする
      // （タブ移動が30マス分ノイズにならないよう、意味のあるマスだけ含める）
      if (state.fixedFlags[i]) {
        const words = this.gameEngine.getWordsAtCell(i);
        if (words.length > 0 && cellEl.tabIndex !== 0) {
          cellEl.tabIndex = 0;
          cellEl.setAttribute(
            "aria-label",
            words.map((w) => `${w.word}（${w.reading}）`).join("、")
          );
        }
      } else if (cellEl.tabIndex !== -1) {
        cellEl.tabIndex = -1;
        cellEl.removeAttribute("aria-label");
      }
    }
    this._prevGrid = state.grid.slice();

    const currentScore = (state.sessionScore || 0) + (state.spinScore || 0);
    this._animateNumberTo(
      "score",
      this.root.querySelector('[data-role="current-score"]'),
      currentScore
    );
    this._animateNumberTo(
      "money",
      this.root.querySelector('[data-role="money"]'),
      state.money,
      { suffix: "円" }
    );

    const spinButton = this.root.querySelector('[data-role="spin-button"]');
    if (!state.spinning) {
      spinButton.textContent =
        state.pendingReplays > 0 ? "SPIN（リプレイ）" : "SPIN";
    }

    // spinTier（boost/jackpot）はスコアバランスには使われるがこれまで画面に
    // 一切表れていなかったため、スピン中のみ盤面を淡く発光させて
    // 「今回は何かが起きそうだ」という期待感を演出する。
    const wrapper = this.root.querySelector('[data-role="reel-grid-wrapper"]');
    wrapper.classList.toggle(
      "reel-grid-wrapper-boost",
      state.spinning && state.spinTier === "boost"
    );
    wrapper.classList.toggle(
      "reel-grid-wrapper-jackpot",
      state.spinning && state.spinTier === "jackpot"
    );
  }

  /**
   * @param {{results: Array<{a:number,b:number,word:string, reading:string, type:string}>, score:number, n:number, comboCount:number, comboIncreased:boolean}} hit
   */
  onHit(hit) {
    this.audioEngine.play("hit");
    this.animationEngine.playHit(hit.results.flatMap((r) => [r.a, r.b]));
    this.animationEngine.playScorePopup(hit.results, hit.score);

    // コンボ演出は「熟語の成立が連鎖しているか」で数えるcomboCountを使う。
    // 1コンボ（連鎖の起点となる最初の1語）では演出を出さず、2コンボ以上から表示する。
    if (hit.comboIncreased && hit.comboCount >= 2) {
      this.animationEngine.playComboBanner(hit.comboCount, hit.score);
    }

    // リプレイ成立箇所を、通常の成立よりさらに目立つゴールドの専用演出で
    // 強調表示してから「REPLAY」バナーを表示する。プレイヤーが
    // 「この組み合わせで成立した」と直感的に分かるよう、該当マスの中心に
    // バナーを表示する。
    if (hit.replayTriggered) {
      const replayIndices = [
        ...hit.replayDuplicateWordPairs.flatMap((p) => [p.a, p.b]),
        ...hit.replayAdjacentPairs.flatMap((p) => [p.a, p.b]),
      ];
      this.animationEngine.playReplayHighlight(replayIndices);
      this.animationEngine.playReplayBanner(replayIndices);
    }

    const list = this.root.querySelector('[data-role="result-list"]');
    for (const r of hit.results) {
      const li = document.createElement("li");
      li.textContent = `${r.word}（${r.reading}）`;
      list.prepend(li);
    }

    list.classList.toggle("result-list-overflowing", list.scrollHeight > list.clientHeight);

    if (hit.results.length > 0) {
      const words = hit.results.map((r) => `${r.word}（${r.reading}）`).join("、");
      const comboText = hit.comboCount >= 2 ? `、${hit.comboCount}連鎖` : "";
      this.announce(`成立: ${words}、プラス${hit.score}点${comboText}`);
    }
    if (hit.replayTriggered) {
      this.announce("リプレイ発生、もう一度スピンします");
    }
  }

  clearResultList() {
    const list = this.root.querySelector('[data-role="result-list"]');
    list.innerHTML = "";
    list.classList.remove("result-list-overflowing");
  }

  /**
   * @param {{totalPlayCount:number, maxCombo:number, totalWordsFound:number}} data
   */
  /**
   * @param {{sessionPlayCount:number, sessionMaxCombo:number}} state GameEngineのセッション状態
   */
  renderStats(state) {
    this.root.querySelector('[data-role="total-play-count"]').textContent = String(
      state.sessionPlayCount
    );
    this.root.querySelector('[data-role="max-combo"]').textContent = String(
      state.sessionMaxCombo
    );
  }

  /**
   * @param {{fps:number, lastSearchTimeMs:number}} debugInfo
   */
  renderDebug(debugInfo) {
    if (!this._debugVisible) return;
    this.root.querySelector('[data-role="debug-fps"]').textContent =
      debugInfo.fps.toFixed(1);
    this.root.querySelector('[data-role="debug-search-time"]').textContent =
      debugInfo.lastSearchTimeMs.toFixed(3);
  }

  appendDebugLog(line) {
    if (!this._debugVisible) return;
    const log = this.root.querySelector('[data-role="debug-log"]');
    const p = document.createElement("div");
    p.textContent = line;
    log.prepend(p);
    while (log.childNodes.length > 50) {
      log.removeChild(log.lastChild);
    }
  }

  /**
   * 最終スコアから称号（ランク）を決める。ゲーム性やスコア計算そのものには
   * 影響しない、リザルト画面のみの演出用の分類。
   * @param {number} score
   * @returns {string}
   */
  _computeRank(score) {
    if (score >= 15000) return "傑作";
    if (score >= 8000) return "秀作";
    if (score >= 4000) return "佳作";
    if (score >= 1500) return "習作";
    return "初心";
  }

  /**
   * ゲームオーバー時のリザルト画面を表示する。
   * ダイアログとしてのフォーカス管理も行う（表示前のフォーカス位置を保存し、
   * カード内の「もう一度プレイ」ボタンへフォーカスを移す。閉じたら復元する）。
   * @param {{sessionScore:number, money:number, sessionMaxCombo:number, sessionPlayCount:number}} state
   */
  showResultOverlay(state) {
    this.root.querySelector('[data-role="result-final-score"]').textContent = String(
      state.sessionScore
    );
    this.root.querySelector('[data-role="result-final-money"]').textContent =
      `${state.money}円`;
    this.root.querySelector('[data-role="result-max-combo"]').textContent = String(
      state.sessionMaxCombo
    );
    this.root.querySelector('[data-role="result-play-count"]').textContent = String(
      state.sessionPlayCount
    );

    const rank = this._computeRank(state.sessionScore);
    this.root.querySelector('[data-role="result-rank"]').textContent = `${rank}`;

    const overlay = this.root.querySelector('[data-role="result-overlay"]');
    const card = this.root.querySelector('[data-role="result-card"]');
    overlay.hidden = false;
    card.classList.remove("result-card-enter");
    void card.offsetWidth;
    card.classList.add("result-card-enter");

    this.announce(
      `ゲームオーバー。称号: ${rank}。最終スコア${state.sessionScore}点、スピン${state.sessionPlayCount}回、最大コンボ${state.sessionMaxCombo}`
    );

    this._lastFocusedBeforeOverlay = document.activeElement;
    const replayButton = this.root.querySelector('[data-role="result-replay-button"]');
    replayButton.focus();

    if (!this._overlayTrapBound) {
      this._overlayTrapBound = true;
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          // カード内の唯一の操作対象はリプレイボタンのため、
          // Tab/Shift+Tabのどちらでも常にそこへフォーカスを留める
          e.preventDefault();
          replayButton.focus();
        }
      });
    }
  }

  hideResultOverlay() {
    const overlay = this.root.querySelector('[data-role="result-overlay"]');
    overlay.hidden = true;
    if (this._lastFocusedBeforeOverlay && this._lastFocusedBeforeOverlay.focus) {
      this._lastFocusedBeforeOverlay.focus();
    }
    this._lastFocusedBeforeOverlay = null;
  }
}
