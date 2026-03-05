import { BrowserRouter, Routes, Route } from "react-router-dom"
import Layout from "@/layouts"
import { MainContent } from "@/components/MainContent"
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<MainContent />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
