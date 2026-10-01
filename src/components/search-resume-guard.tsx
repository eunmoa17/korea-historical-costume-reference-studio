"use client";

import { useEffect } from "react";
import { SEARCH_VIEW_RESUME_KEY } from "@/lib/search-session";

/** A reload or a closed tab drops the in-app resume mark. The saved view itself stays. */
export function SearchResumeGuard() {
  useEffect(() => {
    function onPageHide() {
      try {
        sessionStorage.removeItem(SEARCH_VIEW_RESUME_KEY);
      } catch {
        // Nothing to clear when storage is blocked.
      }
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);
  return null;
}
