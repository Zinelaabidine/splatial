import AuthGate from "@/components/layout/AuthGate";
import ProfileOnboardingGate from "@/components/layout/ProfileOnboardingGate";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <ProfileOnboardingGate>{children}</ProfileOnboardingGate>
    </AuthGate>
  );
}
