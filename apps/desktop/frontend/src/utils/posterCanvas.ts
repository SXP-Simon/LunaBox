import type { PosterCrop } from "./posterCrop";
import type { PosterGame } from "./posterLayout";

import brandIcon from "../assets/branding/appicon-dark.png";
import { proxiedImageSrc } from "./imageProxy";
import { posterCoverSource } from "./posterCrop";
import {
  buildPosterLayout,
  POSTER_HEIGHT,
  POSTER_WIDTH,
  rankedPosterGames,
} from "./posterLayout";

export type PosterOptions = {
  title: string;
  quote: string;
  range: string;
  summary: string;
  showTitles: boolean;
  showCompanies: boolean;
  showDurations: boolean;
  durationLabels: Record<string, string>;
  crops: Record<string, PosterCrop>;
  seed: number;
};

export type PosterImages = Map<string, ImageBitmap>;
const BRAND_KEY = "__lunabox_brand__";
const POSTER_FONT = "\"Microsoft YaHei\", \"PingFang SC\", \"Noto Sans CJK SC\", sans-serif";

function readImage(
  src: string,
  signal: AbortSignal,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let timer: ReturnType<typeof setTimeout>;
    function cleanup() {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      image.onload = null;
      image.onerror = null;
    };
    const fail = () => {
      cleanup();
      image.src = "";
      reject(new Error("Cover unavailable"));
    };
    function cancel() {
      cleanup();
      image.src = "";
      reject(new DOMException("Aborted", "AbortError"));
    };
    timer = setTimeout(fail, 12000);
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = fail;
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    image.src = src;
  });
}

/** Reuse LunaBox's image proxy/cache; never taint the export canvas with remote URLs. */
export async function loadPosterImages(
  games: readonly PosterGame[],
  signal: AbortSignal,
  progress?: (loaded: number) => void,
): Promise<PosterImages> {
  if (signal.aborted)
    throw new DOMException("Aborted", "AbortError");
  const images: PosterImages = new Map();
  let index = 0;
  let completed = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, games.length) }, async () => {
      while (index < games.length && !signal.aborted) {
        const game = games[index++];
        try {
          if (game.cover_url) {
            const image = await readImage(
              proxiedImageSrc(game.cover_url),
              signal,
            );
            const ratio = Math.min(
              1,
              1400 / Math.max(image.naturalWidth, image.naturalHeight),
            );
            const bitmap = await createImageBitmap(image, {
              resizeWidth: Math.max(1, Math.round(image.naturalWidth * ratio)),
              resizeHeight: Math.max(
                1,
                Math.round(image.naturalHeight * ratio),
              ),
              resizeQuality: "high",
            });
            image.src = "";
            if (signal.aborted)
              bitmap.close();
            else images.set(game.game_id, bitmap);
          }
        }
        catch {
          // Keep the game in the layout, with a visible placeholder and a UI warning.
        }
        if (!signal.aborted)
          progress?.(++completed);
      }
    }),
  );
  try {
    if (!signal.aborted) {
      const image = await readImage(brandIcon, signal);
      const bitmap = await createImageBitmap(image, { resizeWidth: 128, resizeHeight: 128 });
      image.src = "";
      images.set(BRAND_KEY, bitmap);
    }
  }
  catch (error) {
    images.forEach(image => image.close());
    throw error;
  }
  if (signal.aborted) {
    images.forEach(image => image.close());
    throw new DOMException("Aborted", "AbortError");
  }
  return images;
}

function cover(
  ctx: CanvasRenderingContext2D,
  image: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
  crop?: PosterCrop,
) {
  const source = posterCoverSource(image.width, image.height, width, height, crop);
  ctx.drawImage(image, source.x, source.y, source.width, source.height, x, y, width, height);
}

function wrapped(
  ctx: CanvasRenderingContext2D,
  value: string,
  width: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  const chars = Array.from(value.replace(/\s+/gu, " ").trim());
  for (const [index, char] of chars.entries()) {
    if (ctx.measureText(line + char).width > width && line) {
      lines.push(line);
      line = "";
      if (lines.length === maxLines) {
        let last = lines[maxLines - 1];
        while (last && ctx.measureText(`${last}…`).width > width)
          last = Array.from(last).slice(0, -1).join("");
        lines[maxLines - 1] = `${last}…`;
        return lines;
      }
    }
    line += char;
    if (index === chars.length - 1)
      lines.push(line);
  }
  return lines;
}

/** One renderer for both the displayed canvas and exported PNG. No CDN or AI. */
export function renderPoster(
  canvas: HTMLCanvasElement,
  input: readonly PosterGame[],
  images: PosterImages,
  options: PosterOptions,
  scale = 3,
) {
  canvas.width = POSTER_WIDTH * scale;
  canvas.height = POSTER_HEIGHT * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("Canvas unavailable");
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const games = rankedPosterGames(input);
  const tiles = buildPosterLayout(games, options.seed);
  const fontFamily = POSTER_FONT;
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  const background = images.get(games[0]?.game_id);
  if (background) {
    ctx.save();
    ctx.filter = "blur(65px)";
    ctx.globalAlpha = 0.09;
    cover(ctx, background, -120, 40, 1320, 1220);
    ctx.restore();
  }
  const ambient = ctx.createRadialGradient(540, 640, 90, 540, 640, 820);
  ambient.addColorStop(0, "#24212555");
  ambient.addColorStop(1, "#000000b0");
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  ctx.fillStyle = "#f1efef";
  ctx.font = `40px ${fontFamily}`;
  ctx.fillText(wrapped(ctx, options.title, 952, 1)[0] || "", 64, 147);
  ctx.fillStyle = "#a4a3aa";
  ctx.font = `19px ${fontFamily}`;
  ctx.fillText(options.range, 64, 190);
  ctx.textAlign = "right";
  ctx.fillText(options.summary, 1016, 190);
  ctx.textAlign = "left";

  for (const tile of [...tiles].sort((a, b) => a.lift - b.lift)) {
    const { x, y, width, height, game, lift } = tile;
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2 - lift * 7);
    ctx.rotate((tile.rotation * Math.PI) / 180);
    ctx.scale(1 + lift * 0.045, 1 + lift * 0.045);
    ctx.translate(-width / 2, -height / 2);
    if (lift) {
      ctx.shadowColor = "#000000df";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 12;
    }
    ctx.fillStyle = "#25252b";
    ctx.fillRect(0, 0, width, height);
    ctx.shadowColor = "transparent";
    const image = images.get(game.game_id);
    if (image) {
      cover(ctx, image, 0, 0, width, height, options.crops[game.game_id]);
    }
    else {
      ctx.fillStyle = "#9b9ba6";
      ctx.font = `${Math.min(24, width * 0.1)}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.fillText("◇", width / 2, height / 2);
      ctx.textAlign = "left";
    }
    const distance = Math.min(
      1,
      Math.hypot((x + width / 2 - 540) / 570, (y + height / 2 - 700) / 570),
    );
    ctx.fillStyle = `rgba(0,0,0,${lift ? 0.04 : 0.07 + distance * 0.38})`;
    ctx.fillRect(0, 0, width, height);
    const pad = Math.max(5, Math.min(20, width * 0.065));
    const size = Math.max(8, Math.min(35, width * 0.105, height * 0.14));
    const companySize = Math.max(6, size * 0.58);
    ctx.font = `${size}px ${fontFamily}`;
    const titleLines = options.showTitles
      ? wrapped(
          ctx,
          game.game_name,
          width - pad * 2,
          height > width * 1.1 ? 3 : 2,
        )
      : [];
    const companyHeight
      = options.showCompanies && game.company ? companySize * 1.6 : 0;
    const durationHeight = options.showDurations ? companySize * 1.6 : 0;
    const detailsHeight = titleLines.length * size * 1.25 + companyHeight + durationHeight;
    if (detailsHeight) {
      const shade = ctx.createLinearGradient(
        0,
        Math.max(0, height - detailsHeight - pad * 3),
        0,
        height,
      );
      shade.addColorStop(0, "#00000000");
      shade.addColorStop(0.5, "#00000087");
      shade.addColorStop(1, "#000000dc");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${size}px ${fontFamily}`;
      titleLines.forEach((line, index) =>
        ctx.fillText(
          line,
          pad,
          height
          - pad
          - companyHeight
          - durationHeight
          - (titleLines.length - 1 - index) * size * 1.25,
        ),
      );
      if (companyHeight) {
        ctx.font = `${companySize}px ${fontFamily}`;
        ctx.fillStyle = "#d5d4dc";
        ctx.fillText(
          wrapped(ctx, game.company, width - pad * 2, 1)[0] || "",
          pad,
          height - pad - durationHeight,
        );
      }
    }
    if (options.showDurations) {
      ctx.font = `${companySize}px ${fontFamily}`;
      ctx.fillStyle = "#dedce4";
      ctx.fillText(options.durationLabels[game.game_id] || "", pad, height - pad);
    }
    if (lift) {
      ctx.strokeStyle = "#dedee34d";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    }
    ctx.restore();
  }
  if (options.quote.trim()) {
    ctx.strokeStyle = "#ffffff26";
    ctx.beginPath();
    ctx.moveTo(425, 1240);
    ctx.lineTo(515, 1240);
    ctx.moveTo(565, 1240);
    ctx.lineTo(655, 1240);
    ctx.stroke();
    ctx.fillStyle = "#e4e1e8";
    ctx.beginPath();
    ctx.arc(540, 1240, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0d0d10";
    ctx.beginPath();
    ctx.arc(543, 1237, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9c6ce";
    ctx.font = `22px ${fontFamily}`;
    ctx.textAlign = "center";
    wrapped(ctx, options.quote, 850, 2).forEach((line, index) =>
      ctx.fillText(line, 540, 1290 + index * 32),
    );
  }
  ctx.textAlign = "right";
  ctx.font = `19px ${fontFamily}`;
  ctx.fillStyle = "#d8d6dc";
  ctx.fillText("LunaBox", 1016, 1394);
  const icon = images.get(BRAND_KEY);
  if (icon)
    ctx.drawImage(icon, 893, 1365, 38, 38);
}
