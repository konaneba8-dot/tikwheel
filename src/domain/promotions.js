import crypto from 'node:crypto';

export const PROMOTION_WORKFLOWS = Object.freeze({
  MANUAL_REVIEW: 'manual-review',
  APPROVED_INTERNAL: 'approved-internal',
  PARTNER_MANAGED: 'partner-managed',
});

export const PROMOTION_CHANNELS = Object.freeze({
  APPROVED_EMAIL_QUEUE: 'approved-email-queue',
  APPROVED_INTERNAL_BROADCAST: 'approved-internal-broadcast',
  MANUAL_APPROVAL_QUEUE: 'manual-approval-queue',
  PARTNER_MANAGED_REVIEW: 'partner-managed-review',
});

export function normalizeCampaignAnalytics(analytics = {}) {
  return {
    clicks: Number(analytics.clicks || 0),
    joins: Number(analytics.joins || 0),
    conversions: Number(analytics.conversions || analytics.joins || 0),
    conversionRate: Number(analytics.conversionRate || 0),
  };
}

export function recordCampaignEvent(analytics = {}, eventType = 'click') {
  const next = normalizeCampaignAnalytics(analytics);
  if (eventType === 'click') {
    next.clicks += 1;
  }
  if (eventType === 'join') {
    next.joins += 1;
    next.conversions += 1;
  }
  next.conversionRate = next.clicks > 0 ? Number((next.conversions / next.clicks).toFixed(4)) : 0;
  return next;
}

export function buildCampaignSummary(state = { promotionCampaigns: [], promotionLogs: [] }) {
  const campaigns = Array.isArray(state.promotionCampaigns) ? state.promotionCampaigns : [];
  const allShares = campaigns.flatMap((campaign) => Array.isArray(campaign.shares) ? campaign.shares : []);
  const completedShares = allShares.filter((share) => share.status === 'completed').length;
  const failedShares = allShares.filter((share) => share.status === 'failed').length;
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'active').length;
  const totalClicks = campaigns.reduce((sum, campaign) => sum + Number(normalizeCampaignAnalytics(campaign.analytics).clicks), 0);
  const totalJoins = campaigns.reduce((sum, campaign) => sum + Number(normalizeCampaignAnalytics(campaign.analytics).joins), 0);
  const totalConversions = campaigns.reduce((sum, campaign) => sum + Number(normalizeCampaignAnalytics(campaign.analytics).conversions), 0);

  return {
    totalCampaigns: campaigns.length,
    totalScheduledShares: allShares.length,
    completedShares,
    failedShares,
    activeCampaigns,
    totalClicks,
    totalJoins,
    totalConversions,
  };
}

export function createCampaignSharePlan(campaign, now = new Date(), options = {}) {
  const startAt = new Date(campaign.startAt);
  const endAt = new Date(campaign.endAt);
  const referenceTime = now instanceof Date ? now : new Date(now);
  const intervalMinutes = Number(options.intervalMinutes ?? campaign.shareIntervalMinutes ?? 5);
  const maxPlans = Number(options.maxPlans ?? campaign.targetLiveStreams ?? 1);

  if (!campaign || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || intervalMinutes <= 0) {
    return [];
  }

  const plans = [];
  const intervalMs = intervalMinutes * 60 * 1000;
  const upperBound = Math.max(1, Math.min(maxPlans, Math.max(1, Math.ceil((endAt.getTime() - startAt.getTime()) / intervalMs) + 1)));

  for (let index = 0; index < upperBound; index += 1) {
    const scheduledFor = new Date(startAt.getTime() + (index * intervalMs));
    if (scheduledFor > endAt) break;
    if (scheduledFor < referenceTime && index > 0 && plans.length >= maxPlans) {
      continue;
    }
    plans.push({
      id: `share_${crypto.randomUUID()}`,
      campaignId: campaign.id,
      scheduledFor: scheduledFor.toISOString(),
      status: 'queued',
      channel: campaign.channel || PROMOTION_CHANNELS.MANUAL_APPROVAL_QUEUE,
      workflow: campaign.workflow || PROMOTION_WORKFLOWS.MANUAL_REVIEW,
      message: `${campaign.name || 'Campaign'} scheduled for ${scheduledFor.toISOString()}`,
      errorLog: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return plans;
}

export function isSupportedPromotionChannel(channel, workflow = PROMOTION_WORKFLOWS.MANUAL_REVIEW) {
  const allowedChannels = new Set([
    PROMOTION_CHANNELS.APPROVED_EMAIL_QUEUE,
    PROMOTION_CHANNELS.APPROVED_INTERNAL_BROADCAST,
    PROMOTION_CHANNELS.MANUAL_APPROVAL_QUEUE,
    PROMOTION_CHANNELS.PARTNER_MANAGED_REVIEW,
  ]);

  if (workflow === PROMOTION_WORKFLOWS.MANUAL_REVIEW) {
    return channel === PROMOTION_CHANNELS.MANUAL_APPROVAL_QUEUE || allowedChannels.has(channel);
  }

  return allowedChannels.has(channel);
}
