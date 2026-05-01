"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SponsorsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/finances");
  }, [router]);
  return null;
}
