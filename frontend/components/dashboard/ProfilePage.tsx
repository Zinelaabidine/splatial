"use client";

import { Camera, Lock, Loader2 } from "lucide-react";

import { useProfile } from "@/hooks/profile/useProfile";

interface ProfilePageProps {
  onBack?: () => void;
}

export default function ProfilePage({ onBack }: ProfilePageProps) {
  const {
    email,
    loading,
    saving,
    saveSuccess,
    saveError,
    fullName,
    setFullName,
    phone,
    setPhone,
    initials,
    handleSave,
  } = useProfile();

  return (
    <div className="min-h-full bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Profile Settings</h1>

        {loading ? (
          /* ── Loading skeleton ────────────────────────────────────── */
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-6 border-b border-gray-100 px-6 py-6">
              <div className="h-20 w-20 animate-pulse rounded-full bg-gray-200" />
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-48 animate-pulse rounded bg-gray-100" />
              </div>
            </div>
            <div className="space-y-4 px-6 py-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
                  <div className="h-10 w-full animate-pulse rounded-lg bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* ── Avatar ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-6 border-b border-gray-100 px-6 py-6">
              <div className="relative">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-purple-100 text-2xl font-bold text-purple-700">
                  {initials}
                </div>
                <button
                  type="button"
                  className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-purple-600 text-white shadow-sm transition hover:bg-purple-700"
                  aria-label="Change photo"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">
                  {fullName || email}
                </p>
                <p className="text-sm text-gray-500">{email}</p>
                <button
                  type="button"
                  className="mt-1.5 text-sm font-medium text-purple-600 hover:text-purple-700"
                >
                  Change Photo
                </button>
              </div>
            </div>

            {/* ── Personal Information ──────────────────────────────── */}
            <div className="px-6 py-6">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Personal Information
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="fullName"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Full Name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    readOnly
                    className="h-10 w-full cursor-not-allowed rounded-lg border border-gray-100 bg-gray-50 px-3 text-sm text-gray-500 outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Managed by your identity provider.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                  />
                </div>
              </div>
            </div>

            {/* ── Security ─────────────────────────────────────────── */}
            <div className="border-t border-gray-100 px-6 py-6">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Security
              </h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Password</p>
                  <p className="text-sm text-gray-500">
                    Last changed 30 days ago.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  <Lock className="h-4 w-4" />
                  Change Password
                </button>
              </div>
            </div>

            {/* ── Footer Actions ───────────────────────────────────── */}
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-4">
              <div>
                {saveSuccess && (
                  <p className="text-sm font-medium text-green-600">
                    Changes saved successfully.
                  </p>
                )}
                {saveError && (
                  <p className="text-sm text-red-600">{saveError}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
