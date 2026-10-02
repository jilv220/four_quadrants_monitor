import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import {
  pp,
  quadrantInfo,
  quarterLabel,
  type Quadrant,
  type RegimePoint,
} from "./regime.ts";

// Growth × inflation scatter in the layout of AQR's Exhibit 4:
// x = inflation news, y = growth news, Goldilocks top-left.

const SIZE = 420;
const PAD = 44;
const PLOT = SIZE - 2 * PAD;
const MID = SIZE / 2;

/**
 * Symmetric axis bound in decimal units, rounded up to a 0.5pp step.
 * Normally fits the largest point; but when that is more than twice the
 * 90th-percentile magnitude (e.g. the 2020–21 COVID swings reach ±20pp), it
 * scales to the percentile instead so a few outliers can't squash every
 * other point into the origin. Points beyond the bound are pinned to the
 * edge and drawn hollow.
 */
const axisBound = (values: ReadonlyArray<number>): number => {
  const sorted = values.map(Math.abs).sort((a, b) => a - b);
  const max = sorted.at(-1) ?? 0;
  const p90 = sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 0;
  const bound = Math.max(0.005, (max > 2 * p90 ? p90 : max) * 1.1);
  return Math.ceil(bound / 0.005) * 0.005;
};

const clamp = (v: number, bound: number) => Math.max(-bound, Math.min(bound, v));

export interface QuadrantMapInputs<Message> {
  readonly trail: ReadonlyArray<RegimePoint>;
  /** Quarter date (`YYYY-MM-DD`) whose callout is showing, if any. */
  readonly hovered: Option.Option<string>;
  readonly onHover: (date: string) => Message;
  readonly onUnhover: Message;
  /** Tap/click shows the callout — hover doesn't exist on touch screens. */
  readonly onSelect: (date: string) => Message;
}

const TIP_W = 176;
const TIP_H = 62;
const TIP_GAP = 12;

/** Callout box next to a point, flipped to stay inside the viewBox. */
const callout = <Message>(
  h: HtmlBuilder<Message>,
  p: RegimePoint,
  px: number,
  py: number,
  clipped: boolean,
): Html => {
  const left = px + TIP_GAP + TIP_W > SIZE ? px - TIP_GAP - TIP_W : px + TIP_GAP;
  const top = Math.min(Math.max(py - TIP_H / 2, 4), SIZE - TIP_H - 4);
  const line = (text: string, dy: number, cls: string) =>
    h.text([h.X((left + 10).toFixed(1)), h.Y((top + dy).toFixed(1)), h.Class(cls)], [text]);
  const value = "fill-slate-700 text-[11px] tabular-nums dark:fill-slate-200";
  return h.g(
    [h.Class("pointer-events-none"), h.Attribute("aria-hidden", "true")],
    [
      h.rect(
        [
          h.X(left.toFixed(1)),
          h.Y(top.toFixed(1)),
          h.Width(String(TIP_W)),
          h.Height(String(TIP_H)),
          h.Attribute("rx", "6"),
          h.Class("fill-white stroke-slate-300 drop-shadow-md dark:fill-slate-800 dark:stroke-slate-600"),
        ],
        [],
      ),
      line(
        `${quarterLabel(p.date)} · ${p.quadrant}${clipped ? " (off scale)" : ""}`,
        19,
        "fill-slate-900 text-[12px] font-semibold dark:fill-slate-50",
      ),
      line(`Growth news ${pp(p.growthNews)}`, 37, value),
      line(`Inflation news ${pp(p.inflationNews)}`, 53, value),
    ],
  );
};

export const quadrantMap = <Message>(
  h: HtmlBuilder<Message>,
  { trail, hovered, onHover, onUnhover, onSelect }: QuadrantMapInputs<Message>,
): Html => {
  const xMax = axisBound(trail.map((p) => p.inflationNews));
  const yMax = axisBound(trail.map((p) => p.growthNews));
  const x = (v: number) => MID + (clamp(v, xMax) / xMax) * (PLOT / 2);
  const y = (v: number) => MID - (clamp(v, yMax) / yMax) * (PLOT / 2);
  const isClipped = (p: RegimePoint) =>
    Math.abs(p.inflationNews) > xMax || Math.abs(p.growthNews) > yMax;
  const n = (v: number) => v.toFixed(1);

  const region = (quadrant: Quadrant, rx: number, ry: number) =>
    h.rect(
      [
        h.X(n(rx)),
        h.Y(n(ry)),
        h.Width(n(PLOT / 2)),
        h.Height(n(PLOT / 2)),
        h.Class(quadrantInfo[quadrant].fill),
      ],
      [],
    );

  const cornerLabel = (label: string, lx: number, ly: number, anchor: string) =>
    h.text(
      [
        h.X(n(lx)),
        h.Y(n(ly)),
        h.TextAnchor(anchor),
        h.Class("fill-slate-500 text-[11px] font-semibold uppercase tracking-wide dark:fill-slate-400"),
      ],
      [label],
    );

  const tick = (label: string, tx: number, ty: number, anchor: string) =>
    h.text(
      [
        h.X(n(tx)),
        h.Y(n(ty)),
        h.TextAnchor(anchor),
        h.Class("fill-slate-500 text-[10px] tabular-nums dark:fill-slate-400"),
      ],
      [label],
    );

  const axisLine = (x1: number, y1: number, x2: number, y2: number) =>
    h.line(
      [
        h.X1(n(x1)),
        h.Y1(n(y1)),
        h.X2(n(x2)),
        h.Y2(n(y2)),
        h.Class("stroke-slate-400 dark:stroke-slate-500"),
        h.StrokeWidth("1"),
      ],
      [],
    );

  const last = trail.length - 1;
  const points = trail.map((p, i) => {
    const isCurrent = i === last;
    // Older quarters fade out so the direction of travel reads at a glance.
    const opacity = trail.length === 1 ? 1 : 0.25 + (0.75 * i) / last;
    const clipped = isClipped(p);
    const isHovered = Option.contains(hovered, p.date);
    const { dot, stroke } = quadrantInfo[p.quadrant];
    const cx = n(x(p.inflationNews));
    const cy = n(y(p.growthNews));
    const radius = isCurrent ? 7 : clipped ? 5 : 4;
    return h.g(
      [
        h.Key(p.date),
        h.Tabindex(0),
        h.Role("button"),
        h.AriaLabel(
          `${quarterLabel(p.date)}, ${p.quadrant}: growth news ${pp(p.growthNews)}, inflation news ${pp(p.inflationNews)}`,
        ),
        h.OnMouseEnter(onHover(p.date)),
        h.OnMouseLeave(onUnhover),
        h.OnFocus(onHover(p.date)),
        h.OnBlur(onUnhover),
        h.OnClick(onSelect(p.date)),
        h.Class("cursor-pointer outline-none"),
      ],
      [
        // Invisible, larger hit target: the visible dots are only 8px wide.
        h.circle([h.Cx(cx), h.Cy(cy), h.R("11"), h.Fill("transparent")], []),
        h.circle(
          [
            h.Cx(cx),
            h.Cy(cy),
            h.R(String(isHovered ? radius + 2 : radius)),
            h.Class(
              clipped
                ? `fill-none ${stroke} stroke-2`
                : `${dot} ${isCurrent || isHovered ? "stroke-white stroke-2 dark:stroke-slate-900" : ""}`,
            ),
            h.Attribute(
              clipped ? "stroke-opacity" : "fill-opacity",
              isHovered ? "1" : opacity.toFixed(2),
            ),
          ],
          [],
        ),
      ],
    );
  });

  const current = trail[last];
  const hoveredPoint = Option.flatMap(hovered, (date) =>
    Option.fromNullishOr(trail.find((p) => p.date === date)),
  );

  return h.svg(
    [
      h.ViewBox(`0 0 ${SIZE} ${SIZE}`),
      h.Role("group"),
      h.AriaLabel(
        current
          ? `Quadrant map: ${current.quadrant} in ${quarterLabel(current.date)}`
          : "Quadrant map",
      ),
      h.Class("w-full max-w-[520px] select-none"),
    ],
    [
      region("Goldilocks", PAD, PAD),
      region("Overheating", MID, PAD),
      region("Recession", PAD, MID),
      region("Stagflation", MID, MID),
      cornerLabel("Goldilocks", PAD + 8, PAD + 16, "start"),
      cornerLabel("Overheating", SIZE - PAD - 8, PAD + 16, "end"),
      cornerLabel("Recession", PAD + 8, SIZE - PAD - 8, "start"),
      cornerLabel("Stagflation", SIZE - PAD - 8, SIZE - PAD - 8, "end"),
      axisLine(PAD, MID, SIZE - PAD, MID),
      axisLine(MID, PAD, MID, SIZE - PAD),
      tick(pp(-xMax), PAD, MID + 14, "start"),
      tick(pp(xMax), SIZE - PAD, MID + 14, "end"),
      tick(pp(yMax), MID + 6, PAD - 6, "start"),
      tick(pp(-yMax), MID + 6, SIZE - PAD + 14, "start"),
      tick("Inflation news →", SIZE - PAD, SIZE - 10, "end"),
      h.text(
        [
          h.X(n(14)),
          h.Y(n(PAD)),
          h.TextAnchor("end"),
          h.Attribute("transform", `rotate(-90 14 ${PAD})`),
          h.Class("fill-slate-500 text-[10px] dark:fill-slate-400"),
        ],
        ["Growth news →"],
      ),
      h.polyline(
        [
          h.Points(
            trail.map((p) => `${n(x(p.inflationNews))},${n(y(p.growthNews))}`).join(" "),
          ),
          h.Fill("none"),
          h.Class("stroke-slate-400 dark:stroke-slate-500"),
          h.StrokeWidth("1.25"),
          h.Attribute("stroke-dasharray", "3 3"),
        ],
        [],
      ),
      ...points,
      // Drawn last so it sits above every dot.
      ...Option.match(hoveredPoint, {
        onNone: () => [],
        onSome: (p) => [callout(h, p, x(p.inflationNews), y(p.growthNews), isClipped(p))],
      }),
    ],
  );
};
