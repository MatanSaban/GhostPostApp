'use client';

import { useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { MediaModal } from '@/app/dashboard/components/MediaModal';
import styles from '../edit.module.css';

/**
 * Reusable image picker field that opens the media modal
 * Can be used for any image URL field (SEO, featured images, etc.)
 */
export function ImagePickerField({ 
  value, 
  onChange, 
  label,
  aspectRatio = '16 / 9',
  previewSize = 'medium', // 'small', 'medium', 'large'
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { t } = useLocale();

  const handleSelect = (media) => {
    onChange(media.url);
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    onChange('');
  };

  const sizeStyles = {
    small: { width: '100px', height: '100px' },
    medium: { width: '200px', aspectRatio },
    large: { width: '100%', maxWidth: '400px', aspectRatio },
  };

  const containerStyle = sizeStyles[previewSize] || sizeStyles.medium;

  return (
    <div className={styles.imagePickerField}>
      <div 
        className={styles.imagePickerContainer}
        onClick={() => setIsModalOpen(true)}
        style={containerStyle}
      >
        {value ? (
          <>
            <img src={value} alt="" className={styles.imagePickerPreview} />
            <div className={styles.imagePickerOverlay}>
              <button 
                type="button"
                className={styles.imagePickerRemoveBtn}
                onClick={handleRemove}
                title={t('media.modal.removeImage')}
              >
                <X />
              </button>
            </div>
          </>
        ) : (
          <div className={styles.imagePickerPlaceholder}>
            <ImageIcon />
            <span>{t('media.modal.selectImage')}</span>
          </div>
        )}
      </div>
      
      <MediaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={handleSelect}
        allowedTypes={['image']}
        title={label || t('media.modal.selectImage')}
      />
    </div>
  );
}

export default ImagePickerField;
