// Adapted from Lunar's statistics poster composition (AGPL-3.0).
// Geometry is independent of the canvas so preview and PNG use identical bounds.
export type PosterGame = {
  game_id: string;
  game_name: string;
  company: string;
  cover_url: string;
  total_duration: number;
};

export type PosterTile = {
  game: PosterGame;
  x: number;
  y: number;
  width: number;
  height: number;
  lift: number;
  rotation: number;
};

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1440;

export function rankedPosterGames(games: readonly PosterGame[]) {
  return [
    ...new Map(
      games
        .filter(
          game =>
            Number.isFinite(game.total_duration) && game.total_duration > 0,
        )
        .map(game => [game.game_id, game]),
    ).values(),
  ].sort(
    (a, b) =>
      b.total_duration - a.total_duration || a.game_id.localeCompare(b.game_id),
  );
}

function hash(value: string, seed: number) {
  let result = seed | 0;
  for (const char of value)
    result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return (result >>> 0) / 4294967296;
}

/** Every input game appears once; increasing density never silently drops covers. */
export function buildPosterLayout(
  input: readonly PosterGame[],
  seed = 1,
): PosterTile[] {
  const games = rankedPosterGames(input);
  if (!games.length)
    return [];
  const tied = games.every(
    game => game.total_duration === games[0].total_duration,
  );
  const tile = (
    game: PosterGame,
    frame: number[],
    rank: number,
  ): PosterTile => ({
    game,
    x: frame[0],
    y: frame[1],
    width: frame[2],
    height: frame[3],
    lift: tied ? 0 : rank === 0 ? 1 : rank === 1 ? 0.6 : 0,
    rotation: tied ? 0 : rank === 0 ? -1.6 : rank === 1 ? 1.2 : 0,
  });
  if (games.length <= 6) {
    const presets: Record<number, number[][]> = {
      1: [[330, 350, 420, 620]],
      2: [
        [215, 390, 330, 500],
        [555, 410, 310, 470],
      ],
      3: [
        [382, 400, 316, 500],
        [104, 470, 272, 360],
        [704, 470, 272, 360],
      ],
      4: [
        [382, 477, 316, 456],
        [104, 525, 272, 360],
        [704, 525, 272, 360],
        [382, 311, 316, 160],
      ],
      5: [
        [382, 477, 316, 456],
        [104, 525, 272, 360],
        [704, 525, 272, 360],
        [382, 311, 316, 160],
        [382, 939, 316, 160],
      ],
      6: [
        [382, 477, 316, 456],
        [104, 525, 272, 360],
        [704, 525, 272, 360],
        [382, 311, 316, 160],
        [263, 939, 272, 160],
        [541, 939, 272, 160],
      ],
    };
    // With equal times, give every game the same area rather than inventing a podium.
    if (!tied || games.length === 1) {
      return games.map((game, index) => {
        const frame = [...presets[games.length][index]];
        if (seed % 2 === 0)
          frame[0] = POSTER_WIDTH - frame[0] - frame[2];
        return tile(game, frame, index);
      });
    }
  }
  const minimum = games.at(-1)!.total_duration;
  const maximum = games[0].total_duration;
  const firstRanks = new Map<number, number>();
  games.forEach((game, index) => {
    if (!firstRanks.has(game.total_duration))
      firstRanks.set(game.total_duration, index);
  });
  const items = games.map((game) => {
    const weight = tied
      ? 0
      : (Math.log1p(game.total_duration) - Math.log1p(minimum))
        / (Math.log1p(maximum) - Math.log1p(minimum));
    const podium = tied
      ? 1
      : ([12, 9, 6][firstRanks.get(game.total_duration)!] ?? 1);
    return {
      game,
      units: Math.max(podium, weight > 0.82 ? 4 : weight > 0.45 ? 2 : 1),
    };
  });
  const shapes = (units: number): number[][] =>
    units === 12
      ? [
          [6, 8],
          [8, 6],
        ]
      : units === 9
        ? [[6, 6]]
        : units === 6
          ? [
              [4, 6],
              [6, 4],
            ]
          : units === 4
            ? [[4, 4]]
            : units === 2
              ? [
                  [2, 4],
                  [4, 2],
                ]
              : [[2, 2]];
  const cells = items.reduce((sum, item) => sum + item.units * 4, 0);
  let columns = Math.max(10, Math.ceil(Math.sqrt((cells * 952) / 930) / 2) * 2);
  for (;;) {
    const gap = Math.min(
      games.length > 80 ? 3 : games.length > 24 ? 5 : 8,
      952 / (columns * 5),
    );
    const cell = (952 - (columns - 1) * gap) / columns;
    const rows = Math.max(8, Math.floor((930 + gap) / (cell + gap) / 2) * 2);
    const grid = Array.from({ length: columns * rows }, () => false);
    for (let y = 0; y < rows; y += 2) {
      for (let x = 0; x < columns; x += 2) {
        const nx = Math.abs(((x + 1) / columns - 0.5) * 2);
        const ny = Math.abs(((y + 1) / rows - 0.5) * 2);
        if (nx ** 1.5 + ny ** 1.5 > 1.28) {
          for (let a = y; a < y + 2; a++) {
            for (let b = x; b < x + 2; b++) grid[a * columns + b] = true;
          }
        }
      }
    }
    const result: PosterTile[] = [];
    for (const [index, item] of items.entries()) {
      let best: number[] | undefined;
      let score = Infinity;
      for (let y = 0; y < rows; y += 2) {
        for (let x = 0; x < columns; x += 2) {
          for (const [w, h] of shapes(item.units)) {
            if (x + w > columns || y + h > rows)
              continue;
            let free = true;
            for (let a = y; a < y + h && free; a++) {
              for (let b = x; b < x + w; b++) {
                if (grid[a * columns + b]) {
                  free = false;
                  break;
                }
              }
            }
            if (!free)
              continue;
            const distance
              = ((x + w / 2) / columns - 0.5) ** 2
                + ((y + h / 2) / rows - 0.5) ** 2;
            const value
              = distance * 12
                + (w > h && item.units >= 6 ? 0.12 : 0)
                + hash(`${item.game.game_id}:${x}:${y}:${w}`, seed) * 0.035;
            if (value < score) {
              score = value;
              best = [x, y, w, h];
            }
          }
        }
      }
      if (!best)
        break;
      const [x, y, w, h] = best;
      for (let a = y; a < y + h; a++) {
        for (let b = x; b < x + w; b++) grid[a * columns + b] = true;
      }
      result.push(
        tile(
          item.game,
          [
            64 + x * (cell + gap),
            252 + y * (cell + gap),
            w * cell + (w - 1) * gap,
            h * cell + (h - 1) * gap,
          ],
          index,
        ),
      );
    }
    if (result.length === games.length)
      return result;
    columns += 2;
  }
}
