/**
 * JudgeEngine
 *
 * 毎フレーム、gridLines.buildLinePairs()で定義された73ペア（横縦斜め＋端役）について
 * DictionaryEngine.has()（O(1)のHash検索）で判定する。辞書全探索は行わない。
 *
 * 【受理抽選（acceptanceRate）について】
 * 辞書は63,904語というフルボリュームを使用しているため、辞書上の一致だけを
 * そのまま成立とすると1スピンあたりの成立数が過多になる（実測で平均20語超）。
 * これを辞書側の削減ではなく判定側で調整するため、辞書に一致した候補に対して
 * さらに acceptanceRate の確率で「本当に成立とするか」を抽選する。
 * 外れた候補はそのマスを固定せず、そのまま通常のランダム更新を継続する
 * （次回別の組み合わせで再度自然に一致・抽選するチャンスがある）。
 * RandomEngine（文字そのものの抽選）とは独立した、別レイヤーの抽選である。
 *
 * 【判定対象の絞り込み方式について（重要な修正）】
 * 以前は「両マスとも固定済みのペアはスキップ」「今回いずれのマスも変化して
 * いなければスキップ」という2つの条件で判定対象を絞り込んでいた。しかし
 * この方式では、「別々のペアで個別に固定された2マスが、その2マス自身の
 * 組み合わせでも新しい熟語を成立させる」ケース（例:「国家」の"家"と
 * 「国分」の"分"が別々に固定された後、隣接する"分"と"家"がそれ自体で
 * 「分家」を成立させる連鎖）を検出できないという不具合があった
 * （固定済み同士のペアは無条件でスキップされてしまうため）。
 *
 * これを修正するため、絞り込みの基準を「マスが変化したかどうか」から
 * 「そのペアの一致状態が直前の評価から変化したかどうか」に変更した。
 * _lastMatchState にペアごとの直前の一致語（またはnull）を保持し、
 * 今回の一致語がそれと異なる場合のみ「新規の一致」とみなして抽選対象にする。
 * これにより、両端が固定済みであっても、そのペア自体を初めて評価する
 * タイミング（あるいは一致状態が変わったタイミング）では正しく判定される。
 * 一度成立して固定されたペアは _confirmedPairs に記録し、二度と再評価・
 * 再抽選しない（重複成立の防止）。
 *
 * 【スコア計算（端役対応）】
 * 従来はscore(n) = 100*(2^n-1)という、同一タイミングでの成立数nに基づく
 * 指数的なコンボボーナス式のみだった。端役（type:"edge"）は通常役の
 * 50%スコアという仕様に対応するため、各成立の「重み」（通常役=1.0、
 * 端役=0.5）の平均値を元の指数式に掛け合わせる方式にした。
 *   score = round(100 * (2^n - 1) * (重みの合計 / n))
 * これにより、全て通常役ならば従来通りの値、全て端役ならばちょうど半分、
 * 混在時はその中間になる。端数は四捨五入で丸める。
 * なお、コンボ判定・コンボボーナス（GameEngine側で計算）は端役も通常役と
 * 完全に同等に扱い、この重み付けの影響を受けない。
 */
export class JudgeEngine {
  /**
   * @param {Array<{type: string, a: number, b: number}>} linePairs gridLines.buildLinePairs()の結果
   * @param {{acceptanceRate?: number}} [options] acceptanceRate: 辞書一致時に実際に成立とみなす確率(0〜1)。
   *   省略時は1.0（常に成立＝抽選なし）。
   */
  constructor(linePairs, options = {}) {
    this._linePairs = linePairs;
    this._acceptanceRate =
      options.acceptanceRate == null ? 1.0 : options.acceptanceRate;
    this._lastMatchState = new Map(); // pairKey -> 直前に一致していた語（またはnull）
    this._confirmedPairs = new Set(); // 既に成立確定したpairKeyの集合
  }

  /**
   * acceptanceRateを実行時に変更する（ジャックポット抽選でスピンごとに
   * 一時的にレートを引き上げるために使用する）。
   * @param {number} rate
   */
  setAcceptanceRate(rate) {
    this._acceptanceRate = rate;
  }

  /**
   * スピン開始時に呼び出し、ペア単位の状態をすべてリセットする。
   */
  reset() {
    this._lastMatchState.clear();
    this._confirmedPairs.clear();
  }

  /**
   * @param {import("./ReelEngine.js").ReelEngine} reelEngine
   * @param {import("./DictionaryEngine.js").DictionaryEngine} dictionaryEngine
   * @returns {{results: Array<{type:string,a:number,b:number,word:string,reading:string}>, score: number, n: number}}
   */
  evaluate(reelEngine, dictionaryEngine) {
    const grid = reelEngine.getGrid();

    const results = [];

    for (const pair of this._linePairs) {
      const { a, b } = pair;
      const pairKey = `${a},${b}`;

      // 既に成立確定済みのペアは二度と評価しない
      if (this._confirmedPairs.has(pairKey)) continue;

      const charA = grid[a];
      const charB = grid[b];
      if (charA == null || charB == null) continue;

      const word = charA + charB;
      const entry = dictionaryEngine.getEntry(word);
      const currentMatch = entry ? word : null;

      const previousMatch = this._lastMatchState.get(pairKey) ?? null;
      this._lastMatchState.set(pairKey, currentMatch);

      if (!currentMatch) continue;
      // 直前の評価から一致状態が変わっていなければ、既に判定・抽選済みの
      // 組み合わせがそのまま残っているだけなので、再度の抽選は行わない
      if (currentMatch === previousMatch) continue;

      // 受理抽選：辞書に一致していても、この確率を外れた場合は成立させない
      if (Math.random() >= this._acceptanceRate) continue;

      this._confirmedPairs.add(pairKey);
      results.push({
        type: pair.type,
        a,
        b,
        word: entry.word,
        reading: entry.reading,
      });
    }

    // 新規成立したマスをすべて固定する
    const toFix = new Set();
    for (const r of results) {
      toFix.add(r.a);
      toFix.add(r.b);
    }
    for (const index of toFix) {
      reelEngine.fixCell(index);
    }

    const n = results.length;
    let score = 0;
    if (n > 0) {
      const weightSum = results.reduce(
        (sum, r) => sum + (r.type === "edge" ? 0.5 : 1.0),
        0
      );
      score = Math.round(100 * (2 ** n - 1) * (weightSum / n));
    }

    return { results, score, n };
  }
}
