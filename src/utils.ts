import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import { RGBE, RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { GeometryUnit, MaterialUnit, MeshPart, MaterialMaps } from './scene';


export async function resizeImageBitmap(bitmap: ImageBitmap, width: number, height:number)
: Promise<ImageBitmap> {
  const offscreenCanvas = new OffscreenCanvas(width, height);
  (offscreenCanvas.getContext('2d') as unknown as CanvasRenderingContext2D)
    .drawImage(bitmap, 0, 0, width, height);
  return await createImageBitmap(offscreenCanvas);
}


function computeAABB(vertices: Float32Array) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      min[j] = Math.min(min[j], vertices[i + j]);
      max[j] = Math.max(max[j], vertices[i + j]);
    }
  }
  return [min, max] as [[number, number, number], [number, number, number]];
}


export async function loadMeshFromFile(filename: string, data?: ArrayBuffer | string)
: Promise<MeshPart[]> {
  return new Promise((resolve, reject) => {
    let loader: GLTFLoader | OBJLoader;
    let rootAsScene: (root: any) => THREE.Group<THREE.Object3DEventMap>;

    if (filename.endsWith('.glb') || filename.endsWith('.gltf')) {
      loader = new GLTFLoader();
      {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        loader.setDRACOLoader(dracoLoader);      
      }
      rootAsScene = (root: any) => root.scene;
    } else if (filename.endsWith('.obj')) {
      loader = new OBJLoader();
      rootAsScene = (root: any) => root ;
    } else {
      throw 'Unsupported file format';
    }
  
    const onload = (root: any) => {
      const meshParts: MeshPart[] = [];
      const materials: Map<THREE.MeshStandardMaterial, MaterialUnit> = new Map();
      
      rootAsScene(root).traverse((node) => {
        if (node.type !== 'Mesh') return;

        const geo = (node as THREE.Mesh).geometry;
        if (!geo.attributes.normal)
          throw `Normal attribute is missing in ${filename}`;

        const geometry: GeometryUnit = {
          label: node.name,
          vertices: new Float32Array(geo.attributes.position.array),
          normals: new Float32Array(geo.attributes.normal.array),
          uvs: geo.attributes.uv ? new Float32Array(geo.attributes.uv.array) : undefined,
          indices: geo.index ? new Uint32Array(geo.index.array) : undefined,
        };
        geometry.aabb = computeAABB(geometry.vertices);

        const threeMaterial = ((node as THREE.Mesh).material as THREE.MeshStandardMaterial);
        let material: MaterialUnit = {} as MaterialUnit;

        if (materials.has(threeMaterial)) {
          material = materials.get(threeMaterial)!;
        } else {
          material = {
            type: 'Disney',
            baseColor: [Math.random(), Math.random(), Math.random()],
            roughness: 0.5,
            specular: 0.5,
            metallic: 0.0,
            subsurface: 0.0,
            specularTint: 0.0,
            sheen: 0.0,
            sheenTint: 0.5,
            clearcoat: 0.0,
            clearcoatGloss: 1.0,
            diffuseFresnel: true,
            specularFresnel: true,
          };
          materials.set(threeMaterial, material);

          const { baseColorMap } = MaterialMaps;
          if(threeMaterial.map)
            baseColorMap.set(material, [threeMaterial.map.image, true]);
        }
        
        meshParts.push(new MeshPart(geometry, material));
      });

      resolve(meshParts);
    };

    if (data) {
      if(loader instanceof GLTFLoader) {
        loader.parse(
          data,
          '',
          onload,
          (error) => reject(error)
        );
      } else {
        onload(loader.parse(data as string));
      }
    } else {
      loader.load(
        filename,
        onload,
        undefined,
        (error) => reject(error)
      );
    }

  });
}


export async function loadHDRToFloat32Array(file: string | File): Promise<RGBE> {
  if (typeof file === 'string') 
    return new Promise((resolve, reject) => {
      const loader = new RGBELoader();
      loader.load(
        file, 
        (hdrTexture, rgbe: any) => resolve(rgbe as RGBE), 
        undefined, 
        (error) => reject(error)
      );

    });

  else
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target!.result as ArrayBuffer;
        const loader = new RGBELoader();
        if (file.name.endsWith('.hdr')) 
          resolve(loader.parse(buffer));
        else
          reject('unsupported HDR format');
      };

      reader.readAsArrayBuffer(file);
    });
}


export {RGBE}


export function createDragAndDropHander(dropArea: HTMLElement) 
{
  let input: FileList | undefined;

  dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
  });

  dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    input = e.dataTransfer!.files;
  });

  return () => {
    let out = input;
    input = undefined;
    return out;
  }
}