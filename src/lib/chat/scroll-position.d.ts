export function distanceFromBottom(metrics: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}): number;

export function isNearBottom(
  metrics: {
    scrollTop: number;
    clientHeight: number;
    scrollHeight: number;
  },
  thresholdPx?: number,
): boolean;
