export type RgbaColor = { r: number; g: number; b: number; alpha: number };
export type HslaColor = { h: number; s: number; l: number; alpha: number };
export type OklchColor = { l: number; c: number; h: number; alpha: number };

export class ColorParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ColorParseError";
  }
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)%?$/;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

function rounded(value: number, digits = 2) {
  return cleanZero(Number(value.toFixed(digits)));
}

function parseNumber(token: string, label: string) {
  const value = token.trim();
  if (!NUMBER.test(value)) throw new ColorParseError(`${label} must be a number.`);
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) throw new ColorParseError(`${label} must be finite.`);
  return { numeric, percent: value.endsWith("%") };
}

function parseAlpha(token: string | undefined) {
  if (token === undefined) return 1;
  const { numeric, percent } = parseNumber(token, "Alpha");
  const alpha = percent ? numeric / 100 : numeric;
  if (alpha < 0 || alpha > 1) throw new ColorParseError("Alpha must be between 0 and 1, or 0% and 100%.");
  return alpha;
}

function parseRgbChannel(token: string, label: string) {
  const { numeric, percent } = parseNumber(token, label);
  if (percent) {
    if (numeric < 0 || numeric > 100) throw new ColorParseError(`${label} must be between 0% and 100%.`);
    return numeric * 2.55;
  }
  if (numeric < 0 || numeric > 255) throw new ColorParseError(`${label} must be between 0 and 255.`);
  return numeric;
}

function normalizeHue(value: number) {
  return ((value % 360) + 360) % 360;
}

function parseHue(token: string) {
  const value = token.trim().toLowerCase();
  const match = value.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)?$/);
  if (!match) throw new ColorParseError("Hue must be a number with an optional deg, grad, rad, or turn unit.");
  const numeric = Number(match[1]);
  const unit = match[2] ?? "deg";
  const degrees = unit === "turn" ? numeric * 360 : unit === "rad" ? numeric * 180 / Math.PI : unit === "grad" ? numeric * 0.9 : numeric;
  return normalizeHue(degrees);
}

function parsePercentage(token: string, label: string) {
  const { numeric, percent } = parseNumber(token, label);
  if (!percent) throw new ColorParseError(`${label} must use a percentage.`);
  if (numeric < 0 || numeric > 100) throw new ColorParseError(`${label} must be between 0% and 100%.`);
  return numeric;
}

function functionParts(contents: string) {
  if (contents.includes(",")) {
    if (contents.includes("/")) throw new ColorParseError("Do not mix comma and slash color syntax.");
    return { channels: contents.split(",").map((part) => part.trim()), alpha: undefined, legacy: true };
  }
  const slash = contents.split("/");
  if (slash.length > 2) throw new ColorParseError("A color can contain only one alpha separator.");
  return { channels: slash[0].trim().split(/\s+/).filter(Boolean), alpha: slash[1]?.trim(), legacy: false };
}

export function parseHex(input: string): RgbaColor {
  const match = input.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) throw new ColorParseError("HEX colors must contain 3, 4, 6, or 8 hexadecimal digits.");
  let value = match[1];
  if (value.length <= 4) value = [...value].map((character) => character + character).join("");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    alpha: value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgb(name: string, contents: string): RgbaColor {
  const parts = functionParts(contents);
  const expected = parts.legacy && name === "rgba" ? 4 : 3;
  if (parts.channels.length !== expected) throw new ColorParseError(`${name.toUpperCase()} requires three color channels${name === "rgba" ? " and an alpha value" : ""}.`);
  if (!parts.legacy && name === "rgba" && parts.alpha === undefined) throw new ColorParseError("RGBA requires an alpha value after a slash.");
  const alphaToken = parts.legacy && name === "rgba" ? parts.channels[3] : parts.alpha;
  return {
    r: parseRgbChannel(parts.channels[0], "Red"),
    g: parseRgbChannel(parts.channels[1], "Green"),
    b: parseRgbChannel(parts.channels[2], "Blue"),
    alpha: parseAlpha(alphaToken),
  };
}

function parseHsl(name: string, contents: string): RgbaColor {
  const parts = functionParts(contents);
  const expected = parts.legacy && name === "hsla" ? 4 : 3;
  if (parts.channels.length !== expected) throw new ColorParseError(`${name.toUpperCase()} requires hue, saturation, and lightness${name === "hsla" ? ", plus alpha" : ""}.`);
  if (!parts.legacy && name === "hsla" && parts.alpha === undefined) throw new ColorParseError("HSLA requires an alpha value after a slash.");
  const alphaToken = parts.legacy && name === "hsla" ? parts.channels[3] : parts.alpha;
  return hslToRgb({
    h: parseHue(parts.channels[0]),
    s: parsePercentage(parts.channels[1], "Saturation"),
    l: parsePercentage(parts.channels[2], "Lightness"),
    alpha: parseAlpha(alphaToken),
  });
}

function parseOklch(contents: string): RgbaColor {
  const parts = functionParts(contents);
  if (parts.legacy || parts.channels.length !== 3) throw new ColorParseError("OKLCH uses space-separated lightness, chroma, and hue values.");
  const lightness = parseNumber(parts.channels[0], "Lightness");
  const l = lightness.percent ? lightness.numeric / 100 : lightness.numeric;
  const chroma = parseNumber(parts.channels[1], "Chroma");
  if (chroma.percent) throw new ColorParseError("OKLCH chroma must be a number, not a percentage.");
  if (l < 0 || l > 1) throw new ColorParseError("OKLCH lightness must be between 0 and 1, or 0% and 100%.");
  if (chroma.numeric < 0 || chroma.numeric > 0.4) throw new ColorParseError("OKLCH chroma must be between 0 and 0.4.");
  return oklchToRgb({ l, c: chroma.numeric, h: parseHue(parts.channels[2]), alpha: parseAlpha(parts.alpha) });
}

export function parseColor(input: string): RgbaColor {
  const value = input.trim();
  if (!value) throw new ColorParseError("Enter a HEX, RGB, HSL, or OKLCH color.");
  if (value.startsWith("#")) return parseHex(value);
  const match = value.match(/^([a-z]+)\((.*)\)$/i);
  if (!match) throw new ColorParseError("Use a supported HEX, RGB, HSL, or OKLCH color format.");
  const name = match[1].toLowerCase();
  if (name === "rgb" || name === "rgba") return parseRgb(name, match[2]);
  if (name === "hsl" || name === "hsla") return parseHsl(name, match[2]);
  if (name === "oklch") return parseOklch(match[2]);
  throw new ColorParseError(`The ${name.toUpperCase()} color format is not supported.`);
}

export function rgbToHsl(color: RgbaColor): HslaColor {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h: normalizeHue(h), s: s * 100, l: l * 100, alpha: color.alpha };
}

export function hslToRgb(color: HslaColor): RgbaColor {
  const h = normalizeHue(color.h);
  const s = clamp(color.s, 0, 100) / 100;
  const l = clamp(color.l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let channels: [number, number, number];
  if (h < 60) channels = [c, x, 0];
  else if (h < 120) channels = [x, c, 0];
  else if (h < 180) channels = [0, c, x];
  else if (h < 240) channels = [0, x, c];
  else if (h < 300) channels = [x, 0, c];
  else channels = [c, 0, x];
  return { r: (channels[0] + m) * 255, g: (channels[1] + m) * 255, b: (channels[2] + m) * 255, alpha: clamp(color.alpha, 0, 1) };
}

function srgbToLinear(channel: number) {
  const value = clamp(channel / 255, 0, 1);
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number) {
  const value = channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.abs(channel) ** (1 / 2.4) * Math.sign(channel) - 0.055;
  return clamp(value, 0, 1) * 255;
}

export function rgbToOklch(color: RgbaColor): OklchColor {
  const r = srgbToLinear(color.r);
  const g = srgbToLinear(color.g);
  const b = srgbToLinear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(a * a + labB * labB);
  const h = c < 0.000001 ? 0 : normalizeHue(Math.atan2(labB, a) * 180 / Math.PI);
  return { l: lightness, c, h, alpha: color.alpha };
}

export function oklchToRgb(color: OklchColor): RgbaColor {
  const radians = normalizeHue(color.h) * Math.PI / 180;
  const a = color.c * Math.cos(radians);
  const b = color.c * Math.sin(radians);
  const lRoot = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = color.l - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha: clamp(color.alpha, 0, 1),
  };
}

function byte(value: number) {
  return Math.round(clamp(value, 0, 255));
}

function hexByte(value: number) {
  return byte(value).toString(16).padStart(2, "0").toUpperCase();
}

export function formatHex(color: RgbaColor, includeAlpha = false) {
  return `#${hexByte(color.r)}${hexByte(color.g)}${hexByte(color.b)}${includeAlpha ? hexByte(color.alpha * 255) : ""}`;
}

export function formatRgb(color: RgbaColor) {
  const channels = `${byte(color.r)}, ${byte(color.g)}, ${byte(color.b)}`;
  return color.alpha < 0.9995 ? `rgba(${channels}, ${rounded(color.alpha, 3)})` : `rgb(${channels})`;
}

export function formatHsl(color: RgbaColor) {
  const hsl = rgbToHsl(color);
  const channels = `${rounded(hsl.h, 1)}, ${rounded(hsl.s, 1)}%, ${rounded(hsl.l, 1)}%`;
  return color.alpha < 0.9995 ? `hsla(${channels}, ${rounded(color.alpha, 3)})` : `hsl(${channels})`;
}

export function formatOklch(color: RgbaColor) {
  const oklch = rgbToOklch(color);
  const channels = `${rounded(oklch.l * 100, 2)}% ${rounded(oklch.c, 4)} ${rounded(oklch.h, 2)}`;
  return color.alpha < 0.9995 ? `oklch(${channels} / ${rounded(color.alpha, 3)})` : `oklch(${channels})`;
}

export function formatColor(color: RgbaColor) {
  return { hex: formatHex(color), hex8: formatHex(color, true), rgb: formatRgb(color), hsl: formatHsl(color), oklch: formatOklch(color) };
}

export function compositeColors(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  if (alpha === 0) return { r: 0, g: 0, b: 0, alpha: 0 };
  return {
    r: (foreground.r * foreground.alpha + background.r * background.alpha * (1 - foreground.alpha)) / alpha,
    g: (foreground.g * foreground.alpha + background.g * background.alpha * (1 - foreground.alpha)) / alpha,
    b: (foreground.b * foreground.alpha + background.b * background.alpha * (1 - foreground.alpha)) / alpha,
    alpha,
  };
}

export function relativeLuminance(color: RgbaColor) {
  return 0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b);
}

export function contrastRatio(foreground: RgbaColor, background: RgbaColor) {
  const white = { r: 255, g: 255, b: 255, alpha: 1 };
  const opaqueBackground = background.alpha < 1 ? compositeColors(background, white) : background;
  const opaqueForeground = foreground.alpha < 1 ? compositeColors(foreground, opaqueBackground) : foreground;
  const first = relativeLuminance(opaqueForeground);
  const second = relativeLuminance(opaqueBackground);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function swapColors(first: RgbaColor, second: RgbaColor) {
  return [second, first] as const;
}

export type ImageRect = { left: number; top: number; width: number; height: number };

export function mapImageCoordinates(clientX: number, clientY: number, rect: ImageRect, imageWidth: number, imageHeight: number) {
  if (rect.width <= 0 || rect.height <= 0 || imageWidth <= 0 || imageHeight <= 0) throw new Error("Image dimensions must be positive.");
  return {
    x: clamp(Math.floor((clientX - rect.left) / rect.width * imageWidth), 0, imageWidth - 1),
    y: clamp(Math.floor((clientY - rect.top) / rect.height * imageHeight), 0, imageHeight - 1),
  };
}

export function addColorHistory(history: RgbaColor[], color: RgbaColor, limit = 10) {
  const key = formatHex(color, true);
  return [color, ...history.filter((item) => formatHex(item, true) !== key)].slice(0, limit);
}
