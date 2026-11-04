import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  fetchHealth, 
  fetchProgrammes, 
  fetchContributions, 
  fetchRewards, 
  fetchBitrefillProducts, 
  fetchAuditLogs 
} from './services/api';
import { Sidebar, ScreenId } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { OverviewView } from './components/OverviewView';
import { ProgrammesView } from './components/ProgrammesView';
import { ContributionsView } from './components/ContributionsView';
import { VerificationView } from './components/VerificationView';
import { RewardsView } from './components/RewardsView';
import { CommerceView } from './components/CommerceView';
import { AuditView } from './components/AuditView';
import { SettingsView } from './components/SettingsView';
import { SimulationModal } from './components/SimulationModal';
import { Contribution } from '@shipreward/shared';

export const App: React.FC = () => {
  const queryClient = useQueryClient();
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('overview');
  const [selectedProgram, setSelectedProgram] = useState<string>('ALL');
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);
  const [selectedContribution, setSelectedContribution] = useState<Contribution | null>(null);

  // Queries
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000
  });

  const { data: programmes = [], refetch: refetchProgrammes } = useQuery({
    queryKey: ['programmes'],
    queryFn: fetchProgrammes,
  });

  const { data: contributions = [], refetch: refetchContributions } = useQuery({
    queryKey: ['contributions', selectedProgram],
    queryFn: () => fetchContributions(selectedProgram !== 'ALL' ? { programId: selectedProgram } : undefined),
    refetchInterval: 4000
  });

  const { data: rewards = [], refetch: refetchRewards } = useQuery({
    queryKey: ['rewards', selectedProgram],
    queryFn: () => fetchRewards(selectedProgram !== 'ALL' ? { programId: selectedProgram } : undefined),
    refetchInterval: 4000
  });

  const { data: products = [] } = useQuery({
    queryKey: ['bitrefillProducts'],
    queryFn: () => fetchBitrefillProducts(),
  });

  const { data: auditLogs = [], refetch: refetchAudit } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => fetchAuditLogs(50),
    refetchInterval: 5000
  });

  const handleRefreshAll = () => {
    queryClient.invalidateQueries();
  };

  const handleInspectContribution = (contrib: Contribution) => {
    setSelectedContribution(contrib);
    setCurrentScreen('verification');
  };

  return (
    <div className="min-h-screen bg-[#090A0D] text-slate-200 flex p-3">
      {/* Fixed Left Navigation Dock */}
      <Sidebar 
        currentScreen={currentScreen} 
        onSelectScreen={setCurrentScreen}
        agentOnline={health?.status === 'ok'} 
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 pl-3">
        {/* Top Control Header */}
        <Header 
          onOpenSimulation={() => setIsSimModalOpen(true)}
          health={health}
          selectedProgram={selectedProgram}
          onSelectProgram={setSelectedProgram}
        />

        {/* Dynamic View Router */}
        <main className="flex-1 flex min-h-0">
          {currentScreen === 'overview' && (
            <OverviewView 
              health={health}
              contributions={contributions}
              rewards={rewards}
              programmes={programmes}
              onSelectScreen={setCurrentScreen}
              onInspectContribution={handleInspectContribution}
            />
          )}

          {currentScreen === 'programmes' && (
            <ProgrammesView 
              programmes={programmes} 
              onRefresh={refetchProgrammes} 
            />
          )}

          {currentScreen === 'contributions' && (
            <ContributionsView 
              contributions={contributions} 
              onInspect={handleInspectContribution} 
            />
          )}

          {currentScreen === 'verification' && (
            <VerificationView 
              selectedContribution={selectedContribution}
              contributions={contributions}
              onSelectContribution={setSelectedContribution}
              onRefresh={handleRefreshAll}
            />
          )}

          {currentScreen === 'rewards' && (
            <RewardsView 
              rewards={rewards} 
            />
          )}

          {currentScreen === 'commerce' && (
            <CommerceView 
              products={products}
              health={health}
            />
          )}

          {currentScreen === 'audit' && (
            <AuditView 
              auditLogs={auditLogs} 
            />
          )}

          {currentScreen === 'settings' && (
            <SettingsView 
              health={health} 
            />
          )}
        </main>
      </div>

      {/* Autonomous Trigger Test Modal */}
      <SimulationModal 
        isOpen={isSimModalOpen}
        onClose={() => setIsSimModalOpen(false)}
        onSuccess={handleRefreshAll}
      />
    </div>
  );
};

