export interface Env {
  DB: D1Database;
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function error(message: string, status = 500): Response {
  return json({ success: false, error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // Health
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        status: 'ok',
        service: 'Eve D1 Worker',
        database: 'eve-api-sql',
        endpoints: { query: 'POST /query', batch: 'POST /batch' }
      });
    }

    // Query endpoint
    if (url.pathname === '/query' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { sql, params } = body;
        if (!sql) return error('Missing SQL query', 400);

        const stmt = env.DB.prepare(sql);
        const result = params ? await stmt.bind(...params).all() : await stmt.all();

        return json({
          success: true,
          results: result.results || [],
          meta: result.meta || {}
        });
      } catch (e: any) {
        return error(e.message);
      }
    }

    // Batch endpoint
    if (url.pathname === '/batch' && request.method === 'POST') {
      try {
        const body = await request.json();
        const statements = body.statements || body;
        if (!Array.isArray(statements)) {
          return error('Expected array of statements', 400);
        }
        const prepared = statements.map((s: any) =>
          s.params ? env.DB.prepare(s.sql).bind(...s.params) : env.DB.prepare(s.sql)
        );
        const results = await env.DB.batch(prepared);
        return json({
          success: true,
          results: results.map(r => ({
            results: r.results || [],
            meta: r.meta || {}
          }))
        });
      } catch (e: any) {
        return error(e.message);
      }
    }

    return error('Not found', 404);
  }
};
