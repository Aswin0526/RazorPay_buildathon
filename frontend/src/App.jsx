import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Customerdash from './pages/Customerdash'
import Shopdash from './pages/Shopdash'
import ShopDetail from './pages/ShopDetail'
import TextChat from './pages/TextChat'
import VirtualTryOn from './pages/VirtualTryOn'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register/customer" element={<Register />} />
        <Route path="/register/owner" element={<Register />} />
        <Route 
          path='/customer/dashboard' 
          element={
            <ProtectedRoute allowedUserTypes={['customer']}>
              <Customerdash />
            </ProtectedRoute>
          }
        />
        <Route 
          path='/shop/dashboard' 
          element={
            <ProtectedRoute allowedUserTypes={['owner']}>
              <Shopdash />
            </ProtectedRoute>
          }
        />
        <Route 
          path='/shop-detail' 
          element={
            <ProtectedRoute allowedUserTypes={['customer']}>
              <ShopDetail />
            </ProtectedRoute>
          }
        />
        <Route 
          path='/virtual-tryon' 
          element={
            <ProtectedRoute allowedUserTypes={['customer']}>
              <VirtualTryOn />
            </ProtectedRoute>
          }
        />
        <Route 
          path='/shop-detail/text-chat'
          element={
            <ProtectedRoute allowedUserTypes={['customer']}>
              <TextChat />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  )
}

export default App
