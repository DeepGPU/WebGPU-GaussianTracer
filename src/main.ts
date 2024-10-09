import '../webrtx/src/patch';
import { Mat4, Vec3, Vec4, mat4, mat3, vec3 } from 'wgpu-matrix';
import { ArcballCamera, WASDCamera } from './camera';
import { createInputHandler } from './input'; 
import { RayTracingScene } from './rtscene'; 
import { createMesh, MaterialUnit, Mesh } from './scene';
import { PathTracer } from './pathTracer';
import { ToneMapper } from './toneMapper';
import { createDragAndDropHander } from './utils';
import * as dat from 'dat.gui';
import * as sceneParser from './scene_samples';
import {loadGaussianSplatting  } from './GS_ply';


var degree = 3.14159265358979323846 / 180.0;
function hFov2focalLength(hFov: number, sensorW: number) {
  return (sensorW/2) / Math.tan(hFov*degree/2);
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

  const gsData = await loadGaussianSplatting('../data/mesh/pc_short.ply');

  const scene = new RayTracingScene(device);

  const pathTracer = await (new PathTracer(device, canvas.width, canvas.height)).wait();
  pathTracer.prepare_scene(scene);

  const toneMapper = new ToneMapper(device, pathTracer.outBuffer, pathTracer.width, pathTracer.height, canvasFormat);

  const inputHandler = createInputHandler(window, canvas);
  

  const updateGUI = () => {
    (document.getElementById('hFov') as HTMLInputElement).value = pathTracer.hFov.toString();
    document.getElementById('fl')!.innerText = hFov2focalLength(pathTracer.hFov, 36).toFixed(2);
    (document.getElementById('lensRadius') as HTMLInputElement).value = pathTracer.lensRadius.toString();
    (document.getElementById('focusDistance') as HTMLInputElement).value = pathTracer.focusDistance.toString();
    document.getElementById('focusDistanceV')!.innerText = pathTracer.focusDistance.toFixed(2);
  };

  document.getElementById('hFov')!.addEventListener('input', (e) => {
    pathTracer.hFov = +(e.target as HTMLInputElement).value;
    accumulatedFrames = 0;
    document.getElementById('fl')!.innerText = hFov2focalLength(pathTracer.hFov, 36).toFixed(2);
  });

  document.getElementById('lensRadius')!.addEventListener('input', (e) => {
    pathTracer.lensRadius = +(e.target as HTMLInputElement).value;
    accumulatedFrames = 0;
  });

  document.getElementById('focusDistance')!.addEventListener('input', (e) => {
    pathTracer.focusDistance = +(e.target as HTMLInputElement).value;
    accumulatedFrames = 0;
  });

  document.getElementById('saveBtn')!.addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'vivid_renderer_image.png';  // 저장할 파일명
    link.click();
  });

  // const [position, target] = [vec3.create(-2.0, 0.5, 0), vec3.create( 0, 0.5, 0)];
  const [position, target] = [vec3.create(0, 0.8, 2.5), vec3.create(0, 0.5, 0)];
  const camera = new WASDCamera({position, target});

  pathTracer.hFov = 60.0;
  // pathTracer.lensRadius = 0.02;
  pathTracer.focusDistance = vec3.distance(position, target);
  updateGUI();
  
  const maxElapsedTime = 1.0;
  let elapsedTime = 0.0;
  let lastTime = 0;
  let frameCount = 0;
  let accumulatedFrames = 0;
  let maxAccumulatedFrames = 0;

  const is3DFileDragged = createDragAndDropHander(document.body);

  function frame(time: number) {
    const deltaTime = (time - lastTime) / 1000;
    elapsedTime += deltaTime;
    if(maxElapsedTime <= elapsedTime) {
      document.getElementById('fpsDisplay')!.innerText = `FPS: ${(frameCount/elapsedTime).toFixed(2)}`;
      elapsedTime = 0;
      frameCount = 0;
    }

    const files = is3DFileDragged();
    if (files) {
    }

    const input = inputHandler();
    if(input.digital.forward || input.digital.backward || 
       input.digital.left || input.digital.right || 
       input.digital.up || input.digital.down ||
       input.analog.x || input.analog.y || input.analog.zoom) {
        accumulatedFrames = 0;
    }

    if(0 < maxAccumulatedFrames && maxAccumulatedFrames <= accumulatedFrames) {
      requestAnimationFrame(frame);
      return;
    }

    camera.update(deltaTime, input);
    pathTracer.cameraPose = camera.matrix;
    pathTracer.updateUniforms();

    const commandEncoder = device.createCommandEncoder();
    const canvasView = context!.getCurrentTexture().createView();

    // ray tracing pass
    {
      const passEncoder = commandEncoder.beginRayTracingPass();
      passEncoder.setPipeline(pathTracer.pipeline);
      passEncoder.setBindGroup(0, pathTracer.bindGroup0);
      passEncoder.traceRays(
        device,
        pathTracer.sbt,
        pathTracer.width,
        pathTracer.height,
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
          view: canvasView,
        }]
      });
      passEncoder.setPipeline(toneMapper.pipeline);
      passEncoder.setBindGroup(0, toneMapper.bindGroup0);
      passEncoder.draw(3, 1, 0, 0);
      passEncoder.end();
    }
    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
    
    accumulatedFrames++;
    frameCount++;
    lastTime = time;
  }
  
  requestAnimationFrame(frame);
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await main(document.getElementById('canvas') as HTMLCanvasElement);
  } catch (e) {
    alert(e)
  }
});
