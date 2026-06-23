"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  MoreVertical,
  ExternalLink,
  Calendar,
  Users,
  Trash2,
  Copy,
  Archive,
  ArchiveRestore,
  AlertTriangle,
  QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteTournament,
  duplicateTournament,
  archiveTournament,
  unarchiveTournament,
} from "@/lib/actions/tournaments";
import { ShareDialog } from "@/components/hub/share-dialog";
import { FORMAT_LABELS } from "@/lib/labels";
import type { TournamentRow } from "@/lib/db";

export type DashboardTournament = TournamentRow & {
  players: { count: number }[];
};

export function TournamentCard({ t }: { t: DashboardTournament }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const archived = t.archived_at != null;

  function onDuplicate() {
    startTransition(async () => {
      await duplicateTournament(t.id);
      // duplicateTournament redirects to the new tournament's manage page.
    });
  }
  function onArchiveToggle() {
    startTransition(async () => {
      if (archived) await unarchiveTournament(t.id);
      else await archiveTournament(t.id);
    });
  }

  return (
    <div className="group relative rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/60">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/t/${t.slug}/manage`} className="min-w-0 flex-1">
          <h3 className="truncate font-bold leading-tight">{t.name}</h3>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={t.status} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Tournament actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/t/${t.slug}/manage`}>
                  <ExternalLink /> Open
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setShareOpen(true);
                }}
              >
                <QrCode /> Share / QR
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onDuplicate();
                }}
                disabled={pending}
              >
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onArchiveToggle();
                }}
                disabled={pending}
              >
                {archived ? (
                  <>
                    <ArchiveRestore /> Unarchive
                  </>
                ) : (
                  <>
                    <Archive /> Archive
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                destructive
                onSelect={(e) => {
                  e.preventDefault();
                  setDeleteOpen(true);
                }}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Link href={`/t/${t.slug}/manage`} className="block">
        <p className="mt-1 text-sm text-muted-foreground">
          {t.game_name || "Game night"} · {FORMAT_LABELS[t.format] ?? t.format}
        </p>
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {t.players?.[0]?.count ?? 0} players
          </span>
          {t.event_date ? (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(t.event_date).toLocaleDateString()}
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Open <ExternalLink className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        id={t.id}
        name={t.name}
        status={t.status}
      />
      <ShareDialog
        hideTrigger
        open={shareOpen}
        onOpenChange={setShareOpen}
        slug={t.slug}
        name={t.name}
        gameName={t.game_name}
        eventDate={t.event_date}
      />
    </div>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  id,
  name,
  status,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  id: string;
  name: string;
  status: TournamentRow["status"];
}) {
  const [pending, startTransition] = useTransition();
  const [confirmName, setConfirmName] = useState("");
  const inProgress = status !== "complete";
  // For in-progress events the organizer must type the exact name to confirm.
  const canDelete = inProgress ? confirmName.trim() === name.trim() : true;

  function onConfirm() {
    if (!canDelete) return;
    startTransition(async () => {
      await deleteTournament(id);
      // deleteTournament redirects to /dashboard on success.
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setConfirmName("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {inProgress ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : null}
            Delete “{name}”?
          </DialogTitle>
          <DialogDescription>
            {inProgress ? (
              <span className="text-destructive">
                This tournament is still in progress — all data (players, scores,
                bracket, and AI previews) will be permanently lost. This cannot be
                undone.
              </span>
            ) : (
              "This permanently removes the tournament and all of its results. This cannot be undone."
            )}
          </DialogDescription>
        </DialogHeader>

        {inProgress ? (
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="confirm-name">
              Type the tournament name to confirm
            </label>
            <Input
              id="confirm-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={name}
              autoComplete="off"
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!canDelete || pending}
          >
            <Trash2 /> {pending ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: TournamentRow["status"] }) {
  if (status === "complete") return <Badge variant="gold">Final</Badge>;
  if (status === "live") return <Badge>Live</Badge>;
  return <Badge variant="muted">Setup</Badge>;
}
