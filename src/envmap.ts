import { DataUtils } from 'three';
import { loadHDRToFloat32Array, RGBE } from './utils'; 


export async function createEnvmap(file: string | File, device?: GPUDevice): Promise<Envmap> {
    return new Envmap().fromFile(file, device);
}

export class Envmap {
  private _width?: number;
  private _height?: number;
  
  private image?: ImageBitmap | RGBE;
  private promiseImage?: Promise<Envmap>;
  
  private texture?: GPUTexture;
  private _view?: GPUTextureView;
  private _cdfBuffer?: GPUBuffer;

  async fromFile(file: string | File, device?: GPUDevice): Promise<Envmap> {
    const catchImage = (img: ImageBitmap | RGBE): Envmap => {
      this.image = img;
      this._width = img.width;
      this._height = img.height;
      return this;
    };

    const filename = file instanceof File ? file.name : file;
    const ext = filename.split('.').pop();
    if (ext == 'hdr') 
      this.promiseImage = loadHDRToFloat32Array(file).then(catchImage);
    
    else if (ext == 'jpg' || ext == 'png') 
      if (file instanceof File)
        this.promiseImage = createImageBitmap(file).then(catchImage);
      else
        this.promiseImage = fetch(file)
          .then(response => response.blob())
          .then(blob => createImageBitmap(blob))
          .then(catchImage);
    else
      throw 'unsupported format';

    if(!device)
      return this.promiseImage;
    else
      return this.promiseImage.then((env) => env.upload(device));
  }

  async upload(device: GPUDevice) : Promise<Envmap> {
    if(!this.promiseImage) 
      throw 'Reading raw image data must be called first';

    const image = (await this.promiseImage).image!;
    const {width, height} = image;
    this.image = undefined;
    this.promiseImage = undefined;

    const imgData = new Float32Array(width*height);
    {
      if (image instanceof ImageBitmap) {
        const offscreen = new OffscreenCanvas(width, height);
        const ctx  = offscreen.getContext('2d') as unknown as CanvasRenderingContext2D;
        ctx.drawImage(image, 0, 0);
        const srgb = ctx.getImageData(0, 0, width, height).data;

        const srgbToLinear = (v: number) => {
          v /= 255.0;
          v = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          return v;
        };
        
        for (let i = 0; i < imgData.length; i++) {
          imgData[i] = 0.212671 * srgbToLinear(srgb[i*4 + 0]) 
                      + 0.715160 * srgbToLinear(srgb[i*4 + 1])
                      + 0.072169 * srgbToLinear(srgb[i*4 + 2]);
        }
      } else {
        const f16Rgba = image.data;
        for (let i = 0; i < imgData.length; i++) {
          imgData[i] = 0.212671 * DataUtils.fromHalfFloat(f16Rgba[i*4 + 0])
                    + 0.715160 * DataUtils.fromHalfFloat(f16Rgba[i*4 + 1])
                    + 0.072169 * DataUtils.fromHalfFloat(f16Rgba[i*4 + 2]);
        }
      }
    }

    const maginalOffset = width * height;
    const cdfData = new Float32Array(maginalOffset + height);
    {
      let offset = 0;
      for (let i = 0; i < height; i++) {
        const sinTheta = Math.sin((i + 0.5) / height * Math.PI);

        for (let j = 0; j < width; j++) {
          cdfData[offset] = sinTheta * imgData[offset] + (j>0? cdfData[offset - 1] : 0.0);
          offset++;
        }

        const sum = cdfData[offset - 1];
        if(sum > 0.0) {
          offset -= width;
          for(let j = 0; j < width; j++) {
            cdfData[offset] /= sum;
            offset++;
          }
        }

        cdfData[maginalOffset + i] = sum;
      }

      for (let i = 1; i < height; i++) {
        cdfData[maginalOffset + i] += cdfData[maginalOffset + i - 1];
      }
      const sum = cdfData[maginalOffset + height - 1];
      for (let i = 0; i < height; i++) {
        cdfData[maginalOffset + i] /= sum;
      }
    }

    this._cdfBuffer = device.createBuffer({
      label: 'envmapCdfBuffer',
      size: cdfData.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    new Float32Array(this._cdfBuffer.getMappedRange()).set(cdfData);
    this._cdfBuffer.unmap();
    
    this.texture = device.createTexture({
      size: [width, height],
      format: image instanceof ImageBitmap ? 'rgba8unorm-srgb' : 'rgba16float',
      usage:
        GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING ,
    });

    this._view = this.texture.createView();
    
    if(image instanceof ImageBitmap) {
      device.queue.copyExternalImageToTexture(
        { source: image },
        { texture: this.texture },
        [width, height]
      );
    }
    else {
      device.queue.writeTexture(
        { texture: this.texture }, 
        image.data,
        { bytesPerRow: width * 4 * 2 }, 
        [width, height]
      );
    }

    return this;
  }

  get width(): number {
    if (this._width == undefined) 
      throw 'Metainfo is not loaded';
    return this._width;
  }

  get height(): number {
    if (this._height == undefined) 
      throw 'Metainfo is not loaded';
    return this._height;
  }

  get cdfBuffer(): GPUBuffer {
    if (this._cdfBuffer  == undefined) 
      throw 'Envmap is not loaded on GPU';
    return this._cdfBuffer;
  }

  get view(): GPUTextureView {
    if (this._view == undefined) 
      throw 'Envmap is not loaded on GPU';
    return this._view;
  }

}