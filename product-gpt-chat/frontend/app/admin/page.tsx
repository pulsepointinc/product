'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useGoogleAuth } from '../../lib/auth';
import { 
  getUserPermissions, 
  createUserPermission, 
  updateUserPermission,
  getUsageStats,
  checkIsAdmin,
  UsageStats,
  UserPermission
} from '../../lib/admin';

// Purple color scheme matching Genome Studio
const PURPLE_PRIMARY = '#6B46C1'; // Purple-600
const PURPLE_HOVER = '#7C3AED'; // Purple-500
const PURPLE_LIGHT = '#EDE9FE'; // Purple-100

export default function AdminPage() {
  const { user, isAuthenticated, loading: authLoading, signOut } = useGoogleAuth();
  const [activeTab, setActiveTab] = useState<'usage' | 'users'>('usage');
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [users, setUsers] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserPermission | null>(null);
  const [allowedModels, setAllowedModels] = useState<string[]>([]);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Check if current user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      console.log('🔍 Checking admin access for:', user?.email);
      if (user?.email) {
        // Always allow bweinstein@pulsepoint.com as fallback admin
        const isFallbackAdmin = user.email === 'bweinstein@pulsepoint.com' || user.email?.toLowerCase() === 'bweinstein@pulsepoint.com';
        console.log('🔍 Is fallback admin?', isFallbackAdmin);
        
        if (isFallbackAdmin) {
          console.log('✅ Granting admin access (fallback)');
          setIsAdmin(true);
          return;
        }
        
        try {
          const adminStatus = await checkIsAdmin(user.email);
          console.log('🔍 Firestore admin status:', adminStatus);
          setIsAdmin(adminStatus);
        } catch (error) {
          console.error('Error checking admin status:', error);
          setIsAdmin(false);
        }
      } else {
        console.log('⚠️ No user email found');
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, [user?.email]);

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
      // Auto-refresh usage stats every 30 seconds
      const interval = setInterval(() => {
        loadData();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const handleAddUser = async () => {
    if (!newUserEmail.trim() || !newUserEmail.endsWith('@pulsepoint.com')) {
      alert('Please enter a valid @pulsepoint.com email address');
      return;
    }

    setLoading(true);
    try {
      await createUserPermission(newUserEmail, allowedModels, isAdminUser);
      setNewUserEmail('');
      setAllowedModels([]);
      setIsAdminUser(false);
      await loadData();
      alert('User added successfully');
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Failed to add user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (userId: string, models: string[], admin: boolean) => {
    setLoading(true);
    try {
      await updateUserPermission(userId, models, admin);
      await loadData();
      alert('User permissions updated successfully');
      setSelectedUser(null);
      setIsAdminUser(false);
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user permissions');
    } finally {
      setLoading(false);
    }
  };

  // Filter users based on search query
  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.allowedModels.some(model => model.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-xl text-red-600">Access Denied. Admin access required.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header matching Genome Studio style */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-full mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center justify-center w-12 h-12 rounded-full" style={{ backgroundColor: PURPLE_PRIMARY }}>
              <span className="text-white text-sm font-bold">PP GPT</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <span className="text-sm text-gray-700">{user?.email?.split('@')[0]}(Admin)</span>
            </div>
            <button
              onClick={signOut}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-full mx-auto px-6 py-6">
        {/* Page Title */}
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Administration</h1>
        
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('usage')}
              className={`py-4 px-1 border-b-2 font-semibold text-sm ${
                activeTab === 'usage'
                  ? `border-[${PURPLE_PRIMARY}] text-[${PURPLE_PRIMARY}]`
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              style={activeTab === 'usage' ? { borderBottomColor: PURPLE_PRIMARY, color: PURPLE_PRIMARY } : {}}
            >
              Usage
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`py-4 px-1 border-b-2 font-semibold text-sm ${
                activeTab === 'users'
                  ? `border-[${PURPLE_PRIMARY}] text-[${PURPLE_PRIMARY}]`
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              style={activeTab === 'users' ? { borderBottomColor: PURPLE_PRIMARY, color: PURPLE_PRIMARY } : {}}
            >
              Users
            </button>
          </nav>
        </div>

        {/* Usage Tab */}
        {activeTab === 'usage' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Usage Statistics</h2>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading usage data...</div>
              ) : usageStats ? (
                <div className="space-y-8">
                  {/* Total Costs Card */}
                  <div className="rounded-lg p-6 border border-gray-200" style={{ backgroundColor: PURPLE_LIGHT }}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Total Costs</h3>
                    <div className="text-4xl font-bold" style={{ color: PURPLE_PRIMARY }}>
                      ${usageStats.totalCost.toFixed(4)}
                    </div>
                    <div className="text-sm text-gray-600 mt-2">
                      {usageStats.totalRequests.toLocaleString()} total requests
                    </div>
                  </div>

                  {/* Cost by Model Table */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost by Model</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Model
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Requests
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Input Tokens
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Output Tokens
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Cost
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {Object.entries(usageStats.costByModel).map(([model, data]) => (
                            <tr key={model} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {model}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                {data.requests.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                {data.inputTokens.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                {data.outputTokens.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right" style={{ color: PURPLE_PRIMARY }}>
                                ${data.cost.toFixed(4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">No usage data available</div>
              )}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Users Table Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">Users ({filteredUsers.length})</h2>
                <div className="flex items-center gap-4">
                  {/* Search */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent w-64"
                    />
                  </div>
                  {/* Add User Button */}
                  <button
                    onClick={() => {
                      setSelectedUser({ 
                        id: 'new', 
                        email: '', 
                        allowedModels: [], 
                        isActive: true,
                        isAdmin: false,
                        createdAt: new Date(), 
                        updatedAt: new Date() 
                      });
                      setNewUserEmail('');
                      setAllowedModels([]);
                      setIsAdminUser(false);
                    }}
                    className="px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: PURPLE_PRIMARY }}
                  >
                    Add New User
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="text-center py-12 text-gray-500">Loading users...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">No users found</div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Allowed Models
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Created Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Updated Date
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {user.email}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {user.allowedModels.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {user.allowedModels.map((model) => (
                                  <span key={model} className="px-2 py-1 bg-gray-100 rounded text-xs">
                                    {model}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">None</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              {user.isActive ? (
                                <span className="px-2 py-1 text-xs font-medium rounded" style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}>
                                  Active
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-600">
                                  Inactive
                                </span>
                              )}
                              {user.isAdmin && (
                                <span className="px-2 py-1 text-xs font-medium rounded text-white" style={{ backgroundColor: PURPLE_PRIMARY }}>
                                  Admin
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {user.createdAt.toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {user.updatedAt.toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setAllowedModels([...user.allowedModels]);
                                setIsAdminUser(user.isAdmin || false);
                              }}
                              className="text-purple-600 hover:text-purple-900"
                              style={{ color: PURPLE_PRIMARY }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              
              {/* Pagination Footer */}
              {filteredUsers.length > 0 && (
                <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                    {filteredUsers.length} {filteredUsers.length === 1 ? 'record' : 'records'}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">1 of 1</span>
                    <button className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50" disabled>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50" disabled>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add/Edit User Modal */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900">
                  {selectedUser.id === 'new' ? 'Add New User' : `Edit User: ${selectedUser.email}`}
                </h3>
              </div>
              <div className="p-6">
                {selectedUser.id === 'new' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                    <input
                      type="email"
                      placeholder="user@pulsepoint.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                )}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">Allowed Models</label>
                    <button
                      type="button"
                      onClick={() => {
                        const allModels = ['gpt-4o-mini', 'gpt-4o', 'gemini-2.0-flash-001', 'auto'];
                        if (allowedModels.length === allModels.length) {
                          setAllowedModels([]);
                        } else {
                          setAllowedModels([...allModels]);
                        }
                      }}
                      className="text-xs text-purple-600 hover:text-purple-900"
                      style={{ color: PURPLE_PRIMARY }}
                    >
                      {allowedModels.length === 4 ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
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
                          className="mr-3 h-4 w-4 rounded border-gray-300"
                          style={{ accentColor: PURPLE_PRIMARY }}
                        />
                        <span className="text-sm text-gray-700">{model}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={isAdminUser}
                      onChange={(e) => setIsAdminUser(e.target.checked)}
                      className="mr-3 h-4 w-4 rounded border-gray-300"
                      style={{ accentColor: PURPLE_PRIMARY }}
                    />
                    <span className="text-sm font-medium text-gray-700">Admin Access (can view admin panel)</span>
                  </label>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
                <button
                  onClick={() => {
                    if (selectedUser.id === 'new') {
                      handleAddUser();
                    } else {
                      handleUpdateUser(selectedUser.id, allowedModels, isAdminUser);
                    }
                  }}
                  disabled={loading || (selectedUser.id === 'new' && !newUserEmail)}
                  className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: PURPLE_PRIMARY }}
                >
                  {selectedUser.id === 'new' ? 'Add User' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setAllowedModels([]);
                    setNewUserEmail('');
                    setIsAdminUser(false);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
