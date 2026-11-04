export const USER_ROLES = [{ value: "sales_manager", label: "Sales Manager" }, { value: "sales_agent", label: "Sales Agent" }, { value: "hr", label: "HR" }, { value: "project_manager", label: "Project Manager" }] as const;
export const USER_STATUSES = ["Active", "Inactive", "Pending", "Suspended"] as const;
export const INVITE_STATUSES = ["Not Sent", "Pending", "Sent", "Accepted", "Expired", "Failed"] as const;
export const USER_ACTIVITY_STATUSES = ["Online", "Offline", "Away"] as const;
