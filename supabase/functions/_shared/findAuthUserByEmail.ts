import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const USERS_PAGE_SIZE = 1000;
/** Safety cap so we never loop forever if the API misbehaves. */
const MAX_PAGES = 500;

/**
 * GoTrue admin listUsers is paginated; email is not a filter on a single page.
 * Finding a user by email requires scanning pages until a match or short read.
 */
export async function findAuthUserByNormalizedEmail(
  admin: SupabaseClient,
  normalizedEmail: string,
): Promise<{ id: string } | null> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PAGE_SIZE });
    if (error) throw error;
    const authUser = data.users.find((u) => (u.email ?? "").toLowerCase() === normalizedEmail);
    if (authUser?.id) return { id: authUser.id };
    if (data.users.length < USERS_PAGE_SIZE) return null;
  }
  return null;
}
