import { CAMPAIGN_TRANSITIONS, approvedStatus, canMoveCampaign } from './campaign-state';
import type { CampaignStatus } from '../database/entities';

const ALL: CampaignStatus[] = ['draft', 'pending', 'scheduled', 'active', 'ended', 'rejected'];

describe('campaign state machine', () => {
  it('allows exactly the documented moves', () => {
    const allowed: [CampaignStatus, CampaignStatus][] = [
      ['draft', 'pending'],
      ['pending', 'scheduled'],
      ['pending', 'active'],
      ['pending', 'rejected'],
      ['scheduled', 'active'],
      ['active', 'ended'],
      ['rejected', 'pending'],
    ];
    for (const [from, to] of allowed) expect(canMoveCampaign(from, to)).toBe(true);
    // Every other move between different states is refused.
    for (const from of ALL) {
      for (const to of ALL) {
        if (from === to || allowed.some(([f, t]) => f === from && t === to)) continue;
        // ...except stopping a campaign, which anything not yet ended may do.
        if (to === 'ended' && from !== 'ended') continue;
        expect(canMoveCampaign(from, to)).toBe(false);
      }
    }
  });

  it('never leaves ended, and never moves an approved campaign back to pending or draft', () => {
    expect(CAMPAIGN_TRANSITIONS.ended).toEqual([]);
    for (const from of ['scheduled', 'active'] as const) {
      expect(canMoveCampaign(from, 'pending')).toBe(false);
      expect(canMoveCampaign(from, 'draft')).toBe(false);
      expect(canMoveCampaign(from, 'rejected')).toBe(false);
    }
  });

  it('a state may "move" to itself (nothing to do)', () => {
    for (const s of ALL) expect(canMoveCampaign(s, s)).toBe(true);
  });

  it('approval picks scheduled while the start is ahead', () => {
    const now = Date.parse('2026-10-25T12:00:00Z');
    expect(approvedStatus(null, now)).toBe('active');
    expect(approvedStatus(now - 1, now)).toBe('active');
    expect(approvedStatus(now, now)).toBe('active');
    expect(approvedStatus(now + 1, now)).toBe('scheduled');
  });
});
