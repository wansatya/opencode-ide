import { useMemo, useState } from "react";
import { Copy, Check, Info, Lightbulb, AlertTriangle, AlertCircle, ShieldAlert } from "lucide-react";

export function isMarkdownFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ["md", "markdown", "mdown"].includes(ext ?? "");
}

interface MarkdownPreviewProps {
  content: string;
  filePath: string;
}

export default function MarkdownPreview({ content, filePath }: MarkdownPreviewProps) {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const dirPath = useMemo(() => {
    const parts = filePath.split("/");
    parts.pop();
    return parts.join("/");
  }, [filePath]);

  const resolveImageSrc = (src: string) => {
    if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) return src;
    const cleanSrc = src.replace(/^\.\//, "");
    const targetPath = dirPath ? `${dirPath}/${cleanSrc}` : cleanSrc;
    return `/api/raw?path=${encodeURIComponent(targetPath)}`;
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 2000);
  };

  // Custom client-side markdown parser with pre-pass code block extraction
  const renderedElements = useMemo(() => {
    const codeBlocks: { lang: string; code: string }[] = [];
    
    // Extract fenced code blocks ```lang ... ``` first to prevent collisions with paragraph/inline parsers
    const processedContent = content.replace(/```([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang.trim() || "text", code: code.replace(/\r\n/g, "\n") });
      return `\n__CODE_BLOCK_${idx}__\n`;
    });

    const lines = processedContent.split("\n");
    const elements: JSX.Element[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Render Code Block Token
      if (line.trim().startsWith("__CODE_BLOCK_") && line.trim().endsWith("__")) {
        const match = line.trim().match(/^__CODE_BLOCK_(\d+)__$/);
        if (match) {
          const idx = parseInt(match[1], 10);
          const block = codeBlocks[idx];
          if (block) {
            elements.push(
              <div key={`code-block-${idx}-${i}`} className="my-4 rounded-lg border border-[#333333] bg-[#141414] overflow-hidden shadow-lg">
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#1c1c1c] border-b border-[#333333] text-[11px] text-[#B7B1B1]">
                  <span className="font-mono text-[#F1ECEC] font-medium uppercase tracking-wider">{block.lang}</span>
                  <button
                    onClick={() => copyToClipboard(block.code, idx)}
                    className="flex items-center gap-1 hover:text-[#F1ECEC] transition-colors"
                  >
                    {copiedCodeIdx === idx ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    <span>{copiedCodeIdx === idx ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre className="p-3 text-xs font-mono text-[#F1ECEC] overflow-x-auto leading-relaxed whitespace-pre font-normal">
                  <code>{block.code}</code>
                </pre>
              </div>
            );
            i++;
            continue;
          }
        }
      }

      // Headers #
      if (/^#{1,6}\s/.test(line)) {
        const match = line.match(/^(#{1,6})\s+(.*)$/);
        if (match) {
          const level = match[1].length;
          const text = match[2];
          const parsedText = renderFormattedInlineText(text, resolveImageSrc);
          if (level === 1) elements.push(<h1 key={i} className="text-2xl font-bold text-[#F1ECEC] border-b border-[#333333] pb-2 mt-6 mb-3">{parsedText}</h1>);
          else if (level === 2) elements.push(<h2 key={i} className="text-xl font-semibold text-[#F1ECEC] border-b border-[#333333]/60 pb-1 mt-5 mb-2">{parsedText}</h2>);
          else if (level === 3) elements.push(<h3 key={i} className="text-lg font-semibold text-[#F1ECEC] mt-4 mb-2">{parsedText}</h3>);
          else if (level === 4) elements.push(<h4 key={i} className="text-base font-semibold text-[#F1ECEC] mt-3 mb-1">{parsedText}</h4>);
          else elements.push(<h5 key={i} className="text-sm font-semibold text-[#B7B1B1] mt-3 mb-1">{parsedText}</h5>);
          i++;
          continue;
        }
      }

      // GitHub Alerts (> [!NOTE], etc.)
      if (line.trim().startsWith("> [!")) {
        const match = line.trim().match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
        if (match) {
          const alertType = match[1].toUpperCase();
          const alertLines: string[] = [];
          i++;
          while (i < lines.length && lines[i].trim().startsWith(">")) {
            alertLines.push(lines[i].replace(/^>\s?/, ""));
            i++;
          }
          const alertText = alertLines.join("\n");

          const alertStyles: Record<string, { bg: string; border: string; text: string; icon: JSX.Element }> = {
            NOTE: { bg: "bg-blue-950/30", border: "border-blue-500/50", text: "text-blue-300", icon: <Info size={15} /> },
            TIP: { bg: "bg-emerald-950/30", border: "border-emerald-500/50", text: "text-emerald-300", icon: <Lightbulb size={15} /> },
            IMPORTANT: { bg: "bg-purple-950/30", border: "border-purple-500/50", text: "text-purple-300", icon: <AlertCircle size={15} /> },
            WARNING: { bg: "bg-amber-950/30", border: "border-amber-500/50", text: "text-amber-300", icon: <AlertTriangle size={15} /> },
            CAUTION: { bg: "bg-red-950/30", border: "border-red-500/50", text: "text-red-300", icon: <ShieldAlert size={15} /> },
          };
          const style = alertStyles[alertType] ?? alertStyles.NOTE;

          elements.push(
            <div key={i} className={`my-4 p-3.5 rounded-lg border-l-4 ${style.border} ${style.bg} border border-[#333333]`}>
              <div className={`flex items-center gap-1.5 font-semibold text-xs mb-1 ${style.text}`}>
                {style.icon}
                <span>{alertType}</span>
              </div>
              <div className="text-xs text-[#F1ECEC] leading-relaxed">
                {renderFormattedInlineText(alertText, resolveImageSrc)}
              </div>
            </div>
          );
          continue;
        }
      }

      // Blockquotes >
      if (line.trim().startsWith(">")) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          quoteLines.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        elements.push(
          <blockquote key={i} className="my-3 border-l-4 border-[#B7B1B1] pl-3.5 py-1 text-[#B7B1B1] italic bg-[#1c1c1c]/60 rounded-r">
            {renderFormattedInlineText(quoteLines.join(" "), resolveImageSrc)}
          </blockquote>
        );
        continue;
      }

      // Horizontal Rule ---
      if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
        elements.push(<hr key={i} className="my-5 border-[#333333]" />);
        i++;
        continue;
      }

      // Tables | col | col |
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          tableLines.push(lines[i]);
          i++;
        }
        if (tableLines.length >= 2) {
          const parseRow = (rowStr: string) =>
            rowStr
              .split("|")
              .slice(1, -1)
              .map((c) => c.trim());
          const headerCells = parseRow(tableLines[0]);
          const isSeparator = /^\|[\s-:]+\|/.test(tableLines[1]);
          const bodyRows = (isSeparator ? tableLines.slice(2) : tableLines.slice(1)).map(parseRow);

          elements.push(
            <div key={i} className="my-4 overflow-x-auto rounded-lg border border-[#333333]">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-[#1c1c1c] border-b border-[#333333] text-[#F1ECEC]">
                  <tr>
                    {headerCells.map((h, hIdx) => (
                      <th key={hIdx} className="px-3 py-2 font-semibold border-r border-[#333333] last:border-r-0">
                        {renderFormattedInlineText(h, resolveImageSrc)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, rIdx) => (
                    <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-[#141414]" : "bg-[#1c1c1c]"}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 border-t border-[#333333] border-r border-[#333333] last:border-r-0 text-[#B7B1B1]">
                          {renderFormattedInlineText(cell, resolveImageSrc)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      // Lists (- or * or 1.)
      if (/^\s*([-*]|\d+\.)\s/.test(line)) {
        const listItems: { text: string; checked?: boolean }[] = [];
        const isOrdered = /^\s*\d+\.\s/.test(line);

        while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) {
          const l = lines[i];
          const match = l.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
          if (match) {
            let itemText = match[2];
            let checked: boolean | undefined;
            if (itemText.startsWith("[x] ") || itemText.startsWith("[X] ")) {
              checked = true;
              itemText = itemText.slice(4);
            } else if (itemText.startsWith("[ ] ")) {
              checked = false;
              itemText = itemText.slice(4);
            }
            listItems.push({ text: itemText, checked });
          }
          i++;
        }

        const Tag = isOrdered ? "ol" : "ul";
        elements.push(
          <Tag key={i} className={`my-3 text-xs space-y-1 ${isOrdered ? "list-decimal pl-5" : "list-disc pl-5"} text-[#F1ECEC]`}>
            {listItems.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {item.checked !== undefined ? (
                  <span className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={item.checked} readOnly className="rounded accent-[#4B4646] pointer-events-none" />
                    <span className={item.checked ? "line-through text-[#B7B1B1]" : ""}>
                      {renderFormattedInlineText(item.text, resolveImageSrc)}
                    </span>
                  </span>
                ) : (
                  renderFormattedInlineText(item.text, resolveImageSrc)
                )}
              </li>
            ))}
          </Tag>
        );
        continue;
      }

      // Standalone Image ![alt](src)
      if (line.trim().startsWith("![") && line.includes("](")) {
        const match = line.trim().match(/^!\[(.*?)\]\((.*?)\)$/);
        if (match) {
          const alt = match[1];
          const src = resolveImageSrc(match[2]);
          elements.push(
            <div key={i} className="my-4 text-center">
              <img src={src} alt={alt} className="max-w-full h-auto rounded-lg border border-[#333333] mx-auto shadow-md" />
              {alt && <span className="text-[11px] text-[#B7B1B1] mt-1 block">{alt}</span>}
            </div>
          );
          i++;
          continue;
        }
      }

      // Paragraph
      if (line.trim().length > 0) {
        elements.push(
          <p key={i} className="my-2.5 text-xs leading-relaxed text-[#F1ECEC]">
            {renderFormattedInlineText(line, resolveImageSrc)}
          </p>
        );
      }

      i++;
    }

    return elements;
  }, [content, copiedCodeIdx, dirPath]);

  return (
    <div className="h-full w-full flex flex-col bg-[#141414] text-[#F1ECEC] overflow-y-auto p-6 selection:bg-[#4B4646]/80 select-text">
      {renderedElements}
    </div>
  );
}

// Inline formatting helper for bold, italic, inline code, links, images
function renderFormattedInlineText(text: string, resolveImageSrc: (src: string) => string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let keyIdx = 0;

  // Regex patterns for markdown inline syntax (handles triple, double, and single backticks)
  const inlineRegex = /(`{3}[\s\S]*?`{3}|`{2}[\s\S]*?`{2}|`[^`\n]+`|`{1,3}|\!\[.*?\]\(.*?\)|\[.*?\]\(.*?\)|\*\*.*?\*\*|\*.*?\*|~~.*?~~)/g;
  const matches = text.split(inlineRegex);

  for (const part of matches) {
    if (!part) continue;
    keyIdx++;

    // Code tag / backticks
    if (part.startsWith("`")) {
      const match = part.match(/^(`+)([\s\S]*?)\1$/);
      if (match && match[2].length > 0 && part.length > match[1].length * 2) {
        parts.push(
          <code key={keyIdx} className="px-1.5 py-0.5 rounded bg-[#251b14] border border-[#3a2a1f] font-mono text-[11px] text-amber-300">
            {match[2]}
          </code>
        );
      } else {
        parts.push(
          <code key={keyIdx} className="px-1.5 py-0.5 rounded bg-[#251b14] border border-[#3a2a1f] font-mono text-[11px] text-amber-300">
            {part}
          </code>
        );
      }
    }
    // Inline Image ![alt](src)
    else if (part.startsWith("![") && part.includes("](")) {
      const match = part.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (match) {
        parts.push(
          <img key={keyIdx} src={resolveImageSrc(match[2])} alt={match[1]} className="inline-block max-h-48 rounded border border-[#36281e] my-1" />
        );
      } else {
        parts.push(part);
      }
    }
    // Hyperlink [text](url)
    else if (part.startsWith("[") && part.includes("](")) {
      const match = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (match) {
        parts.push(
          <a
            key={keyIdx}
            href={match[2]}
            target="_blank"
            rel="noreferrer"
            className="text-amber-400 hover:text-amber-300 underline font-medium"
          >
            {match[1]}
          </a>
        );
      } else {
        parts.push(part);
      }
    }
    // Bold **text**
    else if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      parts.push(<strong key={keyIdx} className="font-semibold text-amber-200">{part.slice(2, -2)}</strong>);
    }
    // Italic *text*
    else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      parts.push(<em key={keyIdx} className="italic text-[#d6c4b6]">{part.slice(1, -1)}</em>);
    }
    // Strikethrough ~~text~~
    else if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      parts.push(<del key={keyIdx} className="line-through text-[#8a7667]">{part.slice(2, -2)}</del>);
    } else {
      parts.push(part);
    }
  }

  return parts;
}
