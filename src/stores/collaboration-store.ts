import { create } from "zustand";
import type {
  BoardTask,
  ConnectorRef,
  TaskBoard,
  ThreadBundle,
  ThreadRef,
} from "@/lib/types/collaboration";

interface CreateThreadInput {
  title: string;
  goal: string;
  defaultAgentId?: string;
}

interface CreateTaskInput {
  title: string;
  description: string;
  assignedAgentId?: string;
  priority?: string;
}

interface UpsertConnectorInput {
  id?: string;
  name: string;
  type: ConnectorRef["type"];
  status?: ConnectorRef["status"];
  location_label: string;
  auth_mode: ConnectorRef["auth_mode"];
  base_url?: string;
}

async function invokeCollaboration<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

async function loadThreadBundle(threadId: string): Promise<ThreadBundle> {
  return invokeCollaboration<ThreadBundle>("get_thread_bundle", { threadId });
}

interface CollaborationState {
  connectors: ConnectorRef[];
  threads: ThreadRef[];
  selectedThreadId: string | null;
  currentBundle: ThreadBundle | null;
  connectorsLoading: boolean;
  threadsLoading: boolean;
  bundleLoading: boolean;
  savingBoard: boolean;
  creatingThread: boolean;
  creatingTask: boolean;
  renamingThread: boolean;

  loadConnectors: () => Promise<void>;
  loadThreads: () => Promise<void>;
  refreshAll: () => Promise<void>;
  selectThread: (threadId: string | null) => Promise<void>;
  createThread: (input: CreateThreadInput) => Promise<ThreadBundle>;
  renameThread: (threadId: string, title: string) => Promise<void>;
  saveBoard: (board: TaskBoard) => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<void>;
  upsertConnector: (input: UpsertConnectorInput) => Promise<void>;
  deleteConnector: (id: string) => Promise<void>;
}

export const useCollaborationStore = create<CollaborationState>((set, get) => ({
  connectors: [],
  threads: [],
  selectedThreadId: null,
  currentBundle: null,
  connectorsLoading: true,
  threadsLoading: true,
  bundleLoading: false,
  savingBoard: false,
  creatingThread: false,
  creatingTask: false,
  renamingThread: false,

  loadConnectors: async () => {
    set({ connectorsLoading: true });
    try {
      const connectors = await invokeCollaboration<ConnectorRef[]>("list_connectors");
      set({ connectors, connectorsLoading: false });
    } catch (error) {
      console.error("Failed to load connectors:", error);
      set({ connectorsLoading: false });
    }
  },

  loadThreads: async () => {
    set({ threadsLoading: true });
    try {
      const threads = await invokeCollaboration<ThreadRef[]>("list_threads");
      const { selectedThreadId } = get();
      const nextSelectedId = threads.some((thread) => thread.id === selectedThreadId)
        ? selectedThreadId
        : threads[0]?.id ?? null;

      set({ threads, selectedThreadId: nextSelectedId, threadsLoading: false });

      if (nextSelectedId) {
        const bundle = await loadThreadBundle(nextSelectedId);
        set({ currentBundle: bundle });
      } else {
        set({ currentBundle: null });
      }
    } catch (error) {
      console.error("Failed to load threads:", error);
      set({ threadsLoading: false });
    }
  },

  refreshAll: async () => {
    await Promise.all([get().loadConnectors(), get().loadThreads()]);
  },

  selectThread: async (threadId) => {
    if (!threadId) {
      set({ selectedThreadId: null, currentBundle: null });
      return;
    }

    set({ selectedThreadId: threadId, bundleLoading: true });
    try {
      const bundle = await loadThreadBundle(threadId);
      set({ currentBundle: bundle, bundleLoading: false });
    } catch (error) {
      console.error("Failed to load thread bundle:", error);
      set({ bundleLoading: false });
    }
  },

  createThread: async ({ title, goal, defaultAgentId }) => {
    set({ creatingThread: true });
    try {
      const bundle = await invokeCollaboration<ThreadBundle>("create_thread", {
        title,
        goal,
        defaultAgentId: defaultAgentId || null,
      });

      set((state) => ({
        threads: [bundle.thread, ...state.threads],
        selectedThreadId: bundle.thread.id,
        currentBundle: bundle,
        creatingThread: false,
      }));
      return bundle;
    } catch (error) {
      console.error("Failed to create thread:", error);
      set({ creatingThread: false });
      throw error;
    }
  },

  renameThread: async (threadId, title) => {
    set({ renamingThread: true });
    try {
      const thread = await invokeCollaboration<ThreadRef>("rename_thread", {
        threadId,
        title,
      });

      set((state) => ({
        threads: state.threads.map((item) => (item.id === thread.id ? thread : item)),
        currentBundle:
          state.currentBundle?.thread.id === thread.id
            ? {
                ...state.currentBundle,
                thread,
              }
            : state.currentBundle,
        renamingThread: false,
      }));

      if (get().selectedThreadId === thread.id) {
        const bundle = await loadThreadBundle(thread.id);
        set({ currentBundle: bundle });
      }
    } catch (error) {
      console.error("Failed to rename thread:", error);
      set({ renamingThread: false });
      throw error;
    }
  },

  saveBoard: async (board) => {
    set({ savingBoard: true });
    try {
      const savedBoard = await invokeCollaboration<TaskBoard>("upsert_board", { board });
      const { selectedThreadId, currentBundle } = get();

      if (!selectedThreadId) {
        set({ savingBoard: false });
        return;
      }

      const nextBundle = currentBundle
        ? { ...currentBundle, board: savedBoard }
        : await loadThreadBundle(selectedThreadId);

      set((state) => ({
        currentBundle: nextBundle,
        threads: state.threads.map((thread) =>
          thread.id === nextBundle.thread.id
            ? { ...thread, updated_at: savedBoard.updated_at }
            : thread,
        ),
        savingBoard: false,
      }));

      const refreshed = await loadThreadBundle(selectedThreadId);
      set({ currentBundle: refreshed });
    } catch (error) {
      console.error("Failed to save board:", error);
      set({ savingBoard: false });
      throw error;
    }
  },

  createTask: async ({ title, description, assignedAgentId, priority }) => {
    const { selectedThreadId } = get();
    if (!selectedThreadId) return;

    set({ creatingTask: true });
    try {
      await invokeCollaboration<BoardTask>("create_board_task", {
        threadId: selectedThreadId,
        title,
        description,
        assignedAgentId: assignedAgentId || null,
        priority: priority || null,
      });

      const bundle = await loadThreadBundle(selectedThreadId);
      set((state) => ({
        currentBundle: bundle,
        threads: state.threads.map((thread) =>
          thread.id === bundle.thread.id ? bundle.thread : thread,
        ),
        creatingTask: false,
      }));
    } catch (error) {
      console.error("Failed to create task:", error);
      set({ creatingTask: false });
      throw error;
    }
  },

  upsertConnector: async ({
    id,
    name,
    type,
    status,
    location_label,
    auth_mode,
    base_url,
  }) => {
    try {
      await invokeCollaboration<ConnectorRef>("upsert_connector", {
        connector: {
          id: id || "",
          name,
          type,
          status: status || "offline",
          location_label,
          auth_mode,
          base_url: base_url || null,
          capabilities: {
            list_agents: true,
            get_health: true,
            read_config: type !== "cloud",
            write_config: false,
            launch_agent: false,
            stop_agent: false,
            stream_logs: false,
            create_or_resume_session: true,
            submit_handoff: true,
          },
          metadata: null,
        },
      });

      await get().loadConnectors();
    } catch (error) {
      console.error("Failed to save connector:", error);
      throw error;
    }
  },

  deleteConnector: async (id) => {
    try {
      await invokeCollaboration("delete_connector", { id });
      set((state) => ({
        connectors: state.connectors.filter((connector) => connector.id !== id),
      }));
      await get().loadConnectors();
    } catch (error) {
      console.error("Failed to delete connector:", error);
      throw error;
    }
  },
}));
