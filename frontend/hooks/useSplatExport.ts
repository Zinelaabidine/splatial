/**
 * useSplatExport Hook
 *
 * Manages splat export functionality including PNG, WebP, and JPEG export
 * with configurable quality and resolution settings.
 */

import { useCallback, useState } from 'react';

export type ExportFormat = 'png' | 'webp' | 'jpeg';

export interface ExportOptions {
  format: ExportFormat;
  quality: number; // 0-100
  resolution: 512 | 1024 | 2048;
  transparent: boolean;
}

export interface ExportState {
  isExporting: boolean;
  progress: number;
  error: string | null;
}

/**
 * Hook for exporting splat canvas to various image formats
 */
export const useSplatExport = (sceneId: string) => {
  const [state, setState] = useState<ExportState>({
    isExporting: false,
    progress: 0,
    error: null,
  });

  /**
   * Resize canvas to target resolution
   */
  const resizeCanvas = useCallback(
    (
      canvas: HTMLCanvasElement,
      targetResolution: number
    ): HTMLCanvasElement => {
      const resizedCanvas = document.createElement('canvas');
      resizedCanvas.width = targetResolution;
      resizedCanvas.height = targetResolution;

      const ctx = resizedCanvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      // Use high-quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, targetResolution, targetResolution);

      return resizedCanvas;
    },
    []
  );

  /**
   * Export canvas to PNG with alpha channel
   */
  const exportPNG = useCallback(
    async (canvas: HTMLCanvasElement, options: ExportOptions) => {
      return new Promise<void>((resolve, reject) => {
        try {
          setState((prev) => ({
            ...prev,
            isExporting: true,
            error: null,
          }));

          const resizedCanvas = resizeCanvas(canvas, options.resolution);
          setState((prev) => ({ ...prev, progress: 50 }));

          const link = document.createElement('a');
          link.href = resizedCanvas.toDataURL('image/png');
          link.download = `splat-${sceneId}-${Date.now()}.png`;
          link.click();

          setState((prev) => ({
            ...prev,
            isExporting: false,
            progress: 100,
          }));

          resolve();
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Export failed';
          setState((prev) => ({
            ...prev,
            isExporting: false,
            error,
          }));
          reject(err);
        }
      });
    },
    [sceneId, resizeCanvas]
  );

  /**
   * Export canvas to WebP with quality control
   */
  const exportWebP = useCallback(
    async (canvas: HTMLCanvasElement, options: ExportOptions) => {
      return new Promise<void>((resolve, reject) => {
        try {
          setState((prev) => ({
            ...prev,
            isExporting: true,
            error: null,
          }));

          const resizedCanvas = resizeCanvas(canvas, options.resolution);
          setState((prev) => ({ ...prev, progress: 50 }));

          const qualityValue = options.quality / 100;

          resizedCanvas.toBlob(
            (blob) => {
              if (!blob) throw new Error('Failed to create blob');

              const link = document.createElement('a');
              const url = URL.createObjectURL(blob);
              link.href = url;
              link.download = `splat-${sceneId}-${Date.now()}.webp`;
              link.click();

              URL.revokeObjectURL(url);

              setState((prev) => ({
                ...prev,
                isExporting: false,
                progress: 100,
              }));

              resolve();
            },
            'image/webp',
            qualityValue
          );
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Export failed';
          setState((prev) => ({
            ...prev,
            isExporting: false,
            error,
          }));
          reject(err);
        }
      });
    },
    [sceneId, resizeCanvas]
  );

  /**
   * Export canvas to JPEG
   */
  const exportJPEG = useCallback(
    async (canvas: HTMLCanvasElement, options: ExportOptions) => {
      return new Promise<void>((resolve, reject) => {
        try {
          setState((prev) => ({
            ...prev,
            isExporting: true,
            error: null,
          }));

          const resizedCanvas = resizeCanvas(canvas, options.resolution);
          setState((prev) => ({ ...prev, progress: 50 }));

          const qualityValue = options.quality / 100;

          resizedCanvas.toBlob(
            (blob) => {
              if (!blob) throw new Error('Failed to create blob');

              const link = document.createElement('a');
              const url = URL.createObjectURL(blob);
              link.href = url;
              link.download = `splat-${sceneId}-${Date.now()}.jpg`;
              link.click();

              URL.revokeObjectURL(url);

              setState((prev) => ({
                ...prev,
                isExporting: false,
                progress: 100,
              }));

              resolve();
            },
            'image/jpeg',
            qualityValue
          );
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Export failed';
          setState((prev) => ({
            ...prev,
            isExporting: false,
            error,
          }));
          reject(err);
        }
      });
    },
    [sceneId, resizeCanvas]
  );

  /**
   * Main export function that dispatches to correct format handler
   */
  const exportSplat = useCallback(
    async (canvas: HTMLCanvasElement, options: ExportOptions) => {
      try {
        switch (options.format) {
          case 'png':
            await exportPNG(canvas, options);
            break;
          case 'webp':
            await exportWebP(canvas, options);
            break;
          case 'jpeg':
            await exportJPEG(canvas, options);
            break;
          default:
            throw new Error(`Unsupported format: ${options.format}`);
        }
      } catch (err) {
        console.error('Export failed:', err);
        throw err;
      }
    },
    [exportPNG, exportWebP, exportJPEG]
  );

  /**
   * Reset export state
   */
  const reset = useCallback(() => {
    setState({
      isExporting: false,
      progress: 0,
      error: null,
    });
  }, []);

  return {
    state,
    exportSplat,
    reset,
  };
};
