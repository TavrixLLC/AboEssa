// Called only by the loopback/synthetic integration adapter; no paid provider permitted.
const assert=require('node:assert/strict'),sharp=require('sharp'),{randomUUID}=require('node:crypto');
module.exports=async c=>{
 const config=c.app.get(require('@nestjs/config').ConfigService),provider=c.app.get(require('../dist/src/image-enhancement/enhancement.provider').ImageEditingProvider);
 const h=await require('./phase7-2-checks.cjs').helpers(c),{ok,draft,ep}=h;
 const bytes=await sharp({create:{width:64,height:64,channels:3,background:'#888888'}}).jpeg().toBuffer(),s=await draft(bytes);
 config.set('NODE_ENV','production');
 for(const key of ['PRODUCT_STUDIO_DISPATCH_ENABLED','PRODUCT_STUDIO_ENABLED','PRODUCT_STUDIO_LIVE_APPROVED','PRODUCT_STUDIO_MOCK_APPROVED','REAL_PRODUCT_STUDIO_REVIEW_ENABLED','PRODUCT_STUDIO_PREPAID_EXPERIMENT'])config.set(key,'false');
 config.set('PRODUCT_STUDIO_PROVIDER','fal');
 const before=provider.calls,catalog=await ok(c.request('GET',ep(s)+'/studio/templates'),200);
 assert.equal(catalog.totalTemplates,20);assert.equal(catalog.templates.length,20);assert.equal(catalog.groups.length,4);assert.equal(catalog.cost.provider,'fal');assert.equal(catalog.cost.generationEnabled,false);assert.ok(catalog.templates.every(t=>t.generationAllowedModes.length===0));
 await ok(c.request('GET',ep(s)+'/studio/templates/'+catalog.templates[0].id),200);
 const request={clientImageId:s.selectedImageKey,requestKey:randomUUID(),mode:'PRODUCT_STUDIO_HERO',studioSelection:{templateId:catalog.templates[5].id,templateVersion:1,processingMode:'GENERATIVE_3D_HERO',sourceKind:'BOX'},generativeProductApproved:true,referenceKind:'ORIGINAL_REFERENCE',originalReferenceReviewed:true,sourceWarningsReviewed:true};
 const denied=await c.request('POST',ep(s),request);assert.ok(denied.status>=400&&denied.status<500);
 await ok(c.request('GET','/admin/product-intake/studio-review'),404);
 assert.equal(provider.calls,before);
 c.checks.push('Stage A production-valued service config: all20/four groups/details browse without fal key or reviewed pricing; generation disabled/all modes unactionable');
 c.checks.push('Stage A generation request denied, QA gallery404, zero provider invocations; synthetic loopback runtime only, not actual production boot or HTTPS staging');
};
