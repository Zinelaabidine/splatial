# Feature Issue: Enhanced Splat Preview & Rendering System

**Status:** Open  
**Priority:** Medium  
**Type:** Enhancement  
**Created:** 2026-07-02  

---

## Overview

Enhance the Splatial UI to support dynamic splat preview rendering with transparency and animation capabilities. This feature will allow users to preview trained Gaussian splats with configurable export options for transparent PNG/WebP output and optional animation sequences.

---

## Problem Statement

Currently, the Scenes gallery displays static thumbnails of trained splats. To provide users with a richer preview experience and enable them to export splats as transparent images for external use, we need:

1. **Real-time splat preview** directly in the UI (similar to the current scene cards)
2. **Transparent background rendering** to export splats as PNG/WebP with alpha channel
3. **Optional animation playback** for splats that support frame sequences
4. **Splat metadata exposure** (dimensions, point count, rendering quality settings)

---

## Acceptance Criteria

### Core Features

- [ ] Implement a reusable `SplatPreviewRenderer` component using Three.js + gaussian-splats-3d
- [ ] Support rendering splats with transparent backgrounds (alpha channel)
- [ ] Add canvas-to-image export functionality (PNG with transparency)
- [ ] Create optional animation loop support for trained splat sequences
- [ ] Display splat metadata in the preview panel (file size, point count, quality metrics)

### UI/UX Enhancements

- [ ] Add a "Preview & Export" modal/panel to scene cards
- [ ] Include export format selector (PNG, WebP, JPEG)
- [ ] Add quality/resolution slider for export (512x512, 1024x1024, 2048x2048)
- [ ] Show rendering performance metrics (FPS, memory usage)
- [ ] Support camera controls (orbit, zoom, pan) in preview

### Performance & Compatibility

- [ ] Optimize renderer for mobile devices
- [ ] Add fallback rendering for unsupported browsers
- [ ] Cache rendered images to avoid re-rendering
- [ ] Support progressive loading for large splat files

---

## Technical Approach

### Components to Create/Modify

```
frontend/
├── components/
│   ├── SplatPreviewRenderer/
│   │   ├── SplatPreviewRenderer.tsx      (Main renderer component)
│   │   ├── useCanvasExport.ts           (Export hook)
│   │   ├── useRenderMetrics.ts          (Performance tracking)
│   │   └── SplatPreviewRenderer.module.css
│   ├── SceneCard.tsx                    (Update to include preview button)
│   └── PreviewExportModal/
│       ├── PreviewExportModal.tsx       (Modal for preview & export)
│       └── ExportOptions.tsx            (Export settings panel)
├── hooks/
│   ├── useSplatRenderer.ts              (Custom hook for splat rendering)
│   ├── useCanvasExport.ts               (Export PNG/WebP)
│   └── useRenderMetrics.ts
├── utils/
│   ├── splatRenderingConfig.ts          (Rendering presets)
│   └── imageExport.ts                   (Image export utilities)
└── types/
    └── splat.ts                         (Splat type definitions)
```

### Key Dependencies

- Already available:
  - `@mkkellogg/gaussian-splats-3d` - Splat rendering library
  - `three.js` - 3D engine
  - `shadcn/ui` - UI components
  - `tailwindcss` - Styling

- May need to add:
  - `canvas-to-blob` - Canvas export utility (or use native Blob API)
  - `@react-three/fiber` (optional, for easier React integration with Three.js)

### Implementation Steps

1. **Phase 1: Core Renderer**
   - Create `SplatPreviewRenderer` component
   - Integrate Gaussian splats rendering with transparent background
   - Add basic camera controls (orbit, zoom)
   - Implement performance monitoring

2. **Phase 2: Export Functionality**
   - Implement canvas-to-image conversion
   - Support PNG + WebP export with quality options
   - Add resolution scaling (512px to 2048px)
   - Cache rendered images

3. **Phase 3: UI Integration**
   - Create `PreviewExportModal` component
   - Add preview button to `SceneCard`
   - Integrate with existing scene management
   - Add loading states and error handling

4. **Phase 4: Animation Support** (Optional)
   - Support splat frame sequences
   - Add play/pause/speed controls
   - Export as animated WebP or MP4 (if backend supports video encoding)

5. **Phase 5: Performance Optimization**
   - Lazy load renderer component
   - Implement WebWorker for heavy computation (if needed)
   - Add streaming/progressive rendering for large splats

---

## Data Model / API Requirements

### Frontend State

```typescript
interface SplatPreviewState {
  isLoading: boolean;
  error: Error | null;
  renderMetrics: {
    fps: number;
    memoryUsage: number;
    renderTime: number;
  };
  exportSettings: {
    format: 'png' | 'webp' | 'jpeg';
    quality: number;
    resolution: 512 | 1024 | 2048;
    transparent: boolean;
  };
}

interface SplatMetadata {
  fileSize: number;
  pointCount: number;
  dimensions: { width: number; height: number; depth: number };
  format: string;
  createdAt: string;
}
```

### Backend Changes (if needed)

- Expose splat file metadata endpoint: `GET /api/splats/:id/metadata`
- Support splat streaming for large files: `GET /api/splats/:id/stream`
- Video encoding support (optional): `POST /api/splats/:id/export-video`

---

## Proof of Concept

The current Spatial UI screenshot shows multiple scene cards with thumbnails (Vintage Sofa Splat, Classic Car Splat, Arch Study, Antique Bicycle Splat, Watch Mech Splat). The enhancement will add a "Preview" button to each card that opens a modal with:

1. **Live 3D Preview Panel** - Renders the actual splat with lighting and camera controls
2. **Metadata Display** - Shows splat dimensions, point count, file size
3. **Export Options** - Dropdowns for format, quality, and resolution
4. **Animation Timeline** (if applicable) - Play controls for frame sequences
5. **Quick Export** - One-click export to PNG/WebP

---

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (may need WebGL 2.0 fallback)
- Mobile: Touch controls for camera navigation

---

## Testing Strategy

- [ ] Unit tests for export functions
- [ ] Component tests for SplatPreviewRenderer
- [ ] E2E tests for preview → export workflow
- [ ] Performance tests (FPS stability, memory leaks)
- [ ] Cross-browser compatibility tests

---

## Success Metrics

- [ ] Users can preview any trained splat within 2 seconds
- [ ] Export images have zero quality loss with transparent background
- [ ] Average rendering maintains 30+ FPS on mid-range devices
- [ ] Export modal < 1MB bundle size increase
- [ ] User engagement with preview feature > 40%

---

## Notes & Considerations

- **Transparency Export**: Ensure correct alpha blending during canvas export (check PNG RGBA encoding)
- **Large Splats**: Consider streaming/chunked loading for splats > 50MB
- **Animation**: Clarify format for frame sequences (multi-splat files, keyframes, or separate files)
- **Performance**: Profile on mobile devices; consider WebGL context loss handling
- **Accessibility**: Ensure camera controls work with keyboard; add ARIA labels

---

## Related Issues

- (Link to backend splat metadata API issue, if exists)
- (Link to UI gallery refactor issue, if exists)

---

## Labels

`enhancement` `frontend` `ui-ux` `gaussian-splats` `rendering` `export`

