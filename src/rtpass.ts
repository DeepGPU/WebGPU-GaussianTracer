////////////////////////////////////////////
//    Ray Tracing Pass (RTPASS) module    // 
////////////////////////////////////////////
import { _GPUShaderStageRTX } from "../webrtx/src/types";
import { RayTracingScene } from './rtscene'; 
import { MaterialCollection } from "./materialCollection";
import { MeshPart, GeometryUnit } from './scene';


interface ShaderUnit {
  code: string;
  entryPoint?: string;
}

interface ShaderInputLayout {
  rayGen: ShaderUnit;
  misses: ShaderUnit[];
  hitGroups: {
    closestHit?: ShaderUnit;
    anyHit?: ShaderUnit;
  }[];
}


export class RayTracingPass {
  private _rtPipeline?: GPURayTracingPipeline | Promise<GPURayTracingPipeline>;
  // private _sbt?: GPUShaderBindingTable;
  private _sbt = new ShaderBindingTable();
  private _outBuffer?: GPUBuffer;
  private _numMisses = 0;
  private _numHitGroups = 0;
  constructor(protected device: GPUDevice) {}

  get pipeline(): GPURayTracingPipeline {
    if (!this._rtPipeline || this._rtPipeline instanceof Promise) {
      throw 'pipeline is not built yet'
    }
    return this._rtPipeline;
  }

  get sbt() {
    return this._sbt.sbt;
  }

  get outBuffer() {
    if (!this._outBuffer) {
      throw 'outBuffer is not created yet'
    }
    return this._outBuffer;
  }

  get numMisses() {
    return this._numMisses;
  }

  get numHitGroups() {
    return this._numHitGroups;
  }

  resize_outBuffer(byteSize: number) {
    this._outBuffer = this.device.createBuffer({
      label: 'pathTracer_outBuffer',
      size: byteSize,
      usage: GPUBufferUsage.STORAGE,
    });
  }

  build_pipeline(shaderLayout: ShaderInputLayout, vertexStrideInBytes: number) {

    const {rayGen, misses, hitGroups} = shaderLayout;
    const shaderMap = new Map<ShaderUnit, [number, _GPUShaderStageRTX]>();

    let stageIndex = 0;
    shaderMap.set(rayGen, [stageIndex++, GPUShaderStageRTX.RAY_GENERATION]);

    misses.forEach((miss) => {
      shaderMap.set(miss, [stageIndex++, GPUShaderStageRTX.RAY_MISS]);
    });

    for (const hitGroup of hitGroups) {
      if (hitGroup.closestHit) {
        if(!shaderMap.has(hitGroup.closestHit)) {
          shaderMap.set(hitGroup.closestHit, [stageIndex++, GPUShaderStageRTX.RAY_CLOSEST_HIT]);
        }
      }
      if (hitGroup.anyHit) {
        if(!shaderMap.has(hitGroup.anyHit)) {
          shaderMap.set(hitGroup.anyHit, [stageIndex++, GPUShaderStageRTX.RAY_ANY_HIT]);
        }
      }
    }
    
    const stages: GPURayTracingShaderStageDescriptor[] = [];
    shaderMap.forEach(([_, stage], shader) => {
      stages.push({
        stage,
        entryPoint: shader.entryPoint || 'main',
        glslCode: shader.code,
      });
    });

    const groups: GPURayTracingShaderGroupDescriptor[] = [];
    shaderMap.forEach(([stageIndex, stage]) => {
      if (stage === GPUShaderStageRTX.RAY_GENERATION || stage === GPUShaderStageRTX.RAY_MISS) {
        groups.push({
          type: 'general',
          generalIndex: stageIndex,
        });
      } else {
        groups.push({
          type: 'triangles-hit-group',
          closestHitIndex: stageIndex,
        });
      }
    });

    this._numMisses = misses.length;
    this._numHitGroups = hitGroups.length
    this._rtPipeline = this.device.createRayTracingPipeline({stages, groups}, vertexStrideInBytes);
  }

  async wait() {
    if (this._rtPipeline instanceof Promise) 
      this._rtPipeline = await this._rtPipeline;
    return this;
  }

  build_sbt(scene: RayTracingScene, materials: MaterialCollection) {
    this._sbt.create(this.device, this, scene, materials);
  }
}


enum SBT_RECORD_INDEX {
  SHADER_HANDLE = 0,
  VERTEX = 1,
  INDEX = 2,
  MATERIAL = 3,
  SIZE = 4,     // must be <= 8
}

class ShaderBindingTable {
  private _sbt?: GPUShaderBindingTable;

  get sbt() {
    if (!this._sbt) {
      throw 'sbt is not created yet'
    }
    return this._sbt;
  }

  create(
    device: GPUDevice, 
    rtPass: RayTracingPass, 
    scene: RayTracingScene,
    materials: MaterialCollection) {
    
    const alignTo = (x: number, align: number) => Math.floor((x + align - 1) / align) * align;
    
    let recordStride = SBT_RECORD_INDEX.SIZE * 4;
    recordStride = alignTo(recordStride, device.ShaderGroupHandleAlignment); // alignTo 32
    let start = 0;

    const rayGen: BufferRegion = {
      start,
      stride: recordStride,
      size: recordStride,
    };
    start += alignTo(rayGen.start + rayGen.size, device.ShaderGroupBaseAlignment);

    const rayMiss: BufferRegion = {
      start,
      stride: recordStride,
      size: recordStride * rtPass.numMisses,
    };
    start += alignTo(rayMiss.start + rayMiss.size, device.ShaderGroupBaseAlignment);

    const rayHit: BufferRegion = {
      start,
      stride: recordStride,
      size: recordStride * scene.numMeshParts,
    };
    start += alignTo(rayHit.start + rayHit.size, device.ShaderGroupBaseAlignment);

    const buffer = device.createBuffer({
      label: 'SBT_Buffer',
      size: start,
      usage: GPUBufferUsageRTX.SHADER_BINDING_TABLE,
      mappedAtCreation: true,
    });
    {
      const handles = rtPass.pipeline.getShaderGroupHandles(0, 1 + rtPass.numMisses + rtPass.numHitGroups);
      const sbtData = new Uint32Array(buffer.getMappedRange());
    
      sbtData[rayGen.start / 4] = handles[0];

      for (let i = 0; i < rtPass.numMisses; i++) {
        sbtData[(rayMiss.start + i * recordStride) / 4] = handles[1 + i];
      }

      let recordOffset = rayHit.start / 4;
      for (const mesh of scene.getMeshes()) {
        mesh.meshParts_forEach((part) => {
          const {vertexOffset, indexOffset} = scene!.getGeometryOffset(part)!;
          const materialIndex = materials.indexOf(part.getMaterial());
          if (materialIndex < 0) 
            throw 'Material not found';

          sbtData[recordOffset + SBT_RECORD_INDEX.SHADER_HANDLE] = handles[1 + rtPass.numMisses /*+ part.hitGroupId*/];
          sbtData[recordOffset + SBT_RECORD_INDEX.VERTEX] = vertexOffset;
          sbtData[recordOffset + SBT_RECORD_INDEX.INDEX] = indexOffset;
          sbtData[recordOffset + SBT_RECORD_INDEX.MATERIAL] = materialIndex;

          recordOffset += recordStride / 4;
        });
      }
    }
    buffer.unmap();

    this._sbt = { buffer, rayGen, rayMiss, rayHit, callable:{} } as GPUShaderBindingTable;
  }
}