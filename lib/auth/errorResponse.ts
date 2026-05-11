/**
 * Standardized error response για server-side auth helpers.
 *
 * Preserves το client API contract: JSON envelope { error: string }
 * με Content-Type: application/json header. Permits clients να
 * παρσάρουν response.json() και να διαβάζουν data.error reliably.
 *
 * Used by: resolveAuthMember, requireAdmin, requirePermission,
 * και κάθε άλλο server helper που throws Response.
 */
export function errorResponse(
  message: string,
  status: number
): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}
