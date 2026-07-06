"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

type AppShellContextValue = {
  search: string;
  setSearch: (value: string) => void;
  searchPlaceholder: string;
  setSearchPlaceholder: (value: string) => void;
  showSearch: boolean;
  setShowSearch: (value: boolean) => void;
  isViewerPage: boolean;
  navOverlayOpen: boolean;
  setNavOverlayOpen: (open: boolean) => void;
  toggleNavOverlay: () => void;
  commentsOverlayOpen: boolean;
  setCommentsOverlayOpen: (open: boolean) => void;
  toggleCommentsOverlay: () => void;
  viewerCommentsCount: number;
  setViewerCommentsCount: (count: number) => void;
  navMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  commentsTriggerRef: RefObject<HTMLButtonElement | null>;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({
  children,
  isViewerPage = false,
}: {
  children: ReactNode;
  isViewerPage?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [searchPlaceholder, setSearchPlaceholder] = useState("Search");
  const [showSearch, setShowSearch] = useState(true);
  const [navOverlayOpen, setNavOverlayOpenState] = useState(false);
  const [commentsOverlayOpen, setCommentsOverlayOpenState] = useState(false);
  const [viewerCommentsCount, setViewerCommentsCount] = useState(0);
  const navMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const commentsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [prevIsViewerPage, setPrevIsViewerPage] = useState(isViewerPage);

  if (isViewerPage !== prevIsViewerPage) {
    setPrevIsViewerPage(isViewerPage);
    if (!isViewerPage) {
      setNavOverlayOpenState(false);
      setCommentsOverlayOpenState(false);
      setViewerCommentsCount(0);
    }
  }

  const setNavOverlayOpen = useCallback((open: boolean) => {
    if (open) setCommentsOverlayOpenState(false);
    setNavOverlayOpenState(open);
  }, []);

  const setCommentsOverlayOpen = useCallback((open: boolean) => {
    if (open) setNavOverlayOpenState(false);
    setCommentsOverlayOpenState(open);
  }, []);

  const toggleNavOverlay = useCallback(() => {
    setNavOverlayOpenState((open) => {
      if (!open) setCommentsOverlayOpenState(false);
      return !open;
    });
  }, []);

  const toggleCommentsOverlay = useCallback(() => {
    setCommentsOverlayOpenState((open) => {
      if (!open) setNavOverlayOpenState(false);
      return !open;
    });
  }, []);

  const value = useMemo(
    () => ({
      search,
      setSearch,
      searchPlaceholder,
      setSearchPlaceholder,
      showSearch,
      setShowSearch,
      isViewerPage,
      navOverlayOpen,
      setNavOverlayOpen,
      toggleNavOverlay,
      commentsOverlayOpen,
      setCommentsOverlayOpen,
      toggleCommentsOverlay,
      viewerCommentsCount,
      setViewerCommentsCount,
      navMenuTriggerRef,
      commentsTriggerRef,
    }),
    [
      search,
      searchPlaceholder,
      showSearch,
      isViewerPage,
      navOverlayOpen,
      setNavOverlayOpen,
      toggleNavOverlay,
      commentsOverlayOpen,
      setCommentsOverlayOpen,
      toggleCommentsOverlay,
      viewerCommentsCount,
      navMenuTriggerRef,
      commentsTriggerRef,
    ],
  );

  return (
    <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
  );
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error("useAppShell must be used within AppShellProvider");
  }
  return ctx;
}

/** Register global header search for the current page. */
export function usePageSearch(placeholder: string, enabled = true) {
  const { search, setSearch, setSearchPlaceholder, setShowSearch } =
    useAppShell();

  useEffect(() => {
    if (!enabled) {
      setShowSearch(false);
      return;
    }
    setSearchPlaceholder(placeholder);
    setShowSearch(true);
    return () => {
      setShowSearch(false);
      setSearch("");
    };
  }, [enabled, placeholder, setSearch, setSearchPlaceholder, setShowSearch]);

  return { search, setSearch };
}
