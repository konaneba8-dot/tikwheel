import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCampaignSummary,
  createCampaignSharePlan,
  recordCampaignEvent,
} from '../src/domain/promotions.js';

test('createCampaignSharePlan schedules interval-based shares within the campaign window', () => {
  const now = new Date('2026-08-01T12:00:00Z');
  const campaign = {
    id: 'cmp_1',
    name: 'Friday live push',
    gameTypeId: 'gt_1',
    startAt: '2026-08-01T11:00:00Z',
    endAt: '2026-08-01T15:00:00Z',
    shareIntervalMinutes: 15,
    targetLiveStreams: 3,
    workflow: 'manual-review',
    channel: 'approved-email-queue',
  };

  const plans = createCampaignSharePlan(campaign, now, { intervalMinutes: 15 });
  assert.equal(plans.length, 3);
  assert.equal(plans[0].status, 'queued');
  assert.equal(plans[0].channel, 'approved-email-queue');
  assert.ok(plans.every((plan) => plan.campaignId === 'cmp_1'));
});

test('recordCampaignEvent updates click and join totals and recomputes conversion rate', () => {
  const analytics = { clicks: 10, joins: 2, conversions: 2, conversionRate: 0.2 };
  const next = recordCampaignEvent(analytics, 'join');
  assert.equal(next.clicks, 10);
  assert.equal(next.joins, 3);
  assert.equal(next.conversions, 3);
  assert.equal(next.conversionRate, 0.3);
});

test('buildCampaignSummary totals metrics across active campaigns and logs', () => {
  const state = {
    promotionCampaigns: [
      { id: 'cmp_1', status: 'active', analytics: { clicks: 10, joins: 2, conversions: 2 }, shares: [{ status: 'completed' }, { status: 'failed' }, { status: 'completed' }] },
      { id: 'cmp_2', status: 'inactive', analytics: { clicks: 3, joins: 0, conversions: 0 }, shares: [{ status: 'completed' }, { status: 'completed' }] },
    ],
    promotionLogs: [
      { status: 'failed', campaignId: 'cmp_1' },
      { status: 'completed', campaignId: 'cmp_1' },
      { status: 'completed', campaignId: 'cmp_2' },
    ],
  };

  const summary = buildCampaignSummary(state);
  assert.equal(summary.totalScheduledShares, 5);
  assert.equal(summary.completedShares, 3);
  assert.equal(summary.failedShares, 1);
  assert.equal(summary.activeCampaigns, 1);
  assert.equal(summary.totalClicks, 13);
  assert.equal(summary.totalJoins, 2);
  assert.equal(summary.totalConversions, 2);
});
