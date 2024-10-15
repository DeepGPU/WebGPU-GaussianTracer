

const SCREEN_VERTEX_SHADER = `
@vertex
fn main(@builtin(vertex_index) VertexIndex : u32) -> @builtin(position) vec4<f32> {
  let pos:vec2<f32> = vec2<f32>(f32((VertexIndex << 1u) & 2u), f32(VertexIndex & 2u));
  return vec4<f32>(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

const SCREEN_FRAG_SHADER = `
@group(0) @binding(0) var<storage> pixelBuffer: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> screenDimension: vec2<f32>;

const exposure: f32 = 1.66;

@fragment
fn main(@builtin(position) coord : vec4<f32>) -> @location(0) vec4<f32> {
  let pixelIndex: u32 = u32(coord.x) + u32(coord.y) * u32(screenDimension.x);
  let hdrColor: vec3<f32> = pixelBuffer[pixelIndex].xyz;
  let ldrColor: vec3<f32> = 1.0 - exp(-exposure * hdrColor);

  return vec4<f32>(hdrColor, 1.0);
}
`;

function createRenderPipeline(device: GPUDevice, swapChainFormat: GPUTextureFormat) {
  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({
        code: SCREEN_VERTEX_SHADER,
      }),
      entryPoint: "main",
    },
    fragment: {
      module: device.createShaderModule({
        code: SCREEN_FRAG_SHADER,
      }),
      entryPoint: "main",
      targets: [{ format: swapChainFormat }],
    }
  });
}


export class ToneMapper {
  private _pipeline: GPURenderPipeline;
  private _bindGroup0: GPUBindGroup;
  private uniformBuffer0;

  constructor(
    device: GPUDevice,
    outBuffer: GPUBuffer,
    width: number,
    height: number,
    format: GPUTextureFormat,
  ) {
    this._pipeline = createRenderPipeline(device, format);
    this.uniformBuffer0 = device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM,
      mappedAtCreation: true,
    });
    new Float32Array(this.uniformBuffer0.getMappedRange()).set([width, height]);
    this.uniformBuffer0.unmap();

    this._bindGroup0 = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: outBuffer }, },
        { binding: 1, resource: { buffer: this.uniformBuffer0 } },
      ],
    });
  }

  get pipeline() { return this._pipeline; }
  get bindGroup0() { return this._bindGroup0; }
}