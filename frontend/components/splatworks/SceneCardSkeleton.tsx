export default function SceneCardSkeleton() {
  return (
    <div className="sw-glass-card animate-pulse rounded-2xl">
      <div className="h-[200px] rounded-t-2xl bg-white/5" />
      <div className="space-y-2 px-3 py-2.5">
        <div className="h-3.5 w-3/4 rounded bg-white/10" />
        <div className="h-2.5 w-1/3 rounded bg-white/5" />
      </div>
    </div>
  );
}
