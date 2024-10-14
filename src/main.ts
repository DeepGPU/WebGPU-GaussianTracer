import '../webrtx/src/patch';
import { Mat4, Vec2, Vec3, mat4, mat3, vec3 } from 'wgpu-matrix';
import { ArcballCamera, WASDCamera } from './camera';
import { createInputHandler } from './input'; 
import { ToneMapper } from './toneMapper';
import { loadGaussianSplatting, PackedGaussians } from './GS_ply';
import { code_raygen_shader, code_anyhit_shader, code_closesthit_shader, } from './GS_shader';

var degree = 3.14159265358979323846 / 180.0;
function hFov2focalLength(hFov: number, sensorW: number) {
  return (sensorW/2) / Math.tan(hFov*degree/2);
}

async function gaussianSceneToBvh(
  device: GPUDevice, 
  gsData: PackedGaussians,
  alpha_min: number
) {
  // 1. https://superhedralcom.wordpress.com/2020/05/17/building-the-unit-icosahedron/
  // 2. https://polyhedr.com/icosahedron.html
  const r = (3 + Math.sqrt(5.0)) / (2 * Math.sqrt(3.0)); 
  const s = 1/r;
  const t = (1.0 + Math.sqrt(5.0)) / (2.0*r);
  const vertices = new Float32Array([
    -s,  t,  0,    s,  t,  0,   -s, -t,  0,    s, -t,  0,
     0, -s,  t,    0,  s,  t,   0, -s, -t,    0,  s, -t,
     t,  0, -s,    t,  0,  s,  -t,  0, -s,   -t,  0,  s
  ]);
  const indices = new Uint32Array([
    0, 11, 5,  0, 5, 1,  0, 1, 7,  0, 7, 10,  0, 10, 11,
    1, 5, 9,  5, 11, 4,  11, 10, 2,  10, 7, 6,  7, 1, 8,
    3, 9, 4,  3, 4, 2,  3, 2, 6,  3, 6, 8,  3, 8, 9,
    4, 9, 5,  2, 4, 11,  6, 2, 10,  8, 6, 7,  9, 8, 1
  ]);

  const vBuffer = device.createBuffer({
    label: "isosahedron.vertex.buffer",
    size: vertices.byteLength,
    usage: GPUBufferUsageRTX.ACCELERATION_STRUCTURE_BUILD_INPUT_READONLY,
    mappedAtCreation: true,
  });
  new Float32Array(vBuffer.getMappedRange()).set(vertices);
  vBuffer.unmap();
  
  const iBuffer = device.createBuffer({
    label: "isosahedron.index.buffer",
    size: indices.byteLength,
    usage: GPUBufferUsageRTX.ACCELERATION_STRUCTURE_BUILD_INPUT_READONLY,
    mappedAtCreation: true,
  });
  new Uint32Array(iBuffer.getMappedRange()).set(indices);
  iBuffer.unmap();

  const blasDesc: GPURayTracingAccelerationContainerDescriptor_bottom = {
    usage: GPURayTracingAccelerationContainerUsage.NONE,
    level: 'bottom',
    geometries: [{
      usage: GPURayTracingAccelerationGeometryUsage.NONE,
      type: 'triangles',
      vertex: {
        buffer: vBuffer,
        format: 'float32x3',
        stride: 4 * 3,    // Maybe, only 4 x 3 is supported!!
      },
      index: {
        buffer: iBuffer,
        format: 'uint32',
      },
    }],
  };

  const transforms: Float32Array[] = [];
  for(let i = 0; i < gsData.numGaussians; i++) {
    const [x, y, z] = gsData.gaussianData[i]['position'];
    const opacity = gsData.gaussianData[i]['opacity'];
    const [rr, rx, ry, rz] = gsData.gaussianData[i]['rotQuat'];
    const [sx, sy, sz] = gsData.gaussianData[i]['scale'];

    const s = opacity > alpha_min ? Math.sqrt(2*Math.log(opacity / alpha_min)) : 0.0;
    const scale = mat4.scaling([s*sx, s*sy, s*sz]);
    const rotation = mat4.fromMat3(mat3.fromQuat([rx, ry, rz, rr]));   // This is the transpose of the R matrix in the shader.
    const mat4x4 = mat4.mul(mat4.translation([x, y, z]), mat4.mul(rotation, scale));
    const mat4x3 = new Float32Array(12); // 3 rows, 4 columns
    mat4x3.subarray(0,  3).set(mat4x4.subarray( 0,  3));
    mat4x3.subarray(3,  6).set(mat4x4.subarray( 4,  7));
    mat4x3.subarray(6,  9).set(mat4x4.subarray( 8, 11));
    mat4x3.subarray(9, 12).set(mat4x4.subarray(12, 15));
    transforms.push(mat4x3);
  }

  const tlasDesc: GPURayTracingAccelerationContainerDescriptor_top = {
    level: 'top',
    usage: GPURayTracingAccelerationContainerUsage.NONE,
    instances: transforms.map((transform, i) => ({
      usage: GPURayTracingAccelerationInstanceUsage.NONE,
      mask: 0xFF,
      transformMatrix: transform,
      instanceSBTRecordOffset: i, 
      blas: blasDesc,
    })),
  };

  const tlas = device.createRayTracingAccelerationContainer(tlasDesc);
  device.hostBuildRayTracingAccelerationContainer(tlas);
  return tlas;
}

async function createRayTracingPipeline(
  device: GPUDevice, 
  tlas: GPURayTracingAccelerationContainer_top,
  hit_array_size: number
) {
  const stages: GPURayTracingShaderStageDescriptor[] = [{
    stage: GPUShaderStageRTX.RAY_GENERATION,
    entryPoint: 'main',
    glslCode: code_raygen_shader(hit_array_size),
  }, {
    stage: GPUShaderStageRTX.RAY_ANY_HIT,
    entryPoint: 'main',
    glslCode: code_anyhit_shader(hit_array_size),
  }, {
    stage: GPUShaderStageRTX.RAY_CLOSEST_HIT,
    entryPoint: 'main',
    glslCode: code_closesthit_shader(hit_array_size),
  }];

  const groups: GPURayTracingShaderGroupDescriptor[] = [
    {
      type: 'general',
      generalIndex: 0,
    }, {
      type: 'triangles-hit-group',
      anyHitIndex: 1,
      closestHitIndex: 2,
    }
  ];

  return device.createRayTracingPipeline({stages, groups}, tlas);
}

function createShaderBindingTable(
  device: GPUDevice,
  pipeline: GPURayTracingPipeline,
  numParticles: number
) {
  const sbt: GPUShaderBindingTable = {
    rayGen: {},
    rayMiss: {},
    rayHit: {},
    callable: {},
  } as GPUShaderBindingTable;

  const LITTLE_ENDIAN = true;
  function alignTo(x: number, align: number): number {
    return Math.floor((x + align - 1) / align) * align;
  }
    
  // 0~4 : ShaderGroupHandleSize
  // 4~8 : GaussianParticleIndex
  // 8~32 : padding
  const recordSize = device.ShaderGroupHandleSize + 4;
  const stride = alignTo(recordSize, device.ShaderGroupHandleAlignment); // alignTo 32
  let sbtOffset = 0;
  
  sbt.rayGen.start = sbtOffset;
  sbt.rayGen.stride = stride;
  sbt.rayGen.size = sbt.rayGen.stride;
  sbtOffset += alignTo(sbt.rayGen.start + sbt.rayGen.size, device.ShaderGroupBaseAlignment);
  
  sbt.rayHit.start = sbtOffset;
  sbt.rayHit.stride = stride;
  sbt.rayHit.size = numParticles * stride;
  sbtOffset += alignTo(sbt.rayHit.start + sbt.rayHit.size, device.ShaderGroupBaseAlignment);
  
  sbt.buffer = device.createBuffer({
    label: "shaderbindingtable.buffer",
    size: sbtOffset,
    usage: GPUBufferUsageRTX.SHADER_BINDING_TABLE,
    mappedAtCreation: true,
  });
  {
    const [rgenH, hitGp] = pipeline.getShaderGroupHandles(0, 2);
    const sbtView = new DataView(sbt.buffer.getMappedRange());

    {
      const byteOffset = sbt.rayGen.start;
      sbtView.setUint32(byteOffset, rgenH, LITTLE_ENDIAN);
    }

    for(let i = 0; i < numParticles; i++) {
      const byteOffset = sbt.rayHit.start + i * sbt.rayHit.stride;
      sbtView.setUint32(byteOffset + 0, hitGp, LITTLE_ENDIAN);
      sbtView.setUint32(byteOffset + 4, i, LITTLE_ENDIAN);
    }
  }
  sbt.buffer.unmap();

  return sbt;
}


async function main(canvas: HTMLCanvasElement) 
{
  if (!navigator.gpu || !navigator.gpu.requestAdapter) {
    throw 'WebGPU is not supported or not enabled, please check chrome://flags/#enable-unsafe-webgpu';
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('failed to requestAdapter')
  }

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice({
      requiredFeatures: ["ray_tracing" as GPUFeatureName],
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize / 2,
        maxBufferSize : adapter.limits.maxStorageBufferBindingSize / 2,
        // maxStorageBuffersPerShaderStage : adapter.limits.maxStorageBuffersPerShaderStage,
      },
    });
    console.log(`maxStorageBufferBindingSize: ${adapter.limits.maxStorageBufferBindingSize / 2}`);
    console.log(`maxBufferSize: ${adapter.limits.maxBufferSize / 2}`);
  } catch (e) {
    console.error(e);
    device = await adapter.requestDevice({
      requiredFeatures: ["ray_tracing" as GPUFeatureName]
    });
  }

  if (!device) {
    throw new Error('failed to get gpu device');
  }

  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('failed to get WebGPU context')
  }
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format: canvasFormat });
  const {width, height} = canvas;

  let t0 = Date.now();
  // const gsData = await loadGaussianSplatting('../data/pc_short.ply');
  const gsData = await loadGaussianSplatting('../data/train.ply');
  console.log(`Ply file read time: ${(Date.now()-t0)/1000}`);

  const alpha_min = 0.01;
  const hit_array_size = 16;

  t0 = Date.now();
  const tlas = await gaussianSceneToBvh(device, gsData, alpha_min);
  console.log(`Bvh build time: ${(Date.now()-t0)/1000}`);

  const rtPipeline = await createRayTracingPipeline(device, tlas, hit_array_size);
  const sbt = createShaderBindingTable(device, rtPipeline, gsData.numGaussians);

  const pixelBuffer = device.createBuffer({
    label: "raytracer.out.buffer",
    size: width * height * 4 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE
  });

  const gsBuffer = device.createBuffer({
    label: "raytracer.gaussianparticle.buffer",
    size: gsData.gaussianArrayLayout.size,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  new Uint8Array(gsBuffer.getMappedRange()).set(new Uint8Array(gsData.gaussiansBuffer));
  gsBuffer.unmap();

  const uniformBufferSize = 112;
  const uniformBuffer = device.createBuffer({
    label: 'raytracer.uniforms.buffer',
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const rtBindGroup = device.createBindGroup({
    layout: rtPipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0,
      resource: tlas as any,
    }, {
      binding: 1,
      resource: { buffer: pixelBuffer },
    }, {
      binding: 2,
      resource: { buffer: gsBuffer },
    }, {
      binding: 3,
      resource: { buffer: uniformBuffer },
    }]
  });

  const toneMapper = new ToneMapper(device, pixelBuffer, width, height, canvasFormat);

  const camera = new WASDCamera({
    position: vec3.create(0, 0, 5), 
    target: vec3.create(0, 0, 0)
  });
  const inputHandler = createInputHandler(window, canvas);

  const uniforms = {
    toWorld: camera.matrix,
    hFov: 60.0,
    t_min: 1e-3,
    t_max: 1e5,
    T_min: 0.03,
    sh_degree_max: 3,
    accumulatedFrames: 0,
  };
  
  const uniformData = new ArrayBuffer(uniformBufferSize);
  const fview = new Float32Array(uniformData);
  const uview = new Uint32Array(uniformData);

  const upadateUniformData = () => {
    fview.set(uniforms.toWorld);
    fview[16] = Math.tan(0.5*uniforms.hFov * Math.PI / 180.0);
    fview[17] = fview[16] * (height / width);
    fview[18] = uniforms.t_min;
    fview[19] = uniforms.t_max;
    fview[20] = uniforms.T_min;
    fview[21] = alpha_min;
    uview[22] = hit_array_size;
    uview[23] = uniforms.sh_degree_max;
    uview[24] = uniforms.accumulatedFrames;
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);
  };
  upadateUniformData();

  const maxElapsedTime = 1.0;
  let elapsedTime = 0.0;
  let lastTime = 0;
  let frameCount = 0;

  function frame(time: number) {
    const deltaTime = (time - lastTime) / 1000;
    elapsedTime += deltaTime;
    if(maxElapsedTime <= elapsedTime) {
      document.getElementById('fpsDisplay')!.innerText = `FPS: ${(frameCount/elapsedTime).toFixed(2)}`;
      elapsedTime = 0;
      frameCount = 0;
    }

    const input = inputHandler();
    if(input.digital.forward || input.digital.backward || 
       input.digital.left || input.digital.right || 
       input.digital.up || input.digital.down ||
       input.analog.x || input.analog.y || input.analog.zoom) {
        uniforms.accumulatedFrames = 0;
    }

    camera.update(deltaTime, input);
    uniforms.toWorld = camera.matrix;
    upadateUniformData();

    const commandEncoder = device.createCommandEncoder();

    // ray tracing pass
    {
      const passEncoder = commandEncoder.beginRayTracingPass();
      passEncoder.setPipeline(rtPipeline);
      passEncoder.setBindGroup(0, rtBindGroup);
      passEncoder.traceRays(
        device,
        sbt,
        width,
        height,
      );
      passEncoder.end();
    }
    // rasterization pass
    {
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
          view: context!.getCurrentTexture().createView(),
        }]
      });
      passEncoder.setPipeline(toneMapper.pipeline);
      passEncoder.setBindGroup(0, toneMapper.bindGroup0);
      passEncoder.draw(3, 1, 0, 0);
      passEncoder.end();
    }
    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
    
    uniforms.accumulatedFrames++;
    frameCount++;
    lastTime = time;
  }
  
  requestAnimationFrame(frame);
};


// function HTMLGui(uniforms: any) {
//   document.getElementById('hFov')!.addEventListener('input', (e) => {
//     uniforms.hFov = +(e.target as HTMLInputElement).value;
//     uniforms.accumulatedFrames = 0;
//     document.getElementById('fl')!.innerText = hFov2focalLength(uniforms.hFov, 36).toFixed(2);
//   });

//   document.getElementById('saveBtn')!.addEventListener('click', () => {
//     const link = document.createElement('a');
//     link.href = (document.getElementById('canvas') as HTMLCanvasElement).toDataURL('image/png');
//     link.download = 'vivid_renderer_image.png';  // 저장할 파일명
//     link.click();
//   });

//   return () => {
//     (document.getElementById('hFov') as HTMLInputElement).value = uniforms.hFov.toString();
//     document.getElementById('fl')!.innerText = hFov2focalLength(uniforms.hFov, 36).toFixed(2);
//   };
// }


document.addEventListener('DOMContentLoaded', async () => {
  try {
    await main(document.getElementById('canvas') as HTMLCanvasElement);
  } catch (e) {
    alert(e)
  }
});
