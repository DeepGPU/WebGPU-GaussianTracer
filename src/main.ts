import '../webrtx/src/patch';
import { Mat4, Vec3, Vec4, mat4, mat3, vec3 } from 'wgpu-matrix';
import { ArcballCamera, WASDCamera } from './camera';
import { createInputHandler } from './input'; 
import { RayTracingScene } from './rtscene'; 
import { createMesh, MaterialUnit, Mesh } from './scene';
import { PathTracer } from './pathTracer';
import { createEnvmap } from './envmap';
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

  let envmap = await createEnvmap('hansaplatz_4k.hdr', device);
  const scene = new RayTracingScene(device);
  const rect = await createMesh('rectangle.obj');
  scene.addMesh('ForNonEmptyScene', rect, mat4.uniformScaling<Mat4>(0.000001));
  {
    // await sceneParser.scene_gs(scene);

    // const groundMat = scene.addMesh(
    //   'ground', 
    //   await createMesh('../data/mesh/rectangle.obj'),
    //   mat4.mul<Mat4>(mat4.translation([0,0.000,0]),
    //     mat4.mul(mat4.rotationX(-90 * degree), mat4.uniformScaling(100)))
    // ).getMaterial();
    // groundMat.baseColor = [0.5, 0.3, 0.3];
    // groundMat.roughness = 0.001;
    // groundMat.specular = 10.0;

    // const groundMat = scene.addMesh(
    //   'ground', 
    //   await createMesh('../data/mesh/ground_11.glb'),
    //   mat4.mul<Mat4>(mat4.translation([0.0, -0.42, 0.0]),
    //     mat4.mul(mat4.rotationX(-90 * degree), mat4.uniformScaling(1)))
    // ).getMaterial();

    // const tableMesh = await createMesh('table_wood.glb');
    // const tableM = scene.addMesh(
    //   'table', 
    //   tableMesh,
    //   // mat4.mul<Mat4>(mat4.translation([0, -1.5*tableMesh.aabb[1][1] - 0.148, 0]), mat4.uniformScaling(1.5))
    //   mat4.mul<Mat4>(mat4.translation([0, -3*tableMesh.aabb[1][1], 0]), mat4.uniformScaling(3))
    // ).getMaterial();

    // const m1 = scene.addMesh(
    //   'shoes', 
    //   await createMesh('../data/mesh/shoes_Timberland.glb'),
    //   mat4.mul<Mat4>(mat4.translation([-0.15 + 1.15,0,0]), mat4.uniformScaling(3)) 
    // );

    // const gandiMesh = await createMesh('../data/mesh/gandi.glb');
    // scene.addMesh(
    //   'gandi', 
    //   gandiMesh,
    //   mat4.mul<Mat4>(mat4.translation([0,0,0]), mat4.uniformScaling(0.05)),
    //   true
    // ).getMaterial().baseColor = [0.8, 0.2, 0.1];
    // gandiMat.diffuseColor = [0.8, 0.8, 0.8];
    // gandiMat.specular = 0.1;
    // gandiMat.roughness = 0.05;

    // const emit2 = scene.addMesh(
    //   'rect2', 
    //   rect,
    //   mat4.mul<Mat4>(mat4.translation([-0.8,0.8,1.4]),
    //     mat4.mul(mat4.rotationX(180 * degree), mat4.uniformScaling(0.8)))
    // ).getPart(0).cloneMaterial();
    // emit2.emittance = [0,0,50];
    // emit2.diffuseColor = [0.0, 0.0, 0.0];
    // emit2.specular = 0.0; 
  }

  const pathTracer = await (new PathTracer(device, canvas.width, canvas.height)).wait();
  pathTracer.prepare_scene(scene);
  pathTracer.setEnvmap(envmap);

  const toneMapper = new ToneMapper(device, pathTracer.outBuffer, pathTracer.width, pathTracer.height, canvasFormat);

  const inputHandler = createInputHandler(window, canvas);
  const gui = new dat.GUI();
  
  const addGuiForColorProperty = (group: dat.GUI, material: MaterialUnit, name: keyof MaterialUnit) => {
    group.addColor({[name]: (material[name] as number[])?.map(c=>c*255)}, name)
      .onChange((newValue: number[]) => {
        (material[name] as number[]) = newValue.map(c=>c/255);
        pathTracer.materials.updateProperty(material, name, material[name] as number[]);
        accumulatedFrames = 0;
      });
  }

  const addGuiForProperty = (group: dat.GUI, material: MaterialUnit, name: keyof MaterialUnit, min: number=0.0, max: number=1.0, step: number = 0.01) => {
    group.add(material, name, min, max)
      .step(step)
      .onChange((newValue: number) => {
        pathTracer.materials.updateProperty(material, name, newValue);
        accumulatedFrames = 0;
      }).listen();
  }

  const addCheckerForProperty = (group: dat.GUI, material: MaterialUnit, name: keyof MaterialUnit, flag: number) => {
    group.add(material, name)
      .onChange((newValue: boolean) => {
        let type = 4;  // Disney material
        type |= material.diffuseFresnel !== false ? 0x100 : 0;
        type |= material.specularFresnel !== false ? 0x200 : 0;
        pathTracer.materials.updateProperty(material, 'materialType', type, true);
        accumulatedFrames = 0;
        console.log(`Material type: ${type}`);
      });
  }

  const updateGUI = () => {
    (document.getElementById('pathSamplingMethod') as HTMLSelectElement).value = pathTracer.pathSamplingMethod.toString();
    (document.getElementById('numSamplesPerFrame') as HTMLInputElement).value = pathTracer.numSamplesPerFrame.toString();
    (document.getElementById('maxPathBounce') as HTMLInputElement).value = (pathTracer.maxPathLength - 1).toString();
    (document.getElementById('hFov') as HTMLInputElement).value = pathTracer.hFov.toString();
    document.getElementById('fl')!.innerText = hFov2focalLength(pathTracer.hFov, 36).toFixed(2);
    (document.getElementById('lensRadius') as HTMLInputElement).value = pathTracer.lensRadius.toString();
    (document.getElementById('focusDistance') as HTMLInputElement).value = pathTracer.focusDistance.toString();
    document.getElementById('focusDistanceV')!.innerText = pathTracer.focusDistance.toFixed(2);
    (document.getElementById('drawBackground') as HTMLInputElement).checked = !!pathTracer.drawBackground;
    (document.getElementById('envmapRotAngle') as HTMLInputElement).value = pathTracer.envmapRotAngle.toString();
    document.getElementById('envmapRotAngleV')!.innerText = pathTracer.envmapRotAngle.toFixed(0);
  };

  document.getElementById('pathSamplingMethod')!.addEventListener('change', (e) => {
    pathTracer.pathSamplingMethod = +(e.target as HTMLSelectElement).value;
    accumulatedFrames = 0;
  });

  document.getElementById('numSamplesPerFrame')!.addEventListener('input', (e) => {
    pathTracer.numSamplesPerFrame = +(e.target as HTMLInputElement).value;
    accumulatedFrames = 0;
  });
  
  document.getElementById('maxPathBounce')!.addEventListener('input', (e) => {
    pathTracer.maxPathLength = +(e.target as HTMLInputElement).value + 1;
    accumulatedFrames = 0;
  });

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

  document.getElementById('drawBackground')!.addEventListener('change', (e) => {
    pathTracer.drawBackground = (e.target as HTMLInputElement).checked;
    accumulatedFrames = 0;
  });

  document.getElementById('envmapRotAngle')!.addEventListener('input', (e) => {
    pathTracer.envmapRotAngle = parseFloat((e.target as HTMLInputElement).value);
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

  pathTracer.numSamplesPerFrame = 16;
  pathTracer.maxPathBounce = 4;
  pathTracer.hFov = 60.0;
  // pathTracer.lensRadius = 0.02;
  pathTracer.focusDistance = vec3.distance(position, target);
  pathTracer.envmapRotAngle = 90.0;
  updateGUI();
  
  const maxElapsedTime = 1.0;
  let elapsedTime = 0.0;
  let lastTime = 0;
  let frameCount = 0;
  let accumulatedFrames = 0;
  let maxAccumulatedFrames = 0;

  const is3DFileDragged = createDragAndDropHander(document.body);
  const meshArr: [Mesh?, Mesh?, Mesh?] = [undefined, undefined, undefined];
  let meshIndex = 1;
  let loadedCount = 0;
  let loaded: [boolean, boolean, boolean] | undefined = undefined;

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

      if (files.length === 1 && files[0].name.endsWith('.hdr')) {
        createEnvmap(files[0], device).then((emap) => {
          envmap = emap;
          pathTracer.setEnvmap(envmap);
          accumulatedFrames = 0;
        });
      }

      else {
        loaded = [false, false, false];

        for (let i = 0; i < 3; i++) {
          if (files.length <= i) {
            loaded[i] = true;
            continue;
          }

          const file = files[i];
          const index = (meshIndex + i) % 3;

          const reader = new FileReader();

          reader.onload = async (event) => {
            let t0 = Date.now();
            meshArr[index] = await createMesh(file.name, event.target!.result!);
            console.log(`Mesh loading time: ${(Date.now()-t0)/1000}`);
            
            const [min, max] = meshArr[index]!.aabb;
            if (min[0] > max[0] || min[1] > max[1] || min[2] > max[2]) {
              throw 'Invalid AABB';
            }

            const size = vec3.sub(max, min);
            const toCenter = vec3.scale(vec3.add(min, max), -0.5);
            const scale = 0.9 / Math.max(size[0], size[1], size[2]);

            const normalizeMat = 
              mat4.mul(mat4.translation([0, scale * 0.5 * size[1], 0]),
                mat4.mul(mat4.uniformScaling(scale), mat4.translation(toCenter)));

            scene.removeMesh(`mesh${index}`);
            const mesh = scene.addMesh(
              `mesh${index}`, 
              meshArr[index]!,
              mat4.mul<Mat4>(mat4.translation([-1 + index, 0, 0]), normalizeMat)
            );

            const g = gui.__folders[`mesh${index}`];
            if(g) gui.removeFolder(g);
            const group = gui.addFolder(`mesh${index}`);
            group.open();

            const mat = mesh.getMaterial();
            addGuiForColorProperty(group, mat, 'baseColor');
            addGuiForProperty(group, mat, 'roughness');
            addGuiForProperty(group, mat, 'metallic');
            addGuiForProperty(group, mat, 'specular');
            addGuiForProperty(group, mat, 'subsurface');
            addGuiForProperty(group, mat, 'specularTint');
            addGuiForProperty(group, mat, 'sheen');
            addGuiForProperty(group, mat, 'sheenTint');
            addGuiForProperty(group, mat, 'clearcoat');
            addGuiForProperty(group, mat, 'clearcoatGloss');
            addCheckerForProperty(group, mat, 'diffuseFresnel', 0x100);
            addCheckerForProperty(group, mat, 'specularFresnel', 0x200);

            loaded![i] = true;
            loadedCount++;

            if(loaded![0] && loaded![1] && loaded![2]) {
              loaded = undefined;
              meshIndex = (meshIndex + loadedCount) % 3;
              loadedCount = 0;
              t0 = Date.now();
              pathTracer.prepare_scene(scene);
              console.log(`Scene building time: ${(Date.now()-t0)/1000}`);
              accumulatedFrames = 0;
            }
          };

          if (file.name.endsWith('.glb')) 
            reader.readAsArrayBuffer(file);
          else if (file.name.endsWith('.obj')) 
            reader.readAsText(file);
          else 
            alert('Unsupported file format');
        }
      }
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
    pathTracer.accumulatedFrames = accumulatedFrames;
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
