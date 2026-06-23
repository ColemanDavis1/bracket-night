import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand";

export default function TournamentNotFound() {
  return (
    <div>
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/">
            <BrandMark />
          </Link>
        </div>
      </header>
      <main className="container grid place-items-center py-24 text-center">
        <div className="max-w-sm">
          <h1 className="text-2xl font-extrabold tracking-tight">
            This tournament no longer exists
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have been deleted by the organizer, or the link is incorrect.
          </p>
          <Button asChild className="mt-6">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
