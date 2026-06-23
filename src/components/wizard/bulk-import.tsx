"use client";

import { useRef, useState } from "react";
import { Upload, Users, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parsePlayerNames, previewImport } from "@/lib/import-players";

/** Paste-or-upload bulk player entry for the wizard Players step. */
export function BulkImport({
  existingCount,
  existingNames,
  capacity,
  onImport,
}: {
  existingCount: number;
  existingNames: string[];
  capacity: number;
  onImport: (names: string[]) => void;
}) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = parsePlayerNames(text);
  const preview = previewImport(parsed, existingNames, capacity);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    e.target.value = ""; // allow re-selecting the same file
  }

  function doImport() {
    if (preview.toAdd.length === 0) return;
    onImport(preview.toAdd);
    setText("");
  }

  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-semibold">
        Bulk add — paste a list or upload a file
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"One name per line:\nAlex\nJordan\nSam"}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={onFile}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" /> Upload CSV / TXT
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={doImport}
            disabled={preview.toAdd.length === 0}
          >
            <Users className="h-4 w-4" />
            Import {preview.toAdd.length}{" "}
            {preview.toAdd.length === 1 ? "player" : "players"}
          </Button>
          {parsed.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {preview.toAdd.length} new ({existingCount} currently entered)
            </span>
          ) : null}
        </div>

        {preview.duplicates > 0 || preview.overflow > 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {preview.duplicates > 0
                ? `${preview.duplicates} duplicate name${preview.duplicates === 1 ? "" : "s"} will be skipped. `
                : ""}
              {preview.overflow > 0
                ? `${preview.overflow} over the ${capacity + existingCount}-player cap will be dropped.`
                : ""}
            </span>
          </p>
        ) : null}
      </div>
    </details>
  );
}
