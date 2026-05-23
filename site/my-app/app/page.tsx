"use client";

import { useCallback } from "react";

import AuthGate from "@/components/AuthGate";
import Dropzone from "@/components/Dropzone";
import Layout from "@/components/Layout";
import RightSidebar from "@/components/RightSidebar";
import { useMultipartUpload } from "@/hooks/useMultipartUpload";

export default function Page() {
  return (
    <AuthGate>
      <Home />
    </AuthGate>
  );
}

function Home() {
  const { uploads, enqueueMany, cancel, remove, clearTerminated, submitJob } =
    useMultipartUpload({
      onComplete: (item) => {
        // eslint-disable-next-line no-console
        console.info("[upload] complete", item.filename, item.sceneId);
      },
      onError: (item, error) => {
        // eslint-disable-next-line no-console
        console.error("[upload] failed", item.filename, error);
      },
    });

  const handleFiles = useCallback(
    (files: File[]) => {
      enqueueMany(files);
    },
    [enqueueMany],
  );

  return (
    <Layout
      rightSidebar={
        <RightSidebar
          uploads={uploads}
          onCancel={cancel}
          onRemove={remove}
          onClearTerminated={clearTerminated}
          onSubmit={submitJob}
        />
      }
    >
      <div className="flex w-full flex-col items-center gap-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            New scene
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Turn a scan into a 3D model
          </h1>
          <p className="max-w-md text-sm text-slate-500">
            Drop a captured scene below. We&apos;ll stream it to S3 in chunks
            and kick off the generation pipeline automatically.
          </p>
        </header>

        <Dropzone onFiles={handleFiles} />

        <p className="text-xs text-slate-400">
          Need an example file?{" "}
          <a
            href="#"
            className="font-medium text-indigo-600 hover:underline"
            onClick={(e) => e.preventDefault()}
          >
            Download a sample .glb
          </a>
        </p>
      </div>
    </Layout>
  );
}
