import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Assets from './pages/Assets'
import AssetDetail from './pages/AssetDetail'
import DataSources from './pages/DataSources'
import DataSourceDetail from './pages/DataSourceDetail'
import TimeSeriesExplorer from './pages/TimeSeriesExplorer'
import Ingest from './pages/Ingest'
import Analytics from './pages/Analytics'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/assets/:id" element={<AssetDetail />} />
          <Route path="/data-sources" element={<DataSources />} />
          <Route path="/data-sources/:id" element={<DataSourceDetail />} />
          <Route path="/explore" element={<TimeSeriesExplorer />} />
          <Route path="/ingest" element={<Ingest />} />
          <Route path="/analytics" element={<Analytics />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
