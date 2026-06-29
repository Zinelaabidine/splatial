import PublicProfilePageClient from "./PublicProfilePageClient";

/** Static export: profile usernames load client-side; placeholder satisfies build. */
export function generateStaticParams() {
  return [{ username: "__placeholder__" }];
}

export default function PublicProfilePage() {
  return <PublicProfilePageClient />;
}
