import AuthGate from "@/components/AuthGate";
import Layout from "@/components/Layout";
import ViewerShell from "@/components/ViewerShell";

interface ViewerPageProps {
  params: Promise<{ sceneId: string }>;
}

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { sceneId } = await params;

  return (
    <AuthGate>
      <Layout activeNav="library">
        <div className="flex h-[calc(100vh-4rem)] w-full flex-col">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
            <a
              href="/scenes"
              className="text-sm text-indigo-600 hover:underline"
            >
              ← Back to Scenes
            </a>
            <span className="text-sm text-slate-400">Scene Viewer</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <ViewerShell sceneId={sceneId} />
          </div>
        </div>
      </Layout>
    </AuthGate>
  );
}
