/* eslint-disable test/no-import-node-test -- This suite deliberately uses the built-in Node.js runner. */
import assert from "node:assert/strict";
import { it } from "node:test";
import {
  DEFAULT_CROP,
  normalizeCrop,
  panPosterCrop,
  posterCoverSource,
  zoomPosterCrop,
} from "../src/utils/posterCrop.ts";
import {
  buildPosterLayout,
  rankedPosterGames,
} from "../src/utils/posterLayout.ts";

function games(count, tied = false) {
  return Array.from({ length: count }, (_, index) => ({
    game_id: `game-${String(index).padStart(3, "0")}`,
    game_name: `游戏 ${index}`,
    company: "Developer",
    cover_url: "",
    total_duration: tied ? 60 : (count - index) ** 2 * 60,
  }));
}

for (const count of [0, 1, 2, 3, 4, 5, 6, 7, 12, 20, 21, 60, 120, 257]) {
  for (const tied of [false, true]) {
    it(`${count} games, equal durations=${tied}: complete, deterministic, bounded, no base overlap`, () => {
      const input = games(count, tied);
      const before = JSON.stringify(input);
      const tiles = buildPosterLayout(input, 7);
      assert.equal(JSON.stringify(input), before);
      assert.deepEqual(tiles, buildPosterLayout(input, 7));
      assert.equal(tiles.length, count);
      assert.deepEqual(
        new Set(tiles.map(tile => tile.game.game_id)),
        new Set(input.map(game => game.game_id)),
      );
      for (const [index, tile] of tiles.entries()) {
        assert.ok(
          tile.x >= 64
          && tile.y >= 252
          && tile.x + tile.width <= 1016.01
          && tile.y + tile.height <= 1182.01,
        );
        assert.ok(tile.width > 0 && tile.height > 0);
        if (tied && count > 1)
          assert.equal(tile.lift, 0);
        for (const other of tiles.slice(index + 1)) {
          const overlap
            = tile.x < other.x + other.width - 0.01
              && tile.x + tile.width > other.x + 0.01
              && tile.y < other.y + other.height - 0.01
              && tile.y + tile.height > other.y + 0.01;
          assert.equal(
            overlap,
            false,
            `${tile.game.game_id} overlaps ${other.game.game_id}`,
          );
        }
      }
      if (tied && count > 1) {
        const areas = tiles.map(tile => tile.width * tile.height);
        assert.ok(Math.max(...areas) - Math.min(...areas) < 0.01);
      }
    });
  }
}

it("invalid durations are excluded and duplicate game IDs appear once", () => {
  const input = games(6);
  const tiles = buildPosterLayout([
    ...input,
    input[0],
    { ...input[0], game_id: "zero", total_duration: 0 },
    { ...input[0], game_id: "nan", total_duration: Number.NaN },
  ]);
  assert.equal(tiles.length, 6);
  assert.deepEqual(rankedPosterGames(input.toReversed()), input);
});

it("the longest played game stays prominent and changing the seed changes dense composition", () => {
  const input = games(60);
  const tiles = buildPosterLayout(input);
  const lead = tiles.find(tile => tile.game.game_id === input[0].game_id);
  assert.equal(lead.lift, 1);
  assert.ok(Math.abs(lead.x + lead.width / 2 - 540) < 120);
  assert.ok(
    tiles.every(
      tile => tile.width * tile.height <= lead.width * lead.height + 0.01,
    ),
  );
  assert.notDeepEqual(tiles, buildPosterLayout(input, 20));
});

it("small compositions can be shuffled without changing the ranking", () => {
  for (const count of [2, 3, 4, 5, 6]) {
    assert.notDeepEqual(
      buildPosterLayout(games(count), 1),
      buildPosterLayout(games(count), 2),
    );
  }
});

it("cover crops remain inside the source for portrait, landscape and square covers", () => {
  for (const [iw, ih] of [
    [600, 900],
    [1600, 900],
    [800, 800],
  ]) {
    for (const [w, h] of [
      [320, 480],
      [320, 160],
      [80, 80],
    ]) {
      for (const crop of [
        DEFAULT_CROP,
        { x: 0, y: 1, zoom: 3 },
        { x: 1, y: 0, zoom: 2 },
        { x: -5, y: Infinity, zoom: Number.NaN },
      ]) {
        const source = posterCoverSource(iw, ih, w, h, crop);
        assert.ok(
          source.x >= 0
          && source.y >= 0
          && source.x + source.width <= iw + 0.001
          && source.y + source.height <= ih + 0.001,
        );
        assert.ok(Math.abs(source.width / source.height - w / h) < 0.001);
      }
    }
  }
});

it("dragging is clamped, cannot expose empty space, and zoom preserves the focal point", () => {
  assert.deepEqual(normalizeCrop({ x: -1, y: 2, zoom: 9 }), {
    x: 0,
    y: 1,
    zoom: 3,
  });
  const zoomed = zoomPosterCrop(DEFAULT_CROP, 2, 600, 900, 200, 300);
  assert.deepEqual(zoomed, { x: 0.5, y: 0.5, zoom: 2 });
  const panned = panPosterCrop(zoomed, 9999, -9999, 600, 900, 200, 300);
  assert.deepEqual(panned, { x: 0, y: 1, zoom: 2 });
  assert.deepEqual(
    panPosterCrop(DEFAULT_CROP, 200, 200, 600, 900, 200, 300),
    DEFAULT_CROP,
  );
});
