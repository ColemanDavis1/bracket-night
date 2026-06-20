"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <BrandMark size="lg" />
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Organizer sign in</CardTitle>
            <CardDescription>
              Sign in to create and run tournaments. Following along? Public hubs
              need no account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full"
              size="lg"
              onClick={signInWithGoogle}
              disabled={loading}
            >
              {loading ? "Redirecting…" : "Continue with Google"}
            </Button>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            <p className="text-center text-xs text-muted-foreground">
              By continuing you agree to run a fair game night.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
