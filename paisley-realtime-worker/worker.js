export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight — browsers send OPTIONS before a cross-origin POST.
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // ---- POST /api/create-meeting -------------------------------------
    // Creates a RealtimeKit meeting and returns its ID.
    // Called by startLiveClass() in lms-helpers.js when the host
    // presses "Start Live Class".
    if (url.pathname === '/api/create-meeting' && request.method === 'POST') {
      let body;
      try { body = await request.json(); }
      catch (e) { return json({ error: 'Invalid JSON body.' }, 400); }

      const title = (body && body.title) ? String(body.title) : 'Live Class';

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/realtime/kit/${env.REALTIMEKIT_APP_ID}/meetings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`
          },
          body: JSON.stringify({ title })
        }
      );

      // Read as text first, so we can log the raw response even when
      // Cloudflare returns a non-JSON body (HTML error page, empty, etc.)
      const rawText = await response.text();

      let data;
      try { data = JSON.parse(rawText); }
      catch (e) { data = null; }

      // Log everything to wrangler tail so we can debug from the terminal.
      console.log('create-meeting: status=', response.status);
      console.log('create-meeting: raw=', rawText.slice(0, 1000));

      // Cloudflare RealtimeKit returns the payload under `data`,
      // and the meeting ID is `data.id`.
      if (!response.ok || !data || !data.success || !data.data || !data.data.id) {
        return json({
          error: 'Could not create meeting.',
          cfStatus: response.status,
          cfBody: data || rawText.slice(0, 500)
        }, 500);
      }

      return json({ meetingId: data.data.id }, 200);
    }

    // ---- POST /api/get-token ------------------------------------------
    // Adds a participant to an existing RealtimeKit meeting and returns
    // a per-person auth token. Called by live-class.html for both host
    // and student.
    //
    // Cloudflare RealtimeKit requires `custom_participant_id` on every
    // participant. We send the caller's Firebase UID (or fall back to
    // userName) so each participant has a stable, unique ID.
    //
    // The response field for the token is `data.token`, NOT `authToken`.
    // Verified against a live 201 response.
    if (url.pathname === '/api/get-token' && request.method === 'POST') {
      let body;
      try { body = await request.json(); }
      catch (e) { return json({ error: 'Invalid JSON body.' }, 400); }

      const meetingId = body && body.meetingId;
      const userName = body && body.userName;
      const presetName = (body && body.presetName) || 'student';
      const customParticipantId = (body && body.customParticipantId) || userName;

      if (!meetingId || !userName) {
        return json({ error: 'Missing meetingId or userName.' }, 400);
      }

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/realtime/kit/${env.REALTIMEKIT_APP_ID}/meetings/${meetingId}/participants`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`
          },
          body: JSON.stringify({
            name: userName,
            preset_name: presetName,
            custom_participant_id: customParticipantId
          })
        }
      );

      const rawText = await response.text();
      let data;
      try { data = JSON.parse(rawText); }
      catch (e) { data = null; }

      console.log('get-token: status=', response.status);
      console.log('get-token: raw=', rawText.slice(0, 1000));

      // Token field is `token`, not `authToken`.
      if (!response.ok || !data || !data.success || !data.data || !data.data.token) {
        return json({
          error: 'Could not issue token.',
          cfStatus: response.status,
          cfBody: data || rawText.slice(0, 500)
        }, 500);
      }

      // Return as `authToken` to the browser, since live-class.html reads
      // `tokenData.authToken`. Keeping the frontend untouched.
      return json({ authToken: data.data.token }, 200);
    }

    // ---- Anything else ------------------------------------------------
    return json({ error: 'Not found.' }, 404);
  }
};

// ---------- helpers ----------

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      corsHeaders()
    )
  });
}