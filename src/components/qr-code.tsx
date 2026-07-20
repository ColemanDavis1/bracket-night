"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

/**
 * Reusable QR code (client-side SVG, no external API). Used for the public
 * sign-up link and per-team schedule links across the hub, share dialog, and
 * print route. The white padding box keeps it scannable on any background.
 */
export function QrCode({
  value,
  size = 160,
  caption,
  className,
}: {
  value: string;
  size?: number;
  caption?: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <div className="rounded-xl bg-white p-3">
        {value ? (
          <QRCodeSVG value={value} size={size} level="M" />
        ) : (
          <div style={{ width: size, height: size }} />
        )}
      </div>
      {caption ? (
        <span className="max-w-full truncate text-xs text-muted-foreground">
          {caption}
        </span>
      ) : null}
    </div>
  );
}

/**
 * QR for an app-relative path, resolved to an absolute URL on the client.
 * Handy in server-rendered routes (e.g. print) where `window` isn't available.
 */
export function PathQr({
  path,
  size = 160,
  caption,
  className,
}: {
  path: string;
  size?: number;
  caption?: string;
  className?: string;
}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <QrCode
      value={origin ? `${origin}${path}` : ""}
      size={size}
      caption={caption}
      className={className}
    />
  );
}
