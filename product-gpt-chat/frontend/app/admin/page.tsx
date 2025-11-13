'use client';

import { useState, useEffect } from 'react';
import { useGoogleAuth } from '../../lib/auth';
import { 
  getUserPermissions, 
  createUserPermission, 
  updateUserPermission,
  getUsageStats,
  UsageStats,
  UserPermission
} from '../../lib/admin';

const ADMIN_EMAIL = 'bweinstein@pulsepoint.com';

export default function AdminPage() {
  const { user, isAuthenticated, loading: authLoading } = useGoogleAuth();
  const [activeTab, setActiveTab] = useState<'usage' | 'users'>('usage');
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [users, setUsers] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserPermission | null>(null);
  const [allowedModels, setAllowedModels] = useState<string[]>([]);

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (isAdmin && isAuthenticated) {
      loadData();
    }
  }, [isAdmin, isAuthenticated]);

  const loadData = async () => {
    if (!isAdmin) return;
    
    setLoading(true);
    try {
      if (activeTab === 'usage') {
        const stats = await getUsageStats();
        setUsageStats(stats);
      } else {
        const userList = await getUserPermissions();
        setUsers(userList);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      loadData();
    } else if (activeTab === 'usage') {
      loadData();
    }
  }, [activeTab]);

  const handleAddUser = async () => {
    if (!newUserEmail.trim() || !newUserEmail.endsWith('@pulsepoint.com')) {
      alert('Please enter a valid @pulsepoint.com email address');
      return;
    }

    setLoading(true);
    try {
      await createUserPermission(newUserEmail, allowedModels);
      setNewUserEmail('');
      setAllowedModels([]);
      await loadData();
      alert('User added successfully');
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Failed to add user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (userId: string, models: string[]) => {
    setLoading(true);
    try {
      await updateUserPermission(userId, models);
      await loadData();
      alert('User permissions updated successfully');
      setSelectedUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user permissions');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-600">Access Denied. Admin access required.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Administration</h1>
        
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('usage')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'usage'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Usage
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Users
            </button>
          </nav>
        </div>

        {/* Usage Tab */}
        {activeTab === 'usage' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-6">Usage Statistics</h2>
            {loading ? (
              <div className="text-center py-8">Loading usage data...</div>
            ) : usageStats ? (
              <div className="space-y-6">
                {/* Total Costs */}
                <div className="bg-blue-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-blue-900 mb-2">Total Costs</h3>
                  <div className="text-3xl font-bold text-blue-600">
                    ${usageStats.totalCost.toFixed(4)}
                  </div>
                  <div className="text-sm text-blue-700 mt-1">
                    {usageStats.totalRequests.toLocaleString()} total requests
                  </div>
                </div>

                {/* Cost by Model */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Cost by Model</h3>
                  <div className="space-y-3">
                    {Object.entries(usageStats.costByModel).map(([model, data]) => (
                      <div key={model} className="border rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-semibold">{model}</div>
                            <div className="text-sm text-gray-600">
                              {data.requests} requests
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-green-600">
                              ${data.cost.toFixed(4)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {data.inputTokens.toLocaleString()} in / {data.outputTokens.toLocaleString()} out tokens
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">No usage data available</div>
            )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Add New User */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold mb-4">Add New User</h2>
              <div className="flex gap-4">
                <input
                  type="email"
                  placeholder="user@pulsepoint.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleAddUser}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Add User
                </button>
              </div>
              
              {/* Model Selection for New User */}
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Allowed Models:</label>
                <div className="flex flex-wrap gap-3">
                  {['gpt-4o-mini', 'gpt-4o', 'gemini-2.0-flash-001', 'auto'].map((model) => (
                    <label key={model} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={allowedModels.includes(model)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAllowedModels([...allowedModels, model]);
                          } else {
                            setAllowedModels(allowedModels.filter(m => m !== model));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm">{model}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* User List */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold mb-4">Users ({users.length})</h2>
              {loading ? (
                <div className="text-center py-8">Loading users...</div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No users found</div>
              ) : (
                <div className="space-y-4">
                  {users.map((user) => (
                    <div key={user.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-semibold">{user.email}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            Allowed Models: {user.allowedModels.length > 0 ? user.allowedModels.join(', ') : 'None'}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Created: {user.createdAt.toLocaleDateString()}
                            {user.isActive ? '' : ' (Inactive)'}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setAllowedModels([...user.allowedModels]);
                          }}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Edit User Modal */}
            {selectedUser && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                  <h3 className="text-xl font-semibold mb-4">Edit User: {selectedUser.email}</h3>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Allowed Models:</label>
                    <div className="space-y-2">
                      {['gpt-4o-mini', 'gpt-4o', 'gemini-2.0-flash-001', 'auto'].map((model) => (
                        <label key={model} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={allowedModels.includes(model)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAllowedModels([...allowedModels, model]);
                              } else {
                                setAllowedModels(allowedModels.filter(m => m !== model));
                              }
                            }}
                            className="mr-2"
                          />
                          <span>{model}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleUpdateUser(selectedUser.id, allowedModels)}
                      disabled={loading}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUser(null);
                        setAllowedModels([]);
                      }}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

