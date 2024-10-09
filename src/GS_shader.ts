const SHADER_HEADER = `
#version 460
#extension GL_EXT_ray_tracing : enable  
`;

const MODULE_RANDOM_NUMBER_GENERATION = `
#ifndef _RANDOM_MODULE_
#define _RANDOM_MODULE_
    uint getNewSeed(uint param1, uint param2, uint numPermutation)
    {
        uint s0 = 0;
        uint v0 = param1;
        uint v1 = param2;
        
        for(uint perm = 0; perm < numPermutation; perm++)
        {
            s0 += 0x9e3779b9;
            v0 += ((v1<<4) + 0xa341316c) ^ (v1+s0) ^ ((v1>>5) + 0xc8013ea4);
            v1 += ((v0<<4) + 0xad90777d) ^ (v0+s0) ^ ((v0>>5) + 0x7e95761e);
        }

        return v0;
    }

    float rng(inout uint seed)
    {
        seed = (1664525u * seed + 1013904223u);
        return float(seed & 0x00FFFFFF) / float(0x01000000);
    }
#endif
`;

const COMMON_CONSTANTS = `
#ifndef _COMMON_CONSTANTS_
#define _COMMON_CONSTANTS_
    const float Pi = 3.141592654f;
    const float InvPi = 0.318309886f;
#endif
`;

const STRUCT_RAYPAYLOAD = `
#ifndef _RAY_PAYLOAD_
#define _RAY_PAYLOAD_
    #define MAX_K 256

    struct HitInfo {
        float t;
        uint particleIndex;
    };

    struct RayPayload {
        HitInfo k_closest[MAX_K];
    };
#endif   
`;

const STRUCT_GAUSSIAN_PARTICLE = `
#ifndef _GAUSSIAN_PARTICLE_
#define _GAUSSIAN_PARTICLE_
    // struct GaussianParticle {
    //     vec3 position;  // 0~12
    //     vec4 rotation;  // 16~32
    //     vec3 scale;     // 32~44
    //     float opacity;  // 44~48
    //     float sh[48];   // 48~240
    // };

    struct GaussianParticle {
        vec3 position;  // 0~12
        vec3 scale;     // 16~28
        vec4 rotation;  // 32~48
        float opacity;  // 48~52
        vec3 sh[16];    // 64~320
    };
#endif
`;

const RAY_GENERATION_SHADER = `
${SHADER_HEADER}
${MODULE_RANDOM_NUMBER_GENERATION}
${COMMON_CONSTANTS}
${STRUCT_RAYPAYLOAD}


layout(location = 0) rayPayloadEXT RayPayload payload;

layout(binding = 0, set = 0) uniform accelerationStructureEXT topLevelAS;
layout(binding = 1, std140) buffer OutBuffer { vec4 color[]; };
layout(binding = 2) uniform rtUniforms { 
    mat4 toWorld;           // 0~64
    vec2 cameraAspect;    
    float t_min;
    float t_max;
    float T_min;
    float alpha_min;
    uint k;
    uint accumulatedFrames;
} g;
layout(binding = 3) buffer GaussianParticleBuffer { GaussianParticle particles[]; };


vec4 tracePath(vec3 rayOrigin, vec3 rayDir) {
    vec3 L = vec3(0.0);
    float T = 1.0;

    float t_curr = t_min;
    while(T_min < T && t_curr < t_max) 
    {
        traceRayEXT(
            topLevelAS, gl_RayFlagsNoneEXT, 0xFF, 0, 1, 0, 
            rayOrigin, t_curr, rayDir, t_max, 0);  

        for(int i=0; i<g.k; i++) 
        {
            GaussianParticle gp = particles[payload.k_closest[i].particleIndex];
            float alpha_hit = computeResponse(gp);
            if(alpha_min < alpha_hit) 
            {
                vec3 L_hit = computeRadiance(rayDir, gp);
                L += T * alpha_hit * L_hit;
                T *= 1.0 - alpha_hit;
            }
            t_curr = payload.k_closest[i].t; 
        }
    }

    return vec4(L, T);
}

void main() {
    const vec3 cameraX = g.toWorld[0].xyz;
    const vec3 cameraY = -g.toWorld[1].xyz;
    const vec3 cameraZ = -g.toWorld[2].xyz;
    const vec3 cameraPos = g.toWorld[3].xyz;
    const uint bufferOffset = gl_LaunchSizeEXT.x * gl_LaunchIDEXT.y + gl_LaunchIDEXT.x;
    uint seed = getNewSeed(bufferOffset, g.accumulatedFrames, 8);
    vec2 ndc = (vec2(gl_LaunchIDEXT.xy) + vec2(rng(seed), rng(seed))) / vec2(gl_LaunchSizeEXT.xy) * 2.0 - 1.0; 
    vec3 rayDir = normalize(ndc.x*g.cameraAspect.x*cameraX + ndc.y*g.cameraAspect.y*cameraY + cameraZ);
    
    vec3 newRadiance = tracePath(cameraPos, rayDir).rgb;

    vec3 avrRadiance = (g.accumulatedFrames == 0) ? newRadiance 
        : mix(color[bufferOffset].xyz, newRadiance, 1.f / (g.accumulatedFrames + 1.0f));

    color[bufferOffset] = vec4(avrRadiance, 1.0);
}
`;

const RAY_ANY_HIT_SHADER = `
${SHADER_HEADER}
${STRUCT_RAYPAYLOAD}  

layout(location = 0) rayPayloadInEXT RayPayload payload;

void main() {
    payload.k_closest[gl_RayPayloadClosestHitEXT].t = gl_RayTmaxEXT;
    payload.k_closest[gl_RayPayloadClosestHitEXT].particleIndex = gl_InstanceCustomIndexEXT;
    ignoreIntersectionEXT();
}
`;


export {
  RAY_GENERATION_SHADER,
  RAY_ANY_HIT_SHADER,
}