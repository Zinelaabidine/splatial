export default function SceneCardSkeleton() {
  return (
    <div className="sw-glass-card animate-pulse overflow-hidden rounded-xl">
      <div className="aspect-[4/3] bg-white/[0.04]" />
      <div className="sw-card-body space-y-2 px-3 py-2.5">
        <div className="h-3.5 w-3/4 rounded bg-white/10" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded-full bg-white/8" />
            <div className="h-2 w-14 rounded bg-white/6" />
          </div>
          <div className="h-4 w-4 rounded bg-white/6" />
        </div>
        <div className="h-2 w-2/5 rounded bg-white/6" />
      </div>
    </div>
  );
}
