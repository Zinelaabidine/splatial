"use client";

import AuthGate from "@/components/AuthGate";
import Layout from "@/components/Layout";

export default function Page() {
  return (
    <AuthGate>
      <Layout>
        <div className="flex flex-col items-center text-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Ready to generate
          </h1>
          <p className="max-w-sm text-sm text-slate-500">
            Phase 1 shell is mounted. The dropzone, upload hook, and queue tracker
            land in the next phases.
          </p>
        </div>
      </Layout>
    </AuthGate>
  );
}
