import React from 'react';
import { Edit2, Ban, Trash2, CheckCircle, FileText, Building2 } from 'lucide-react';

const OwnersTable = ({ data, onEdit, onStatusChange }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-500 font-medium">
          <tr>
            <th className="px-6 py-4 rounded-tl-lg">Owner Info</th>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Assigned Properties</th>
            <th className="px-6 py-4">Commission Splits</th>
            <th className="px-6 py-4 rounded-tr-lg">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((user) => (
            <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-6 py-4">
                <div className="flex flex-col">
                  <span className="font-semibold text-gray-900">{user.name}</span>
                  <span className="text-gray-500 text-xs">{user.email}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ${
                  user.status === 'ACTIVE' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                  'bg-red-50 text-red-700 ring-red-600/20'
                }`}>
                  {user.status}
                </span>
              </td>
              <td className="px-6 py-4">
                {user.ownerProperties?.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {user.ownerProperties.map(op => (
                      <span key={op.hotelId} className="flex items-center text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded w-fit">
                        <Building2 size={12} className="mr-1 text-gray-400"/> {op.hotel.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 text-xs italic">No properties assigned</span>
                )}
              </td>
              <td className="px-6 py-4">
                 {user.ownerProperties?.map(op => (
                    <div key={`comm-${op.hotelId}`} className="text-xs font-semibold text-gray-600">
                      {op.commission}%
                    </div>
                 ))}
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center space-x-3">
                  <button onClick={() => onEdit(user)} className="text-gray-400 hover:text-brand-600 transition-colors" title="Manage Assignments">
                    <Edit2 size={16} />
                  </button>
                  <button className="text-gray-400 hover:text-blue-600 transition-colors" title="View Agreements">
                    <FileText size={16} />
                  </button>
                  {user.status === 'ACTIVE' ? (
                    <button onClick={() => onStatusChange(user.id, 'BLOCKED')} className="text-gray-400 hover:text-orange-500 transition-colors" title="Block">
                      <Ban size={16} />
                    </button>
                  ) : (
                    <button onClick={() => onStatusChange(user.id, 'ACTIVE')} className="text-gray-400 hover:text-green-500 transition-colors" title="Unblock">
                      <CheckCircle size={16} />
                    </button>
                  )}
                  <button onClick={() => onStatusChange(user.id, 'DELETED')} className="text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr><td colSpan="5" className="text-center py-8 text-gray-500">No owners found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default OwnersTable;
