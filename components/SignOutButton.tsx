"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/neon/client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    try {
      const neon = createClient();
      await neon.auth.signOut();
    } catch {
      // Local demo mode does not always have production auth configured.
    }
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" className="w-full justify-start" onClick={signOut}>
      <LogOut className="h-4 w-4" />
      Log out
    </Button>
  );
}
