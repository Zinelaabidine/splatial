#!/usr/bin/env bash
# =============================================================================
# Splatworks — GitHub Issues from UX Audit (June 30, 2026)
# Run: chmod +x create-issues.sh && ./create-issues.sh
# Requires: gh CLI authenticated → `brew install gh && gh auth login`
# =============================================================================

set -e

REPO="Zinelaabidine/splatial"

echo "Creating labels..."
gh label create "ux" --color "#0075ca" --description "User experience" --repo "$REPO" 2>/dev/null || true
gh label create "social" --color "#e4e669" --description "Social features" --repo "$REPO" 2>/dev/null || true
gh label create "performance" --color "#d93f0b" --description "Performance and loading" --repo "$REPO" 2>/dev/null || true
gh label create "3d-viewer" --color "#0e8a16" --description "3D canvas and WebGL viewer" --repo "$REPO" 2>/dev/null || true
gh label create "seo" --color "#1d76db" --description "SEO and Open Graph" --repo "$REPO" 2>/dev/null || true
gh label create "priority:critical" --color "#b60205" --description "Must fix before launch" --repo "$REPO" 2>/dev/null || true
gh label create "priority:high" --color "#e4e669" --description "High priority" --repo "$REPO" 2>/dev/null || true
gh label create "priority:medium" --color "#0075ca" --description "Medium priority" --repo "$REPO" 2>/dev/null || true

echo "Creating issues..."

# ── ISSUE 1 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Add dynamic per-scene OG metadata (og:title, og:image, twitter:card)" \
  --label "seo,priority:critical" \
  --body "## Problem
Every page — including scene-specific viewer URLs — returns identical \`<meta>\` tags:
\`\`\`html
<title>Splatworks</title>
<meta name=\"description\" content=\"Gaussian splatting platform\">
\`\`\`
No \`og:title\`, \`og:image\`, \`og:url\`, or \`twitter:card\` tags exist on any page. Sharing a scene link on Discord, Twitter, or iMessage renders a blank card with no image.

## Solution
Use Next.js App Router \`generateMetadata\` in \`app/scenes/view/page.tsx\`:
\`\`\`ts
export async function generateMetadata({ searchParams }): Promise<Metadata> {
  const scene = await fetchScene(searchParams.id);
  return {
    title: \`\${scene.title} by @\${scene.creator.handle} — Splatworks\`,
    openGraph: {
      title: scene.title,
      description: \`By @\${scene.creator.handle} · \${scene.reactionCount} reactions\`,
      url: \`https://splatial-dev.openspacenexus.store/scenes/view?id=\${scene.id}\`,
      images: [{ url: scene.ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', images: [scene.ogImageUrl] },
  };
}
\`\`\`
Prerequisite: \`ogImageUrl\` field populated at upload time (see related issue: OG image capture pipeline).

## Acceptance criteria
- [ ] Each scene URL produces unique \`og:title\`, \`og:description\`, \`og:image\`
- [ ] Twitter/Discord/iMessage unfurls show scene thumbnail and title
- [ ] \`/explore\`, \`/feed\` have their own generic but branded OG tags"

# ── ISSUE 2 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Add scene title and creator identity to the viewer header" \
  --label "ux,social,priority:critical" \
  --body "## Problem
The DOM audit found the \`<h1>\` on \`/scenes/view?id=...\` is **\"Comments 1\"** — the comments section header. The scene name (e.g. \"Horse1\") and creator handle (\`@zinoymail\`) appear nowhere in the viewer layout. Users cannot tell what they are looking at or who made it, and there is no Follow affordance in context.

## Solution
Add a sticky 48px identity header above the canvas:
\`\`\`tsx
<header className=\"sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-[#121212]/90 px-4 py-2 backdrop-blur\">
  <Avatar src={creator.avatarUrl} size={32} />
  <div className=\"min-w-0\">
    <h1 className=\"truncate text-sm font-semibold\">{scene.title}</h1>
    <Link href={\`/@\${creator.handle}\`} className=\"text-xs text-[#9aa6bd] hover:text-white\">
      @{creator.handle}
    </Link>
  </div>
  <div className=\"ml-auto flex items-center gap-2\">
    <FollowButton userId={creator.id} />
    <ShareButton sceneId={scene.id} />
  </div>
</header>
\`\`\`

## Acceptance criteria
- [ ] Scene title visible at top of viewer page
- [ ] Creator handle visible and links to their profile
- [ ] Follow button present for non-owner viewers
- [ ] Share button present (see related issue)"

# ── ISSUE 3 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Add Reset Camera button to the 3D viewer" \
  --label "3d-viewer,ux,priority:critical" \
  --body "## Problem
Full button DOM audit confirmed: there is **no Reset/Home camera button** in the viewer. Button inventory: Menu, Training, Activity, New scene, Settings, ● Rec, Save this view, New tour, Play tour, Copy link to this tour, Delete tour, reactions (5), Remix, Save, Post, Delete comment, Close panel ×3, Refresh, Close ×2, Sign out. Users who explore the splat and drift off-axis have no recovery path.

## Solution
Store initial camera state at load time and add a reset button overlay:
\`\`\`ts
// On scene ready
const homePosition = camera.position.clone();
const homeTarget = controls.target.clone();

function resetCamera() {
  gsap.to(camera.position, { ...homePosition, duration: 0.8, ease: 'power2.inOut' });
  gsap.to(controls.target, { ...homeTarget, duration: 0.8, ease: 'power2.inOut',
    onUpdate: () => controls.update()
  });
}
\`\`\`
\`\`\`tsx
<button
  onClick={resetCamera}
  className=\"absolute top-3 left-3 z-20 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white backdrop-blur-sm\"
  title=\"Reset camera to default view\"
>
  ⌂ Reset view
</button>
\`\`\`
Bonus: if camera drifts beyond 5× the scene bounding sphere radius, show a toast nudge.

## Acceptance criteria
- [ ] Reset button visible in top-left of canvas overlay
- [ ] Click animates camera back to initial position smoothly
- [ ] Works after orbit, zoom, and pan operations
- [ ] Creator's saved \"Home Shot\" is used as reset target if one exists"

# ── ISSUE 4 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Add Share button to scene viewer" \
  --label "social,ux,priority:critical" \
  --body "## Problem
There is no general Share button for scenes. The only sharing mechanism found in the DOM audit is \"Copy link to this tour\" inside the Tours panel — a niche power-user feature. For a social network this is a critical omission.

## Solution
Add a Share button to the viewer header (see identity header issue) that triggers:
1. **Desktop:** Copy scene URL to clipboard + show toast \"Link copied\"
2. **Mobile:** Invoke \`navigator.share()\` with scene title, description, and URL

\`\`\`tsx
async function handleShare() {
  const url = \`https://splatial-dev.openspacenexus.store/scenes/view?id=\${scene.id}\`;
  if (navigator.share && isMobile) {
    await navigator.share({ title: scene.title, text: \`Check out \${scene.title} on Splatworks\`, url });
  } else {
    await navigator.clipboard.writeText(url);
    toast('Link copied to clipboard');
  }
}
\`\`\`

## Acceptance criteria
- [ ] Share button visible in viewer header for all users
- [ ] Desktop: copies scene URL to clipboard + shows toast
- [ ] Mobile: opens native share sheet via Web Share API
- [ ] Shared URL resolves to correct scene with OG tags"

# ── ISSUE 5 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Fix Feed empty state: add CTA and suggested creators" \
  --label "social,ux,priority:critical" \
  --body "## Problem
\`/feed\` renders \"Your feed is empty — follow some creators to see their scenes here.\" with nothing to click. It is a complete dead end and a critical new-user activation failure.

## Solution
Replace the empty state with an onboarding component that surfaces suggested creators:
\`\`\`tsx
function EmptyFeed() {
  return (
    <div className=\"flex flex-col items-center gap-6 py-20 text-center\">
      <div className=\"text-4xl\">👁</div>
      <h2 className=\"text-xl font-semibold\">Your feed is waiting</h2>
      <p className=\"max-w-sm text-sm text-[#9aa6bd]\">
        Follow creators to see their 3D scenes here.
      </p>
      <Button href=\"/explore\">Discover creators →</Button>
      <SuggestedCreators limit={3} />
    </div>
  );
}
\`\`\`
\`SuggestedCreators\` queries the top creators by scene count or reaction count from the explore endpoint.

## Acceptance criteria
- [ ] Empty feed shows actionable copy and a link to /explore
- [ ] 2–3 suggested creator cards shown with Follow buttons
- [ ] Following a creator from the empty state immediately populates the feed"

# ── ISSUE 6 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Filter failed/processing scenes out of public Explore grid" \
  --label "ux,social,priority:critical" \
  --body "## Problem
The public \`/explore\` page shows a \"Palace\" card with a red \`● FAILED\` badge and the raw internal error string: \"Click Retry below to resubmit.\" This is a system-level message exposed to all visitors including unauthenticated users. It damages trust in the platform.

## Solution
- Filter scenes with status \`FAILED\`, \`PROCESSING\`, or \`UPLOADING\` from the Explore query — only \`COMPLETED\` + \`PUBLIC\` scenes should appear.
- In the owner's own dashboard (\`/scenes\` / Home), failed scenes can still be shown with owner-friendly error UI and a Retry button.
- If a scene is mid-processing, show a \"Coming soon\" placeholder card for the owner only.

\`\`\`ts
// In the Explore API handler / DynamoDB query
FilterExpression: '#status = :completed AND #visibility = :public',
ExpressionAttributeValues: {
  ':completed': { S: 'COMPLETED' },
  ':public': { S: 'PUBLIC' },
}
\`\`\`

## Acceptance criteria
- [ ] No FAILED or PROCESSING scenes appear in /explore for any user
- [ ] Owner still sees failed scenes in their own /scenes dashboard
- [ ] Retry button only visible to scene owner"

# ── ISSUE 7 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Hide developer tools from production viewer (FPS counter, Rec button)" \
  --label "ux,3d-viewer,priority:high" \
  --body "## Problem
Two dev-facing elements are permanently visible to all users in the scene viewer:
1. **FPS counter** (bottom-right corner) — shows \"49 fps\" with no context, alarming to non-technical users
2. **\"● Rec\" + \"No trajectory\"** panel (bottom-left) — trajectory recording tool for Tours, unlabeled and always visible

## Solution
Gate both behind a creator/developer mode toggle:
\`\`\`tsx
// Show dev tools only for scene owner OR if devMode is enabled
const showDevTools = isOwner || devMode;

{showDevTools && <FpsCounter />}
{showDevTools && <TrajectoryRecorder />}
\`\`\`
For the Rec/trajectory tool specifically, consider moving it inside the Tours panel as a \"Record tour\" button, so it has context and is only accessible when building a tour.

## Acceptance criteria
- [ ] FPS counter hidden for non-owner visitors
- [ ] Rec button / \"No trajectory\" label hidden for non-owner visitors
- [ ] Owner can toggle a dev mode to reveal these tools
- [ ] Trajectory recording is accessible inside the Tours workflow"

# ── ISSUE 8 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Show file size on scene cards and add mobile data warning in viewer" \
  --label "ux,performance,priority:high" \
  --body "## Problem
There is zero bandwidth cost communication anywhere on the site. Users on mobile data tap a card and commit to downloading a scene of unknown size. A 50 MB splat on a 4G connection is a 20+ second wait with no warning.

## Solution

**1. File size badge on cards (Explore + Home):**
\`\`\`tsx
<div className=\"absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white backdrop-blur\">
  {formatBytes(scene.fileSizeBytes)}  {/* e.g. \"12 MB\" */}
</div>
\`\`\`
Store \`fileSizeBytes\` on the DynamoDB scene record when the processed .splat file is written to S3.

**2. Mobile consent gate before download starts:**
\`\`\`tsx
{isMobile && !hasConsented && (
  <MobileDataWarning
    thumbnailUrl={scene.thumbnailUrl}
    title={scene.title}
    creator={scene.creator.handle}
    fileSizeMB={scene.fileSizeMB}
    onConfirm={() => { setHasConsented(true); startDownload(); }}
  />
)}
\`\`\`

## Acceptance criteria
- [ ] File size badge visible on all scene cards in Explore and Home
- [ ] Mobile users see data warning overlay before download begins
- [ ] Warning shows thumbnail, scene name, creator, and MB size
- [ ] \"Load scene\" CTA starts the download; user can also navigate away"

# ── ISSUE 9 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Replace center-screen download overlay with non-blocking progress bar" \
  --label "ux,3d-viewer,performance,priority:high" \
  --body "## Problem
The current download progress bar renders centered in the canvas (\"Downloading… 56%\") as a full-screen overlay. This blocks the partial scene that is already visible and prevents users from reading comments while waiting. It also prevents interaction with page controls.

## Solution
Move to a thin top progress bar + small text status in the bottom-left corner:
\`\`\`tsx
{/* Non-blocking top progress stripe */}
{loadPercent < 100 && (
  <div className=\"absolute top-0 left-0 right-0 h-0.5 bg-white/10 z-20\">
    <div
      className=\"h-full bg-teal-500 transition-all duration-300\"
      style={{ width: \`\${loadPercent}%\` }}
    />
  </div>
)}

{/* Small status text — does not block the canvas */}
{loadPercent < 100 && (
  <div className=\"absolute bottom-14 left-4 z-20 text-xs text-white/60\">
    Loading {loadPercent}% · {downloadedMB} / {totalMB} MB
  </div>
)}
\`\`\`
The poster/thumbnail image should be shown as a backdrop behind the partially-loaded scene so the canvas never looks blank.

## Acceptance criteria
- [ ] Progress is a thin bar at the top edge of the canvas, not a centered overlay
- [ ] Canvas is interactive (can be rotated) even at partial load
- [ ] Poster thumbnail shown while scene loads so canvas is never fully black
- [ ] Comments section is readable and interactive during download"

# ── ISSUE 10 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Implement mobile bottom sheet for comments" \
  --label "ux,social,priority:high" \
  --body "## Problem
Comments are below the fold and require scrolling away from the 3D canvas to read or write. On mobile this completely breaks the dual-mode experience — users must choose between the 3D scene and the social layer.

## Solution
Implement a draggable bottom sheet for comments on mobile:

- **Peek state (default):** 80px visible — shows comment count + compose input
- **Expanded:** Slides to 60vh — full comment thread visible, canvas compressed above
- Uses CSS \`transform: translateY()\` so the canvas never re-layouts

\`\`\`tsx
const PEEK_Y = window.innerHeight - 80;
const EXPANDED_Y = window.innerHeight * 0.4;

function CommentsSheet({ comments }) {
  const [y, setY] = useState(PEEK_Y);
  return (
    <div
      className=\"fixed bottom-0 left-0 right-0 z-40 rounded-t-2xl bg-[#1a1f2e] shadow-2xl\"
      style={{ transform: \`translateY(\${y}px)\`, transition: 'transform 0.3s ease' }}
    >
      <div className=\"flex justify-center pt-2 pb-3\">
        <div className=\"h-1 w-10 rounded-full bg-white/20\" />
      </div>
      <CommentList comments={comments} />
      <CommentInput />
    </div>
  );
}
\`\`\`

## Acceptance criteria
- [ ] Mobile: comments appear as bottom sheet, not below-fold scroll
- [ ] Dragging up expands the sheet; dragging down collapses to peek
- [ ] Canvas remains visible above the peeking sheet
- [ ] Desktop: existing below-canvas comments layout unchanged"

# ── ISSUE 11 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Improve navigation hint copy and add gesture map overlay" \
  --label "ux,3d-viewer,priority:high" \
  --body "## Problem
The only camera guidance shown to users is: \"▶ Use mouse or arrow keys to navigate.\" This is too vague — no gesture mapping, no distinction between desktop and mobile controls, and it doesn't explain orbit vs. zoom vs. pan.

## Solution
Replace with a contextual hint overlay that auto-dismisses after 4 seconds:
\`\`\`tsx
function ControlsHint() {
  const [visible, setVisible] = useState(true);
  const isMobile = navigator.maxTouchPoints > 0;

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className=\"absolute bottom-16 left-1/2 -translate-x-1/2 rounded-xl bg-black/60 px-4 py-2 text-center text-xs text-white backdrop-blur-sm\">
      {isMobile
        ? '👆 Swipe to orbit · Pinch to zoom · Two fingers to pan'
        : '🖱 Drag to orbit · Scroll to zoom · Right-click to pan'}
      <button onClick={() => setVisible(false)} className=\"ml-3 text-white/50\">✕</button>
    </div>
  );
}
\`\`\`
Also add a \"Click to navigate\" activation overlay on desktop so mouse scroll doesn't conflict with page scroll until the user explicitly activates the canvas.

## Acceptance criteria
- [ ] Hint shows correct controls for desktop vs mobile
- [ ] Auto-dismisses after 4 seconds; has manual close button
- [ ] Desktop: canvas requires a click to activate (prevents scroll hijack)
- [ ] Dismissed state persists in localStorage so repeat visitors aren't shown it"

# ── ISSUE 12 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Collapse empty Shots/Tours panels into icon button" \
  --label "ux,3d-viewer,priority:medium" \
  --body "## Problem
The Shots and Tours panels are permanently visible in the top-right corner of the canvas, even when empty (\"No saved shots yet\"). They occlude the top-right of the scene and create visual noise for first-time viewers who have not yet created any shots or tours.

## Solution
Collapse both panels into a single icon button when empty. Expand to the current panel layout only when the user has content or clicks the icon:
\`\`\`tsx
const hasContent = shots.length > 0 || tours.length > 0;
const [open, setOpen] = useState(hasContent);

{!open ? (
  <button
    onClick={() => setOpen(true)}
    className=\"absolute top-3 right-3 z-20 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm\"
    title=\"Shots & Tours\"
  >
    <CameraIcon size={16} />
  </button>
) : (
  <ShotsToursPanels onClose={() => setOpen(false)} />
)}
\`\`\`

## Acceptance criteria
- [ ] Empty shots + empty tours: panels collapsed to single icon button
- [ ] Icon button opens the panels on click
- [ ] If creator has saved shots or tours, panels open by default
- [ ] Panels have an explicit close button to re-collapse"

# ── ISSUE 13 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Build OG image capture pipeline using Puppeteer at processing time" \
  --label "seo,performance,priority:medium" \
  --body "## Problem
There are no per-scene OG images. The \`generateMetadata\` fix (see related issue) requires an \`ogImageUrl\` field on each scene. This needs to be generated automatically when a scene finishes processing.

## Solution
Add an OG image capture step to the processing queue worker, triggered after the .splat file is successfully written to S3:

\`\`\`ts
import puppeteer from 'puppeteer';

async function captureSceneOGImage(sceneId: string): Promise<string> {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl'],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });

  // Headless viewer mode: loads splat, orbits to canonical angle, signals ready
  await page.goto(
    \`https://splatial-dev.openspacenexus.store/scenes/view?id=\${sceneId}&headless=1\`,
    { waitUntil: 'networkidle0', timeout: 120_000 }
  );
  await page.waitForSelector('[data-og-ready=\"true\"]', { timeout: 90_000 });

  const buffer = await page.screenshot({ type: 'jpeg', quality: 90 });
  await browser.close();

  const url = await uploadToS3(buffer, \`og/\${sceneId}.jpg\`);
  await updateSceneRecord(sceneId, { ogImageUrl: url });
  return url;
}
\`\`\`

**Interim fast path:** capture \`canvas.toDataURL()\` client-side when the creator first views their processed scene, upload as initial thumbnail, then replace with the server-side canonical capture.

## Acceptance criteria
- [ ] Every newly processed scene gets an \`ogImageUrl\` in DynamoDB
- [ ] OG image is 1200×630, JPEG, captured from a canonical scene angle
- [ ] Viewer supports \`?headless=1\` mode that auto-orbits and emits \`data-og-ready\`
- [ ] Existing scenes can be backfilled via a one-time migration script"

# ── ISSUE 14 ──────────────────────────────────────────────────────────────────
gh issue create \
  --repo "$REPO" \
  --title "Add hover-to-preview (MP4) on scene cards in Explore and Home grids" \
  --label "ux,performance,priority:medium" \
  --body "## Problem
Scene cards show static thumbnails only. Users have no way to preview what a 3D scene looks like before committing to a full 50–100 MB download. This increases bounce rate from the viewer page.

## Solution
Generate short looping MP4 preview videos at upload time (a scripted 5-second orbit around the scene bounding sphere, <2 MB). Store \`previewVideoUrl\` alongside \`thumbnailUrl\` on the scene record.

Play the preview on card hover (desktop) or tap-to-preview (mobile):
\`\`\`tsx
function SceneCard({ scene }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className=\"relative overflow-hidden rounded-xl\"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && scene.previewVideoUrl ? (
        <video
          src={scene.previewVideoUrl}
          autoPlay loop muted playsInline
          className=\"absolute inset-0 h-full w-full object-cover\"
        />
      ) : (
        <img src={scene.thumbnailUrl} alt={scene.title} className=\"h-full w-full object-cover\" />
      )}
      {/* File size badge */}
      <span className=\"absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white\">
        {formatBytes(scene.fileSizeBytes)}
      </span>
    </div>
  );
}
\`\`\`
Use \`IntersectionObserver\` to pause video elements that scroll out of view.

## Acceptance criteria
- [ ] Every processed scene has a \`previewVideoUrl\` (MP4, <2 MB, 5s orbit)
- [ ] Desktop: hovering a card plays the preview video
- [ ] Mobile: tap once to preview, tap again to navigate to viewer
- [ ] Videos pause when scrolled out of viewport (IntersectionObserver)
- [ ] Falls back gracefully to static thumbnail if video unavailable"

echo ""
echo "✅ Done — 14 issues created on $REPO"
echo "View them at: https://github.com/$REPO/issues"
