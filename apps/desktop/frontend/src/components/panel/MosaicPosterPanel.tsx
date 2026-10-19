import type { PosterImages } from "../../utils/posterCanvas";
import type { PosterCrop } from "../../utils/posterCrop";
import type { PosterGame } from "../../utils/posterLayout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GetPosterGames } from "../../../bindings/lunabox/backend/service/statsservice";
import { loadPosterImages, renderPoster } from "../../utils/posterCanvas";
import { DEFAULT_CROP } from "../../utils/posterCrop";
import { buildPosterLayout, POSTER_HEIGHT, POSTER_WIDTH, rankedPosterGames } from "../../utils/posterLayout";
import { formatDurationCompact } from "../../utils/time";
import { BetterSwitch } from "../ui/better/BetterSwitch";
import { PosterCoverEditor } from "./PosterCoverEditor";

interface Props {
  startDate: string;
  endDate: string;
  exporting: boolean;
  onReady: (canvas: HTMLCanvasElement | null) => void;
}

export function MosaicPosterPanel({
  startDate,
  endDate,
  exporting,
  onReady,
}: Props) {
  const { t } = useTranslation();
  const prefix = "stats.templateExport.mosaic";
  const [title, setTitle] = useState(() => t(`${prefix}.defaultTitle`));
  const [quote, setQuote] = useState(() => t(`${prefix}.defaultQuote`));
  const [showTitles, setShowTitles] = useState(true);
  const [showCompanies, setShowCompanies] = useState(true);
  const [showDurations, setShowDurations] = useState(true);
  const [crops, setCrops] = useState<Record<string, PosterCrop>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const closeEditor = useCallback(() => setEditingId(null), []);
  const [limit, setLimit] = useState(0);
  const [seed, setSeed] = useState(1);
  const [retry, setRetry] = useState(0);
  const [games, setGames] = useState<PosterGame[]>([]);
  const [images, setImages] = useState<PosterImages | null>(null);
  const activeImages = useRef<PosterImages | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const start = startDate.slice(0, 10);
  const end = endDate.slice(0, 10);

  useEffect(() => {
    const controller = new AbortController();
    let loadedImages: PosterImages | undefined;
    activeImages.current = null;
    setLoading(true);
    setError(false);
    setImages(null);
    setGames([]);
    setProgress(0);
    onReady(null);
    const request = GetPosterGames(start, end);
    (async () => {
      try {
        const list = rankedPosterGames(await request);
        if (controller.signal.aborted)
          return;
        setGames(list);
        loadedImages = await loadPosterImages(
          list,
          controller.signal,
          setProgress,
        );
        if (!controller.signal.aborted) {
          activeImages.current = loadedImages;
          setImages(loadedImages);
        }
      }
      catch {
        if (!controller.signal.aborted)
          setError(true);
      }
      finally {
        if (!controller.signal.aborted)
          setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      request.cancel();
      if (activeImages.current === loadedImages)
        activeImages.current = null;
      loadedImages?.forEach(image => image.close());
      onReady(null);
    };
  }, [start, end, retry, onReady]);

  const selected = useMemo(() => limit ? games.slice(0, limit) : games, [games, limit]);
  const tiles = useMemo(() => buildPosterLayout(selected, seed), [selected, seed]);
  const editing = tiles.find(tile => tile.game.game_id === editingId);
  const editable = tiles.filter(tile => images?.has(tile.game.game_id));
  const stepEditor = (direction: number) => {
    const index = editable.findIndex(tile => tile.game.game_id === editingId);
    if (editable.length)
      setEditingId(editable[(index + direction + editable.length) % editable.length].game.game_id);
  };
  const missing = images
    ? selected.filter(game => !images.has(game.game_id)).length
    : 0;
  useEffect(() => {
    const canvas = canvasRef.current;
    onReady(null);
    if (!canvas || !images || loading || error || !selected.length || editing)
      return;
    let active = true;
    // Wait for locally available fonts before drawing both preview and export.
    document.fonts.ready.then(() => {
      // A retry releases the old bitmaps before React commits its next state.
      // Never let a queued font-ready callback draw those detached resources.
      if (!active || activeImages.current !== images)
        return;
      try {
        renderPoster(canvas, selected, images, {
          title,
          quote,
          showTitles,
          showCompanies,
          showDurations,
          crops,
          durationLabels: Object.fromEntries(selected.map(game => [game.game_id, formatDurationCompact(game.total_duration, t)])),
          seed,
          range: `${start} — ${end}`,
          summary: t(`${prefix}.summary`, {
            count: selected.length,
            duration: formatDurationCompact(
              selected.reduce((sum, game) => sum + game.total_duration, 0),
              t,
            ),
          }),
        });
        onReady(canvas);
      }
      catch {
        setError(true);
      }
    });
    return () => {
      active = false;
    };
  }, [
    selected,
    editing,
    images,
    loading,
    error,
    title,
    quote,
    showTitles,
    showCompanies,
    showDurations,
    crops,
    seed,
    start,
    end,
    t,
    onReady,
  ]);

  const fieldClass
    = "w-full rounded-lg border border-brand-300 dark:border-brand-600 bg-white dark:bg-brand-900 px-3 py-2 text-sm text-brand-900 dark:text-white focus:ring-2 focus:ring-neutral-500 outline-none";
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <fieldset
        disabled={exporting}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-white dark:bg-brand-800 border-b border-brand-200 dark:border-brand-700 disabled:opacity-60"
      >
        <label className="space-y-1 text-xs text-brand-600 dark:text-brand-300">
          <span>{t(`${prefix}.heading`)}</span>
          <input
            value={title}
            maxLength={60}
            onChange={event => setTitle(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-xs text-brand-600 dark:text-brand-300">
          <span>{t(`${prefix}.quote`)}</span>
          <input
            value={quote}
            maxLength={120}
            onChange={event => setQuote(event.target.value)}
            className={fieldClass}
          />
        </label>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-brand-700 dark:text-brand-200">
          <div className="flex items-center gap-2">
            <label htmlFor="poster-titles">{t(`${prefix}.showTitles`)}</label>
            <BetterSwitch
              id="poster-titles"
              checked={showTitles}
              onCheckedChange={setShowTitles}
              disabled={exporting}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="poster-companies">
              {t(`${prefix}.showCompanies`)}
            </label>
            <BetterSwitch
              id="poster-companies"
              checked={showCompanies}
              onCheckedChange={setShowCompanies}
              disabled={exporting}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="poster-durations">{t(`${prefix}.showDurations`)}</label>
            <BetterSwitch id="poster-durations" checked={showDurations} onCheckedChange={setShowDurations} disabled={exporting} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex-1 flex items-center gap-2 text-xs text-brand-600 dark:text-brand-300">
            <span id="poster-count-label" className="shrink-0">{t(`${prefix}.count`)}</span>
            <select
              aria-labelledby="poster-count-label"
              value={limit}
              onChange={event => setLimit(Number(event.target.value))}
              className={fieldClass}
            >
              <option value={0}>
                {t(`${prefix}.all`, { count: games.length })}
              </option>
              {[6, 20, 60, 120].map(value => (
                <option key={value} value={value}>
                  {t(`${prefix}.top`, { count: value })}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={selected.length < 2}
            onClick={() => setSeed(value => value + 1)}
            className="px-3 py-2 rounded-lg text-xs whitespace-nowrap text-brand-700 dark:text-brand-200 bg-brand-100 hover:bg-brand-200 dark:bg-brand-700 dark:hover:bg-brand-600"
          >
            {t(`${prefix}.shuffle`)}
          </button>
        </div>
      </fieldset>
      <div className="relative flex-1 min-h-0 overflow-auto p-4" aria-busy={loading}>
        {loading ? (
          <div
            role="status"
            className="h-full flex items-center justify-center gap-2 text-sm text-brand-500 dark:text-brand-300"
          >
            <span className="i-mdi-loading animate-spin text-xl" />
            {t(`${prefix}.loading`, { loaded: progress, count: games.length })}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="p-6 text-center text-brand-700 dark:text-brand-200"
          >
            <p>{t(`${prefix}.error`)}</p>
            <button
              type="button"
              onClick={() => setRetry(value => value + 1)}
              className="mt-3 underline"
            >
              {t(`${prefix}.retry`)}
            </button>
          </div>
        ) : !games.length ? (
          <div
            role="status"
            className="p-8 text-center text-sm text-brand-500 dark:text-brand-300"
          >
            {t(`${prefix}.empty`)}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs text-brand-600 dark:text-brand-300">
              <span>
                {t(`${prefix}.resolution`, { count: selected.length })}
              </span>
              {missing > 0 && (
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => setRetry(value => value + 1)}
                  className="underline"
                >
                  {t(`${prefix}.missing`, { count: missing })}
                </button>
              )}
            </div>
            <div className="h-[calc(100%_-_3rem)] min-h-[280px] flex justify-center">
              <canvas
                ref={canvasRef}
                aria-label={t(`${prefix}.preview`)}
                className="block max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-xl cursor-pointer"
                onClick={(event) => {
                  if (exporting)
                    return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const px = (event.clientX - rect.left) * POSTER_WIDTH / rect.width;
                  const py = (event.clientY - rect.top) * POSTER_HEIGHT / rect.height;
                  const hit = [...tiles].sort((a, b) => b.lift - a.lift).find((tile) => {
                    const angle = -tile.rotation * Math.PI / 180;
                    const dx = px - tile.x - tile.width / 2;
                    const dy = py - tile.y - tile.height / 2 + tile.lift * 7;
                    const growth = 1 + tile.lift * 0.045;
                    const x = (dx * Math.cos(angle) - dy * Math.sin(angle)) / growth + tile.width / 2;
                    const y = (dx * Math.sin(angle) + dy * Math.cos(angle)) / growth + tile.height / 2;
                    return x >= 0 && x <= tile.width && y >= 0 && y <= tile.height;
                  });
                  if (hit && images?.has(hit.game.game_id))
                    setEditingId(hit.game.game_id);
                }}
              />
            </div>
            <div className="flex items-center justify-center gap-2 mt-2 text-xs text-brand-500 dark:text-brand-300">
              <span>{t(`${prefix}.clickToCrop`)}</span>
              <button type="button" disabled={exporting || !editable.length} onClick={() => setEditingId(editable[0]?.game.game_id ?? null)} className="underline">{t(`${prefix}.cropEditor`)}</button>
            </div>
          </>
        )}
        {editing && images?.get(editing.game.game_id) && (
          <PosterCoverEditor
            tile={editing}
            image={images.get(editing.game.game_id)!}
            crop={crops[editing.game.game_id] ?? DEFAULT_CROP}
            disabled={exporting}
            onChange={crop => setCrops(previous => ({ ...previous, [editing.game.game_id]: crop }))}
            onClose={closeEditor}
            onStep={stepEditor}
          />
        )}
      </div>
    </div>
  );
}
