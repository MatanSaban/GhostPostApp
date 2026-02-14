'use client';

import { useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  Strikethrough,
  List, 
  ListOrdered,
  Link as LinkIcon,
  Unlink,
  Image as ImageIcon,
  Code,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Minus,
  Highlighter,
  RemoveFormatting,
  Pilcrow,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { MediaModal } from '@/app/dashboard/components/MediaModal/MediaModal';
import styles from './ContentEditor.module.css';

// Custom Image Extension with better attributes
const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => element.getAttribute('width'),
        renderHTML: attributes => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        },
      },
      height: {
        default: null,
        parseHTML: element => element.getAttribute('height'),
        renderHTML: attributes => {
          if (!attributes.height) return {};
          return { height: attributes.height };
        },
      },
      'data-id': {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes['data-id']) return {};
          return { 'data-id': attributes['data-id'] };
        },
      },
      class: {
        default: null,
        parseHTML: element => element.getAttribute('class'),
        renderHTML: attributes => {
          if (!attributes.class) return {};
          return { class: attributes.class };
        },
      },
    };
  },
});

// Toolbar Button Component
function ToolbarButton({ icon: Icon, title, isActive, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${styles.toolbarButton} ${isActive ? styles.active : ''}`}
      title={title}
    >
      <Icon />
    </button>
  );
}

// Toolbar Separator
function ToolbarSeparator() {
  return <div className={styles.toolbarSeparator} />;
}

// Link Dialog Component
function LinkDialog({ isOpen, onClose, onSubmit, initialUrl = '' }) {
  const { t } = useLocale();
  const [url, setUrl] = useState(initialUrl);

  useEffect(() => {
    setUrl(initialUrl);
  }, [initialUrl, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(url);
    setUrl('');
    onClose();
  };

  return createPortal(
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.dialogTitle}>{t('editor.insertLink')}</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className={styles.dialogInput}
            autoFocus
          />
          <div className={styles.dialogActions}>
            <button type="button" onClick={onClose} className={styles.dialogCancel}>
              {t('common.cancel')}
            </button>
            <button type="submit" className={styles.dialogSubmit}>
              {t('common.insert')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export function ContentEditor({ content, onChange }) {
  const { t } = useLocale();
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceContent, setSourceContent] = useState('');
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        },
      }),
      CustomImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'editor-image',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: t('entities.edit.contentPlaceholder'),
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: styles.proseMirror,
      },
    },
  });

  // Update editor content when prop changes (e.g., when loading data)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content, editor]);

  // Handle source mode toggle
  const toggleSourceMode = useCallback(() => {
    if (isSourceMode) {
      // Switching from source to visual - apply changes
      editor?.commands.setContent(sourceContent);
      onChange(sourceContent);
    } else {
      // Switching from visual to source
      setSourceContent(editor?.getHTML() || '');
    }
    setIsSourceMode(!isSourceMode);
  }, [isSourceMode, editor, sourceContent, onChange]);

  // Handle link insertion
  const handleInsertLink = useCallback((url) => {
    if (url) {
      editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }, [editor]);

  // Handle media selection
  const handleMediaSelect = useCallback((media) => {
    if (!editor || !media || media.length === 0) return;
    
    media.forEach((item) => {
      if (item.mime_type?.startsWith('image/')) {
        editor.chain().focus().setImage({
          src: item.url,
          alt: item.alt || item.title || '',
          title: item.title || '',
          'data-id': item.id,
          width: item.width || null,
          height: item.height || null,
        }).run();
      }
    });
    
    setIsMediaModalOpen(false);
  }, [editor]);

  if (!editor) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t('entities.edit.content')}</h3>
        </div>
        <div className={styles.loading}>
          {t('common.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t('entities.edit.content')}</h3>
        <button
          onClick={toggleSourceMode}
          className={`${styles.modeButton} ${isSourceMode ? styles.active : ''}`}
          type="button"
        >
          <Code />
          {isSourceMode ? t('entities.edit.visual') : t('entities.edit.html')}
        </button>
      </div>

      {!isSourceMode ? (
        <div className={styles.editorWrapper}>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            {/* Undo/Redo */}
            <ToolbarButton
              icon={Undo}
              title={t('editor.undo')}
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
            />
            <ToolbarButton
              icon={Redo}
              title={t('editor.redo')}
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
            />

            <ToolbarSeparator />

            {/* Text Format */}
            <ToolbarButton
              icon={Bold}
              title={t('editor.bold')}
              isActive={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
            />
            <ToolbarButton
              icon={Italic}
              title={t('editor.italic')}
              isActive={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            />
            <ToolbarButton
              icon={UnderlineIcon}
              title={t('editor.underline')}
              isActive={editor.isActive('underline')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            />
            <ToolbarButton
              icon={Strikethrough}
              title={t('editor.strikethrough')}
              isActive={editor.isActive('strike')}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            />
            <ToolbarButton
              icon={Highlighter}
              title={t('editor.highlight')}
              isActive={editor.isActive('highlight')}
              onClick={() => editor.chain().focus().toggleHighlight().run()}
            />

            <ToolbarSeparator />

            {/* Headings */}
            <ToolbarButton
              icon={Pilcrow}
              title={t('editor.paragraph')}
              isActive={editor.isActive('paragraph')}
              onClick={() => editor.chain().focus().setParagraph().run()}
            />
            <ToolbarButton
              icon={Heading1}
              title={t('editor.heading1')}
              isActive={editor.isActive('heading', { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            />
            <ToolbarButton
              icon={Heading2}
              title={t('editor.heading2')}
              isActive={editor.isActive('heading', { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            />
            <ToolbarButton
              icon={Heading3}
              title={t('editor.heading3')}
              isActive={editor.isActive('heading', { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            />
            <ToolbarButton
              icon={Heading4}
              title={t('editor.heading4')}
              isActive={editor.isActive('heading', { level: 4 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            />

            <ToolbarSeparator />

            {/* Lists */}
            <ToolbarButton
              icon={List}
              title={t('editor.bulletList')}
              isActive={editor.isActive('bulletList')}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            />
            <ToolbarButton
              icon={ListOrdered}
              title={t('editor.orderedList')}
              isActive={editor.isActive('orderedList')}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            />

            <ToolbarSeparator />

            {/* Alignment */}
            <ToolbarButton
              icon={AlignLeft}
              title={t('editor.alignLeft')}
              isActive={editor.isActive({ textAlign: 'left' })}
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
            />
            <ToolbarButton
              icon={AlignCenter}
              title={t('editor.alignCenter')}
              isActive={editor.isActive({ textAlign: 'center' })}
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
            />
            <ToolbarButton
              icon={AlignRight}
              title={t('editor.alignRight')}
              isActive={editor.isActive({ textAlign: 'right' })}
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
            />
            <ToolbarButton
              icon={AlignJustify}
              title={t('editor.alignJustify')}
              isActive={editor.isActive({ textAlign: 'justify' })}
              onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            />

            <ToolbarSeparator />

            {/* Links & Media */}
            <ToolbarButton
              icon={LinkIcon}
              title={t('editor.link')}
              isActive={editor.isActive('link')}
              onClick={() => setIsLinkDialogOpen(true)}
            />
            {editor.isActive('link') && (
              <ToolbarButton
                icon={Unlink}
                title={t('editor.unlink')}
                onClick={() => editor.chain().focus().unsetLink().run()}
              />
            )}
            <ToolbarButton
              icon={ImageIcon}
              title={t('editor.image')}
              onClick={() => setIsMediaModalOpen(true)}
            />

            <ToolbarSeparator />

            {/* Block Elements */}
            <ToolbarButton
              icon={Quote}
              title={t('editor.blockquote')}
              isActive={editor.isActive('blockquote')}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            />
            <ToolbarButton
              icon={Code}
              title={t('editor.codeBlock')}
              isActive={editor.isActive('codeBlock')}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            />
            <ToolbarButton
              icon={Minus}
              title={t('editor.horizontalRule')}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            />

            <ToolbarSeparator />

            {/* Clear Formatting */}
            <ToolbarButton
              icon={RemoveFormatting}
              title={t('editor.clearFormatting')}
              onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            />
          </div>

          {/* Editor Content */}
          <EditorContent editor={editor} className={styles.editorContent} />
        </div>
      ) : (
        <div className={styles.sourceWrapper}>
          <textarea
            value={sourceContent}
            onChange={(e) => setSourceContent(e.target.value)}
            className={styles.sourceEditor}
            placeholder="<p>Enter HTML content...</p>"
          />
        </div>
      )}

      {/* Link Dialog */}
      <LinkDialog
        isOpen={isLinkDialogOpen}
        onClose={() => setIsLinkDialogOpen(false)}
        onSubmit={handleInsertLink}
        initialUrl={editor.getAttributes('link').href || ''}
      />

      {/* Media Modal */}
      <MediaModal
        isOpen={isMediaModalOpen}
        onClose={() => setIsMediaModalOpen(false)}
        onSelect={handleMediaSelect}
        multiple={true}
        allowedTypes={['image']}
        title={t('editor.selectImage')}
      />
    </div>
  );
}
