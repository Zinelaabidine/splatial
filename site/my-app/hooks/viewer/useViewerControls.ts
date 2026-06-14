import { useEffect, useRef, useState, type RefObject } from "react";
import {
  cameras as defaultCameras,
  defaultViewMatrix,
  type CameraBlueprint,
} from "@/config/defaultCameras";
import {
  getViewMatrix,
  invert4,
  rotate4,
  translate4,
  type Matrix4,
} from "@/math/matrix4x4";

export type ViewerControlState = {
  viewMatrix: Matrix4;
  actualViewMatrix: Matrix4;
  carousel: boolean;
  camera: CameraBlueprint;
  currentCameraIndex: number;
  jumpDelta: number;
};

export type ViewerControlsOptions = {
  initialViewMatrix?: Matrix4;
  onCamIdChange?: (label: string) => void;
};

export type ViewerControlsHandle = {
  getState: () => ViewerControlState;
  /** Per-frame keyboard / gamepad / carousel update. Call once per rAF tick. */
  tickFrame: (now: number, overrideMatrix: Matrix4 | null) => ViewerControlState;
  setViewMatrix: (m: Matrix4) => void;
  setCameras: (next: CameraBlueprint[]) => void;
  getCameras: () => CameraBlueprint[];
  setCarouselStart: (t: number) => void;
  dispose: () => void;
};

/**
 * Imperative controls manager used by the WebGL engine.
 * Attaches DOM listeners to `canvas` and computes camera matrices without
 * touching WebGL state.
 */
export function createViewerControls(
  canvas: HTMLCanvasElement,
  options: ViewerControlsOptions = {},
): ViewerControlsHandle {
  let cameras = [...defaultCameras];
  let camera = cameras[0];
  let viewMatrix: Matrix4 = options.initialViewMatrix
    ? [...options.initialViewMatrix]
    : [...defaultViewMatrix];
  let carousel = true;

  try {
    viewMatrix = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    carousel = false;
  } catch {
    // keep defaults
  }

  let currentCameraIndex = 0;
  let activeKeys: string[] = [];
  let startX = 0;
  let startY = 0;
  let down: number | false = false;
  let altX = 0;
  let altY = 0;
  let jumpDelta = 0;
  let carouselStart = 0;
  let leftGamepadTrigger: boolean | undefined;
  let rightGamepadTrigger: boolean | undefined;

  const camidEl = document.getElementById("camid");

  const updateCamId = (label: string) => {
    if (camidEl) camidEl.innerText = label;
    options.onCamIdChange?.(label);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    carousel = false;
    if (!activeKeys.includes(e.code)) activeKeys.push(e.code);
    if (/\d/.test(e.key)) {
      currentCameraIndex = parseInt(e.key);
      camera = cameras[currentCameraIndex];
      viewMatrix = getViewMatrix(camera);
    }
    if (["-", "_"].includes(e.key)) {
      currentCameraIndex =
        (currentCameraIndex + cameras.length - 1) % cameras.length;
      viewMatrix = getViewMatrix(cameras[currentCameraIndex]);
    }
    if (["+", "="].includes(e.key)) {
      currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
      viewMatrix = getViewMatrix(cameras[currentCameraIndex]);
    }
    updateCamId("cam  " + currentCameraIndex);
    if (e.code == "KeyV") {
      location.hash =
        "#" +
        JSON.stringify(
          viewMatrix.map((k) => Math.round(k * 100) / 100),
        );
      updateCamId("");
    } else if (e.code === "KeyP") {
      carousel = true;
      updateCamId("");
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    activeKeys = activeKeys.filter((k) => k !== e.code);
  };

  const onBlur = () => {
    activeKeys = [];
  };

  const onWheel = (e: WheelEvent) => {
    carousel = false;
    e.preventDefault();
    const lineHeight = 10;
    const scale =
      e.deltaMode == 1
        ? lineHeight
        : e.deltaMode == 2
          ? innerHeight
          : 1;
    let inv = invert4(viewMatrix);
    if (!inv) return;
    if (e.shiftKey) {
      inv = translate4(
        inv,
        (e.deltaX * scale) / innerWidth,
        (e.deltaY * scale) / innerHeight,
        0,
      );
    } else if (e.ctrlKey || e.metaKey) {
      inv = translate4(
        inv,
        0,
        0,
        (-10 * (e.deltaY * scale)) / innerHeight,
      );
    } else {
      const d = 4;
      inv = translate4(inv, 0, 0, d);
      inv = rotate4(inv, -(e.deltaX * scale) / innerWidth, 0, 1, 0);
      inv = rotate4(inv, (e.deltaY * scale) / innerHeight, 1, 0, 0);
      inv = translate4(inv, 0, 0, -d);
    }

    const next = invert4(inv);
    if (next) viewMatrix = next;
  };

  const onMouseDown = (e: MouseEvent) => {
    carousel = false;
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    down = e.ctrlKey || e.metaKey ? 2 : 1;
  };

  const onContextMenu = (e: MouseEvent) => {
    carousel = false;
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    down = 2;
  };

  const onMouseMove = (e: MouseEvent) => {
    e.preventDefault();
    if (down == 1) {
      let inv = invert4(viewMatrix);
      if (!inv) return;
      const dx = (5 * (e.clientX - startX)) / innerWidth;
      const dy = (5 * (e.clientY - startY)) / innerHeight;
      const d = 4;

      inv = translate4(inv, 0, 0, d);
      inv = rotate4(inv, dx, 0, 1, 0);
      inv = rotate4(inv, -dy, 1, 0, 0);
      inv = translate4(inv, 0, 0, -d);
      const next = invert4(inv);
      if (next) viewMatrix = next;

      startX = e.clientX;
      startY = e.clientY;
    } else if (down == 2) {
      let inv = invert4(viewMatrix);
      if (!inv) return;
      inv = translate4(
        inv,
        (-10 * (e.clientX - startX)) / innerWidth,
        0,
        (10 * (e.clientY - startY)) / innerHeight,
      );
      const next = invert4(inv);
      if (next) viewMatrix = next;

      startX = e.clientX;
      startY = e.clientY;
    }
  };

  const onMouseUp = (e: MouseEvent) => {
    e.preventDefault();
    down = false;
    startX = 0;
    startY = 0;
  };

  const onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      carousel = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      down = 1;
    } else if (e.touches.length === 2) {
      carousel = false;
      startX = e.touches[0].clientX;
      altX = e.touches[1].clientX;
      startY = e.touches[0].clientY;
      altY = e.touches[1].clientY;
      down = 1;
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && down) {
      let inv = invert4(viewMatrix);
      if (!inv) return;
      const dx = (4 * (e.touches[0].clientX - startX)) / innerWidth;
      const dy = (4 * (e.touches[0].clientY - startY)) / innerHeight;

      const d = 4;
      inv = translate4(inv, 0, 0, d);
      inv = rotate4(inv, dx, 0, 1, 0);
      inv = rotate4(inv, -dy, 1, 0, 0);
      inv = translate4(inv, 0, 0, -d);

      const next = invert4(inv);
      if (next) viewMatrix = next;

      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const dtheta =
        Math.atan2(startY - altY, startX - altX) -
        Math.atan2(
          e.touches[0].clientY - e.touches[1].clientY,
          e.touches[0].clientX - e.touches[1].clientX,
        );
      const dscale =
        Math.hypot(startX - altX, startY - altY) /
        Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      const dx =
        (e.touches[0].clientX +
          e.touches[1].clientX -
          (startX + altX)) /
        2;
      const dy =
        (e.touches[0].clientY +
          e.touches[1].clientY -
          (startY + altY)) /
        2;
      let inv = invert4(viewMatrix);
      if (!inv) return;
      inv = rotate4(inv, dtheta, 0, 0, 1);

      inv = translate4(inv, -dx / innerWidth, -dy / innerHeight, 0);

      inv = translate4(inv, 0, 0, 3 * (1 - dscale));

      const next = invert4(inv);
      if (next) viewMatrix = next;

      startX = e.touches[0].clientX;
      altX = e.touches[1].clientX;
      startY = e.touches[0].clientY;
      altY = e.touches[1].clientY;
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    down = false;
    startX = 0;
    startY = 0;
  };

  const onGamepadConnected = (e: GamepadEvent) => {
    const gp = navigator.getGamepads()[e.gamepad.index];
    if (gp) {
      console.log(
        `Gamepad connected at index ${gp.index}: ${gp.id}. It has ${gp.buttons.length} buttons and ${gp.axes.length} axes.`,
      );
    }
  };

  const onGamepadDisconnected = () => {
    console.log("Gamepad disconnected");
  };

  const onHashChange = () => {
    try {
      viewMatrix = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      carousel = false;
    } catch {
      // ignore
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("gamepadconnected", onGamepadConnected);
  window.addEventListener("gamepaddisconnected", onGamepadDisconnected);
  window.addEventListener("hashchange", onHashChange);

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });

  const buildActualViewMatrix = (vm: Matrix4, jd: number): Matrix4 => {
    let inv2 = invert4(vm);
    if (!inv2) return vm;
    inv2 = translate4(inv2, 0, -jd, 0);
    inv2 = rotate4(inv2, -0.1 * jd, 1, 0, 0);
    const actual = invert4(inv2);
    return actual ?? vm;
  };

  const tickFrame = (
    now: number,
    overrideMatrix: Matrix4 | null,
  ): ViewerControlState => {
    let inv = invert4(viewMatrix);
    if (!inv) {
      return {
        viewMatrix,
        actualViewMatrix: viewMatrix,
        carousel,
        camera,
        currentCameraIndex,
        jumpDelta,
      };
    }

    const shiftKey =
      activeKeys.includes("Shift") ||
      activeKeys.includes("ShiftLeft") ||
      activeKeys.includes("ShiftRight");

    if (activeKeys.includes("ArrowUp")) {
      if (shiftKey) {
        inv = translate4(inv, 0, -0.03, 0);
      } else {
        inv = translate4(inv, 0, 0, 0.1);
      }
    }
    if (activeKeys.includes("ArrowDown")) {
      if (shiftKey) {
        inv = translate4(inv, 0, 0.03, 0);
      } else {
        inv = translate4(inv, 0, 0, -0.1);
      }
    }
    if (activeKeys.includes("ArrowLeft"))
      inv = translate4(inv, -0.03, 0, 0);
    if (activeKeys.includes("ArrowRight"))
      inv = translate4(inv, 0.03, 0, 0);
    if (activeKeys.includes("KeyA")) inv = rotate4(inv, -0.01, 0, 1, 0);
    if (activeKeys.includes("KeyD")) inv = rotate4(inv, 0.01, 0, 1, 0);
    if (activeKeys.includes("KeyQ")) inv = rotate4(inv, 0.01, 0, 0, 1);
    if (activeKeys.includes("KeyE")) inv = rotate4(inv, -0.01, 0, 0, 1);
    if (activeKeys.includes("KeyW")) inv = rotate4(inv, 0.005, 1, 0, 0);
    if (activeKeys.includes("KeyS")) inv = rotate4(inv, -0.005, 1, 0, 0);

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let isJumping = activeKeys.includes("Space");
    for (const gamepad of gamepads) {
      if (!gamepad) continue;

      const axisThreshold = 0.1;
      const moveSpeed = 0.06;
      const rotateSpeed = 0.02;

      if (Math.abs(gamepad.axes[0]) > axisThreshold) {
        inv = translate4(inv, moveSpeed * gamepad.axes[0], 0, 0);
        carousel = false;
      }
      if (Math.abs(gamepad.axes[1]) > axisThreshold) {
        inv = translate4(inv, 0, 0, -moveSpeed * gamepad.axes[1]);
        carousel = false;
      }
      if (gamepad.buttons[12].pressed || gamepad.buttons[13].pressed) {
        inv = translate4(
          inv,
          0,
          -moveSpeed *
            (+gamepad.buttons[12].pressed - +gamepad.buttons[13].pressed),
          0,
        );
        carousel = false;
      }

      if (gamepad.buttons[14].pressed || gamepad.buttons[15].pressed) {
        inv = translate4(
          inv,
          -moveSpeed *
            (+gamepad.buttons[14].pressed - +gamepad.buttons[15].pressed),
          0,
          0,
        );
        carousel = false;
      }

      if (Math.abs(gamepad.axes[2]) > axisThreshold) {
        inv = rotate4(inv, rotateSpeed * gamepad.axes[2], 0, 1, 0);
        carousel = false;
      }
      if (Math.abs(gamepad.axes[3]) > axisThreshold) {
        inv = rotate4(inv, -rotateSpeed * gamepad.axes[3], 1, 0, 0);
        carousel = false;
      }

      const tiltAxis = gamepad.buttons[6].value - gamepad.buttons[7].value;
      if (Math.abs(tiltAxis) > axisThreshold) {
        inv = rotate4(inv, rotateSpeed * tiltAxis, 0, 0, 1);
        carousel = false;
      }
      if (gamepad.buttons[4].pressed && !leftGamepadTrigger) {
        camera =
          cameras[(cameras.indexOf(camera) + 1) % cameras.length];
        const camInv = invert4(getViewMatrix(camera));
        if (camInv) inv = camInv;
        carousel = false;
      }
      if (gamepad.buttons[5].pressed && !rightGamepadTrigger) {
        camera =
          cameras[
            (cameras.indexOf(camera) + cameras.length - 1) %
              cameras.length
          ];
        const camInv = invert4(getViewMatrix(camera));
        if (camInv) inv = camInv;
        carousel = false;
      }
      leftGamepadTrigger = gamepad.buttons[4].pressed;
      rightGamepadTrigger = gamepad.buttons[5].pressed;
      if (gamepad.buttons[0].pressed) {
        isJumping = true;
        carousel = false;
      }
      if (gamepad.buttons[3].pressed) {
        carousel = true;
      }
    }

    if (
      ["KeyJ", "KeyK", "KeyL", "KeyI"].some((k) => activeKeys.includes(k))
    ) {
      const d = 4;
      inv = translate4(inv, 0, 0, d);
      inv = rotate4(
        inv,
        activeKeys.includes("KeyJ")
          ? -0.05
          : activeKeys.includes("KeyL")
            ? 0.05
            : 0,
        0,
        1,
        0,
      );
      inv = rotate4(
        inv,
        activeKeys.includes("KeyI")
          ? 0.05
          : activeKeys.includes("KeyK")
            ? -0.05
            : 0,
        1,
        0,
        0,
      );
      inv = translate4(inv, 0, 0, -d);
    }

    const nextVm = invert4(inv);
    if (nextVm) viewMatrix = nextVm;

    if (carousel) {
      let carouselInv = invert4(defaultViewMatrix);
      if (carouselInv) {
        const t = Math.sin((Date.now() - carouselStart) / 5000);
        carouselInv = translate4(carouselInv, 2.5 * t, 0, 6 * (1 - Math.cos(t)));
        carouselInv = rotate4(carouselInv, -0.6 * t, 0, 1, 0);
        const carouselVm = invert4(carouselInv);
        if (carouselVm) viewMatrix = carouselVm;
      }
    }

    if (overrideMatrix !== null) viewMatrix = overrideMatrix;

    if (isJumping) {
      jumpDelta = Math.min(1, jumpDelta + 0.05);
    } else {
      jumpDelta = Math.max(0, jumpDelta - 0.05);
    }

    const actualViewMatrix = buildActualViewMatrix(viewMatrix, jumpDelta);

    if (isNaN(currentCameraIndex)) {
      updateCamId("");
    }

    return {
      viewMatrix,
      actualViewMatrix,
      carousel,
      camera,
      currentCameraIndex,
      jumpDelta,
    };
  };

  return {
    getState: () => ({
      viewMatrix,
      actualViewMatrix: buildActualViewMatrix(viewMatrix, jumpDelta),
      carousel,
      camera,
      currentCameraIndex,
      jumpDelta,
    }),
    tickFrame,
    setViewMatrix: (m: Matrix4) => {
      viewMatrix = [...m];
    },
    setCameras: (next: CameraBlueprint[]) => {
      cameras = next;
      camera = cameras[0];
      viewMatrix = getViewMatrix(camera);
    },
    getCameras: () => cameras,
    setCarouselStart: (t: number) => {
      carouselStart = t;
    },
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("gamepadconnected", onGamepadConnected);
      window.removeEventListener("gamepaddisconnected", onGamepadDisconnected);
      window.removeEventListener("hashchange", onHashChange);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    },
  } as ViewerControlsHandle;
}

/**
 * React hook wrapping {@link createViewerControls}.
 * Returns live camera matrix state without mutating WebGL.
 */
export function useViewerControls(
  canvasRef: RefObject<HTMLCanvasElement | null>,
) {
  const handleRef = useRef<ViewerControlsHandle | null>(null);
  const [controlState, setControlState] = useState<ViewerControlState | null>(
    null,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handle = createViewerControls(canvas);
    handleRef.current = handle;
    setControlState(handle.getState());

    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  }, [canvasRef]);

  const tickFrame = (now: number, overrideMatrix: Matrix4 | null = null) => {
    const handle = handleRef.current;
    if (!handle) return null;
    const state = handle.tickFrame(now, overrideMatrix);
    setControlState(state);
    return state;
  };

  const setViewMatrix = (m: Matrix4) => {
    handleRef.current?.setViewMatrix(m);
    if (handleRef.current) setControlState(handleRef.current.getState());
  };

  return {
    controlState,
    tickFrame,
    setViewMatrix,
    getViewMatrix: () => handleRef.current?.getState().viewMatrix ?? null,
  };
}
