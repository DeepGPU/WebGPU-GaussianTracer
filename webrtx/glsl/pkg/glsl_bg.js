let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}


const lTextDecoder = typeof TextDecoder === 'undefined' ? (0, module.require)('util').TextDecoder : TextDecoder;

let cachedTextDecoder = new lTextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

let cachedUint8Memory0 = null;

function getUint8Memory0() {
    if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
        cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

const heap = new Array(128).fill(undefined);

heap.push(undefined, null, true, false);

let heap_next = heap.length;

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function getObject(idx) { return heap[idx]; }

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedInt32Memory0 = null;

function getInt32Memory0() {
    if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
        cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32Memory0;
}

let cachedUint32Memory0 = null;

function getUint32Memory0() {
    if (cachedUint32Memory0 === null || cachedUint32Memory0.byteLength === 0) {
        cachedUint32Memory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32Memory0;
}

function getArrayU32FromWasm0(ptr, len) {
    return getUint32Memory0().subarray(ptr / 4, ptr / 4 + len);
}

let WASM_VECTOR_LEN = 0;

const lTextEncoder = typeof TextEncoder === 'undefined' ? (0, module.require)('util').TextEncoder : TextEncoder;

let cachedTextEncoder = new lTextEncoder('utf-8');

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length);
        getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len);

    const mem = getUint8Memory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3);
        const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}
/**
* @param {string} code
* @param {string} shader_stage
* @param {string} entry_point_name
* @param {string} new_entry_point_name
* @returns {ProcessedShaderInfo}
*/
export function process(code, shader_stage, entry_point_name, new_entry_point_name) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(shader_stage, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(entry_point_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(new_entry_point_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        wasm.process(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var r2 = getInt32Memory0()[retptr / 4 + 2];
        if (r2) {
            throw takeObject(r1);
        }
        return ProcessedShaderInfo.__wrap(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
*/
export const GlGlobalVarirableAsParam = Object.freeze({ gl_PrimitiveID:0,"0":"gl_PrimitiveID",gl_InstanceID:1,"1":"gl_InstanceID",gl_InstanceCustomIndexEXT:2,"2":"gl_InstanceCustomIndexEXT",gl_GeometryIndexEXT:3,"3":"gl_GeometryIndexEXT",gl_WorldRayOriginEXT:4,"4":"gl_WorldRayOriginEXT",gl_WorldRayDirectionEXT:5,"5":"gl_WorldRayDirectionEXT",gl_ObjectRayOriginEXT:6,"6":"gl_ObjectRayOriginEXT",gl_ObjectRayDirectionEXT:7,"7":"gl_ObjectRayDirectionEXT",gl_RayTminEXT:8,"8":"gl_RayTminEXT",gl_RayTmaxEXT:9,"9":"gl_RayTmaxEXT",gl_IncomingRayFlagsEXT:10,"10":"gl_IncomingRayFlagsEXT",gl_HitTEXT:11,"11":"gl_HitTEXT",gl_HitKindEXT:12,"12":"gl_HitKindEXT",gl_ObjectToWorldEXT:13,"13":"gl_ObjectToWorldEXT",gl_WorldToObjectEXT:14,"14":"gl_WorldToObjectEXT",gl_WorldToObject3x4EXT:15,"15":"gl_WorldToObject3x4EXT",gl_ObjectToWorld3x4EXT:16,"16":"gl_ObjectToWorld3x4EXT", });
/**
*/
export class ProcessedShaderInfo {

    static __wrap(ptr) {
        const obj = Object.create(ProcessedShaderInfo.prototype);
        obj.ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.ptr;
        this.ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_processedshaderinfo_free(ptr);
    }
    /**
    * @returns {number}
    */
    get hit_attributes_num_words() {
        const ret = wasm.__wbg_get_processedshaderinfo_hit_attributes_num_words(this.ptr);
        return ret >>> 0;
    }
    /**
    * @param {number} arg0
    */
    set hit_attributes_num_words(arg0) {
        wasm.__wbg_set_processedshaderinfo_hit_attributes_num_words(this.ptr, arg0);
    }
    /**
    * @returns {number}
    */
    get max_bind_set_number() {
        const ret = wasm.__wbg_get_processedshaderinfo_max_bind_set_number(this.ptr);
        return ret;
    }
    /**
    * @param {number} arg0
    */
    set max_bind_set_number(arg0) {
        wasm.__wbg_set_processedshaderinfo_max_bind_set_number(this.ptr, arg0);
    }
    /**
    * @returns {string}
    */
    processed_shader() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.processedshaderinfo_processed_shader(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(r0, r1);
        }
    }
    /**
    * @returns {string}
    */
    processed_entry_point_prototype() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.processedshaderinfo_processed_entry_point_prototype(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(r0, r1);
        }
    }
    /**
    * @returns {string}
    */
    forward_type_declarations() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.processedshaderinfo_forward_type_declarations(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(r0, r1);
        }
    }
    /**
    * @returns {string}
    */
    invocation_code() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.processedshaderinfo_invocation_code(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(r0, r1);
        }
    }
    /**
    * @returns {string}
    */
    packing_code() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.processedshaderinfo_packing_code(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(r0, r1);
        }
    }
    /**
    * @returns {string}
    */
    unpacking_code() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.processedshaderinfo_unpacking_code(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(r0, r1);
        }
    }
    /**
    * @returns {Uint32Array}
    */
    global_variables() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.processedshaderinfo_global_variables(retptr, this.ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var v0 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_free(r0, r1 * 4);
            return v0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}

export function __wbindgen_string_new(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return addHeapObject(ret);
};

export function __wbindgen_object_drop_ref(arg0) {
    takeObject(arg0);
};

export function __wbg_new_abda76e883ba8a5f() {
    const ret = new Error();
    return addHeapObject(ret);
};

export function __wbg_stack_658279fe44541cf6(arg0, arg1) {
    const ret = getObject(arg1).stack;
    const ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len0;
    getInt32Memory0()[arg0 / 4 + 0] = ptr0;
};

export function __wbg_error_f851667af71bcfc6(arg0, arg1) {
    try {
        console.error(getStringFromWasm0(arg0, arg1));
    } finally {
        wasm.__wbindgen_free(arg0, arg1);
    }
};

export function __wbg_log_7bb108d119bafbc1(arg0) {
    console.log(getObject(arg0));
};

export function __wbindgen_throw(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
};

