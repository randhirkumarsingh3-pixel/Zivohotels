import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useExtranet } from '../context/ExtranetContext';

const PresenceAvatarStack = () => {
  const { socket } = useSocket();
  const { hotelId } = useExtranet();
  const [activeUsers, setActiveUsers] = useState([]);

  useEffect(() => {
    if (!socket) return;

    const handlePresenceUpdate = (data) => {
      if (data.roomId === `hotel_${hotelId}` || data.roomId === 'admin_global') {
        setActiveUsers(data.activeUsers);
      }
    };

    socket.on('USER_PRESENCE_UPDATED', handlePresenceUpdate);
    return () => socket.off('USER_PRESENCE_UPDATED', handlePresenceUpdate);
  }, [socket, hotelId]);

  return (
    <div className="flex items-center -space-x-3 overflow-hidden">
      {activeUsers.map((user, i) => (
        <div 
          key={user.id}
          className="relative group cursor-help"
          title={`${user.name} (${user.role})`}
        >
          <div className={`h-8 w-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-sm transition-transform hover:scale-110 hover:z-10 ${
            user.role === 'ADMIN' ? 'bg-red-600' : 'bg-blue-600'
          }`}>
            {user.name?.charAt(0) || 'U'}
          </div>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></span>
          
          {/* Tooltip Overlay */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
            <div className="flex flex-col gap-1">
               <span className="text-white">{user.name} • {user.role}</span>
               <span className={`text-[8px] px-1 py-0.5 rounded ${user.intent === 'IDLE' ? 'bg-white/10' : 'bg-green-500 text-white'}`}>
                 {user.intent} {user.target ? `: ${user.target}` : ''}
               </span>
            </div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full border-4 border-transparent border-b-slate-900" />
          </div>
        </div>
      ))}
      
      {activeUsers.length > 0 && (
        <span className="ml-4 text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">
           Live Collaboration
        </span>
      )}
    </div>
  );
};

export default PresenceAvatarStack;
