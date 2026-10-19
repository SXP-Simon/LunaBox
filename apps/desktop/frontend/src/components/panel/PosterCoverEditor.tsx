import type { PosterCrop } from "../../utils/posterCrop";
import type { PosterTile } from "../../utils/posterLayout";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_CROP, panPosterCrop, posterCoverSource, zoomPosterCrop } from "../../utils/posterCrop";

interface Props {
  tile: PosterTile;
  image: ImageBitmap;
  crop: PosterCrop;
  disabled: boolean;
  onChange: (crop: PosterCrop) => void;
  onClose: () => void;
  onStep: (direction: number) => void;
}

export function PosterCoverEditor({ tile, image, crop, disabled, onChange, onClose, onStep }: Props) {
  const { t } = useTranslation();
  const prefix = "stats.templateExport.mosaic";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ crop: PosterCrop; x: number; y: number; pointerId: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const step = (direction: number) => {
    clearTimeout(timer.current);
    setVisible(true);
    onStep(direction);
  };
  const close = useCallback(() => {
    if (disabled)
      return;
    setVisible(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(onClose, 240);
  }, [onClose, disabled]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [close]);
  useEffect(() => {
    drag.current = null;
    canvasRef.current?.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
  }, [tile.game.game_id]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas)
      return;
    canvas.width = Math.round(tile.width * 3);
    canvas.height = Math.round(tile.height * 3);
    const ctx = canvas.getContext("2d");
    if (!ctx)
      return;
    const source = posterCoverSource(image.width, image.height, tile.width, tile.height, crop);
    ctx.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
  }, [image, crop, tile.width, tile.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas)
      return;
    const wheel = (event: WheelEvent) => {
      if (disabled)
        return;
      event.preventDefault();
      const value = Math.min(3, Math.max(1, crop.zoom * Math.exp(-event.deltaY * 0.001)));
      onChange(zoomPosterCrop(crop, value, image.width, image.height, tile.width, tile.height));
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, [crop, disabled, image.width, image.height, tile.width, tile.height, onChange]);

  const zoom = (value: number) => onChange(zoomPosterCrop(crop, value, image.width, image.height, tile.width, tile.height));
  return (
    <section aria-label={t(`${prefix}.cropEditor`)} className="absolute inset-0 z-10 flex flex-col gap-3 p-4 bg-brand-50/98 dark:bg-brand-900/98 transition-opacity duration-240 ease-out motion-reduce:transition-none" style={{ opacity: visible ? 1 : 0 }}>
      <div className="flex items-center justify-between gap-3 text-sm text-brand-900 dark:text-brand-100">
        <span className="font-semibold truncate">{tile.game.game_name}</span>
        <button type="button" disabled={disabled} onClick={close} className="shrink-0 px-3 py-2 rounded-lg bg-brand-200 dark:bg-brand-700">{t(`${prefix}.back`)}</button>
      </div>
      <p className="text-xs text-brand-500 dark:text-brand-300">{t(`${prefix}.cropHint`)}</p>
      <div className="flex-1 min-h-0 flex justify-center items-center overflow-hidden">
        <canvas
          ref={canvasRef}
          aria-label={t(`${prefix}.cropCanvas`)}
          className="max-w-full max-h-full w-auto h-auto object-contain touch-none cursor-grab active:cursor-grabbing rounded-lg shadow-xl"
          onPointerDown={(event) => {
            if (disabled || event.button !== 0)
              return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { crop, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || disabled || start.pointerId !== event.pointerId)
              return;
            const rect = event.currentTarget.getBoundingClientRect();
            onChange(panPosterCrop(start.crop, event.clientX - start.x, event.clientY - start.y, image.width, image.height, rect.width, rect.height));
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onLostPointerCapture={() => { drag.current = null; }}

        />
      </div>
      <fieldset disabled={disabled} className="flex items-center flex-wrap gap-3 text-xs text-brand-700 dark:text-brand-200">
        <button type="button" onClick={() => step(-1)} className="px-2 py-2 rounded-lg bg-brand-200 dark:bg-brand-700">{t(`${prefix}.previous`)}</button>
        <label className="flex-1 min-w-[120px] flex gap-2 items-center">
          {t(`${prefix}.zoom`)}
          <input aria-label={t(`${prefix}.zoom`)} type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={event => zoom(Number(event.target.value))} className="flex-1 min-w-0" />
        </label>
        <span className="tabular-nums">
          {crop.zoom.toFixed(2)}
          ×
        </span>
        <button type="button" onClick={() => onChange(DEFAULT_CROP)} className="px-2 py-2 rounded-lg bg-brand-200 dark:bg-brand-700">{t(`${prefix}.resetCrop`)}</button>
        <button type="button" onClick={() => step(1)} className="px-2 py-2 rounded-lg bg-brand-200 dark:bg-brand-700">{t(`${prefix}.next`)}</button>
      </fieldset>
    </section>
  );
}
