
const STRUCT_RAYPAYLOAD = `
#ifndef _RAY_PAYLOAD_
#define _RAY_PAYLOAD_
struct RayPayload {
    vec3 radiance;
    vec3 attenuation;       
    vec3 hitPos;        
    vec3 bounceDir;
    float bounceDirPdf;
    uint rayDepth;
    uint seed;
};
#endif   
`;

const STRUCT_MATERIAL = `
#ifndef _MATERIAL_STRUCT_
#define _MATERIAL_STRUCT_

    struct Material {           // For std430 layout
        vec3 emittance;         // 0~11
        uint materialType;      // 12~15
        vec3 baseColor;         // 16~27
        float roughness;        // 28~31
        float specular;         // 32~35
        float metallic;         // 36~39
        float subsurface;       // 40~43
        float specularTint;     // 44~47
        float sheen;            // 48~51
        float sheenTint;        // 52~55
        float clearcoat;        // 56~59
        float clearcoatGloss;   // 60~63

        vec3 specularColor;     // 64~75
        float alpha2;           // 76~79

        float specularImportance;// 80~83
        bool specularFresnel;   // 84~87
        bool diffuseFresnel;    // 88~91
    };

    // struct Map {                // For std140 layout
    //     int baseColor = -1;
    //     int roughness = -1;
    //     int specular = -1;
    //     int metallic = -1;
    // };

#endif
`;

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
const float Pi2 = 6.283185307f;
const float Pi_2 = 1.570796327f;
const float Pi_4 = 0.7853981635f;
const float InvPi = 0.318309886f;
const float InvPi2 = 0.159154943f;

const float rayTmin = 1e-3;
const float rayTmax = 1e5;

const float envmapScale = 1;
#endif
`;

const MODULE_SAMPLING_BRDF = `
#ifndef _SAMPLING_BRDF_
#define _SAMPLING_BRDF_

${STRUCT_MATERIAL} 
${MODULE_RANDOM_NUMBER_GENERATION}

#define FRESNEL_DIFFUSE 0x100
#define FRESNEL_SPECULAR 0x200

float SchlickFresnel(float u)
{
    float m = clamp(1-u, 0, 1);
    float m2 = m*m;
    return m2*m2*m; // pow(m,5)
}

float GTR1(float HN, float alpha)
{
    if (alpha >= 1) return 1/Pi;
    float alpha2 = alpha * alpha;
    float t = 1 + (alpha2-1)*HN*HN;
    return (alpha2-1) / (Pi*log(alpha2)*t);
}

float GTR2(float HN, float alpha)
{
    float alpha2 = alpha * alpha;
    float t = 1 + (alpha2-1)*HN*HN;
    return alpha2 / (Pi * t*t);
}

float smithG_GGX(float VN, float alpha2)
{
    // float a = alpha * alpha;
    float a = alpha2;
    float b = VN*VN;
    return 1 / (VN + sqrt(a + b - a*b));
}

float TrowbridgeReitz(in float cos2, in float alpha2)
{
    // float x = alpha2 + (1-cos2)/cos2;
    // return alpha2 / (Pi*cos2*cos2*x*x);

    float x = cos2 * (alpha2 - 1) + 1;
    return alpha2 / (Pi*x*x);
}

float Smith_TrowbridgeReitz(in float VN, in float LN, in float VH, in float alpha2)
{
    if(VH <= 0.0) return 0.0f;

    float cos2 = VN * VN;
    float lambda1 = 0.5 * ( -1 + sqrt(1 + alpha2*(1-cos2)/cos2) );
    cos2 = LN * LN;
    float lambda2 = 0.5 * ( -1 + sqrt(1 + alpha2*(1-cos2)/cos2) );
    return 1 / (1 + lambda1 + lambda2);
}

vec3 evaluateGGX(
    in Material m,
    in float VN, 
    in float LN, 
    in float HN, 
    in float VH,
    in float D)
{
    D = (D==0.0) ? TrowbridgeReitz(HN*HN, m.alpha2) : D;
    float G = Smith_TrowbridgeReitz(VN, LN, VH, m.alpha2);
    vec3 F = m.specularFresnel ? mix(m.specularColor, vec3(1), SchlickFresnel(VH)) : m.specularColor;
    return ( (D * G) / (4*VN*LN) ) * F;
}

vec3 evaluateDisney(
    in Material m,
    in float VN, 
    in float LN, 
    in float HN, 
    in float VH,
    in float D)
{
    D = (D==0.0) ? TrowbridgeReitz(HN*HN, m.alpha2) : D;

    // From here, evaluate Disney brdf
    vec3 Cdlin = m.baseColor;
    float Cdlum = .3*Cdlin[0] + .6*Cdlin[1]  + .1*Cdlin[2]; // luminance approx.

    vec3 Ctint = Cdlum > 0 ? Cdlin/Cdlum : vec3(1); // normalize lum. to isolate hue+sat
    vec3 Cspec0 = mix(
        m.specular * 0.08 * mix(vec3(1), Ctint, m.specularTint), 
        Cdlin, 
        m.metallic);
    vec3 Csheen = mix(vec3(1), Ctint, m.sheenTint);

    // Diffuse fresnel - go from 1 at normal incidence to .5 at grazing
    // and mix in diffuse retro-reflection based on roughness
    float FL = SchlickFresnel(LN), FV = SchlickFresnel(VN);
    float Fd90 = 0.5 + 2 * VH * VH * m.roughness;
    float Fd = m.diffuseFresnel ? mix(1.0, Fd90, FL) * mix(1.0, Fd90, FV) : 1.0;

    // Based on Hanrahan-Krueger brdf approximation of isotropic bssrdf
    // 1.25 scale is used to (roughly) preserve albedo
    // Fss90 used to "flatten" retroreflection based on roughness
    float Fss90 = VH * VH * m.roughness;
    float Fss = mix(1.0, Fss90, FL) * mix(1.0, Fss90, FV);
    float ss = 1.25 * (Fss * (1 / (LN + VN) - .5) + .5);

    // specular
    float Ds = D;
    float FH = SchlickFresnel(VH);
    vec3 Fs = m.specularFresnel ? mix(Cspec0, vec3(1), FH) : Cspec0;
    float Gs = smithG_GGX(LN, m.alpha2) * smithG_GGX(VN, m.alpha2);

    // sheen
    vec3 Fsheen = FH * m.sheen * Csheen;

    // clearcoat (ior = 1.5 -> F0 = 0.04)
    float Dr = GTR1(HN, mix(.1, .001, m.clearcoatGloss));
    float Fr = mix(.04, 1.0, FH);
    float Gr = smithG_GGX(LN, .0625) * smithG_GGX(VN, .0625);

    return (Gs*Ds)*Fs + 0.25*m.clearcoat*Gr*Fr*Dr 
            + (1-m.metallic) * (mix(Fd, ss, m.subsurface)/Pi * Cdlin + Fsheen);
}

vec3 evaluateBRDF(      // assume LN > 0 and VN > 0
    in Material m,
    in float VN, 
    in float LN, 
    in float HN, 
    in float VH,
    in float D)
{
    vec3 eval;
    uint type = 0xFF & m.materialType;
    if ( type < 4 )
    {
        vec3 diff = InvPi * m.baseColor;
        vec3 spec = evaluateGGX(m, VN, LN, HN, VH, D);
        eval = type==0 ? diff : 
                    type==1 ? spec : 
                        type==2 ? diff + spec : 
                            (1-m.specular) * diff + m.specular * spec;
    }
    else
    {
        eval = evaluateDisney(m, VN, LN, HN, VH, D);
    }
    
    return eval;
}

vec3 evaluateBRDF(      // assume LN > 0 and VN > 0
    in Material m,
    in vec3 N,
    in vec3 V, 
    in vec3 L)
{   
    vec3 H = normalize(V + L);
    float VN = dot(V, N);
    float LN = dot(L, N);
    float HN = dot(H, N);
    float VH = dot(V, H);
    return evaluateBRDF(m, VN, LN, HN, VH, 0.0);
}

vec3 sample_hemisphere_cos(inout uint seed)
{
    float u = rng(seed);
    float v = rng(seed);

    // Uniformly sample disk.
    float r   = sqrt(u);
    float phi = 2.0f * Pi * v;

    return vec3(
        r * cos(phi),
        sqrt(max(0.0f, 1.0f - r*r)),
        r * sin(phi)
    );
}

vec3 sample_hemisphere_TrowbridgeReitzCos(in float alpha2, inout uint seed)
{
    float u = rng(seed);
    float v = rng(seed);
    
    // float cos2theta = (1 - u) / (1 + u * (alpha2 - 1));
    float tan2theta = alpha2 * (u / (1-u));
    float cos2theta = 1 / (1 + tan2theta);
    
    float sinTheta = sqrt(1 - cos2theta);
    float phi = 2 * Pi * v;

    return vec3(
        sinTheta * cos(phi), 
        sqrt(cos2theta),
        sinTheta * sin(phi)
    );
}

vec3 applyRotationMappingZToN(in vec3 N, in vec3 v) 
{
    float  s = (N.y >= 0.0f) ? 1.0f : -1.0f;
    v.y *= s;

    vec3 h = vec3(N.x, N.y + s, N.z);
    float  k = dot(v, h) / (1.0f + abs(N.y));

    return k * h - v;
}

void sampleReflection(
    in Material m,
    in vec3 N,
    in vec3 V,
    out vec3 L,
    out float LN,
    out float HN,
    out float VH,
    out float D,
    out float pdf,
    inout uint seed)
{
    bool sampleHalfvector = rng(seed) < m.specularImportance;

    vec3 H = sampleHalfvector ? 
        sample_hemisphere_TrowbridgeReitzCos(m.alpha2, seed) : 
        sample_hemisphere_cos(seed);
    H = applyRotationMappingZToN(N, H);

    if (sampleHalfvector) {
        L = 2 * dot(V, H) * H - V;
    } else {
        L = H;
        H = normalize(V + L);
    }
    LN = dot(L, N);
    HN = dot(H, N);
    VH = dot(V, H);

    D = TrowbridgeReitz(HN*HN, m.alpha2);
    pdf = (1.0 - m.specularImportance) * (InvPi * LN) 
            + m.specularImportance * (D*HN / abs(4*VH));
}
            
float sampleReflectionPdf(
	in Material m,
    in vec3 N,
    in vec3 V, 
    in vec3 L)
{
	vec3 H = normalize(V + L);
    float HN = dot(H, N);
    float D = TrowbridgeReitz(HN*HN, m.alpha2);
    return (1.0 - m.specularImportance) * (InvPi * dot(L, N)) 
            + m.specularImportance * (D*HN / abs(4*dot(V, H)));
}


uint findInverseCDF(uint start_, uint count_, float cdf_u, out float u, out float pdf_u)
{
    int start = int(start_), count = int(count_);
    
    int first = start, len = count;
    while (len > 0) 
    {
        int _half = len >> 1;
        int middle = first + _half;
        
        if (cdf[middle] <= cdf_u) 
        {
            first = middle + 1;
            len -= _half + 1;
        } 
        else  
            len = _half;
    }

    // offset: The last index of cdf[] such that cdf[offset] <= cdf_u
    // 0.0 = cdf[-1] <= cdf[0] <= ... <= cdf[count-1] = 1.0 
    int offset = clamp(first - 1, start - 1, start + count - 2);

    float cdf_offset = (offset < start) ? 0.0 : cdf[offset];

    float d_offset = (cdf_u - cdf_offset) / (cdf[offset + 1] - cdf_offset);
    u = (offset + 1 - start + d_offset) / count;
    
    pdf_u = (cdf[offset + 1] - cdf_offset) * count;
    return offset + 1 - start;      // 0 <= return <= count-1
}

void sampleEnvmap(
    out vec2 uv, 
    out float pdf,
    inout uint seed)
{
    vec2 pdf_uv;
    vec2 cdf_uv = vec2(rng(seed), rng(seed));
    // cdf_uv.y = max(cdf_uv.y, 0.00001);      // Prevent sinTheta from being near zero.

    uint select = findInverseCDF(g.envmapWidth * g.envmapHeight, g.envmapHeight, cdf_uv.y, uv.y, pdf_uv.y);
    findInverseCDF(g.envmapWidth * select, g.envmapWidth, cdf_uv.x, uv.x, pdf_uv.x);
    
    pdf = pdf_uv.x * pdf_uv.y;    // we can assert that pdf > 0 unless envmap is black everywhere.
}

float sampleEnvmapPdf(in vec2 uv)
{
    uint iu = uint(uv.x * (g.envmapWidth - 1) + 0.5);
    uint iv = uint(uv.y * (g.envmapHeight - 1) + 0.5);

    uint offset = iv * g.envmapWidth + iu;
    float pdf = (cdf[offset] - (iu>0 ? cdf[offset - 1] : 0.0)) * g.envmapHeight;
    offset = g.envmapHeight * g.envmapWidth + iv;
    pdf *= (cdf[offset] - (iv>0 ? cdf[offset - 1] : 0.0)) * g.envmapWidth;
    return pdf;
}

#endif
`;

const RAY_GENERATION_SHADER = `
${SHADER_HEADER}
${MODULE_RANDOM_NUMBER_GENERATION}
${COMMON_CONSTANTS}
${STRUCT_RAYPAYLOAD}
${STRUCT_MATERIAL} 

layout(location = 0) rayPayloadEXT RayPayload payload;

layout(binding = 0, set = 0) uniform accelerationStructureEXT topLevelAS;
layout(binding = 1, std140) buffer OutBuffer { vec4 color[]; };
layout(binding = 2) uniform rtUniforms { 
    mat4 toWorld;           // 0~64
    vec2 cameraAspect;      // 64~72
    float lensRadius;       // 72~76
    float focusDistance;    // 76~80

    uint accumulatedFrames; // 80~84
    uint numSamplesPerFrame;// 84~88
    uint maxPathLength;     // 88~92
    uint pathSamplingMethod;// 92~96    // 0: surface reflection sampling, 1: direct light sampling, 2: MIS sampling

    uint envmapWidth;       // 96~100
    uint envmapHeight;      // 100~104
    uint drawBackgraound;   // 104~108
    float envmapRotAngle;   // 108~112
} g;

layout(binding = 3) uniform sampler samp;
layout(binding = 4) uniform texture2D envmap;
layout(binding = 5) buffer EnvDistribution { float cdf[]; };  // size: (height * width) + (height)

layout(binding = 10) buffer MaterialBuffer { Material material[]; };
layout(binding = 11) uniform texture2DArray diffuseTextures;

vec2 sampleUnitDisk(inout uint seed) 
{
    float r = sqrt(rng(seed));
    float theta = 2.0 * Pi * rng(seed);
    return r * vec2(cos(theta), sin(theta));
}

vec3 tracePath(in vec3 startPos, in vec3 startDir, inout uint seed)
{
    vec3 radiance = vec3(0.0);
    vec3 attenuation = vec3(1.0);

    payload.rayDepth = 0;
    payload.seed = seed;
    payload.hitPos = startPos;
    payload.bounceDir = startDir;

    while(payload.rayDepth < g.maxPathLength)
    {
        traceRayEXT(
            topLevelAS, gl_RayFlagsOpaqueEXT, 0xFF, 0, 1, 0, 
            payload.hitPos, rayTmin, payload.bounceDir, rayTmax, 0);  

        radiance += attenuation * payload.radiance;
        attenuation *= payload.attenuation;
    }

    seed = payload.seed;
    return radiance;
}

void main() {
    const vec3 cameraX = g.toWorld[0].xyz;
    const vec3 cameraY = -g.toWorld[1].xyz;
    const vec3 cameraZ = -g.toWorld[2].xyz;
    const vec3 cameraPos = g.toWorld[3].xyz;
    const uint bufferOffset = gl_LaunchSizeEXT.x * gl_LaunchIDEXT.y + gl_LaunchIDEXT.x;
    uint seed = getNewSeed(bufferOffset, g.accumulatedFrames, 8);

    vec3 newRadiance = vec3(0.0f);
    vec2 screenCoord = vec2(gl_LaunchIDEXT.xy);
    for (uint i = 0; i < g.numSamplesPerFrame; ++i)
    {
        vec2 ndc = (screenCoord + vec2(rng(seed), rng(seed))) / vec2(gl_LaunchSizeEXT.xy) * 2.0 - 1.0; 
        vec3 rayDir = ndc.x*g.cameraAspect.x*cameraX + ndc.y*g.cameraAspect.y*cameraY + cameraZ;
        vec3 lensPoint = cameraPos;
        
        if (g.lensRadius > 0.0)
        {
            vec3 focusedPoint = cameraPos + g.focusDistance * rayDir;
            vec2 lensUV = g.lensRadius * sampleUnitDisk(seed);
            lensPoint += lensUV.x * cameraX + lensUV.y * cameraY;
            rayDir = focusedPoint - lensPoint;
        }

        newRadiance += tracePath(lensPoint, normalize(rayDir), seed);
    }
    newRadiance *= 1.0 / float(g.numSamplesPerFrame);

    vec3 avrRadiance = (g.accumulatedFrames == 0) ? newRadiance 
    : mix(color[bufferOffset].xyz, newRadiance, 1.f / (g.accumulatedFrames + 1.0f));

    if (avrRadiance == avrRadiance)
        color[bufferOffset] = vec4(avrRadiance, 1.0);
}
`;

const RAY_CLOSEST_HIT_SHADER = `
${SHADER_HEADER}
${COMMON_CONSTANTS}
${MODULE_SAMPLING_BRDF}
${STRUCT_RAYPAYLOAD} 

#define ATTRIBUTE(i) bvhGeoBuffers_0.fword[(i)]
#define POSITION(offset) vec3( ATTRIBUTE((offset)+0), ATTRIBUTE((offset)+1), ATTRIBUTE((offset)+2) )
#define NORMAL(offset)   vec3( ATTRIBUTE((offset)+4), ATTRIBUTE((offset)+5), ATTRIBUTE((offset)+6) )
#define UV(offset)       vec2( ATTRIBUTE((offset)+3), ATTRIBUTE((offset)+7) )

layout(location = 0) rayPayloadInEXT RayPayload payload;
hitAttributeEXT vec2 bc;

vec3 computeDirectLighting(
    in Material m, 
    in vec3 hitPos,
    in vec3 N,
    in vec3 V,
    inout uint seed)
{
    if (g.pathSamplingMethod == 0)
        return vec3(0.0);

    vec2 uv;
    float pdf;
    sampleEnvmap(uv, pdf, seed);

    float theta = uv.y * Pi;
    float phi = (uv.x + 0.25 - g.envmapRotAngle) * 2.0 * Pi;
    float sinTheta = sin(theta);
    vec3 L = vec3(sinTheta * cos(phi), cos(theta), sinTheta * sin(phi));
    float LN = dot(L, N);

    if(LN > 0.0) 
    {
        bool hit = shadowRayHit(0, 1, hitPos, rayTmin, L, rayTmax);
        if(!hit) 
        {
            pdf = pdf / (2.0 * Pi * Pi * sinTheta);
            
            float weight = 1.0;
            if (g.pathSamplingMethod == 2) 
            {
                float pdf0 = sampleReflectionPdf(m, N, V, L);
                weight = pdf * pdf;
                weight = weight / (weight + pdf0*pdf0);
            }
            vec3 emittance = envmapScale * texture(sampler2D(envmap, samp), uv).rgb;
            return emittance * evaluateBRDF(m, N, V, L) * (LN * weight / pdf);
        }
    }
    
    return vec3(0.0);
}

void main() {
    const uint i = gl_PrimitiveID; 
    const uint vOffset = _CRT_SBT_BUFFER_NAME[_CRT_PARAM_SHADER_RECORD_WORD_OFFSET];
    const uint iOffset = _CRT_SBT_BUFFER_NAME[_CRT_PARAM_SHADER_RECORD_WORD_OFFSET + 1];
    const uint materialIndex = _CRT_SBT_BUFFER_NAME[_CRT_PARAM_SHADER_RECORD_WORD_OFFSET + 2];                              
    // const uint materialIndex = 0;
    const mat3 R = mat3(gl_ObjectToWorldEXT);           

    uint i0, i1, i2;
    if(iOffset != uint(-1)) {   
        // Check if index buffer is always bound to bvhGeoBuffers_1!!
        // uint wordOffset = iOffset + i * 3; 
        // i0 = vOffset + floatBitsToUint(bvhGeoBuffers_1.fword[wordOffset + 0]);
        // i1 = vOffset + floatBitsToUint(bvhGeoBuffers_1.fword[wordOffset + 1]);
        // i2 = vOffset + floatBitsToUint(bvhGeoBuffers_1.fword[wordOffset + 2]);
        uvec3 indices = getTriVertIndices(1, iOffset * 4, 12, i); 
        i0 = vOffset + indices.x;
        i1 = vOffset + indices.y;
        i2 = vOffset + indices.z;
    } else{
        i0 = vOffset + i * 3 + 0;
        i1 = vOffset + i * 3 + 1;
        i2 = vOffset + i * 3 + 2;
    }
    
    uvec3 wordOffset = uvec3(i0, i1, i2) * (VERTEX_STRIDE_IN_BYTES / 4); 
    
    const vec3 n0 = NORMAL(wordOffset.x);
    const vec3 n1 = NORMAL(wordOffset.y);
    const vec3 n2 = NORMAL(wordOffset.z);  
    vec3 N = n1 * bc.x + n2 * bc.y + n0 * (1.0 - bc.x - bc.y);
    N = normalize(R * N);

    bool debug = false;
    if(debug) 
    {
        payload.rayDepth = g.maxPathLength;
        payload.radiance = material[0].baseColor * 0.001;

        if (materialIndex == 0) {
            payload.radiance += vec3(1.0, 0.0, 0.0);
        }
        else if (materialIndex == 1) {
            payload.radiance += vec3(0.0, 1.0, 0.0);
        }
        else {
            payload.radiance += vec3(0.0, 0.0, 0.0);
        }
        // payload.radiance = N * 0.01 + vec3(0.0, 1.0, 0.0);
        // payload.radiance = N;
        return;
    }

    const vec3 p0 = POSITION(wordOffset.x);
    const vec3 p1 = POSITION(wordOffset.y);
    const vec3 p2 = POSITION(wordOffset.z);
    vec3 fN = normalize(R * cross(p1 - p0, p2 - p1));
    const vec3 hitPos = gl_WorldRayOriginEXT + gl_WorldRayDirectionEXT * gl_HitTEXT;
    const vec3 V = -gl_WorldRayDirectionEXT;
    
    if(dot(V, fN) < 0.0)  N = -N;
    float VN = dot(V, N);
    if(VN <= 0.0) {
        N = normalize(cross(V, cross(N, V)) + V * 0.01);
        VN = dot(V, N);
    }

    const vec2 uv0 = UV(wordOffset.x);
    const vec2 uv1 = UV(wordOffset.y);
    const vec2 uv2 = UV(wordOffset.z);
    const vec2 uv = uv1 * bc.x + uv2 * bc.y + uv0 * (1.0 - bc.x - bc.y);

    Material m = material[materialIndex];
    {
        float alpha = max(m.roughness * m.roughness, 0.001);
        m.alpha2 = alpha * alpha;
        switch(0xFF & m.materialType) 
        {
        case 0: // Lambertian
            m.specularImportance = 0.0; 
            break;
        case 1: // GGX
            m.specularImportance = 1.0; 
            m.specularColor = m.baseColor;
            break;
        case 2: // Plastic
        case 4: // Disney
            m.specularImportance = 0.5; 
            m.specularColor = vec3(m.specular * 0.08);
            break;
        case 3: // Blend
            m.specularImportance = m.specular; 
            m.specularColor = vec3(1.0);
            break;
        }
        m.specularFresnel = (m.materialType & FRESNEL_SPECULAR) != 0;
        m.diffuseFresnel = (m.materialType & FRESNEL_DIFFUSE) != 0;
    }

    if(floatBitsToInt(m.baseColor.r) < 0.0) 
    {
        int index = -floatBitsToInt(m.baseColor.r) - 1;
        m.baseColor = texture(sampler2DArray(diffuseTextures, samp), vec3(uv, index)).rgb;
    } 

    payload.radiance = dot(V,fN) > 0 ? m.emittance : vec3(0.0);
    if (payload.rayDepth + 1 < g.maxPathLength) 
        payload.radiance += computeDirectLighting(m, hitPos, N, V, payload.seed);

    vec3 L;
    float LN, HN, VH, D, pdf;
    sampleReflection(m, N, V, L, LN, HN, VH, D, pdf, payload.seed);
    vec3 brdf = evaluateBRDF(m, VN, LN, HN, VH, D);

    payload.attenuation = LN>0.0 ? brdf * LN / pdf : vec3(0.0);
    payload.rayDepth = LN>0.0 ? payload.rayDepth + 1 : g.maxPathLength;
    payload.hitPos = hitPos;
    payload.bounceDir = L;
    payload.bounceDirPdf = pdf;
}
`;

const RAY_MISS_SHADER = `
${SHADER_HEADER}
${COMMON_CONSTANTS}
${STRUCT_RAYPAYLOAD}  
${MODULE_SAMPLING_BRDF}
layout(location = 0) rayPayloadInEXT RayPayload payload;

void main() {
    if ( (payload.rayDepth == 0 && g.drawBackgraound==0)
        || (payload.rayDepth > 0 && g.pathSamplingMethod == 1) )
    {
        payload.radiance = vec3(0.0);
        payload.rayDepth = g.maxPathLength;
        return;
    }
    
    vec3 rayDir = normalize(gl_WorldRayDirectionEXT);
    vec2 uv;
    uv.x = 0.5 + 0.5 * atan(rayDir.x, -rayDir.z) * InvPi + g.envmapRotAngle;
    uv.y = acos(rayDir.y) * InvPi;
    vec3 radiance = envmapScale * vec3(texture(sampler2D(envmap, samp), uv));

    float weight = 1.0;
    if (payload.rayDepth > 0 && g.pathSamplingMethod == 2) 
    {
        float pdf0 = sampleEnvmapPdf(uv) / (2.0 * Pi * Pi * sin(uv.y * Pi));
        weight = payload.bounceDirPdf * payload.bounceDirPdf;
        weight = weight / (weight + pdf0*pdf0);
    }

    payload.radiance = weight * radiance;
    payload.rayDepth = g.maxPathLength;
}
`;


export {
    RAY_GENERATION_SHADER,
    RAY_CLOSEST_HIT_SHADER,
    RAY_MISS_SHADER,
}