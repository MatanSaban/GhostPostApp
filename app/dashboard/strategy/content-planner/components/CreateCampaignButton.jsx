'use client';

import { useState } from 'react';
import { PrimaryActionButton } from '../../../components';
import CreateCampaignModal from './CreateCampaignModal';

export default function CreateCampaignButton({ label, translations }) {
  const [showModal, setShowModal] = useState(false);

  const handleCreated = () => {
    // Trigger a custom event so ContentPlannerView can refresh its list
    window.dispatchEvent(new CustomEvent('campaign-created'));
  };

  return (
    <>
      <PrimaryActionButton iconName="Sparkles" onClick={() => setShowModal(true)}>
        {label}
      </PrimaryActionButton>

      {showModal && (
        <CreateCampaignModal
          translations={translations}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
