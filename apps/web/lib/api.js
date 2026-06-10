export function buildBoardUrl(state, projectId) {
  const params = new URLSearchParams();
  if (state.boardFilters.search) {
    params.set("search", state.boardFilters.search);
  }
  if (state.boardFilters.state) {
    params.set("state", state.boardFilters.state);
  }
  if (state.boardFilters.assignedRole) {
    params.set("assignedRole", state.boardFilters.assignedRole);
  }
  if (state.boardFilters.priority) {
    params.set("priority", state.boardFilters.priority);
  }
  const query = params.toString();
  return query ? `/api/v1/projects/${projectId}/board?${query}` : `/api/v1/projects/${projectId}/board`;
}

export function buildActivityEventsUrl(state, projectId) {
  const params = new URLSearchParams();
  params.set("order", "desc");
  params.set("limit", String(state.activityFilters.limit || 20));
  if (state.activityFilters.ticketId) {
    params.set("ticketId", state.activityFilters.ticketId);
  }
  if (state.activityFilters.type) {
    params.set("type", state.activityFilters.type);
  }
  return `/api/v1/projects/${projectId}/events?${params.toString()}`;
}

export function buildEventsStreamUrl(state, projectId) {
  const params = new URLSearchParams();
  params.set("limit", String(state.activityFilters.limit || 20));
  if (state.activityFilters.ticketId) {
    params.set("ticketId", state.activityFilters.ticketId);
  }
  if (state.activityFilters.type) {
    params.set("type", state.activityFilters.type);
  }
  return `/api/v1/projects/${projectId}/events/stream?${params.toString()}`;
}

export class ApiError extends Error {
  constructor(message, { status = 0, payload = {}, url = "" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.url = url;
  }
}

export async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.message || payload.error || `Request failed: ${response.status}`, {
      status: response.status,
      payload,
      url,
    });
  }
  return response.json();
}
