export default function SceneCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl bg-[#212121]">
      <div className="h-[180px] rounded-t-xl bg-[#2a2a2a]" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-3/4 rounded bg-[#2a2a2a]" />
        <div className="h-3 w-1/3 rounded bg-[#252525]" />
      </div>
    </div>
  );
}
