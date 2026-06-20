type SplatworksLogoProps = {
  variant?: "dark" | "light";
  className?: string;
};

export default function SplatworksLogo({
  variant = "dark",
  className,
}: SplatworksLogoProps) {
  const fill = variant === "dark" ? "#19c2ad" : "#0e8a7d";
  const textColor = variant === "dark" ? "#f4f7fa" : "#1a1a18";

  return (
    <div className={className}>
      <div className="flex items-center gap-2.5 px-2">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
          <circle cx="7" cy="8" r="3" fill={fill} />
          <circle cx="15" cy="6" r="2.4" fill={fill} opacity="0.7" />
          <circle cx="13" cy="14" r="3.4" fill={fill} opacity="0.5" />
          <circle cx="6" cy="15" r="2" fill={fill} opacity="0.85" />
        </svg>
        <span
          className="text-base font-bold tracking-[-0.01em]"
          style={{ color: textColor }}
        >
          Splatworks
        </span>
      </div>
    </div>
  );
}

export function UserAvatar({
  initials,
  size = 32,
  className,
}: {
  initials: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #0e8a7d, #19c2ad)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: size <= 20 ? 9 : 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
