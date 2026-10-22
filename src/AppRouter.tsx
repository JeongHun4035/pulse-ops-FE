import { Navigate, Route, Routes } from 'react-router-dom'

import Layout from '@/layouts/Layout/Layout'
import Dashboard from '@/pages/Dashboard/Dashboard'
import { ROUTE_PATHS } from '@/routes/route'

const AppRouter = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path={ROUTE_PATHS.DASHBOARD} element={<Dashboard />} />
      </Route>
      <Route path="*" element={<Navigate to={ROUTE_PATHS.DASHBOARD} replace />} />
    </Routes>
  )
}

export default AppRouter
