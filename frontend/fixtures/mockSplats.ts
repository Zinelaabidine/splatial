import type { Splat, UserAccount } from "@/types/splatworks";

export const MOCK_ACCOUNT: UserAccount = {
  name: "Mara Köhler",
  initials: "MK",
  email: "mara@example.com",
  plan: "Pro plan",
};

export const MOCK_SPLATS: Splat[] = [
  {
    id: "splat-1",
    title: "Ceramic Vase Study",
    subject: "vase",
    splatCount: 1_240_000,
    fileSizeMb: 84,
    createdAt: "3 weeks ago",
    author: MOCK_ACCOUNT,
    preview: {
      baseGradient: "radial-gradient(circle at 50% 42%, #13202b, #0a0d11 72%)",
      tintLayers: ["rgba(120,190,255,.55)"],
      dotSize: 6,
    },
  },
  {
    id: "splat-2",
    title: "Backyard Fountain",
    subject: "fountain",
    splatCount: 1_620_000,
    fileSizeMb: 108,
    createdAt: "3 weeks ago",
    author: MOCK_ACCOUNT,
    preview: {
      baseGradient: "radial-gradient(circle at 50% 44%, #101d2c, #0a0d11 72%)",
      tintLayers: ["rgba(90,160,255,.6)"],
      dotSize: 5,
    },
  },
  {
    id: "splat-3",
    title: "Loft Interior",
    subject: "interior",
    splatCount: 2_100_000,
    fileSizeMb: 142,
    createdAt: "2 weeks ago",
    author: MOCK_ACCOUNT,
    preview: {
      baseGradient: "radial-gradient(circle at 50% 44%, #0f2622, #0a0d11 72%)",
      tintLayers: ["rgba(52,211,153,.5)", "rgba(90,160,255,.35)"],
      dotSize: 6,
    },
  },
  {
    id: "splat-4",
    title: "Forest Trail",
    subject: "trail",
    splatCount: 1_800_000,
    fileSizeMb: 121,
    createdAt: "3 weeks ago",
    author: MOCK_ACCOUNT,
    preview: {
      baseGradient: "radial-gradient(circle at 50% 44%, #0f1c2c, #0a0d11 74%)",
      tintLayers: ["rgba(90,160,255,.5)"],
      dotSize: 7,
    },
  },
  {
    id: "splat-5",
    title: "Desk Setup",
    subject: "desk",
    splatCount: 1_360_000,
    fileSizeMb: 92,
    createdAt: "1 week ago",
    author: MOCK_ACCOUNT,
    preview: {
      baseGradient: "radial-gradient(circle at 50% 44%, #101d2c, #0a0d11 72%)",
      tintLayers: ["rgba(110,175,255,.55)"],
      dotSize: 5,
    },
  },
  {
    id: "splat-6",
    title: "Garden Statue",
    subject: "statue",
    splatCount: 1_510_000,
    fileSizeMb: 91,
    createdAt: "3 weeks ago",
    author: MOCK_ACCOUNT,
    preview: {
      baseGradient: "radial-gradient(circle at 50% 44%, #0f2622, #0a0d11 72%)",
      tintLayers: ["rgba(52,211,153,.5)", "rgba(90,160,255,.35)"],
      dotSize: 6,
    },
  },
];
