import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { BookingProvider } from './context/BookingContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { SocketProvider } from './context/SocketContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <SocketProvider>
        <BookingProvider>
          <App />
        </BookingProvider>
      </SocketProvider>
    </AuthProvider>
  </React.StrictMode>,
)
