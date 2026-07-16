const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://192.168.50.1:8000";

/* ================================
   COMMON TYPES
================================ */

export type NodeStatus = "online" | "offline" | "unknown" | "degraded";

export type HealthStatus =
  | "online"
  | "offline"
  | "normal"
  | "warning"
  | "critical"
  | "unknown";

export type TemperatureStatus =
  | "normal"
  | "warning"
  | "critical"
  | "unknown";

export type AlertSeverity = "info" | "warning" | "critical" | "error";

/* ================================
   MONITORING TYPES
================================ */

export type MonitoringNode = {
  name: string;
  instance: string;
  ip: string;
  job: string;
  role: string;
  status: NodeStatus;

  cpu_percent: number | null;
  cpu_status: HealthStatus;

  memory_percent: number | null;
  memory_status: HealthStatus;

  disk_percent: number | null;
  disk_status: HealthStatus;

  temperature_c: number | null;
  temperature_status: TemperatureStatus;

  network_rx_bps: number | null;
  network_tx_bps: number | null;

  load: {
    load1: number | null;
    load5: number | null;
    load15: number | null;
  };

  uptime_seconds: number | null;

  system?: {
    nodename?: string | null;
    machine?: string | null;
    release?: string | null;
    sysname?: string | null;
  };
};

export type MonitoringAlert = {
  severity: AlertSeverity;
  type: string;
  message: string;
  instance?: string | null;
  timestamp?: number;
};

export type MonitoringOverview = {
  backend: {
    status: NodeStatus;
    timestamp: number;
    prometheus_url: string;
  };

  services: {
    yolo: NodeStatus | string;
    telegram_bot: NodeStatus | string;
  };

  summary: {
    total_nodes: number;
    online_nodes: number;
    offline_nodes: number;

    avg_cpu_percent: number | null;
    avg_memory_percent: number | null;
    avg_disk_percent: number | null;
    max_temperature_c: number | null;

    critical_alerts: number;
    warning_alerts: number;
  };

  cluster: {
    status: NodeStatus;
    nodes: MonitoringNode[];
  };

  alerts: MonitoringAlert[];

  charts?: {
    cpu_percent?: unknown[];
    memory_percent?: unknown[];
    temperature_c?: unknown[];
    load1?: unknown[];
  };

  debug?: {
    prometheus_errors: {
      query: string;
      error: string;
    }[];
  };
};

/* ================================
   EVENT / LIVE DETECTION TYPES
================================ */

export type EventDetection = {
  class_name?: string;
  label?: string;
  class?: string;
  name?: string;
  confidence?: number;
  bbox?: number[];
};

export type EventWorkerChunk = {
  chunk_id?: number;
  worker_node?: string;
  node?: string;
  status?: string;
  processing_ms?: number;
};

export type EventItem = {
  id?: string | number;
  event_id?: string | number;

  timestamp?: string;
  created_at?: string;
  time?: string;

  severity?: string;
  event_type?: string;
  threat_type?: string;
  class_name?: string;
  label?: string;
  detected_class?: string;

  confidence?: number;

  camera?: string;
  node_name?: string;
  node?: string;
  sensor_node_id?: string;
  status?: string;

  processing?: string;
  chunk_status?: string;
  chunks_processed?: number;
  total_chunks?: number;

  classes?: string[];
  class_names?: string[];
  detections?: EventDetection[];

  workers?: EventWorkerChunk[];
  chunks?: EventWorkerChunk[];

  raw_image_id?: string | number;
  annotated_image_id?: string | number;
  raw_image_url?: string;
  annotated_image_url?: string;
  raw_url?: string;
  annotated_url?: string;

  telegram_status?: string;
  telegram_sent?: boolean;
  telegram_sent_at?: string | null;

  storage_path?: string;
  storage?: string;
};

export type EventsResponse = {
  count: number;
  events: EventItem[];
};

export type EventFilters = {
  limit?: number;
  severity?: string;
  event_type?: string;
  sensor_node_id?: string;
  status?: string;
};

export type LatestEventResponse =
  | EventItem
  | {
      event?: EventItem | null;
      latest_event?: EventItem | null;
      data?: EventItem | null;
    };

/* ================================
   MODEL / DATASET TYPES
================================ */

export type ModelClassItem = {
  name: string;
  count?: number;
  percentage?: number;
};

export type ModelInfoResponse = {
  model_name?: string;
  model_file?: string;
  model_path?: string;
  model_exists?: boolean;

  architecture?: string;
  framework?: string;
  runtime?: string;

  confidence_threshold?: number;
  inference_time_ms?: number;

  map50?: number;
  map_score?: number;
  map5095?: number;

  training_images?: number;
  validation_images?: number;
  validation_images_count?: number;

  classes?: ModelClassItem[] | string[];
};

/* ================================
   BASE API HELPER
================================ */

async function apiGet<T>(endpoint: string): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  console.log("API CALL:", url);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  console.log("API STATUS:", response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("API ERROR:", errorText);
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as T;

  console.log("API DATA:", data);

  return data;
}

/* ================================
   MONITORING API
================================ */

export function getMonitoringOverview() {
  return apiGet<MonitoringOverview>("/api/v1/monitoring/overview");
}

/* ================================
   EVENTS API
================================ */

export function getEvents(filters: EventFilters = {}) {
  const params = new URLSearchParams();

  params.set("limit", String(filters.limit ?? 20));

  if (filters.severity) {
    params.set("severity", filters.severity);
  }

  if (filters.event_type) {
    params.set("event_type", filters.event_type);
  }

  if (filters.sensor_node_id) {
    params.set("sensor_node_id", filters.sensor_node_id);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  return apiGet<EventsResponse>(`/api/v1/events?${params.toString()}`);
}

export function getLatestEvent() {
  return apiGet<LatestEventResponse>("/api/v1/events/latest");
}

/* ================================
   IMAGE API
================================ */

export function getRawImageUrl(id: string | number) {
  return `${API_BASE_URL}/api/v1/images/raw/${id}`;
}

export function getAnnotatedImageUrl(id: string | number) {
  return `${API_BASE_URL}/api/v1/images/annotated/${id}`;
}

/* ================================
   MODEL API
================================ */

export function getModelInfo() {
  return apiGet<ModelInfoResponse>("/api/v1/model/info");
}

/* ================================
   EXPORT BASE URL
================================ */

export { API_BASE_URL };
