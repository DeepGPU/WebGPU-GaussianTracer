import { Scene, MaterialUnit, MaterialMaps } from './scene';
import { resizeImageBitmap } from './utils';


interface TextureGroup {
  width?: number;
  height?: number;
  format?: GPUTextureFormat;
  textureArray?: GPUTexture;
}


export class MaterialCollection {
  private uniqueMaterialArray: MaterialUnit[] = [];
  private _materialBuffer?: GPUBuffer;
  private textureGroup0: TextureGroup = {format: 'rgba8unorm-srgb'};
  private _isReady = false;
  private byteSizeGPU = 96;

  constructor(
    private device: GPUDevice,
    scene: Scene | undefined = undefined
  ) {
    if(scene) this.collectFrom(scene);
  }

  get buffer(): GPUBuffer {
    if (!this._materialBuffer) {
      throw new Error('materialBuffer is not ready');
    }
    return this._materialBuffer!;
  }

  get textureArray0(): GPUTexture {
    if (!this.textureGroup0.textureArray) {
      throw new Error('textureArray is not ready');
    }
    return this.textureGroup0.textureArray!;
  }

  get isReady() {
    return this._isReady;
  }

  indexOf(material: MaterialUnit): number {
    return this.uniqueMaterialArray.indexOf(material);
  }

  collectFrom(scene: Scene) {
    this._isReady = false;
    this.uniqueMaterialArray = [];
    for (const mesh of scene.getMeshes()) {
      mesh.meshParts_forEach((part) => {
        const mat = part.getMaterial();
        if(this.uniqueMaterialArray.indexOf(mat) === -1) 
          this.uniqueMaterialArray.push(mat);
      });
    };
  }

  loadOnGpu() {
    this._materialBuffer = this.device.createBuffer({
      label: 'materialBuffer',
      size: this.uniqueMaterialArray.length * this.byteSizeGPU,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    const srcImages: ImageBitmap[] = [];

    const materialData = this._materialBuffer.getMappedRange();
    {
      const type2uint = new Map<string, number>([
        ['Lambertian', 0],
        ['GGX', 1],
        ['Plastic', 2],
        ['Blend', 3],
        ['Disney', 4],
      ]);
      const { baseColorMap } = MaterialMaps;

      this.uniqueMaterialArray.forEach((material, materialIndex) => {
        const fv = new Float32Array(materialData, materialIndex * this.byteSizeGPU, 16);
        const uv = new Int32Array(materialData, materialIndex * this.byteSizeGPU, 16);
        //  0~12 : emmitance(vec3)
        // 12~16 : materialType(uint)
        // 16~28 : baseColor(vec3)
        // 28~32 : roughness(float)
        // 32~36 : specular(float)
        // 36~40 : metallic(float)
        // 40~44 : subsurface(float)
        // 44~48 : specularTint(float)
        // 48~52 : sheen(float)
        // 52~56 : sheenTint(float)
        // 56~60 : clearcoat(float)
        // 60~64 : clearcoatGloss(float)
        fv.set(material.emittance ?? [0, 0, 0]);
        let type = type2uint.get(material?.type || 'Disney')!;
        type |= material.diffuseFresnel !== false ? 0x100 : 0;
        type |= material.specularFresnel !== false ? 0x200 : 0;
        uv[3] = type;

        let index = -1;
        const baseColorImage = baseColorMap.get(material);
        if (baseColorImage) {
          index = srcImages.indexOf(baseColorImage[0]);
          if (index === -1) {
            if(baseColorImage[0].width === baseColorImage[0].height) {
              srcImages.push(baseColorImage[0]);
              if(baseColorImage[1])
                index = srcImages.length - 1;
            }
            else
              console.log(`baseColor image must be square. But, ${baseColorImage[0].width}x${baseColorImage[0].height}.`);
          } 
        }

        if (index !== -1) {
          uv[4] = -(index + 1);
          uv[5] = -(index + 1);
          uv[6] = -(index + 1);
        } else {
          fv.set(material.baseColor ?? [1, 1, 1], 4);
        }

        fv[7] = material.roughness ?? 0.5;
        fv[8] = material.specular ?? 0.5;
        fv[9] = material.metallic ?? 0.0;
        fv[10] = material.subsurface ?? 0.0;
        fv[11] = material.specularTint ?? 0.0;
        fv[12] = material.sheen ?? 0.0;
        fv[13] = material.sheenTint ?? 0.5;
        fv[14] = material.clearcoat ?? 0.0;
        fv[15] = material.clearcoatGloss ?? 1.0;
      });
    }
    this._materialBuffer.unmap();

    const size = srcImages.reduce((max, img) => Math.max(max, img.width), 0);
    this.textureGroup0.width = size;
    this.textureGroup0.height = size;
    this.textureGroup0.textureArray = this.device.createTexture({
      size: srcImages.length > 0 ? [size, size, srcImages.length] : [1, 1, 1],
      format: this.textureGroup0.format!,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        | GPUTextureUsage.RENDER_ATTACHMENT, // why??
    });

    {
      for(let i = 0; i < srcImages.length; i++) {
        resizeImageBitmap(srcImages[i], size, size).then((new_image) => {
          this.device.queue.copyExternalImageToTexture(
            {source: new_image},
            {texture: this.textureGroup0.textureArray!, origin: [0, 0, i]},
            [size, size, 1]);
        });
      }
      this.device.queue.onSubmittedWorkDone().then(() => { this._isReady = true; });
    }
  }

  private propertyOffset = new Map<string, number>([
    ['emittance', 0],
    ['materialType', 12],
    ['baseColor', 16],
    ['roughness', 28],
    ['specular', 32],
    ['metallic', 36],
    ['subsurface', 40],
    ['specularTint', 44],
    ['sheen', 48],
    ['sheenTint', 52],
    ['clearcoat', 56],
    ['clearcoatGloss', 60],
  ]);

  updateProperty(meterial: MaterialUnit, property: string, newValue: number | number[], uint = false) {
    const index = this.indexOf(meterial);
    const offset = this.propertyOffset.get(property);
    if(index !== -1 && offset) 
      this.device.queue.writeBuffer(
        this.buffer, 
        index * this.byteSizeGPU + offset, 
        uint ? new Uint32Array(Array.isArray(newValue) ? newValue : [newValue]) :
               new Float32Array(Array.isArray(newValue) ? newValue : [newValue]));
  }
};