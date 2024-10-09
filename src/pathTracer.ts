import { RayTracingPass } from "./rtpass";
import { RayTracingScene } from "./rtscene";
import { MaterialCollection } from "./materialCollection";
import { GeometryUnit } from "./scene";
import { 
  RAY_GENERATION_SHADER, 
  RAY_CLOSEST_HIT_SHADER, 
  RAY_MISS_SHADER,
} from './pathTracer_shader';
import { Envmap } from "./envmap";


export class PathTracer extends RayTracingPass {
  private scene?: RayTracingScene
  private _materials?: MaterialCollection;
  private _width = 0;
  private _height = 0;
  private uniformBuffer0 = {} as GPUBuffer;
  private _bindGroup0?: GPUBindGroup ;
  private envmap?: Envmap;

  private pack_vertex = (geometry: GeometryUnit, vIndex: number) => {
    const {vertices, normals, uvs} = geometry;
    return [
      vertices[vIndex*3 + 0], 
      vertices[vIndex*3 + 1], 
      vertices[vIndex*3 + 2], 
      uvs ? uvs[vIndex*2 + 0] : 0.0,
      normals[vIndex*3 + 0], 
      normals[vIndex*3 + 1], 
      normals[vIndex*3 + 2], 
      uvs ? uvs[vIndex*2 + 1] : 0.0,
    ];
  }
  private packingSize = 8;

  constructor(device: GPUDevice, width: number, height: number) { 
    super(device); 
    this.setTargetSize(width, height);
    this.initUnifromBuffer();
    this.build_pipeline(
      {
        rayGen: { code: RAY_GENERATION_SHADER },
        misses: [{ code: RAY_MISS_SHADER }],
        hitGroups: [{ closestHit: { code: RAY_CLOSEST_HIT_SHADER } }],
      }, 
      this.packingSize * 4
    );
  }

  get width() { return this._width; }
  get height() { return this._height; }

  get materials() {
    if (!this._materials) {
      throw 'Materials are not ready';
    }
    return this._materials;
  }

  setEnvmap(envmap: Envmap) {
    this.envmap = envmap;
    this.envmapWidth = envmap.width;
    this.envmapHeight = envmap.height;
    this._bindGroup0 = undefined;
  }

  setTargetSize(width: number, height: number) {
    if(this._width > 0 && this._height > 0) {
      console.warn('Target size has already been set'); // Resize is not supported yet..
      return;
    }
    if(width <= 0 || height <= 0) {
      throw 'Invalid target size';
    }
    this._width = width;
    this._height = height;
    this.resize_outBuffer(this._width * this._height * 4 * 4);
  }

  prepare_scene(scene: RayTracingScene) {
    this.scene = scene;
    
    let t0 = Date.now();
    scene.build_tlas(this.pack_vertex, this.packingSize);
    console.log(`-> Building TLAS time: ${(Date.now()-t0)/1000}`);

    t0 = Date.now();
    this._materials = new MaterialCollection(this.device, scene);
    this.materials.loadOnGpu();
    console.log(`-> Building materials time: ${(Date.now()-t0)/1000}`);

    this.build_sbt(scene, this.materials);
    this._bindGroup0 = undefined;
  }

  get bindGroup0() {
    if (!this._bindGroup0) {
      if (!this.envmap) 
        throw 'Envmap is not set';

      this._bindGroup0 = this.device.createBindGroup({
        label: 'PathTracingBindGroup',
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.scene!.tlas as any },
          { binding: 1, resource: { buffer: this.outBuffer! } },
          { binding: 2, resource: { buffer: this.uniformBuffer0 } },
          { binding: 3, resource: this.device.linearSampler },
          { binding: 4, resource: this.envmap.view },
          { binding: 5, resource: { buffer: this.envmap.cdfBuffer }  },

          { binding: 10, resource: { buffer: this.materials.buffer } },
          { binding: 11, resource: this.materials.textureArray0.createView({dimension: '2d-array',}) },
        ],
      });
    }
    return this._bindGroup0;
  }

  //  0~64 : toWorld(mat4)
  // 64~80 : cameraAspect(vec2) + rayTmin(float) + rayTmax(float)
  // 80~96 : accumulatedFrames(uint) + numSamplesPerFrame(uint) + maxPathLength(uint) + pathSamplingMethod(uint)
  // 96~112 : envmapWidth(uint) + envmapHeight(uint) + drawBackgraound(uint) + envmapRotAngle(float)
  private _uniformBuffer0_data: ArrayBuffer = new ArrayBuffer(112);
  private _uniformBuffer0_float: Float32Array = new Float32Array(this._uniformBuffer0_data);
  private _uniformBuffer0_uint32: Uint32Array = new Uint32Array(this._uniformBuffer0_data);
  private _hFov: number = 60.0;
  private _lensRadius: number = 0.0;
  
  private initUnifromBuffer() {
    this.uniformBuffer0 = this.device.createBuffer({
      label: 'pathTracer_uniformBuffer0',
      size: 112, 
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    if (this._width === 0 || this._height === 0) {
      throw 'Target size has to be set before initializing uniform buffer';
    }

    // this.rayTmin = 1e-3;
    // this.rayTmax = 1e5;
    this.accumulatedFrames = 0;
    this.pathSamplingMethod = 2;
    this.numSamplesPerFrame = 4;
    this.maxPathLength = 5;
    this.hFov = 60.0;
    this.lensRadius = 0.0;
    this.drawBackground = true;
  }

  updateUniforms() {
    this.device.queue.writeBuffer(this.uniformBuffer0, 0, this._uniformBuffer0_data);
  }

  get cameraPose()          { return this._uniformBuffer0_float.subarray(0, 16); }
  get hFov()                { return this._hFov; }
  get lensRadius()          { return this._lensRadius; }
  get focusDistance()       { return this._uniformBuffer0_float[19]; }
  get accumulatedFrames()   { return this._uniformBuffer0_uint32[20]; }
  get numSamplesPerFrame()  { return this._uniformBuffer0_uint32[21]; }
  get maxPathLength()       { return this._uniformBuffer0_uint32[22]; }
  get maxPathBounce()       { return this.maxPathLength - 1; }
  get pathSamplingMethod()  { return this._uniformBuffer0_uint32[23]; }
  get envmapWidth()         { return this._uniformBuffer0_uint32[24]; }
  get envmapHeight()        { return this._uniformBuffer0_uint32[25]; }
  get drawBackground()      { return !!this._uniformBuffer0_uint32[26]; }
  get envmapRotAngle()      { return this._uniformBuffer0_float[27] * 360; }
      
  set cameraPose(mat4: Float32Array)    { this.cameraPose.set(mat4); }
  set hFov(value: number)               { this._hFov = value; const aspect = Math.tan(0.5*value * Math.PI / 180.0);
                                          this._uniformBuffer0_float[16] = aspect;
                                          this._uniformBuffer0_float[17] = aspect * (this._height / this._width); }
  set lensRadius(value: number)         { this._lensRadius = value;
                                          this._uniformBuffer0_float[18] = value; }
  set focusDistance(value: number)      { this._uniformBuffer0_float[19] = value; }  
  set accumulatedFrames(value: number)  { this._uniformBuffer0_uint32[20] = value; }
  set numSamplesPerFrame(value: number) { this._uniformBuffer0_uint32[21] = value; }
  set maxPathLength(value: number)      { this._uniformBuffer0_uint32[22] = value; }
  set maxPathBounce(value: number)      { this.maxPathLength = value + 1; }
  set pathSamplingMethod(value: number) { this._uniformBuffer0_uint32[23] = value; }
  set envmapWidth(value: number)        { this._uniformBuffer0_uint32[24] = value; }
  set envmapHeight(value: number)       { this._uniformBuffer0_uint32[25] = value; }
  set drawBackground(value: boolean)    { this._uniformBuffer0_uint32[26] = +value; }
  set envmapRotAngle(value: number)     { this._uniformBuffer0_float[27] = value / (360); }
}