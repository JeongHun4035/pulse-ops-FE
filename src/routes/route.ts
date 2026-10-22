export const ROUTE_PATHS = {
  DASHBOARD: '/',
} as const

export type RouteKey = keyof typeof ROUTE_PATHS
export type RoutePath = (typeof ROUTE_PATHS)[RouteKey]

export interface AppRouteMeta {
  key: RouteKey,
  path: RoutePath,
  label: string,
  showInNav?: boolean,
}

export const APP_ROUTES: AppRouteMeta[] = [
  {
    key: 'DASHBOARD',
    path: ROUTE_PATHS.DASHBOARD,
    label: '대시보드',
    showInNav: true,
  },
]
