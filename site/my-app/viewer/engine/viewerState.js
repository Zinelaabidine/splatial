import { cameras as defaultCameras } from "@/config/defaultCameras";
import { createViewerControls } from "@/hooks/viewer/useViewerControls";
import { getProjectionMatrix, multiply4 } from "@/math/matrix4x4";
import { createViewerEngine } from "./viewerEngine";

let viewMatrix = null;
let _overrideMatrix = null;
let _controls = null;
let viewerStarted = false;

export function getViewMatrixSnapshot() {
  return viewMatrix ? viewMatrix.slice() : null;
}

export function setOverrideMatrix(m) {
  _overrideMatrix = m ? [...m] : null;
}

export function clearOverrideMatrix() {
  _overrideMatrix = null;
}

export function isViewerStarted() {
  return viewerStarted;
}

export function setViewerStarted(value) {
  viewerStarted = value;
}

export function disposeControls() {
  if (_controls) {
    _controls.dispose();
    _controls = null;
  }
}

export async function runViewer(splatUrl) {
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

  const engine = createViewerEngine(canvas);

  _controls = createViewerControls(canvas);
  viewMatrix = _controls.getState().viewMatrix;

  const resize = () => {
    camera = _controls.getState().camera;
    projectionMatrix = engine.resize(camera, downsample);
  };

  window.addEventListener("resize", resize);
  resize();

  let vertexCount = 0;

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
      engine.uploadTexture(texdata, texwidth, texheight);
    } else if (e.data.depthIndex) {
      const { depthIndex } = e.data;
      engine.uploadIndexBuffer(depthIndex);
      vertexCount = e.data.vertexCount;
    }
  };

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
      engine.drawSplats(actualViewMatrix, vertexCount);
    } else {
      engine.clear();
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
