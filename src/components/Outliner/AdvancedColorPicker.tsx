import * as ContextMenu from "@radix-ui/react-context-menu";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Rgb = { r: number; g: number; b: number };
type Hsv = { h: number; s: number; v: number };

type EyeDropperApi = {
  open: () => Promise<{ sRGBHex: string }>;
};

type EyeDropperConstructor = new () => EyeDropperApi;

const PRESET_COLORS = [
  "#ffffff",
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#0a84ff",
  "#5e5ce6",
  "#bf5af2",
  "#ff2d55",
  "#808080",
  "#000000",
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((character) => character + character)
          .join("")
      : raw;
  return /^[0-9a-f]{6}$/i.test(expanded) ? `#${expanded.toLowerCase()}` : null;
}

function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex) ?? "#ffffff";
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(rgb: Rgb): string {
  const channel = (value: number) =>
    Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

function rgbToHsv(rgb: Rgb): Hsv {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }

  return {
    h: h < 0 ? h + 360 : h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToRgb(hsv: Hsv): Rgb {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = clamp(hsv.s, 0, 1);
  const v = clamp(hsv.v, 0, 1);
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - chroma;
  let base: [number, number, number];

  if (h < 60) base = [chroma, x, 0];
  else if (h < 120) base = [x, chroma, 0];
  else if (h < 180) base = [0, chroma, x];
  else if (h < 240) base = [0, x, chroma];
  else if (h < 300) base = [x, 0, chroma];
  else base = [chroma, 0, x];

  return {
    r: (base[0] + m) * 255,
    g: (base[1] + m) * 255,
    b: (base[2] + m) * 255,
  };
}

function srgbToLinear(channel: number) {
  const value = clamp(channel, 0, 1);
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function linearToSrgb(channel: number) {
  const value = clamp(channel, 0, 1);
  return value <= 0.0031308
    ? value * 12.92
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  precision,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value.toFixed(precision));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value.toFixed(precision));
  }, [focused, precision, value]);

  const commit = () => {
    const parsed = Number(draft);
    const next = Number.isFinite(parsed) ? clamp(parsed, min, max) : value;
    setDraft(next.toFixed(precision));
    onChange(next);
  };

  return (
    <label className="advanced-color-picker__field">
      <span>{label}</span>
      <input
        className="advanced-color-picker__number"
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(parsed)) {
            onChange(clamp(parsed, min, max));
          }
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <input
        className="advanced-color-picker__value-slider"
        aria-label={`${label} slider`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamp(value, min, max)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function HexField({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [focused, value]);

  const commit = () => {
    const normalized = normalizeHex(draft);
    setDraft(normalized ?? value);
    if (normalized) onChange(normalized);
  };

  return (
    <label className="advanced-color-picker__hex">
      <span>HEX</span>
      <input
        aria-label="HEX color"
        value={draft}
        maxLength={7}
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          setDraft(event.target.value);
          const normalized = normalizeHex(event.target.value);
          if (normalized) onChange(normalized);
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

export function AdvancedColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const draggingRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const hex = normalizeHex(value) ?? "#ffffff";
  const rgb = hexToRgb(hex);
  const derivedHsv = rgbToHsv(rgb);
  const [hue, setHue] = useState(derivedHsv.h);
  const hsv = { ...derivedHsv, h: hue };
  const linear = {
    r: srgbToLinear(rgb.r / 255),
    g: srgbToLinear(rgb.g / 255),
    b: srgbToLinear(rgb.b / 255),
  };

  useEffect(() => {
    // Hue is undefined for greys. Preserve the last chosen hue so users can
    // pick a hue first and then drag saturation up from white or black.
    if (derivedHsv.s > 0.0001) setHue(derivedHsv.h);
  }, [derivedHsv.h, derivedHsv.s]);

  const setRgb = (next: Rgb) => onChange(rgbToHex(next));
  const setHsv = (next: Hsv) => {
    setHue(next.h);
    setRgb(hsvToRgb(next));
  };
  const setLinear = (next: Rgb) =>
    setRgb({
      r: linearToSrgb(next.r) * 255,
      g: linearToSrgb(next.g) * 255,
      b: linearToSrgb(next.b) * 255,
    });

  const updateSaturationValue = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHsv({
      h: hsv.h,
      s: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      v: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1),
    });
  };

  const pickFromScreen = async () => {
    const EyeDropper = (
      window as typeof window & { EyeDropper?: EyeDropperConstructor }
    ).EyeDropper;
    if (!EyeDropper) {
      colorInputRef.current?.click();
      return;
    }

    try {
      const result = await new EyeDropper().open();
      const normalized = normalizeHex(result.sRGBHex);
      if (normalized) onChange(normalized);
    } catch {
      // Closing the native eyedropper is an intentional cancellation.
    }
  };

  const copyColor = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(hex);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = hex;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      toast.success(`Copied ${hex}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to copy the color.");
    }
  };

  const pasteColor = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Clipboard reading is not supported.");
      }
      const clipboardValue = await navigator.clipboard.readText();
      const normalized = normalizeHex(clipboardValue);
      if (!normalized) {
        toast.error("Clipboard does not contain a HEX color.");
        return;
      }
      onChange(normalized);
      toast.success(`Pasted ${normalized}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to paste the color.");
    }
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <section
          className={`advanced-color-picker${
            expanded ? " advanced-color-picker--expanded" : ""
          }`}
          data-testid={`color-picker-${label}`}
        >
          <div className="advanced-color-picker__heading">
            <span className="advanced-color-picker__label">{label}</span>
            <button
              type="button"
              className="advanced-color-picker__preview"
              style={{ backgroundColor: hex }}
              aria-label={`${label}の詳細を${expanded ? "閉じる" : "開く"}`}
              aria-expanded={expanded}
              title={
                expanded ? "カラーピッカーを閉じる" : "カラーピッカーを開く"
              }
              onClick={() => setExpanded((current) => !current)}
            />
            <HexField value={hex} onChange={onChange} />
            <button
              className="advanced-color-picker__eyedropper"
              type="button"
              onClick={pickFromScreen}
              title="画面から色を取得"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m19.35 4.65-.7-.7a2.1 2.1 0 0 0-3 0l-1.4 1.4-.9-.9-1.4 1.4.9.9-7.7 7.7a2 2 0 0 0-.53.94l-.72 3.2a1.25 1.25 0 0 0 1.5 1.5l3.2-.72a2 2 0 0 0 .94-.53l7.7-7.7.9.9 1.4-1.4-.9-.9 1.4-1.4a2.1 2.1 0 0 0 0-3Z" />
              </svg>
              <span className="sr-only">スポイト</span>
            </button>
            <input
              ref={colorInputRef}
              className="sr-only"
              type="color"
              value={hex}
              aria-label={`${label} native color picker`}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>

          {expanded && (
            <>
              <div
                className="advanced-color-picker__sv"
                style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
                onPointerDown={(event) => {
                  draggingRef.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateSaturationValue(event);
                }}
                onPointerMove={(event) => {
                  if (draggingRef.current) updateSaturationValue(event);
                }}
                onPointerUp={(event) => {
                  draggingRef.current = false;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                aria-label="彩度と明度"
              >
                <span
                  className="advanced-color-picker__cursor"
                  style={{
                    left: `${hsv.s * 100}%`,
                    top: `${(1 - hsv.v) * 100}%`,
                  }}
                />
              </div>

              <label className="advanced-color-picker__hue">
                <span>H</span>
                <input
                  aria-label="Hue"
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={Math.round(hsv.h)}
                  onChange={(event) =>
                    setHsv({ ...hsv, h: Number(event.target.value) })
                  }
                />
              </label>

              <div
                className="advanced-color-picker__swatches"
                aria-label="カラープリセット"
              >
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-label={preset}
                    aria-pressed={preset === hex}
                    style={{ backgroundColor: preset }}
                    onClick={() => onChange(preset)}
                  />
                ))}
              </div>

              <div className="advanced-color-picker__values">
                <div className="advanced-color-picker__row">
                  <strong>sRGB</strong>
                  <NumberField
                    label="sRGB R"
                    value={rgb.r}
                    min={0}
                    max={255}
                    step={1}
                    precision={0}
                    onChange={(r) => setRgb({ ...rgb, r })}
                  />
                  <NumberField
                    label="sRGB G"
                    value={rgb.g}
                    min={0}
                    max={255}
                    step={1}
                    precision={0}
                    onChange={(g) => setRgb({ ...rgb, g })}
                  />
                  <NumberField
                    label="sRGB B"
                    value={rgb.b}
                    min={0}
                    max={255}
                    step={1}
                    precision={0}
                    onChange={(b) => setRgb({ ...rgb, b })}
                  />
                </div>
                <div className="advanced-color-picker__row">
                  <strong>HSV</strong>
                  <NumberField
                    label="Hue"
                    value={hsv.h}
                    min={0}
                    max={360}
                    step={1}
                    precision={0}
                    onChange={(h) => setHsv({ ...hsv, h })}
                  />
                  <NumberField
                    label="Saturation"
                    value={hsv.s * 100}
                    min={0}
                    max={100}
                    step={1}
                    precision={0}
                    onChange={(s) => setHsv({ ...hsv, s: s / 100 })}
                  />
                  <NumberField
                    label="Value"
                    value={hsv.v * 100}
                    min={0}
                    max={100}
                    step={1}
                    precision={0}
                    onChange={(v) => setHsv({ ...hsv, v: v / 100 })}
                  />
                </div>
                <div className="advanced-color-picker__row advanced-color-picker__row--linear">
                  <strong>Linear</strong>
                  <NumberField
                    label="Linear R"
                    value={linear.r}
                    min={0}
                    max={1}
                    step={0.001}
                    precision={3}
                    onChange={(r) => setLinear({ ...linear, r })}
                  />
                  <NumberField
                    label="Linear G"
                    value={linear.g}
                    min={0}
                    max={1}
                    step={0.001}
                    precision={3}
                    onChange={(g) => setLinear({ ...linear, g })}
                  />
                  <NumberField
                    label="Linear B"
                    value={linear.b}
                    min={0}
                    max={1}
                    step={0.001}
                    precision={3}
                    onChange={(b) => setLinear({ ...linear, b })}
                  />
                </div>
              </div>
            </>
          )}
        </section>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-[150px] rounded-md bg-neutral-800 p-1.5 text-xs text-neutral-100 shadow-xl ring-1 ring-white/10">
          <ContextMenu.Item
            className="cursor-default select-none rounded px-2 py-1.5 outline-none data-[highlighted]:bg-white data-[highlighted]:text-neutral-900"
            onSelect={() => void copyColor()}
          >
            Copy color
            <span className="ml-3 float-right text-white/40">{hex}</span>
          </ContextMenu.Item>
          <ContextMenu.Item
            className="cursor-default select-none rounded px-2 py-1.5 outline-none data-[highlighted]:bg-white data-[highlighted]:text-neutral-900"
            onSelect={() => void pasteColor()}
          >
            Paste color
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
