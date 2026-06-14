import dynamic from "next/dynamic";

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
      <div className="flex h-full items-center justify-center bg-black">
        <p className="text-sm text-red-400">{error}</p>
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
