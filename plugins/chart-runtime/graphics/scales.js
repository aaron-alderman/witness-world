export function linearScale(domain, range) {
  return { domain: [...domain], range: [...range] };
}

export function bandScale(domain = [], range = [0, 1], { padding = 0 } = {}) {
  const values = [...domain];
  const start = Number(range[0]) || 0;
  const end = Number(range[1]) || 0;
  const span = end - start;
  const count = Math.max(values.length, 1);
  const step = span / Math.max(count + padding * Math.max(count - 1, 0), 1);
  const bandwidth = step * Math.max(0, 1 - padding);
  const offset = bandwidth < 0 ? 0 : (step - bandwidth) / 2;
  const index = new Map(values.map((value, position) => [value, position]));
  return {
    domain: values,
    range: [start, end],
    step,
    bandwidth,
    scale(value) {
      const position = index.get(value);
      return position == null ? null : start + position * step + offset;
    }
  };
}

export function ordinalScale(domain = [], range = []) {
  const values = [...domain];
  const outputs = [...range];
  const index = new Map(values.map((value, position) => [value, position]));
  return {
    domain: values,
    range: outputs,
    scale(value) {
      const position = index.get(value);
      if (position == null || !outputs.length) return null;
      return outputs[position % outputs.length];
    }
  };
}

export function projectLinear(scale, value) {
  const [d0, d1] = scale.domain;
  const [r0, r1] = scale.range;
  return r0 + ((Number(value) - d0) / ((d1 - d0) || 1)) * (r1 - r0);
}

export function invertLinear(scale, value) {
  const [d0, d1] = scale.domain;
  const [r0, r1] = scale.range;
  return d0 + ((Number(value) - r0) / ((r1 - r0) || 1)) * (d1 - d0);
}

export function clampToDomain(scale, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  const lo = Math.min(scale.domain[0], scale.domain[1]);
  const hi = Math.max(scale.domain[0], scale.domain[1]);
  return Math.max(lo, Math.min(hi, n));
}

export function niceTickStep(span, targetCount) {
  if (!(span > 0)) return 1;
  const raw = span / Math.max(1, targetCount);
  const pow10 = 10 ** Math.floor(Math.log10(raw));
  const err = raw / pow10;
  const nice = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  return nice * pow10;
}

export function linearTicks(domain = [0, 1], targetCount = 7) {
  const start = Number(domain[0]);
  const end = Number(domain[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return [];
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const step = niceTickStep(hi - lo, targetCount);
  const first = Math.ceil(lo / step) * step;
  const ticks = [];
  for (let value = first; value <= hi + step * 1e-6; value += step) {
    ticks.push(Math.abs(value) < step * 1e-9 ? 0 : Number(value.toFixed(10)));
  }
  return start <= end ? ticks : ticks.reverse();
}

export function formatTick(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(Number(n.toFixed(2)));
}
