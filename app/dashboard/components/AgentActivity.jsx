'use client';

import AgentPageContent from '../agent/AgentPageContent';

export default function AgentActivity({ translations, onInsightsLoaded }) {
  return <AgentPageContent translations={translations} mode="compact" onInsightsLoaded={onInsightsLoaded} />;
}
