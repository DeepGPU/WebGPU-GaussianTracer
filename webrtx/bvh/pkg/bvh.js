import * as wasm from "./bvh_bg.wasm";
import { __wbg_set_wasm } from "./bvh_bg.js";
__wbg_set_wasm(wasm);
export * from "./bvh_bg.js";
