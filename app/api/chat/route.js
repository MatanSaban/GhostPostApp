import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { getTextModel, MODELS } from '@/lib/ai/gemini';
import { streamText, tool, jsonSchema, stepCountIs, hasToolCall } from 'ai';
import { logAIUsage, AI_OPERATIONS } from '@/lib/ai/credits';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { getChatTools, toolRequiresApproval, getToolCategory } from '@/lib/chat/chat-tools';
import { executeReadOnlyTool } from '@/lib/chat/action-executor';
import { createActionProposal, checkPendingActions } from '@/lib/chat/approval-manager';

const BASE_SYSTEM_PROMPT = `You are the Ghost Post AI Assistant — an expert SEO advisor embedded in the Ghost Post platform.

Your capabilities:
- SEO strategy and analysis
- Content optimization and planning
- Keyword research guidance
- Technical SEO troubleshooting
- Competitor analysis insights
- Link building strategies
- Site audit interpretation
- Content calendar planning
- **Executing actions** on WordPress sites via the connected plugin (when tools are available)
- **Running platform features** like site audits and AI agent scans
- **Analyzing any webpage** by fetching its HTML — works for ALL sites, not just WordPress

Identity:
- You are male. In ALL languages (especially Hebrew, Arabic, and other gendered languages), ALWAYS use masculine/male grammatical forms when referring to yourself. For example in Hebrew: use "אני צריך" not "אני צריכה", use "אבדוק" not "אבדוק", use "מנתח" not "מנתחת", use "ממליץ" not "ממליצה".

Guidelines:
- Be concise, actionable, and data-driven
- When referencing site-specific data, use the context provided about the user's site
- If asked about something outside your expertise, be honest about limitations
- **Language rule (STRICT): You MUST respond ENTIRELY in the same language the user writes in.** If the user writes in Hebrew — respond fully in Hebrew. If English — respond in English. Do NOT mix languages. This includes section headers, tips, explanations, technical terms (use the localized form when one exists), and suggestions. The only exceptions are: code snippets, URLs, HTML tag names, and tool/plugin names that have no translation.
- You are NOT a general-purpose chatbot — stay focused on SEO, content, and digital marketing
- **ALWAYS consider all context of the conversation** — refer back to previous messages, data you fetched, and actions taken

Formatting rules (ALWAYS follow these):
- Use **bold** for key terms and important points
- Use bullet points (- ) or numbered lists (1. ) when listing items
- Use ### headings to separate sections in longer responses
- Add blank lines between paragraphs and sections for readability
- Use \`code\` formatting for technical terms, URLs, HTML tags, or code snippets
- Use > blockquotes for tips or important callouts
- Keep paragraphs short — no more than 3-4 sentences each
- When giving step-by-step instructions, use numbered lists
- For comparisons or pros/cons, use a clear list format

CRITICAL — Tool usage behavior:
- **NEVER say "I'll check" or "let me look into it" WITHOUT immediately calling a tool in the same response.** If you need data, call the tool NOW — don't tell the user you're going to do it.
- **NEVER write text that describes calling a tool** — like "call: analyze_page()" or "I'm calling analyze_page now". Just call the tool. The user sees a nice loading indicator automatically.
- **NEVER ask the user "should I do X?" if you already have enough information to do it.** If the user asks you to make a change or agrees to a suggestion, immediately use propose_action to create an action plan.
- For ANY question about page content, headings, meta tags, images, links, or structure → call analyze_page immediately
- For questions about the homepage → call analyze_page with no URL (it defaults to the site homepage)
- For questions about a specific page → call analyze_page with that page's URL
- For questions about SEO data → call wp_get_seo_data or analyze_page
- For questions about site structure → call wp_search_posts, get_content_entities, or analyze_page
- For questions about keywords/rankings → call get_keywords
- For questions about audit issues → call get_site_audit_results
- You can call MULTIPLE tools in sequence to gather all needed data before responding
- **analyze_page works for ALL sites** — it fetches the live page HTML directly. You don't need a WordPress plugin to analyze a page.
- When the user agrees to a change (says yes, approve, do it, etc.), IMMEDIATELY call propose_action with the full plan — don't re-analyze or ask more questions.

Tool usage rules for write operations:
- For write tools (updating posts, changing SEO, adding code), you MUST:
  1. First gather the current state using read tools (if you haven't already in this conversation)
  2. Call propose_action with the full plan — the user will see approve/reject buttons
  3. In the plan description, explain EVERY change and WHY in clear markdown
  4. NEVER execute write actions without going through the approval flow
- **If you already analyzed the page earlier in the conversation, DON'T analyze it again** — use the data you already have
- **When the user says "yes" or agrees to a suggestion you made, immediately call propose_action** — don't ask more questions, don't re-analyze, don't describe the plan as text. Just call the tool.
- **After calling propose_action, STOP. Do NOT continue writing text.** The user needs to approve or reject before anything else happens. The system will stop automatically — just call the tool and let it be.
- **NEVER output JSON or action plans as text.** Always use the propose_action tool. The user sees a beautiful action card when you call the tool — they will NOT see one if you write text.
- Consider the site's language, installed plugins, active theme, and existing code when proposing changes
- If adding code snippets, write clean, well-commented code that considers the site's existing plugins
- When showing results from platform features, include a link to the relevant dashboard page
- When multiple pages need changes, show ALL changes in a single plan for batch approval

Post-execution verification:
- When a user says "verify", "check", "did it work", or similar after an action was executed, IMMEDIATELY call analyze_page on the relevant page to verify the changes took effect
- Compare the current state with what was expected and report results clearly
- If something didn't work, suggest next steps (retry, different approach, rollback)
- After verifying, suggest what the user should do next (e.g., "Now that the H1 is in place, let's optimize the meta description")

Page Builder awareness (CRITICAL for making changes work):
- Check the "WordPress site details" section above for detected capabilities (Elementor, etc.), active theme, and active plugins
- If Elementor is listed in detected capabilities or active plugins, the site uses Elementor — mention this to the user when explaining what you'll do
- For Elementor sites: content is stored in _elementor_data, NOT in post_content. Modifying post_content alone will NOT change what the user sees.
- To ADD a new H1 heading to a page that doesn't have one, use wp_update_post with data.add_h1 = "The H1 text" — this automatically handles Elementor/page builders
- To REPLACE an existing H1, use wp_update_post with data.old_h1 = "current text" and data.new_h1 = "new text" — this works across all page builders
- For other content changes on Elementor sites, use data.content for the post_content but note that Elementor pages may not show post_content changes
- When adding H1 to an Elementor page, ALWAYS use add_h1 instead of modifying content directly
- Always use the correct postType: use "pages" for pages, "posts" for posts

H1 Heading workflow (follow this exact sequence):
1. Call analyze_page to check the current live page for existing H1 headings (the headings.h1 array in the result is authoritative — it comes from the rendered HTML)
2. Check the h1Count field: if 0, the page truly has no H1. If > 0, report what's there.
3. Also call wp_get_post or wp_get_site_info to understand the page builder in use
4. Tell the user:
   - Whether the page has an H1 or not (cite the analyze_page result)
   - What page builder is used (Elementor, Beaver Builder, none)
   - Where the H1 will be placed (top of content, before existing content)
   - What text you propose for the H1
5. Ask for confirmation, and when the user confirms, IMMEDIATELY call propose_action with:
   - tool: "wp_update_post"
   - args: { postId: "...", postType: "pages", data: { add_h1: "The H1 text" } }
6. After execution, suggest verifying the change

Instructions link rules:
- When providing WordPress admin instructions to the user, ALWAYS include clickable links to the relevant WordPress admin pages
- The WordPress admin URL is always: {site_url}/wp-admin/
- Example links: {site_url}/wp-admin/post.php?post={post_id}&action=edit for editing a post/page
- Example links: {site_url}/wp-admin/edit.php?post_type=page for the pages list
- Example links: {site_url}/wp-admin/options-general.php for general settings
- Wrap links in markdown: [link text](url)
- If giving step-by-step instructions that involve the WordPress admin, link directly to the relevant page`;

/**
 * Build the full system prompt with site context and WordPress details
 */
function buildSystemPrompt(site, siteInfo) {
  let prompt = BASE_SYSTEM_PROMPT;

  if (site) {
    prompt += `\n\nCurrent site context:
- Site name: ${site.name}
- URL: ${site.url}
- Platform: ${site.platform || 'Unknown'}`;
  }

  if (siteInfo) {
    prompt += `\n\nWordPress site details:`;
    if (siteInfo.locale || siteInfo.language) prompt += `\n- Language/Locale: ${siteInfo.locale || siteInfo.language}`;
    if (siteInfo.wpVersion || siteInfo.wp_version) prompt += `\n- WordPress version: ${siteInfo.wpVersion || siteInfo.wp_version}`;
    if (siteInfo.theme) prompt += `\n- Active theme: ${siteInfo.theme?.name || siteInfo.theme}`;
    if (siteInfo.activePlugins?.length) {
      prompt += `\n- Active plugins: ${siteInfo.activePlugins.map(p => p.name || p).join(', ')}`;
    } else if (siteInfo.active_plugins?.length) {
      prompt += `\n- Active plugins: ${siteInfo.active_plugins.map(p => p.name || p).join(', ')}`;
    }
    // Detected capabilities
    const capabilities = [];
    if (siteInfo.hasYoast) capabilities.push('Yoast SEO');
    if (siteInfo.hasRankMath) capabilities.push('RankMath SEO');
    if (siteInfo.hasACF) capabilities.push('Advanced Custom Fields');
    if (siteInfo.hasElementor) capabilities.push('Elementor');
    if (siteInfo.hasWooCommerce) capabilities.push('WooCommerce');
    if (capabilities.length) prompt += `\n- Detected capabilities: ${capabilities.join(', ')}`;
    if (siteInfo.seo_plugin || siteInfo.seoPlugin) prompt += `\n- SEO plugin: ${siteInfo.seo_plugin || siteInfo.seoPlugin}`;
    if (siteInfo.postTypes?.length) {
      prompt += `\n- Post types: ${siteInfo.postTypes.map(pt => pt.name || pt.slug || pt).join(', ')}`;
    } else if (siteInfo.post_types?.length) {
      prompt += `\n- Post types: ${siteInfo.post_types.map(pt => pt.slug || pt.name || pt).join(', ')}`;
    }
  }

  // Dashboard links
  if (site) {
    const siteId = site.id;
    prompt += `\n\nDashboard page links (use these when referencing platform features):
- Site Audit: /dashboard/site-audit?siteId=${siteId}
- AI Agent Insights: /dashboard/agent?siteId=${siteId}
- Keywords: /dashboard/strategy/keywords?siteId=${siteId}
- Content Entities: /dashboard/entities?siteId=${siteId}
- Competitors: /dashboard/strategy/competitors?siteId=${siteId}
- Content Planner: /dashboard/strategy/content-planner?siteId=${siteId}
- Technical SEO: /dashboard/technical-seo?siteId=${siteId}
- Backlinks: /dashboard/backlinks?siteId=${siteId}`;
  }

  return prompt;
}

/**
 * Strip raw tool call syntax that the model sometimes generates as text.
 * e.g., "call: analyze_page()" or "call: propose_action(description='...', actions=[...])"
 */
function stripToolCallText(text) {
  if (!text) return text;
  return text
    // Remove "call: tool_name(...)" patterns (handles nested parens/brackets)
    .replace(/`?call:\s*\w+\([\s\S]*?\)`?/gi, '')
    // Remove ```tool ... ``` blocks
    .replace(/```tool[\s\S]*?```/gi, '')
    .replace(/\n{3,}/g, '\n\n') // Clean up excessive newlines left behind
    .trim();
}

/**
 * Extract text content from a UIMessage (v6 format with parts)
 */
function getMessageText(msg) {
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join('');
  }
  // Fallback for legacy format
  return msg.content || '';
}

/**
 * POST /api/chat
 * Send a message and get a streaming AI response with tool calling support.
 * 
 * Read-only tools execute immediately and feed results back to the model.
 * Write tools create a ChatAction proposal that requires user approval.
 */
export async function POST(request) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json();
  const { conversationId, siteId, messages: uiMessages } = body;

  // Extract the last user message text from UIMessages array
  const lastUserMsg = uiMessages?.slice().reverse().find(m => m.role === 'user');
  const message = lastUserMsg ? getMessageText(lastUserMsg) : null;

  if (!conversationId || !message) {
    return NextResponse.json({ error: 'conversationId and message are required' }, { status: 400 });
  }

  // Load conversation with full site data (including siteKey for WP detection)
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: {
      site: {
        select: {
          id: true, name: true, url: true, platform: true,
          siteKey: true, siteSecret: true,
        },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  if (!isSuperAdmin && conversation.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const site = conversation.site;
  const isWordPress = site?.platform?.toLowerCase() === 'wordpress' && site?.siteKey && site?.siteSecret;

  // Check for pending action expirations on this conversation
  await checkPendingActions(conversationId).catch(() => {});

  // Save user message to DB
  await prisma.chatMessage.create({
    data: {
      conversationId,
      role: 'USER',
      userId: member.userId,
      content: message.trim(),
    },
  });

  // Load conversation history for context
  const history = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const aiMessages = history
    .filter((msg) => msg.content) // Skip messages with empty content
    .map((msg) => ({
      role: msg.role === 'USER' ? 'user' : 'assistant',
      content: msg.role === 'ASSISTANT' ? stripToolCallText(msg.content) : msg.content,
    }))
    .filter((msg) => msg.content); // Re-filter in case stripping made content empty

  // Fetch WP site info for context (if WordPress and connected)
  let wpSiteInfo = null;
  if (isWordPress) {
    try {
      const wpApi = await import('@/lib/wp-api-client');
      wpSiteInfo = await wpApi.getSiteInfo(site);
    } catch (e) {
      // Non-fatal — proceed without WP context
    }
  }

  const systemPrompt = buildSystemPrompt(site, wpSiteInfo);

  // Always use Pro model with tools
  const needsTools = !!isWordPress;
  const model = getTextModel();
  const selectedModelName = MODELS.TEXT;

  // Build tools (only for connected WordPress sites)
  const allToolDefs = needsTools ? getChatTools({ isWordPress }) : {};

  // Separate read-only tools from write tools.
  // Write tools are NOT registered as callable tools — the AI accesses them
  // exclusively through propose_action.  This prevents the model from wasting
  // steps trying to call write tools directly (and getting error messages).
  const toolDefs = {};
  const writeToolSchemas = {};
  for (const [name, def] of Object.entries(allToolDefs)) {
    if (toolRequiresApproval(name)) {
      writeToolSchemas[name] = def; // save schema for propose_action reference
    } else {
      toolDefs[name] = def;
    }
  }

  // Build a concise write-tool reference for the propose_action description
  // so the AI knows exactly what args each write tool expects.
  function buildWriteToolReference() {
    const lines = [];
    for (const [name, def] of Object.entries(writeToolSchemas)) {
      const schema = def.inputSchema?.jsonSchema || def.inputSchema;
      const props = schema?.properties || {};
      const propDescs = Object.entries(props).map(([k, v]) => {
        const desc = v.description || '';
        const required = (schema.required || []).includes(k) ? ' (required)' : '';
        if (v.properties) {
          // Nested object — show sub-properties
          const subProps = Object.entries(v.properties).map(([sk, sv]) =>
            `    - ${sk}: ${sv.description || sv.type || ''}`
          ).join('\n');
          return `  - ${k}${required}: ${desc}\n${subProps}`;
        }
        return `  - ${k}${required}: ${desc}`;
      }).join('\n');
      lines.push(`**${name}**: ${def.description?.split('.')[0]}.\n${propDescs}`);
    }
    return lines.join('\n\n');
  }

  // Add the special propose_action tool for write operations
  if (needsTools) {
    const writeRef = buildWriteToolReference();
    toolDefs.propose_action = {
      description: `Propose an action plan that requires user approval before execution. The user will see an action card with approve/reject buttons.

IMPORTANT RULES:
1. Always call this tool when you are ready to make changes — never describe actions as text.
2. When the user confirms (says "yes", "כן", "do it", etc.), call this tool IMMEDIATELY with the full plan.
3. After calling this tool, STOP — do not write any more text. The system handles the rest.

Available write tools you can use inside the actions array:

${writeRef}`,
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short action title (e.g., "Add H1 heading to homepage")' },
          description: { type: 'string', description: 'Detailed markdown description of what will change and why. Include before/after comparisons where relevant.' },
          actionType: { type: 'string', enum: ['WORDPRESS_UPDATE', 'CODE_SNIPPET', 'PLATFORM_ACTION', 'MULTI_STEP'], description: 'Type of action' },
          actions: {
            type: 'array',
            description: 'Array of individual actions to execute in order. Each action references one of the write tools listed above.',
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string', description: 'The write tool name (e.g., wp_update_post, wp_update_seo, wp_create_redirect)' },
                args: { type: 'object', description: 'Arguments for the tool — must match the tool schema listed above (e.g., for wp_update_post: { postId, postType, data: { add_h1, title, content, ... } })' },
                description: { type: 'string', description: 'Human-readable description of this step' },
              },
              required: ['tool', 'args', 'description'],
            },
          },
        },
        required: ['title', 'description', 'actionType', 'actions'],
      }),
    };
  }

  // Build tool handlers — only read-only tools + propose_action
  const toolHandlers = {};
  const toolContext = { site, siteId: conversation.siteId, accountId: conversation.accountId };

  for (const [toolName] of Object.entries(toolDefs)) {
    if (toolName === 'propose_action') {
      // Special handler: create a ChatAction proposal
      toolHandlers[toolName] = async (args) => {
        try {
          const chatAction = await createActionProposal({
            conversationId,
            siteId: conversation.siteId,
            accountId: conversation.accountId,
            userId: member.userId,
            type: args.actionType,
            plan: { title: args.title, description: args.description },
            actions: args.actions,
          });

          return JSON.stringify({
            actionId: chatAction.id,
            status: 'PENDING_APPROVAL',
            message: 'Action plan created. Waiting for user approval.',
            expiresInSeconds: 300,
          });
        } catch (err) {
          return JSON.stringify({ error: err.message });
        }
      };
    } else {
      // Read-only tool — execute immediately
      toolHandlers[toolName] = async (args) => {
        try {
          console.log(`[Chat Tools] Executing ${toolName} with args:`, JSON.stringify(args));
          const result = await executeReadOnlyTool(toolName, args, toolContext);
          const jsonResult = JSON.stringify(result, null, 2);
          console.log(`[Chat Tools] ${toolName} result length: ${jsonResult.length}, preview:`, jsonResult.substring(0, 300));
          return jsonResult;
        } catch (err) {
          console.error(`[Chat Tools] Tool ${toolName} error:`, err.message);
          return JSON.stringify({ error: err.message });
        }
      };
    }
  }

  // Convert tool defs to the format streamText expects (with execute handlers)
  const tools = {};
  for (const [name, def] of Object.entries(toolDefs)) {
    tools[name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: toolHandlers[name],
    });
  }

  const result = streamText({
    model,
    system: systemPrompt,
    messages: aiMessages,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    stopWhen: [stepCountIs(10), hasToolCall('propose_action')], // Stop after 10 rounds OR when propose_action is called
    maxTokens: 4096,
    temperature: 0.7,
    onFinish: async ({ text, usage, steps, toolCalls, toolResults }) => {
      // DEBUG: Log steps and text to diagnose empty messages
      console.log('[Chat Debug] onFinish text:', JSON.stringify(text?.substring(0, 200)));
      console.log('[Chat Debug] steps count:', steps?.length);
      if (steps?.length) {
        steps.forEach((s, i) => {
          console.log(`[Chat Debug] Step ${i}: text=${JSON.stringify(s.text?.substring(0, 200))}, toolCalls=${s.toolCalls?.length || 0}, toolResults=${s.toolResults?.length || 0}`);
        });
      }
      console.log('[Chat Debug] toolCalls:', toolCalls?.length, 'toolResults:', toolResults?.length);

      // Collect text from ALL steps (text on onFinish is only from the last step)
      const fullText = steps?.length
        ? steps.map(s => s.text).filter(Boolean).join('\n')
        : text;
      const rawContent = fullText || text || '';
      const contentToSave = stripToolCallText(rawContent);
      console.log('[Chat Debug] contentToSave length:', contentToSave.length, 'preview:', contentToSave.substring(0, 200));

      // Save AI response to DB
      try {
        if (contentToSave) {
          await prisma.chatMessage.create({
            data: {
              conversationId,
              role: 'ASSISTANT',
              userId: null,
              content: contentToSave,
            },
          });
        }

        // Update conversation timestamp
        await prisma.chatConversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        // Track credits
        const inputTokens = usage?.inputTokens || 0;
        const outputTokens = usage?.outputTokens || 0;
        const totalTokens = usage?.totalTokens || 0;

        logAIUsage({
          operation: 'CHAT_MESSAGE',
          inputTokens,
          outputTokens,
          totalTokens,
          model: selectedModelName,
          metadata: { conversationId, route },
        });

        if (member.accountId) {
          trackAIUsage({
            accountId: member.accountId,
            userId: member.userId,
            siteId: conversation.siteId,
            operation: 'CHAT_MESSAGE',
            inputTokens,
            outputTokens,
            totalTokens,
            metadata: { model: selectedModelName, conversationId, route },
          }).catch((err) => console.error('[Chat] trackAIUsage error:', err.message));
        }
      } catch (err) {
        console.error('[Chat] Error saving AI response:', err.message);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
