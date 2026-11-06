/** Shared ViewTransition type names — one const so route links can't drift. */
export const NAV_FORWARD = "nav-forward" as const;
export const NAV_BACK = "nav-back" as const;
export const NAV_FADE = "nav-fade" as const;

export type NavTransition = typeof NAV_FORWARD | typeof NAV_BACK | typeof NAV_FADE;
