import { describe, expect, it, vi } from "vitest";

import { ensureSession, SESSION_URL } from "./session";

const makeSupabase = (session: unknown = null, setError: unknown = null) => ({
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session } }),
    setSession: vi.fn().mockResolvedValue({ error: setError }),
  },
});

const reply = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("ensureSession", () => {
  it("does nothing when a session is already stored", async () => {
    const supabase = makeSupabase({ access_token: "a" });
    const fetchMock = reply(200);
    expect(await ensureSession(supabase as any, fetchMock)).toBe("ready");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the console session with credentials and sets it", async () => {
    const supabase = makeSupabase();
    const fetchMock = reply(200, { access_token: "at", refresh_token: "rt" });
    expect(await ensureSession(supabase as any, fetchMock)).toBe("ready");
    expect(fetchMock).toHaveBeenCalledWith(SESSION_URL, {
      credentials: "include",
    });
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
  });

  it("reports unauthorized on 401 and sets nothing", async () => {
    const supabase = makeSupabase();
    expect(await ensureSession(supabase as any, reply(401))).toBe(
      "unauthorized",
    );
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it("reports an error on other failures and malformed bodies", async () => {
    expect(await ensureSession(makeSupabase() as any, reply(500))).toBe(
      "error",
    );
    expect(
      await ensureSession(
        makeSupabase() as any,
        reply(200, { access_token: 1 }),
      ),
    ).toBe("error");
    const network = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await ensureSession(makeSupabase() as any, network)).toBe("error");
  });

  it("reports an error when setSession fails", async () => {
    const supabase = makeSupabase(null, new Error("bad token"));
    const fetchMock = reply(200, { access_token: "at", refresh_token: "rt" });
    expect(await ensureSession(supabase as any, fetchMock)).toBe("error");
  });
});
