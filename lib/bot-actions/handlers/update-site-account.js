/**
 * Update Site Account Handler
 * 
 * Updates fields on an existing site account.
 */

export async function updateSiteAccount(params, context) {
  const { siteId, fields } = params;
  
  // Use provided siteId or get from interview
  const targetSiteId = siteId || context.interview?.siteId;
  
  if (!targetSiteId) {
    return {
      success: false,
      error: 'No site account ID provided or found in interview'
    };
  }
  
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return {
      success: false,
      error: 'No fields provided to update'
    };
  }
  
  try {
    // Verify site exists
    const site = await context.prisma.site.findUnique({
      where: { id: targetSiteId }
    });
    
    if (!site) {
      return {
        success: false,
        error: 'Site not found'
      };
    }
    
    // Map interview fields to actual Site model columns
    const fieldMapping = {
      name: 'name',
      platform: 'platform',
      contentLanguage: 'contentLanguage',
      language: 'contentLanguage',
      writingStyle: 'writingStyle',
      seoStrategy: 'seoStrategy',
      internalLinksCount: 'internalLinksPer1000',
      internalLinksPer1000Words: 'internalLinksPer1000',
    };

    // Business info fields
    const businessFieldMapping = {
      phone: 'businessPhone',
      email: 'businessEmail',
      address: 'businessAddress',
      businessName: 'businessName',
      about: 'businessAbout',
      category: 'businessCategory',
    };

    const updateData = {};
    
    for (const [key, value] of Object.entries(fields)) {
      if (fieldMapping[key]) {
        if (key === 'internalLinksCount' || key === 'internalLinksPer1000Words') {
          updateData[fieldMapping[key]] = value != null ? parseInt(value) : null;
        } else if (key === 'writingStyle') {
          updateData[fieldMapping[key]] = typeof value === 'string' ? value : (value?.selected || JSON.stringify(value));
        } else {
          updateData[fieldMapping[key]] = value;
        }
      } else if (businessFieldMapping[key]) {
        updateData[businessFieldMapping[key]] = value;
      } else if (key === 'targetLocations' && Array.isArray(value)) {
        updateData.targetLocations = value;
      } else if (key === 'businessInfo' && typeof value === 'object') {
        // Spread businessInfo sub-fields
        if (value.businessName) updateData.businessName = value.businessName;
        if (value.phone) updateData.businessPhone = value.phone;
        if (value.email) updateData.businessEmail = value.email;
        if (value.about) updateData.businessAbout = value.about;
        if (value.category) updateData.businessCategory = value.category;
        if (value.address) updateData.businessAddress = value.address;
      }
    }
    
    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        error: 'No valid fields to update'
      };
    }
    
    // Update site
    await context.prisma.site.update({
      where: { id: targetSiteId },
      data: updateData
    });
    
    return {
      success: true,
      siteId: targetSiteId,
      updatedFields: Object.keys(updateData)
    };
    
  } catch (error) {
    console.error('Update site account error:', error);
    return {
      success: false,
      error: error.message || 'Failed to update site account'
    };
  }
}
