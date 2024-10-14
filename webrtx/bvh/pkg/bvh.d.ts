/* tslint:disable */
/* eslint-disable */
/**
* @param {number} blas_descriptor_buffer_id
* @returns {BuiltBvh}
*/
export function build_blas(blas_descriptor_buffer_id: number): BuiltBvh;
/**
* @param {number} tlas_descriptor_buffer_id
* @returns {BuiltBvh}
*/
export function build_tlas(tlas_descriptor_buffer_id: number): BuiltBvh;
/**
*/
export class BuiltBvh {
  free(): void;
/**
*/
  num_nodes: number;
/**
*/
  serialized: StagingBuffer;
}
/**
*/
export class StagingBuffer {
  free(): void;
/**
*/
  free(): void;
/**
* @returns {any}
*/
  u8_view(): any;
/**
* @param {number} byte_length
*/
  constructor(byte_length: number);
/**
*/
  id: number;
}
