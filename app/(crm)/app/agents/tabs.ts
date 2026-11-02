/** The tabs of Agents IA, shared by the page (server) and the view (client): `?tab=` opens one. */
export const TABS = ["agents", "skills", "offers", "runs", "approvals", "usage"] as const
export type Tab = (typeof TABS)[number]
