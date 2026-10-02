/**
 * The four growth × inflation regimes, laid out as in AQR's Exhibit 4:
 *
 *                  inflation news ↓   inflation news ↑
 *   growth news ↑    Goldilocks         Overheating
 *   growth news ↓    Recession          Stagflation
 */
export type Quadrant = "Goldilocks" | "Overheating" | "Stagflation" | "Recession";

/**
 * Classify by the sign of growth and inflation news. Exactly-zero news is
 * treated as "down" — with real data this is a measure-zero edge case.
 */
export const classify = (growthNews: number, inflationNews: number): Quadrant =>
  growthNews > 0
    ? inflationNews > 0
      ? "Overheating"
      : "Goldilocks"
    : inflationNews > 0
      ? "Stagflation"
      : "Recession";
