export const state = {
  projects: [],
  project: null,
  projectId: "",
  board: null,
  ticketDetail: null,
  selectedTicketId: "",
  tickets: [],
  repos: [],
  mergeQueue: [],
  events: [],
  artifacts: [],
  activityFilters: {
    ticketId: "",
    type: "",
    limit: 20,
  },
  boardFilters: {
    search: "",
    state: "",
    assignedRole: "",
    priority: "",
  },
};
