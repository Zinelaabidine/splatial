import dynamic from "next/dynamic";
import Link from "next/link";

const LegacySplatViewer = dynamic(
  () => import("@/components/viewer/LegacySplatViewer"),
  { ssr: false },
);

type GaussianViewerViewProps = {
  splatUrl: string | null;
  error: string | null;
  loading: boolean;
};

export default function GaussianViewerView({
  splatUrl,
  error,
  loading,
}: GaussianViewerViewProps) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <p className="text-sm text-slate-400">Loading scene…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <p className="max-w-md text-sm text-red-400">{error}</p>
        <Link
          href="/scenes"
          className="text-sm font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline"
        >
          Back to Your Scenes
        </Link>
      </div>
    );
  }

  if (!splatUrl) return null;

  return (
    <div className="relative h-full w-full">
      <LegacySplatViewer splatUrl={splatUrl} />
    </div>
  );
}
