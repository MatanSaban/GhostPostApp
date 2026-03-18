'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Loader2,
  Coins,
  ShoppingCart,
  Check,
  AlertCircle,
  Plus,
  Minus,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { useRouter } from 'next/navigation';
import CardComPaymentForm from './CardComPaymentForm';
import UpgradePlanModal from './UpgradePlanModal';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import styles from './AddCreditsModal.module.css';

/**
 * AddCreditsModal
 * 
 * Shows available AI Credits add-on packs for purchase.
 * Step 1: Select addon + quantity
 * Step 2: Payment via CardCom Open Fields
 */
export default function AddCreditsModal({ isOpen, onClose }) {
  const { t, locale } = useLocale();
  const { user, refreshUser } = useUser();
  const router = useRouter();
  const [addons, setAddons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quantities, setQuantities] = useState({});

  // Payment step state
  const [selectedAddon, setSelectedAddon] = useState(null);
  const [selectedQty, setSelectedQty] = useState(1);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { isMaximized, toggleMaximize } = useModalResize();

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        const lang = locale?.toUpperCase() || 'EN';
        const res = await fetch(`/api/public/addons?type=AI_CREDITS&lang=${lang}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setAddons(data.addOns || []);
      } catch {
        if (!cancelled) setAddons([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    // Reset state when opening
    setQuantities({});
    setSelectedAddon(null);
    setSelectedQty(1);
    setPaymentComplete(false);

    return () => { cancelled = true; };
  }, [isOpen, locale]);

  if (!isOpen) return null;

  const getQuantity = (id) => quantities[id] || 1;

  const setQuantity = (id, qty) => {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(1, qty) }));
  };

  const formatPrice = (addon, qty = 1) => {
    const totalPrice = addon.price * qty;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: addon.currency || 'USD',
      minimumFractionDigits: 0,
    }).format(totalPrice);
  };

  const handleBuyClick = (addon) => {
    const qty = getQuantity(addon.id);
    setSelectedAddon(addon);
    setSelectedQty(qty);
  };

  const handlePaymentSuccess = (result) => {
    setPaymentComplete(true);
    // Refresh user context to update credits balance
    refreshUser?.();
  };

  const handlePaymentBack = () => {
    setSelectedAddon(null);
    setSelectedQty(1);
  };

  const handleClose = () => {
    if (paymentComplete) {
      refreshUser?.();
    }
    onClose();
  };

  return createPortal(
    <div className={styles.overlay} onClick={handleClose}>
      <div className={`${styles.modal} ${isMaximized ? 'modal-maximized' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', position: 'absolute', top: '1rem', right: '1rem', zIndex: 1 }}>
          <ModalResizeButton isMaximized={isMaximized} onToggle={toggleMaximize} className={styles.closeBtn} />
          <button className={styles.closeBtn} onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {/* Payment Step */}
        {selectedAddon ? (
          paymentComplete ? (
            // Success view
            <div className={styles.successView}>
              <div className={styles.successIconLarge}>
                <Check size={36} />
              </div>
              <h2 className={styles.title}>
                {t('addCreditsModal.purchaseSuccess') || 'Credits added successfully!'}
              </h2>
              <p className={styles.subtitle}>
                {selectedAddon.name} × {selectedQty}
              </p>
              <button className={styles.footerLink} onClick={handleClose}>
                {t('common.close') || 'Close'}
              </button>
            </div>
          ) : (
            // Payment form
            <>
              <div className={styles.header}>
                <div className={styles.iconWrapper}>
                  <ShoppingCart size={28} />
                </div>
                <h2 className={styles.title}>
                  {t('payment.payNow') || 'Pay Now'}
                </h2>
                <p className={styles.subtitle}>
                  {selectedAddon.name} × {selectedQty}
                </p>
              </div>
              <CardComPaymentForm
                amount={selectedAddon.price * selectedQty}
                currency={selectedAddon.currency || 'ILS'}
                productName={selectedAddon.name}
                action={{
                  type: 'addon_purchase',
                  addOnId: selectedAddon.id,
                  itemId: selectedAddon.id,
                  quantity: selectedQty,
                }}
                onSuccess={handlePaymentSuccess}
                onError={(err) => console.error('Payment error:', err)}
                onBack={handlePaymentBack}
                defaultName={[user?.firstName, user?.lastName].filter(Boolean).join(' ')}
                defaultEmail={user?.email || ''}
                defaultPhone={user?.phoneNumber || ''}
              />
            </>
          )
        ) : (
          <>
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.iconWrapper}>
                <Coins size={28} />
              </div>
              <h2 className={styles.title}>
                {t('addCreditsModal.title') || 'Add AI Credits'}
              </h2>
              <p className={styles.subtitle}>
                {t('addCreditsModal.subtitle') || 'Purchase additional AI credits for your account'}
              </p>

              {/* Current balance */}
              {user?.aiCreditsUsed !== undefined && (
                <div className={styles.balanceBar}>
                  <span className={styles.balanceLabel}>
                    {t('addCreditsModal.currentBalance') || 'Current Balance'}
                  </span>
                  <span className={styles.balanceValue}>
                    {(user.aiCreditsUsed || 0).toLocaleString()} / {(user.aiCreditsLimit != null ? user.aiCreditsLimit : (user.subscription?.plan?.limitations?.find?.(l => l.key === 'aiCredits')?.value || 0)).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Add-ons list */}
            {isLoading ? (
              <div className={styles.loading}>
                <Loader2 size={24} className={styles.spinning} />
              </div>
            ) : addons.length === 0 ? (
              <p className={styles.empty}>
                {t('addCreditsModal.noAddons') || 'No credit packs available'}
              </p>
            ) : (
              <div className={styles.addonsList}>
                {addons.map((addon) => {
                  const qty = getQuantity(addon.id);

                  return (
                    <div key={addon.id} className={styles.addonCard}>
                      <div className={styles.addonInfo}>
                        <div className={styles.addonName}>
                          <span className={styles.addonEmoji}>✨</span>
                          {addon.name}
                        </div>
                        {addon.description && (
                          <p className={styles.addonDesc}>{addon.description}</p>
                        )}
                        {addon.quantity && (
                          <span className={styles.addonQty}>
                            +{addon.quantity.toLocaleString()} {t('addCreditsModal.credits') || 'credits'}
                          </span>
                        )}
                      </div>

                      <div className={styles.addonActions}>
                        <div className={styles.priceRow}>
                          <span className={styles.price}>{formatPrice(addon, qty)}</span>
                          {addon.billingType === 'ONE_TIME' && (
                            <span className={styles.oneTimeBadge}>
                              {t('addCreditsModal.oneTime') || 'One-time'}
                            </span>
                          )}
                          {addon.billingType === 'RECURRING' && (
                            <span className={styles.recurringBadge}>
                              {t('addCreditsModal.recurring') || 'Monthly'}
                            </span>
                          )}
                        </div>

                        <div className={styles.quantityRow}>
                          <div className={styles.quantityCounter}>
                            <button
                              className={styles.quantityBtn}
                              onClick={() => setQuantity(addon.id, qty - 1)}
                              disabled={qty <= 1}
                            >
                              <Minus size={14} />
                            </button>
                            <span className={styles.quantityValue}>{qty}</span>
                            <button
                              className={styles.quantityBtn}
                              onClick={() => setQuantity(addon.id, qty + 1)}
                            >
                              <Plus size={14} />
                            </button>
                          </div>

                          <button
                            className={styles.buyBtn}
                            onClick={() => handleBuyClick(addon)}
                          >
                            <ShoppingCart size={14} />
                            {t('addCreditsModal.buy') || 'Buy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer actions */}
            <div className={styles.footerActions}>
              <button
                className={styles.upgradePlanBtn}
                onClick={() => setShowUpgradeModal(true)}
              >
                {t('addCreditsModal.upgradePlan') || 'Upgrade Plan'}
              </button>
              <button
                className={styles.footerLink}
                onClick={() => {
                  handleClose();
                  router.push('/dashboard/settings?tab=credits');
                }}
              >
                {t('addCreditsModal.manageCredits') || 'Manage Credits'}
                <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {/* Upgrade Plan Modal */}
        <UpgradePlanModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
      </div>
    </div>,
    document.body
  );
}
