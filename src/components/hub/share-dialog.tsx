"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Download, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * QR code + share card for a tournament's public hub (Feature 10).
 *
 * The QR is generated entirely client-side (no external API). The downloadable
 * card is rendered to PNG with html-to-image from an off-screen node.
 */
export function ShareDialog({
  slug,
  name,
  gameName,
  eventDate,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerLabel = "Share / QR",
  className,
  hideTrigger = false,
  open,
  onOpenChange,
}: {
  slug: string;
  name: string;
  gameName?: string | null;
  eventDate?: string | null;
  triggerVariant?: "outline" | "ghost" | "default";
  triggerSize?: "sm" | "icon" | "default";
  triggerLabel?: string;
  className?: string;
  /** Controlled mode: hide the built-in trigger and drive open externally. */
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}/t/${slug}`);
  }, [slug]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  async function downloadCard() {
    if (!cardRef.current) return;
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(cardRef.current, {
      pixelRatio: 2,
      backgroundColor: "#0a0a0c",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${slug}-share.png`;
    a.click();
  }

  const dateLabel = eventDate
    ? new Date(eventDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {hideTrigger ? null : (
        <DialogTrigger asChild>
          <Button variant={triggerVariant} size={triggerSize} className={className}>
            <QrCode />
            {triggerSize !== "icon" ? triggerLabel : null}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan to follow live</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl bg-white p-4">
            {url ? (
              <QRCodeSVG value={url} size={200} level="M" />
            ) : (
              <div className="h-[200px] w-[200px]" />
            )}
          </div>
          <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">
            {url}
          </code>
          <div className="flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={copyLink}>
              {copied ? <Check className="text-broadcast-green" /> : <Copy />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button className="flex-1" onClick={downloadCard}>
              <Download /> Share card
            </Button>
          </div>
        </div>

        {/* Off-screen branded card rendered to PNG on demand. */}
        <div className="pointer-events-none fixed -left-[9999px] top-0">
          <div
            ref={cardRef}
            className="w-[420px] bg-background p-8 text-center text-foreground"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            <span className="text-xl font-extrabold tracking-tight">
              <span className="rounded-md bg-primary px-2 py-1 text-primary-foreground">
                ⟨⟩
              </span>{" "}
              Bracket Night
            </span>
            <h2 className="mt-5 text-2xl font-extrabold">{name}</h2>
            {gameName ? (
              <p className="mt-1 text-sm text-muted-foreground">{gameName}</p>
            ) : null}
            {dateLabel ? (
              <p className="text-sm text-muted-foreground">{dateLabel}</p>
            ) : null}
            <div className="mt-6 flex justify-center">
              <div className="rounded-xl bg-white p-4">
                {url ? <QRCodeSVG value={url} size={220} level="M" /> : null}
              </div>
            </div>
            <p className="mt-5 text-lg font-bold text-primary">
              Scan to follow live
            </p>
            <p className="mt-1 text-xs text-muted-foreground">/t/{slug}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
