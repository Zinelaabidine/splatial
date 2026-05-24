import AuthGate from "@/components/AuthGate";
import ViewerPageClient from "@/components/dashboard/ViewerPageClient";

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
