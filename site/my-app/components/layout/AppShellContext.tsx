"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AppShellContextValue = {
  search: string;
  setSearch: (value: string) => void;
  searchPlaceholder: string;
  setSearchPlaceholder: (value: string) => void;
  showSearch: boolean;
  setShowSearch: (value: boolean) => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  const [searchPlaceholder, setSearchPlaceholder] = useState("Search");
  const [showSearch, setShowSearch] = useState(true);

  const value = useMemo(
    () => ({
      search,
      setSearch,
      searchPlaceholder,
      setSearchPlaceholder,
      showSearch,
      setShowSearch,
    }),
    [search, searchPlaceholder, showSearch],
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
