"use client";

/**
 * The multi-stage pipeline editor, shared by the create wizard and the Settings
 * tab. An organizer who builds a pipeline before knowing the head count needs to
 * be able to change it afterwards, so this cannot live only in the wizard.
 */
import { ArrowRight, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { nextPow2 } from "@/lib/engine";
import type { StageConfig, StageKindName } from "@/lib/engine";

const STAGE_KIND_OPTIONS: { value: StageKindName; label: string }[] = [
  { value: "group", label: "Group stage" },
  { value: "round_robin", label: "Round robin" },
  { value: "single_elim", label: "Single elimination" },
  { value: "double_elim", label: "Double elimination" },
  { value: "triple_elim", label: "Triple elimination" },
];

function stageKindOf(s: StageConfig): StageKindName {
  if (s.type === "knockout") return s.format;
  return s.type as StageKindName;
}

function comb2(n: number): number {
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

export interface StagePreviewRow {
  index: number;
  kind: StageKindName;
  entrants: number;
  after: number;
  matches: number;
}

/** Pure live-preview of how the field narrows through the pipeline. */
export function stagePreview(entrants: number, stages: StageConfig[]): StagePreviewRow[] {
  const rows: StagePreviewRow[] = [];
  let n = entrants;
  stages.forEach((s, index) => {
    const kind = stageKindOf(s);
    let after = 1;
    let matches = 0;
    if (s.type === "group") {
      const g = Math.max(1, s.numGroups);
      after = Math.min(n, g * Math.max(1, s.advancePerGroup));
      // Even split of n into g groups, summing intra-group round-robin matches.
      const base = Math.floor(n / g);
      const extra = n % g;
      for (let i = 0; i < g; i++) matches += comb2(base + (i < extra ? 1 : 0));
      if (s.doubleRoundRobin) matches *= 2;
    } else if (kind === "round_robin") {
      const double = s.type === "round_robin" ? s.double : false;
      matches = comb2(n) * (double ? 2 : 1);
      after = 1;
    } else if (kind === "single_elim") {
      matches = Math.max(0, nextPow2(n) - 1);
      after = 1;
    } else if (kind === "double_elim") {
      matches = Math.max(0, 2 * n - 1);
      after = 1;
    } else {
      matches = Math.max(0, 3 * (n - 1));
      after = 1;
    }
    rows.push({ index, kind, entrants: n, after, matches });
    n = after;
  });
  return rows;
}

export function StagePipeline({
  entrants,
  stages,
  onChange,
}: {
  entrants: number;
  stages: StageConfig[];
  onChange: (s: StageConfig[]) => void;
}) {
  const preview = stagePreview(entrants, stages);

  function update(i: number, next: StageConfig) {
    onChange(stages.map((s, idx) => (idx === i ? next : s)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const copy = stages.slice();
    [copy[i], copy[j]] = [copy[j] as StageConfig, copy[i] as StageConfig];
    onChange(copy);
  }
  function remove(i: number) {
    if (stages.length <= 1) return;
    onChange(stages.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...stages, { type: "single_elim" }]);
  }
  function setKind(i: number, kind: StageKindName) {
    const next: StageConfig =
      kind === "group"
        ? { type: "group", numGroups: 4, advancePerGroup: 2, draw: "random" }
        : kind === "round_robin"
          ? { type: "round_robin", double: false }
          : { type: kind };
    update(i, next);
  }

  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-muted-foreground">
        Build a pipeline of stages. Each stage narrows the field; the last stage
        crowns the champion.
      </p>

      {/* Visual timeline */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <Badge variant="muted">{entrants} players</Badge>
        {preview.map((p) => (
          <span key={p.index} className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <Badge>
              {STAGE_KIND_OPTIONS.find((o) => o.value === p.kind)?.label} →{" "}
              {p.after}
            </Badge>
          </span>
        ))}
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <Badge variant="muted">🏆 Champion</Badge>
      </div>

      {stages.map((stage, i) => {
        const kind = stageKindOf(stage);
        const row = preview[i];
        const entersKnockout =
          (kind === "single_elim" ||
            kind === "double_elim" ||
            kind === "triple_elim") &&
          row !== undefined &&
          (row.entrants & (row.entrants - 1)) !== 0;
        return (
          <div
            key={i}
            className="space-y-3 rounded-lg border border-border p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Stage {i + 1}</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => move(i, 1)}
                  disabled={i === stages.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(i)}
                  disabled={stages.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Field label="Stage type">
              <Select
                value={kind}
                onValueChange={(v) => setKind(i, v as StageKindName)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {stage.type === "group" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Number of groups">
                  <Input
                    type="number"
                    min={1}
                    value={stage.numGroups}
                    onChange={(e) =>
                      update(i, {
                        ...stage,
                        numGroups: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </Field>
                <Field label="Advance per group">
                  <Select
                    value={String(stage.advancePerGroup)}
                    onValueChange={(v) =>
                      update(i, { ...stage, advancePerGroup: Number(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Top 1</SelectItem>
                      <SelectItem value="2">Top 2</SelectItem>
                      <SelectItem value="3">Top 3</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Toggle
                    checked={Boolean(stage.doubleRoundRobin)}
                    onChange={(v) =>
                      update(i, { ...stage, doubleRoundRobin: v })
                    }
                    label="Double round robin within each group"
                  />
                </div>
              </div>
            )}

            {stage.type === "round_robin" && (
              <Toggle
                checked={Boolean(stage.double)}
                onChange={(v) => update(i, { ...stage, double: v })}
                label="Double round robin (everyone plays everyone twice)"
              />
            )}

            <p className="text-xs text-muted-foreground">
              {row?.entrants} enter → {row?.after} advance · ~{row?.matches}{" "}
              matches
              {entersKnockout
                ? ` · byes applied (padded to ${nextPow2(row!.entrants)})`
                : ""}
            </p>
          </div>
        );
      })}

      <Button type="button" variant="outline" onClick={add}>
        <Plus /> Add stage
      </Button>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className="mb-1.5 block">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
