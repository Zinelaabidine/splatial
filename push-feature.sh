#!/bin/bash

# Push Splat Preview Feature to Remote Repository
# This script commits and pushes the new feature files

set -e

cd "$(dirname "$0")"

echo "🚀 Pushing Splat Preview Feature to Remote Repository..."
echo ""

# Stage the new feature files
echo "📦 Staging files..."
git add FEATURE_ISSUE_SPLAT_PREVIEW_RENDERING.md
git add POC_IMPLEMENTATION_GUIDE.md
git add frontend/components/SplatPreviewRenderer/
git add frontend/hooks/useSplatExport.ts

# Commit
echo "💾 Committing..."
git commit -m "feat(frontend): add splat preview & rendering feature spec and POC

- Add comprehensive feature issue for enhanced splat preview system
- Create SplatPreviewRenderer component with transparent background support
- Implement useSplatExport hook for PNG/WebP/JPEG export
- Support configurable quality and resolution export options
- Include rendering metrics (FPS, render time, memory usage)
- Add implementation guide with integration checklist and roadmap

This POC provides foundation for Phase 1-2 of splat preview enhancement.
Includes placeholder for gaussian-splats-3d integration in Phase 1."

# Push to remote
echo "🌐 Pushing to origin/dev..."
git push origin dev

echo ""
echo "✅ Success! Feature pushed to remote repository."
echo ""
echo "📍 View on GitHub:"
echo "   Branch: dev"
echo "   Files:"
echo "   - FEATURE_ISSUE_SPLAT_PREVIEW_RENDERING.md"
echo "   - POC_IMPLEMENTATION_GUIDE.md"
echo "   - frontend/components/SplatPreviewRenderer/SplatPreviewRenderer.tsx"
echo "   - frontend/hooks/useSplatExport.ts"
