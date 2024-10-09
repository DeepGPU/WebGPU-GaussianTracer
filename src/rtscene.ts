import { Scene, MeshPart, GeometryUnit } from './scene';


class PackedGeometry {
  constructor(
    private _vertexOffset: number,
    private _vertexCount: number,
    private _indexOffset: number,
    private _indexCount: number
  ) {}
  get vertexOffset(): number { return this._vertexOffset; }
  get vertexCount(): number { return this._vertexCount; }
  get indexOffset(): number { return this._indexOffset; }
  get indexCount(): number { return this._indexCount; }
}


export class RayTracingScene extends  Scene {
  private geometries: Map<GeometryUnit, PackedGeometry> = new Map();
  private totalVertexCount = 0;
  private totalIndexCount = 0;
  private _vertexBuffer?: GPUBuffer;
  private _indexBuffer?: GPUBuffer;
  private _tlas?: GPURayTracingAccelerationContainer_top;

  constructor(private device: GPUDevice) {super();}

  get tlas(): GPURayTracingAccelerationContainer_top {
    if (!this._tlas) {
      throw new Error('tlas is not ready');
    }
    return this._tlas;
  }

  get vertexBuffer(): GPUBuffer {
    if (!this._vertexBuffer) {
      throw new Error('vertexBuffer is not ready');
    }
    return this._vertexBuffer!;
  }

  get indexBuffer(): GPUBuffer {
    if (!this._indexBuffer) {
      throw new Error('indexBuffer is not ready');
    }
    return this._indexBuffer!;
  }

  prepack_geometry() {
    this.geometries.clear();
    let vertexOffset = 0; 
    let indexOffset = 0;

    this.meshes.forEach((mesh) => {
      mesh.meshParts_forEach((part) => {
        const geo = part.getGeometry();

        if(!this.geometries.has(geo)) {
          const pack = new PackedGeometry(
            vertexOffset,
            geo.vertices.length / 3,
            geo.indices ? indexOffset : -1,
            geo.indices ? geo.indices.length : 0,
          );
          vertexOffset += geo.vertices.length / 3;
          indexOffset += geo.indices ? geo.indices.length : 0;

          this.geometries.set(geo, pack);
        }
      });
    });

    this.totalVertexCount = vertexOffset;
    this.totalIndexCount = indexOffset;
  }

  pack_geometries(pack_vertex: (g: GeometryUnit, i: number) => number[], packingSize: number) {
    this.prepack_geometry();
    
    const vStride = packingSize;
    const vertexData = new Float32Array(this.totalVertexCount * vStride);
    const indexData = new Uint32Array(this.totalIndexCount);

    this.geometries.forEach(({vertexOffset, vertexCount, indexOffset}, geometry) => {
      let trgOffset = vertexOffset * vStride;

      for(let vId = 0; vId < vertexCount; vId++) {
        /* Time check case 1 */
        // vertexData[trgOffset + 0] = geometry.vertices[vId*3 + 0];
        // vertexData[trgOffset + 1] = geometry.vertices[vId*3 + 1];
        // vertexData[trgOffset + 2] = geometry.vertices[vId*3 + 2];
        // vertexData[trgOffset + 3] = geometry.uvs ? geometry.uvs[vId*2 + 0] : 0.0;
        // vertexData[trgOffset + 4] = geometry.normals[vId*3 + 0];
        // vertexData[trgOffset + 5] = geometry.normals[vId*3 + 1];
        // vertexData[trgOffset + 6] = geometry.normals[vId*3 + 2];
        // vertexData[trgOffset + 7] = geometry.uvs ? geometry.uvs[vId*2 + 1] : 0.0;

        /* Time check case 2 */
        // vertexData.set(geometry.vertices.subarray(vId*3, vId*3 + 3), trgOffset + 0);
        // vertexData.set(geometry.normals.subarray(vId*3, vId*3 + 3), trgOffset + 4);
        // vertexData[trgOffset + 3] = geometry.uvs ? geometry.uvs[vId*2 + 0] : 0.0;
        // vertexData[trgOffset + 7] = geometry.uvs ? geometry.uvs[vId*2 + 1] : 0.0;

        /* Time check case 3 */
        const data = pack_vertex(geometry, vId);
        vertexData.set(data, trgOffset);  
        trgOffset += vStride;
      }

      if (geometry.indices) {
        indexData.set(geometry.indices!, indexOffset);
      }
    });

    this._vertexBuffer = this.device.createBuffer({
      label: 'vertexBuffer',
      size: vertexData.byteLength,
      usage: GPUBufferUsageRTX.ACCELERATION_STRUCTURE_BUILD_INPUT_READONLY,
      mappedAtCreation: true,
    });
    new Float32Array(this._vertexBuffer.getMappedRange()).set(vertexData);
    this._vertexBuffer.unmap();
  
    this._indexBuffer = this.device.createBuffer({
      label: 'indexBuffer',
      size: indexData.byteLength || 4,
      usage: GPUBufferUsageRTX.ACCELERATION_STRUCTURE_BUILD_INPUT_READONLY,
      mappedAtCreation: true,
    });
    new Uint32Array(this._indexBuffer.getMappedRange()).set(indexData);
    this._indexBuffer.unmap();
  }

  build_tlas(pack_vertex: (g: GeometryUnit, i: number) => number[], packingSize: number) {
    this.pack_geometries(pack_vertex, packingSize);

    const tlas_desc: GPURayTracingAccelerationContainerDescriptor_top = {
      level: 'top',
      usage: GPURayTracingAccelerationContainerUsage.NONE,
      instances: [],
      uniqueVertexBuffer: this.vertexBuffer,
      uniqueIndexBuffer: this.indexBuffer,
    };
  
    let geometryOffset = 0;
    const blasDesces = new MapFromArray<GeometryUnit, GPURayTracingAccelerationContainerDescriptor_bottom>();
  
    for (const mesh of this.getMeshes()) 
    {
      const instanceDesc: GPURayTracingAccelerationInstanceDescriptor = {
        usage: GPURayTracingAccelerationInstanceUsage.NONE,
        mask: 0xFF,
        instanceSBTRecordOffset: 0,
        transformMatrix: new Float32Array(12),
        blas: {} as any
      };
  
      const src = mesh.transform;
      const trg = instanceDesc.transformMatrix!;
      trg.subarray(0,  3).set(src.subarray( 0,  3));
      trg.subarray(3,  6).set(src.subarray( 4,  7));
      trg.subarray(6,  9).set(src.subarray( 8, 11));
      trg.subarray(9, 12).set(src.subarray(12, 15));
  
      // instanceDesc.instanceCustomIndex = geometryOffset;
      instanceDesc.instanceSBTRecordOffset = geometryOffset;
      geometryOffset += mesh.numParts();

      const key = mesh.meshParts_map(part => part.getGeometry());
      let blasDesc = blasDesces.get(key);
      if (!blasDesc) {
        blasDesc = {
          usage: GPURayTracingAccelerationContainerUsage.NONE,
          level: 'bottom',
          geometries: mesh.meshParts_map((part) => {
            const data = this.getGeometryOffset(part)!;
            return {
              usage: GPURayTracingAccelerationGeometryUsage.NONE,
              type: 'triangles',
              vertex: {
                buffer: this.vertexBuffer,
                offset: data.vertexOffset * packingSize * 4,
                size: data.vertexCount * packingSize * 4,
                format: 'float32x3',
                stride: packingSize * 4,
              },
              index: data.indexOffset === -1 ? undefined :{
                buffer: this.indexBuffer,
                offset: data.indexOffset * 4,
                size: data.indexCount * 4,
                format: 'uint32',
              },
            };
          }),
        };
        
        blasDesces.set(key, blasDesc);
      }

      instanceDesc.blas = blasDesc;
      
      tlas_desc.instances.push(instanceDesc);
    }
    
    this._tlas = this.device.createRayTracingAccelerationContainer(tlas_desc);
    this.device.hostBuildRayTracingAccelerationContainer(this._tlas);
  }

  getGeometryOffset(meshPart: MeshPart): PackedGeometry | undefined {
    return this.geometries.get(meshPart.getGeometry());
  }
}


class MapFromArray<T, U> {
  private map = new Map<T[], U>();

  _findKey(key: T[]): T[] | undefined {
    for (const k of this.map.keys()) {
      if (k.length === key.length) {
        let found = true;
        for (let i = 0; i < k.length; i++) {
          if (k[i] !== key[i]) {
            found = false;
            break;
          }
        }
        if (found) {
          return k;
        }
      }
    }

    return undefined;
  }

  set(key: T[], value: U) {
    const foundKey = this._findKey(key);
    if (foundKey) {
      this.map.set(foundKey, value);
    } else {
      this.map.set(key, value);
    }
  }

  get(key: T[]): U | undefined {
    const foundKey = this._findKey(key);
    if (foundKey) {
      return this.map.get(foundKey);
    }
    return undefined;
  }
};