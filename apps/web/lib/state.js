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
