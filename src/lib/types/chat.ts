export type WeatherForecastPoint = {
  date: string;
  high_c: number;
  low_c: number;
  condition: string;
};

export type WeatherCardBlock = {
  type: "weather_card";
  title?: string;
  data: {
    location: string;
    timezone?: string;
    condition: string;
    temperature_c: number;
    feels_like_c?: number;
    wind_speed_kmh?: number;
    high_c?: number;
    low_c?: number;
    updated_at?: string;
    daily?: WeatherForecastPoint[];
  };
};

export type MemoryCardBlock = {
  type: "memory_card";
  title?: string;
  data: {
    query?: string;
    items: Array<{
      id?: string;
      content: string;
      scope?: string;
      updated_at?: string;
      tags?: string[];
    }>;
  };
};

export type TaskBoardCardBlock = {
  type: "task_board_card";
  title?: string;
  data: {
    thread_title: string;
    objective: string;
    current_focus?: string;
    summary?: string;
    open_questions?: string[];
    key_files?: string[];
    artifacts?: Array<{
      title: string;
      ref: string;
      kind?: string;
    }>;
    tasks: Array<{
      title: string;
      status: string;
      assigned_agent_id?: string;
      priority?: string;
    }>;
  };
};

export type SandboxWidgetBlock = {
  type: "sandbox_widget";
  title?: string;
  caption?: string;
  widget_code: string;
  partial?: boolean;
};

export type MessageBlock =
  | WeatherCardBlock
  | MemoryCardBlock
  | TaskBoardCardBlock
  | SandboxWidgetBlock;

export type MessagePart =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "block";
      block: MessageBlock;
    };

export interface ParsedMessageContent {
  rawText: string;
  text: string;
  blocks: MessageBlock[];
  parts: MessagePart[];
}

export interface RuntimeMessageMetadata {
  model?: string;
  toolsUsed?: string[];
  turnCount?: number;
  usage?: Record<string, number | string | boolean | null>;
}
