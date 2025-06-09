import React, { useState } from 'react';
import ResidentsManagement from './components/ResidentsManagement';
import QualificationsManagement from './components/QualificationsManagement';
import ShiftsManagement from './components/ShiftsManagement';

type TabType = 'residents' | 'qualifications' | 'shifts' | 'schedule';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('residents');

  const tabs = [
    { id: 'residents' as TabType, name: 'Residents', description: 'Manage resident information' },
    { id: 'qualifications' as TabType, name: 'Qualifications', description: 'Assign work qualifications' },
    { id: 'shifts' as TabType, name: 'Shifts', description: 'Configure work shifts' },
    { id: 'schedule' as TabType, name: 'Schedule', description: 'Generate work schedules' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'residents':
        return <ResidentsManagement />;
      case 'qualifications':
        return <QualificationsManagement />;
      case 'shifts':
        return <ShiftsManagement />;
      case 'schedule':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Schedule Generator</h2>
            <p className="text-gray-600">Coming soon - auto-generate work schedules</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Beacon House Scheduler
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Work scheduling management system
              </p>
            </div>
            <div className="text-sm text-gray-500">
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex flex-col items-center">
                  <span>{tab.name}</span>
                  <span className="text-xs text-gray-400 mt-1 hidden sm:block">
                    {tab.description}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderContent()}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center text-sm text-gray-500">
            <p>© 2025 Beacon House Treatment Center</p>
            <p>Scheduling System v1.0</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;