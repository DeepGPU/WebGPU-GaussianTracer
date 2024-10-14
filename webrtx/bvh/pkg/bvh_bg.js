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

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
    return instance.ptr;
}
/**
* @param {number} blas_descriptor_buffer_id
* @returns {BuiltBvh}
*/
export function build_blas(blas_descriptor_buffer_id) {
    const ret = wasm.build_blas(blas_descriptor_buffer_id);
    return BuiltBvh.__wrap(ret);
}

/**
* @param {number} tlas_descriptor_buffer_id
* @returns {BuiltBvh}
*/
export function build_tlas(tlas_descriptor_buffer_id) {
    const ret = wasm.build_tlas(tlas_descriptor_buffer_id);
    return BuiltBvh.__wrap(ret);
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

let cachedInt32Memory0 = null;

function getInt32Memory0() {
    if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
        cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32Memory0;
}
/**
*/
export class BuiltBvh {

    static __wrap(ptr) {
        const obj = Object.create(BuiltBvh.prototype);
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
        wasm.__wbg_builtbvh_free(ptr);
    }
    /**
    * @returns {StagingBuffer}
    */
    get serialized() {
        const ret = wasm.__wbg_get_builtbvh_serialized(this.ptr);
        return StagingBuffer.__wrap(ret);
    }
    /**
    * @param {StagingBuffer} arg0
    */
    set serialized(arg0) {
        _assertClass(arg0, StagingBuffer);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_builtbvh_serialized(this.ptr, ptr0);
    }
    /**
    * @returns {number}
    */
    get num_nodes() {
        const ret = wasm.__wbg_get_builtbvh_num_nodes(this.ptr);
        return ret >>> 0;
    }
    /**
    * @param {number} arg0
    */
    set num_nodes(arg0) {
        wasm.__wbg_set_builtbvh_num_nodes(this.ptr, arg0);
    }
}
/**
*/
export class StagingBuffer {

    static __wrap(ptr) {
        const obj = Object.create(StagingBuffer.prototype);
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
        wasm.__wbg_stagingbuffer_free(ptr);
    }
    /**
    * @returns {number}
    */
    get id() {
        const ret = wasm.__wbg_get_stagingbuffer_id(this.ptr);
        return ret >>> 0;
    }
    /**
    * @param {number} arg0
    */
    set id(arg0) {
        wasm.__wbg_set_stagingbuffer_id(this.ptr, arg0);
    }
    /**
    */
    free() {
        wasm.stagingbuffer_free(this.ptr);
    }
    /**
    * @returns {any}
    */
    u8_view() {
        const ret = wasm.stagingbuffer_u8_view(this.ptr);
        return takeObject(ret);
    }
    /**
    * @param {number} byte_length
    */
    constructor(byte_length) {
        const ret = wasm.stagingbuffer_new(byte_length);
        return StagingBuffer.__wrap(ret);
    }
}

export function __wbindgen_string_new(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return addHeapObject(ret);
};

export function __wbindgen_object_drop_ref(arg0) {
    takeObject(arg0);
};

export function __wbg_debug_8db2eed1bf6c1e2a(arg0) {
    console.debug(getObject(arg0));
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

export function __wbg_buffer_cf65c07de34b9a08(arg0) {
    const ret = getObject(arg0).buffer;
    return addHeapObject(ret);
};

export function __wbg_newwithbyteoffsetandlength_9fb2f11355ecadf5(arg0, arg1, arg2) {
    const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
};

export function __wbindgen_throw(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
};

export function __wbindgen_memory() {
    const ret = wasm.memory;
    return addHeapObject(ret);
};

