import BrandMark from "@/components/marketing/BrandMark";

export default function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--nord-hairline)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-10 sm:flex-row sm:justify-between sm:px-8">
        <BrandMark wordmarkClassName="text-[15px]" />
        <p className="text-sm text-[var(--nord-slate)]">
          © {year} Splatial. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
