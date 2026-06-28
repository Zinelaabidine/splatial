/// <reference lib="webworker" />

let buffer: ArrayBuffer | undefined;
let vertexCount = 0;
let viewProj: Float32Array | number[] | undefined;
// 6*4 + 4 + 4 = 8*4
// XYZ - Position (Float32)
// XYZ - Scale (Float32)
// RGBA - colors (uint8)
// IJKL - quaternion/rot (uint8)
const rowLength = 3 * 4 + 3 * 4 + 4 + 4;
let lastProj: number[] = [];
let depthIndex = new Uint32Array();
let lastVertexCount = 0;

const _floatView = new Float32Array(1);
const _int32View = new Int32Array(_floatView.buffer);

function floatToHalf(float: number): number {
  _floatView[0] = float;
  const f = _int32View[0];

  const sign = (f >> 31) & 0x0001;
  const exp = (f >> 23) & 0x00ff;
  let frac = f & 0x007fffff;

  let newExp: number;
  if (exp == 0) {
    newExp = 0;
  } else if (exp < 113) {
    newExp = 0;
    frac |= 0x00800000;
    frac = frac >> (113 - exp);
    if (frac & 0x01000000) {
      newExp = 1;
      frac = 0;
    }
  } else if (exp < 142) {
    newExp = exp - 112;
  } else {
    newExp = 31;
    frac = 0;
  }

  return (sign << 15) | (newExp << 10) | (frac >> 13);
}

function packHalf2x16(x: number, y: number): number {
  return (floatToHalf(x) | (floatToHalf(y) << 16)) >>> 0;
}

function generateTexture() {
  if (!buffer) return;
  const f_buffer = new Float32Array(buffer);
  const u_buffer = new Uint8Array(buffer);

  const texwidth = 1024 * 2;
  const texheight = Math.ceil((2 * vertexCount) / texwidth);
  const texdata = new Uint32Array(texwidth * texheight * 4);
  const texdata_c = new Uint8Array(texdata.buffer);
  const texdata_f = new Float32Array(texdata.buffer);

  for (let i = 0; i < vertexCount; i++) {
    texdata_f[8 * i + 0] = f_buffer[8 * i + 0];
    texdata_f[8 * i + 1] = f_buffer[8 * i + 1];
    texdata_f[8 * i + 2] = f_buffer[8 * i + 2];

    texdata_c[4 * (8 * i + 7) + 0] = u_buffer[32 * i + 24 + 0];
    texdata_c[4 * (8 * i + 7) + 1] = u_buffer[32 * i + 24 + 1];
    texdata_c[4 * (8 * i + 7) + 2] = u_buffer[32 * i + 24 + 2];
    texdata_c[4 * (8 * i + 7) + 3] = u_buffer[32 * i + 24 + 3];

    const scale = [
      f_buffer[8 * i + 3 + 0],
      f_buffer[8 * i + 3 + 1],
      f_buffer[8 * i + 3 + 2],
    ];
    const rot = [
      (u_buffer[32 * i + 28 + 0] - 128) / 128,
      (u_buffer[32 * i + 28 + 1] - 128) / 128,
      (u_buffer[32 * i + 28 + 2] - 128) / 128,
      (u_buffer[32 * i + 28 + 3] - 128) / 128,
    ];

    const M = [
      1.0 - 2.0 * (rot[2] * rot[2] + rot[3] * rot[3]),
      2.0 * (rot[1] * rot[2] + rot[0] * rot[3]),
      2.0 * (rot[1] * rot[3] - rot[0] * rot[2]),

      2.0 * (rot[1] * rot[2] - rot[0] * rot[3]),
      1.0 - 2.0 * (rot[1] * rot[1] + rot[3] * rot[3]),
      2.0 * (rot[2] * rot[3] + rot[0] * rot[1]),

      2.0 * (rot[1] * rot[3] + rot[0] * rot[2]),
      2.0 * (rot[2] * rot[3] - rot[0] * rot[1]),
      1.0 - 2.0 * (rot[1] * rot[1] + rot[2] * rot[2]),
    ].map((k, i) => k * scale[Math.floor(i / 3)]);

    const sigma = [
      M[0] * M[0] + M[3] * M[3] + M[6] * M[6],
      M[0] * M[1] + M[3] * M[4] + M[6] * M[7],
      M[0] * M[2] + M[3] * M[5] + M[6] * M[8],
      M[1] * M[1] + M[4] * M[4] + M[7] * M[7],
      M[1] * M[2] + M[4] * M[5] + M[7] * M[8],
      M[2] * M[2] + M[5] * M[5] + M[8] * M[8],
    ];

    texdata[8 * i + 4] = packHalf2x16(4 * sigma[0], 4 * sigma[1]);
    texdata[8 * i + 5] = packHalf2x16(4 * sigma[2], 4 * sigma[3]);
    texdata[8 * i + 6] = packHalf2x16(4 * sigma[4], 4 * sigma[5]);
  }

  self.postMessage({ texdata, texwidth, texheight }, [texdata.buffer]);
}

function runSort(viewProjIn: Float32Array | number[]) {
  if (!buffer) return;
  const f_buffer = new Float32Array(buffer);
  if (lastVertexCount == vertexCount) {
    const dot =
      lastProj[2] * viewProjIn[2] +
      lastProj[6] * viewProjIn[6] +
      lastProj[10] * viewProjIn[10];
    if (Math.abs(dot - 1) < 0.01) {
      return;
    }
  } else {
    generateTexture();
    lastVertexCount = vertexCount;
  }

  console.time("sort");
  let maxDepth = -Infinity;
  let minDepth = Infinity;
  const sizeList = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const depth =
      ((viewProjIn[2] * f_buffer[8 * i + 0] +
        viewProjIn[6] * f_buffer[8 * i + 1] +
        viewProjIn[10] * f_buffer[8 * i + 2]) *
        4096) |
      0;
    sizeList[i] = depth;
    if (depth > maxDepth) maxDepth = depth;
    if (depth < minDepth) minDepth = depth;
  }

  const depthInv = (256 * 256 - 1) / (maxDepth - minDepth);
  const counts0 = new Uint32Array(256 * 256);
  for (let i = 0; i < vertexCount; i++) {
    sizeList[i] = ((sizeList[i] - minDepth) * depthInv) | 0;
    counts0[sizeList[i]]++;
  }
  const starts0 = new Uint32Array(256 * 256);
  for (let i = 1; i < 256 * 256; i++)
    starts0[i] = starts0[i - 1] + counts0[i - 1];
  depthIndex = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++)
    depthIndex[starts0[sizeList[i]]++] = i;

  console.timeEnd("sort");

  lastProj = viewProjIn as number[];
  self.postMessage({ depthIndex, viewProj: viewProjIn, vertexCount }, [
    depthIndex.buffer,
  ]);
}

function processPlyBuffer(inputBuffer: ArrayBuffer) {
  const ubuf = new Uint8Array(inputBuffer);
  const header = new TextDecoder().decode(ubuf.slice(0, 1024 * 10));
  const header_end = "end_header\n";
  const header_end_index = header.indexOf(header_end);
  if (header_end_index < 0)
    throw new Error("Unable to read .ply file header");
  const vertexCountLocal = parseInt(
    /element vertex (\d+)\n/.exec(header)![1],
  );
  console.log("Vertex Count", vertexCountLocal);
  let row_offset = 0;
  const offsets: Record<string, number> = {};
  const types: Record<string, string> = {};
  const TYPE_MAP: Record<string, string> = {
    double: "getFloat64",
    int: "getInt32",
    uint: "getUint32",
    float: "getFloat32",
    short: "getInt16",
    ushort: "getUint16",
    uchar: "getUint8",
  };
  for (const prop of header
    .slice(0, header_end_index)
    .split("\n")
    .filter((k) => k.startsWith("property "))) {
    const [, type, name] = prop.split(" ");
    const arrayType = TYPE_MAP[type] || "getInt8";
    types[name] = arrayType;
    offsets[name] = row_offset;
    row_offset += parseInt(arrayType.replace(/[^\d]/g, "")) / 8;
  }
  console.log("Bytes per row", row_offset, types, offsets);

  const dataView = new DataView(
    inputBuffer,
    header_end_index + header_end.length,
  );
  let row = 0;
  const attrs: Record<string, number> = new Proxy(
    {} as Record<string, number>,
    {
      get(_target, prop: string) {
        if (!types[prop]) throw new Error(prop + " not found");
        return (dataView[types[prop] as keyof DataView] as (
          byteOffset: number,
          littleEndian?: boolean,
        ) => number)(row * row_offset + offsets[prop], true);
      },
    },
  );

  console.time("calculate importance");
  const sizeList = new Float32Array(vertexCountLocal);
  const sizeIndex = new Uint32Array(vertexCountLocal);
  for (row = 0; row < vertexCountLocal; row++) {
    sizeIndex[row] = row;
    if (!types["scale_0"]) continue;
    const size =
      Math.exp(attrs.scale_0) *
      Math.exp(attrs.scale_1) *
      Math.exp(attrs.scale_2);
    const opacity = 1 / (1 + Math.exp(-attrs.opacity));
    sizeList[row] = size * opacity;
  }
  console.timeEnd("calculate importance");

  console.time("sort");
  sizeIndex.sort((b, a) => sizeList[a] - sizeList[b]);
  console.timeEnd("sort");

  const bufferOut = new ArrayBuffer(rowLength * vertexCountLocal);

  console.time("build buffer");
  for (let j = 0; j < vertexCountLocal; j++) {
    row = sizeIndex[j];

    const position = new Float32Array(bufferOut, j * rowLength, 3);
    const scales = new Float32Array(bufferOut, j * rowLength + 4 * 3, 3);
    const rgba = new Uint8ClampedArray(
      bufferOut,
      j * rowLength + 4 * 3 + 4 * 3,
      4,
    );
    const rot = new Uint8ClampedArray(
      bufferOut,
      j * rowLength + 4 * 3 + 4 * 3 + 4,
      4,
    );

    if (types["scale_0"]) {
      const qlen = Math.sqrt(
        attrs.rot_0 ** 2 +
          attrs.rot_1 ** 2 +
          attrs.rot_2 ** 2 +
          attrs.rot_3 ** 2,
      );

      rot[0] = (attrs.rot_0 / qlen) * 128 + 128;
      rot[1] = (attrs.rot_1 / qlen) * 128 + 128;
      rot[2] = (attrs.rot_2 / qlen) * 128 + 128;
      rot[3] = (attrs.rot_3 / qlen) * 128 + 128;

      scales[0] = Math.exp(attrs.scale_0);
      scales[1] = Math.exp(attrs.scale_1);
      scales[2] = Math.exp(attrs.scale_2);
    } else {
      scales[0] = 0.01;
      scales[1] = 0.01;
      scales[2] = 0.01;

      rot[0] = 255;
      rot[1] = 0;
      rot[2] = 0;
      rot[3] = 0;
    }

    position[0] = attrs.x;
    position[1] = attrs.y;
    position[2] = attrs.z;

    if (types["f_dc_0"]) {
      const SH_C0 = 0.28209479177387814;
      rgba[0] = (0.5 + SH_C0 * attrs.f_dc_0) * 255;
      rgba[1] = (0.5 + SH_C0 * attrs.f_dc_1) * 255;
      rgba[2] = (0.5 + SH_C0 * attrs.f_dc_2) * 255;
    } else {
      rgba[0] = attrs.red;
      rgba[1] = attrs.green;
      rgba[2] = attrs.blue;
    }
    if (types["opacity"]) {
      rgba[3] = (1 / (1 + Math.exp(-attrs.opacity))) * 255;
    } else {
      rgba[3] = 255;
    }
  }
  console.timeEnd("build buffer");
  return bufferOut;
}

let sortRunning: boolean | undefined;

const throttledSort = () => {
  if (!sortRunning) {
    sortRunning = true;
    const lastView = viewProj;
    if (lastView) runSort(lastView);
    setTimeout(() => {
      sortRunning = false;
      if (lastView !== viewProj && viewProj) {
        throttledSort();
      }
    }, 0);
  }
};

self.onmessage = (e: MessageEvent) => {
  if (e.data.ply) {
    vertexCount = 0;
    if (viewProj) runSort(viewProj);
    buffer = processPlyBuffer(e.data.ply);
    vertexCount = Math.floor(buffer.byteLength / rowLength);
    postMessage({ buffer: buffer, save: !!e.data.save });
  } else if (e.data.buffer) {
    buffer = e.data.buffer;
    vertexCount = e.data.vertexCount;
  } else if (e.data.vertexCount) {
    vertexCount = e.data.vertexCount;
  } else if (e.data.view) {
    viewProj = e.data.view;
    throttledSort();
  }
};

export {};
