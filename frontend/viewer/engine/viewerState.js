import { cameras as defaultCameras, defaultViewMatrix } from "@/config/defaultCameras";
import { createViewerControls } from "@/hooks/viewer/useViewerControls";
import { getProjectionMatrix, multiply4 } from "@/math/matrix4x4";
import { createViewerEngine } from "./viewerEngine";

let viewMatrix = null;
let _overrideMatrix = null;
let _controls = null;
let viewerStarted = false;

/** @type {{ disposed: boolean, rafId: number | null, worker: Worker | null, onResize: (() => void) | null, preventDefault: ((e: Event) => void) | null, onDrop: ((e: DragEvent) => void) | null } | null} */
let _session = null;

function disposeViewerSession() {
  if (!_session) return;

  _session.disposed = true;

  if (_session.rafId !== null) {
    cancelAnimationFrame(_session.rafId);
    _session.rafId = null;
  }

  if (_session.worker) {
    _session.worker.terminate();
    _session.worker = null;
  }

  if (_session.onResize) {
    window.removeEventListener("resize", _session.onResize);
    _session.onResize = null;
  }

  if (_session.preventDefault) {
    document.removeEventListener("dragenter", _session.preventDefault);
    document.removeEventListener("dragover", _session.preventDefault);
    document.removeEventListener("dragleave", _session.preventDefault);
    _session.preventDefault = null;
  }

  if (_session.onDrop) {
    document.removeEventListener("drop", _session.onDrop);
    _session.onDrop = null;
  }

  _session = null;
}

export function getViewMatrixSnapshot() {
  return viewMatrix ? viewMatrix.slice() : null;
}

export function setOverrideMatrix(m) {
  _overrideMatrix = m ? [...m] : null;
}

export function clearOverrideMatrix() {
  _overrideMatrix = null;
}

/** Jump the live camera to a saved view matrix and return control to the user. */
export function applyViewMatrix(m) {
  if (!_controls || !Array.isArray(m) || m.length !== 16) return;
  clearOverrideMatrix();
  _controls.setViewMatrix(m);
}

export function isViewerStarted() {
  return viewerStarted;
}

/**
 * Recovers a lost camera: clears any trajectory override and snaps the live
 * view back to the scene's default matrix. Wired to the dock's "Home"
 * button — a single drag can otherwise send the camera outside the
 * reconstructed splat volume with no other way back short of reloading.
 */
export function resetView() {
  if (!_controls) return;
  clearOverrideMatrix();
  _controls.setViewMatrix(defaultViewMatrix);
}

export function setViewerStarted(value) {
  viewerStarted = value;
}

export function disposeControls() {
  disposeViewerSession();
  if (_controls) {
    _controls.dispose();
    _controls = null;
  }
}

export async function runViewer(splatUrl) {
  disposeViewerSession();
  const session = {
    disposed: false,
    rafId: null,
    worker: null,
    onResize: null,
    preventDefault: null,
    onDrop: null,
  };
  _session = session;

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

  if (session.disposed) return;

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
  session.worker = worker;

  const canvas = document.getElementById("canvas");

  let projectionMatrix;
  let camera = defaultCameras[0];

  const engine = createViewerEngine(canvas);

  _controls = createViewerControls(canvas);
  viewMatrix = _controls.getState().viewMatrix;

  const resize = () => {
    if (session.disposed || !_controls) return;
    camera = _controls.getState().camera;
    projectionMatrix = engine.resize(camera, downsample);
  };

  session.onResize = resize;
  window.addEventListener("resize", resize);
  resize();

  let vertexCount = 0;

  worker.onmessage = (e) => {
    if (session.disposed) return;
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
      engine.uploadTexture(texdata, texwidth, texheight);
    } else if (e.data.depthIndex) {
      const { depthIndex } = e.data;
      engine.uploadIndexBuffer(depthIndex);
      vertexCount = e.data.vertexCount;
    }
  };

  let carouselStart = 0;
  _controls.setCarouselStart(carouselStart);

  const frame = (now) => {
    if (session.disposed || !_controls) return;

    const controlState = _controls.tickFrame(now, _overrideMatrix);
    viewMatrix = controlState.viewMatrix;
    const { actualViewMatrix } = controlState;

    const viewProj = multiply4(projectionMatrix, actualViewMatrix);
    worker.postMessage({ view: viewProj });

    const spinnerEl = document.getElementById("spinner");
    const progressEl = document.getElementById("progress");

    if (vertexCount > 0) {
      if (spinnerEl) spinnerEl.style.display = "none";
      engine.drawSplats(actualViewMatrix, vertexCount);
    } else {
      engine.clear();
      if (spinnerEl) spinnerEl.style.display = "";
      carouselStart = Date.now() + 2000;
      _controls.setCarouselStart(carouselStart);
    }
    const progress = (100 * vertexCount) / (splatData.length / rowLength);
    if (progressEl) {
      if (progress < 100) {
        progressEl.style.width = progress + "%";
      } else {
        progressEl.style.display = "none";
      }
    }
    if (!session.disposed) {
      session.rafId = requestAnimationFrame(frame);
    }
  };

  frame();

  if (session.disposed) return;

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
        engine.setProjectionMatrix(projectionMatrix);

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
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectFile(e.dataTransfer.files[0]);
  };
  session.preventDefault = preventDefault;
  session.onDrop = onDrop;
  document.addEventListener("dragenter", preventDefault);
  document.addEventListener("dragover", preventDefault);
  document.addEventListener("dragleave", preventDefault);
  document.addEventListener("drop", onDrop);

  let bytesRead = 0;
  let lastVertexCount = -1;
  let stopLoading = false;

  while (true) {
    if (session.disposed) break;
    const { done, value } = await reader.read();
    if (done || stopLoading || session.disposed) break;

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
