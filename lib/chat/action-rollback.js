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

    case 'run_site_audit':
    case 'run_agent_scan':
      // These are read-only triggers — nothing to rollback
      break;

    default:
      throw new Error(`Rollback not supported for tool: ${tool}`);
  }
}
