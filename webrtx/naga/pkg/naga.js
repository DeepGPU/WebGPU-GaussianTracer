import * as wasm from "./naga_bg.wasm";
import { __wbg_set_wasm } from "./naga_bg.js";
__wbg_set_wasm(wasm);
export * from "./naga_bg.js";
