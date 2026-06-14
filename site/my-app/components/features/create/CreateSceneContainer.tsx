"use client";

import CreateSceneFormView from "@/components/features/create/CreateSceneFormView";
import { useCreateSceneUpload } from "@/hooks/create/useCreateSceneUpload";

/** Thin coordinator: wires upload services to the create-scene UI. */
export default function CreateSceneContainer() {
  const upload = useCreateSceneUpload();

  return (
    <CreateSceneFormView
      fileInputRef={upload.fileInputRef}
      activeTab={upload.activeTab}
      name={upload.name}
      visibility={upload.visibility}
      file={upload.file}
      isDragging={upload.isDragging}
      gdriveUrl={upload.gdriveUrl}
      stage={upload.stage}
      progress={upload.progress}
      error={upload.error}
      uploading={upload.uploading}
      onNameChange={upload.setName}
      onVisibilityChange={upload.setVisibility}
      onGdriveUrlChange={upload.setGdriveUrl}
      onFileChange={upload.handleFileChange}
      onDrop={upload.handleDrop}
      onDragOver={upload.handleDragOver}
      onDragLeave={upload.handleDragLeave}
      onSubmit={upload.handleSubmit}
      onGdriveSubmit={upload.handleGdriveSubmit}
      onBack={upload.goToLibrary}
      onTabChange={upload.switchTab}
      onOpenFilePicker={upload.openFilePicker}
    />
  );
}
