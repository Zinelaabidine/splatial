"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/** Matches backend `mentions.js` — only link tokens the server resolved. */
const MENTION_TOKEN_REGEX = /(?<![a-zA-Z0-9_])@([a-z0-9_]{3,20})/gi;

type CommentBodyProps = {
  body: string;
  mentions?: string[];
  className?: string;
};

function buildCommentBodyNodes(body: string, mentions?: string[]): ReactNode[] {
  const resolved = new Set((mentions ?? []).map((handle) => handle.toLowerCase()));
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(MENTION_TOKEN_REGEX.source, MENTION_TOKEN_REGEX.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(body.slice(lastIndex, match.index));
    }

    const token = match[0];
    const handle = match[1];
    const handleLower = handle.toLowerCase();

    if (resolved.has(handleLower)) {
      nodes.push(
        <Link
          key={`mention-${match.index}-${handleLower}`}
          href={`/u/${encodeURIComponent(handleLower)}`}
          className="text-[#19c2ad] hover:underline"
        >
          {token}
        </Link>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < body.length) {
    nodes.push(body.slice(lastIndex));
  }

  return nodes;
}

export default function CommentBody({ body, mentions, className }: CommentBodyProps) {
  const nodes = buildCommentBodyNodes(body, mentions);

  return (
    <p className={className}>
      {nodes.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </p>
  );
}
