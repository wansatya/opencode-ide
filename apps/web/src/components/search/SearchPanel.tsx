import { useState } from "react";
import { Search, Loader2, ChevronDown, ChevronRight, FileText, AlertCircle, X } from "lucide-react";
import { useSearch, SearchFileGroup, SearchMatchItem } from "../../stores/search";
import { getFileIcon } from "../repository/fileIcons";

function HighlightText({ text, query, matchCase, useRegex }: { text: string; query: string; matchCase: boolean; useRegex: boolean }) {
  if (!query) return <span>{text}</span>;

  let parts: { text: string; isMatch: boolean }[] = [];
  try {
    let re: RegExp;
    if (useRegex) {
      re = new RegExp(`(${query})`, matchCase ? "g" : "gi");
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      re = new RegExp(`(${escaped})`, matchCase ? "g" : "gi");
    }

    const split = text.split(re);
    parts = split.map((part) => {
      const isMatch = useRegex
        ? re.test(part)
        : matchCase
        ? part === query
        : part.toLowerCase() === query.toLowerCase();
      return { text: part, isMatch };
    });
  } catch {
    parts = [{ text, isMatch: false }];
  }

  return (
    <span>
      {parts.map((p, idx) =>
        p.isMatch ? (
          <span key={idx} className="bg-amber-500/30 text-amber-200 font-semibold px-0.5 rounded">
            {p.text}
          </span>
        ) : (
          <span key={idx}>{p.text}</span>
        )
      )}
    </span>
  );
}

export default function SearchPanel() {
  const {
    query,
    matchCase,
    useRegex,
    isSearching,
    totalMatches,
    filesCount,
    truncated,
    results,
    error,
    setQuery,
    setMatchCase,
    setUseRegex,
    executeSearch,
    clearSearch,
    jumpTo,
  } = useSearch();

  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  const toggleCollapse = (filePath: string) => {
    setCollapsedFiles((prev) => ({ ...prev, [filePath]: !prev[filePath] }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeSearch();
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1a130f] text-[#ece1d8] overflow-hidden">
      {/* Header Controls */}
      <div className="p-2.5 border-b border-[#36281e] space-y-2 shrink-0">
        <div className="flex items-center justify-between text-xs font-semibold text-amber-200 tracking-wide">
          <div className="flex items-center gap-1.5">
            <Search size={14} className="text-amber-400" />
            <span>WORKSPACE SEARCH</span>
          </div>
          {query && (
            <button
              onClick={clearSearch}
              className="p-1 text-[#9e8b7d] hover:text-[#ece1d8] hover:bg-[#2e2118] rounded transition-colors"
              title="Clear Search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Input box */}
        <div className="relative flex items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search text in files…"
            className="w-full pl-8 pr-16 py-1.5 rounded bg-[#140f0c] border border-[#36281e] text-xs text-[#ece1d8] outline-none focus:border-[#d97706] placeholder:text-[#6e5a4c]"
          />
          <Search size={13} className="absolute left-2.5 text-[#9e8b7d] pointer-events-none" />

          <div className="absolute right-1.5 flex items-center gap-1">
            <button
              onClick={() => {
                setMatchCase(!matchCase);
                executeSearch();
              }}
              title="Match Case (Aa)"
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                matchCase
                  ? "bg-amber-700 text-white border-amber-600 font-bold"
                  : "bg-[#2e2118] text-[#9e8b7d] border-[#36281e] hover:text-[#ece1d8]"
              }`}
            >
              Aa
            </button>
            <button
              onClick={() => {
                setUseRegex(!useRegex);
                executeSearch();
              }}
              title="Use Regular Expression (.*)"
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                useRegex
                  ? "bg-amber-700 text-white border-amber-600 font-bold"
                  : "bg-[#2e2118] text-[#9e8b7d] border-[#36281e] hover:text-[#ece1d8]"
              }`}
            >
              .*
            </button>
          </div>
        </div>

        {/* Summary info */}
        {query && !isSearching && (
          <div className="text-[11px] text-[#9e8b7d] flex items-center justify-between">
            <span>
              {totalMatches > 0
                ? `${totalMatches} match${totalMatches > 1 ? "es" : ""} in ${filesCount} file${filesCount > 1 ? "s" : ""}`
                : "No matches found"}
            </span>
            {truncated && <span className="text-amber-400/90 font-medium">Cap (500) reached</span>}
          </div>
        )}
      </div>

      {/* Results content */}
      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <div className="flex items-center gap-2 p-4 text-xs text-[#9e8b7d]">
            <Loader2 size={14} className="animate-spin text-amber-400" />
            <span>Searching across files…</span>
          </div>
        )}

        {error && (
          <div className="p-3 text-xs text-red-400 bg-red-950/30 border-b border-red-900/40 flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!isSearching && !error && query && results.length === 0 && (
          <div className="p-4 text-xs text-[#9e8b7d] text-center">
            No results found for &ldquo;<span className="text-[#ece1d8]">{query}</span>&rdquo;.
          </div>
        )}

        {!isSearching && !query && (
          <div className="p-4 text-xs text-[#8c7767] text-center leading-relaxed">
            Type text in the search bar above or on the topbar to find matches across your project files.
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="py-1">
            {results.map((fileGroup: SearchFileGroup) => {
              const fileName = fileGroup.path.split("/").pop() ?? fileGroup.path;
              const dirPath = fileGroup.path.includes("/")
                ? fileGroup.path.substring(0, fileGroup.path.lastIndexOf("/"))
                : "";
              const { Icon, className: iconClass } = getFileIcon(fileName);
              const isCollapsed = !!collapsedFiles[fileGroup.path];

              return (
                <div key={fileGroup.path} className="border-b border-[#281e17] last:border-b-0">
                  {/* File Header */}
                  <button
                    onClick={() => toggleCollapse(fileGroup.path)}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs hover:bg-[#281f18] text-left transition-colors group select-none"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={13} className="text-[#9e8b7d] shrink-0" />
                    ) : (
                      <ChevronDown size={13} className="text-[#9e8b7d] shrink-0" />
                    )}
                    <Icon size={14} className={`${iconClass} shrink-0`} />
                    <span className="font-medium text-[#ece1d8] truncate flex-1">{fileName}</span>
                    {dirPath && (
                      <span className="text-[10px] text-[#7c6a5c] truncate max-w-[100px]" title={dirPath}>
                        {dirPath}
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#2e2118] text-amber-300 font-medium shrink-0 ml-1 border border-[#36281e]">
                      {fileGroup.matches.length}
                    </span>
                  </button>

                  {/* Matches List */}
                  {!isCollapsed && (
                    <div className="bg-[#140f0c]/60 py-0.5">
                      {fileGroup.matches.map((m: SearchMatchItem, idx: number) => (
                        <button
                          key={`${fileGroup.path}:${m.line}:${m.column}:${idx}`}
                          onClick={() => jumpTo(fileGroup.path, m.line, m.column, m.matchLength)}
                          className="w-full flex items-start gap-2 px-3 py-1 text-xs hover:bg-[#33251b] text-left transition-colors group cursor-pointer border-l-2 border-transparent hover:border-amber-500"
                        >
                          <span className="font-mono text-[11px] text-[#8c7767] shrink-0 min-w-[28px] text-right group-hover:text-amber-400">
                            {m.line}:
                          </span>
                          <span className="font-mono text-[11px] text-[#c2ab99] truncate flex-1 leading-snug">
                            <HighlightText
                              text={m.text}
                              query={query}
                              matchCase={matchCase}
                              useRegex={useRegex}
                            />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
