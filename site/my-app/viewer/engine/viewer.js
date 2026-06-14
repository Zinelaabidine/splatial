import { cameras as defaultCameras } from "@/config/defaultCameras";
import { vertexShaderSource, fragmentShaderSource } from "@/engine/shaders";
import { createViewerControls } from "@/hooks/viewer/useViewerControls";
import {
  getProjectionMatrix,
  getViewMatrix,
  multiply4,
} from "@/math/matrix4x4";

let viewMatrix = null;
let _overrideMatrix = null;
let _controls = null;

async function main(splatUrl) {
  const url = splatUrl;

  console.log("[Viewer] Fetching splat/ply from URL:", url);
  console.log(
    "[Viewer] URL type:",
    typeof url,
    "Is string:",
    typeof url === "string",
  );

  let req;
  try {
    req = await fetch(url, {
      mode: "cors",
      credentials: "omit",
    });
    console.log("[Viewer] Fetch response:", {
      status: req.status,
      statusText: req.statusText,
      ok: req.ok,
      headers: Object.fromEntries([...req.headers.entries()]),
      url: req.url,
    });
  } catch (fetchErr) {
    console.error("[Viewer] Fetch failed:", fetchErr);
    throw new Error(`Failed to fetch: ${fetchErr.message}. URL: ${url}`);
  }

  if (req.status != 200)
    throw new Error(req.status + " Unable to load " + req.url);

  const rowLength = 3 * 4 + 3 * 4 + 4 + 4;
  const reader = req.body.getReader();
  let splatData = new Uint8Array(req.headers.get("content-length"));

  const downloadOverlay = document.getElementById("download-overlay");
  const downloadFill = document.getElementById("download-bar-fill");
  const downloadPercent = document.getElementById("download-percentage");
  if (downloadOverlay) downloadOverlay.style.display = "flex";

  const downsample =
    splatData.length / rowLength > 500000 ? 1 : 1 / devicePixelRatio;
  console.log(splatData.length / rowLength, downsample);

  const worker = new Worker(
    new URL("../../workers/splatSorter.worker.ts", import.meta.url),
    { type: "module" },
  );

  const canvas = document.getElementById("canvas");
  const fps = document.getElementById("fps");

  let projectionMatrix;
  let camera = defaultCameras[0];

  const gl = canvas.getContext("webgl2", {
    antialias: false,
  });

  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vertexShaderSource);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS))
    console.error(gl.getShaderInfoLog(vertexShader));

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS))
    console.error(gl.getShaderInfoLog(fragmentShader));

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.useProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    console.error(gl.getProgramInfoLog(program));

  gl.disable(gl.DEPTH_TEST);

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(
    gl.ONE_MINUS_DST_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_DST_ALPHA,
    gl.ONE,
  );
  gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);

  const u_projection = gl.getUniformLocation(program, "projection");
  const u_viewport = gl.getUniformLocation(program, "viewport");
  const u_focal = gl.getUniformLocation(program, "focal");
  const u_view = gl.getUniformLocation(program, "view");

  const triangleVertices = new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]);
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, triangleVertices, gl.STATIC_DRAW);
  const a_position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(a_position);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  var u_textureLocation = gl.getUniformLocation(program, "u_texture");
  gl.uniform1i(u_textureLocation, 0);

  const indexBuffer = gl.createBuffer();
  const a_index = gl.getAttribLocation(program, "index");
  gl.enableVertexAttribArray(a_index);
  gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
  gl.vertexAttribIPointer(a_index, 1, gl.INT, false, 0, 0);
  gl.vertexAttribDivisor(a_index, 1);

  _controls = createViewerControls(canvas);
  viewMatrix = _controls.getState().viewMatrix;

  const resize = () => {
    camera = _controls.getState().camera;
    gl.uniform2fv(u_focal, new Float32Array([camera.fx, camera.fy]));

    projectionMatrix = getProjectionMatrix(
      camera.fx,
      camera.fy,
      innerWidth,
      innerHeight,
    );

    gl.uniform2fv(u_viewport, new Float32Array([innerWidth, innerHeight]));

    gl.canvas.width = Math.round(innerWidth / downsample);
    gl.canvas.height = Math.round(innerHeight / downsample);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.uniformMatrix4fv(u_projection, false, projectionMatrix);
  };

  window.addEventListener("resize", resize);
  resize();

  worker.onmessage = (e) => {
    if (e.data.buffer) {
      splatData = new Uint8Array(e.data.buffer);
      if (e.data.save) {
        const blob = new Blob([splatData.buffer], {
          type: "application/octet-stream",
        });
        const link = document.createElement("a");
        link.download = "model.splat";
        link.href = URL.createObjectURL(blob);
        document.body.appendChild(link);
        link.click();
      }
    } else if (e.data.texdata) {
      const { texdata, texwidth, texheight } = e.data;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        gl.CLAMP_TO_EDGE,
      );
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_T,
        gl.CLAMP_TO_EDGE,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32UI,
        texwidth,
        texheight,
        0,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_INT,
        texdata,
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    } else if (e.data.depthIndex) {
      const { depthIndex } = e.data;
      gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, depthIndex, gl.DYNAMIC_DRAW);
      vertexCount = e.data.vertexCount;
    }
  };

  let vertexCount = 0;

  let lastFrame = 0;
  let avgFps = 0;
  let carouselStart = 0;
  _controls.setCarouselStart(carouselStart);

  const frame = (now) => {
    const controlState = _controls.tickFrame(now, _overrideMatrix);
    viewMatrix = controlState.viewMatrix;
    const { actualViewMatrix } = controlState;

    const viewProj = multiply4(projectionMatrix, actualViewMatrix);
    worker.postMessage({ view: viewProj });

    const currentFps = 1000 / (now - lastFrame) || 0;
    avgFps = avgFps * 0.9 + currentFps * 0.1;

    if (vertexCount > 0) {
      document.getElementById("spinner").style.display = "none";
      gl.uniformMatrix4fv(u_view, false, actualViewMatrix);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, vertexCount);
    } else {
      gl.clear(gl.COLOR_BUFFER_BIT);
      document.getElementById("spinner").style.display = "";
      carouselStart = Date.now() + 2000;
      _controls.setCarouselStart(carouselStart);
    }
    const progress = (100 * vertexCount) / (splatData.length / rowLength);
    if (progress < 100) {
      document.getElementById("progress").style.width = progress + "%";
    } else {
      document.getElementById("progress").style.display = "none";
    }
    fps.innerText = Math.round(avgFps) + " fps";
    lastFrame = now;
    requestAnimationFrame(frame);
  };

  frame();

  const isPly = (splatDataBuf) =>
    splatDataBuf[0] == 112 &&
    splatDataBuf[1] == 108 &&
    splatDataBuf[2] == 121 &&
    splatDataBuf[3] == 10;

  const selectFile = (file) => {
    const fr = new FileReader();
    if (/\.json$/i.test(file.name)) {
      fr.onload = () => {
        _controls.setCameras(JSON.parse(fr.result));
        camera = _controls.getState().camera;
        viewMatrix = _controls.getState().viewMatrix;
        projectionMatrix = getProjectionMatrix(
          camera.fx / downsample,
          camera.fy / downsample,
          canvas.width,
          canvas.height,
        );
        gl.uniformMatrix4fv(u_projection, false, projectionMatrix);

        console.log("Loaded Cameras");
      };
      fr.readAsText(file);
    } else {
      stopLoading = true;
      fr.onload = () => {
        splatData = new Uint8Array(fr.result);
        console.log("Loaded", Math.floor(splatData.length / rowLength));

        if (isPly(splatData)) {
          worker.postMessage({ ply: splatData.buffer, save: true });
        } else {
          worker.postMessage({
            buffer: splatData.buffer,
            vertexCount: Math.floor(splatData.length / rowLength),
          });
        }
      };
      fr.readAsArrayBuffer(file);
    }
  };

  const preventDefault = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener("dragenter", preventDefault);
  document.addEventListener("dragover", preventDefault);
  document.addEventListener("dragleave", preventDefault);
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectFile(e.dataTransfer.files[0]);
  });

  let bytesRead = 0;
  let lastVertexCount = -1;
  let stopLoading = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done || stopLoading) break;

    splatData.set(value, bytesRead);
    bytesRead += value.length;

    try {
      if (downloadFill && splatData.length) {
        const percentBytes = Math.min(
          100,
          Math.floor((bytesRead / splatData.length) * 100),
        );
        downloadFill.style.width = percentBytes + "%";
        if (downloadPercent)
          downloadPercent.innerText = `Downloading… ${percentBytes}%`;
      }
    } catch {}

    if (vertexCount > lastVertexCount) {
      if (!isPly(splatData)) {
        worker.postMessage({
          buffer: splatData.buffer,
          vertexCount: Math.floor(bytesRead / rowLength),
        });
      }
      lastVertexCount = vertexCount;
    }
  }
  if (!stopLoading) {
    if (isPly(splatData)) {
      worker.postMessage({ ply: splatData.buffer, save: false });
    } else {
      worker.postMessage({
        buffer: splatData.buffer,
        vertexCount: Math.floor(bytesRead / rowLength),
      });
    }
    try {
      if (downloadOverlay) downloadOverlay.style.display = "none";
    } catch {}
  }
}

let viewerStarted = false;

export async function startViewer(splatUrl) {
  if (viewerStarted) return;
  viewerStarted = true;
  try {
    await main(splatUrl);
  } catch (err) {
    const spinnerEl = document.getElementById("spinner");
    if (spinnerEl) spinnerEl.style.display = "none";
    const messageEl = document.getElementById("message");
    if (messageEl) messageEl.innerText = err.toString();
    const downloadOverlay = document.getElementById("download-overlay");
    if (downloadOverlay) downloadOverlay.style.display = "none";
    console.error(err);
  }
}

export function stopViewer() {
  viewerStarted = false;
  if (_controls) {
    _controls.dispose();
    _controls = null;
  }
}

// ─── Camera trajectory API ───────────────────────────────────────────────────

/** Returns a snapshot of the current view matrix (16-element column-major array). */
export function readViewMatrix() {
  return viewMatrix ? viewMatrix.slice() : null;
}

/** Overrides the view matrix every frame for trajectory playback. Pass null to release. */
export function setViewMatrix(m) {
  _overrideMatrix = m ? [...m] : null;
}

/** Alias for setViewMatrix — external camera matrix update API. */
export function updateCameraMatrix(m) {
  setViewMatrix(m);
}

/** Releases any external view matrix override, returning camera control to the user. */
export function clearViewMatrix() {
  _overrideMatrix = null;
}
