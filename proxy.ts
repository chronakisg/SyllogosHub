import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAdminClient } from "@/lib/supabase/admin";
import { isSafeRedirectPath } from "@/lib/auth/safeRedirect";
import { logger } from "@/lib/utils/logger";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith('/admin') && !user) {
    const loginUrl = new URL('/login', request.url);
    // Πέρναμε το intended path για post-login navigation. Sanitize-άρουμε
    // ως defense-in-depth ακόμα κι αν τα NextRequest paths είναι internal
    // by construction.
    const intendedPath =
      request.nextUrl.pathname + request.nextUrl.search;
    if (isSafeRedirectPath(intendedPath)) {
      loginUrl.searchParams.set('redirect', intendedPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  // /admin/* defense-in-depth: layout είναι layer 2, εδώ layer 1.
  //
  // ΓΙΑΤΙ ΟΧΙ ΓΙΑ /api/admin/*:
  // Το /api/admin namespace είναι mixed authorization model:
  // - /api/admin/clubs* → super_admin only (3 routes)
  // - /api/admin/roles*, /api/admin/users/* → per-club admin (7 routes)
  // Proxy-level super_admin gate σε ολόκληρο namespace θα σπάσει το
  // per-club admin functionality. Authoritative auth gates ζουν per-
  // route μέσω requireSuperAdmin() / requireAdmin() στους handlers.
  //
  // Service-role lookup bypasses RLS — ίδιο pattern με requireSuperAdmin.
  if (request.nextUrl.pathname.startsWith('/admin') && user) {
    const admin = getAdminClient();
    const { data: superAdmin, error: lookupError } = await admin
      .from("super_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      logger.error("proxy/admin-guard", "Super admin lookup failed", {
        userId: user.id,
        path: request.nextUrl.pathname,
        errorMessage: lookupError.message,
      });
      return NextResponse.redirect(new URL('/', request.url));
    }

    if (!superAdmin) {
      logger.warn("proxy/admin-guard", "Non-super-admin blocked from /admin", {
        userId: user.id,
        path: request.nextUrl.pathname,
      });
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  if (request.nextUrl.pathname.startsWith('/portal/profile') && !user) {
    return NextResponse.redirect(new URL('/portal/login', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
