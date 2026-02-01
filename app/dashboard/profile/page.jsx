'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  User,
  Mail,
  Phone,
  Lock,
  Shield,
  Camera,
  Check,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Unlink,
  KeyRound,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import styles from './page.module.css';

// Tab configuration
const TABS = [
  { id: 'personal', icon: User, labelKey: 'profile.tabs.personal' },
  { id: 'security', icon: KeyRound, labelKey: 'profile.tabs.security' },
  { id: 'connections', icon: LinkIcon, labelKey: 'profile.tabs.connections' },
];

// Google icon component
function GoogleIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function ProfilePage() {
  const { t } = useLocale();
  const { user: contextUser, updateUser } = useUser();

  // Tab state
  const [activeTab, setActiveTab] = useState('personal');

  // Profile state
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    image: null,
    emailVerified: null,
    phoneVerified: null,
    primaryAuthMethod: 'EMAIL',
  });
  const [authProviders, setAuthProviders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  // Image upload state
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Fetch user profile on mount
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/user/profile');
      if (response.ok) {
        const data = await response.json();
        setProfile({
          firstName: data.user.firstName || '',
          lastName: data.user.lastName || '',
          email: data.user.email || '',
          phoneNumber: data.user.phoneNumber || '',
          image: data.user.image || null,
          emailVerified: data.user.emailVerified,
          phoneVerified: data.user.phoneVerified,
          primaryAuthMethod: data.user.primaryAuthMethod || 'EMAIL',
        });
        setAuthProviders(data.authProviders || []);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileChange = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    try {
      setIsSaving(true);
      setSaveMessage({ type: '', text: '' });

      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: profile.firstName,
          lastName: profile.lastName,
          phoneNumber: profile.phoneNumber,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSaveMessage({ type: 'success', text: t('profile.saveSuccess') });
        // Update context user
        updateUser({
          ...contextUser,
          firstName: profile.firstName,
          lastName: profile.lastName,
        });
      } else {
        const error = await response.json();
        setSaveMessage({ type: 'error', text: error.error || t('profile.saveError') });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: t('profile.saveError') });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage({ type: '', text: '' }), 5000);
    }
  };

  const handlePasswordChange = async () => {
    // Validation
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: t('profile.password.allFieldsRequired') });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: t('profile.password.mismatch') });
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: t('profile.password.tooShort') });
      return;
    }

    try {
      setIsChangingPassword(true);
      setPasswordMessage({ type: '', text: '' });

      const response = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      if (response.ok) {
        setPasswordMessage({ type: 'success', text: t('profile.password.changeSuccess') });
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        const error = await response.json();
        setPasswordMessage({ type: 'error', text: error.error || t('profile.password.changeError') });
      }
    } catch (error) {
      setPasswordMessage({ type: 'error', text: t('profile.password.changeError') });
    } finally {
      setIsChangingPassword(false);
      setTimeout(() => setPasswordMessage({ type: '', text: '' }), 5000);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setSaveMessage({ type: 'error', text: t('profile.image.invalidType') });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setSaveMessage({ type: 'error', text: t('profile.image.tooLarge') });
      return;
    }

    try {
      setIsUploadingImage(true);
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/user/profile/image', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(prev => ({ ...prev, image: data.imageUrl }));
        updateUser({ ...contextUser, image: data.imageUrl });
        setSaveMessage({ type: 'success', text: t('profile.image.uploadSuccess') });
      } else {
        const error = await response.json();
        setSaveMessage({ type: 'error', text: error.error || t('profile.image.uploadError') });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: t('profile.image.uploadError') });
    } finally {
      setIsUploadingImage(false);
      setTimeout(() => setSaveMessage({ type: '', text: '' }), 5000);
    }
  };

  const handleConnectGoogle = () => {
    // Redirect to Google OAuth
    window.location.href = '/api/auth/google?action=link';
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm(t('profile.google.disconnectConfirm'))) return;

    try {
      const response = await fetch('/api/user/auth-providers/google', {
        method: 'DELETE',
      });

      if (response.ok) {
        setAuthProviders(prev => prev.filter(p => p.provider !== 'GOOGLE'));
        setSaveMessage({ type: 'success', text: t('profile.google.disconnectSuccess') });
      } else {
        const error = await response.json();
        setSaveMessage({ type: 'error', text: error.error || t('profile.google.disconnectError') });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: t('profile.google.disconnectError') });
    }
    setTimeout(() => setSaveMessage({ type: '', text: '' }), 5000);
  };

  const isGoogleConnected = authProviders.some(p => p.provider === 'GOOGLE');
  const googleProvider = authProviders.find(p => p.provider === 'GOOGLE');
  const hasPassword = profile.primaryAuthMethod === 'EMAIL';

  // Get initials for avatar fallback
  const getInitials = () => {
    if (profile.firstName && profile.lastName) {
      return `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase();
    }
    if (profile.firstName) {
      return profile.firstName.substring(0, 2).toUpperCase();
    }
    if (profile.email) {
      return profile.email.substring(0, 2).toUpperCase();
    }
    return '??';
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('profile.title')}</h1>
          <p className={styles.pageSubtitle}>{t('profile.subtitle')}</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className={styles.tabsWrapper}>
        <div className={styles.tabs}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              >
                <Icon size={18} />
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {/* Personal Info Tab */}
        {activeTab === 'personal' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrapper}>
                <User size={24} />
              </div>
              <div className={styles.cardHeaderContent}>
                <h2 className={styles.cardTitle}>{t('profile.personalInfo.title')}</h2>
                <p className={styles.cardDescription}>{t('profile.personalInfo.description')}</p>
              </div>
            </div>

            <div className={styles.cardContent}>
              {/* Avatar Section */}
              <div className={styles.avatarSection}>
                <div className={styles.avatarWrapper}>
                  {profile.image ? (
                    <Image
                      src={profile.image}
                      alt={`${profile.firstName} ${profile.lastName}`}
                      width={100}
                      height={100}
                      className={styles.avatarImage}
                    />
                  ) : (
                    <div className={styles.avatarFallback}>
                      {getInitials()}
                    </div>
                  )}
                  <label className={styles.avatarUpload}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isUploadingImage}
                      className={styles.hiddenInput}
                    />
                    <Camera size={16} />
                  </label>
                </div>
                <div className={styles.avatarInfo}>
                  <p className={styles.avatarHint}>{t('profile.image.hint')}</p>
                  <p className={styles.avatarFormats}>{t('profile.image.formats')}</p>
                </div>
              </div>

              {/* Form Fields */}
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>{t('profile.personalInfo.firstName')}</label>
                  <input
                    type="text"
                    value={profile.firstName}
                    onChange={(e) => handleProfileChange('firstName', e.target.value)}
                    className={styles.input}
                    placeholder={t('profile.personalInfo.firstNamePlaceholder')}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>{t('profile.personalInfo.lastName')}</label>
                  <input
                    type="text"
                    value={profile.lastName}
                    onChange={(e) => handleProfileChange('lastName', e.target.value)}
                    className={styles.input}
                    placeholder={t('profile.personalInfo.lastNamePlaceholder')}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <Mail size={16} />
                    {t('profile.personalInfo.email')}
                  </label>
                  <div className={styles.inputWithBadge}>
                    <input
                      type="email"
                      value={profile.email}
                      disabled
                      className={`${styles.input} ${styles.disabled}`}
                    />
                    {profile.emailVerified && (
                      <span className={styles.verifiedBadge}>
                        <Check size={12} />
                        {t('profile.verified')}
                      </span>
                    )}
                  </div>
                  <p className={styles.inputHint}>{t('profile.personalInfo.emailHint')}</p>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <Phone size={16} />
                    {t('profile.personalInfo.phone')}
                  </label>
                  <div className={styles.inputWithBadge}>
                    <input
                      type="tel"
                      value={profile.phoneNumber}
                      onChange={(e) => handleProfileChange('phoneNumber', e.target.value)}
                      className={styles.input}
                      placeholder={t('profile.personalInfo.phonePlaceholder')}
                    />
                    {profile.phoneVerified && (
                      <span className={styles.verifiedBadge}>
                        <Check size={12} />
                        {t('profile.verified')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Save Message */}
              {saveMessage.text && (
                <div className={`${styles.message} ${styles[saveMessage.type]}`}>
                  {saveMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                  {saveMessage.text}
                </div>
              )}

              {/* Save Button */}
              <div className={styles.cardActions}>
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className={styles.saveButton}
                >
                  {isSaving ? t('common.saving') : t('common.saveChanges')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrapper}>
                <Lock size={24} />
              </div>
              <div className={styles.cardHeaderContent}>
                <h2 className={styles.cardTitle}>{t('profile.security.title')}</h2>
                <p className={styles.cardDescription}>{t('profile.security.description')}</p>
              </div>
            </div>

            <div className={styles.cardContent}>
              {/* Password Section */}
              {hasPassword && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>{t('profile.password.title')}</h3>
                  
                  <div className={styles.passwordForm}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>{t('profile.password.current')}</label>
                      <div className={styles.passwordInput}>
                        <input
                          type={showPasswords.current ? 'text' : 'password'}
                          value={passwordData.currentPassword}
                          onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                          className={styles.input}
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                          className={styles.passwordToggle}
                        >
                          {showPasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>{t('profile.password.new')}</label>
                      <div className={styles.passwordInput}>
                        <input
                          type={showPasswords.new ? 'text' : 'password'}
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                          className={styles.input}
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                          className={styles.passwordToggle}
                        >
                          {showPasswords.new ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>{t('profile.password.confirm')}</label>
                      <div className={styles.passwordInput}>
                        <input
                          type={showPasswords.confirm ? 'text' : 'password'}
                          value={passwordData.confirmPassword}
                          onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                          className={styles.input}
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                          className={styles.passwordToggle}
                        >
                          {showPasswords.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* Password Requirements */}
                    <div className={styles.passwordRequirements}>
                      <p className={styles.requirementsTitle}>{t('profile.password.requirements')}</p>
                      <ul className={styles.requirementsList}>
                        <li>{t('profile.password.minLength')}</li>
                      </ul>
                    </div>

                    {/* Password Message */}
                    {passwordMessage.text && (
                      <div className={`${styles.message} ${styles[passwordMessage.type]}`}>
                        {passwordMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                        {passwordMessage.text}
                      </div>
                    )}

                    <button
                      onClick={handlePasswordChange}
                      disabled={isChangingPassword}
                      className={styles.changePasswordButton}
                    >
                      {isChangingPassword ? t('common.saving') : t('profile.password.change')}
                    </button>
                  </div>
                </div>
              )}

              {/* Two-Factor Authentication Section */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>{t('profile.twoFactor.title')}</h3>
                <p className={styles.sectionDescription}>{t('profile.twoFactor.description')}</p>
                
                <div className={styles.twoFactorStatus}>
                  <div className={styles.twoFactorIcon}>
                    <Shield size={24} />
                  </div>
                  <div className={styles.twoFactorInfo}>
                    <span className={styles.twoFactorLabel}>{t('profile.twoFactor.status')}</span>
                    <span className={styles.twoFactorValue}>{t('profile.twoFactor.disabled')}</span>
                  </div>
                  <button className={styles.enableTwoFactorButton} disabled>
                    {t('profile.twoFactor.enable')}
                  </button>
                </div>
                <p className={styles.comingSoon}>{t('common.comingSoon')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Connections Tab */}
        {activeTab === 'connections' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrapper}>
                <LinkIcon size={24} />
              </div>
              <div className={styles.cardHeaderContent}>
                <h2 className={styles.cardTitle}>{t('profile.connectedAccounts.title')}</h2>
                <p className={styles.cardDescription}>{t('profile.connectedAccounts.description')}</p>
              </div>
            </div>

            <div className={styles.cardContent}>
              <div className={styles.providersList}>
                {/* Google */}
                <div className={`${styles.providerItem} ${isGoogleConnected ? styles.connected : ''}`}>
                  <div className={styles.providerInfo}>
                    <div className={styles.providerIcon}>
                      <GoogleIcon size={24} />
                    </div>
                    <div className={styles.providerDetails}>
                      <span className={styles.providerName}>{t('profile.connectedAccounts.google')}</span>
                      {isGoogleConnected && googleProvider?.providerAccountId && (
                        <span className={styles.providerEmail}>{googleProvider.providerAccountId}</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.providerActions}>
                    {isGoogleConnected ? (
                      <>
                        <span className={styles.connectedBadge}>
                          <Check size={14} />
                          {t('profile.connectedAccounts.connected')}
                        </span>
                        <button
                          onClick={handleDisconnectGoogle}
                          className={styles.disconnectButton}
                        >
                          <Unlink size={16} />
                          {t('profile.connectedAccounts.disconnect')}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleConnectGoogle}
                        className={styles.connectButton}
                      >
                        <LinkIcon size={16} />
                        {t('profile.connectedAccounts.connect')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Save Message for connections */}
              {saveMessage.text && (
                <div className={`${styles.message} ${styles[saveMessage.type]}`}>
                  {saveMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                  {saveMessage.text}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
