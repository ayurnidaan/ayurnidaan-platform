import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/security.ts';

const userBuckets = ['avatars', 'doctor-intake-files', 'doctor-verification-files'] as const;

Deno.serve(async request => {
  const headers = corsHeadersFor(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return Response.json({ error: 'Authentication required' }, { status: 401, headers });
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return Response.json({ error: 'Invalid session' }, { status: 401, headers });
    const body = await request.json();
    if (body.confirmation !== 'DELETE_MY_ACCOUNT') return Response.json({ error: 'Confirmation required' }, { status: 400, headers });
    // Only the verified token owner can be deleted; never accept a user ID from the request.
    async function removeUserFiles() {
      for (const bucket of userBuckets) {
        async function removeFolder(prefix: string): Promise<void> {
          while (true) {
            const { data: files, error: listError } = await admin.storage.from(bucket).list(prefix, { limit: 100 });
            if (listError) throw listError;
            if (!files?.length) break;
            for (const file of files) {
              const path = `${prefix}/${file.name}`;
              if (!file.id) await removeFolder(path);
              else {
                const { error: removeError } = await admin.storage.from(bucket).remove([path]);
                if (removeError) throw removeError;
              }
            }
          }
        }
        await removeFolder(user.id);
      }
    }

    // Remove non-cascading doctor records first, then user-owned objects. The
    // operation is idempotent so a partially completed request can be retried.
    const { error: purgeError } = await admin.rpc('purge_user_data', { p_user_id: user.id });
    if (purgeError) throw purgeError;
    await removeUserFiles();

    // Default hard deletion removes Auth identities/sessions and cascades to
    // patient-owned public rows. Storage policies reject the expired identity
    // immediately even if an already-issued JWT has not reached its exp time.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    // Repeat cleanup after Auth deletion to close races, then prove that no
    // active Auth, Database or Storage record remains before reporting success.
    const { error: finalPurgeError } = await admin.rpc('purge_user_data', { p_user_id: user.id });
    if (finalPurgeError) throw finalPurgeError;
    await removeUserFiles();
    const { data: verification, error: verificationError } = await admin.rpc('verify_user_data_erased', { p_user_id: user.id });
    if (verificationError || !verification?.erased || verification.remaining_records !== 0) {
      throw verificationError ?? new Error('Active-system erasure verification failed');
    }
    return Response.json({ deleted: true, verified: true }, { headers });
  } catch (error) {
    console.error('Account deletion failed', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ error: 'Could not finish deleting your account. Please try again.' }, { status: 500, headers });
  }
});
