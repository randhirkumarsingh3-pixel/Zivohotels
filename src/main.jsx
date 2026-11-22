import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/fonts.css'
import './index.css'
import { installImageFallback } from './utils/image'
import { BookingProvider } from './context/BookingContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { SocketProvider } from './context/SocketContext.jsx'

// A resized photo that can't load falls back to the original
installImageFallback()

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
