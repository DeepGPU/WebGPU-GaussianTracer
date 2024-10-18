# WebGPU Gaussian Ray Tracer
A non-official implementation of the rendering part of the paper "3D Gaussian Ray Tracing: Fast Tracing of Particle Scenes" on the web.

## How to run
### Requirements
* Node.js (https://nodejs.org/en)
* Rust (https://www.rust-lang.org/tools/install)
* WebGPU supporting browsers (almost browsers)
* Trained data from vanilla Gaussian splatting (https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/datasets/pretrained/models.zip)

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
5. Vulkan correspondence to DXR - https://docs.vulkan.org/guide/latest/high_level_shader_language_comparison.html

[Notes on 3, 4, 5]  
This code is based on the WebRTX framework, which emulates the Vulkan ray tracing API and its shader interfaces—such as ray generation, closest-hit, any-hit, and miss shaders—using glslang to convert GLSL into WGSL (WebGPU Shader Language). However, the framework only implements the core functionality of ray tracing, leaving many features as a work in progress. As a result, I had to add additional features to support the Gaussian tracer.
If you want to extend the framework for specific applications, you need to be familiar with modern ray tracing APIs standardized by NVIDIA’s RTX and Microsoft’s DXR. Although the WebRTX framework emulates Vulkan ray tracing rather than DXR, the detailed DXR specifications are still very helpful.