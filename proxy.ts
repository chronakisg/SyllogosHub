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

  // Root '/' = admin dashboard. Non-admin authenticated users
  // redirected σε /portal/profile (temporary block — βλ. 🟣
  // Member Persona Home στο ROADMAP για permanent solution).
  if (request.nextUrl.pathname === '/' && user) {
    const admin = getAdminClient();

    // Step 1: lookup by user_id (post-PR-#44 portal users)
    const byUserId = await admin
      .from('members')
      .select('is_system_admin, is_president, is_hub_admin')
      .eq('user_id', user.id)
      .maybeSingle();

    // Step 2: email ilike fallback για legacy admins χωρίς linked user_id
    const fallback = !byUserId.error && !byUserId.data && user.email
      ? await admin
          .from('members')
          .select('is_system_admin, is_president, is_hub_admin')
          .ilike('email', user.email)
          .maybeSingle()
      : null;

    const member = byUserId.data ?? fallback?.data ?? null;
    const lookupError = byUserId.error ?? fallback?.error ?? null;

    if (lookupError) {
      logger.error("proxy/dashboard-pii-block", "Member lookup failed", {
        userId: user.id,
        userEmail: user.email,
        errorMessage: lookupError.message,
      });
      // Fail-open: don't block legit admins on transient DB errors.
      // Worst case = continued PII exposure για member με existing bug
      // (status quo — δεν επιδεινώνεται).
      return response;
    }

    const isPrivileged = !!member && (
      member.is_system_admin ||
      member.is_president ||
      member.is_hub_admin
    );

    if (!isPrivileged) {
      logger.warn("proxy/dashboard-pii-block", "Non-admin redirected from /", {
        userId: user.id,
        userEmail: user.email,
      });
      return NextResponse.redirect(new URL('/portal/profile', request.url));
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
