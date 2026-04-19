'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/app/context/user-context';
import { useLocale } from '@/app/context/locale-context';
import { Coins, Save, RotateCcw, AlertTriangle } from 'lucide-react';
import { getAiPricingList, bulkUpdateAiFeaturePrices } from '@/lib/actions/ai-pricing';
import styles from '../../admin.module.css';

export default function AiPricingPage() {
  const router = useRouter();
  const { isSuperAdmin, isLoading: isUserLoading } = useUser();
  const { t } = useLocale();
  const [features, setFeatures] = useState([]);
  const [editedCosts, setEditedCosts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, isUserLoading, router]);

  const loadPricing = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getAiPricingList();
      if (data.error) {
        setError(data.error);
        return;
      }
      setFeatures(data);
      setEditedCosts({});
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) loadPricing();
  }, [isSuperAdmin, loadPricing]);

  const handleCostChange = (featureId, value) => {
    const parsed = parseInt(value, 10);
    if (value === '' || (!isNaN(parsed) && parsed >= 0)) {
      setEditedCosts((prev) => ({ ...prev, [featureId]: value === '' ? '' : parsed }));
    }
  };

  const hasChanges = Object.keys(editedCosts).some((id) => {
    const original = features.find((f) => f.id === id);
    return original && editedCosts[id] !== '' && editedCosts[id] !== original.creditCost;
  });

  const handleSave = async () => {
    const updates = Object.entries(editedCosts)
      .filter(([id, cost]) => {
        const original = features.find((f) => f.id === id);
        return original && cost !== '' && cost !== original.creditCost;
      })
      .map(([id, creditCost]) => ({ id, creditCost }));

    if (updates.length === 0) return;

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);
      const result = await bulkUpdateAiFeaturePrices(updates);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSuccessMessage(`Updated ${updates.length} feature price(s) successfully.`);
      await loadPricing();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setEditedCosts({});
    setSuccessMessage(null);
  };

  if (isUserLoading || (!isSuperAdmin && !isLoading)) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={styles.adminPage}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adminPage}>
      <div className={styles.adminHeader}>
        <h1 className={styles.adminTitle}>
          <Coins size={24} style={{ display: 'inline', verticalAlign: 'middle', marginInlineEnd: '0.5rem' }} />
          AI Credit Pricing Management
        </h1>
        <p className={styles.adminSubtitle}>
          Manage credit costs for all AI features. Changes take effect immediately.
        </p>
      </div>

      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-lg)',
          color: '#ef4444',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.9rem',
        }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {successMessage && (
        <div style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: 'var(--radius-lg)',
          color: '#22c55e',
          fontSize: '0.9rem',
        }}>
          {successMessage}
        </div>
      )}

      <div className={styles.adminToolbar}>
        <div className={styles.toolbarLeft}>
          <span style={{ fontSize: '0.9rem', color: 'var(--muted-foreground)' }}>
            {features.length} features configured
          </span>
        </div>
        <div className={styles.toolbarRight}>
          <button
            className={styles.refreshButton}
            onClick={handleReset}
            disabled={!hasChanges}
            style={{ opacity: hasChanges ? 1 : 0.5 }}
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            className={styles.filterButtonActive}
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            style={{
              opacity: hasChanges && !isSaving ? 1 : 0.5,
              cursor: hasChanges && !isSaving ? 'pointer' : 'not-allowed',
            }}
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead className={styles.tableHeader}>
            <tr>
              <th>Feature Key</th>
              <th>Display Name</th>
              <th>Credit Cost</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody className={styles.tableBody}>
            {features.map((feature) => {
              const currentCost = editedCosts[feature.id] ?? feature.creditCost;
              const isEdited = editedCosts[feature.id] !== undefined && editedCosts[feature.id] !== feature.creditCost;
              return (
                <tr key={feature.id} style={isEdited ? { background: 'rgba(123, 44, 191, 0.05)' } : undefined}>
                  <td>
                    <code style={{
                      padding: '0.15rem 0.5rem',
                      background: 'var(--muted)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace',
                    }}>
                      {feature.featureKey}
                    </code>
                  </td>
                  <td>{feature.displayName}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={currentCost}
                        onChange={(e) => handleCostChange(feature.id, e.target.value)}
                        style={{
                          width: '5rem',
                          padding: '0.375rem 0.625rem',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          background: 'var(--input-background)',
                          border: `1px solid ${isEdited ? 'var(--primary)' : 'var(--input-border)'}`,
                          borderRadius: 'var(--radius-md)',
                          color: 'var(--foreground)',
                          textAlign: 'center',
                        }}
                      />
                      {isEdited && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 500 }}>
                          (was {feature.creditCost})
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                    {new Date(feature.updatedAt).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
