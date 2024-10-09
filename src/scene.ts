import { Mat4, Vec3, Vec4, mat4, mat3, vec3 } from 'wgpu-matrix';
import { loadMeshFromFile } from './utils';


export interface GeometryUnit {
  label: string;
  vertices: Float32Array;
  normals: Float32Array;
  uvs?: Float32Array;
  indices?: Uint32Array;
  aabb?: [[number, number, number], [number, number, number]];
}



export interface MaterialUnit {
  emittance?: [number, number, number];
  type?: 'Lambertian' | 'GGX' | 'Plastic' | 'Blend' | 'Disney';
  baseColor?: [number, number, number];
  roughness?: number;
  specular?: number;
  metallic?: number;
  subsurface?: number;
  specularTint?: number;
  sheen?: number;
  sheenTint?: number;
  clearcoat?: number;
  clearcoatGloss?: number;
  diffuseFresnel?: boolean;
  specularFresnel?: boolean;
}

export const baseColorMap = new Map<MaterialUnit, [ImageBitmap, boolean]>();
export const roughnessMap = new Map<MaterialUnit, [ImageBitmap, boolean]>();
export const specularMap = new Map<MaterialUnit, [ImageBitmap, boolean]>();
export const metallicMap = new Map<MaterialUnit, [ImageBitmap, boolean]>();
export const subsurfaceMap = new Map<MaterialUnit, [ImageBitmap, boolean]>();
export const specularTintMap = new Map<MaterialUnit, [ImageBitmap, boolean]>();
export const sheenMap = new Map<MaterialUnit, [ImageBitmap, boolean]>();
export const sheenTintMap = new Map<MaterialUnit, [ImageBitmap, boolean]>();
export const clearcoatMap = new Map<MaterialUnit, [ImageBitmap, boolean]>();
export const clearcoatGlossMap = new Map<MaterialUnit, [ImageBitmap, boolean]>();
export const MaterialMaps = {
  baseColorMap,
  roughnessMap,
  specularMap,
  metallicMap,
  subsurfaceMap,
  specularTintMap,
  sheenMap,
  sheenTintMap,
  clearcoatMap,
  clearcoatGlossMap
};


export class MeshPart {
  constructor(
    private geometry: GeometryUnit,
    private material: MaterialUnit
  ) {}
  getGeometry(): GeometryUnit {
    return this.geometry;
  }

  setMaterial(material: MaterialUnit) {
    this.material = material;
    return this;
  }

  getMaterial(): MaterialUnit {
    return this.material;
  }

  cloneMaterial(): MaterialUnit {
    this.material = { ...this.material };
    // this.material = Object.assign(new MaterialUnit(), this.material);
    return this.material;
  }
}


export class Mesh {
  protected meshParts: MeshPart[] = [];
  private _aabb: [[number, number, number], [number, number, number]] = [[0,0,0], [0,0,0]];
  
  get aabb(): [[number, number, number], [number, number, number]] {
    return this._aabb;
  }

  computeAABB() {
    let min: [number, number, number] = [Infinity, Infinity, Infinity];
    let max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    this.meshParts_forEach((part) => {
      const aabb = part.getGeometry().aabb;
      if (aabb) {
        min = vec3.min(min, aabb[0]);
        max = vec3.max(max, aabb[1]);
      }
    });
    this._aabb = [min, max];
  }

  async fromPath(path: string): Promise<Mesh> {
    return loadMeshFromFile(path).then((ret) => {
      this.meshParts = ret;
      this.computeAABB();
      return this;
    });
  }

  async fromBlob(name: string, data: ArrayBuffer | string): Promise<Mesh> {
    return loadMeshFromFile(name, data).then((ret) => {
      this.meshParts = ret;
      this.computeAABB();
      return this;
    });
  }

  getPart(index: number): MeshPart {
    return this.meshParts[index];
  }

  getMaterial(partIndex: number=0): MaterialUnit {
    return this.meshParts[partIndex].getMaterial();
  }

  numParts(): number {
    return this.meshParts.length;
  }

  meshParts_forEach(callback: (part: MeshPart, index: number) => void): void {
    this.meshParts.forEach(callback);
  }

  meshParts_map<T>(callback: (part: MeshPart) => T): T[] {
    return this.meshParts.map(callback);
  }
}

export async function createMesh(filename: string, data?: ArrayBuffer | string): Promise<Mesh> {
  if (!data)
    return new Mesh().fromPath(filename);
  else 
    return new Mesh().fromBlob(filename, data);
}


class SceneMesh extends Mesh {
  private _transform: Float32Array = mat4.identity();  
  
  constructor(mesh: Mesh | SceneMesh, cloneMaterial: boolean = false) {
    super();

    this.meshParts = mesh.meshParts_map(
      (part) => new MeshPart(part.getGeometry(), part.getMaterial()));

    if (cloneMaterial) {
      const materials = new Set<MaterialUnit>();
      this.meshParts_forEach((part) => {
        materials.add(part.getMaterial());
      });

      for (const material of materials) {
        const newMaterial = { ...material };
        // const newMaterial = Object.assign(new MaterialUnit(), material);
        this.meshParts_forEach((part) => {
          if (part.getMaterial() === material) {
            part.setMaterial(newMaterial);
          }
        });
      }
    }

    if (mesh instanceof SceneMesh) 
      this._transform = mesh._transform;
  }

  get transform(): Mat4 {
    return new Float32Array(this._transform);
  }

  set transform(value: Mat4) {
    this._transform = value;
  }

  setTransform(value: Mat4) {
    this._transform = value;
    return this;
  }
}


export class Scene {
  protected meshes: Map<string, SceneMesh> = new Map();

  addMesh(
    id_name: string, 
    mesh: Mesh | SceneMesh, 
    transform: Mat4 | undefined = undefined,
    cloneMaterial: boolean = false
  ): SceneMesh {
    const sceneMesh = new SceneMesh(mesh, cloneMaterial);

    if (transform)
      sceneMesh.transform = transform;
    else if (!(mesh instanceof SceneMesh))
      sceneMesh.transform = mat4.identity();
    
    while (this.meshes.has(id_name)) {
      id_name += '@';
    }
    this.meshes.set(id_name, sceneMesh);
    // this.dirty = true;
    return sceneMesh;
  }

  removeMesh(id_name: string): boolean {
    return this.meshes.delete(id_name);
  }
  
  get numMeshParts(): number {
    let count = 0;
    this.meshes.forEach((mesh) => {
      count += mesh.numParts();
    });
    return count;
  }

  getMesh(name: string): SceneMesh | undefined {
    return this.meshes.get(name);  
  }

  getMeshes(): IterableIterator<SceneMesh> {
    return this.meshes.values();
  }
}




// const materialPool: Map<string, MaterialUnit> = new Map([
//   [
//     'default_material', 
//     {
//       diffuseColor: [0.8, 0.8, 0.8],
//       specularColor: 0.04,
//       roughness: 0.01,
//     }
//   ]
// ]);


// export function registerMaterial(name: string, material: MaterialUnit) {
//   if(name === '') {
//     name = 'material_name';
//   }
//   while(materialPool.has(name)) {
//     name += '@';
//   }
//   materialPool.set(name, material);
//   return name;
// } 


// export function findMaterial(name: string) {
//   return materialPool.get(name);
// } 

