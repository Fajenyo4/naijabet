"use client";

import { useEffect } from "react";

export const PAGE_READY_EVENT = "naijabet:page-ready";

/** Rendered at the end of each page so the tab bar knows the new content is on screen. */
export default function PageReady({ id }: { id: string }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(PAGE_READY_EVENT, { detail: id }));
  }, [id]);
  return null;
}
