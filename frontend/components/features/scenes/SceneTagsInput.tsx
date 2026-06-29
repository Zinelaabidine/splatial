"use client";

import { useCallback, useState } from "react";
import { X } from "lucide-react";

import {
  MAX_SCENE_TAGS,
  slugifyTag,
  validateTagInput,
} from "@/lib/scenes/tags";
import { cn } from "@/lib/utils";

type SceneTagsInputProps = {
  tags: string[];
  disabled?: boolean;
  onChange: (tags: string[]) => void;
  className?: string;
};

export default function SceneTagsInput({
  tags,
  disabled = false,
  onChange,
  className,
}: SceneTagsInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  const addTag = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      const result = validateTagInput(trimmed);
      if (!result.ok) {
        setInputError(result.error);
        return;
      }

      if (tags.includes(result.slug)) {
        setInputError("Tag already added");
        setInputValue("");
        return;
      }

      if (tags.length >= MAX_SCENE_TAGS) {
        setInputError(`At most ${MAX_SCENE_TAGS} tags allowed`);
        return;
      }

      setInputError(null);
      setInputValue("");
      onChange([...tags, result.slug]);
    },
    [onChange, tags],
  );

  const removeTag = useCallback(
    (slug: string) => {
      setInputError(null);
      onChange(tags.filter((t) => t !== slug));
    },
    [onChange, tags],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1] ?? "");
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) addTag(inputValue);
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div>
        <label htmlFor="scene-tags-input" className="text-xs font-medium text-[#d4d4d4]">
          Tags
        </label>
        <p className="text-[11px] text-[#909090]">
          Up to {MAX_SCENE_TAGS} tags. Press Enter or comma to add.
        </p>
      </div>

      <div
        className={cn(
          "flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-[#404040] bg-[#262626] px-2 py-1.5",
          disabled && "opacity-50",
          inputError && "border-red-800/60",
        )}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-[#363636] px-2 py-0.5 text-xs text-[#e5e5e5]"
          >
            {tag}
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(tag)}
              className="rounded p-0.5 text-[#909090] transition-colors hover:bg-[#404040] hover:text-white disabled:pointer-events-none"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id="scene-tags-input"
          type="text"
          value={inputValue}
          disabled={disabled || tags.length >= MAX_SCENE_TAGS}
          placeholder={tags.length === 0 ? "e.g. outdoor, museum" : tags.length >= MAX_SCENE_TAGS ? "Max tags reached" : "Add tag…"}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (inputError) setInputError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm text-white outline-none placeholder:text-[#737373] disabled:cursor-not-allowed"
        />
      </div>

      {inputError ? (
        <p className="text-xs text-red-400" role="alert">
          {inputError}
        </p>
      ) : inputValue.trim() ? (
        <p className="text-[11px] text-[#737373]">
          Preview: {slugifyTag(inputValue) || "—"}
        </p>
      ) : null}
    </div>
  );
}
