import { useState } from "react";
import { Search, Loader2, ChevronDown, ChevronRight, FileText, AlertCircle, X, CopyMinus, CopyPlus } from "lucide-react";
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
          <span key={idx} className="bg-[#4B4646] text-[#F1ECEC] font-semibold px-0.5 rounded border border-[#B7B1B1]/40">
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

  const isAllCollapsed = results.length > 0 && results.every((f) => !!collapsedFiles[f.path]);

  const toggleExpandCollapseAll = () => {
    if (isAllCollapsed) {
      setCollapsedFiles({});
    } else {
      const next: Record<string, boolean> = {};
      for (const f of results) next[f.path] = true;
      setCollapsedFiles(next);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeSearch();
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1c1c1c] text-[#F1ECEC] overflow-hidden">
      {/* Header Controls */}
      <div className="p-2.5 border-b border-[#333333] space-y-2 shrink-0">
        <div className="flex items-center justify-between text-xs font-semibold text-[#F1ECEC] tracking-wide">
          <div className="flex items-center gap-1.5">
            <Search size={14} className="text-[#B7B1B1]" />
            <span>WORKSPACE SEARCH</span>
          </div>
          {query && (
            <button
              onClick={clearSearch}
              className="p-1 text-[#B7B1B1] hover:text-[#F1ECEC] hover:bg-[#2c2c2c] rounded transition-colors"
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
            className="w-full pl-8 pr-16 py-1.5 rounded bg-[#141414] border border-[#333333] text-xs text-[#F1ECEC] outline-none focus:border-[#B7B1B1] placeholder:text-[#7c7777]"
          />
          <Search size={13} className="absolute left-2.5 text-[#B7B1B1] pointer-events-none" />

          <div className="absolute right-1.5 flex items-center gap-1">
            <button
              onClick={() => {
                setMatchCase(!matchCase);
                executeSearch();
              }}
              title="Match Case (Aa)"
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${matchCase
                ? "bg-[#4B4646] text-white border-[#B7B1B1] font-bold"
                : "bg-[#262626] text-[#B7B1B1] border-[#333333] hover:text-[#F1ECEC]"
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
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${useRegex
                ? "bg-[#4B4646] text-white border-[#B7B1B1] font-bold"
                : "bg-[#262626] text-[#B7B1B1] border-[#333333] hover:text-[#F1ECEC]"
                }`}
            >
              .*
            </button>
          </div>
        </div>

        {/* Summary info */}
        {query && !isSearching && (
          <div className="text-[11px] text-[#B7B1B1] flex items-center justify-between pt-0.5">
            <span>
              {totalMatches > 0
                ? `${totalMatches} match${totalMatches > 1 ? "es" : ""} in ${filesCount} file${filesCount > 1 ? "s" : ""}`
                : "No matches found"}
            </span>
            <div className="flex items-center gap-1.5">
              {truncated && <span className="text-[#B7B1B1] font-medium">Cap (500) reached</span>}
              {totalMatches > 0 && (
                <button
                  onClick={toggleExpandCollapseAll}
                  className="px-1.5 py-0.5 text-[#B7B1B1] hover:text-[#F1ECEC] transition-colors flex items-center gap-1 text-[10px]"
                  title={isAllCollapsed ? "Expand all file groups" : "Collapse all file groups"}
                >
                  {isAllCollapsed ? <CopyPlus size={12} /> : <CopyMinus size={12} />}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results content */}
      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <div className="flex items-center gap-2 p-4 text-xs text-[#B7B1B1]">
            <Loader2 size={14} className="animate-spin text-[#B7B1B1]" />
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
          <div className="p-4 text-xs text-[#B7B1B1] text-center">
            No results found for &ldquo;<span className="text-[#F1ECEC]">{query}</span>&rdquo;.
          </div>
        )}

        {!isSearching && !query && (
          <div className="p-4 text-xs text-[#B7B1B1] text-center leading-relaxed">
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
                <div key={fileGroup.path} className="border-b border-[#262626] last:border-b-0">
                  {/* File Header */}
                  <button
                    onClick={() => toggleCollapse(fileGroup.path)}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs hover:bg-[#2c2c2c] text-left transition-colors group select-none"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={13} className="text-[#B7B1B1] shrink-0" />
                    ) : (
                      <ChevronDown size={13} className="text-[#B7B1B1] shrink-0" />
                    )}
                    <Icon size={14} className={`${iconClass} shrink-0`} />
                    <span className="font-medium text-[#F1ECEC] truncate flex-1">{fileName}</span>
                    {dirPath && (
                      <span className="text-[10px] text-[#B7B1B1] truncate max-w-[100px]" title={dirPath}>
                        {dirPath}
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#4B4646] text-[#F1ECEC] font-medium shrink-0 ml-1 border border-[#B7B1B1]/30">
                      {fileGroup.matches.length}
                    </span>
                  </button>

                  {/* Matches List */}
                  {!isCollapsed && (
                    <div className="bg-[#141414]/60 py-0.5">
                      {fileGroup.matches.map((m: SearchMatchItem, idx: number) => (
                        <button
                          key={`${fileGroup.path}:${m.line}:${m.column}:${idx}`}
                          onClick={() => jumpTo(fileGroup.path, m.line, m.column, m.matchLength)}
                          className="w-full flex items-start gap-2 px-3 py-1 text-xs hover:bg-[#2c2c2c] text-left transition-colors group cursor-pointer border-l-2 border-transparent hover:border-[#B7B1B1]"
                        >
                          <span className="font-mono text-[11px] text-[#B7B1B1] shrink-0 min-w-[28px] text-right group-hover:text-[#F1ECEC]">
                            {m.line}:
                          </span>
                          <span className="font-mono text-[11px] text-[#F1ECEC] truncate flex-1 leading-snug">
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
