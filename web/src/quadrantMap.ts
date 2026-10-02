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

export const quadrantMap = <Message>(
  h: HtmlBuilder<Message>,
  trail: ReadonlyArray<RegimePoint>,
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
    const { dot, stroke } = quadrantInfo[p.quadrant];
    return h.circle(
      [
        h.Cx(n(x(p.inflationNews))),
        h.Cy(n(y(p.growthNews))),
        h.R(isCurrent ? "7" : clipped ? "5" : "4"),
        h.Class(
          clipped
            ? `fill-none ${stroke} stroke-2`
            : `${dot} ${isCurrent ? "stroke-white stroke-2 dark:stroke-slate-900" : ""}`,
        ),
        h.Attribute(clipped ? "stroke-opacity" : "fill-opacity", opacity.toFixed(2)),
      ],
      [
        h.title(
          [],
          [
            `${quarterLabel(p.date)} · ${p.quadrant}${clipped ? " (off scale)" : ""}\ngrowth news ${pp(p.growthNews)}\ninflation news ${pp(p.inflationNews)}`,
          ],
        ),
      ],
    );
  });

  const current = trail[last];

  return h.svg(
    [
      h.ViewBox(`0 0 ${SIZE} ${SIZE}`),
      h.Role("img"),
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
    ],
  );
};
