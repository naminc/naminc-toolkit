"use client";

import { ArrowLeftRight, Check, Clipboard, ImageOff, Trash2, Upload } from "lucide-react";
import { type ChangeEvent, type ClipboardEvent, type DragEvent, type KeyboardEvent, useMemo, useRef, useState } from "react";
import { ActionButton, IconAction, SegmentedControl, Status } from "@/components/tool-ui";
import {
  addColorHistory,
  contrastRatio,
  formatColor,
  formatHex,
  hslToRgb,
  mapImageCoordinates,
  parseColor,
  rgbToHsl,
  swapColors,
  type RgbaColor,
} from "@/lib/color";

type Mode = "convert" | "image";
type CopyTarget = "hex" | "hex8" | "rgb" | "hsl" | "oklch" | "image";

const DEFAULT_COLOR: RgbaColor = { r: 66, g: 106, b: 158, alpha: 1 };
const DEFAULT_BACKGROUND: RgbaColor = { r: 255, g: 255, b: 255, alpha: 1 };
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CANVAS_EDGE = 2048;
const MAX_CANVAS_PIXELS = 4_000_000;

function colorStyle(color: RgbaColor) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${color.alpha})`;
}

function bounded(value: number, max: number) {
  return Math.min(max, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file, { imageOrientation: "from-image" });
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ColorConverterTool() {
  const [mode, setMode] = useState<Mode>("convert");
  const [color, setColor] = useState<RgbaColor>(DEFAULT_COLOR);
  const [colorInput, setColorInput] = useState("#426A9E");
  const [inputError, setInputError] = useState("");
  const [background, setBackground] = useState<RgbaColor>(DEFAULT_BACKGROUND);
  const [backgroundInput, setBackgroundInput] = useState("#FFFFFF");
  const [backgroundError, setBackgroundError] = useState("");
  const [history, setHistory] = useState<RgbaColor[]>([]);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [notice, setNotice] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [selection, setSelection] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const values = useMemo(() => formatColor(color), [color]);
  const hsl = useMemo(() => rgbToHsl(color), [color]);
  const ratio = useMemo(() => contrastRatio(color, background), [color, background]);

  function commitColor(next: RgbaColor, addToHistory = true, updateInput = true) {
    setColor(next);
    if (updateInput) setColorInput(formatHex(next, next.alpha < 0.9995));
    setInputError("");
    if (addToHistory) setHistory((current) => addColorHistory(current, next));
  }

  function changeColorInput(value: string) {
    setColorInput(value);
    setNotice("");
    if (!value.trim()) {
      setInputError("Enter a color value.");
      return;
    }
    try {
      commitColor(parseColor(value), false, false);
    } catch (caught) {
      setInputError(caught instanceof Error ? caught.message : "Enter a valid color.");
    }
  }

  function commitTypedColor() {
    try { commitColor(parseColor(colorInput)); } catch { return; }
  }

  function updateHsl(field: "h" | "s" | "l", value: number, addToHistory = false) {
    commitColor(hslToRgb({ ...hsl, [field]: value, alpha: color.alpha }), addToHistory);
  }

  function updateAlpha(value: number, addToHistory = false) {
    commitColor({ ...color, alpha: Math.min(1, Math.max(0, value)) }, addToHistory);
  }

  function changeBackground(value: string) {
    setBackgroundInput(value);
    try {
      setBackground(parseColor(value));
      setBackgroundError("");
    } catch (caught) {
      setBackgroundError(caught instanceof Error ? caught.message : "Enter a valid background color.");
    }
  }

  function swapContrastColors() {
    const [nextForeground, nextBackground] = swapColors(color, background);
    commitColor(nextForeground);
    setBackground(nextBackground);
    setBackgroundInput(formatHex(nextBackground, nextBackground.alpha < 0.9995));
    setBackgroundError("");
  }

  async function copy(value: string, target: CopyTarget) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      setNotice(`Copied ${target === "image" ? "selected image color" : target.toUpperCase()}.`);
      window.setTimeout(() => setCopied((current) => current === target ? null : current), 1600);
    } catch {
      setNotice("Clipboard access failed. Check browser permissions and try again.");
    }
  }

  function removeImage() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setImageLoaded(false);
    setImageSize({ width: 0, height: 0 });
    setSelection(null);
    setImageError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function loadFile(file: File | undefined) {
    setImageError("");
    setNotice("");
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      setImageError("Choose a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("The image exceeds the 10 MB limit.");
      return;
    }
    try {
      const decoded = await decodeImage(file);
      const sourceWidth = decoded.width;
      const sourceHeight = decoded.height;
      const edgeScale = Math.min(1, MAX_CANVAS_EDGE / Math.max(sourceWidth, sourceHeight));
      const pixelScale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (sourceWidth * sourceHeight)));
      const scale = Math.min(edgeScale, pixelScale);
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { willReadFrequently: true });
      if (!canvas || !context) throw new Error("Canvas is unavailable in this browser.");
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(decoded, 0, 0, width, height);
      if ("close" in decoded && typeof decoded.close === "function") decoded.close();
      setImageSize({ width, height });
      setImageLoaded(true);
      setSelection(null);
      setNotice(sourceWidth === width && sourceHeight === height ? `Image ready at ${width} x ${height} pixels.` : `Image scaled to ${width} x ${height} pixels for local processing.`);
    } catch {
      removeImage();
      setImageError("The browser could not decode this image.");
    }
  }

  function samplePixel(x: number, y: number) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context || !imageLoaded) return;
    const nextX = bounded(x, canvas.width - 1);
    const nextY = bounded(y, canvas.height - 1);
    const pixel = context.getImageData(nextX, nextY, 1, 1).data;
    commitColor({ r: pixel[0], g: pixel[1], b: pixel[2], alpha: pixel[3] / 255 });
    setSelection({ x: nextX, y: nextY });
    setNotice(`Selected pixel ${nextX}, ${nextY}.`);
  }

  function pickFromPointer(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas || !imageLoaded) return;
    const point = mapImageCoordinates(clientX, clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);
    samplePixel(point.x, point.y);
  }

  function moveSelection(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!imageLoaded || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const current = selection ?? { x: Math.floor(imageSize.width / 2), y: Math.floor(imageSize.height / 2) };
    samplePixel(current.x + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0), current.y + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0));
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const file = [...event.clipboardData.items].find((item) => item.kind === "file" && IMAGE_TYPES.has(item.type))?.getAsFile();
    if (file) {
      event.preventDefault();
      void loadFile(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void loadFile(event.dataTransfer.files[0]);
  }

  function useExample() {
    setMode("convert");
    commitColor({ r: 0, g: 153, b: 255, alpha: 0.72 });
    setNotice("Loaded an example color with 72% opacity.");
  }

  function clearAll() {
    setColor(DEFAULT_COLOR);
    setColorInput("");
    setInputError("");
    setBackground(DEFAULT_BACKGROUND);
    setBackgroundInput("#FFFFFF");
    setBackgroundError("");
    setHistory([]);
    setCopied(null);
    removeImage();
    setNotice("Cleared color, image, and session history.");
  }

  const formatRows: { key: CopyTarget; label: string; value: string }[] = [
    { key: "hex", label: "HEX", value: values.hex },
    { key: "hex8", label: "HEX with alpha", value: values.hex8 },
    { key: "rgb", label: "RGB", value: values.rgb },
    { key: "hsl", label: "HSL", value: values.hsl },
    { key: "oklch", label: "OKLCH", value: values.oklch },
  ];

  return <div className="workspace color-workspace">
    <div className="workspace-toolbar color-mode-bar">
      <SegmentedControl label="Color tool mode" value={mode} onChange={setMode} options={[{ value: "convert", label: "Convert color" }, { value: "image", label: "Pick from image" }]} />
      <span>HEX, RGB, HSL, OKLCH</span>
    </div>

    {mode === "convert" ? <div className="color-convert-layout">
      <section className="color-editor" aria-label="Color input and controls">
        <label className="color-code-input"><span>Color value</span><input aria-label="Color value" value={colorInput} onChange={(event) => changeColorInput(event.target.value)} onBlur={commitTypedColor} onKeyDown={(event) => { if (event.key === "Enter") commitTypedColor(); }} placeholder="#426A9E or rgb(66 106 158)" spellCheck={false} autoComplete="off" /></label>
        {inputError && <p className="color-inline-error" role="alert">{inputError}</p>}
        <div className="color-preview-grid">
          <div className="color-preview checkerboard" aria-label={`Color preview ${values.hex8}`}><div style={{ backgroundColor: colorStyle(color) }} /><code>{values.hex8}</code></div>
          <div className="color-context-preview"><span style={{ backgroundColor: colorStyle(color), color: ratio >= 4.5 ? colorStyle(background) : undefined }}>Aa</span><div><i className="on-light" style={{ backgroundColor: colorStyle(color) }} /><i className="on-dark" style={{ backgroundColor: colorStyle(color) }} /></div></div>
        </div>
        <div className="color-controls">
          <label className="native-color-control"><span>Picker</span><input aria-label="Native color picker" type="color" value={values.hex} onInput={(event) => commitColor({ ...parseColor(event.currentTarget.value), alpha: color.alpha })} /></label>
          <ColorRange label="Hue" value={hsl.h} min={0} max={360} step={1} unit="deg" onChange={(value) => updateHsl("h", value)} onCommit={() => setHistory((current) => addColorHistory(current, color))} />
          <ColorRange label="Saturation" value={hsl.s} min={0} max={100} step={1} unit="%" onChange={(value) => updateHsl("s", value)} onCommit={() => setHistory((current) => addColorHistory(current, color))} />
          <ColorRange label="Lightness" value={hsl.l} min={0} max={100} step={1} unit="%" onChange={(value) => updateHsl("l", value)} onCommit={() => setHistory((current) => addColorHistory(current, color))} />
          <ColorRange label="Alpha" value={color.alpha * 100} min={0} max={100} step={1} unit="%" onChange={(value) => updateAlpha(value / 100)} onCommit={() => setHistory((current) => addColorHistory(current, color))} />
        </div>
      </section>

      <section className="color-output" aria-label="Output formats">
        <div className="color-section-heading"><span>Converted values</span><small>Rounded for CSS output</small></div>
        <div className="color-value-list">{formatRows.map((item) => <div className="color-value-row" key={item.key}><span>{item.label}</span><code>{item.value}</code><IconAction label={`Copy ${item.label}`} onClick={() => void copy(item.value, item.key)}>{copied === item.key ? <Check size={15} /> : <Clipboard size={15} />}</IconAction></div>)}</div>
        <div className="contrast-section">
          <div className="color-section-heading"><span>Contrast checker</span><IconAction label="Swap foreground and background" onClick={swapContrastColors}><ArrowLeftRight size={15} /></IconAction></div>
          <div className="contrast-inputs"><label><span>Foreground</span><input aria-label="Contrast foreground" value={values.hex8} readOnly /></label><label><span>Background</span><input aria-label="Contrast background" value={backgroundInput} onChange={(event) => changeBackground(event.target.value)} spellCheck={false} /></label></div>
          {backgroundError ? <p className="color-inline-error" role="alert">{backgroundError}</p> : <><div className="contrast-score"><strong>{ratio.toFixed(2)}:1</strong><span>after alpha compositing</span></div><div className="contrast-results">{[["AA normal", 4.5], ["AA large", 3], ["AAA normal", 7], ["AAA large", 4.5]].map(([label, threshold]) => { const passed = ratio >= Number(threshold); return <div key={String(label)}><span>{label}</span><strong className={passed ? "pass" : "fail"}>{passed ? "Pass" : "Fail"}</strong></div>; })}</div><p className="contrast-note">Contrast is one accessibility check, not a complete accessibility evaluation.</p></>}
        </div>
      </section>
    </div> : <section className="image-picker" aria-label="Image color picker">
      <div className={`image-dropzone${imageLoaded ? " has-image" : ""}`} tabIndex={0} onPaste={handlePaste} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <input ref={fileInputRef} className="sr-only" aria-label="Upload image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event: ChangeEvent<HTMLInputElement>) => void loadFile(event.target.files?.[0])} />
        <div className="image-toolbar"><div><strong>{imageLoaded ? "Local image" : "Choose an image"}</strong><span>{imageLoaded ? `${imageSize.width} x ${imageSize.height} working pixels` : "PNG, JPEG, WebP, or GIF up to 10 MB"}</span></div><div className="button-row"><ActionButton onClick={() => fileInputRef.current?.click()} icon={<Upload size={15} />}>{imageLoaded ? "Replace" : "Upload"}</ActionButton>{imageLoaded && <IconAction label="Remove image" onClick={removeImage}><ImageOff size={15} /></IconAction>}</div></div>
        {!imageLoaded && <div className="image-empty"><Upload size={22} aria-hidden="true" /><p>Drop, paste, or upload an image. Nothing is sent to a server.</p></div>}
        <div className="image-canvas-wrap" hidden={!imageLoaded}>
          <canvas ref={canvasRef} tabIndex={imageLoaded ? 0 : -1} aria-label="Image color sampling canvas. Use arrow keys to move the selected pixel." onClick={(event) => pickFromPointer(event.clientX, event.clientY)} onKeyDown={moveSelection} />
          {selection && <span className="image-crosshair" aria-hidden="true" style={{ left: `${(selection.x + 0.5) / imageSize.width * 100}%`, top: `${(selection.y + 0.5) / imageSize.height * 100}%` }} />}
        </div>
      </div>
      {imageError && <Status type="error">{imageError}</Status>}
      {imageLoaded && <div className="image-sample-panel">
        <div className="image-sample-color checkerboard"><i style={{ backgroundColor: colorStyle(color) }} /></div>
        <div><span>Selected color</span><strong>{values.hex8}</strong><small>{selection ? `Pixel ${selection.x}, ${selection.y}` : "Select a pixel from the image"}</small></div>
        <label><span>X</span><input aria-label="Image X coordinate" type="number" min={0} max={Math.max(0, imageSize.width - 1)} value={selection?.x ?? 0} onChange={(event) => samplePixel(Number(event.target.value), selection?.y ?? 0)} /></label>
        <label><span>Y</span><input aria-label="Image Y coordinate" type="number" min={0} max={Math.max(0, imageSize.height - 1)} value={selection?.y ?? 0} onChange={(event) => samplePixel(selection?.x ?? 0, Number(event.target.value))} /></label>
        <IconAction label="Copy selected image color" onClick={() => void copy(values.hex8, "image")}>{copied === "image" ? <Check size={15} /> : <Clipboard size={15} />}</IconAction>
      </div>}
    </section>}

    <section className="color-history" aria-label="Session color history">
      <div className="color-section-heading"><span>Session history</span>{history.length > 0 && <button type="button" className="text-button" onClick={() => setHistory([])}>Clear history</button>}</div>
      {history.length ? <div className="history-swatches">{history.map((item) => { const value = formatHex(item, true); return <button key={value} type="button" aria-label={`Select ${value}`} title={value} className="checkerboard" onClick={() => commitColor(item, false)}><i style={{ backgroundColor: colorStyle(item) }} /></button>; })}</div> : <p>No colors selected in this session.</p>}
    </section>

    {notice && <div className="color-live-status" role="status" aria-live="polite">{notice}</div>}
    <Status type="info">Colors and images are processed locally in your browser.</Status>
    <div className="workspace-footer"><button className="text-button" type="button" onClick={useExample}>Use example</button><ActionButton onClick={clearAll} icon={<Trash2 size={15} />}>Clear</ActionButton></div>
  </div>;
}

function ColorRange({ label, value, min, max, step, unit, onChange, onCommit }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void; onCommit: () => void }) {
  const shown = Math.round(value * 10) / 10;
  return <div className="color-range-row"><label htmlFor={`color-${label.toLowerCase()}`}>{label}</label><input id={`color-${label.toLowerCase()}`} aria-label={`${label} slider`} type="range" min={min} max={max} step={step} value={shown} onChange={(event) => onChange(Number(event.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} /><label className="color-number"><span className="sr-only">{label} value</span><input aria-label={`${label} value`} type="number" min={min} max={max} step={step} value={shown} onChange={(event) => onChange(Number(event.target.value))} onBlur={onCommit} /><span>{unit}</span></label></div>;
}
