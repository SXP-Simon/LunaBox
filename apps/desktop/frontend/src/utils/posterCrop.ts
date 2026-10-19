// Normalized source geometry shared by the cover editor and PNG renderer.
export type PosterCrop = { x: number; y: number; zoom: number };
export const DEFAULT_CROP: PosterCrop = { x: 0.5, y: 0.5, zoom: 1 };
export function normalizeCrop(crop?: Partial<PosterCrop>): PosterCrop {
  const clamp = (value: number | undefined, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value! : fallback));
  return { x: clamp(crop?.x, 0.5, 0, 1), y: clamp(crop?.y, 0.5, 0, 1), zoom: clamp(crop?.zoom, 1, 1, 3) };
}
export function posterCoverSource(iw: number, ih: number, width: number, height: number, value?: PosterCrop) {
  const crop = normalizeCrop(value);
  const scale = Math.max(width / iw, height / ih) * crop.zoom;
  const sw = width / scale;
  const sh = height / scale;
  return { x: (iw - sw) * crop.x, y: (ih - sh) * crop.y, width: sw, height: sh };
}
export function panPosterCrop(start: PosterCrop, dx: number, dy: number, iw: number, ih: number, width: number, height: number): PosterCrop {
  const scale = Math.max(width / iw, height / ih) * start.zoom;
  return normalizeCrop({ zoom: start.zoom, x: iw * scale - width > 0.001 ? start.x - dx / (iw * scale - width) : start.x, y: ih * scale - height > 0.001 ? start.y - dy / (ih * scale - height) : start.y });
}
export function zoomPosterCrop(start: PosterCrop, zoom: number, iw: number, ih: number, width: number, height: number): PosterCrop {
  const old = posterCoverSource(iw, ih, width, height, start);
  const next = posterCoverSource(iw, ih, width, height, { ...start, zoom });
  return normalizeCrop({ zoom, x: iw - next.width > 0.001 ? (old.x + old.width / 2 - next.width / 2) / (iw - next.width) : start.x, y: ih - next.height > 0.001 ? (old.y + old.height / 2 - next.height / 2) / (ih - next.height) : start.y });
}
