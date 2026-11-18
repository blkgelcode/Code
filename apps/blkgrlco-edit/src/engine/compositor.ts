// WebGL2 compositor: draws the layers of a frame on the GPU — video/image layers (fit, opacity),
// then the titles layer on top. Later phases add transforms, color (3D LUT textures), effects
// and transitions as shader stages here, so the GPU does all the per-pixel work.
const VS = `#version 300 es
in vec2 aPos;           // unit quad 0..1
uniform vec4 uRect;     // destination rect in clip space: x0, y0, x1, y1
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x, 1.0 - aPos.y);
  gl_Position = vec4(mix(uRect.x, uRect.z, aPos.x), mix(uRect.y, uRect.w, aPos.y), 0.0, 1.0);
}`;
const FS = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uAlpha;
uniform bool uPremul;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUv);
  if (!uPremul) c.rgb *= c.a;
  outColor = c * uAlpha;
}`;

export type LayerSource = TexImageSource;
export interface Layer { source: LayerSource; width: number; height: number; fit: "cover" | "contain"; alpha: number }

export class Compositor {
  readonly gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture[] = [];
  private uRect: WebGLUniformLocation;
  private uAlpha: WebGLUniformLocation;
  private uPremul: WebGLUniformLocation;
  private textCanvas: OffscreenCanvas | HTMLCanvasElement;
  readonly text: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 isn't available");
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    this.prog = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.uRect = gl.getUniformLocation(p, "uRect")!;
    this.uAlpha = gl.getUniformLocation(p, "uAlpha")!;
    this.uPremul = gl.getUniformLocation(p, "uPremul")!;
    gl.uniform1i(gl.getUniformLocation(p, "uTex"), 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.textCanvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(canvas.width, canvas.height) : document.createElement("canvas");
    this.text = this.textCanvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  }

  private texture(i: number) {
    const gl = this.gl;
    if (!this.tex[i]) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.tex[i] = t;
    }
    return this.tex[i];
  }

  resize(w: number, h: number) {
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    if (this.textCanvas.width !== w || this.textCanvas.height !== h) { this.textCanvas.width = w; this.textCanvas.height = h; }
  }

  /** Draw one frame: background, layers bottom→top, then whatever was drawn on `text`. */
  render(background: string, layers: Layer[], withText: boolean) {
    const gl = this.gl;
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    const [r, g, b] = hexRgb(background);
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    layers.forEach((L, i) => {
      if (!L.width || !L.height || L.alpha <= 0) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture(i));
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, L.source);
      const k = L.fit === "contain" ? Math.min(W / L.width, H / L.height) : Math.max(W / L.width, H / L.height);
      const dw = (L.width * k) / W, dh = (L.height * k) / H; // fraction of the canvas
      gl.uniform4f(this.uRect, -dw, -dh, dw, dh);
      gl.uniform1f(this.uAlpha, L.alpha);
      gl.uniform1i(this.uPremul, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
    if (withText) {
      const i = layers.length;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture(i));
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas as TexImageSource);
      gl.uniform4f(this.uRect, -1, -1, 1, 1);
      gl.uniform1f(this.uAlpha, 1);
      gl.uniform1i(this.uPremul, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  dispose() { for (const t of this.tex) this.gl.deleteTexture(t); this.gl.getExtension("WEBGL_lose_context")?.loseContext(); }
}

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = m ? parseInt(m[1], 16) : 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
