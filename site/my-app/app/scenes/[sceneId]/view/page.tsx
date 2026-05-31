import AuthGate from "@/components/AuthGate";
import ViewerPageClient from "@/components/dashboard/ViewerPageClient";

// Required for `output: 'export'`. Scene IDs are runtime values so we return
// an empty list and rely on the CDN's SPA fallback (404 → index.html) for
// direct URL access to individual viewer pages.
export function generateStaticParams() {
  return [];
}

interface ViewerPageProps {
  params: Promise<{ sceneId: string }>;
}

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { sceneId } = await params;

  return (
    <AuthGate>
      <ViewerPageClient sceneId={sceneId} />
    </AuthGate>
  );
}
