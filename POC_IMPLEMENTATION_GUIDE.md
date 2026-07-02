# Splat Preview & Rendering - Implementation Guide

**Proof of Concept (POC) - Started:** 2026-07-02

This guide outlines the proof-of-concept for the enhanced splat preview and rendering system with transparency and export capabilities.

---

## 📋 Overview

This POC demonstrates how to:
1. Render Gaussian splats in a Three.js canvas with transparent backgrounds
2. Export rendered splats to PNG/WebP/JPEG with configurable quality
3. Display rendering metrics (FPS, render time, memory usage)
4. Integrate into the existing Splatial scene gallery UI

---

## 🗂️ Files Created

### Feature Documentation
- **`FEATURE_ISSUE_SPLAT_PREVIEW_RENDERING.md`**
  - Complete feature specification
  - Technical approach and architecture
  - Acceptance criteria and success metrics

### POC Components
- **`frontend/components/SplatPreviewRenderer/SplatPreviewRenderer.tsx`**
  - Main renderer component
  - Three.js scene setup with transparency
  - PNG/WebP export buttons
  - Metrics display (FPS, render time, memory)

### POC Hooks
- **`frontend/hooks/useSplatExport.ts`**
  - Export state management
  - Format-specific export handlers (PNG, WebP, JPEG)
  - Canvas resizing and quality control

---

## 🚀 Getting Started

### 1. Install Dependencies (if not already installed)

```bash
# Already included in package.json:
- three (v0.184.0)
- @mkkellogg/gaussian-splats-3d (v0.4.7)

# Optional (for enhanced Three.js React integration):
npm install @react-three/fiber @react-three/drei
```

### 2. Basic Usage

```tsx
import { SplatPreviewRenderer } from '@/components/SplatPreviewRenderer';

export default function ScenePreview() {
  return (
    <SplatPreviewRenderer
      splatUrl="/path/to/splat.ply"
      sceneId="vintage-sofa-splat"
      width={800}
      height={600}
      showControls={true}
      onRenderComplete={() => console.log('Render complete')}
    />
  );
}
```

### 3. Export Usage with Hook

```tsx
'use client';

import { useRef } from 'react';
import { useSplatExport, ExportOptions } from '@/hooks/useSplatExport';

export default function ExportExample() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, exportSplat } = useSplatExport('scene-1');

  const handleExport = async () => {
    if (!canvasRef.current) return;

    const options: ExportOptions = {
      format: 'webp',
      quality: 90,
      resolution: 1024,
      transparent: true,
    };

    try {
      await exportSplat(canvasRef.current, options);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div>
      <canvas ref={canvasRef} />
      <button
        onClick={handleExport}
        disabled={state.isExporting}
      >
        {state.isExporting ? `Exporting... ${state.progress}%` : 'Export'}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </div>
  );
}
```

---

## 🎯 Next Steps (Roadmap)

### Phase 1: Integrate Real Splat Rendering ✅ This POC
- [x] Component structure
- [x] Three.js setup with transparency
- [x] Export functionality framework
- [ ] **TODO:** Integrate `@mkkellogg/gaussian-splats-3d` loader

### Phase 2: UI Integration
- [ ] Create `PreviewExportModal` component
- [ ] Add preview button to existing `SceneCard`
- [ ] Connect to scene gallery
- [ ] Add loading and error states

### Phase 3: Advanced Features
- [ ] Camera controls (orbit, zoom, pan)
- [ ] Splat metadata display
- [ ] Animation support
- [ ] Batch export

### Phase 4: Optimization
- [ ] Lazy load renderer
- [ ] Cache rendered images
- [ ] Performance profiling
- [ ] Mobile optimization

---

## 🔧 Integration Checklist

### Immediate TODOs

1. **Load Actual Gaussian Splats**
   ```typescript
   // In SplatPreviewRenderer.tsx, replace the placeholder:
   // TODO: Import and use @mkkellogg/gaussian-splats-3d
   
   import { Viewer } from '@mkkellogg/gaussian-splats-3d';
   
   const viewer = new Viewer({
     canvas: renderer.domElement,
     scene: scene,
   });
   await viewer.addSplatScene(splatUrl);
   ```

2. **Update SceneCard Component**
   - Add "Preview" button to existing scene cards
   - Open `PreviewExportModal` on click
   - Pass `splatUrl` and `sceneId` to modal

3. **Create PreviewExportModal**
   - Wrap `SplatPreviewRenderer`
   - Add export options (format, quality, resolution)
   - Handle modal open/close

4. **API Integration**
   - Fetch actual splat file URLs from backend
   - Get scene metadata (dimensions, point count)
   - Handle large file streaming

### Testing

```bash
# Component testing
npm run test -- SplatPreviewRenderer

# E2E testing
npm run test:e2e -- splat-preview
```

---

## 📊 Metrics & Performance

### Expected Performance (POC)

| Metric | Target | Notes |
|--------|--------|-------|
| Initial Load | < 2s | Depends on splat file size |
| Render FPS | 30+ | Should maintain 60 FPS on good hardware |
| Export Time | < 5s | Includes canvas resize and encoding |
| Bundle Size | < 1MB | Additional for this feature |
| Memory Usage | < 200MB | For typical splat models |

### Profiling

Use Chrome DevTools:
1. **Performance Tab:** Track render time and frame rate
2. **Memory Tab:** Monitor heap usage during export
3. **Network Tab:** Profile splat file download

---

## 🎨 UI/UX Design

### Current State (from screenshot)
- Gallery of scene cards with static thumbnails
- Card layout: image, title, tags, engagement metrics

### Enhanced State
- Same gallery layout
- Add "Preview" icon/button on card hover
- Click opens modal with:
  - Live 3D renderer (800x600)
  - Metadata display (file size, point count)
  - Export options dropdown
  - Quality slider
  - Resolution selector
  - Quick export buttons

---

## 🚨 Known Limitations & Workarounds

1. **WebGL Context Loss**
   - Splats rendering may fail on some mobile devices
   - Implement fallback: show static thumbnail with fallback message

2. **Large File Handling**
   - Splats > 100MB may cause memory issues
   - Implement streaming/chunked loading

3. **Browser Compatibility**
   - Safari may have different WebGL behavior
   - Test on iOS devices
   - Provide polyfills if needed

4. **Export Quality**
   - PNG export larger files
   - WebP provides better compression
   - JPEG loses transparency (recommendation: show warning)

---

## 📝 Component Props Reference

### SplatPreviewRenderer

```typescript
interface SplatPreviewProps {
  splatUrl: string;           // URL to splat file (.ply)
  sceneId: string;            // Unique scene identifier
  width?: number;             // Canvas width (default: 800)
  height?: number;            // Canvas height (default: 600)
  showControls?: boolean;     // Show export/metrics (default: true)
  onRenderComplete?: () => void;  // Callback when render complete
}
```

### useSplatExport

```typescript
interface ExportOptions {
  format: 'png' | 'webp' | 'jpeg';
  quality: number;            // 0-100
  resolution: 512 | 1024 | 2048;
  transparent: boolean;       // For PNG/WebP
}

// Returns:
{
  state: {
    isExporting: boolean;
    progress: number;         // 0-100
    error: string | null;
  }
  exportSplat: (canvas, options) => Promise<void>;
  reset: () => void;
}
```

---

## 📚 References & Resources

- **Gaussian Splats 3D:** https://github.com/mkkellogg/GaussianSplats3D
- **Three.js Documentation:** https://threejs.org/docs/
- **Canvas API:** https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- **WebP Format:** https://developers.google.com/speed/webp

---

## 🤝 Contributing

When implementing the full feature:
1. Create a new branch: `feature/splat-preview-renderer`
2. Update component placeholders with actual implementations
3. Add unit tests for export functions
4. Add E2E tests for preview → export workflow
5. Update this guide with actual implementation details
6. Submit PR with reference to `FEATURE_ISSUE_SPLAT_PREVIEW_RENDERING.md`

---

## ❓ FAQ

**Q: How do I handle large splat files?**
A: Implement streaming/chunked loading or lazy-load renderer on demand.

**Q: Can I export animated splats?**
A: Current POC supports static export. Animation support is Phase 4.

**Q: What if WebGL is not supported?**
A: Show error message and provide alternative (download thumbnail).

**Q: How do I integrate this with the existing backend API?**
A: Update scene ID fetching to include splat file URL metadata endpoint.

---

**Last Updated:** 2026-07-02  
**Status:** Proof of Concept (Ready for Development)
