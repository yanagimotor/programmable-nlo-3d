// Colour language (after Nature 649, 330 (2026), Fig. 1):
//   programming light 532 nm  -> its real colour, green
//   pump 1.5-1.6 µm           -> red (infrared, invisible; drawn red as in the paper)
//   output 740-820 nm         -> FALSE colour on a blue-centred ramp (azure -> blue -> violet -> magenta),
//                                so the usual ~780 nm output is blue as in the paper and never looks like
//                                the green programming light or the red pump
//   chi2 written by light     -> orange;  electric field -> white;  conducting coating -> salmon
//   high voltage at the probe -> blue-white (sparks, current pulses, rings on the top electrode)

export const PAL = {
  bg: 0x0b0f14,
  green: 0x3fd65a,         // programming light, 532 nm
  light: 0x1eff46,         // the same light drawn in 3D (on the chip, in the projector and the beams): pure, vivid green
  pump: 0xf0140a,          // infrared pump: a deep red
  chi2: 0xff9a2e,          // chi2 written by light
  field: 0xe6ecff,         // bias electric field arrows
  spark: 0x8cc8ff,         // high voltage at the probe (sparks, current pulses)
  pc: 0x6f5c36,            // photoconductor (insulating): a yellowish brown, as the paper's Fig. 1 draws it
  pcOn: 0xff8f6b,          // photoconductor where lit (conducting)
  ito: 0x8a8f86,           // transparent electrode: a faint neutral sheet over the photoconductor
  sio2: 0xe6eaee,
  sin: 0xaebccb,
  si: 0x4b5159,
  metal: 0x9aa4ae,
  black: 0x1b1f24,
  glass: 0x86c8ff,
};

function hsl2rgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

// output wavelength (nm) -> display colour; 750-810 nm spans hue 188 (azure) -> 312 (magenta)
export function shRGB(lnm) {
  const x = (Math.min(810, Math.max(750, lnm)) - 750) / 60;
  return hsl2rgb(188 + 124 * x, 0.88, 0.6);
}

export const css = (rgb, a = 1) => `rgba(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)},${a})`;
export const hex = n => '#' + n.toString(16).padStart(6, '0');
export const rgbOf = n => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
// CSS gradient for the legend swatch of the output false colours
export const shGradientCSS = () => `linear-gradient(90deg, ${[750, 765, 780, 795, 810].map(nm => css(shRGB(nm))).join(', ')})`;
