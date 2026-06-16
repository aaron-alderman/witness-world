/**
 * App-owned mill-force helper kernels for the Engentus frontend.
 *
 * These are authored Engentus numerical leaves, kept out of the reusable
 * chart-runtime plugin boundary. Faithful to
 * example-ports/engentus/js/mill_force_model.js.
 */

const TWO_PI = 2 * Math.PI;
const METHOD_ORDER = ["faithful", "grounded"];

function seededUnit(seed) {
  let s = (Number(seed) || 0) | 0;
  s = (s + 0x6D2B79F5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function seededNormal(sample, salt) {
  const base = Math.imul((Number(sample) | 0) + 1, 1103515245) + Math.imul(Number(salt) | 0, 2654435761);
  const u1 = Math.max(1e-10, seededUnit(base));
  const u2 = seededUnit(base + 1);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TWO_PI * u2);
}

function methodDelta(values) {
  if (!Array.isArray(values)) return 0;
  const faithful = values[METHOD_ORDER.indexOf("faithful")] ?? 0;
  const grounded = values[METHOD_ORDER.indexOf("grounded")] ?? 0;
  return Number(faithful) - Number(grounded);
}

function signedFixed(value, digits) {
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(digits)}`;
}

function methodRelativeDeltaPercent(values) {
  if (!Array.isArray(values)) return 0;
  const faithful = Number(values[METHOD_ORDER.indexOf("faithful")] ?? 0);
  const grounded = Number(values[METHOD_ORDER.indexOf("grounded")] ?? 0);
  if (Math.abs(faithful) <= 1e-14) return 0;
  return (faithful - grounded) / Math.abs(faithful) * 100;
}

const _GL64_X = [
  0.0243502926634244325089, 0.0729931217877990394495, 0.1214628509941929108768, 0.1696444204239928180374,
  0.2174236437400070841497, 0.2646871622087674163881, 0.3113228719902109561575, 0.3572201583376681159504,
  0.4022701579639916036958, 0.4463660172534640879849, 0.4894031457070529574785, 0.5312794640198945456881,
  0.5718956462026340342839, 0.6111553551723932502488, 0.6489654712546573398578, 0.6852363130542332425635,
  0.7198818501716108268490, 0.7528199072605318966118, 0.7839723589433414076102, 0.8132653151227975597419,
  0.8406292962525803627516, 0.8659993981540928197608, 0.8893154459951141058534, 0.9105221370785028057563,
  0.9295691721319395758214, 0.9464113748584028160625, 0.9610087996520537189186, 0.9733268277899109637418,
  0.9833362538846259569312, 0.9910133714767443207393, 0.9963401167719552793469, 0.9993050417357721394569
];
const _GL64_W = [
  0.0486909570091397203834, 0.0485754674415034269347, 0.0483447622348029571697, 0.0479993885964583077282,
  0.0475401657148303086622, 0.0469681828162100173253, 0.0462847965813144172959, 0.0454916279274181444797,
  0.0445905581637565630601, 0.0435837245293234533768, 0.0424735151236535890073, 0.0412625632426235286101,
  0.0399537411327203413866, 0.0385501531786156291289, 0.0370551285402400460404, 0.0354722132568823838106,
  0.0338051618371416093915, 0.0320579283548515535854, 0.0302346570724024788612, 0.0283396726142594832275,
  0.0263774697150546586716, 0.0243527025687108733382, 0.0222701738083832541006, 0.0201348231535302093723,
  0.0179517157756973430850, 0.0157260304760247193219, 0.0134630478967186425981, 0.0111681394601311288185,
  0.0088467598263639477231, 0.0065044579689783628561, 0.0041470332605624676352, 0.0017832807216964329472
];

function gaussLegendreQuad(f, a, b) {
  const mid = (a + b) / 2;
  const half = (b - a) / 2;
  let s = 0;
  for (let i = 0; i < 32; i++) {
    const dx = half * _GL64_X[i];
    s += _GL64_W[i] * (f(mid + dx) + f(mid - dx));
  }
  return s * half;
}

function brentq(f, a, b, tol = 1e-10, maxIter = 100) {
  let fa = f(a);
  let fb = f(b);
  if (fa * fb > 0) throw new Error(`brentq: f(a),f(b) same sign (${fa}, ${fb})`);
  if (Math.abs(fa) < tol) return a;
  if (Math.abs(fb) < tol) return b;
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = e = b - a;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * 2.22e-16 * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || Math.abs(fb) < tol) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let p;
      let q;
      let r;
      const s2 = fb / fa;
      if (a === c) {
        p = 2 * xm * s2;
        q = 1 - s2;
      } else {
        q = fa / fc;
        r = fb / fc;
        p = s2 * (2 * xm * q * (q - r) - (b - a) * (r - 1));
        q = (q - 1) * (r - 1) * (s2 - 1);
      }
      if (p > 0) q = -q;
      else p = -p;
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
    fb = f(b);
  }
  return b;
}

const polarToXY = (r, theta) => [r * Math.sin(theta), -r * Math.cos(theta)];

function shoelaceArea(xs, ys) {
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    const j = (i + 1) % xs.length;
    s += xs[i] * ys[j] - xs[j] * ys[i];
  }
  return Math.abs(s) / 2;
}

function shoelaceCentroid(xs, ys) {
  let area6 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < xs.length; i++) {
    const j = (i + 1) % xs.length;
    const cross = xs[i] * ys[j] - xs[j] * ys[i];
    area6 += cross;
    cx += (xs[i] + xs[j]) * cross;
    cy += (ys[i] + ys[j]) * cross;
  }
  if (Math.abs(area6) < 1e-14) return [0, 0];
  return [cx / (3 * area6), cy / (3 * area6)];
}

const segmentArea = (dTheta, r) => (dTheta - Math.sin(dTheta)) / 2 * r * r;

function segmentCentroidR(dTheta, r) {
  const denom = 3 * (dTheta - Math.sin(dTheta));
  if (Math.abs(denom) < 1e-14) return r;
  return 4 * r * Math.pow(Math.sin(dTheta / 2), 3) / denom;
}

function chordRadialIntercept(theta, m, c) {
  const denom = Math.cos(theta) + m * Math.sin(theta);
  if (Math.abs(denom) < 1e-12) return Infinity;
  return -c / denom;
}

function generateRadialSlice(t1, t2, r, m, c) {
  const r1 = Math.max(0, Math.min(r, chordRadialIntercept(t1, m, c)));
  const r2 = Math.max(0, Math.min(r, chordRadialIntercept(t2, m, c)));
  const pts = [polarToXY(r, t1), polarToXY(r1, t1), polarToXY(r2, t2), polarToXY(r, t2)];
  return { xs: pts.map(p => p[0]), ys: pts.map(p => p[1]) };
}

function generateVerticalSlice(t1, t2, rInner, m, c) {
  const [x1, y1] = polarToXY(rInner, t1);
  const [x2, y2] = polarToXY(rInner, t2);
  const y1c = y1 > 0 ? y1 : m * x1 + c;
  const y2c = y2 > 0 ? y2 : m * x2 + c;
  return { xs: [x1, x1, x2, x2], ys: [y1, y1c, y2c, y2] };
}

const areaCDProfile = (gamma, r, h) => 0.5 * (gamma * r * r - Math.sin(gamma) * (r - h) * (r - h));

function calcGammaFaithful(J, r, h) {
  const n = 500;
  const gammas = Array.from({ length: n }, (_, i) => i * TWO_PI / n);
  const ratios = gammas.map(g => areaCDProfile(g, r, h) / (Math.PI * r * r));
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ratios[mid] <= J) lo = mid;
    else hi = mid - 1;
  }
  return gammas[Math.max(0, Math.min(lo, n - 1))];
}

const calcGammaGrounded = J => brentq(g => (g - Math.sin(g)) / TWO_PI - J, 1e-9, TWO_PI - 1e-9);

function physicalDisplayDeg(segment, phi, dTheta) {
  const raw = Number(phi) - Number(dTheta) * (Number(segment) - 0.5);
  const deg = (((raw * 180 / Math.PI) % 360) + 360) % 360;
  return (deg + 180) % 360;
}

function forceChartDisplayDeg(theta) {
  const deg = (((Number(theta) * 180 / Math.PI) % 360) + 360) % 360;
  return (deg + 180) % 360;
}

function displayDegText(theta) {
  const displayDeg = ((((Number(theta) - Math.PI / 2) * 180 / Math.PI) % 360) + 360) % 360;
  return `${displayDeg.toFixed(1)}°`;
}

export const millForceKernels = {
  tangential_sign: method => (method === "faithful" ? 1 : -1),
  pick_method: (values, method) => {
    const index = METHOD_ORDER.indexOf(String(method || "grounded"));
    return Array.isArray(values) ? values[index >= 0 ? index : 1] : values;
  },
  pick_grounded: values => Array.isArray(values) ? values[METHOD_ORDER.indexOf("grounded")] : values,
  deg_text: value => `${Number(value * 180 / Math.PI).toFixed(1)}°`,
  display_deg_text: displayDegText,
  omega_text: value => `${Number(value).toFixed(3)} rad/s`,
  rho_charge_text: value => `${Number(value).toFixed(3)} SG`,
  force_kn_text: value => `${(Number(value) / 1000).toFixed(1)} kN`,
  force_kn0_text: value => `${(Number(value) / 1000).toFixed(0)} kN`,
  force_abs_label: () => "|F|",
  samples_computed_text: value => `${Math.round(Number(value) || 0)} samples computed`,
  deg_delta_text: values => `${signedFixed(methodDelta(values) * 180 / Math.PI, 1)}°`,
  force_delta_kn_text: values => `${signedFixed(methodDelta(values) / 1000, 1)} kN`,
  pct_delta_text: values => `${signedFixed(methodRelativeDeltaPercent(values), 2)}%`,
  physical_display_deg: physicalDisplayDeg,
  force_chart_display_deg: forceChartDisplayDeg,
  normal_param: (sample, value, enabled, std, salt = 0) =>
    enabled ? Number(value) + Number(std) * seededNormal(sample, salt) : Number(value),

  fill_angle: (J, radius, height, method) =>
    method === "faithful" ? calcGammaFaithful(J, radius, height) : calcGammaGrounded(J),

  gravity_area: (t1, t2, rInner, radius, mFill, cFill, dTheta, phi, phiPrime, method) => {
    const arc = t1 - t2;
    if (arc < 1e-12) return 0;
    if (method !== "faithful") {
      const stripArea = theta => {
        const denom = Math.cos(theta) + mFill * Math.sin(theta);
        if (Math.abs(denom) < 1e-12) return 0;
        const rFill = -cFill / denom;
        if (rFill >= radius) return 0;
        const rCi = Math.max(rInner, rFill);
        return 0.5 * (radius * radius - rCi * rCi);
      };
      return gaussLegendreQuad(stripArea, t2, t1);
    }
    const inCharge = t1 >= phiPrime;
    const inVert = t1 > phiPrime;
    const fullySub = phiPrime + dTheta < t1 && t1 <= phi;
    const A_hollow = inCharge ? arc / TWO_PI * (radius * radius - rInner * rInner) : 0;
    let A_vert = 0;
    if (inVert) {
      const vs = generateVerticalSlice(t1, t2, rInner, mFill, cFill);
      A_vert = shoelaceArea(vs.xs, vs.ys);
    }
    const A_seg_v = fullySub ? segmentArea(dTheta, rInner) : 0;
    return A_hollow + A_vert + A_seg_v;
  },

  cf_mass_moment: (t1, t2, rInner, radius, mFill, cFill, dTheta, phi, phiPrime, depth, rhoCharge, method) => {
    const arc = t1 - t2;
    if (arc < 1e-12) return 0;
    const massScale = depth * rhoCharge * 1000;
    if (method !== "faithful") {
      const stripMoment = theta => {
        const denom = Math.cos(theta) + mFill * Math.sin(theta);
        if (Math.abs(denom) < 1e-12) return 0;
        const rFill = -cFill / denom;
        if (rFill >= radius) return 0;
        const rCi = Math.max(rInner, rFill);
        return (radius * radius * radius - rCi * rCi * rCi) / 3;
      };
      return gaussLegendreQuad(stripMoment, t2, t1) * massScale;
    }
    const inCharge = t1 >= phiPrime;
    const fullySub = phiPrime + dTheta < t1 && t1 <= phi;
    let m_rad = 0;
    let Cr = 0;
    if (inCharge) {
      const rs = generateRadialSlice(t1, t2, radius, mFill, cFill);
      m_rad = shoelaceArea(rs.xs, rs.ys) * massScale;
      const [cx, cy] = shoelaceCentroid(rs.xs, rs.ys);
      Cr = Math.sqrt(cx * cx + cy * cy);
    }
    const m_seg_r = (fullySub ? segmentArea(dTheta, radius) : 0) * massScale;
    const Csr = fullySub ? segmentCentroidR(dTheta, radius) : 0;
    return Cr * m_rad + Csr * m_seg_r;
  }
};
