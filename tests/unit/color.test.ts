import { describe, expect, it } from "vitest";
import {
  addColorHistory,
  compositeColors,
  contrastRatio,
  formatColor,
  formatHex,
  hslToRgb,
  mapImageCoordinates,
  oklchToRgb,
  parseColor,
  relativeLuminance,
  rgbToHsl,
  rgbToOklch,
  swapColors,
  type RgbaColor,
} from "@/lib/color";

const red: RgbaColor = { r: 255, g: 0, b: 0, alpha: 1 };
const blue: RgbaColor = { r: 0, g: 0, b: 255, alpha: 1 };

describe("color parsing", () => {
  it("parses 3, 4, 6, and 8 digit HEX in either case", () => {
    expect(parseColor("#09f")).toEqual({ r: 0, g: 153, b: 255, alpha: 1 });
    expect(parseColor("#09f8")).toMatchObject({ r: 0, g: 153, b: 255, alpha: 0.5333333333333333 });
    expect(parseColor(" #0099FF ")).toEqual({ r: 0, g: 153, b: 255, alpha: 1 });
    expect(parseColor("#0099ff80")).toMatchObject({ r: 0, g: 153, b: 255, alpha: 0.5019607843137255 });
  });

  it("parses legacy and modern RGB with numeric and percentage alpha", () => {
    expect(parseColor("rgb(0, 153, 255)")).toEqual({ r: 0, g: 153, b: 255, alpha: 1 });
    expect(parseColor("rgb(0 153 255 / 50%)")).toEqual({ r: 0, g: 153, b: 255, alpha: 0.5 });
    expect(parseColor("rgba(100%, 0%, 50%, .25)")).toEqual({ r: 254.99999999999997, g: 0, b: 127.49999999999999, alpha: 0.25 });
  });

  it("parses HSL, HSLA, hue units, and wraps hue", () => {
    expect(formatHex(parseColor("hsl(0, 100%, 50%)"))).toBe("#FF0000");
    expect(formatHex(parseColor("hsl(1turn 100% 50%)"))).toBe("#FF0000");
    expect(formatHex(parseColor("hsl(-120 100% 50%)"))).toBe("#0000FF");
    expect(parseColor("hsla(240, 100%, 50%, 25%)").alpha).toBe(0.25);
  });

  it("parses OKLCH and preserves alpha", () => {
    const color = parseColor("oklch(62.8% 0.2577 29.23 / 0.4)");
    expect(color.r).toBeCloseTo(255, 0);
    expect(color.g).toBeCloseTo(0, 0);
    expect(color.b).toBeCloseTo(0, 0);
    expect(color.alpha).toBe(0.4);
  });

  it("rejects malformed and out-of-range inputs with useful errors", () => {
    expect(() => parseColor("#12")).toThrow(/3, 4, 6, or 8/);
    expect(() => parseColor("rgb(256, 0, 0)")).toThrow(/between 0 and 255/);
    expect(() => parseColor("rgb(0 0 0 / 120%)")).toThrow(/Alpha/);
    expect(() => parseColor("hsl(0 50 50%)")).toThrow(/Saturation/);
    expect(() => parseColor("oklch(120% 0.2 20)")).toThrow(/lightness/);
    expect(() => parseColor("lab(50 0 0)")).toThrow(/not supported/);
  });
});

describe("color conversion and formatting", () => {
  it("round trips RGB and HSL, including achromatic colors", () => {
    const source = { r: 66, g: 106, b: 158, alpha: 0.7 };
    const roundTrip = hslToRgb(rgbToHsl(source));
    expect(roundTrip.r).toBeCloseTo(source.r, 8);
    expect(roundTrip.g).toBeCloseTo(source.g, 8);
    expect(roundTrip.b).toBeCloseTo(source.b, 8);
    expect(rgbToHsl({ r: 128, g: 128, b: 128, alpha: 1 })).toMatchObject({ h: 0, s: 0 });
  });

  it("round trips RGB and OKLCH within floating point tolerance", () => {
    const source = { r: 20, g: 140, b: 220, alpha: 0.65 };
    const roundTrip = oklchToRgb(rgbToOklch(source));
    expect(roundTrip.r).toBeCloseTo(source.r, 3);
    expect(roundTrip.g).toBeCloseTo(source.g, 3);
    expect(roundTrip.b).toBeCloseTo(source.b, 3);
    expect(roundTrip.alpha).toBe(0.65);
  });

  it("formats HEX, HEX8, RGB, HSL, and OKLCH CSS", () => {
    expect(formatColor({ r: 0, g: 153, b: 255, alpha: 0.5 })).toEqual({
      hex: "#0099FF",
      hex8: "#0099FF80",
      rgb: "rgba(0, 153, 255, 0.5)",
      hsl: "hsla(204, 100%, 50%, 0.5)",
      oklch: expect.stringMatching(/^oklch\(.+ \/ 0\.5\)$/),
    });
    expect(formatHex({ r: 255, g: 255, b: 255, alpha: 1 })).toBe("#FFFFFF");
    expect(formatHex({ r: 0, g: 0, b: 0, alpha: 1 })).toBe("#000000");
  });
});

describe("contrast and compositing", () => {
  it("calculates known luminance and contrast values", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0, alpha: 1 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255, alpha: 1 })).toBeCloseTo(1, 8);
    expect(contrastRatio({ r: 0, g: 0, b: 0, alpha: 1 }, { r: 255, g: 255, b: 255, alpha: 1 })).toBeCloseTo(21, 8);
  });

  it("composites alpha before measuring contrast", () => {
    const composite = compositeColors({ r: 0, g: 0, b: 0, alpha: 0.5 }, { r: 255, g: 255, b: 255, alpha: 1 });
    expect(composite).toMatchObject({ r: 127.5, g: 127.5, b: 127.5, alpha: 1 });
    expect(contrastRatio({ r: 0, g: 0, b: 0, alpha: 0.5 }, { r: 255, g: 255, b: 255, alpha: 1 })).toBeCloseTo(3.9767, 3);
  });

  it("swaps foreground and background", () => {
    expect(swapColors(red, blue)).toEqual([blue, red]);
  });
});

describe("image coordinates and session history", () => {
  it("maps and clamps scaled pointer coordinates to pixels", () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 };
    expect(mapImageCoordinates(110, 70, rect, 400, 200)).toEqual({ x: 200, y: 100 });
    expect(mapImageCoordinates(-50, 500, rect, 400, 200)).toEqual({ x: 0, y: 199 });
  });

  it("deduplicates recent colors and enforces a limit", () => {
    const green = { r: 0, g: 255, b: 0, alpha: 1 };
    expect(addColorHistory([red, blue], red)).toEqual([red, blue]);
    expect(addColorHistory([red, blue], green, 2)).toEqual([green, red]);
  });
});
