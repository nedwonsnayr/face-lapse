/**
 * WebGL2 port of the filter pipeline. Steps are normative in
 * .10x/specs/2026-11-10-timelapse-filters-design.md and mirrored in
 * backend/app/services/filters.py; e2e/tests/filter-parity.spec.ts keeps
 * the two within 2/255 per channel. Change both together.
 */
import { BlendMode, FilterDefinition } from "./definition";

const VERTEX = `#version 300 es
void main() {
  // One oversized triangle covers the viewport.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_image;
uniform ivec2 u_size;
uniform float u_brightness;
uniform float u_contrast;
uniform mat3 u_matrix[4];
uniform vec2 u_fade;          // multiplier, offset
uniform vec3 u_tint;
uniform int u_blend;          // 0 soft-light, 1 overlay, 2 multiply, 3 screen
uniform float u_tintStrength;
uniform vec3 u_vignette;      // strength, inner, sqrt(A²+1)
uniform float u_grain;        // amount * 0.2
uniform int u_cells;
uniform uint u_frame;
out vec4 outColor;

uint lowbias32(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}

float blendChannel(float b, float s) {
  if (u_blend == 2) return b * s;
  if (u_blend == 3) return b + s - b * s;
  if (u_blend == 1) return b <= 0.5 ? b * (2.0 * s) : 1.0 - (1.0 - b) * (2.0 * (1.0 - s));
  if (s <= 0.5) return b - (1.0 - 2.0 * s) * b * (1.0 - b);
  float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b);
  return b + (2.0 * s - 1.0) * (d - b);
}

void main() {
  int x = int(gl_FragCoord.x);
  int y = u_size.y - 1 - int(gl_FragCoord.y);   // spec coordinates: top-left origin
  vec3 c = texelFetch(u_image, ivec2(x, y), 0).rgb;
  c = clamp(c * u_brightness, 0.0, 1.0);                                   // 1
  c = clamp((c - 0.5) * u_contrast + 0.5, 0.0, 1.0);                       // 2
  for (int i = 0; i < 4; i++) c = clamp(u_matrix[i] * c, 0.0, 1.0);        // 3-6
  c = clamp(c * u_fade.x + u_fade.y, 0.0, 1.0);                            // 7
  if (u_tintStrength > 0.0) {                                              // 8
    vec3 blended = vec3(blendChannel(c.r, u_tint.r), blendChannel(c.g, u_tint.g), blendChannel(c.b, u_tint.b));
    c = clamp(c + (blended - c) * u_tintStrength, 0.0, 1.0);
  }
  if (u_vignette.x > 0.0) {                                                // 9
    float w = float(u_size.x), h = float(u_size.y);
    float px = (2.0 * (float(x) + 0.5) / w - 1.0) * (w / h);
    float py = 2.0 * (float(y) + 0.5) / h - 1.0;
    float d = sqrt(px * px + py * py) / u_vignette.z;
    float t = clamp((d - u_vignette.y) / 0.5, 0.0, 1.0);
    c = clamp(c * (1.0 - u_vignette.x * (t * t * (3.0 - 2.0 * t))), 0.0, 1.0);
  }
  if (u_grain > 0.0) {                                                     // 10
    uint cx = uint((x * u_cells) / u_size.x);
    uint cy = uint((y * u_cells) / u_size.x);
    uint seed = lowbias32(cx + lowbias32(cy + lowbias32(u_frame)));
    float r = float(seed >> 8u) / 16777215.0 * 2.0 - 1.0;
    c = clamp(c + r * u_grain, 0.0, 1.0);
  }
  outColor = vec4(floor(c * 255.0 + 0.5) / 255.0, 1.0);                     // 11
}`;

const BLEND_INDEX: Record<BlendMode, number> = { "soft-light": 0, overlay: 1, multiply: 2, screen: 3 };

// Row-major 3×3 matrices, exactly as written in the spec (steps 3-6).
const saturate = (s: number) => [
  .213 + .787 * s, .715 - .715 * s, .072 - .072 * s,
  .213 - .213 * s, .715 + .285 * s, .072 - .072 * s,
  .213 - .213 * s, .715 - .715 * s, .072 + .928 * s];
const grayscale = (g: number) => { const a = 1 - g; return [
  .2126 + .7874 * a, .7152 - .7152 * a, .0722 - .0722 * a,
  .2126 - .2126 * a, .7152 + .2848 * a, .0722 - .0722 * a,
  .2126 - .2126 * a, .7152 - .7152 * a, .0722 + .9278 * a]; };
const sepia = (w: number) => { const a = 1 - w; return [
  .393 + .607 * a, .769 - .769 * a, .189 - .189 * a,
  .349 - .349 * a, .686 + .314 * a, .168 - .168 * a,
  .272 - .272 * a, .534 - .534 * a, .131 + .869 * a]; };
const hueRotate = (deg: number) => { const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180); return [
  .213 + .787 * c - .213 * s, .715 - .715 * c - .715 * s, .072 - .072 * c + .928 * s,
  .213 - .213 * c + .143 * s, .715 + .285 * c + .140 * s, .072 - .072 * c - .283 * s,
  .213 - .213 * c - .787 * s, .715 - .715 * c + .715 * s, .072 + .928 * c + .072 * s]; };
const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Same rounding as backend grain_cells(): floor(v + .5). */
export const grainCells = (size: number) => Math.floor(320 - 240 * size + 0.5);

let support: boolean | null = null;
export function webgl2Supported(): boolean {
  if (support === null) {
    try { support = !!document.createElement("canvas").getContext("webgl2"); } catch { support = false; }
  }
  return support;
}

export class FilterRenderer {
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private source: TexImageSource | null = null;
  private size: [number, number] = [0, 0];

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext("webgl2", {
      alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("WebGL2 is unavailable");
    this.gl = gl;
    const compile = (type: number, text: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, text); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost())
        throw new Error(`Filter shader failed: ${gl.getShaderInfoLog(shader)}`);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost())
      throw new Error(`Filter program failed: ${gl.getProgramInfoLog(program)}`);
    this.program = program;
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  }

  private loc(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }

  /** Upload a new photo (only when it changes; slider moves reuse the texture). */
  setSource(source: TexImageSource, width: number, height: number) {
    const gl = this.gl;
    if (this.source === source && this.size[0] === width && this.size[1] === height) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // Raw sRGB bytes, top row first, exactly what Pillow decodes on the server.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.source = source;
    this.size = [width, height];
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  /** Upload raw RGBA pixels (used by the parity test). */
  setPixels(pixels: Uint8Array, width: number, height: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    this.source = null;
    this.size = [width, height];
    this.canvas.width = width; this.canvas.height = height;
  }

  render(f: FilterDefinition, frameIndex: number) {
    const gl = this.gl;
    const [w, h] = this.size;
    if (!w || !h) return;
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.loc("u_image"), 0);
    gl.uniform2i(this.loc("u_size"), w, h);
    gl.uniform1f(this.loc("u_brightness"), f.brightness);
    gl.uniform1f(this.loc("u_contrast"), f.contrast);
    const matrices = [
      f.saturation !== 1 ? saturate(f.saturation) : IDENTITY3,
      f.grayscale !== 0 ? grayscale(f.grayscale) : IDENTITY3,
      f.warmth !== 0 ? sepia(f.warmth) : IDENTITY3,
      f.hue !== 0 ? hueRotate(f.hue) : IDENTITY3,
    ];
    // transpose=true: our arrays are row-major, GLSL mat3 is column-major.
    gl.uniformMatrix3fv(this.loc("u_matrix"), true, new Float32Array(matrices.flat()));
    gl.uniform2f(this.loc("u_fade"), 1 - .35 * f.fade, .22 * f.fade);
    const hex = f.tint.color;
    gl.uniform3f(this.loc("u_tint"), parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
    gl.uniform1i(this.loc("u_blend"), BLEND_INDEX[f.tint.blend]);
    gl.uniform1f(this.loc("u_tintStrength"), f.tint.strength);
    gl.uniform3f(this.loc("u_vignette"), f.vignette.strength, .8 - .6 * f.vignette.size, Math.sqrt((w / h) ** 2 + 1));
    gl.uniform1f(this.loc("u_grain"), f.grain.amount * .2);
    gl.uniform1i(this.loc("u_cells"), grainCells(f.grain.size));
    gl.uniform1ui(this.loc("u_frame"), frameIndex >>> 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** RGBA pixels with the top row first (spec coordinates). */
  readPixels(): Uint8Array {
    const gl = this.gl;
    const [w, h] = this.size;
    const raw = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const out = new Uint8Array(raw.length);
    for (let y = 0; y < h; y++) out.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return out;
  }

  dispose() {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteProgram(this.program);
    this.source = null;
  }
}
