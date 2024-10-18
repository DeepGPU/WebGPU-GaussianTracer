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

    const float SH_C0 = 0.28209479177387814f;
    const float SH_C1 = 0.4886025119029199f;
    const float SH_C2_0 = 1.0925484305920792f;
    const float SH_C2_1 = -1.0925484305920792f;
    const float SH_C2_2 = 0.31539156525252005f;
    const float SH_C2_3 = -1.0925484305920792f;
    const float SH_C2_4 = 0.5462742152960396f;
    const float SH_C3_0 = -0.5900435899266435f;
    const float SH_C3_1 = 2.890611442640554f;
    const float SH_C3_2 = -0.4570457994644658f;
    const float SH_C3_3 = 0.3731763325901154f;
    const float SH_C3_4 = -0.4570457994644658f;
    const float SH_C3_5 = 1.445305721320277f;
    const float SH_C3_6 = -0.5900435899266435f;

    const bool antialiasing = false;
#endif
`;

const STRUCT_RAYPAYLOAD = `
#ifndef _RAY_PAYLOAD_
#define _RAY_PAYLOAD_
    struct HitInfo {
        float t;
        uint particleIndex;
    };

    struct RayPayload {
        HitInfo k_closest[MAX_K + 1];
        vec3 debugColor;
        uint hitCount;
        uint hitCount2;
        uint hitCount3;
    };

    layout(location = 0) rayPayloadEXT RayPayload payload;
#endif   
`;

const STRUCT_GAUSSIAN_PARTICLE = `
#ifndef _GAUSSIAN_PARTICLE_
#define _GAUSSIAN_PARTICLE_
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
layout(binding = 0, set = 0) uniform accelerationStructureEXT topLevelAS;
layout(binding = 1, std140) buffer OutBuffer { vec4 color[]; };
layout(binding = 2) buffer GaussianParticleBuffer { GaussianParticle particles[]; };
layout(binding = 3) uniform rtUniforms { 
    mat4 toWorld;           // 0~64
    vec2 cameraAspect;      // 64~72
    float t_min;            // 72~76   
    float t_max;            // 76~80
    float T_min;            // 80~84
    float alpha_min;        // 84~88
    uint k;                 // 88~92
    uint sh_degree_max;     // 92~96
    uint accumulatedFrames; // 96~100
    uint earlyStop;         // 100~104
    uint debugMode;         // 104~108
} g;


float computeResponse(in GaussianParticle gp, in vec3 o, in vec3 d)
{
    vec3 mu = gp.position;

    float r = gp.rotation[0];
    float x = gp.rotation[1];
    float y = gp.rotation[2];
    float z = gp.rotation[3];
    mat3 R = mat3(
        1. - 2. * (y * y + z * z), 2. * (x * y - r * z), 2. * (x * z + r * y),
        2. * (x * y + r * z), 1. - 2. * (x * x + z * z), 2. * (y * z - r * x),
        2. * (x * z - r * y), 2. * (y * z + r * x), 1. - 2. * (x * x + y * y)   );

    mat3 invS = mat3(1.0);
    invS[0][0] = 1.0 / gp.scale.x;
    invS[1][1] = 1.0 / gp.scale.y;
    invS[2][2] = 1.0 / gp.scale.z;

    mat3 invCov = invS * R;
    invCov = transpose(invCov) * invCov;

    vec3 temp = invCov * d;
    vec3 p = o + (dot(mu - o, temp) / dot(d, temp)) * d;

    return exp(dot(mu - p, invCov * (p - mu)));
}

vec3 shToRadiance(in GaussianParticle gp, in vec3 d)
{
    const vec3 sh[16] = gp.sh;

    vec3 L = vec3(0.5) + SH_C0 * sh[0];
    if (g.sh_degree_max == 0) 
        return L;

    float x = d.x;
    float y = d.y;
    float z = d.z;
    L += SH_C1 * (-y * sh[1] + z * sh[2] - x * sh[3]);
    if (g.sh_degree_max == 1) 
        return L;

    float xx = x * x;
    float yy = y * y;
    float zz = z * z;
    float xy = x * y;
    float xz = x * z;
    float yz = y * z;
    L +=    
        SH_C2_0 * xy * sh[4] +
        SH_C2_1 * yz * sh[5] +
        SH_C2_2 * (2. * zz - xx - yy) * sh[6] +
        SH_C2_3 * xz * sh[7] +
        SH_C2_4 * (xx - yy) * sh[8];
    if (g.sh_degree_max == 2)
        return L;

    L +=
        SH_C3_0 * y * (3.0f * xx - yy) * sh[9] +
        SH_C3_1 * xy * z * sh[10] +
        SH_C3_2 * y * (4.0f * zz - xx - yy) * sh[11] +
        SH_C3_3 * z * (2.0f * zz - 3.0f * xx - 3.0f * yy) * sh[12] +
        SH_C3_4 * x * (4.0f * zz - xx - yy) * sh[13] +
        SH_C3_5 * z * (xx - yy) * sh[14] +
        SH_C3_6 * x * (xx - 3.0f * yy) * sh[15];
    return L;
}

vec3 sigmoid(vec3 x)
{
    return 1.0 / (1.0 + exp(-x));
}

vec3 computeRadiance(in GaussianParticle gp, in vec3 d)
{
    vec3 L = shToRadiance(gp, d);

    // return sigmoid(L);       // uncomment when the data is trained with sigmoid as in the paper (3d gaussian ray tracing)
    return max(vec3(0.0), L);   // just max when the data is traned w.r.t vanilla gaussian splatting method
}

vec4 tracePath(vec3 rayOrigin, vec3 rayDir) 
{
    vec3 L = vec3(0.0);
    float T = 1;
    float t_curr = g.t_min;
    const float epsillon = 1e-4;
   
    payload.hitCount = 0;

    if (g.debugMode == 2)
    {
        for(int i=0; i<g.k; i++)
            payload.k_closest[i].t = g.t_max;
        
        uint rayFlags = gl_RayFlagsCullBackFacingTrianglesEXT |
                        gl_RayFlagsSkipClosestHitShaderEXT;
        traceRayEXT(
            topLevelAS, rayFlags, 0xFF, 0, 1, 0, 
            rayOrigin, t_curr, rayDir, g.t_max, 0);  
        
        if(payload.hitCount == 0)
            return vec4(0,0,0, T);
        else if(payload.hitCount < 20)
            return vec4(0.5,0.5,0, T);
        else if(payload.hitCount < 40)
            return vec4(0.5,0,0.5, T);
        else if(payload.hitCount < 60)
            return vec4(0,0.5,0.5, T);
        else if(payload.hitCount < 80)
            return vec4(0.5,0,0, T);
        else if(payload.hitCount < 100)
            return vec4(0,0.5,0, T);
        else if(payload.hitCount < 150)
            return vec4(0,0,0.5, T);
        
        return vec4(0.5,0.5,0.5, T);
    }

    uint step = 0;
    while(g.T_min < T && t_curr < g.t_max) 
    {
        if(g.earlyStop == step++)
            break;

        for(int i=0; i<g.k; i++)
        {
            payload.k_closest[i].t = g.t_max;
            payload.k_closest[i].particleIndex = uint(-1);
        }

        uint rayFlags = gl_RayFlagsCullBackFacingTrianglesEXT |     // ignore hit when the ray hits the back face of the triangle
                        gl_RayFlagsSkipClosestHitShaderEXT;         // skip closest hit shader
        traceRayEXT(
            topLevelAS, rayFlags, 0xFF, 0, 1, 0, 
            rayOrigin, t_curr, rayDir, g.t_max, 0);  

        t_curr = payload.k_closest[g.k-1].t + epsillon; 

        for(int i=0; i<g.k; i++) 
        {
            if (payload.k_closest[i].particleIndex == uint(-1)) 
            {
                t_curr = g.t_max;
                break;
            }

            GaussianParticle gp = particles[payload.k_closest[i].particleIndex];
            float alpha_hit = computeResponse(gp, rayOrigin, rayDir) * gp.opacity;  

            if(g.alpha_min < alpha_hit) 
            {
                //vec3 L_hit = computeRadiance(gp, rayDir);                              // in the paper (3d gaussian ray tracing)
                vec3 L_hit = computeRadiance(gp, normalize(gp.position - rayOrigin));   // vanilla gaussian splatting

                L += T * alpha_hit * L_hit;
                T *= 1.0 - alpha_hit;
            }
        }
    }

    return vec4(L, T);
}

void main() 
{
    const vec3 cameraX = -g.toWorld[0].xyz;
    const vec3 cameraY = g.toWorld[1].xyz;
    const vec3 cameraZ = -g.toWorld[2].xyz;
    const vec3 cameraPos = g.toWorld[3].xyz;
    const uint bufferOffset = gl_LaunchSizeEXT.x * gl_LaunchIDEXT.y + gl_LaunchIDEXT.x;
    uint seed = getNewSeed(bufferOffset, g.accumulatedFrames, 8);
    vec2 pixelOff = antialiasing ? vec2(rng(seed), rng(seed)) : vec2(0.5);
    vec2 ndc = (vec2(gl_LaunchIDEXT.xy) + pixelOff) / vec2(gl_LaunchSizeEXT.xy) * 2.0 - 1.0; 
    vec3 rayDir = normalize(ndc.x*g.cameraAspect.x*cameraX + ndc.y*g.cameraAspect.y*cameraY + cameraZ);
    
    vec3 newRadiance;

    if(g.debugMode == 1)
    {
        // gl_RayFlagsOpaqueEXT means that anyhit shader does not called
        traceRayEXT(
            topLevelAS, 0, 0xFF, 0, 1, 0,    
            cameraPos, g.t_min, rayDir, g.t_max, 0);  
        newRadiance = payload.debugColor;
    }
    else
        newRadiance = tracePath(cameraPos, rayDir).rgb;

    if(!antialiasing)
        color[bufferOffset] = vec4(newRadiance, 1.0);
    else
    {
        vec3 avrRadiance = (g.accumulatedFrames == 0) ? newRadiance 
            : mix(color[bufferOffset].xyz, newRadiance, 1.f / (g.accumulatedFrames + 1.0f));
    
        color[bufferOffset] = vec4(avrRadiance, 1.0);
    }
}
`;

const DEBUG_CLOSEST_HIT_SHADER = `
void main()
{   
    uint k = _CRT_SBT_BUFFER_NAME[_CRT_PARAM_SHADER_RECORD_WORD_OFFSET];
    GaussianParticle gp = particles[k];

    payload.debugColor = computeRadiance(gp, gl_WorldRayDirectionEXT);
    // payload.debugColor = computeRadiance(gp, normalize(gp.position - gl_WorldRayOriginEXT)); 
}
`;

const RAY_ANY_HIT_SHADER = `
void swap(inout HitInfo a, inout HitInfo b) 
{
    HitInfo temp = a;
    a = b;
    b = temp;
}

void main() 
{
    payload.hitCount++;

    uint particleIndex = _CRT_SBT_BUFFER_NAME[_CRT_PARAM_SHADER_RECORD_WORD_OFFSET];  

    // // case 1 : slower than case 2, why?
    // payload.k_closest[g.k] = HitInfo(gl_HitTEXT, particleIndex);
    // for(int i=int(g.k-1); i>=0; i--)
    // {
    //     if(payload.k_closest[i+1].t < payload.k_closest[i].t)
    //         swap(payload.k_closest[i+1], payload.k_closest[i]);
    //     else
    //         break;
    // }

    // case 2
    HitInfo hitInfo = HitInfo(gl_HitTEXT, particleIndex);
    for(int i=0; i<g.k; i++) 
    {
        if(hitInfo.t < payload.k_closest[i].t) 
            swap(hitInfo, payload.k_closest[i]);
    }

    // _crt_hit_report = floatBitsToUint(payload.k_closest[g.k-1].t);  // This is the more efficient commit starategy, but there is no correspondings in modern raytracing APIs (ex. OptiX, DXR, Vulkan raytracing).
    // return;

    if(gl_HitTEXT < payload.k_closest[g.k-1].t)  
    {
         // not commit
        _crt_hit_report = _CRT_HIT_REPORT_IGNORE;    // corresponds to ignoreIntersectionEXT() of vulkan ray tracing extension
    }
    else     
    {
         // commit 
    }
}
`;


function code_raygen_shader(hit_array_size: number) {
    return `
        ${SHADER_HEADER}
        ${MODULE_RANDOM_NUMBER_GENERATION}
        ${COMMON_CONSTANTS}
        ${STRUCT_GAUSSIAN_PARTICLE}
        #define MAX_K ${hit_array_size}
        ${STRUCT_RAYPAYLOAD}
        ${RAY_GENERATION_SHADER}
    `;
}

function code_anyhit_shader(hit_array_size: number) {
    return `
        ${SHADER_HEADER}
        #define MAX_K ${hit_array_size}
        ${STRUCT_RAYPAYLOAD}
        ${RAY_ANY_HIT_SHADER}
    `;
}

function code_closesthit_shader(hit_array_size: number) {
    return `
        ${SHADER_HEADER}
        ${STRUCT_GAUSSIAN_PARTICLE}
        #define MAX_K ${hit_array_size}
        ${STRUCT_RAYPAYLOAD} 
        ${DEBUG_CLOSEST_HIT_SHADER}
    `;
}

export {
  code_raygen_shader,
  code_anyhit_shader,
  code_closesthit_shader,
}