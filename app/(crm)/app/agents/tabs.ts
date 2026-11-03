/** The tabs of Agents IA, shared by the page (server) and the view (client): `?tab=` opens one. */
export const TABS = ["agents", "skills", "offers", "runs", "missions", "approvals", "usage", "quality"] as const
export type Tab = (typeof TABS)[number]
