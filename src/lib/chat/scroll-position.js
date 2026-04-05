const DEFAULT_BOTTOM_THRESHOLD_PX = 96;

export function distanceFromBottom({ scrollTop, clientHeight, scrollHeight }) {
  return Math.max(0, Number(scrollHeight) - (Number(scrollTop) + Number(clientHeight)));
}

export function isNearBottom(metrics, thresholdPx = DEFAULT_BOTTOM_THRESHOLD_PX) {
  return distanceFromBottom(metrics) <= thresholdPx;
}
