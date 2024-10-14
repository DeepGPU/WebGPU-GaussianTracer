/* tslint:disable */
/* eslint-disable */
/**
* @param {string} code
* @param {string} shader_stage
* @param {string} entry_point_name
* @param {string} new_entry_point_name
* @returns {ProcessedShaderInfo}
*/
export function process(code: string, shader_stage: string, entry_point_name: string, new_entry_point_name: string): ProcessedShaderInfo;
/**
*/
export enum GlGlobalVarirableAsParam {
  gl_PrimitiveID = 0,
  gl_InstanceID = 1,
  gl_InstanceCustomIndexEXT = 2,
  gl_GeometryIndexEXT = 3,
  gl_WorldRayOriginEXT = 4,
  gl_WorldRayDirectionEXT = 5,
  gl_ObjectRayOriginEXT = 6,
  gl_ObjectRayDirectionEXT = 7,
  gl_RayTminEXT = 8,
  gl_RayTmaxEXT = 9,
  gl_IncomingRayFlagsEXT = 10,
  gl_HitTEXT = 11,
  gl_HitKindEXT = 12,
  gl_ObjectToWorldEXT = 13,
  gl_WorldToObjectEXT = 14,
  gl_WorldToObject3x4EXT = 15,
  gl_ObjectToWorld3x4EXT = 16,
}
/**
*/
export class ProcessedShaderInfo {
  free(): void;
/**
* @returns {string}
*/
  processed_shader(): string;
/**
* @returns {string}
*/
  processed_entry_point_prototype(): string;
/**
* @returns {string}
*/
  forward_type_declarations(): string;
/**
* @returns {string}
*/
  invocation_code(): string;
/**
* @returns {string}
*/
  packing_code(): string;
/**
* @returns {string}
*/
  unpacking_code(): string;
/**
* @returns {Uint32Array}
*/
  global_variables(): Uint32Array;
/**
*/
  hit_attributes_num_words: number;
/**
*/
  max_bind_set_number: number;
}
