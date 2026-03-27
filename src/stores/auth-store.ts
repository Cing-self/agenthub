import { create } from "zustand";

interface User {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (code: string) => Promise<void>;
  logout: () => void;
  loadFromDisk: () => Promise<void>;
  saveToDisk: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,

  loadFromDisk: async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const data = await invoke<Record<string, unknown>>("read_json_file", {
        path: `${await getAuthPath()}`,
      });
      if (data?.user && data?.token) {
        set({ user: data.user as User, token: data.token as string });
      }
    } catch { /* no saved auth */ }
  },

  saveToDisk: async () => {
    const { user, token } = get();
    if (!user || !token) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_json_file", {
        path: await getAuthPath(),
        data: JSON.stringify({ user, token }, null, 2),
      });
    } catch { /* */ }
  },

  login: async (token: string) => {
    set({ loading: true });
    try {
      // Fetch GitHub user info with the token
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error("GitHub API error");
      const user = await res.json() as User;
      set({ user, token, loading: false });
      get().saveToDisk();
    } catch {
      set({ loading: false });
    }
  },

  logout: () => {
    set({ user: null, token: null });
    // Delete auth file
    import("@tauri-apps/api/core").then(async ({ invoke }) => {
      try { await invoke("write_json_file", { path: await getAuthPath(), data: "{}" }); } catch { /* */ }
    });
  },
}));

async function getAuthPath(): Promise<string> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const agents = await invoke<{ agents: { home_dir: string; agent_type: string }[] }>("detect_agents");
    const any = agents.agents?.[0];
    if (any) {
      const home = any.home_dir.replace(/\/\.[^/]+$/, "");
      return `${home}/.agenthub/auth.json`;
    }
  } catch { /* */ }
  return "/tmp/.agenthub-auth.json";
}
