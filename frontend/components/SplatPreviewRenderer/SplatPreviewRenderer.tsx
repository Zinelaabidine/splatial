/**
 * SplatPreviewRenderer - POC Component
 *
 * Proof of concept for rendering Gaussian splats with transparency and export capabilities.
 * Integrates with @mkkellogg/gaussian-splats-3d and Three.js
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

interface SplatPreviewProps {
  splatUrl: string;
  sceneId: string;
  width?: number;
  height?: number;
  showControls?: boolean;
  onRenderComplete?: () => void;
}

interface RenderMetrics {
  fps: number;
  memoryUsage: number;
  renderTime: number;
}

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number;
  };
};

function getUsedJsHeapSize(): number {
  return (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? 0;
}

export const SplatPreviewRenderer: React.FC<SplatPreviewProps> = ({
  splatUrl,
  sceneId,
  width = 800,
  height = 600,
  showControls = true,
  onRenderComplete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationIdRef = useRef<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<RenderMetrics>({
    fps: 0,
    memoryUsage: 0,
    renderTime: 0,
  });

  // Initialize Three.js scene with transparent background
  const initializeScene = useCallback(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 2;
    cameraRef.current = camera;

    // Renderer with alpha channel for transparency
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Enable transparency
      preserveDrawingBuffer: true, // Needed for canvas export
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0); // Transparent black

    if (canvasRef.current) {
      canvasRef.current = renderer.domElement;
    } else {
      containerRef.current.appendChild(renderer.domElement);
      canvasRef.current = renderer.domElement;
    }

    rendererRef.current = renderer;

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    return { scene, camera, renderer };
  }, [width, height]);

  // Export canvas to PNG with transparency
  const exportToPNG = useCallback(() => {
    if (!canvasRef.current) return;

    const link = document.createElement('a');
    link.href = canvasRef.current.toDataURL('image/png');
    link.download = `splat-${sceneId}-${Date.now()}.png`;
    link.click();
  }, [sceneId]);

  // Export canvas to WebP
  const exportToWebP = useCallback(() => {
    if (!canvasRef.current) return;

    canvasRef.current.toBlob(
      (blob) => {
        if (!blob) return;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `splat-${sceneId}-${Date.now()}.webp`;
        link.click();
        URL.revokeObjectURL(link.href);
      },
      'image/webp',
      0.9
    );
  }, [sceneId]);

  // Initialize on mount
  useEffect(() => {
    const setup = initializeScene();
    if (!setup) return;

    const { scene, camera, renderer } = setup;
    const container = containerRef.current;
    let cancelled = false;

    const loadSplats = async () => {
      await Promise.resolve();
      if (cancelled) return;

      try {
        setError(null);

        // TODO: Integrate with @mkkellogg/gaussian-splats-3d using splatUrl
        void splatUrl;

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshPhongMaterial({
          color: 0x0088ff,
          transparent: true,
          opacity: 0.8,
        });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        if (cancelled) return;
        setIsLoading(false);
        onRenderComplete?.();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load splats');
        setIsLoading(false);
      }
    };

    void loadSplats();

    const tick = () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

      const startTime = performance.now();

      sceneRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.rotation.x += 0.005;
          child.rotation.y += 0.01;
        }
      });

      rendererRef.current.render(sceneRef.current, cameraRef.current);
      const renderTime = performance.now() - startTime;

      setMetrics((prev) => ({
        ...prev,
        renderTime,
        fps: Math.round(1000 / renderTime),
        memoryUsage: getUsedJsHeapSize(),
      }));

      animationIdRef.current = requestAnimationFrame(tick);
    };

    animationIdRef.current = requestAnimationFrame(tick);

    const handleResize = () => {
      renderer.setSize(width, height);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      renderer.dispose();
      if (container?.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [initializeScene, width, height, splatUrl, onRenderComplete]);

  return (
    <div className="flex flex-col gap-4">
      {/* Renderer Container */}
      <div
        ref={containerRef}
        className="relative bg-slate-900 rounded-lg overflow-hidden"
        style={{ width, height }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-white">Loading splat...</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/50">
            <div className="text-white text-center">
              <p>Error loading splat</p>
              <p className="text-sm mt-2">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {showControls && (
        <div className="flex flex-col gap-3">
          {/* Metrics Display */}
          <div className="grid grid-cols-3 gap-2 text-sm bg-slate-800 p-3 rounded">
            <div className="text-gray-300">
              <span className="text-gray-400">FPS:</span>
              <span className="ml-2 text-blue-400">{metrics.fps}</span>
            </div>
            <div className="text-gray-300">
              <span className="text-gray-400">Render:</span>
              <span className="ml-2 text-blue-400">{metrics.renderTime.toFixed(2)}ms</span>
            </div>
            <div className="text-gray-300">
              <span className="text-gray-400">Memory:</span>
              <span className="ml-2 text-blue-400">
                {(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB
              </span>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-2">
            <button
              onClick={exportToPNG}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
            >
              Export PNG
            </button>
            <button
              onClick={exportToWebP}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition"
            >
              Export WebP
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SplatPreviewRenderer;
