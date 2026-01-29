'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/app/hooks/usePermissions';
import { AccessDenied } from '@/app/components/ui/AccessDenied';
import { Loader2 } from 'lucide-react';
import styles from './PermissionGuard.module.css';

/**
 * PermissionGuard - Wraps a page component and checks for required permissions
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - The page content to render if authorized
 * @param {string} props.module - The module to check permission for (e.g., 'CONTENT', 'KEYWORDS')
 * @param {string} [props.capability='VIEW'] - The capability to check (default: VIEW)
 * @param {boolean} [props.redirectOnDeny=false] - Whether to redirect to dashboard instead of showing AccessDenied
 * @param {string} [props.redirectPath='/dashboard'] - Path to redirect to if redirectOnDeny is true
 */
export function PermissionGuard({ 
  children, 
  module, 
  capability = 'VIEW',
  redirectOnDeny = false,
  redirectPath = '/dashboard',
}) {
  const router = useRouter();
  const { checkPermission, isLoading, isOwner } = usePermissions();
  const [hasAccess, setHasAccess] = useState(null);

  useEffect(() => {
    if (!isLoading) {
      // Owners always have access
      if (isOwner) {
        setHasAccess(true);
        return;
      }

      const permitted = checkPermission(module, capability);
      setHasAccess(permitted);

      if (!permitted && redirectOnDeny) {
        router.push(redirectPath);
      }
    }
  }, [isLoading, isOwner, checkPermission, module, capability, redirectOnDeny, redirectPath, router]);

  // Show loading state while checking permissions
  if (isLoading || hasAccess === null) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className={styles.spinner} />
      </div>
    );
  }

  // Show access denied if no permission
  if (!hasAccess) {
    if (redirectOnDeny) {
      return null; // Will redirect
    }
    return <AccessDenied />;
  }

  // Render the protected content
  return children;
}

export default PermissionGuard;
