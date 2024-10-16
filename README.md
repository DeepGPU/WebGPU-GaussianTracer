# WebGPU Gaussian Ray Tracer
A non-official implementation of the rendering part of the paper "3D Gaussian Ray Tracing: Fast Tracing of Particle Scenes" on the web.

## How to run
### Requirements
* Node.js (https://nodejs.org/en)
* Rust (https://www.rust-lang.org/tools/install)
* WebGPU supporting browsers (almost browsers)

### Build and Serve
```
# First build(including compile):
npm install
npm run build


# For just compile:
npm run compile


# serve
python -m http.server 3000
```

## Introduction
* To the best of my knowledge, this is the first open-source implementation of rendering for Gaussian ray tracing.

* There are two groups of ray tracing programs utilizing GPUs. The first group employs modern GPU-accelerated ray tracing APIs, such as OptiX, DXR, or Vulkan Ray Tracing. The second group consists of native implementations running on GPGPU using frameworks like CUDA or compute shaders. The first group is more efficient than the second due to the utilization of dedicated RT cores. However, it is limited to specific graphics cards, such as GeForce RTX and Radeon RX, whereas the second group can run on any graphics card. This project belongs to the second group, as there are currently no methods available to utilize RT cores on the web.

* Unfortunately, the Gaussian ray tracer does not fully accommodate data trained on vanilla Gaussian splatting, as mentioned in the paper. Therefore, I do not have any proper data for this project because the authors of the paper have not published the data trained on their model. Consequently, I had no choice but to run the example with vanilla Gaussian splatting data, and the results were reasonably satisfactory.

## Examples

## Limitations

## Reference
1. Vanilla Gaussian Splatting - https://github.com/graphdeco-inria/gaussian-splatting  
2. Gaussian Ray Tracing - https://gaussiantracer.github.io/
3. WebRTX - https://github.com/codedhead/webrtx/tree/master
4. DXR spec - https://microsoft.github.io/DirectX-Specs/d3d/Raytracing.html
5. Vulkan correspondence to DXR - 