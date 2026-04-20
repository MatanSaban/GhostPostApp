/**
 * Chat Action Rollback
 * 
 * Reverses executed chat actions using stored rollback snapshots.
 * Each write action stores the original value before modification,
 * allowing us to restore the previous state.
 */

import prisma from '@/lib/prisma';
import * as wpApi from '@/lib/wp-api-client';

/**
 * Rollback a completed ChatAction by restoring original values.
 * 
 * @param {string} chatActionId - The ChatAction ID to rollback
 * @returns {{ success: boolean, rolledBack: number, failed: number, details: Array }}
 */
export async function rollbackChatAction(chatActionId) {
  const chatAction = await prisma.chatAction.findUnique({
    where: { id: chatActionId },
    include: {
      conversation: { include: { site: true } },
    },
  });

  if (!chatAction) {
    throw new Error('ChatAction not found');
  }

  if (!['COMPLETED', 'FAILED'].includes(chatAction.status)) {
    throw new Error(`Cannot rollback action with status: ${chatAction.status}`);
  }

  if (!chatAction.rollbackData || chatAction.rollbackData.length === 0) {
    throw new Error('No rollback data available for this action');
  }

  const site = chatAction.conversation.site;
  const details = [];
  let rolledBack = 0;
  let failed = 0;

  // Rollback in reverse order (last action first)
  for (const rb of [...chatAction.rollbackData].reverse()) {
    try {
      await rollbackSingleAction(rb, site);
      details.push({ tool: rb.tool, success: true });
      rolledBack++;
    } catch (err) {
      details.push({ tool: rb.tool, success: false, error: err.message });
      failed++;
    }
  }

  // Update status
  await prisma.chatAction.update({
    where: { id: chatActionId },
    data: {
      status: 'ROLLED_BACK',
      rolledBackAt: new Date(),
    },
  });

  // Add rollback confirmation message
  const summary = details.map((d, i) =>
    `${i + 1}. **${d.tool}** — ${d.success ? '↩️ Restored' : `❌ Failed: ${d.error}`}`
  ).join('\n');

  await prisma.chatMessage.create({
    data: {
      conversationId: chatAction.conversationId,
      role: 'ASSISTANT',
      content: `### Rollback Complete\n\n${summary}\n\nRestored ${rolledBack} of ${rolledBack + failed} changes.`,
    },
  });

  return { success: failed === 0, rolledBack, failed, details };
}

/**
 * Rollback a single action using its stored rollback data
 */
async function rollbackSingleAction(rb, site) {
  const { tool, args, originalValue } = rb;

  if (!originalValue) {
    throw new Error('No original value stored — cannot rollback');
  }

  switch (tool) {
    case 'wp_create_post': {
      // Rollback = delete the newly-created post. Safe because the post was
      // created by this action and nothing else referenced it yet.
      const postType = originalValue.postType || args.postType || 'posts';
      if (originalValue.postId) {
        await wpApi.deletePost(site, postType, originalValue.postId);
      }
      break;
    }

    case 'wp_update_post': {
      const postType = args.postType || 'posts';
      // Restore original post data
      const restoreData = {};
      if (originalValue.title !== undefined) restoreData.title = originalValue.title;
      if (originalValue.content !== undefined) restoreData.content = originalValue.content;
      if (originalValue.slug !== undefined) restoreData.slug = originalValue.slug;
      if (originalValue.status !== undefined) restoreData.status = originalValue.status;
      if (originalValue.excerpt !== undefined) restoreData.excerpt = originalValue.excerpt;
      await wpApi.updatePost(site, postType, args.postId, restoreData);
      break;
    }

    case 'wp_update_seo': {
      await wpApi.updateSeoData(site, args.postId, originalValue);
      break;
    }

    case 'wp_update_acf': {
      await wpApi.updateAcfFields(site, args.postId, originalValue);
      break;
    }

    case 'wp_create_redirect': {
      // Delete the created redirect
      if (originalValue.redirectId) {
        await wpApi.deleteRedirect(site, originalValue.redirectId);
      }
      break;
    }

    case 'wp_delete_redirect': {
      // Re-create the deleted redirect
      if (originalValue) {
        await wpApi.createRedirect(site, {
          source_url: originalValue.source_url || originalValue.sourceUrl,
          target_url: originalValue.target_url || originalValue.targetUrl,
          type: originalValue.type || 301,
        });
      }
      break;
    }

    case 'wp_add_code_snippet': {
      // Deactivate or delete the created snippet
      if (originalValue.snippetId) {
        await wpApi.makePluginRequest(site, `/code-snippets/${originalValue.snippetId}`, 'DELETE');
      }
      break;
    }

    case 'wp_add_menu_item': {
      // Rollback = delete the newly-created item
      if (originalValue.itemId) {
        await wpApi.deleteMenuItem(site, originalValue.itemId);
      }
      break;
    }

    case 'wp_update_menu_item': {
      // Restore previous item state
      if (originalValue && args.itemId) {
        await wpApi.updateMenuItem(site, args.itemId, originalValue);
      }
      break;
    }

    case 'wp_delete_menu_item': {
      // Re-create the deleted item on its original menu
      if (originalValue && originalValue.menuId) {
        await wpApi.addMenuItem(site, originalValue.menuId, {
          title: originalValue.title,
          url: originalValue.url,
          type: originalValue.type,
          object: originalValue.object,
          objectId: originalValue.objectId,
          parentId: originalValue.parentId,
          position: originalValue.position,
          target: originalValue.target,
          classes: originalValue.classes,
        });
      }
      break;
    }

    case 'wp_delete_post': {
      if (!originalValue) break;
      if (originalValue.force) {
        // Post was permanently deleted — we can only recreate from snapshot,
        // but the original postId is gone. Create a new post with the same
        // title/content/slug so the user doesn't lose the content.
        const snap = originalValue.snapshot || {};
        const postType = originalValue.postType === 'pages' || originalValue.postType === 'page' ? 'pages' : 'posts';
        await wpApi.createPost(site, postType, {
          title: snap.title,
          content: snap.content,
          slug: snap.slug,
          status: snap.status || 'draft',
          excerpt: snap.excerpt,
        });
      } else {
        // Soft-delete: restore from trash by updating status back to what it was
        const postType = originalValue.postType;
        const snap = originalValue.snapshot || {};
        await wpApi.updatePost(site, postType, originalValue.postId, {
          status: snap.status || 'draft',
        });
      }
      break;
    }

    case 'wp_create_term': {
      if (originalValue && originalValue.termId) {
        await wpApi.deleteTerm(site, originalValue.taxonomy, originalValue.termId);
      }
      break;
    }

    case 'wp_update_term': {
      if (originalValue && args.taxonomy && args.termId) {
        await wpApi.updateTerm(site, args.taxonomy, args.termId, originalValue);
      }
      break;
    }

    case 'wp_delete_term': {
      if (originalValue && originalValue.taxonomy) {
        await wpApi.createTerm(site, originalValue.taxonomy, {
          name: originalValue.name,
          slug: originalValue.slug,
          description: originalValue.description,
          parent: originalValue.parent,
        });
      }
      break;
    }

    case 'wp_moderate_comment': {
      if (originalValue && args.commentId) {
        await wpApi.updateComment(site, args.commentId, originalValue);
      }
      break;
    }

    case 'wp_reply_comment': {
      if (originalValue && originalValue.commentId) {
        await wpApi.deleteComment(site, originalValue.commentId, true);
      }
      break;
    }

    case 'wp_delete_comment': {
      // Trashed comments auto-restore by flipping status back to approved/hold.
      if (originalValue && !originalValue.force && args.commentId && originalValue.snapshot) {
        const prior = originalValue.snapshot.approved;
        const status = (prior === '1' || prior === 1 || prior === 'approved') ? 'approve' : 'hold';
        await wpApi.updateComment(site, args.commentId, { status });
      }
      // Permanently deleted comments can't be recovered — content is gone.
      break;
    }

    case 'wp_update_options': {
      if (originalValue && typeof originalValue === 'object') {
        await wpApi.updateOptions(site, originalValue);
      }
      break;
    }

    case 'wp_self_update_plugin':
    case 'wp_rest_api':
    case 'wp_list_terms':
    case 'wp_list_comments':
    case 'wp_get_options':
      // Read-only or plugin-level operations — no rollback.
      break;

    case 'wp_bulk_update_posts': {
      // originalValue is an array of { postId, postType, original }
      if (Array.isArray(originalValue)) {
        for (const item of originalValue) {
          await wpApi.updatePost(site, item.postType, item.postId, item.original);
        }
      }
      break;
    }

    case 'wp_search_replace_links': {
      // Reverse the search-replace (swap old and new)
      if (originalValue.oldUrl && originalValue.newUrl) {
        await wpApi.searchReplaceLinks(site, originalValue.newUrl, originalValue.oldUrl);
      }
      break;
    }

    case 'wp_upload_media': {
      // Delete uploaded media
      if (originalValue.mediaId) {
        await wpApi.deleteMedia(site, originalValue.mediaId);
      }
      break;
    }

    case 'wp_update_media': {
      if (originalValue && args.mediaId) {
        await wpApi.updateMedia(site, args.mediaId, originalValue);
      }
      break;
    }

    case 'generate_image': {
      // Best-effort cleanup: delete the uploaded media and revert featured image.
      if (originalValue?.featuredAssignment && originalValue.featuredAssignment.postType) {
        const fa = originalValue.featuredAssignment;
        try {
          await wpApi.updatePost(site, fa.postType, fa.postId, { featured_image: fa.previousFeatured || 0 });
        } catch (err) { /* swallow */ }
      }
      if (originalValue?.mediaId) {
        try {
          await wpApi.deleteMedia(site, originalValue.mediaId);
        } catch (err) { /* media may already be gone */ }
      }
      break;
    }

    case 'wp_set_featured_image': {
      if (originalValue && args.postId) {
        await wpApi.updatePost(site, originalValue.postType || 'posts', args.postId, {
          featured_image: originalValue.previousFeatured || 0,
        });
      }
      break;
    }

    case 'wp_insert_image_in_content': {
      if (originalValue && args.postId) {
        await wpApi.updatePost(site, originalValue.postType || 'posts', args.postId, {
          content: originalValue.content,
        });
      }
      break;
    }

    case 'run_site_audit':
    case 'run_agent_scan':
      // These are read-only triggers — nothing to rollback
      break;

    default:
      throw new Error(`Rollback not supported for tool: ${tool}`);
  }
}
